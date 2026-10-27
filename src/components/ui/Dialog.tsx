import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import XClose from '@untitled-ui/icons-react/build/esm/XClose';

export type DialogVariant = 'sheet' | 'modal' | 'lightbox' | 'full';

/** How long the exit transition runs (--d-fast), so content stays until the dialog has left. */
function exitMs(): number {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--d-fast').trim();
  return parseFloat(raw) || 0;
}

/**
 * The one overlay, on the native dialog element (focus trap, Escape and focus restore for free).
 * sheet: from the bottom on phones, from the side on desktop. modal: centered, scales in.
 * lightbox: the dark photo viewer. full: the whole screen on ink (the booking flow). Closing is
 * faster than opening (see motion.css).
 */
export function Dialog({
  variant,
  open,
  title,
  size = 'md',
  onClose,
  children,
  closeLabel = 'Close',
  hideTitle = false,
}: {
  variant: DialogVariant;
  open: boolean;
  title: ReactNode;
  size?: 'md' | 'lg';
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  // Content stays mounted until the exit transition has finished.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setMounted(true);
      if (!dialog.open) {
        dialog.showModal();
        titleRef.current?.focus();
      }
      document.documentElement.setAttribute('data-dialog', 'open');
      return () => {
        document.documentElement.removeAttribute('data-dialog');
      };
    }
    if (dialog.open) dialog.close();
    const id = window.setTimeout(() => {
      setMounted(false);
    }, exitMs());
    return () => {
      window.clearTimeout(id);
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="exq-dialog"
      data-variant={variant}
      data-size={size}
      data-state={open ? 'open' : 'closed'}
      aria-labelledby={titleId}
      onClose={(event) => {
        // A dialog nested inside this one (a confirm over the booking flow) closes on its own.
        if (event.target === ref.current) onClose();
      }}
      onCancel={(event) => {
        if (event.target !== ref.current) return;
        // Escape asks the owner of the dialog, which may keep it open (a half-entered booking).
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself, not on its content.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="exq-dialog__inner">
        <div className="exq-dialog__head">
          <h2
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className={`exq-dialog__title${hideTitle ? ' exq-visually-hidden' : ''}`}
          >
            {title}
          </h2>
          <button
            type="button"
            className="exq-dialog__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <XClose aria-hidden="true" />
          </button>
        </div>
        {open || mounted ? children : null}
      </div>
    </dialog>
  );
}
