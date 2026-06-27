import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../store/settings';
import { useFamilyStore, createFamilyMemo } from '../store/family';
import { useCareMemory } from '../store/careMemory';
import { GEMINI_MODEL, FALLBACK_MEDICINE_CARD, analyzeSampleDocument, analyzeMedicineImage } from '../api/gemini';
import { speakJapanese, speakText } from '../api/tts';
import { useMicLevel } from '../hooks/useMicLevel';
import type { CloudProof, MedicineCard, DemoState, TtsSource } from '../types';
import { buildLogText, fetchReport, type CareReport } from '../report';
import { ReportCard } from '../components/ReportCard';

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
  const { mode, ttsVoice } = useSettings();
  const { memo, setMemo, addToken, tokens } = useFamilyStore();
  const { entries: memories, actions: memoryActions, markAction, rememberWellbeingSignal } = useCareMemory();
  const {
    level: micLevel,
    enabled: micEnabled,
    listening: micListening,
    error: micError,
    toggle: toggleMic,
    captureWav,
  } = useMicLevel();

  const [state, setState] = useState<DemoState>('idle');
  const [card, setCard] = useState<MedicineCard | null>(null);
  const [cloudProof, setCloudProof] = useState<CloudProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [careMessage, setCareMessage] = useState<string | null>(null);
  const [medFlow, setMedFlow] = useState<'none' | 'reminder' | 'taken'>('none');
  const [medReport, setMedReport] = useState<CareReport | null>(null);
  const [medReportLoading, setMedReportLoading] = useState(false);

  const lastSpokeRef = useRef(0);
  const speakingRef = useRef(false);
  const captureWavRef = useRef(captureWav);
  const featuredMemory = memories.find((memory) => memory.id === 'yesterday-low-mood') ?? memories[0];
  const voiceCheckAction = memoryActions.find((action) => action.id === 'voice_check');

  useEffect(() => {
    captureWavRef.current = captureWav;
  }, [captureWav]);

  // Analyze one short clip: ask Gemini for a wellbeing reading, respond with care,
  // and log a semantic signal to the family view. Raw audio is never stored or kept.
  const analyzeClip = async (clip: { data: string; mimeType: string }, manual: boolean) => {
    try {
      const res = await fetch('/api/wellbeing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: clip.data, mimeType: clip.mimeType }),
      });
      if (!res.ok) return;
      const { reading } = await res.json();
      if (!reading) return;

      const cues: string[] = reading.detectedCues || [];
      const valence = typeof reading.valence === 'number' ? reading.valence : 0;
      const negative = reading.concern !== 'low' || valence <= -0.3;

      if ((manual || negative) && reading.moodLabel && reading.moodLabel !== 'unknown') {
        addToken({
          type: 'wellbeing_signal',
          label: `気分: ${reading.moodLabel}`,
          description: `検出: ${cues.join('、') || '—'}｜関心度: ${reading.concern}${reading.escalate ? '（ご家族に確認をおすすめ）' : ''}`,
          timestamp: new Date().toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        });
        rememberWellbeingSignal({
          moodLabel: reading.moodLabel,
          cues,
          concern: reading.concern === 'high' ? 'high' : reading.concern === 'medium' ? 'medium' : 'low',
          careMessageJa: reading.careMessageJa,
        });
      }

      const now = Date.now();
      if ((manual || negative) && reading.careMessageJa && now - lastSpokeRef.current > 18000) {
        lastSpokeRef.current = now;
        setCareMessage(reading.careMessageJa);
        speakingRef.current = true;
        try {
          await speakText(reading.careMessageJa, ttsVoice, true);
        } finally {
          speakingRef.current = false;
        }
      }
    } catch (err) {
      console.warn('[wellbeing] analyze failed:', err);
    }
  };

  const analyzeRef = useRef(analyzeClip);
  useEffect(() => {
    analyzeRef.current = analyzeClip;
  });

  // Manual "listen to me now": capture a clip and analyze it immediately.
  const runWellbeingCheck = async (manual: boolean) => {
    if (!micListening) return;
    const clip = await captureWavRef.current(5000);
    if (clip) await analyzeRef.current(clip, manual);
  };

  // Continuous gentle monitoring while the mic is on: back-to-back short windows,
  // analyzed only when there is actual sound (silence skipped) and not while speaking.
  useEffect(() => {
    if (!micListening) return;
    let active = true;
    let inflight = 0;
    const loop = async () => {
      while (active) {
        const clip = await captureWavRef.current(5000);
        if (!active) break;
        if (!clip || speakingRef.current) continue;
        if (clip.peak < 0.01) continue; // skip near-silent windows
        if (inflight >= 2) continue;
        inflight++;
        void analyzeRef.current(clip, false).finally(() => {
          inflight--;
        });
      }
    };
    void loop();
    return () => {
      active = false;
    };
  }, [micListening]);

  const handleAction = async () => {
    try {
      setError(null);
      setState('processing');

      // Step 1: Gemini analysis (sample document path for a seamless one-tap flow)
      let result: MedicineCard;
      if (mode === 'live') {
        result = await analyzeSampleDocument();
      } else {
        // Rehearsal fallback
        await new Promise((resolve) => setTimeout(resolve, 1200)); // simulation pause
        result = FALLBACK_MEDICINE_CARD;
      }

      setCard(result);
      setState('card-ready');

      // Step 2: Play Reassuring Voice
      setState('speaking');
      const ttsResult = await speakJapanese('medicineConfirmation', ttsVoice, mode === 'live');
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
      const ttsResult = await speakJapanese('reassuringHandoff', ttsVoice, mode === 'live');
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
    setCareMessage(null);
    setState('idle');
  };

  const medTimestamp = () =>
    new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Simulated medication adherence: edge signal "medicine box not moved" -> gentle
  // reminder -> simulated "took medicine" action -> shared to family & doctor.
  const startMedReminder = async () => {
    setMedFlow('reminder');
    addToken({
      type: 'medication_missed',
      label: '服薬サインなし（薬箱が動いていません）',
      description:
        'エッジ層からのセマンティックシグナル：本日の服薬がまだ確認されていません。生データではなく意味情報のみを扱います。',
      timestamp: medTimestamp(),
    });
    await speakText(
      'お薬が、まだ机の上にあるようです。急がなくても、大丈夫ですよ。一緒に、確認しましょうね。',
      ttsVoice,
      mode === 'live'
    );
  };

  const confirmMedTaken = async () => {
    setMedFlow('taken');
    addToken({
      type: 'medication_taken',
      label: '服薬を確認しました',
      description: 'ご本人が服薬を確認しました（デモ：服薬動作のシミュレーション）。',
      timestamp: medTimestamp(),
    });
    await speakText('確認できました。ありがとうございます。よく頑張りましたね。', ttsVoice, mode === 'live');
  };

  const makeMedReport = async () => {
    setMedReportLoading(true);
    setMedReport(await fetchReport(buildLogText(memo, tokens, memories, memoryActions), 'family'));
    setMedReportLoading(false);
  };

  const resetMed = () => {
    setMedFlow('none');
    setMedReport(null);
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
          const result =
            mode === 'live'
              ? await analyzeMedicineImage(base64, file.type)
              : FALLBACK_MEDICINE_CARD;
          setCard(result);
          setState('card-ready');

          setState('speaking');
          const ttsResult = await speakJapanese('medicineConfirmation', ttsVoice, mode === 'live');
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
      {state === 'idle' && medFlow === 'none' && (
        <div className="orb-container">
          <div
            className={`orb-wrapper${micListening ? ' listening' : ''}`}
            style={{ ['--audio-level']: String(micLevel) } as React.CSSProperties}
          >
            <div className="orb" />
          </div>
          <div className="elder-greeting">
            <h1>こんにちは</h1>
            <p>いつものお薬を確認しましょうか。</p>
          </div>
          {careMessage && (
            <div className="care-block">
              <p className="care-caption">{careMessage}</p>
              <span className="tts-credit">🔊 Google Cloud Text-to-Speech・Chirp3-HD</span>
            </div>
          )}
          {featuredMemory && (
            <div className="elder-memory-nudge">
              <span>{featuredMemory.dateLabel}の記憶</span>
              <p>{featuredMemory.summary}</p>
              <button
                type="button"
                className="btn-secondary memory-action-small"
                onClick={() => markAction('voice_check')}
              >
                {voiceCheckAction?.done ? '声かけ済み' : '声をかけました'}
              </button>
            </div>
          )}
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
            <button
              type="button"
              className={`mic-toggle${micEnabled ? ' active' : ''}`}
              onClick={toggleMic}
              aria-pressed={micEnabled}
            >
              {micListening ? '🎙 音に反応しています' : '🎙 マイクに反応'}
            </button>
            {micError && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                マイクを使用できません（許可が必要です）
              </span>
            )}
            {micListening && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void runWellbeingCheck(true)}
              >
                気持ちを聞いてもらう
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => void startMedReminder()}>
              服薬の見守り（デモ）
            </button>
          </div>
        </div>
      )}

      {state === 'idle' && medFlow === 'reminder' && (
        <div className="orb-container">
          <div className="orb-wrapper">
            <div className="orb speaking" />
          </div>
          <div className="med-reminder">
            <h2>お薬の時間です</h2>
            <p className="care-caption">
              お薬が、まだ机の上にあるようです。急がなくても大丈夫ですよ。一緒に確認しましょうね。
            </p>
            <span className="tts-credit">🔊 Google Cloud Text-to-Speech・Chirp3-HD</span>
          </div>
          <div className="card-actions-row">
            <button className="btn-primary" onClick={() => void confirmMedTaken()}>
              お薬を飲みました
            </button>
            <button className="btn-secondary" onClick={resetMed}>
              あとで
            </button>
          </div>
        </div>
      )}

      {state === 'idle' && medFlow === 'taken' && (
        <div className="orb-container">
          <div className="orb-wrapper">
            <div className="orb" />
          </div>
          <div className="med-reminder">
            <p style={{ color: 'var(--color-ok)', fontSize: 'var(--font-size-elder-lg)' }}>
              ✓ 服薬を記録しました
            </p>
            <p>ご家族と医師に共有しました。</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%' }}>
            <button
              className="btn-primary"
              onClick={() => void makeMedReport()}
              disabled={medReportLoading}
            >
              {medReportLoading ? '作成中...' : 'まとめレポートを作成'}
            </button>
            {medReport && <ReportCard report={medReport} audienceLabel="宛先: ご家族・医師" />}
            <button className="btn-secondary" onClick={resetMed}>
              完了
            </button>
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

      <p className="powered-credit">
        🔊 音声: Google Cloud Text-to-Speech (Chirp3-HD)　/　🧠 理解: Gemini 3.5 (Vertex AI)
      </p>
    </div>
  );
}
