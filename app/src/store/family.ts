// Family memo store — shared state between elder and family views

import { create } from 'zustand';
import type { FamilyMemo, MedicineCard, SemanticToken } from '../types';

interface FamilyStore {
  memo: FamilyMemo | null;
  tokens: SemanticToken[];
  setMemo: (memo: FamilyMemo) => void;
  addToken: (token: SemanticToken) => void;
  clearTokens: () => void;
}

export const useFamilyStore = create<FamilyStore>()((set) => ({
  memo: null,
  tokens: [],
  setMemo: (memo) => set({ memo }),
  addToken: (token) =>
    set((state) => ({ tokens: [token, ...state.tokens].slice(0, 10) })),
  clearTokens: () => set({ tokens: [] }),
}));

// Helper to create a family memo from a medicine card
export function createFamilyMemo(card: MedicineCard): FamilyMemo {
  return {
    timestamp: new Date().toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    summary: `お薬の確認：${card.medicineName}（${card.timingLabel}）`,
    actionNeeded: card.handoffAdvice,
    urgencyLevel: 'check-when-available',
    medicineCard: card,
  };
}

// Semantic token templates
export const SEMANTIC_TOKENS: Record<string, Omit<SemanticToken, 'timestamp'>> = {
  medication_missed: {
    type: 'medication_missed',
    label: '服薬未確認',
    description:
      'エッジ層からのセマンティックシグナル：本日の服薬確認が検出されていません。センサーストリームではなく、行動パターンに基づく推定信号です。',
  },
  routine_disruption: {
    type: 'routine_disruption',
    label: '日課の乱れ',
    description:
      'エッジ層からのセマンティックシグナル：通常の朝の活動パターンと異なる動きが検出されました。',
  },
};
