import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ToastContext } from './toastContext';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

export interface ToastInput {
  text: string;
  tone?: ToastTone;
  /** An inline action such as Undo. The toast closes after it runs. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it goes away. Toasts with an action stay longer so Undo is usable. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

/** One toast. It leaves after its time, and the clock stops while the pointer or focus is on it. */
function ToastView({ toast, onDone }: { toast: ToastItem; onDone: (id: number) => void }) {
  const remaining = useRef(toast.duration ?? (toast.action ? 7000 : 4000));
  const startedAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const start = useCallback(() => {
    if (timer.current !== undefined) return;
    startedAt.current = Date.now();
    timer.current = window.setTimeout(() => {
      onDone(toast.id);
    }, remaining.current);
  }, [onDone, toast.id]);
  // A toast that appears under a resting pointer is entered before its clock starts; only a
  // running clock has time to take off.
  const pause = useCallback(() => {
    if (timer.current === undefined) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  }, []);

  useEffect(() => {
    start();
    return () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [start]);

  return (
    <div
      className="exq-toast"
      data-tone={toast.tone ?? 'neutral'}
      role="status"
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <span className="exq-toast__text">{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          className="exq-toast__action"
          onClick={() => {
            toast.action?.onClick();
            onDone(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = next.current++;
    setItems((prev) => [...prev.slice(-2), { ...input, id }]);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="exq-toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <ToastView key={t.id} toast={t} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
