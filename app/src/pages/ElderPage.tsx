import { useState } from 'react';
import { useSettings } from '../store/settings';
import { useFamilyStore, createFamilyMemo } from '../store/family';
import { GEMINI_MODEL, analyzeSampleDocument, analyzeMedicineImage } from '../api/gemini';
import { speakJapanese } from '../api/tts';
import type { CloudProof, MedicineCard, DemoState, TtsSource } from '../types';

const formatProofTime = () =>
  new Date().toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const getGeminiProofLabel = (source: MedicineCard['source']) =>
  source === 'gemini-live' ? `${GEMINI_MODEL} live` : 'Deterministic fallback';

const getTtsProofLabel = (source: TtsSource) => {
  switch (source) {
    case 'google-cloud':
      return 'Google Cloud TTS live';
    case 'browser-fallback':
      return 'Browser speech fallback';
    case 'error':
      return 'Audio unavailable';
    case 'not-run':
      return 'Not played yet';
  }
};

export function ElderPage() {
  const { mode, geminiApiKey, ttsApiKey, ttsVoice } = useSettings();
  const { setMemo } = useFamilyStore();

  const [state, setState] = useState<DemoState>('idle');
  const [card, setCard] = useState<MedicineCard | null>(null);
  const [cloudProof, setCloudProof] = useState<CloudProof | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async () => {
    try {
      setError(null);
      setState('processing');

      // Step 1: Gemini analysis (Use sample text if no physical file to make flow seamless)
      let result: MedicineCard;
      if (mode === 'live' && geminiApiKey) {
        result = await analyzeSampleDocument(geminiApiKey);
      } else {
        // Rehearsal fallback
        await new Promise((resolve) => setTimeout(resolve, 1500)); // simulation pause
        result = await analyzeSampleDocument(''); // returns fallback card
      }

      setCard(result);
      setState('card-ready');

      // Step 2: Play Reassuring Voice
      setState('speaking');
      const ttsResult = await speakJapanese('medicineConfirmation', ttsApiKey, ttsVoice);
      setCloudProof({
        geminiSource: result.source,
        ttsSource: ttsResult.source,
        ttsVoice,
        checkedAt: formatProofTime(),
      });
      setState('card-ready');
    } catch (err) {
      console.error(err);
      setError('お薬の読み取りに失敗しました。');
      setState('idle');
    }
  };

  const handleHandoff = async () => {
    if (!card) return;
    try {
      setState('speaking');
      // Play reassuring handoff voice
      const ttsResult = await speakJapanese('reassuringHandoff', ttsApiKey, ttsVoice);
      setCloudProof({
        geminiSource: card.source,
        ttsSource: ttsResult.source,
        ttsVoice,
        checkedAt: formatProofTime(),
      });

      // Create and send family memo
      const memo = createFamilyMemo(card);
      setMemo(memo);

      setState('handoff-sent');
    } catch (err) {
      console.error(err);
      setState('card-ready');
    }
  };

  const handleReset = () => {
    setCard(null);
    setCloudProof(null);
    setError(null);
    setState('idle');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      setState('processing');

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const result = await analyzeMedicineImage(
            base64,
            file.type,
            mode === 'live' ? geminiApiKey : ''
          );
          setCard(result);
          setState('card-ready');

          setState('speaking');
          const ttsResult = await speakJapanese('medicineConfirmation', ttsApiKey, ttsVoice);
          setCloudProof({
            geminiSource: result.source,
            ttsSource: ttsResult.source,
            ttsVoice,
            checkedAt: formatProofTime(),
          });
          setState('card-ready');
        } catch (err) {
          console.error(err);
          setError('画像の解析に失敗しました。');
          setState('idle');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError('ファイルの読み込みに失敗しました。');
      setState('idle');
    }
  };

  return (
    <div className="page">
      {state === 'idle' && (
        <div className="orb-container">
          <div className="orb-wrapper">
            <div className="orb" />
          </div>
          <div className="elder-greeting">
            <h1>こんにちは</h1>
            <p>いつものお薬を確認しましょうか。</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', alignItems: 'center' }}>
            <button className="btn-primary" onClick={handleAction} id="action-btn">
              見る
            </button>
            <label className="btn-secondary" style={{ cursor: 'pointer' }}>
              画像をアップロード
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="orb-container">
          <div className="orb-wrapper">
            <div className="orb processing" />
          </div>
          <div className="status-indicator">
            <span className="status-dot processing" />
            <span>お薬の確認中...</span>
          </div>
        </div>
      )}

      {state === 'speaking' && (
        <div className="orb-container">
          <div className="orb-wrapper">
            <div className="orb speaking" />
          </div>
          <div className="status-indicator">
            <span className="status-dot speaking" />
            <span>音声ガイド再生中...</span>
          </div>
        </div>
      )}

      {(state === 'card-ready' || state === 'handoff-sent') && card && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
          <div className="medicine-card">
            <div className="medicine-card-header">
              <span className="medicine-card-title">読み取ったお薬</span>
              <span className={`source-badge ${card.source}`}>
                {card.source === 'gemini-live' ? `Live ${GEMINI_MODEL}` : 'リハーサル Fallback'}
              </span>
            </div>

            <div className="medicine-field">
              <div className="medicine-field-label">お薬の名前</div>
              <div className="medicine-field-value" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {card.medicineName}
              </div>
            </div>

            <div className="medicine-field">
              <div className="medicine-field-label">飲むタイミング</div>
              <div className="medicine-field-value">{card.timingLabel}</div>
            </div>

            <div className="medicine-field">
              <div className="medicine-field-label">メモ</div>
              <div className="medicine-field-value">{card.notes}</div>
            </div>

            <div className="medicine-uncertainty">
              <div className="medicine-field-label" style={{ color: 'var(--color-secondary)' }}>
                システムが確認できないこと
              </div>
              <p>{card.uncertainty}</p>
            </div>
          </div>

          <div className="cloud-proof-panel" aria-label="Google Cloud proof">
            <div className="cloud-proof-header">
              <span>Google Cloud proof</span>
              <span className={`source-badge ${cloudProof?.geminiSource ?? card.source}`}>
                {mode === 'live' ? 'Live mode' : 'Rehearsal mode'}
              </span>
            </div>
            <div className="cloud-proof-grid">
              <div className="cloud-proof-item">
                <span className="cloud-proof-label">Gemini</span>
                <strong>{getGeminiProofLabel(cloudProof?.geminiSource ?? card.source)}</strong>
              </div>
              <div className="cloud-proof-item">
                <span className="cloud-proof-label">Text-to-Speech</span>
                <strong>{getTtsProofLabel(cloudProof?.ttsSource ?? 'not-run')}</strong>
              </div>
              <div className="cloud-proof-item">
                <span className="cloud-proof-label">Voice</span>
                <strong>{cloudProof?.ttsVoice ?? ttsVoice}</strong>
              </div>
              <div className="cloud-proof-item">
                <span className="cloud-proof-label">Last check</span>
                <strong>{cloudProof?.checkedAt ?? 'Waiting for audio'}</strong>
              </div>
            </div>
          </div>

          <div className="card-actions">
            {state === 'card-ready' ? (
              <div className="card-actions-row">
                <button className="btn-primary" onClick={handleHandoff}>
                  家族に確認してもらう
                </button>
                <button className="btn-secondary" onClick={handleReset}>
                  戻る
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <p style={{ color: 'var(--color-ok)', fontSize: '1.25rem', marginBottom: '1rem' }}>
                  ✓ 家族へメモを送りました。
                </p>
                <button className="btn-secondary" onClick={handleReset}>
                  完了
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: 'red', marginTop: '1rem', textAlign: 'center' }}>
          {error}
          <br />
          <button className="btn-secondary" onClick={handleReset} style={{ marginTop: '0.5rem' }}>
            やり直す
          </button>
        </div>
      )}

      <div className="safety-banner">
        SilverLink supports understanding and human handoff. It does not diagnose or change medication dosage.
      </div>
    </div>
  );
}
