import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchOwnVerificationStatus } from './api';

// Lightweight hook rather than a full context — admin status is only
// needed in a couple of places (nav visibility, route gating), so a
// shared context would be more machinery than this needs. Re-fetches
// whenever the logged-in user changes.
export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchOwnVerificationStatus(user.id)
      .then((data) => { if (!cancelled) setIsAdmin(data?.is_admin ?? false); })
      .catch(() => { if (!cancelled) setIsAdmin(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  return { isAdmin, loading };
}
