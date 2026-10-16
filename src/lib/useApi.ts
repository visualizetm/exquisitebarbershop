import { useEffect, useState } from 'react';
import type { ZodType } from 'zod';
import { apiRequest, type ApiRequestError } from './api';

export type ApiState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiRequestError | Error };

/** Fetches a GET endpoint once per path and exposes a three-state result for data-state attributes. */
export function useApi<T>(path: string | null, schema: ZodType<T>): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    apiRequest(path, schema, { signal: controller.signal })
      .then((data) => {
        setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error : new Error('Request failed'),
        });
      });
    return () => {
      controller.abort();
    };
    // The schema object is stable per call site; only the path should retrigger.
  }, [path, schema]);

  return state;
}
