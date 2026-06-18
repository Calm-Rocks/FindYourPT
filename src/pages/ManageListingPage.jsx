import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import {
  fetchSpecialisms,
  fetchOwnPtProfile,
  upsertPtProfile,
  fetchCuratedGyms,
  createCustomGym,
} from '../lib/api';
import { resolvePostcode } from '../lib/postcode';

const CUSTOM_GYM_VALUE = '__custom__';
const NO_GYM_VALUE = '';

export default function ManageListingPage({ onNavigate }) {
  const { user } = useAuth();
  const showToast = useToast();

  const [specialisms, setSpecialisms] = useState([]);
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hadExistingProfile, setHadExistingProfile] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [radius, setRadius] = useState(5);
  const [rate, setRate] = useState('');
  const [tier, setTier] = useState('standard');
  const [bio, setBio] = useState('');
  const [selectedSpecs, setSelectedSpecs] = useState(new Set());

  const [gymSelection, setGymSelection] = useState(NO_GYM_VALUE); // gym id, NO_GYM_VALUE, or CUSTOM_GYM_VALUE
  const [customGymName, setCustomGymName] = useState('');
  const [customGymPostcode, setCustomGymPostcode] = useState('');

  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [specs, gymList, ownProfile] = await Promise.all([
          fetchSpecialisms(),
          fetchCuratedGyms(),
          fetchOwnPtProfile(user.id),
        ]);
        setSpecialisms(specs);
        setGyms(gymList);
        if (ownProfile) {
          setHadExistingProfile(true);
          setDisplayName(ownProfile.display_name);
          setPostcode(ownProfile.postcode);
          setRadius(ownProfile.radius_miles);
          setRate(ownProfile.rate_gbp ?? '');
          setTier(ownProfile.listing_tier);
          setBio(ownProfile.bio ?? '');
          setSelectedSpecs(new Set((ownProfile.pt_specialisms || []).map((row) => row.specialism_id)));
          setGymSelection(ownProfile.gym_id || NO_GYM_VALUE);
          setWebsiteUrl(ownProfile.website_url ?? '');
          setInstagramUrl(ownProfile.instagram_url ?? '');
          setFacebookUrl(ownProfile.facebook_url ?? '');
        }
      } catch (err) {
        showToast('Could not load your listing — try refreshing.', { error: true });
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
    if (gymSelection === CUSTOM_GYM_VALUE && (!customGymName.trim() || !customGymPostcode.trim())) {
      setError('Enter both a gym name and postcode, or choose "No gym / mobile only" instead.');
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

      let finalGymId = null;
      if (gymSelection === CUSTOM_GYM_VALUE) {
        const gymResolved = await resolvePostcode(customGymPostcode);
        if (!gymResolved) {
          setError("Your gym's postcode couldn't be found — double check it.");
          setSaving(false);
          return;
        }
        finalGymId = await createCustomGym({
          name: customGymName.trim(),
          postcode: gymResolved.postcode,
          lat: gymResolved.lat,
          lon: gymResolved.lon,
          userId: user.id,
        });
      } else if (gymSelection !== NO_GYM_VALUE) {
        finalGymId = gymSelection;
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
        gymId: finalGymId,
        websiteUrl: websiteUrl.trim(),
        instagramUrl: instagramUrl.trim(),
        facebookUrl: facebookUrl.trim(),
      });

      showToast('Listing saved — you are now visible to client searches in your area.');
      onNavigate('dashboard');
    } catch (err) {
      setError('Could not save your listing — please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="wrap"><p className="loading-text">Loading your listing…</p></div>;
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button
        className="btn-ghost"
        style={{ marginBottom: 20 }}
        onClick={() => onNavigate('dashboard')}
      >
        ← Back to dashboard
      </button>

      <div className="form-card">
        <h2>{hadExistingProfile ? 'Edit your listing' : 'Create your listing'}</h2>
        <p className="form-sub">This is what clients see when they search.</p>

        <form onSubmit={handleSave}>
          <div className="form-row form-row-split">
            <div>
              <label className="field-label" htmlFor="pt-name">Your name</label>
              <input type="text" id="pt-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div>
              <label className="field-label" htmlFor="pt-postcode">Your base postcode</label>
              <input type="text" id="pt-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. S2 4SU" required />
              <p className="hint">Used for mobile/travel-radius matching below.</p>
            </div>
          </div>

          <div className="form-row">
            <label className="field-label" htmlFor="pt-radius">Travel radius (for mobile/outcall clients)</label>
            <select id="pt-radius" value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="3">3 miles</option>
              <option value="5">5 miles</option>
              <option value="10">10 miles</option>
              <option value="20">20 miles</option>
              <option value="40">40+ miles / will travel</option>
            </select>
          </div>

          <div className="form-row">
            <label className="field-label" htmlFor="pt-gym">Gym you train out of (optional)</label>
            <select
              id="pt-gym"
              value={gymSelection}
              onChange={(e) => setGymSelection(e.target.value)}
            >
              <option value={NO_GYM_VALUE}>No gym / mobile only</option>
              {gyms.map((g) => (
                <option key={g.id} value={g.id}>{g.name} ({g.postcode})</option>
              ))}
              <option value={CUSTOM_GYM_VALUE}>My gym isn't listed — let me add it</option>
            </select>
            <p className="hint">
              If you train clients at a gym, clients searching near that gym will find you even
              outside your travel radius above.
            </p>
          </div>

          {gymSelection === CUSTOM_GYM_VALUE && (
            <div className="form-row form-row-split">
              <div>
                <label className="field-label" htmlFor="custom-gym-name">Gym name</label>
                <input type="text" id="custom-gym-name" value={customGymName} onChange={(e) => setCustomGymName(e.target.value)} placeholder="e.g. Iron Works Gym" />
              </div>
              <div>
                <label className="field-label" htmlFor="custom-gym-postcode">Gym postcode</label>
                <input type="text" id="custom-gym-postcode" value={customGymPostcode} onChange={(e) => setCustomGymPostcode(e.target.value)} placeholder="e.g. S3 8GG" />
              </div>
            </div>
          )}

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

          <div className="form-row form-row-split">
            <div>
              <label className="field-label" htmlFor="pt-website">Website (optional)</label>
              <input type="text" id="pt-website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="field-label" htmlFor="pt-instagram">Instagram (optional)</label>
              <input type="text" id="pt-instagram" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." />
            </div>
          </div>

          <div className="form-row">
            <label className="field-label" htmlFor="pt-facebook">Facebook (optional)</label>
            <input type="text" id="pt-facebook" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/..." />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : hadExistingProfile ? 'Save changes' : 'Create listing'}
          </button>
        </form>

        <div className="pricing-note">
          <strong>How billing works:</strong> this prototype models the listing fee only — actual
          payment collection isn't wired up yet. "Featured" pins you above standard listings in
          matching searches.
        </div>
      </div>
    </div>
  );
}
