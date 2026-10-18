import type { ReactNode } from 'react';

/** One half of the phone bottom bar. A link when it has `to` or `href`, otherwise a button. */
export interface BarAction {
  label: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Makes the button submit that form (the booking details step). */
  form?: string;
  /** ink: white on ink. paper: ink on white. red: white on red, for the final action. */
  tone: 'ink' | 'paper' | 'red';
}

export interface BarConfig {
  left: BarAction;
  right: BarAction;
  /** The thin row above the halves, for example the running total in booking. */
  summary?: ReactNode;
  /** Used by tests and styling: default or booking. */
  mode?: 'default' | 'booking';
}

let current: BarConfig | null = null;
const listeners = new Set<() => void>();

export function getBar(): BarConfig | null {
  return current;
}

export function setBar(next: BarConfig | null): void {
  current = next;
  listeners.forEach((l) => {
    l();
  });
}

export function subscribeBar(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Pages that never show the bar. Prompt 11's barber portal lives under /portal. */
export const NO_BAR_PREFIXES = ['/admin', '/setup', '/team', '/kit', '/portal'] as const;

/** CALL and BOOK NOW, the bar on every public page unless the page says otherwise. */
export function defaultBar(phone: string): BarConfig {
  return {
    left: { label: 'Call', href: `tel:${phone}`, tone: 'ink' },
    right: { label: 'Book now', to: '/book', tone: 'paper' },
  };
}
