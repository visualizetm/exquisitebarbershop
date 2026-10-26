import { useCallback, useEffect, useRef, useState } from 'react';
import { floorResponseSchema, type FloorResponse } from '@shared/api/admin';
import { apiRequest } from '@/lib/api';

const REFRESH_MS = 30_000;

/**
 * The floor, kept live: loaded on mount and whenever `version` changes, refreshed every 30
 * seconds while the tab is visible and again when it comes back, and after any action through
 * `refresh`. A refresh keeps the last data on screen; only the first load shows a skeleton.
 */
export function useFloor(version: number): {
  data: FloorResponse | null;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<FloorResponse | null>(null);
  const [error, setError] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    try {
      const next = await apiRequest('/api/admin/floor', floorResponseSchema, { fresh: true });
      if (mine !== latest.current) return;
      setData(next);
      setError(false);
    } catch {
      if (mine !== latest.current) return;
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    const id = window.setInterval(() => {
      if (visible()) void refresh();
    }, REFRESH_MS);
    const onVisibility = () => {
      if (visible()) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return { data, error, refresh };
}
