import React, { useState, useRef, useEffect, useCallback } from 'react';
// Fix: Import types from @google/genai
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAI_Blob, LiveSession, FunctionDeclaration, Type } from '@google/genai';
import { AppStatus, TranscriptMessage, DevLogMessage } from '../types';
import { decode, encode, decodeAudioData } from '../utils/audioUtils';
import {
  MicIcon,
  MuteIcon,
  ExclamationTriangleIcon,
  BugIcon,
  TrashIcon,
  SpeakerXMarkIcon,
  UnmuteIcon,
  CloseIcon,
  SettingsIcon,
  SaveIcon,
} from './Icons';

// Constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

// Type for detailed error state
interface AudioError {
    code: string;
    message: string;
}

export const Conversation: React.FC = () => {
  const [appStatus, setAppStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isOutputMuted, setIsOutputMuted] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [devLogs, setDevLogs] = useState<DevLogMessage[]>([]);
  const [audioError, setAudioError] = useState<AudioError | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Main settings state
  const [systemInstruction, setSystemInstruction] = useState('You are Maya, a friendly and helpful AI assistant.');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  
  // Temporary state for settings panel
  const [tempSystemInstruction, setTempSystemInstruction] = useState(systemInstruction);
  const [tempKnowledgeBase, setTempKnowledgeBase] = useState(knowledgeBase);


  // Refs for API and audio management
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, data?: any) => {
    console.log(message, data);
    setDevLogs(prev => [...prev.slice(-100), { timestamp: Date.now(), message, data }]);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const stopConversation = useCallback(async () => {
    addLog('Attempting to stop conversation...');
    setAppStatus(AppStatus.IDLE);

    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
        addLog('Live session closed.');
      } catch (error) {
        addLog('Error closing session', error);
      }
      sessionPromiseRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      addLog('Media stream stopped.');
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
      addLog('Script processor disconnected.');
    }

    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      await inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
      addLog('Input audio context closed.');
    }

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      audioSourcesRef.current.forEach(source => source.stop());
      audioSourcesRef.current.clear();
      
      if (outputGainNodeRef.current) {
        outputGainNodeRef.current.disconnect();
        outputGainNodeRef.current = null;
      }
      
      await outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
      addLog('Output audio context closed.');
    }
  }, [addLog]);

  const handleApiMessage = async (message: LiveServerMessage) => {
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      currentOutputTranscriptionRef.current += text;
    } else if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      currentInputTranscriptionRef.current += text;
    }

    if (message.serverContent?.turnComplete) {
      if (currentInputTranscriptionRef.current.trim()) {
        const userMessage: TranscriptMessage = {
          id: Date.now(),
          speaker: 'user',
          text: currentInputTranscriptionRef.current.trim(),
        };
        setTranscript(prev => [...prev, userMessage]);
      }
      if (currentOutputTranscriptionRef.current.trim()) {
        const modelMessage: TranscriptMessage = {
          id: Date.now() + 1,
          speaker: 'model',
          text: currentOutputTranscriptionRef.current.trim(),
        };
        setTranscript(prev => [...prev, modelMessage]);
      }
      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';
    }

    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (audioData) {
      setAppStatus(AppStatus.SPEAKING);
      const outputAudioContext = outputAudioContextRef.current;
      if (outputAudioContext && outputGainNodeRef.current) {
        try {
            nextStartTimeRef.current = Math.max(
              nextStartTimeRef.current,
              outputAudioContext.currentTime,
            );
            const audioBuffer = await decodeAudioData(
              decode(audioData),
              outputAudioContext,
              OUTPUT_SAMPLE_RATE,
              1,
            );
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputGainNodeRef.current);

            source.addEventListener('ended', () => {
              audioSourcesRef.current.delete(source);
              if (audioSourcesRef.current.size === 0) {
                setAppStatus(AppStatus.LISTENING);
              }
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            audioSourcesRef.current.add(source);
        } catch (error) {
            const errorMessage = "Failed to play audio. The browser's audio system might be busy. Please try restarting the conversation.";
            addLog('Audio Playback Error', error);
            setAudioError({ code: 'PLAYBACK-01', message: errorMessage });
            setAppStatus(AppStatus.ERROR);
        }
      }
    }

    const interrupted = message.serverContent?.interrupted;
    if (interrupted) {
      addLog('Model speech interrupted');
      audioSourcesRef.current.forEach(source => source.stop());
      audioSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      setAppStatus(AppStatus.LISTENING);
    }
  };

  const handleApiError = (e: ErrorEvent | Error) => {
    const errorMessage = "Connection to the AI service failed. Please check your network connection and restart the conversation.";
    addLog('API Error', e);
    setAudioError({ code: 'API-01', message: errorMessage });
    setAppStatus(AppStatus.ERROR);
  };

  const handleApiClose = (e: CloseEvent) => {
    addLog('API Connection Closed', e);
  };

  const startConversation = async () => {
    if (appStatus !== AppStatus.IDLE && appStatus !== AppStatus.ERROR) {
      addLog('Conversation already in progress.');
      return;
    }

    addLog('Starting conversation...');
    setAudioError(null);
    setAppStatus(AppStatus.CONNECTING);
    setTranscript([]);
    setDevLogs([]);

    try {
      if (!aiRef.current) {
        addLog('Initializing GoogleGenAI...');
        if (!process.env.API_KEY) {
          throw new Error("API_KEY environment variable not set.");
        }
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
      }

      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputGainNodeRef.current = outputAudioContextRef.current.createGain();
      outputGainNodeRef.current.connect(outputAudioContextRef.current.destination);
      outputGainNodeRef.current.gain.value = isOutputMuted ? 0 : 1;

      nextStartTimeRef.current = 0;
      audioSourcesRef.current.clear();

      addLog('Requesting microphone permissions...');
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      addLog('Microphone access granted.');
      setAppStatus(AppStatus.LISTENING);
      
      const finalSystemInstruction = [
        systemInstruction.trim(),
        knowledgeBase.trim() && `--- \n Use the following knowledge base to answer questions: \n\n<knowledge>\n${knowledgeBase.trim()}\n</knowledge>`
      ].filter(Boolean).join('\n\n');
      addLog('Using final system instruction:', finalSystemInstruction);


      sessionPromiseRef.current = aiRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            addLog('API connection opened.');
            
            const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
            scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              if (isMuted) return;
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: GenAI_Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
              };

              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => addLog("Error sending audio data", err));
            };
            
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: handleApiMessage,
          onerror: handleApiError,
          onclose: handleApiClose,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: finalSystemInstruction,
        },
      });

      sessionPromiseRef.current.catch(handleApiError);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('Failed to start conversation', errorMessage);
       setAudioError({ code: 'START-01', message: `Setup failed: ${errorMessage}` });
      setAppStatus(AppStatus.ERROR);
      await stopConversation();
    }
  };

  const toggleMute = () => setIsMuted(prev => !prev);
  
  const toggleOutputMute = () => {
    setIsOutputMuted(prev => {
        const newMutedState = !prev;
        if (outputGainNodeRef.current) {
            outputGainNodeRef.current.gain.setValueAtTime(newMutedState ? 0 : 1, outputAudioContextRef.current?.currentTime || 0);
        }
        addLog(`Output ${newMutedState ? 'muted' : 'unmuted'}`);
        return newMutedState;
    });
  }
  
  const handleSaveSettings = () => {
    setSystemInstruction(tempSystemInstruction);
    setKnowledgeBase(tempKnowledgeBase);
    setIsSettingsOpen(false);
    addLog('Settings saved.');
  };

  const openSettingsPanel = () => {
    setTempSystemInstruction(systemInstruction);
    setTempKnowledgeBase(knowledgeBase);
    setIsSettingsOpen(true);
  };

  const getStatusIndicator = () => {
    switch (appStatus) {
      case AppStatus.IDLE: return <div className="text-gray-400">Idle</div>;
      case AppStatus.CONNECTING: return <div className="text-yellow-400">Connecting...</div>;
      case AppStatus.LISTENING: return <div className="text-green-400">Listening...</div>;
      case AppStatus.PROCESSING: return <div className="text-blue-400">Thinking...</div>;
      case AppStatus.SPEAKING: return <div className="text-sky-400">Speaking...</div>;
      case AppStatus.ERROR: return <div className="text-red-500 flex items-center"><ExclamationTriangleIcon className="w-4 h-4 mr-1"/> Error</div>;
      default: return null;
    }
  };

  const mainButtonAction = () => {
    if (appStatus === AppStatus.IDLE || appStatus === AppStatus.ERROR) {
      startConversation();
    } else {
      stopConversation();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 relative overflow-hidden">
       {audioError && (
            <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-black p-3 text-sm z-30 shadow-lg flex items-center justify-between">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="w-6 h-6 mr-3 text-yellow-900" />
                <div>
                  <p className="font-bold">An error occurred ({audioError.code})</p>
                  <p>{audioError.message}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setAudioError(null);
                  if (appStatus === AppStatus.ERROR) {
                     stopConversation();
                  }
                }}
                className="p-1 rounded-full hover:bg-yellow-600/50"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          )}
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {transcript.length === 0 && appStatus === AppStatus.IDLE && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MicIcon className="w-16 h-16 mb-4"/>
                <p className="text-lg">Click 'Start' to begin conversation</p>
            </div>
        )}
        {transcript.map((msg) => (
          <div key={msg.id} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg px-4 py-2 max-w-lg shadow-md ${msg.speaker === 'user' ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
              <p className="text-sm">{msg.text}</p>
            </div>
          </div>
        ))}
         <div ref={transcriptEndRef} />
      </main>

      <div className="p-4 bg-gray-800 border-t border-gray-700 z-20">
        <div className="flex items-center justify-between mb-2 h-6">
            <div className="text-sm font-medium">{getStatusIndicator()}</div>
            <div className="flex items-center space-x-2">
                <button onClick={openSettingsPanel} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"><SettingsIcon className="w-5 h-5"/></button>
                <button onClick={() => setDevMode(prev => !prev)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"><BugIcon className="w-5 h-5"/></button>
                <button onClick={() => { setTranscript([]); addLog('Transcript cleared.')}} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"><TrashIcon className="w-5 h-5"/></button>
            </div>
        </div>

        <div className="flex items-center justify-center space-x-4">
          <button onClick={toggleMute} className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {isMuted ? <MuteIcon className="w-6 h-6 text-white"/> : <MicIcon className="w-6 h-6 text-white"/>}
          </button>

          <button
            onClick={mainButtonAction}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out shadow-lg transform hover:scale-105
              ${appStatus === AppStatus.IDLE || appStatus === AppStatus.ERROR ? 'bg-green-600 hover:bg-green-700' : ''}
              ${appStatus === AppStatus.CONNECTING ? 'bg-yellow-600 animate-pulse' : ''}
              ${appStatus === AppStatus.LISTENING || appStatus === AppStatus.PROCESSING || appStatus === AppStatus.SPEAKING ? 'bg-red-600 hover:bg-red-700' : ''}
            `}
          >
            <span className="text-lg font-semibold">
                {appStatus === AppStatus.IDLE || appStatus === AppStatus.ERROR ? 'Start' : 'Stop'}
            </span>
          </button>
          
          <button onClick={toggleOutputMute} className={`p-3 rounded-full transition-colors ${isOutputMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {isOutputMuted ? <SpeakerXMarkIcon className="w-6 h-6 text-white"/> : <UnmuteIcon className="w-6 h-6 text-white"/>}
          </button>
        </div>
      </div>
      
      {/* Settings Panel */}
      <div className={`absolute top-0 right-0 bottom-0 w-full max-w-sm bg-gray-900/80 backdrop-blur-sm p-4 border-l border-gray-700 z-20 transform transition-transform ease-in-out duration-300 ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-200">Settings</h3>
          <button onClick={() => setIsSettingsOpen(false)} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="space-y-6 overflow-y-auto h-[calc(100%-8rem)] pr-2">
          <div>
            <label htmlFor="system-instruction" className="block text-sm font-medium text-gray-400 mb-2">
              System Instruction
            </label>
            <textarea
              id="system-instruction"
              rows={5}
              className="w-full bg-gray-700 text-gray-200 rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              value={tempSystemInstruction}
              onChange={(e) => setTempSystemInstruction(e.target.value)}
              disabled={appStatus !== AppStatus.IDLE && appStatus !== AppStatus.ERROR}
            />
            <p className="text-xs text-gray-500 mt-2">
                Define the AI's personality and purpose. Changes will apply on the next conversation.
            </p>
          </div>
           <div>
            <label htmlFor="knowledge-base" className="block text-sm font-medium text-gray-400 mb-2">
              Knowledge Base
            </label>
            <textarea
              id="knowledge-base"
              rows={10}
              className="w-full bg-gray-700 text-gray-200 rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              placeholder="Paste any text, data, or context here..."
              value={tempKnowledgeBase}
              onChange={(e) => setTempKnowledgeBase(e.target.value)}
              disabled={appStatus !== AppStatus.IDLE && appStatus !== AppStatus.ERROR}
            />
            <p className="text-xs text-gray-500 mt-2">
                Provide context for the AI. It will use this information to answer your questions.
            </p>
          </div>
          <div className="text-xs text-gray-600">
            <p className="font-semibold">API Key Note:</p>
            <p>Your Gemini API key is managed securely via environment variables and is not required here.</p>
          </div>
        </div>
         <div className="absolute bottom-4 right-4 left-4">
             <button
                onClick={handleSaveSettings}
                disabled={appStatus !== AppStatus.IDLE && appStatus !== AppStatus.ERROR}
                className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-70 transition-colors"
             >
                <SaveIcon className="w-5 h-5 mr-2"/>
                Save Settings
            </button>
        </div>
      </div>

      {devMode && (
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gray-900/90 backdrop-blur-sm p-4 border-t border-gray-700 overflow-y-auto text-xs font-mono z-10">
            <h3 className="text-lg font-bold mb-2 text-gray-300">Developer Logs</h3>
            <div className="space-y-1">
            {devLogs.map((log) => (
                <div key={log.timestamp} className="flex items-start">
                    <span className="text-gray-500 mr-2 flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="text-gray-300 break-words">{log.message}</span>
                    {log.data && <pre className="text-gray-400 text-xs whitespace-pre-wrap ml-2 p-1 bg-black/30 rounded">{JSON.stringify(log.data, null, 2)}</pre>}
                </div>
            ))}
            </div>
        </div>
      )}
    </div>
  );
};