// Global settings store — initialized from root state, not component mount timing
// Persisted to localStorage

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode } from '../types';

interface SettingsState {
  mode: AppMode;
  geminiApiKey: string;
  ttsApiKey: string;
  ttsVoice: string;
  setMode: (mode: AppMode) => void;
  setGeminiApiKey: (key: string) => void;
  setTtsApiKey: (key: string) => void;
  setTtsVoice: (voice: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'rehearsal' as AppMode,
      geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
      ttsApiKey: import.meta.env.VITE_TTS_API_KEY || '',
      ttsVoice: import.meta.env.VITE_TTS_VOICE || 'ja-JP-Neural2-B',
      setMode: (mode) => set({ mode }),
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      setTtsApiKey: (key) => set({ ttsApiKey: key }),
      setTtsVoice: (voice) => set({ ttsVoice: voice }),
    }),
    {
      name: 'silverlink-settings',
      // Only persist mode and voice — do NOT persist API keys to localStorage
      partialize: (state) => ({
        mode: state.mode,
        ttsVoice: state.ttsVoice,
      }),
    }
  )
);
