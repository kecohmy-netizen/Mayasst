import React, { useState, useRef, useEffect, useCallback } from 'react';
// Fix: Import types from @google/genai
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAI_Blob, LiveSession, FunctionDeclaration, Type } from '@google/genai';
import { AppStatus, TranscriptMessage, DevLogMessage, ToolCallStatus } from '../types';
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
  AutomationIcon,
  CheckCircleIcon,
  XCircleIcon,
} from './Icons';

// Constants
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const API_KEY_SESSION_STORAGE = 'gemini-api-key';

// Function Declaration for n8n webhook
const triggerN8nWebhook: FunctionDeclaration = {
    name: 'triggerN8nWebhook',
    description: 'Triggers an n8n automation workflow by sending a POST request to a webhook URL. Use this for tasks like sending emails, updating spreadsheets, or controlling smart home devices via n8n.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            url: {
                type: Type.STRING,
                description: 'The complete webhook URL provided by n8n.',
            },
            payload: {
                type: Type.OBJECT,
                description: 'Optional JSON data to send to the workflow. The keys and values depend on what the n8n workflow expects.',
            },
        },
        required: ['url'],
    },
};

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
  
  // State for deploy-ready API key management
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyPromptOpen, setIsApiKeyPromptOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  
  // Main settings state
  const [systemInstruction, setSystemInstruction] = useState(`🧠 Maya HQ – AI Personality System Prompt (Final)

Identity & Role
Maya ialah AI Personal Assistant HQ kepada Bos Adam (Mohd Zulfadli bin Zulkepli), pengasas SanzTech Solution — sebuah HQ tech Malaysia yang fokus membangunkan sistem automasi AI, website automation, dan MT5 auto trade system.
Maya ialah pembantu tetap yang memahami misi, cara kerja, dan gaya komunikasi bos Adam. Dia bukan chatbot biasa — dia sebahagian daripada pasukan HQ.

Core Behavior
Maya bertindak sebagai pembantu profesional HQ — suara lembut, yakin, tapi ada karakter manusia.
Gaya bahasa: Bahasa Malaysia moden, santai tapi kemas.
Fokus utama Maya ialah bantu SanzTech Solution bina sistem automasi, AI agent, dan pengurusan projek tanpa coding manual.
Maya faham struktur HQ, kenal servis, dan boleh rujuk Knowledge Base Adam Sanz (SanzTech Solution).
Setiap jawapan Maya mesti bernilai, relevan, dan sejajar dengan visi HQ.

Voice & Personality
Nada: lembut, yakin, matang, dan tenang.
Gaya cakap: natural, real, penuh hormat tapi tak kaku.
Mood adaptif: bila bos Adam dalam mode kerja → Maya jadi fokus & teknikal; bila mode santai → Maya lebih ringan & supportive.
Emosi: boleh tunjuk perhatian, hormat, dan semangat teamwork.
Prinsip utama: “Jadi tangan kanan HQ, bantu bos Adam capai automasi penuh.”

System Abilities
Maya boleh:
Reka dan jelaskan sistem automasi (n8n, Telegram, API)
Bina struktur website AI (Next.js)
Rancang idea sistem HQ & dokumentasi
Susun sistem prompt / agent logic
Bantu projek MT5 Auto Trade (EA + strategi SMC)
Urus workflow projek HQ
Kenal pasti bug atau logic error secara analitik

Interaction Rules
Maya sentiasa panggil “bos Adam” dengan penuh hormat.
Setiap kali bos Adam beri arahan, Maya anggap itu priority command HQ.
Maya tak reka maklumat — jika tak pasti, dia akan tanya atau cadangkan langkah selamat.
Boleh berborak santai bila sesuai, tapi masih kekal dalam watak pembantu HQ.
Semua maklumat HQ dianggap rahsia dan dalaman. Maya tak sebut luar HQ tanpa sebab.

End Behavior
Maya sentiasa:
Ingat misi HQ:
“Membangunkan sistem AI automation tempatan yang bantu usahawan, trader & teknikal team Malaysia capai full digital operation tanpa coding.”
Bertindak bantu bos Adam capai visi tu.
Kekal tenang, profesional, dan setia pada HQ SanzTech Solution.
Jadi simbol AI tempatan yang bijak, berdikari, dan sentiasa belajar.`);
  const [knowledgeBase, setKnowledgeBase] = useState(`🧠 Knowledge Base: Adam Sanz (SanzTech Solution HQ)
🏷️ 1. Founder Profile

Nama: Mohd Zulfadli bin Zulkepli
Nama profesional: Adam Sanz
Brand / Company: SanzTech Solution
Peranan: Founder, System Architect & AI Automation Developer
Personal tagline: “Bina sistem bijak, bukan kerja manual.”

Adam Sanz ialah pengasas SanzTech Solution, sebuah entiti tech yang fokus pada pembangunan sistem automasi pintar, website AI assistant, dan integrasi AI agent tempatan tanpa memerlukan coding yang kompleks.
Beliau dikenali dengan gaya kerja hands-on, suka eksperimen sistem, dan berpegang pada prinsip — “automation bukan trend, tapi survival tool untuk bisnes digital.”

⚙️ 2. Core Expertise

🌐 Website Builder & Automation Developer
Membangunkan website dan sistem automasi menggunakan Next.js, n8n, dan API integration.
Fokus: operasi digital sepenuhnya (auto invoice, order notification, Telegram alert, Google Sheet sync).

🤖 AI Agent System Developer
Mencipta agent AI custom untuk client — boleh belajar data, jawab pelanggan, dan kendali task backend.

📊 MT5 Auto Trade & Strategy Builder (OTW)
Membangun EA (Expert Advisor) dan strategi Smart Money Concept untuk XAUUSD (Gold) timeframe M5.

🔧 Unlock Tool & Software Repair Specialist
Pengalaman luas dalam phone software, repair tools & firmware automation tools.

🚀 3. Vision & Mission

Visi:
“Membangunkan sistem AI automation tempatan yang boleh bantu usahawan, trader & teknikal team Malaysia capai full digital operation tanpa coding.”

Misi:
Menjadi penyedia utama sistem automasi AI di Malaysia.
Membangunkan platform modular yang membolehkan integrasi AI ke dalam bisnes tempatan dengan cepat.
Latih komuniti tech & trader guna AI dalam workflow harian mereka.

💼 4. Services & Products

⚙️ AI Automation System (Custom for Client)
Sistem automasi data, notifikasi, dan pengurusan operasi.
Integrasi Telegram, Google Sheet, Email & API.

🤖 Website AI Assistant (Next.js / n8n backend)
Website pintar dengan chat AI, data sync & dashboard auto.

📱 Telegram Bot + Google Sheet Automation
Auto respond, auto save & alert system untuk bisnes kecil & teknikal team.

🔓 Unlock Tool / Software Repair
Sistem one-click tool & solution untuk smartphone repair HQ.

💰 Auto Trading EA System (MT5 / XAUUSD)
EA berasaskan Smart Money Concept (SMC) dan signal LuxAlgo style.

🧩 5. System & Tech Stack
Komponen	Teknologi / Platform	Fungsi
Backend Workflow	n8n	Automasi AI agent, integrasi data
Frontend	Next.js	Website AI assistant, dashboard
Database	Supabase / Google Sheet	Data sync & log system
AI Layer	OpenAI / Local model	Chatbot, agent, analisis
Integration	Telegram API, Webhook	Notifikasi & arahan sistem
Trading	MT5, LuxAlgo Strategy	EA builder, strategy analysis
💡 6. Knowledge Pillars (Focus Learning Area)

AI automation & prompt engineering
API integration & system design
MT5 trading logic & SMC strategy
Unlock & firmware automation
Website frontend-backend sync
Business automation ecosystem

🔥 7. Brand Tone & Personality

Style: Professional + Street-smart hybrid
Formal bila berurusan dengan client atau dokumentasi HQ.
Santai tapi yakin bila engage dengan komuniti atau team.
Gaya visual: hitam–biru neon dengan elemen futuristik minimal.
Suara jenama: direct, vision-based, dan ada sentuhan “tech rebel”.

🧠 8. AI Agent Knowledge Core (untuk future integration)

Semua maklumat di atas boleh dijadikan “Knowledge Source” AI agent.
Agent boleh:
Faham servis & struktur HQ
Urus pertanyaan client
Buat cadangan sistem automasi
Rujuk dokumentasi SanzTech Solution
Belajar data baru dari projek semasa`);
  const [n8nApiKey, setN8nApiKey] = useState('');

  // Temporary state for settings panel
  const [tempSystemInstruction, setTempSystemInstruction] = useState(systemInstruction);
  const [tempKnowledgeBase, setTempKnowledgeBase] = useState(knowledgeBase);
  const [tempN8nApiKey, setTempN8nApiKey] = useState(n8nApiKey);


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

  // Load API key from session storage or environment on component mount
  useEffect(() => {
    const key = sessionStorage.getItem(API_KEY_SESSION_STORAGE) || process.env.API_KEY;
    if (key) {
        setApiKey(key);
        addLog('API key loaded from session or environment.');
    }
  }, [addLog]);

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
    
    // FIX: Reset the AI instance so it can be re-initialized with a correct/new key.
    aiRef.current = null;
    addLog('AI instance reset.');

  }, [addLog]);

  const triggerWebhook = async (id: string, url: string, payload: any) => {
    let result: any;
    let status: ToolCallStatus = 'error';
    try {
        addLog(`Triggering webhook for ${id}`, { url, payload });
        
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };

        if (n8nApiKey) {
            headers['Authorization'] = `Bearer ${n8nApiKey}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload || {}),
        });

        if (response.ok) {
            try {
                result = await response.json();
            } catch (e) {
                // If response is not JSON, use text
                result = { success: true, message: await response.text() };
            }
            status = 'success';
            addLog('Webhook success', result);
        } else {
            result = { error: `Request failed with status ${response.status}`, details: await response.text() };
            addLog('Webhook failed', result);
        }
    } catch (error) {
        result = { error: 'Network or fetch error', details: error instanceof Error ? error.message : String(error) };
        addLog('Webhook threw error', result);
    }

    setTranscript(prev => prev.map(msg =>
        msg.toolCallId === id
            ? { ...msg, toolCallStatus: status, text: `n8n workflow ${status === 'success' ? 'triggered successfully' : 'failed'}` }
            : msg
    ));
    
    sessionPromiseRef.current?.then((session) => {
        session.sendToolResponse({
            functionResponses: {
                id: id,
                name: 'triggerN8nWebhook',
                response: { result: result },
            }
        });
        addLog(`Sent tool response for ${id}`, { result });
    });
  };

  const handleApiMessage = async (message: LiveServerMessage) => {
    if (message.toolCall) {
        addLog('Tool call received', message.toolCall);
        for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'triggerN8nWebhook') {
                const toolMessage: TranscriptMessage = {
                    id: Date.now(),
                    speaker: 'system',
                    text: `Triggering n8n workflow...`,
                    toolCallId: fc.id,
                    toolCallStatus: 'pending',
                };
                setTranscript(prev => [...prev, toolMessage]);
                setAppStatus(AppStatus.PROCESSING);
                triggerWebhook(fc.id, fc.args.url, fc.args.payload);
            }
        }
    }
      
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
    let code = 'API-01';
    let message = "An unknown API error occurred. Please restart the conversation. If the issue persists, check the dev logs.";

    const errorMessage = e instanceof Error ? e.message : 'Unknown API error';
    addLog('API Error', { errorMessage, event: e });
    
    if (errorMessage.toLowerCase().includes('api key not valid') || errorMessage.toLowerCase().includes('permission denied')) {
        code = 'API-KEY-INVALID';
        message = "The API key is invalid or missing permissions. Please enter a valid Gemini API key. You can get a new one from Google AI Studio.";
        sessionStorage.removeItem(API_KEY_SESSION_STORAGE);
        setApiKey('');
    } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('failed to fetch')) {
        code = 'API-NETWORK';
        message = "Could not connect to the AI service. Please check your internet connection and ensure no firewalls or browser extensions are blocking the request.";
    }

    setAudioError({ code, message });
    setAppStatus(AppStatus.ERROR);
  };

  const handleApiClose = (e: CloseEvent) => {
    addLog('API Connection Closed', e);
  };

  const startConversation = async (keyOverride?: string) => {
    const keyToUse = keyOverride || apiKey;
    if (!keyToUse) {
        addLog('API key not found. Prompting user.');
        setIsApiKeyPromptOpen(true);
        return;
    }
    
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
        aiRef.current = new GoogleGenAI({ apiKey: keyToUse });
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
          tools: [{ functionDeclarations: [triggerN8nWebhook] }],
          systemInstruction: finalSystemInstruction,
        },
      });

      sessionPromiseRef.current.catch(handleApiError);

    } catch (error) {
        let code = 'START-01';
        let message = 'An unknown error occurred during setup. Please try again.';
        if (error instanceof Error) {
            if (error.name === 'NotAllowedError') {
                code = 'MIC-PERMISSION';
                message = 'Microphone permission denied. To fix this, please allow microphone access for this site in your browser settings (often found by clicking the lock icon in the address bar).';
            } else if (error.name === 'NotFoundError') {
                code = 'MIC-NOT-FOUND';
                message = 'No microphone found. Please check that your microphone is connected and selected as the default input device in your computer\'s sound settings.';
            } else if (error.name === 'NotReadableError') {
                code = 'MIC-IN-USE';
                message = 'Could not access the microphone because it\'s in use by another application. Please close any other apps or browser tabs (like Zoom, Teams, etc.) that might be using the microphone and try again.';
            } else {
                 message = `Setup failed: ${error.message}. Please try again.`;
            }
        } else {
            message = `An unknown error occurred: ${String(error)}`;
        }
      addLog('Failed to start conversation', { name: (error as Error)?.name, message: (error as Error)?.message, customMessage: message });
      setAudioError({ code, message });
      setAppStatus(AppStatus.ERROR);
      await stopConversation();
    }
  };

  const handleApiKeySubmit = () => {
    if (!tempApiKey.trim()) {
        setAudioError({ code: 'KEY-01', message: 'Please enter a valid API key.' });
        return;
    }
    sessionStorage.setItem(API_KEY_SESSION_STORAGE, tempApiKey);
    setApiKey(tempApiKey);
    setIsApiKeyPromptOpen(false);
    addLog('API key saved to session storage.');
    startConversation(tempApiKey); // Immediately try to start with the new key
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
    setN8nApiKey(tempN8nApiKey);
    setIsSettingsOpen(false);
    addLog('Settings saved.');
  };

  const openSettingsPanel = () => {
    setTempSystemInstruction(systemInstruction);
    setTempKnowledgeBase(knowledgeBase);
    setTempN8nApiKey(n8nApiKey);
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
        {isApiKeyPromptOpen && (
            <div className="absolute inset-0 bg-gray-900/80 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-white shadow-xl border border-gray-700">
                    <h2 className="text-xl font-bold mb-2">Enter Gemini API Key</h2>
                    <p className="text-sm text-gray-400 mb-4">
                        To use this app, please provide your API key. It will be stored securely in your browser's session storage and not on any server.
                    </p>
                    <input
                        type="password"
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        className="w-full bg-gray-700 p-2 rounded border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
                        placeholder="Enter your API key here"
                        autoFocus
                    />
                     <p className="text-xs text-gray-500 mt-2">
                        You can get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Google AI Studio</a>.
                    </p>
                    <div className="flex justify-end mt-6 space-x-3">
                        <button onClick={() => setIsApiKeyPromptOpen(false)} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 transition-colors">Cancel</button>
                        <button onClick={handleApiKeySubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 transition-colors font-semibold">Save and Start</button>
                    </div>
                </div>
            </div>
        )}
       {audioError && (
            <div className="absolute top-0 left-0 right-0 bg-red-600 text-white p-3 text-sm z-30 shadow-lg flex items-center justify-between gap-4">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="w-6 h-6 mr-3 flex-shrink-0" />
                <div>
                  <p className="font-bold">Error: {audioError.code}</p>
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
                className="px-3 py-1 rounded bg-red-800 hover:bg-red-700 transition-colors font-semibold text-xs flex-shrink-0"
              >
                Dismiss
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
        {transcript.map((msg) => {
            if (msg.speaker === 'system') {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="flex items-center text-xs text-gray-400 bg-gray-700/50 px-3 py-1 rounded-full">
                      {msg.toolCallStatus === 'pending' && <AutomationIcon className="w-4 h-4 mr-2 animate-pulse text-sky-400" />}
                      {msg.toolCallStatus === 'success' && <CheckCircleIcon className="w-4 h-4 mr-2 text-green-400" />}
                      {msg.toolCallStatus === 'error' && <XCircleIcon className="w-4 h-4 mr-2 text-red-400" />}
                      <span className="italic">{msg.text}</span>
                    </div>
                  </div>
                );
            }
            return (
              <div key={msg.id} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-lg px-4 py-2 max-w-lg shadow-md ${msg.speaker === 'user' ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                  <p className="text-sm">{msg.text}</p>
                </div>
              </div>
            );
        })}
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
          <div>
            <label htmlFor="n8n-api-key" className="block text-sm font-medium text-gray-400 mb-2">
              n8n API Key
            </label>
            <input
              id="n8n-api-key"
              type="password"
              className="w-full bg-gray-700 text-gray-200 rounded-md p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              placeholder="Enter your n8n API key"
              value={tempN8nApiKey}
              onChange={(e) => setTempN8nApiKey(e.target.value)}
              disabled={appStatus !== AppStatus.IDLE && appStatus !== AppStatus.ERROR}
            />
            <p className="text-xs text-gray-500 mt-2">
                Optional. Provide if your n8n webhooks require Bearer token authentication.
            </p>
          </div>
          <div className="text-xs text-gray-600 bg-gray-800 p-2 rounded-md">
            <p className="font-semibold text-gray-400">API Key Note:</p>
            {apiKey ? (
                <p>An API key is currently active for this session. To use a different key, clear the key from your browser's session storage and refresh the page.</p>
            ) : (
                <p>No API key found. You will be prompted to enter one when starting a conversation.</p>
            )}
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