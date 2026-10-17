import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import XClose from '@untitled-ui/icons-react/build/esm/XClose';

/**
 * A modal that slides up from the bottom on phones and sits centered on larger
 * screens. Built on the native dialog element, which traps focus, closes on
 * Escape and restores focus to the opener for free.
 */
export function Sheet({
  open,
  title,
  size = 'md',
  onClose,
  children,
  closeLabel = 'Close',
}: {
  open: boolean;
  title: ReactNode;
  size?: 'md' | 'lg';
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="exq-sheet"
      data-size={size}
      data-state={open ? 'open' : 'closed'}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself, not on its content.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="exq-sheet__inner">
        <div className="exq-sheet__head">
          <h2 id={titleId} className="exq-sheet__title">
            {title}
          </h2>
          <button
            type="button"
            className="exq-sheet__close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <XClose aria-hidden="true" />
          </button>
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}
