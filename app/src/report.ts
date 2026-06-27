// Shared helpers for building a wellbeing log and fetching a Gemini summary report.

import type { CareMemoryAction, CareMemoryEntry, FamilyMemo, SemanticToken } from './types';

export type ReportAudience = 'family' | 'doctor';

export interface CareReport {
  title: string;
  summaryJa: string;
  bullets: string[];
  suggestion: string;
  disclaimer: string;
}

// Turn the shared family memo + semantic signals into a plain-text log for summarization.
export function buildLogText(
  memo: FamilyMemo | null,
  tokens: SemanticToken[],
  memories: CareMemoryEntry[] = [],
  actions: CareMemoryAction[] = []
): string {
  const lines: string[] = [];
  if (memo) {
    lines.push(`【服薬・申し送り】${memo.timestamp}｜${memo.summary}｜${memo.actionNeeded}`);
  }
  for (const memory of memories) {
    lines.push(
      `【ケア記憶】${memory.dateLabel} ${memory.timestamp}｜${memory.summary}｜${memory.observedSignal}｜今日の提案: ${memory.suggestedFollowUp}`
    );
  }
  for (const action of actions) {
    lines.push(
      `【今日の対応】${action.label}｜${action.done ? `実施済み ${action.completedAt ?? ''}` : '未実施'}｜${action.description}`
    );
  }
  for (const t of tokens) {
    lines.push(`【${t.label}】${t.timestamp}｜${t.description}`);
  }
  return lines.join('\n');
}

export async function fetchReport(
  logText: string,
  audience: ReportAudience
): Promise<CareReport | null> {
  try {
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logText, audience }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.report as CareReport) ?? null;
  } catch (err) {
    console.error('[report] fetch failed:', err);
    return null;
  }
}
