import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import SearchPage from './pages/SearchPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';

function AppShell() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('client'); // 'client' | 'pt'

  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <a href="#" className="logo" onClick={(e) => { e.preventDefault(); setView('client'); }}>
            FIND<span>YOUR</span>PT
          </a>
          <nav className="nav-tabs">
            <button className={`nav-tab${view === 'client' ? ' active' : ''}`} onClick={() => setView('client')}>
              Find a trainer
            </button>
            <button className={`nav-tab${view === 'pt' ? ' active' : ''}`} onClick={() => setView('pt')}>
              {user ? 'Your dashboard' : 'List your services'}
            </button>
          </nav>
        </div>
      </div>

      <main>
        {view === 'client' && <SearchPage />}
        {view === 'pt' && (loading ? (
          <div className="wrap"><p className="loading-text">Loading…</p></div>
        ) : user ? (
          <DashboardPage />
        ) : (
          <AuthPage />
        ))}
      </main>

      <footer>
        <div className="wrap">
          FindYourPT — postcode lookups powered by postcodes.io. No payment processing in this
          build; listing tiers are illustrative pricing only.
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}
