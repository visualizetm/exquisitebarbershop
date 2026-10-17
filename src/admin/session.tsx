import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { meResponseSchema } from '@shared/api/auth';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { SessionContext, type SessionState } from './useSession';

async function loadMe(): Promise<SessionState> {
  try {
    const me = await apiRequest('/api/auth/me', meResponseSchema, { fresh: true });
    return { status: 'signedIn', me };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return { status: 'signedOut' };
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not reach the server',
    };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState(await loadMe());
  }, []);
  const signedOut = useCallback(() => {
    setState({ status: 'signedOut' });
  }, []);

  useEffect(() => {
    let live = true;
    void loadMe().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(() => ({ state, refresh, signedOut }), [state, refresh, signedOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
