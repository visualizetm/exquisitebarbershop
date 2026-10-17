import { useCallback, useRef, useState } from 'react';
import type { ConflictResolution } from '@shared/api/admin';
import type { ApiError } from '@shared/api/errors';
import { ApiRequestError } from '@/lib/api';

export type AffectedBooking = NonNullable<ApiError['error']['affected']>[number];

export type ConflictActionState<R> =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'conflict'; affected: AffectedBooking[] }
  | { status: 'done'; result: R }
  | { status: 'error'; error: ApiRequestError | Error };

/**
 * Runs a schedule change that may come back as 409 SCHEDULE_CONFLICT. On a
 * conflict it keeps the affected bookings so the screen can ask the owner what
 * to do with each one, then `resolve` resends exactly the same change with
 * those choices attached.
 */
export function useConflictAction<Q, R>(
  send: (request: Q, resolutions?: ConflictResolution[]) => Promise<R>,
) {
  const [state, setState] = useState<ConflictActionState<R>>({ status: 'idle' });
  const lastRequest = useRef<{ request: Q } | null>(null);

  const execute = useCallback(
    async (request: Q, resolutions?: ConflictResolution[]): Promise<R | null> => {
      setState({ status: 'working' });
      try {
        const result = await send(request, resolutions);
        setState({ status: 'done', result });
        return result;
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'SCHEDULE_CONFLICT') {
          setState({ status: 'conflict', affected: error.affected ?? [] });
        } else {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error('Request failed'),
          });
        }
        return null;
      }
    },
    [send],
  );

  const run = useCallback(
    (request: Q) => {
      lastRequest.current = { request };
      return execute(request);
    },
    [execute],
  );

  const resolve = useCallback(
    (resolutions: ConflictResolution[]) => {
      const last = lastRequest.current;
      return last ? execute(last.request, resolutions) : Promise.resolve(null);
    },
    [execute],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, run, resolve, reset };
}
