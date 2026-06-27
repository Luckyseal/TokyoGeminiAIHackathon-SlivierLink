import { useSettings, type DoctorType } from '../store/settings';

interface SettingsDrawerProps {
  onClose: () => void;
}

// Warm, natural Chirp3-HD Japanese voices (Sulafat is the default warm tone).
const VOICE_OPTIONS = [
  { value: 'ja-JP-Chirp3-HD-Sulafat', label: 'Sulafat — 温かい (Warm) ◎おすすめ' },
  { value: 'ja-JP-Chirp3-HD-Achernar', label: 'Achernar — やわらか (Soft)' },
  { value: 'ja-JP-Chirp3-HD-Vindemiatrix', label: 'Vindemiatrix — やさしい (Gentle)' },
  { value: 'ja-JP-Chirp3-HD-Gacrux', label: 'Gacrux — 落ち着き (Mature)' },
  { value: 'ja-JP-Chirp3-HD-Callirrhoe', label: 'Callirrhoe — おだやか (Easy-going)' },
  { value: 'ja-JP-Chirp3-HD-Aoede', label: 'Aoede — 軽やか (Breezy)' },
];

export function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { mode, ttsVoice, doctorType, setMode, setTtsVoice, setDoctorType } = useSettings();

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
          <div className="settings-group-label">音声 (Google Cloud Chirp3-HD)</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
            本番モードの音声合成と画像理解は、サーバー側の Vertex AI サービスアカウント経由で実行されます。ブラウザに API キーを保存する必要はありません。
          </p>
          <div className="settings-field">
            <label htmlFor="tts-voice">音声モデル (Voice)</label>
            <select
              id="tts-voice"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-group-label">医師への共有先</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
            見守り情報は、ご家族に加えて医師にも共有されます（「医師へ」ビュー）。
          </p>
          <div className="settings-field">
            <label htmlFor="doctor-type">医師の種類</label>
            <select
              id="doctor-type"
              value={doctorType}
              onChange={(e) => setDoctorType(e.target.value as DoctorType)}
            >
              <option value="community">地域のかかりつけ医</option>
              <option value="private">私人医師</option>
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
