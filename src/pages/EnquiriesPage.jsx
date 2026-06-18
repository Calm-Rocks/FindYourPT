import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { fetchOwnEnquiries } from '../lib/api';

export default function EnquiriesPage({ onNavigate }) {
  const { user } = useAuth();
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [enquiries, setEnquiries] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchOwnEnquiries(user.id);
        setEnquiries(data);
      } catch (err) {
        showToast('Could not load enquiries — try refreshing.', { error: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id]);

  if (loading) {
    return <div className="wrap"><p className="loading-text">Loading enquiries…</p></div>;
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

      <h1 style={{ fontSize: 32, marginBottom: 24 }}>Enquiries</h1>

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
