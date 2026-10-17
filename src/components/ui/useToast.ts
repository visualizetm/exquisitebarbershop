import { useContext } from 'react';
import type { ToastInput } from './Toast';
import { ToastContext } from './toastContext';

/** Returns a function that shows a toast. Safe to call outside a provider: it then does nothing. */
export function useToast(): (input: ToastInput) => void {
  const show = useContext(ToastContext);
  return show ?? (() => undefined);
}
