import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ElderPage } from './pages/ElderPage';
import { FamilyPage } from './pages/FamilyPage';
import { useState } from 'react';
import './index.css';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <NavBar onSettingsOpen={() => setSettingsOpen(true)} />
        <Routes>
          <Route path="/" element={<Navigate to="/elder" replace />} />
          <Route path="/elder" element={<ElderPage />} />
          <Route path="/family" element={<FamilyPage />} />
          <Route path="*" element={<Navigate to="/elder" replace />} />
        </Routes>
        {settingsOpen && (
          <SettingsDrawer onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    </BrowserRouter>
  );
}
