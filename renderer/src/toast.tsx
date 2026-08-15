import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ToastState {
  message: string;
  kind: 'info' | 'err';
}

const ToastContext = createContext<(message: string, kind?: 'info' | 'err') => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((message: string, kind: 'info' | 'err' = 'info') => {
    setToast({ message, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), kind === 'err' ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'err' ? 'err' : ''}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}
