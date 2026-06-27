import { useState } from 'react';
import { useFamilyStore, SEMANTIC_TOKENS } from '../store/family';
import { useCareMemory } from '../store/careMemory';
import { useSettings } from '../store/settings';
import { buildLogText, fetchReport, type CareReport } from '../report';
import { ReportCard } from '../components/ReportCard';
import type { SemanticToken } from '../types';

export function FamilyPage() {
  const { memo, tokens, addToken, clearTokens } = useFamilyStore();
  const { entries: memories, actions: memoryActions, markAction, resetDemoMemory } = useCareMemory();
  const { doctorType } = useSettings();
  const [report, setReport] = useState<CareReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const doctorLabel = doctorType === 'private' ? '私人医師' : '地域のかかりつけ医';
  const hasData = Boolean(memo) || tokens.length > 0 || memories.length > 0;

  const makeReport = async () => {
    setLoadingReport(true);
    setReport(await fetchReport(buildLogText(memo, tokens, memories, memoryActions), 'family'));
    setLoadingReport(false);
  };

  const injectToken = (tokenKey: keyof typeof SEMANTIC_TOKENS) => {
    const template = SEMANTIC_TOKENS[tokenKey];
    const token: SemanticToken = {
      ...template,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    addToken(token);
  };

  return (
    <div className="page">
      <div className="family-page-header">
        <h1>ご家族・専門家向けビュー</h1>
        <p>シニアの様子と、手動確認メモを確認できます。</p>
      </div>

      <div className="recipients-banner">
        この情報は <strong>ご家族</strong> と <strong>{doctorLabel}</strong> に共有されます。
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="memory-panel">
          <div className="memory-panel-header">
            <h2 className="semantic-section-title">記憶と今日のケア</h2>
            <button type="button" className="btn-ghost" onClick={resetDemoMemory}>
              デモ記憶をリセット
            </button>
          </div>

          <div className="memory-list">
            {memories.map((memory) => (
              <div key={memory.id} className={`memory-card concern-${memory.concern}`}>
                <div className="memory-card-topline">
                  <span>{memory.dateLabel}</span>
                  <span>{memory.timestamp}</span>
                </div>
                <div className="memory-summary">{memory.summary}</div>
                <div className="memory-detail">{memory.observedSignal}</div>
                <div className="memory-followup">{memory.suggestedFollowUp}</div>
              </div>
            ))}
          </div>

          <div className="memory-actions">
            {memoryActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`memory-action${action.done ? ' done' : ''}`}
                onClick={() => markAction(action.id)}
                aria-pressed={action.done}
              >
                <span className="memory-action-status">{action.done ? '完了' : '今日'}</span>
                <span className="memory-action-label">{action.label}</span>
                <span className="memory-action-desc">{action.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Manual Handoff Memo Section */}
        <div>
          <h2 className="semantic-section-title">お薬確認手渡しメモ</h2>
          {memo ? (
            <div className="memo-card">
              <div className="memo-timestamp">送信時刻: {memo.timestamp}</div>
              <div className="memo-summary">{memo.summary}</div>
              <div className="memo-action">
                <strong>判断が必要な事項:</strong>
                <br />
                {memo.actionNeeded}
              </div>
              <span className="urgency-tag">
                {memo.urgencyLevel === 'check-when-available' ? '時間があるときに確認' : '要確認'}
              </span>
            </div>
          ) : (
            <div className="empty-state">
              <p>現在、手動での確認依頼はありません。</p>
            </div>
          )}
        </div>

        {/* Mock Edge Semantic Tokens Injector (Demo Panel) */}
        <div className="demo-inject-section">
          <div className="demo-inject-label">デモ用・エッジセマンティックシグナル挿入</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
            ※ 本番環境では生データ（カメラ映像やセンサー波形）は送信されず、エッジAIによる最小限のセマンティックトークン（意味情報）のみを安全に送出します。
          </p>
          <div className="demo-inject-buttons">
            <button className="btn-inject" onClick={() => injectToken('medication_missed')}>
              服薬未検出 (medication_missed) を注入
            </button>
            <button className="btn-inject" onClick={() => injectToken('routine_disruption')}>
              行動パターンの乱れ (routine_disruption) を注入
            </button>
            <button className="btn-secondary" onClick={clearTokens}>
              ログ消去
            </button>
          </div>
        </div>

        {/* Ambient Semantic Signals Log */}
        <div className="semantic-section">
          <h2 className="semantic-section-title">受信したセマンティックトークン履歴</h2>
          {tokens.length > 0 ? (
            <div className="token-list">
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
            <div className="empty-state">
              <p>受信ログはありません。デモ操作盤からシグナルを注入してください。</p>
            </div>
          )}
        </div>

        {/* Family summary report (Gemini) */}
        <div>
          <h2 className="semantic-section-title">ご家族向けサマリー</h2>
          <button className="btn-primary" onClick={makeReport} disabled={loadingReport || !hasData}>
            {loadingReport ? '作成中...' : 'サマリーを作成（Gemini）'}
          </button>
          {report && (
            <div style={{ marginTop: '1.5rem' }}>
              <ReportCard report={report} audienceLabel="宛先: ご家族" />
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
