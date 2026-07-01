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
import VerificationPage from './pages/VerificationPage';
import AdminReviewPage from './pages/AdminReviewPage';
import AdminPtOverviewPage from './pages/AdminPtOverviewPage';
import LegalPage from './pages/LegalPage';
import LandingPage from './pages/LandingPage';
import AiSearchPage from './pages/AiSearchPage';

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
  const [clientSubview, setClientSubview] = useState({ name: 'landing' });
  const [ptSubview, setPtSubview] = useState('dashboard');
  // legalDoc holds { document: 'privacy' | 'terms', returnView: 'client' | 'pt' }
  // while a legal page is open, null otherwise — null means "not viewing
  // a legal page", so the main view/clientSubview/ptSubview state renders
  // as normal.
  const [legalDoc, setLegalDoc] = useState(null);

  // Search state lifted here so it survives navigating to a profile and back.
  const [specialisms, setSpecialisms] = useState([]);
  const [postcodeInput, setPostcodeInput] = useState(DEFAULT_SEARCH.label);
  const [selectedGoals, setSelectedGoals] = useState(new Set());
  const [maxDistance, setMaxDistance] = useState(''); // '' = any distance
  const [results, setResults] = useState(null);
  const [heading, setHeading] = useState('');
  const [searching, setSearching] = useState(false);
  // The last successfully resolved search location ({lat, lon, postcode}).
  // Lifted to App (not a local ref inside SearchPage) so it survives both
  // navigating away/back AND the initial default-location search, letting
  // distance/goal pill changes re-search instantly without re-resolving
  // the location text each time.
  const [lastLocation, setLastLocation] = useState(null);

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
        setLastLocation({ lat: DEFAULT_SEARCH.lat, lon: DEFAULT_SEARCH.lon, postcode: DEFAULT_SEARCH.label });
      })
      .catch(() => {
        // Non-fatal — just leave the page blank rather than error on first load
      })
      .finally(() => setSearching(false));
  }, [specialisms.length > 0]); // only run once, when specialisms first arrive

  function goToClientView() {
    setView('client');
    setClientSubview({ name: 'landing' });
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
    lastLocation,
    setLastLocation,
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
            SPOT<span>MY</span>PT
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
        {legalDoc ? (
          <LegalPage
            document={legalDoc.document}
            onBack={() => {
              window.scrollTo(0, 0);
              setView(legalDoc.returnView);
              setLegalDoc(null);
            }}
          />
        ) : (
          <>
            {view === 'client' && (
              clientSubview.name === 'landing' ? (
                <LandingPage
                  onFindPt={() => { window.scrollTo(0, 0); setClientSubview({ name: 'ai-search' }); }}
                  onListServices={() => { setView('pt'); window.scrollTo(0, 0); }}
                />
              ) : clientSubview.name === 'ai-search' ? (
                <AiSearchPage
                  onBack={() => { window.scrollTo(0, 0); setClientSubview({ name: 'landing' }); }}
                />
              ) : clientSubview.name === 'profile' ? (
                <PtProfilePage
                  ptId={clientSubview.ptId}
                  onBack={() => {
                    window.scrollTo(0, 0);
                    setClientSubview({ name: 'landing' });
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
            ) : ptSubview === 'verification' ? (
              <VerificationPage onNavigate={setPtSubview} />
            ) : ptSubview === 'admin-review' ? (
              <AdminReviewPage onNavigate={setPtSubview} />
            ) : ptSubview === 'admin-overview' ? (
              <AdminPtOverviewPage onNavigate={setPtSubview} />
            ) : (
              <EnquiriesPage onNavigate={setPtSubview} />
            ))}
          </>
        )}
      </main>

      <footer>
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <span>SPOT</span>MY<span>PT</span>
            </div>
            <p className="footer-tagline">
              Find a verified specialist personal trainer near you, or list your services and get found.
            </p>
            <p className="footer-copyright">© {new Date().getFullYear()} SpotMyPT. All rights reserved.</p>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">For clients</span>
            <button className="footer-link" onClick={() => { goToClientView(); window.scrollTo(0, 0); }}>
              Find a trainer
            </button>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">For trainers</span>
            <button className="footer-link" onClick={() => { goToPtView(); window.scrollTo(0, 0); }}>
              List your services
            </button>
          </div>

          <div className="footer-col">
            <span className="footer-col-title">Legal</span>
            <button className="footer-link" onClick={() => { setLegalDoc({ document: 'terms', returnView: view }); window.scrollTo(0, 0); }}>
              Terms of Service
            </button>
            <button className="footer-link" onClick={() => { setLegalDoc({ document: 'privacy', returnView: view }); window.scrollTo(0, 0); }}>
              Privacy Policy
            </button>
          </div>
        </div>

        <div className="wrap footer-fineprint">
          SpotMyPT — postcode lookups powered by postcodes.io. No payment processing in this
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
