import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { useIsAdmin } from '../lib/useIsAdmin';
import { fetchOwnPtProfile, fetchOwnEnquiries, setListingActive } from '../lib/api';

const VERIFICATION_LABELS = {
  unverified: { text: 'Not verified', className: 'inactive' },
  pending: { text: 'Verification pending', className: 'inactive' },
  approved: { text: 'Verified', className: 'active' },
  rejected: { text: 'Verification rejected', className: 'inactive' },
};

export default function DashboardOverviewPage({ onNavigate }) {
  const { user, signOut } = useAuth();
  const showToast = useToast();
  const { isAdmin } = useIsAdmin();

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

  const verification = VERIFICATION_LABELS[profile?.verification_status ?? 'unverified'];

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 32 }}>Your dashboard</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && (
            <button className="btn-ghost" onClick={() => onNavigate('admin-review')}>
              Admin review queue
            </button>
          )}
          <button className="btn-ghost" onClick={signOut}>Log out</button>
        </div>
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

      {profile && profile.verification_status !== 'approved' && (
        <div className="empty-state" style={{ marginBottom: 28, textAlign: 'left' }}>
          <h3>Your listing isn't visible to clients yet</h3>
          <p>
            FindYourPT verifies every trainer's qualification and insurance before they appear in
            search. {profile.verification_status === 'pending'
              ? 'Your documents are awaiting review.'
              : profile.verification_status === 'rejected'
                ? `Your last submission was rejected: ${profile.verification_rejection_reason || 'see verification page for details.'}`
                : 'Submit your certificate and insurance to get verified.'}
          </p>
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

        <button
          className="pt-card"
          style={{ cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%' }}
          onClick={() => onNavigate('verification')}
        >
          <div className="avatar" style={{ background: verification.className === 'active' ? 'var(--olive)' : 'var(--steel)' }}>✓</div>
          <div className="pt-info">
            <h3>Verification</h3>
            <div className="area-line" style={{ marginBottom: 0 }}>
              <span className={`status-pill ${verification.className}`}>{verification.text}</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
