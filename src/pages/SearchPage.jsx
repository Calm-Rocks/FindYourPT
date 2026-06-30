import { useEffect, useRef, useState } from 'react';
import { searchPts, submitEnquiry } from '../lib/api';
import { resolvePostcode, PostcodeError } from '../lib/postcode';
import { useToast } from '../lib/ToastContext';
import PillMultiSelect from '../components/PillMultiSelect';

const DISTANCE_OPTIONS = [
  { value: '',   label: 'Any distance' },
  { value: '1',  label: '1 mi' },
  { value: '5',  label: '5 mi' },
  { value: '10', label: '10 mi' },
  { value: '20', label: '20 mi' },
  { value: '50', label: '50 mi' },
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
  lastLocation,
  setLastLocation,
  onViewProfile,
}) {
  const showToast = useToast();
  const [enquiryTarget, setEnquiryTarget] = useState(null);
  const isFirstRender = useRef(true);

  const specialismOptions = specialisms.map((s) => ({ value: s.slug, label: s.label }));

  async function runSearch(overridePostcode) {
    const queryText = overridePostcode ?? postcodeInput;
    if (!queryText.trim()) {
      showToast('Enter a postcode or town to search.', { error: true });
      return;
    }
    setSearching(true);
    try {
      const resolved = await resolvePostcode(queryText);
      setLastLocation(resolved);
      await runSearchAtLocation(resolved);
    } catch (err) {
      if (err instanceof PostcodeError) {
        showToast(err.message, { error: true });
      } else {
        showToast('Search failed — please try again in a moment.', { error: true });
      }
      setSearching(false);
    }
  }

  // Re-runs the search against an already-resolved location — used both
  // by the initial location submit and by pill changes, so changing
  // distance/goals doesn't need to re-hit the postcode API at all.
  async function runSearchAtLocation(resolved) {
    setSearching(true);
    try {
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
      showToast('Search failed — please try again in a moment.', { error: true });
    } finally {
      setSearching(false);
    }
  }

  // Live re-filter when distance or goals change, IF a location has
  // already been resolved (i.e. a search has run at least once). This is
  // the core of the "fluid" interaction — adjusting a pill updates results
  // without pressing a button. Debounced slightly so rapid multi-pill
  // clicks don't fire a request per click.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!lastLocation) return;

    const timer = setTimeout(() => {
      runSearchAtLocation(lastLocation);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDistance, selectedGoals]);

  function clearFilters() {
    setMaxDistance('');
    setSelectedGoals(new Set());
  }

  const hasActiveFilters = maxDistance !== '' || selectedGoals.size > 0;

  return (
    <>
      <div className="hero" style={{ paddingBottom: 32 }}>
        <div className="wrap">
          <span className="eyebrow">Find a specialist, fast</span>
          <h1>Find the <em>specialist</em> trainer for your goal, nearby.</h1>
          <p className="sub">
            Search by what you actually want to achieve, and we'll show you who's covering your
            area right now — adjust filters below and results update instantly.
          </p>
        </div>
      </div>

      {/* Sticky filter bar — pins to top on scroll so filters are always reachable */}
      <div className="filter-bar">
        <div className="wrap filter-bar-inner">
          <div className="filter-location">
            <span className="filter-location-icon">⌖</span>
            <input
              type="text"
              placeholder="Postcode or town"
              autoComplete="off"
              value={postcodeInput}
              onChange={(e) => setPostcodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            />
          </div>

          <div className="filter-pills">
            {DISTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`filter-pill${maxDistance === opt.value ? ' selected' : ''}`}
                onClick={() => setMaxDistance(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <PillMultiSelect
            options={specialismOptions}
            selected={selectedGoals}
            onChange={setSelectedGoals}
            placeholder="Any goal"
          />

          {hasActiveFilters && (
            <button className="filter-clear" onClick={clearFilters}>Clear filters</button>
          )}

          <button className="btn-primary" onClick={() => runSearch()} disabled={searching} style={{ marginLeft: 'auto' }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
      </div>

      <div className="results-section">
        <div className="wrap">
          {searching && results === null && (
            <p className="loading-text">Loading trainers…</p>
          )}

          {results !== null && (
            <>
              <div className="results-meta">
                <h2>{heading}</h2>
                <span className="results-count">
                  {results.length} {results.length === 1 ? 'trainer' : 'trainers'} found
                </span>
              </div>

              {results.length === 0 ? (
                <div className="empty-state">
                  <h3>No trainers matched that search</h3>
                  <p>Try a wider distance, a different location, or fewer goal filters.</p>
                </div>
              ) : (
                <div className={`card-grid${searching ? ' results-pulse' : ''}`}>
                  {results.map((pt) => (
                    <PtCardCompact
                      key={pt.id}
                      pt={pt}
                      onEnquire={() => setEnquiryTarget(pt)}
                      onViewProfile={() => onViewProfile(pt.id)}
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

// Quick-glance card: name, photo, top 2 specialisms, distance, price.
// Full bio/gym detail/gallery/socials live on the profile page only —
// reduces what someone has to scan per card so a results page of 10+
// trainers stays easy to compare at a glance.
function PtCardCompact({ pt, onEnquire, onViewProfile }) {
  const topTags = pt.specialisms.slice(0, 2);
  const extraCount = pt.specialisms.length - topTags.length;

  return (
    <a
      className="pt-card-compact"
      href="#"
      onClick={(e) => { e.preventDefault(); onViewProfile(); }}
      style={{ cursor: 'pointer' }}
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
          {pt.match_via === 'gym' && pt.gym_name ? pt.gym_name : pt.postcode}
        </div>
        <div className="pt-tags">
          {topTags.map((s) => (
            <span key={s.id} className="pt-tag">{s.label}</span>
          ))}
          {extraCount > 0 && <span className="pt-tag" style={{ background: 'var(--steel)' }}>+{extraCount}</span>}
        </div>
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
