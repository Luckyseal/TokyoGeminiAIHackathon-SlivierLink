// Local demo care memory: yesterday's observation becomes today's actions.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CareConcern, CareMemoryAction, CareMemoryActionId, CareMemoryEntry } from '../types';

interface WellbeingMemoryInput {
  moodLabel: string;
  cues: string[];
  concern: CareConcern;
  careMessageJa?: string;
}

interface CareMemoryStore {
  entries: CareMemoryEntry[];
  actions: CareMemoryAction[];
  markAction: (id: CareMemoryActionId) => void;
  rememberWellbeingSignal: (input: WellbeingMemoryInput) => void;
  resetDemoMemory: () => void;
}

const nowJa = () =>
  new Date().toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const createDemoEntries = (): CareMemoryEntry[] => [
  {
    id: 'yesterday-low-mood',
    dateLabel: '昨日',
    timestamp: '昨日 18:40',
    source: 'demo',
    summary: '声が小さく、ため息があり、いつもより元気がない様子でした。',
    observedSignal: '気分: 落ち込み気味｜関心度: medium',
    suggestedFollowUp: '今日は短く声をかけ、服薬と朝の日課をやさしく確認する。',
    concern: 'medium',
  },
];

const createDemoActions = (): CareMemoryAction[] => [
  {
    id: 'voice_check',
    label: '短く声をかける',
    description: '「昨日少し元気がなさそうだったけれど、今日はどうですか」と急かさず確認する。',
    done: false,
  },
  {
    id: 'routine_check',
    label: '服薬・日課を確認',
    description: '薬箱と朝の動きだけを確認し、判断に迷う場合は人に渡す。',
    done: false,
  },
  {
    id: 'share_followup',
    label: '家族・医師へ共有',
    description: '同じ変化が続く場合は、診断ではなく観察記録として共有する。',
    done: false,
  },
];

export const useCareMemory = create<CareMemoryStore>()(
  persist(
    (set) => ({
      entries: createDemoEntries(),
      actions: createDemoActions(),
      markAction: (id) =>
        set((state) => ({
          actions: state.actions.map((action) =>
            action.id === id
              ? {
                  ...action,
                  done: true,
                  completedAt: action.completedAt ?? nowJa(),
                }
              : action
          ),
        })),
      rememberWellbeingSignal: ({ moodLabel, cues, concern, careMessageJa }) =>
        set((state) => {
          const timestamp = nowJa();
          const entry: CareMemoryEntry = {
            id: `wellbeing-${Date.now()}`,
            dateLabel: '今日',
            timestamp,
            source: 'wellbeing',
            summary: `${moodLabel} の手がかりがありました。${careMessageJa ?? ''}`.trim(),
            observedSignal: `検出: ${cues.join('、') || '声の変化'}｜関心度: ${concern}`,
            suggestedFollowUp: '次の会話で短く様子を確認し、必要なら家族に共有する。',
            concern,
          };
          return {
            entries: [entry, ...state.entries].slice(0, 5),
          };
        }),
      resetDemoMemory: () => ({
        entries: createDemoEntries(),
        actions: createDemoActions(),
      }),
    }),
    {
      name: 'silverlink-care-memory-v1',
    }
  )
);
