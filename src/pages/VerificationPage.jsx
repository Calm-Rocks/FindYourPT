import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { fetchOwnVerificationStatus, fetchOwnLatestSubmission, submitVerification } from '../lib/api';
import { uploadVerificationDoc } from '../lib/documentUpload';

const STATUS_COPY = {
  unverified: {
    title: 'Get verified',
    body: 'Upload your PT qualification certificate and proof of public liability insurance. Once approved, your listing becomes visible to clients searching FindYourPT.',
  },
  pending: {
    title: 'Verification pending',
    body: 'Your documents have been submitted and are awaiting review. This usually takes a few days. You\'ll be able to see the outcome here once reviewed.',
  },
  approved: {
    title: 'You\'re verified',
    body: 'Your qualification and insurance have been confirmed. Your listing is visible to clients.',
  },
  rejected: {
    title: 'Verification was not approved',
    body: 'Your last submission could not be approved. Check the reason below, then submit updated documents.',
  },
};

export default function VerificationPage({ onNavigate }) {
  const { user } = useAuth();
  const showToast = useToast();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('unverified');
  const [rejectionReason, setRejectionReason] = useState(null);
  const [latestSubmission, setLatestSubmission] = useState(null);

  const [certificateFile, setCertificateFile] = useState(null);
  const [insuranceFile, setInsuranceFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [statusData, submission] = await Promise.all([
          fetchOwnVerificationStatus(user.id),
          fetchOwnLatestSubmission(user.id),
        ]);
        setStatus(statusData?.verification_status ?? 'unverified');
        setRejectionReason(statusData?.verification_rejection_reason ?? null);
        setLatestSubmission(submission);
      } catch (err) {
        showToast('Could not load verification status — try refreshing.', { error: true });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!certificateFile || !insuranceFile) {
      setError('Both your certificate and insurance document are required.');
      return;
    }

    setSubmitting(true);
    try {
      const certificatePath = await uploadVerificationDoc(user.id, certificateFile, 'certificate');
      const insurancePath = await uploadVerificationDoc(user.id, insuranceFile, 'insurance');

      await submitVerification({
        userId: user.id,
        certificateUrl: certificatePath,
        insuranceUrl: insurancePath,
      });

      setStatus('pending');
      setCertificateFile(null);
      setInsuranceFile(null);
      showToast('Documents submitted — we\'ll review them and update your status here.');
    } catch (err) {
      setError(err.message || 'Could not submit your documents — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="wrap"><p className="loading-text">Loading…</p></div>;
  }

  const copy = STATUS_COPY[status] ?? STATUS_COPY.unverified;
  const canSubmit = status === 'unverified' || status === 'rejected';

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-ghost" style={{ marginBottom: 20 }} onClick={() => onNavigate('dashboard')}>
        ← Back to dashboard
      </button>

      <div className="form-card">
        <h2>{copy.title}</h2>
        <p className="form-sub">{copy.body}</p>

        {status === 'rejected' && rejectionReason && (
          <div className="pricing-note" style={{ background: 'var(--danger)' }}>
            <strong>Reason:</strong> {rejectionReason}
          </div>
        )}

        {!canSubmit && latestSubmission && (
          <p className="hint" style={{ marginTop: 16 }}>
            Last submitted {new Date(latestSubmission.created_at).toLocaleDateString()}.
          </p>
        )}

        {canSubmit && (
          <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
            <div className="form-row">
              <label className="field-label" htmlFor="cert-file">PT qualification certificate</label>
              <input
                type="file"
                id="cert-file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)}
              />
              <p className="hint">PDF, JPEG, or PNG, up to 10MB.</p>
            </div>

            <div className="form-row">
              <label className="field-label" htmlFor="insurance-file">Public liability insurance</label>
              <input
                type="file"
                id="insurance-file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setInsuranceFile(e.target.files?.[0] ?? null)}
              />
              <p className="hint">PDF, JPEG, or PNG, up to 10MB.</p>
            </div>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
