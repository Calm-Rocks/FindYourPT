import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import {
  fetchSpecialisms,
  fetchOwnPtProfile,
  upsertPtProfile,
  setListingActive,
  fetchOwnEnquiries,
} from '../lib/api';
import { resolvePostcode } from '../lib/postcode';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const showToast = useToast();

  const [specialisms, setSpecialisms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [enquiries, setEnquiries] = useState([]);

  const [displayName, setDisplayName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [radius, setRadius] = useState(5);
  const [rate, setRate] = useState('');
  const [tier, setTier] = useState('standard');
  const [bio, setBio] = useState('');
  const [selectedSpecs, setSelectedSpecs] = useState(new Set());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [specs, ownProfile, ownEnquiries] = await Promise.all([
          fetchSpecialisms(),
          fetchOwnPtProfile(user.id),
          fetchOwnEnquiries(user.id).catch(() => []), // fine if listing doesn't exist yet
        ]);
        setSpecialisms(specs);
        setEnquiries(ownEnquiries);
        if (ownProfile) {
          setProfile(ownProfile);
          setDisplayName(ownProfile.display_name);
          setPostcode(ownProfile.postcode);
          setRadius(ownProfile.radius_miles);
          setRate(ownProfile.rate_gbp ?? '');
          setTier(ownProfile.listing_tier);
          setBio(ownProfile.bio ?? '');
          setSelectedSpecs(new Set((ownProfile.pt_specialisms || []).map((row) => row.specialism_id)));
        }
      } catch (err) {
        showToast('Could not load your dashboard — try refreshing.', { error: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id]);

  function toggleSpec(id) {
    setSelectedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (!displayName.trim() || !postcode.trim()) {
      setError('Name and postcode are required.');
      return;
    }
    if (selectedSpecs.size === 0) {
      setError('Select at least one specialism.');
      return;
    }

    setSaving(true);
    try {
      const resolved = await resolvePostcode(postcode);
      if (!resolved) {
        setError("That postcode couldn't be found — double check it.");
        setSaving(false);
        return;
      }

      await upsertPtProfile({
        userId: user.id,
        displayName: displayName.trim(),
        bio: bio.trim(),
        postcode: resolved.postcode,
        lat: resolved.lat,
        lon: resolved.lon,
        radiusMiles: Number(radius),
        rateGbp: rate ? Number(rate) : null,
        listingTier: tier,
        specialismIds: [...selectedSpecs],
      });

      showToast('Listing saved — you are now visible to client searches in your area.');
      setProfile({ ...profile, is_active: true });
    } catch (err) {
      setError('Could not save your listing — please try again.');
    } finally {
      setSaving(false);
    }
  }

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

      {profile && (
        <div className="dash-grid">
          <div className="dash-stat">
            <div className="num">{enquiries.length}</div>
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

      <div className="form-card" style={{ marginBottom: 32 }}>
        <h2>{profile ? 'Edit your listing' : 'Create your listing'}</h2>
        <p className="form-sub">This is what clients see when they search.</p>

        <form onSubmit={handleSave}>
          <div className="form-row form-row-split">
            <div>
              <label className="field-label" htmlFor="pt-name">Your name</label>
              <input type="text" id="pt-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div>
              <label className="field-label" htmlFor="pt-postcode">Base postcode</label>
              <input type="text" id="pt-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. S2 4SU" required />
            </div>
          </div>

          <div className="form-row">
            <label className="field-label" htmlFor="pt-radius">Coverage radius</label>
            <select id="pt-radius" value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="3">3 miles</option>
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="20">20 miles</option>
              <option value="40">40+ miles / will travel</option>
            </select>
          </div>

          <div className="form-row">
            <span className="field-label" id="spec-label">Specialisms (select all that apply)</span>
            <div className="tag-select" role="group" aria-labelledby="spec-label">
              {specialisms.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`tag-btn${selectedSpecs.has(s.id) ? ' selected' : ''}`}
                  aria-pressed={selectedSpecs.has(s.id)}
                  onClick={() => toggleSpec(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row form-row-split">
            <div>
              <label className="field-label" htmlFor="pt-rate">Rate (per session, £)</label>
              <input type="text" id="pt-rate" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 45" />
            </div>
            <div>
              <label className="field-label" htmlFor="pt-tier">Listing tier</label>
              <select id="pt-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="standard">Standard — £19/mo</option>
                <option value="featured">Featured (top of results) — £49/mo</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <label className="field-label" htmlFor="pt-bio">Short bio</label>
            <textarea id="pt-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line or two on your approach and experience..." />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : profile ? 'Save changes' : 'Create listing'}
          </button>
        </form>

        <div className="pricing-note">
          <strong>How billing works:</strong> this prototype models the listing fee only — actual
          payment collection isn't wired up yet. "Featured" pins you above standard listings in
          matching searches.
        </div>
      </div>

      <h2 style={{ fontSize: 22, marginBottom: 14 }}>Enquiries</h2>
      {enquiries.length === 0 ? (
        <div className="empty-state">
          <h3>No enquiries yet</h3>
          <p>When a client contacts you through search results, it'll show up here.</p>
        </div>
      ) : (
        enquiries.map((enq) => (
          <div key={enq.id} className="enquiry-row">
            <div className="top-line">
              <span className="name">{enq.client_name}</span>
              <span className="date">{new Date(enq.created_at).toLocaleDateString()}</span>
            </div>
            <div className="contact">{enq.client_contact}</div>
            {enq.message && <div className="msg">{enq.message}</div>}
          </div>
        ))
      )}
    </div>
  );
}
