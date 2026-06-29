import { useState } from 'react';
import { searchPts, submitEnquiry } from '../lib/api';
import { resolvePostcode, PostcodeError } from '../lib/postcode';
import { useToast } from '../lib/ToastContext';
import MultiSelectDropdown from '../components/MultiSelectDropdown';

const DISTANCE_OPTIONS = [
  { value: '1',  label: 'Within 1 mile' },
  { value: '5',  label: 'Within 5 miles' },
  { value: '10', label: 'Within 10 miles' },
  { value: '20', label: 'Within 20 miles' },
  { value: '50', label: 'Within 50 miles' },
  { value: '',   label: 'Any distance' },
];

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function SearchPage({
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
  onViewProfile,
}) {
  const showToast = useToast();
  const [enquiryTarget, setEnquiryTarget] = useState(null);

  const specialismOptions = specialisms.map((s) => ({ value: s.slug, label: s.label }));

  async function runSearch() {
    if (!postcodeInput.trim()) {
      showToast('Enter a postcode or town to search.', { error: true });
      return;
    }
    setSearching(true);
    try {
      const resolved = await resolvePostcode(postcodeInput);

      const specialismIds = specialisms
        .filter((s) => selectedGoals.has(s.slug))
        .map((s) => s.id);

      const matched = await searchPts({
        lat: resolved.lat,
        lon: resolved.lon,
        specialismIds,
        ignoreRadius: maxDistance === '',
      });
      setResults(matched);

      const headingParts = [`Near ${resolved.postcode}`];
      if (selectedGoals.size > 0) {
        headingParts.push(
          specialisms.filter((s) => selectedGoals.has(s.slug)).map((s) => s.label).join(', ')
        );
      }
      setHeading(headingParts.join(' — '));
    } catch (err) {
      if (err instanceof PostcodeError) {
        showToast(err.message, { error: true });
      } else {
        showToast('Search failed — please try again in a moment.', { error: true });
      }
    } finally {
      setSearching(false);
    }
  }

  // Apply the client-side distance filter to search results.
  // The DB already filters by each PT's own stated radius — this is an
  // additional "how far am I willing to travel to a gym / how close do I
  // want the PT to travel to me" cap from the client's perspective.
  const filteredResults = results === null
    ? null
    : maxDistance === ''
      ? results
      : results.filter((pt) => pt.distance_miles <= Number(maxDistance));

  return (
    <>
      <div className="hero">
        <div className="wrap">
          <span className="eyebrow">01 — Search by goal, not guesswork</span>
          <h1>Find the <em>specialist</em> trainer for your goal, nearby.</h1>
          <p className="sub">
            Hypertrophy, weight loss, gymnastics strength, pre/post-natal — search by what you
            actually want to achieve, and we'll show you who's covering your area right now.
          </p>

          <div className="search-panel">
            {/* Location */}
            <div>
              <label className="field-label" htmlFor="postcode-input">Postcode or town</label>
              <input
                type="text"
                id="postcode-input"
                placeholder="e.g. Leicester or LE1 2AB"
                autoComplete="off"
                value={postcodeInput}
                onChange={(e) => setPostcodeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              />
            </div>

            {/* Distance */}
            <div>
              <label className="field-label" htmlFor="distance-select">Distance</label>
              <select
                id="distance-select"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
              >
                {DISTANCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Training Goal — multi-select dropdown */}
            <div>
              <span className="field-label" id="goal-label">Training goal</span>
              <MultiSelectDropdown
                options={specialismOptions}
                selected={selectedGoals}
                onChange={setSelectedGoals}
                placeholder="Any goal"
              />
            </div>

            <button className="btn-primary" onClick={runSearch} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      <div className="results-section">
        <div className="wrap">
          {searching && filteredResults === null && (
            <p className="loading-text">Loading trainers…</p>
          )}

          {filteredResults !== null && (
            <>
              <div className="results-meta">
                <h2>{heading}</h2>
                <span className="results-count">
                  {filteredResults.length} {filteredResults.length === 1 ? 'trainer' : 'trainers'} found
                </span>
              </div>

              {filteredResults.length === 0 ? (
                <div className="empty-state">
                  <h3>No trainers matched that search</h3>
                  <p>Try a wider distance, a different location, or fewer goal filters.</p>
                </div>
              ) : (
                <div className="card-grid">
                  {filteredResults.map((pt) => (
                    <PtCard
                      key={pt.id}
                      pt={pt}
                      selectedGoals={selectedGoals}
                      onEnquire={() => setEnquiryTarget(pt)}
                      onViewProfile={() => { onViewProfile(pt.id); }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {enquiryTarget && (
        <EnquiryModal
          pt={enquiryTarget}
          onClose={() => setEnquiryTarget(null)}
          onSent={() => {
            showToast(`Enquiry sent to ${enquiryTarget.display_name}. They'll be in touch shortly.`);
            setEnquiryTarget(null);
          }}
        />
      )}
    </>
  );
}

function PtCard({ pt, selectedGoals, onEnquire, onViewProfile }) {
  const locationLine = pt.match_via === 'gym' && pt.gym_name
    ? `Trains at ${pt.gym_name} (${pt.gym_postcode})`
    : `${pt.postcode} · covers ${pt.radius_miles} mi`;

  const socialLinks = [
    pt.website_url ? { label: 'Website', href: pt.website_url } : null,
    pt.instagram_url ? { label: 'Instagram', href: pt.instagram_url } : null,
    pt.facebook_url ? { label: 'Facebook', href: pt.facebook_url } : null,
  ].filter(Boolean);

  return (
    <a
      className="pt-card"
      href="#"
      onClick={(e) => { e.preventDefault(); onViewProfile(); }}
      style={{ cursor: 'pointer', textDecoration: 'none', display: 'grid' }}
    >
      <div className="avatar" style={{ overflow: 'hidden' }}>
        {pt.profile_photo_url ? (
          <img src={pt.profile_photo_url} alt={pt.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials(pt.display_name)
        )}
      </div>
      <div className="pt-info">
        <h3>{pt.display_name}{pt.listing_tier === 'featured' ? ' ★' : ''}</h3>
        <div className="area-line">
          {locationLine}{pt.rate_gbp ? ` · £${pt.rate_gbp}/session` : ''}
        </div>
        {pt.bio && <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.4 }}>{pt.bio}</p>}
        <div className="pt-tags">
          {pt.specialisms.map((s) => (
            <span key={s.id} className={`pt-tag${selectedGoals.has(s.slug) ? ' match' : ''}`}>
              {s.label}
            </span>
          ))}
        </div>
        {socialLinks.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-dim)' }}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="stat-col">
        <div className="distance">{pt.distance_miles.toFixed(1)}<small> mi</small></div>
        {pt.rate_gbp ? <div className="rate">£{pt.rate_gbp}/session</div> : null}
        <button
          className="enquire-btn"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEnquire(); }}
        >
          Enquire
        </button>
      </div>
    </a>
  );
}

function EnquiryModal({ pt, onClose, onSent }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!name.trim() || !contact.trim()) {
      setError('Please enter your name and an email or phone number.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await submitEnquiry({
        ptId: pt.id,
        clientName: name.trim(),
        clientContact: contact.trim(),
        message: message.trim(),
      });
      onSent();
    } catch (err) {
      setError('Could not send your enquiry — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal">
        <h3>Enquire with {pt.display_name}</h3>
        <p>Your contact details go straight to {pt.display_name} so they can reach out directly.</p>
        <div className="form-row">
          <label className="field-label" htmlFor="enq-name">Your name</label>
          <input type="text" id="enq-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="enq-contact">Email or phone</label>
          <input type="text" id="enq-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="enq-message">Message (optional)</label>
          <textarea id="enq-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What are you hoping to work on?" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button className="btn-ghost on-light" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send enquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}
