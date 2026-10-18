import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

/** Slides up from the bottom on phones and in from the side on desktop. */
export function Sheet(props: {
  open: boolean;
  title: ReactNode;
  size?: 'md' | 'lg';
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  return <Dialog variant="sheet" {...props} />;
}

/** A centered dialog that scales in. For short confirmations. */
export function Modal(props: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  return <Dialog variant="modal" {...props} />;
}
