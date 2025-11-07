export enum AppStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR',
}

export type ToolCallStatus = 'pending' | 'success' | 'error';

export interface TranscriptMessage {
  id: number; // Use timestamp as a unique ID
  speaker: 'user' | 'model' | 'system';
  text: string;
  toolCallId?: string;
  toolCallStatus?: ToolCallStatus;
}

export interface DevLogMessage {
    timestamp: number;
    message: string;
    data?: any;
}

export type AutomationStatus = 'idle' | 'triggered' | 'error';

export interface FeedbackItem {
  original: string;
  correction: string;
}

export interface Preset {
  name: string;
  settings: {
    temperature: number;
    topK: number;
    systemInstruction: string;
    knowledgeBase: string;
  };
}
