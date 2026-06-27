// Global settings store — initialized from root state, not component mount timing.
// Persisted to localStorage with non-secret demo preferences only.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode } from '../types';

export type DoctorType = 'community' | 'private';

interface SettingsState {
  mode: AppMode;
  ttsVoice: string;
  doctorType: DoctorType;
  setMode: (mode: AppMode) => void;
  setTtsVoice: (voice: string) => void;
  setDoctorType: (t: DoctorType) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: 'rehearsal' as AppMode,
      ttsVoice: import.meta.env.VITE_TTS_VOICE || 'ja-JP-Chirp3-HD-Sulafat',
      doctorType: 'community' as DoctorType,
      setMode: (mode) => set({ mode }),
      setTtsVoice: (voice) => set({ ttsVoice: voice }),
      setDoctorType: (doctorType) => set({ doctorType }),
    }),
    {
      name: 'silverlink-settings-v2',
      // Persist non-secret preferences only.
      partialize: (state) => ({
        mode: state.mode,
        ttsVoice: state.ttsVoice,
        doctorType: state.doctorType,
      }),
    }
  )
);
