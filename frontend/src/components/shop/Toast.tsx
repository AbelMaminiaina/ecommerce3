'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  addToast: (type: ToastType, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

const styles: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: 'bg-primary', icon: 'bi-check-circle-fill' },
  error: { bg: 'bg-danger', icon: 'bi-exclamation-circle-fill' },
  info: { bg: 'bg-dark', icon: 'bi-info-circle-fill' },
  warning: { bg: 'bg-warning', icon: 'bi-exclamation-triangle-fill' },
};

// Toasts Bootstrap (.toast) : mêmes composants que la maquette, empilés en bas à droite.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 3500) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-3), { id, type, message }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container position-fixed bottom-0 end-0 p-3 sw-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);
  const style = styles[toast.type];

  return (
    <div
      role="status"
      className={`toast align-items-center text-white border-0 mb-2 ${style.bg} ${visible ? 'show' : ''}`}
    >
      <div className="d-flex">
        <div className="toast-body">
          <i className={`bi ${style.icon} me-2`} aria-hidden="true"></i>
          {toast.message}
        </div>
        <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Fermer" onClick={onClose} />
      </div>
    </div>
  );
}
