import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { meResponseSchema } from '@shared/api/auth';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { SessionContext, type SessionState } from './useSession';

/**
 * The session cookie is HttpOnly, so the page cannot see it. This flag remembers
 * that a sign-in happened on this browser, so a visitor who never signed in
 * goes straight to the sign-in form without a 401 in the console.
 */
const SIGNED_IN_HINT = 'exq-signed-in';

function readHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return true;
  }
}

function writeHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT, '1');
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    // Private mode or blocked storage: the probe simply runs every time.
  }
}

async function loadMe(options: { probe: boolean }): Promise<SessionState> {
  if (!options.probe && !readHint()) return { status: 'signedOut' };
  try {
    const me = await apiRequest('/api/auth/me', meResponseSchema, { fresh: true });
    writeHint(true);
    return { status: 'signedIn', me };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      writeHint(false);
      return { status: 'signedOut' };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not reach the server',
    };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  // Called right after a sign-in, so it always asks the server.
  const refresh = useCallback(async () => {
    setState(await loadMe({ probe: true }));
  }, []);
  const signedOut = useCallback(() => {
    writeHint(false);
    setState({ status: 'signedOut' });
  }, []);

  useEffect(() => {
    let live = true;
    void loadMe({ probe: false }).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(() => ({ state, refresh, signedOut }), [state, refresh, signedOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
