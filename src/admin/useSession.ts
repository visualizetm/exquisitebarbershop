import { createContext, useContext } from 'react';
import type { MeResponse } from '@shared/api/auth';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error'; message: string }
  | { status: 'signedIn'; me: MeResponse };

export interface SessionValue {
  state: SessionState;
  /** Reloads the signed-in login, for example after signing in or changing the password. */
  refresh: () => Promise<void>;
  /** Marks the session as gone without a request, for example after signing out. */
  signedOut: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** The signed-in login. Only call from screens rendered behind the sign-in gate. */
export function useMe(): MeResponse {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('Not signed in');
  return state.me;
}
