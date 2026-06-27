import { useSettings } from '../store/settings';

interface SettingsDrawerProps {
  onClose: () => void;
}

export function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const {
    mode,
    geminiApiKey,
    ttsApiKey,
    ttsVoice,
    setMode,
    setGeminiApiKey,
    setTtsApiKey,
    setTtsVoice,
  } = useSettings();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>設定 / Settings</h2>

        <div className="settings-group">
          <div className="settings-group-label">動作モード</div>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'rehearsal' ? 'active' : ''}`}
              onClick={() => setMode('rehearsal')}
            >
              リハーサル (Mock)
            </button>
            <button
              className={`mode-btn ${mode === 'live' ? 'active' : ''}`}
              onClick={() => setMode('live')}
            >
              本番 (Live GCP)
            </button>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-label">API 設定 (Client-Side Only)</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
            本番モード時に使用するAPIキーを設定してください。キーは永続化されず、ブラウザのメモリ内でのみ保持されます。
          </p>
          <div className="settings-field">
            <label htmlFor="gemini-key">Gemini API Key</label>
            <input
              id="gemini-key"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          <div className="settings-field">
            <label htmlFor="tts-key">Google TTS API Key</label>
            <input
              id="tts-key"
              type="password"
              value={ttsApiKey}
              onChange={(e) => setTtsApiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          <div className="settings-field">
            <label htmlFor="tts-voice">音声モデル (Voice)</label>
            <select
              id="tts-voice"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
            >
              <option value="ja-JP-Neural2-B">ja-JP-Neural2-B (女性風・自然)</option>
              <option value="ja-JP-Neural2-F">ja-JP-Neural2-F (男性風・自然)</option>
              <option value="ja-JP-Wavenet-B">ja-JP-Wavenet-B (標準)</option>
            </select>
          </div>
        </div>

        <button className="btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
