// Types for SilverLink Ambient Agent demo

export type AppMode = 'rehearsal' | 'live';

export interface AppSettings {
  mode: AppMode;
  geminiApiKey: string;
  ttsApiKey: string;
  ttsVoice: string;
}

export interface MedicineCard {
  medicineName: string;
  timingLabel: string; // e.g. "朝食後"
  notes: string;
  uncertainty: string; // what we can't determine
  handoffAdvice: string; // who to ask
  source: 'gemini-live' | 'fallback';
}

export type TtsSource = 'google-cloud' | 'browser-fallback' | 'error' | 'not-run';

export interface CloudProof {
  geminiSource: MedicineCard['source'];
  ttsSource: TtsSource;
  ttsVoice: string;
  checkedAt: string;
}

export interface FamilyMemo {
  timestamp: string;
  summary: string;
  actionNeeded: string;
  urgencyLevel: 'calm' | 'check-when-available';
  medicineCard?: MedicineCard;
}

export interface SemanticToken {
  type: 'medication_missed' | 'routine_disruption' | 'no_signal';
  label: string;
  description: string;
  timestamp: string;
}

export type DemoState =
  | 'idle'
  | 'processing'
  | 'card-ready'
  | 'speaking'
  | 'handoff-sent';

export type AudioState = 'idle' | 'speaking' | 'error';
