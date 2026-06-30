import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { useIsAdmin } from '../lib/useIsAdmin';
import { fetchPendingSubmissions, approveSubmission, rejectSubmission, getSignedDocumentUrl } from '../lib/api';

export default function AdminReviewPage({ onNavigate }) {
  const { user } = useAuth();
  const showToast = useToast();
  const { isAdmin, loading: adminCheckLoading } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (adminCheckLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadQueue();
  }, [adminCheckLoading, isAdmin]);

  async function loadQueue() {
    setLoading(true);
    try {
      const data = await fetchPendingSubmissions();
      setSubmissions(data);
    } catch (err) {
      showToast('Could not load the review queue.', { error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleViewDoc(path) {
    try {
      const url = await getSignedDocumentUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast('Could not load that document.', { error: true });
    }
  }

  async function handleApprove(submission) {
    try {
      await approveSubmission({ submissionId: submission.id, ptId: submission.pt_id, adminId: user.id });
      showToast(`${submission.pts?.display_name ?? 'Trainer'} approved.`);
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
    } catch (err) {
      showToast('Could not approve this submission.', { error: true });
    }
  }

  function startReject(submissionId) {
    setRejectingId(submissionId);
    setRejectionReason('');
  }

  async function handleConfirmReject(submission) {
    if (!rejectionReason.trim()) {
      showToast('Enter a reason so the trainer knows what to fix.', { error: true });
      return;
    }
    try {
      await rejectSubmission({
        submissionId: submission.id,
        ptId: submission.pt_id,
        adminId: user.id,
        reason: rejectionReason.trim(),
      });
      showToast(`${submission.pts?.display_name ?? 'Trainer'}'s submission rejected.`);
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      setRejectingId(null);
    } catch (err) {
      showToast('Could not reject this submission.', { error: true });
    }
  }

  if (adminCheckLoading || loading) {
    return <div className="wrap"><p className="loading-text">Loading…</p></div>;
  }

  // Hard gate: even though the nav link is hidden for non-admins, this
  // page must independently refuse to render anything if somehow reached
  // directly (e.g. a saved URL). The actual data protection is the RLS
  // policy on verification_submissions — a non-admin's fetchPendingSubmissions
  // call would simply return nothing — but showing a clear message here
  // is better UX than a silently empty queue that looks like a bug.
  if (!isAdmin) {
    return (
      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <div className="empty-state">
          <h3>Not authorized</h3>
          <p>This page is only available to FindYourPT admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-ghost" style={{ marginBottom: 20 }} onClick={() => onNavigate('dashboard')}>
        ← Back to dashboard
      </button>

      <h1 style={{ fontSize: 32, marginBottom: 6 }}>Verification review queue</h1>
      <p className="hint" style={{ marginBottom: 28 }}>{submissions.length} pending</p>

      {submissions.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing to review</h3>
          <p>New submissions will appear here.</p>
        </div>
      ) : (
        submissions.map((sub) => (
          <div key={sub.id} className="enquiry-row" style={{ marginBottom: 16 }}>
            <div className="top-line">
              <span className="name">{sub.pts?.display_name ?? 'Unknown trainer'}</span>
              <span className="date">{new Date(sub.created_at).toLocaleDateString()}</span>
            </div>
            <div className="contact">{sub.pts?.postcode}</div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn-ghost on-light" onClick={() => handleViewDoc(sub.certificate_url)}>
                View certificate
              </button>
              <button className="btn-ghost on-light" onClick={() => handleViewDoc(sub.insurance_url)}>
                View insurance
              </button>
            </div>

            {rejectingId === sub.id ? (
              <div style={{ marginTop: 14 }}>
                <textarea
                  placeholder="Reason for rejection (shown to the trainer)"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn-ghost on-light" onClick={() => setRejectingId(null)}>Cancel</button>
                  <button className="btn-primary" onClick={() => handleConfirmReject(sub)}>Confirm rejection</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={() => handleApprove(sub)}>Approve</button>
                <button className="btn-danger-text" onClick={() => startReject(sub.id)}>Reject</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
