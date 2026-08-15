import { useState } from 'react';
import { ToastProvider } from './toast';
import logo from './assets/logo.svg';
import { KeysPage } from './pages/KeysPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { ConfigPage } from './pages/ConfigPage';
import { ReposPage } from './pages/ReposPage';
import { AgentPage } from './pages/AgentPage';
import { AwsPage } from './pages/AwsPage';
import { BackupsPage } from './pages/BackupsPage';

const PAGES = [
  { id: 'keys', label: 'SSH Keys', icon: '🔑', component: KeysPage },
  { id: 'profiles', label: 'Profiles', icon: '👤', component: ProfilesPage },
  { id: 'config', label: 'SSH Config', icon: '📄', component: ConfigPage },
  { id: 'repos', label: 'Repositories', icon: '📦', component: ReposPage },
  { id: 'agent', label: 'SSH Agent', icon: '🛡️', component: AgentPage },
  { id: 'aws', label: 'AWS', icon: '☁️', component: AwsPage },
  { id: 'backups', label: 'Backups', icon: '🕘', component: BackupsPage },
] as const;

export function App() {
  const [page, setPage] = useState<string>('keys');
  const Active = PAGES.find((p) => p.id === page)!.component;

  return (
    <ToastProvider>
      <div className="app">
        <nav className="sidebar">
          <div className="brand">
            <img src={logo} alt="" className="brand-logo" />
            <span className="brand-text">SSH<span>Hub</span></span>
          </div>
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              <span className="icon">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>
        <main className="main">
          <Active />
        </main>
      </div>
    </ToastProvider>
  );
}
