import { NavLink } from 'react-router-dom';
import { useSettings } from '../store/settings';

interface NavBarProps {
  onSettingsOpen: () => void;
}

export function NavBar({ onSettingsOpen }: NavBarProps) {
  const { mode } = useSettings();

  return (
    <nav className="nav-bar">
      <span className="nav-logo">SilverLink</span>
      <ul className="nav-links">
        <li>
          <NavLink to="/elder" className={({ isActive }) => isActive ? 'active' : ''}>
            見る
          </NavLink>
        </li>
        <li>
          <NavLink to="/family" className={({ isActive }) => isActive ? 'active' : ''}>
            家族へ
          </NavLink>
        </li>
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className={`nav-mode-badge ${mode === 'live' ? 'live' : ''}`}>
          {mode === 'live' ? '● Live GCP' : '○ リハーサル'}
        </span>
        <button className="btn-ghost" onClick={onSettingsOpen} id="settings-btn" aria-label="設定を開く">
          ⚙
        </button>
      </div>
    </nav>
  );
}
