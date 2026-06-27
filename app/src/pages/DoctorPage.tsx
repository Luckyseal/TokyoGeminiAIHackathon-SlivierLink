import { useState } from 'react';
import { useFamilyStore } from '../store/family';
import { useSettings } from '../store/settings';
import { buildLogText, fetchReport, type CareReport } from '../report';
import { ReportCard } from '../components/ReportCard';

export function DoctorPage() {
  const { memo, tokens } = useFamilyStore();
  const { doctorType } = useSettings();
  const [report, setReport] = useState<CareReport | null>(null);
  const [loading, setLoading] = useState(false);

  const doctorLabel = doctorType === 'private' ? '私人医師' : '地域のかかりつけ医';

  const makeReport = async () => {
    setLoading(true);
    const r = await fetchReport(buildLogText(memo, tokens), 'doctor');
    setReport(r);
    setLoading(false);
  };

  const hasData = Boolean(memo) || tokens.length > 0;

  return (
    <div className="page">
      <div className="family-page-header">
        <h1>医師向けビュー</h1>
        <p>{doctorLabel}への共有情報です（見守りからの観察記録）。</p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Shared observations the doctor receives */}
        <div className="semantic-section">
          <h2 className="semantic-section-title">受信した見守り情報</h2>
          {memo && (
            <div className="memo-card">
              <div className="memo-timestamp">{memo.timestamp}</div>
              <div className="memo-summary">{memo.summary}</div>
              <div className="memo-action">
                <strong>確認事項:</strong>
                <br />
                {memo.actionNeeded}
              </div>
            </div>
          )}
          {tokens.length > 0 ? (
            <div className="token-list" style={{ marginTop: memo ? '1rem' : 0 }}>
              {tokens.map((t, idx) => (
                <div key={idx} className="token-item">
                  <div className="token-item-header">
                    <span className="token-label">{t.label}</span>
                    <span className="token-time">{t.timestamp}</span>
                  </div>
                  <div className="token-description">{t.description}</div>
                </div>
              ))}
            </div>
          ) : (
            !memo && (
              <div className="empty-state">
                <p>まだ共有された情報はありません。</p>
              </div>
            )
          )}
        </div>

        {/* Gemini clinical summary */}
        <div>
          <button className="btn-primary" onClick={makeReport} disabled={loading || !hasData}>
            {loading ? '作成中...' : 'クリニカルサマリーを作成（Gemini）'}
          </button>
          {report && (
            <div style={{ marginTop: '1.5rem' }}>
              <ReportCard report={report} audienceLabel={`宛先: ${doctorLabel}`} />
            </div>
          )}
        </div>
      </div>

      <div className="safety-banner" style={{ marginTop: '2.5rem' }}>
        SilverLink supports understanding and human handoff. It does not diagnose or change medication dosage.
      </div>
    </div>
  );
}
