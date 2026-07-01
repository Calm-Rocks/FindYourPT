import { useState, useRef, useEffect } from 'react';
import { resolvePostcode } from '../lib/postcode';
import { searchPts, submitEnquiry } from '../lib/api';
import { useToast } from '../lib/ToastContext';

// Derive the Edge Function URL from the existing Supabase URL env var
// so we don't have to hardcode the project ref anywhere in the codebase.
const CHAT_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-chat`;

// Specialism slug → id mapping — mirrors what's in the database from
// migration 0001 so the AI's tool call can specify by slug and we resolve
// to the numeric id the search function expects, without a round-trip fetch.
const SPECIALISM_MAP = {
  hypertrophy: 1,
  weight_loss: 2,
  strength_powerlift: 3,
  gymnastics: 4,
  pre_post_natal: 5,
  sports_performance: 6,
  mobility_rehab: 7,
  older_adults: 8,
  nutrition: 9,
};

// The tool definition given to Claude — describes the search_pts function
// in terms the model can reason about, including what each parameter means
// and the valid specialism slugs it can pick from. Keeping this explicit
// prevents the model from inventing slug names that don't exist.
const SEARCH_TOOL = {
  name: 'search_trainers',
  description: `Search for verified personal trainers near a UK location. Call this once you know the client's location and at least one training goal. You can also call it with no specialism filter to show all trainers nearby. Always resolve the location before calling — pass the postcode or place name as 'location', not coordinates (the tool resolves it). Pass client_max_distance_miles only if the client mentioned a specific distance preference; otherwise omit it to show all trainers regardless of distance.`,
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'UK postcode (e.g. "LE1 2AB") or place name (e.g. "Leicester") the client wants to train near.',
      },
      specialisms: {
        type: 'array',
        items: {
          type: 'string',
          enum: Object.keys(SPECIALISM_MAP),
        },
        description: 'List of specialism slugs matching the client\'s goals. Can be empty to show all trainers.',
      },
      client_max_distance_miles: {
        type: 'number',
        description: 'Maximum distance in miles the client is willing to travel. Omit to show all distances.',
      },
    },
    required: ['location', 'specialisms'],
  },
};

const SYSTEM_PROMPT = `You are SpotMyPT's PT-matching assistant. Your job is to have a short, friendly conversation with someone looking for a personal trainer, understand what they need, and then search for the best-matched trainers near them.

CONVERSATION APPROACH:
- Be warm, concise, and direct. No filler phrases.
- Ask one question at a time — never list multiple questions in one message.
- You need to know: (1) their location, (2) their main goal or what they want to achieve.
- Optionally useful: fitness experience level, any injuries or specific needs, how far they'd travel.
- Once you have location + at least one goal, you have enough to search. Don't keep asking if you can already search.
- If someone gives you everything upfront in one message, search immediately — don't ask questions you already have answers to.

GOAL → SPECIALISM MAPPING (use your judgment, these are guidelines):
- Lose weight / fat loss / slim down → weight_loss, nutrition
- Build muscle / get bigger / hypertrophy → hypertrophy
- Get stronger / powerlifting / deadlift → strength_powerlift
- Gymnastics / handstands / rings / calisthenics → gymnastics
- Pregnant / post-birth / post-natal → pre_post_natal
- Sport-specific / football / rugby / athletics → sports_performance
- Rehab / injury / back pain / mobility → mobility_rehab
- Older / senior / 50+ / gentle → older_adults
- Nutrition / diet / eating → nutrition
- General fitness / get fit / tone up → weight_loss, hypertrophy (use judgment)
- First time / beginner / never trained → weight_loss or hypertrophy depending on context

SEARCHING:
- Call search_trainers when you have location + goals. Don't delay.
- After getting search results (via tool result), present the trainers naturally in your response. The UI will render the actual trainer cards — your job is to write a brief intro sentence or two explaining why these trainers match, then end your message with exactly this marker on its own line: [SHOW_RESULTS]
- If no trainers are found, say so honestly and suggest broadening the search (e.g. wider distance, different specialism) then offer to search again.
- NEVER invent trainer details, names, rates, or qualifications. Only describe what the search actually returned.
- If someone asks about a specific trainer from the results, you can answer questions based on what was returned but make clear you're describing their listing, not guaranteeing anything.

IMPORTANT:
- You are not a PT yourself and cannot give fitness or medical advice.
- If someone describes a medical condition or injury, recommend they discuss training with their doctor or physio, and note that SpotMyPT has trainers who specialise in rehab and mobility.
- Keep responses short — this is a chat, not an essay. Two to four sentences maximum per message unless presenting results.`;

