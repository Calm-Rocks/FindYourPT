import { useEffect, useState } from 'react';
import { fetchPublicPtProfile, submitEnquiry } from '../lib/api';
import { useToast } from '../lib/ToastContext';

function initials(name) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function PtProfilePage({ ptId, onBack }) {
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [pt, setPt] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchPublicPtProfile(ptId);
        if (!cancelled) setPt(data);
      } catch (err) {
        if (!cancelled) {
          setFetchError(true);
          showToast('Could not load this profile — check your connection and try again.', { error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ptId]);

  if (loading) {
    return <div className="wrap"><p className="loading-text">Loading profile…</p></div>;
  }

  if (!pt) {
    return (
      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <button className="btn-ghost" onClick={onBack}>← Back to search</button>
        <div className="empty-state" style={{ marginTop: 24 }}>
          <h3>{fetchError ? 'Could not load this profile' : 'Profile not found'}</h3>
          <p>{fetchError ? 'Something went wrong fetching this listing. Try going back and clicking again.' : "This trainer's listing may have been removed or paused."}</p>
        </div>
      </div>
    );
  }

  const specialismTags = (pt.pt_specialisms || []).map((row) => row.specialisms).filter(Boolean);
  const gym = pt.gyms;
  const socialLinks = [
    pt.website_url ? { label: 'Website', href: pt.website_url } : null,
    pt.instagram_url ? { label: 'Instagram', href: pt.instagram_url } : null,
    pt.facebook_url ? { label: 'Facebook', href: pt.facebook_url } : null,
  ].filter(Boolean);

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 24 }}>← Back to search</button>

      <div className="form-card" style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              background: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, color: '#fff',
            }}
          >
            {pt.profile_photo_url ? (
              <img src={pt.profile_photo_url} alt={pt.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initials(pt.display_name)
            )}
          </div>
          <div>
            <h2 style={{ fontSize: 30 }}>{pt.display_name}{pt.listing_tier === 'featured' ? ' ★' : ''}</h2>
            <div className="area-line" style={{ marginBottom: 4 }}>
              {gym ? `Trains at ${gym.name} (${gym.postcode})` : `${pt.postcode} · covers ${pt.radius_miles} mi`}
              {pt.rate_gbp ? ` · £${pt.rate_gbp}/session` : ''}
            </div>
            {socialLinks.length > 0 && (
              <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                {socialLinks.map((link) => (
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-dim)' }}>
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {pt.bio && <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', marginBottom: 20 }}>{pt.bio}</p>}

        <div className="pt-tags" style={{ marginBottom: 26 }}>
          {specialismTags.map((s) => (
            <span key={s.id} className="pt-tag">{s.label}</span>
          ))}
        </div>

        {pt.gallery_urls && pt.gallery_urls.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Gallery</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {pt.gallery_urls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt={`${pt.display_name} gallery`}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 4 }}
                />
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={() => setEnquiryOpen(true)}>Enquire</button>
      </div>

      {enquiryOpen && (
        <ProfileEnquiryModal
          pt={pt}
          onClose={() => setEnquiryOpen(false)}
          onSent={() => {
            showToast(`Enquiry sent to ${pt.display_name}. They'll be in touch shortly.`);
            setEnquiryOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ProfileEnquiryModal({ pt, onClose, onSent }) {
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
