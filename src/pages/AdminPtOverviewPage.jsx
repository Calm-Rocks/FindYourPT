import { useEffect, useState } from 'react';
import { useToast } from '../lib/ToastContext';
import { useIsAdmin } from '../lib/useIsAdmin';
import { fetchAdminPtOverview, setTrialExpiry } from '../lib/api';

const TRIAL_OPTIONS = [
  { value: '', label: 'No trial' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days (6 months)' },
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysRemaining(trialExpiresAt) {
  if (!trialExpiresAt) return null;
  const expires = new Date(trialExpiresAt);
  const now = new Date();
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

function trialBadge(trialExpiresAt) {
  const daysLeft = daysRemaining(trialExpiresAt);
  if (daysLeft === null) return null;
  if (daysLeft < 0) return { text: 'Trial expired', className: 'inactive' };
  if (daysLeft <= 7) return { text: `Trial ends in ${daysLeft}d`, className: 'inactive' };
  return { text: `On trial · ends ${formatDate(trialExpiresAt)}`, className: 'active' };
}

// Determines what the dropdown should actually show right now: 'No trial'
// if there's no expiry set, one of the preset durations if the remaining
// days happen to match a preset closely (within a day, to absorb
// rendering-time rounding), or a synthetic "current" option describing
// the real remaining time — since once any time has passed, a trainer
// originally given 90 days no longer HAS 90 days left, and silently
// relabelling that as one of the presets would misrepresent their actual
// status to whoever's looking at this screen.
function resolveTrialSelectState(trialExpiresAt) {
  const daysLeft = daysRemaining(trialExpiresAt);
  if (daysLeft === null) return { selectValue: '', customOption: null };
  if (daysLeft < 0) return { selectValue: '__expired__', customOption: { value: '__expired__', label: 'Expired — pick a new period' } };

  const matchingPreset = TRIAL_OPTIONS.find((opt) => opt.value !== '' && Math.abs(Number(opt.value) - daysLeft) <= 1);
  if (matchingPreset) return { selectValue: matchingPreset.value, customOption: null };

  return {
    selectValue: '__current__',
    customOption: { value: '__current__', label: `Current: ${daysLeft}d left (${formatDate(trialExpiresAt)})` },
  };
}

export default function AdminPtOverviewPage({ onNavigate }) {
  const showToast = useToast();
  const { isAdmin, loading: adminCheckLoading } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [pts, setPts] = useState([]);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (adminCheckLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadOverview();
  }, [adminCheckLoading, isAdmin]);

  async function loadOverview() {
    setLoading(true);
    try {
      const data = await fetchAdminPtOverview();
      setPts(data);
    } catch (err) {
      showToast('Could not load the PT overview.', { error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleTrialChange(pt, days) {
    setSavingId(pt.id);
    try {
      const expiresAt = days === '' ? null : daysFromNow(days);
      await setTrialExpiry(pt.id, expiresAt);
      setPts((prev) => prev.map((p) => (p.id === pt.id ? { ...p, trial_expires_at: expiresAt } : p)));
      showToast(days === '' ? `${pt.display_name}'s trial cleared.` : `${pt.display_name} set on a ${days}-day trial.`);
    } catch (err) {
      showToast('Could not update trial status.', { error: true });
    } finally {
      setSavingId(null);
    }
  }

  if (adminCheckLoading || loading) {
    return <div className="wrap"><p className="loading-text">Loading…</p></div>;
  }

  if (!isAdmin) {
    return (
      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <div className="empty-state">
          <h3>Not authorized</h3>
          <p>This page is only available to SpotMyPT admins.</p>
        </div>
      </div>
    );
  }

  const totalEnquiries = pts.reduce((sum, p) => sum + Number(p.enquiry_count), 0);
  const onTrialCount = pts.filter((p) => p.trial_expires_at && new Date(p.trial_expires_at) > new Date()).length;

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-ghost" style={{ marginBottom: 20 }} onClick={() => onNavigate('dashboard')}>
        ← Back to dashboard
      </button>

      <h1 style={{ fontSize: 32, marginBottom: 6 }}>Trainer overview</h1>
      <p className="hint" style={{ marginBottom: 28 }}>
        {pts.length} trainers · {onTrialCount} on trial · {totalEnquiries} total enquiries
      </p>

      {pts.length === 0 ? (
        <div className="empty-state">
          <h3>No trainers yet</h3>
        </div>
      ) : (
        pts.map((pt) => {
          const badge = trialBadge(pt.trial_expires_at);
          return (
            <div key={pt.id} className="enquiry-row" style={{ marginBottom: 16 }}>
              <div className="top-line">
                <span className="name">{pt.display_name}</span>
                <span className="date">Joined {formatDate(pt.created_at)}</span>
              </div>
              <div className="contact">{pt.postcode}</div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`status-pill ${pt.verification_status === 'approved' ? 'active' : 'inactive'}`}>
                  {pt.verification_status}
                </span>
                <span className={`status-pill ${pt.is_active ? 'active' : 'inactive'}`}>
                  {pt.is_active ? 'listing live' : 'paused'}
                </span>
                {pt.listing_tier === 'featured' && (
                  <span className="status-pill active">featured</span>
                )}
                {badge && (
                  <span className={`status-pill ${badge.className}`}>{badge.text}</span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: "'Roboto Mono', monospace", fontSize: 13, color: 'var(--steel)' }}>
                  {pt.enquiry_count} {Number(pt.enquiry_count) === 1 ? 'enquiry' : 'enquiries'}
                </span>
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="field-label" style={{ marginBottom: 0 }} htmlFor={`trial-${pt.id}`}>Trial</label>
                <select
                  id={`trial-${pt.id}`}
                  value={resolveTrialSelectState(pt.trial_expires_at).selectValue}
                  disabled={savingId === pt.id}
                  onChange={(e) => {
                    const v = e.target.value;
                    // __current__ and __expired__ are display-only states reflecting
                    // existing data, not real selections — picking a genuine preset
                    // (including '' for "No trial") is what actually changes anything.
                    if (v === '__current__' || v === '__expired__') return;
                    handleTrialChange(pt, v);
                  }}
                  style={{ width: 'auto', minWidth: 160 }}
                >
                  {(() => {
                    const { customOption } = resolveTrialSelectState(pt.trial_expires_at);
                    return customOption ? <option value={customOption.value}>{customOption.label}</option> : null;
                  })()}
                  {TRIAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