function TypingIndicator() {
  return (
    <div className="ai-msg assistant">
      <div className="ai-msg-avatar">S</div>
      <div className="ai-msg-bubble">
        <div className="ai-msg-typing">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function PtResultCard({ pt, onEnquire }) {
  const locationLine = pt.match_via === 'gym' && pt.gym_name
    ? `Trains at ${pt.gym_name}`
    : `${pt.postcode} · covers ${pt.radius_miles} mi`;

  return (
    <div className="pt-card-compact" style={{ cursor: 'default' }}>
      <div className="avatar" style={{ overflow: 'hidden', width: 52, height: 52, fontSize: 18 }}>
        {pt.profile_photo_url
          ? <img src={pt.profile_photo_url} alt={pt.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials(pt.display_name)}
      </div>
      <div className="pt-info">
        <h3 style={{ fontSize: 17, marginBottom: 3 }}>{pt.display_name}{pt.listing_tier === 'featured' ? ' ★' : ''}</h3>
        <div className="area-line" style={{ fontSize: 12, marginBottom: 6 }}>{locationLine}</div>
        <div className="pt-tags">
          {pt.specialisms.slice(0, 2).map(s => (
            <span key={s.id} className="pt-tag" style={{ fontSize: 10.5, padding: '3px 8px' }}>{s.label}</span>
          ))}
          {pt.specialisms.length > 2 && (
            <span className="pt-tag" style={{ fontSize: 10.5, padding: '3px 8px', background: 'var(--steel)' }}>+{pt.specialisms.length - 2}</span>
          )}
        </div>
      </div>
      <div className="stat-col" style={{ textAlign: 'right' }}>
        <div className="distance" style={{ fontSize: 17 }}>{pt.distance_miles.toFixed(1)}<small> mi</small></div>
        {pt.rate_gbp ? <div className="rate" style={{ fontSize: 12 }}>£{pt.rate_gbp}/session</div> : null}
        <button className="enquire-btn" onClick={() => onEnquire(pt)}>Enquire</button>
      </div>
    </div>
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
      await submitEnquiry({ ptId: pt.id, clientName: name.trim(), clientContact: contact.trim(), message: message.trim() });
      onSent();
    } catch {
      setError('Could not send your enquiry — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay show" onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }}>
      <div className="modal">
        <h3>Enquire with {pt.display_name}</h3>
        <p>Your contact details go straight to {pt.display_name} so they can reach out directly.</p>
        <div className="form-row">
          <label className="field-label" htmlFor="ai-enq-name">Your name</label>
          <input type="text" id="ai-enq-name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="ai-enq-contact">Email or phone</label>
          <input type="text" id="ai-enq-contact" value={contact} onChange={e => setContact(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="ai-enq-msg">Message (optional)</label>
          <textarea id="ai-enq-msg" value={message} onChange={e => setMessage(e.target.value)} placeholder="What are you hoping to work on?" />
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

export default function AiSearchPage({ onBack }) {
  const showToast = useToast();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // messages: array of { role: 'assistant' | 'user', content: string, results?: PT[] }
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm here to help you find the right personal trainer. Where are you based, and what are you hoping to achieve?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [enquiryTarget, setEnquiryTarget] = useState(null);

  // The raw API conversation history — separate from display messages since
  // it includes tool-use and tool-result blocks that we don't render directly.
  const apiHistoryRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function executeTool(toolInput) {
    // 1. Resolve the location text to coordinates
    const resolved = await resolvePostcode(toolInput.location);

    // 2. Map specialism slugs to numeric ids
    const specialismIds = (toolInput.specialisms || [])
      .map(slug => SPECIALISM_MAP[slug])
      .filter(Boolean);

    // 3. Run the actual search against the real database
    const results = await searchPts({
      lat: resolved.lat,
      lon: resolved.lon,
      specialismIds,
      ignoreRadius: !toolInput.client_max_distance_miles,
      clientMaxDistance: toolInput.client_max_distance_miles ?? null,
    });

    return results;
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMessage = { role: 'assistant', content: text };
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    // Build the new API history entry
    const newApiHistory = [
      ...apiHistoryRef.current,
      { role: 'user', content: text },
    ];
    apiHistoryRef.current = newApiHistory;

    setLoading(true);
    try {
      const response = await fetch(CHAT_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          tools: [SEARCH_TOOL],
          messages: newApiHistory,
        }),
      });

      const data = await response.json();

      // Handle tool use if the model decided to search
      if (data.stop_reason === 'tool_use') {
        const toolUseBlock = data.content.find(b => b.type === 'tool_use');
        const textBlock = data.content.find(b => b.type === 'text');

        // Show any text the model emitted before the tool call
        if (textBlock?.text) {
          setMessages(prev => [...prev, { role: 'assistant', content: textBlock.text }]);
        }

        // Execute the search tool
        let searchResults = [];
        let toolResultContent;
        try {
          searchResults = await executeTool(toolUseBlock.input);
          toolResultContent = JSON.stringify(searchResults.map(pt => ({
            id: pt.id,
            display_name: pt.display_name,
            postcode: pt.postcode,
            distance_miles: pt.distance_miles,
            rate_gbp: pt.rate_gbp,
            listing_tier: pt.listing_tier,
            gym_name: pt.gym_name,
            specialisms: pt.specialisms?.map(s => s.label) ?? [],
            bio: pt.bio,
          })));
        } catch (err) {
          toolResultContent = JSON.stringify({ error: 'Could not search at that location. Please try again.' });
        }

        // Build the updated API history with the tool result
        const historyWithTool = [
          ...apiHistoryRef.current,
          { role: 'assistant', content: data.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResultContent }] },
        ];
        apiHistoryRef.current = historyWithTool;

        // Get the model's response now that it has the search results
        const followUp = await fetch(CHAT_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            tools: [SEARCH_TOOL],
            messages: historyWithTool,
          }),
        });

        const followUpData = await followUp.json();
        const followUpText = followUpData.content.find(b => b.type === 'text')?.text ?? '';

        // Update API history with the follow-up response
        apiHistoryRef.current = [...historyWithTool, { role: 'assistant', content: followUpData.content }];

        // If the model used [SHOW_RESULTS] marker, render cards inline
        if (followUpText.includes('[SHOW_RESULTS]')) {
          const displayText = followUpText.replace('[SHOW_RESULTS]', '').trim();
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: displayText,
            results: searchResults,
          }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: followUpText }]);
        }

      } else {
        // No tool use — plain text response
        const textContent = data.content.find(b => b.type === 'text')?.text ?? '';
        apiHistoryRef.current = [...apiHistoryRef.current, { role: 'assistant', content: data.content }];
        setMessages(prev => [...prev, { role: 'assistant', content: textContent }]);
      }

    } catch (err) {
      showToast('Something went wrong — please try again.', { error: true });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      <div className="ai-chat-wrap">
        <div className="ai-chat-header">
          <button onClick={onBack}>← Back</button>
          <span style={{ fontSize: 14, color: 'var(--steel)' }}>AI-powered PT finder</span>
        </div>

        <div className="ai-chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`ai-msg ${msg.role}`}>
              <div className="ai-msg-avatar">
                {msg.role === 'assistant' ? 'S' : 'Y'}
              </div>
              <div>
                {msg.content && (
                  <div className="ai-msg-bubble">{msg.content}</div>
                )}
                {msg.results && msg.results.length > 0 && (
                  <div style={{ marginTop: 10, maxWidth: '100%' }}>
                    <p className="ai-results-intro">
                      {msg.results.length} {msg.results.length === 1 ? 'trainer' : 'trainers'} found near you
                    </p>
                    <div className="ai-result-cards">
                      {msg.results.map(pt => (
                        <PtResultCard key={pt.id} pt={pt} onEnquire={setEnquiryTarget} />
                      ))}
                    </div>
                  </div>
                )}
                {msg.results && msg.results.length === 0 && (
                  <div className="ai-msg-bubble" style={{ marginTop: 8, background: 'var(--paper)', color: 'var(--ink)' }}>
                    No trainers found matching those criteria.
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="ai-input-bar">
        <div className="ai-input-bar-inner">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type your message…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </button>
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
