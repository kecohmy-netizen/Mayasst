
import React from 'react';
import { Conversation } from './components/Conversation';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl mx-auto flex flex-col h-[90vh] bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-200">Maya AI Voice</h1>
          <div className="flex items-center space-x-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
            <span className="text-sm text-gray-400">Live</span>
          </div>
        </header>
        <Conversation />
      </div>
       <footer className="text-center p-4 text-xs text-gray-500">
        <p>Powered by Gemini 2.5 Native Audio. This is a technical demonstration and may not be perfect.</p>
      </footer>
    </div>
  );
};

export default App;
