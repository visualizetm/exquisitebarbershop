import { createContext } from 'react';
import type { ToastInput } from './Toast';

export const ToastContext = createContext<((input: ToastInput) => void) | null>(null);
