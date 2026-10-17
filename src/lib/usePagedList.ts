import { useCallback, useEffect, useState } from 'react';
import type { ZodType } from 'zod';
import { apiRequest } from '@/lib/api';

/** Loads the first page for a query and appends further pages by cursor. */
export function usePagedList<T, P extends { nextCursor: string | null }>(
  basePath: string,
  query: string,
  schema: ZodType<P>,
  pick: (page: P) => T[],
  version = 0,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [page, setPage] = useState<P | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    apiRequest(`${basePath}?${query}`, schema, { signal: controller.signal, fresh: true })
      .then((first) => {
        setRows(pick(first));
        setPage(first);
        setCursor(first.nextCursor);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err);
        setStatus('error');
      });
    return () => {
      controller.abort();
    };
  }, [basePath, query, schema, version]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const params = new URLSearchParams(query);
    params.set('cursor', cursor);
    try {
      const page = await apiRequest(`${basePath}?${params.toString()}`, schema);
      setRows((prev) => [...prev, ...pick(page)]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    }
  }, [basePath, query, schema, cursor]);

  return { rows, page, status, error, hasMore: cursor !== null, loadMore };
}
