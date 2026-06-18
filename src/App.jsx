import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import SearchPage from './pages/SearchPage';
import PtProfilePage from './pages/PtProfilePage';
import AuthPage from './pages/AuthPage';
import DashboardOverviewPage from './pages/DashboardOverviewPage';
import ManageListingPage from './pages/ManageListingPage';
import EnquiriesPage from './pages/EnquiriesPage';

function AppShell() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('client'); // 'client' | 'pt'
  const [clientSubview, setClientSubview] = useState({ name: 'search' }); // { name: 'search' } | { name: 'profile', ptId }
  const [ptSubview, setPtSubview] = useState('dashboard'); // 'dashboard' | 'manage-listing' | 'enquiries'

  function goToClientView() {
    setView('client');
    setClientSubview({ name: 'search' });
  }

  function goToPtView() {
    setView('pt');
    setPtSubview('dashboard');
  }

  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <a href="#" className="logo" onClick={(e) => { e.preventDefault(); goToClientView(); }}>
            FIND<span>YOUR</span>PT
          </a>
          <nav className="nav-tabs">
            <button className={`nav-tab${view === 'client' ? ' active' : ''}`} onClick={goToClientView}>
              Find a trainer
            </button>
            <button className={`nav-tab${view === 'pt' ? ' active' : ''}`} onClick={goToPtView}>
              {user ? 'Your dashboard' : 'List your services'}
            </button>
          </nav>
        </div>
      </div>

      <main>
        {view === 'client' && (
          clientSubview.name === 'profile' ? (
            <PtProfilePage
              ptId={clientSubview.ptId}
              onBack={() => setClientSubview({ name: 'search' })}
            />
          ) : (
            <SearchPage onViewProfile={(ptId) => setClientSubview({ name: 'profile', ptId })} />
          )
        )}
        {view === 'pt' && (loading ? (
          <div className="wrap"><p className="loading-text">Loading…</p></div>
        ) : !user ? (
          <AuthPage />
        ) : ptSubview === 'dashboard' ? (
          <DashboardOverviewPage onNavigate={setPtSubview} />
        ) : ptSubview === 'manage-listing' ? (
          <ManageListingPage onNavigate={setPtSubview} />
        ) : (
          <EnquiriesPage onNavigate={setPtSubview} />
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
