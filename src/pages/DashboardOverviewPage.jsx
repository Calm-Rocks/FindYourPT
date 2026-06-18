import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { fetchOwnPtProfile, fetchOwnEnquiries, setListingActive } from '../lib/api';

export default function DashboardOverviewPage({ onNavigate }) {
  const { user, signOut } = useAuth();
  const showToast = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [enquiryCount, setEnquiryCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [ownProfile, ownEnquiries] = await Promise.all([
          fetchOwnPtProfile(user.id),
          fetchOwnEnquiries(user.id).catch(() => []),
        ]);
        setProfile(ownProfile);
        setEnquiryCount(ownEnquiries.length);
      } catch (err) {
        showToast('Could not load your dashboard — try refreshing.', { error: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id]);

  async function handleToggleActive() {
    const newActive = !(profile?.is_active ?? true);
    try {
      await setListingActive(user.id, newActive);
      setProfile((p) => ({ ...p, is_active: newActive }));
      showToast(newActive ? 'Listing is live again.' : 'Listing paused — you are hidden from search.');
    } catch (err) {
      showToast('Could not update listing status.', { error: true });
    }
  }

  if (loading) {
    return <div className="wrap"><p className="loading-text">Loading your dashboard…</p></div>;
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 32 }}>Your dashboard</h1>
        <button className="btn-ghost" onClick={signOut}>Log out</button>
      </div>

      {!profile && (
        <div className="empty-state" style={{ marginBottom: 28 }}>
          <h3>You haven't created a listing yet</h3>
          <p>Set up your listing to start appearing in client searches.</p>
        </div>
      )}

      {profile && (
        <div className="dash-grid">
          <div className="dash-stat">
            <div className="num">{enquiryCount}</div>
            <div className="label">Enquiries received</div>
          </div>
          <div className="dash-stat" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className={`status-pill ${profile.is_active ? 'active' : 'inactive'}`}>
                {profile.is_active ? 'Listing live' : 'Listing paused'}
              </span>
            </div>
            <button className="btn-danger-text" onClick={handleToggleActive}>
              {profile.is_active ? 'Pause listing' : 'Reactivate'}
            </button>
          </div>
        </div>
      )}

      <div className="card-grid">
        <button
          className="pt-card"
          style={{ cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%' }}
          onClick={() => onNavigate('manage-listing')}
        >
          <div className="avatar" style={{ background: 'var(--accent)' }}>✎</div>
          <div className="pt-info">
            <h3>{profile ? 'Manage your listing' : 'Create your listing'}</h3>
            <div className="area-line" style={{ marginBottom: 0 }}>
              Edit your bio, specialisms, gym, rates, and contact links.
            </div>
          </div>
        </button>

        <button
          className="pt-card"
          style={{ cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%' }}
          onClick={() => onNavigate('enquiries')}
        >
          <div className="avatar" style={{ background: 'var(--olive)' }}>✉</div>
          <div className="pt-info">
            <h3>View enquiries</h3>
            <div className="area-line" style={{ marginBottom: 0 }}>
              {enquiryCount} {enquiryCount === 1 ? 'enquiry' : 'enquiries'} from clients who found you.
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
