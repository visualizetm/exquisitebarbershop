import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { teamMeResponseSchema } from '@shared/api/team';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { TeamSessionContext, type TeamSessionState } from './useTeamSession';

export function TeamSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TeamSessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const me = await apiRequest('/api/team/me', teamMeResponseSchema, { fresh: true });
      setState({ status: 'signedIn', me });
    } catch (error) {
      setState(
        error instanceof ApiRequestError && error.status === 401
          ? { status: 'signedOut' }
          : { status: 'error' },
      );
    }
  }, []);
  const signedOut = useCallback(() => {
    setState({ status: 'signedOut' });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ state, refresh, signedOut }), [state, refresh, signedOut]);
  return <TeamSessionContext.Provider value={value}>{children}</TeamSessionContext.Provider>;
}
