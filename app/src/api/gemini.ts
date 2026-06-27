// Gemini API client for medicine/document understanding

import { GoogleGenAI } from '@google/genai';
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

const MEDICINE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    medicineName: { type: 'string', description: 'Medicine name visible on label' },
    timingLabel: { type: 'string', description: 'Dosage timing (e.g. 朝食後)' },
    notes: { type: 'string', description: 'Visible information from the label or document' },
    uncertainty: { type: 'string', description: 'What cannot be determined from this image alone' },
    handoffAdvice: { type: 'string', description: 'Who should confirm this information' },
  },
  required: ['medicineName', 'timingLabel', 'notes', 'uncertainty', 'handoffAdvice'],
};

const MEDICINE_PROMPT = `
You are a careful, calm assistant helping an elderly person understand medicine labels or health documents.

Rules:
- Do NOT diagnose any illness.
- Do NOT recommend dosage changes.
- Only describe what is visible in the image.
- If uncertain, say so clearly and advise consulting a pharmacist or doctor.
- Use simple, reassuring language suitable for older adults.
- Always include a handoff recommendation.

Respond in Japanese. Return structured JSON matching the schema.
`.trim();

function createClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

function parseMedicineResponse(text?: string): MedicineCard {
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  const parsed = JSON.parse(text);

  return {
    medicineName: parsed.medicineName,
    timingLabel: parsed.timingLabel,
    notes: parsed.notes,
    uncertainty: parsed.uncertainty,
    handoffAdvice: parsed.handoffAdvice,
    source: 'gemini-live',
  };
}

export async function analyzeMedicineImage(
  base64Image: string,
  mimeType: string,
  apiKey: string
): Promise<MedicineCard> {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.warn('[Gemini] No API key — using fallback fixture');
    return FALLBACK_MEDICINE_CARD;
  }

  try {
    const ai = createClient(apiKey);
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: MEDICINE_PROMPT },
        {
          inlineData: {
            data: base64Image,
            mimeType,
          },
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: MEDICINE_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    return parseMedicineResponse(result.text);
  } catch (err) {
    console.error('[Gemini] API error, using fallback:', err);
    return FALLBACK_MEDICINE_CARD;
  }
}

// For demo mode without image upload — analyze a sample prompt
export async function analyzeSampleDocument(apiKey: string): Promise<MedicineCard> {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return FALLBACK_MEDICINE_CARD;
  }

  try {
    const ai = createClient(apiKey);
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: MEDICINE_PROMPT },
        {
          text: `薬のラベル情報（テキスト形式）:
薬品名: アムロジピン錠 5mg「サワイ」
用法・用量: 1日1回 朝食後 1錠
効能: 高血圧症、狭心症
製造販売: 沢井製薬株式会社

この情報から薬カードを作成してください。`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: MEDICINE_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    return parseMedicineResponse(result.text);
  } catch (err) {
    console.error('[Gemini] Sample analysis error, using fallback:', err);
    return FALLBACK_MEDICINE_CARD;
  }
}
