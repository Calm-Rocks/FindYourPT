import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider, useToast } from './lib/ToastContext';
import { fetchSpecialisms, searchPts } from './lib/api';
import SearchPage from './pages/SearchPage';
import PtProfilePage from './pages/PtProfilePage';
import AuthPage from './pages/AuthPage';
import DashboardOverviewPage from './pages/DashboardOverviewPage';
import ManageListingPage from './pages/ManageListingPage';
import EnquiriesPage from './pages/EnquiriesPage';

// Default search centred on Leicester City centre (LE1 1RB).
// Used on first load so the page shows results immediately rather than
// a blank "enter a postcode" prompt — users can override with their own.
const DEFAULT_SEARCH = {
  lat: 52.6369,
  lon: -1.1398,
  label: 'Leicester',
};

function AppShell() {
  const { user, loading } = useAuth();
  const showToast = useToast();

  const [view, setView] = useState('client');
  const [clientSubview, setClientSubview] = useState({ name: 'search' });
  const [ptSubview, setPtSubview] = useState('dashboard');

  // Search state lifted here so it survives navigating to a profile and back.
  const [specialisms, setSpecialisms] = useState([]);
  const [postcodeInput, setPostcodeInput] = useState(DEFAULT_SEARCH.label);
  const [selectedGoals, setSelectedGoals] = useState(new Set());
  const [maxDistance, setMaxDistance] = useState(''); // '' = any distance
  const [results, setResults] = useState(null);
  const [heading, setHeading] = useState('');
  const [searching, setSearching] = useState(false);

  // Load specialisms once at app level so they're available immediately
  // when SearchPage mounts, without a second fetch on return from profile.
  useEffect(() => {
    fetchSpecialisms()
      .then(setSpecialisms)
      .catch(() => showToast('Could not load specialisms — check your connection.', { error: true }));
  }, []);

  // Run the default Leicester search once specialisms have loaded.
  // We use coords directly (no postcode API call needed) and label it
  // as "Leicester" so the heading is meaningful.
  useEffect(() => {
    if (specialisms.length === 0) return;
    setSearching(true);
    searchPts({ lat: DEFAULT_SEARCH.lat, lon: DEFAULT_SEARCH.lon, specialismIds: [], ignoreRadius: true })
      .then((matched) => {
        setResults(matched);
        setHeading(`Near ${DEFAULT_SEARCH.label}`);
      })
      .catch(() => {
        // Non-fatal — just leave the page blank rather than error on first load
      })
      .finally(() => setSearching(false));
  }, [specialisms.length > 0]); // only run once, when specialisms first arrive

  function goToClientView() {
    setView('client');
    setClientSubview({ name: 'search' });
  }

  function goToPtView() {
    setView('pt');
    setPtSubview('dashboard');
  }

  const searchProps = {
    specialisms,
    postcodeInput,
    setPostcodeInput,
    selectedGoals,
    setSelectedGoals,
    maxDistance,
    setMaxDistance,
    results,
    setResults,
    heading,
    setHeading,
    searching,
    setSearching,
    onViewProfile: (ptId) => {
      window.scrollTo(0, 0);
      setClientSubview({ name: 'profile', ptId });
    },
  };

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
              onBack={() => {
                window.scrollTo(0, 0);
                setClientSubview({ name: 'search' });
              }}
            />
          ) : (
            <SearchPage {...searchProps} />
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
