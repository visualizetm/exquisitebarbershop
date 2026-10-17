import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ToastContext } from './toastContext';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface ToastInput {
  text: string;
  tone?: ToastTone;
  /** An inline action such as Undo. The toast closes after it runs. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it goes away. Toasts with an action stay longer. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = next.current++;
      setItems((prev) => [...prev.slice(-2), { ...input, id }]);
      const ms = input.duration ?? (input.action ? 7000 : 4000);
      window.setTimeout(() => {
        dismiss(id);
      }, ms);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="exq-toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className="exq-toast" data-tone={t.tone ?? 'neutral'} role="status">
            <span className="exq-toast__text">{t.text}</span>
            {t.action ? (
              <button
                type="button"
                className="exq-toast__action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
