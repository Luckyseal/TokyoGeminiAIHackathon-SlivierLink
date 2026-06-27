// Gemini medicine/document understanding — calls the server-side Vertex proxy.
// No API key in the browser: the Cloud Run server uses a service account.

import type { MedicineCard } from '../types';

export const GEMINI_MODEL = 'gemini-3.5-flash';

// Deterministic fallback fixture for demo reliability
export const FALLBACK_MEDICINE_CARD: MedicineCard = {
  medicineName: 'アムロジピン 5mg',
  timingLabel: '朝食後（1日1回）',
  notes: 'パッケージに「血圧のお薬」と記載されています。',
  uncertainty: '服用量や他のお薬との相互作用は確認できません。',
  handoffAdvice: '薬剤師さんかかかりつけ医に確認することをおすすめします。',
  source: 'fallback',
};

async function callAnalyze(body: Record<string, unknown>): Promise<MedicineCard> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`analyze failed: ${res.status}`);
  }
  const data = await res.json();
  const c = data.card ?? {};
  return {
    medicineName: c.medicineName,
    timingLabel: c.timingLabel,
    notes: c.notes,
    uncertainty: c.uncertainty,
    handoffAdvice: c.handoffAdvice,
    source: 'gemini-live',
  };
}

// One-tap demo flow: analyze a bundled sample document via Gemini.
export async function analyzeSampleDocument(): Promise<MedicineCard> {
  try {
    return await callAnalyze({ kind: 'sample' });
  } catch (err) {
    console.error('[Gemini] proxy failed, using fallback:', err);
    return FALLBACK_MEDICINE_CARD;
  }
}

// Analyze an uploaded medicine/document image via Gemini.
export async function analyzeMedicineImage(
  base64Image: string,
  mimeType: string
): Promise<MedicineCard> {
  try {
    return await callAnalyze({ kind: 'image', mimeType, data: base64Image });
  } catch (err) {
    console.error('[Gemini] proxy failed, using fallback:', err);
    return FALLBACK_MEDICINE_CARD;
  }
}
