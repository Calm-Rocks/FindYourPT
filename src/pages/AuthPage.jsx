import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

export default function AuthPage() {
  const { signUp, signIn } = useAuth();
  const showToast = useToast();
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        showToast('Account created — check your email to confirm, then log in.');
        setMode('login');
      } else {
        await signIn(email.trim(), password);
        showToast('Logged in.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hero" style={{ paddingBottom: 56, borderBottom: 'none' }}>
      <div className="wrap" style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 40 }}>List your <em>specialism</em>, get found.</h1>
        <p className="sub" style={{ margin: '16px auto 0', maxWidth: 380 }}>
          {mode === 'signup'
            ? 'Create a trainer account to set up your listing.'
            : 'Log in to manage your listing and view enquiries.'}
        </p>

        <div className="form-card" style={{ marginTop: 32, textAlign: 'left' }}>
          <h2>{mode === 'signup' ? 'Create your account' : 'Log in'}</h2>
          <p className="form-sub">
            {mode === 'signup'
              ? 'Your account is your listing — one login per trainer.'
              : "Don't have an account yet?"}{' '}
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => setMode('signup')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-dim)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Sign up instead
              </button>
            )}
            {mode === 'signup' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: 'var(--accent-dim)', fontWeight: 600, cursor: 'pointer', padding: 0, marginLeft: 4 }}
              >
                Already have one? Log in
              </button>
            )}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label className="field-label" htmlFor="auth-email">Email</label>
              <input type="email" id="auth-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="form-row">
              <label className="field-label" htmlFor="auth-password">Password</label>
              <input type="password" id="auth-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              <p className="hint">At least 6 characters.</p>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
