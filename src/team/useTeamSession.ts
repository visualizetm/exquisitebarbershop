import { createContext, useCallback, useContext, useEffect } from 'react';
import type { ZodType } from 'zod';
import type { TeamMeResponse } from '@shared/api/team';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi, type ApiState } from '@/lib/useApi';

export type TeamSessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'signedIn'; me: TeamMeResponse };

export interface TeamSessionValue {
  state: TeamSessionState;
  /** Reads the session again, for example right after signing in. */
  refresh: () => Promise<void>;
  /** Marks the session as gone without a request (sign out, or the server said 401). */
  signedOut: () => void;
}

export const TeamSessionContext = createContext<TeamSessionValue | null>(null);

export function useTeamSession(): TeamSessionValue {
  const value = useContext(TeamSessionContext);
  if (!value) throw new Error('useTeamSession must be used inside TeamSessionProvider');
  return value;
}

/** The signed-in barber. Only call from screens behind the sign-in gate. */
export function useTeamMe(): TeamMeResponse {
  const { state } = useTeamSession();
  if (state.status !== 'signedIn') throw new Error('Not signed in');
  return state.me;
}

/**
 * A GET for a portal screen. A 401 means the 12 hours ended (or the owner reset the PIN), so the
 * whole portal goes back to the sign-in screen instead of showing an error.
 */
export function useTeamApi<T>(path: string | null, schema: ZodType<T>, version = 0): ApiState<T> {
  const { signedOut } = useTeamSession();
  const result = useApi(path, schema, { version });
  const lost =
    result.status === 'error' &&
    result.error instanceof ApiRequestError &&
    result.error.code === 'AUTH_REQUIRED';
  useEffect(() => {
    if (lost) signedOut();
  }, [lost, signedOut]);
  return result;
}

/** A write for a portal screen, with the same 401 handling. */
export function useTeamAction() {
  const { signedOut } = useTeamSession();
  return useCallback(
    async <T>(
      path: string,
      schema: ZodType<T>,
      options: {
        method?: 'POST' | 'DELETE';
        body?: unknown;
        headers?: Record<string, string>;
      } = {},
    ): Promise<T> => {
      try {
        return await apiRequest(path, schema, { method: 'POST', ...options });
      } catch (error) {
        // Only a lost session ends the portal; a wrong current PIN is a 401 too and stays on its form.
        if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED') signedOut();
        throw error;
      }
    },
    [signedOut],
  );
}
