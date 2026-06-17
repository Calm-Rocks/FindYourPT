import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: '', show: false, error: false });
  const timerRef = useRef(null);

  const showToast = useCallback((message, { error = false } = {}) => {
    setToast({ message, show: true, error });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, show: false }));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast${toast.show ? ' show' : ''}${toast.error ? ' error' : ''}`} role="status" aria-live="polite">
        {toast.message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
