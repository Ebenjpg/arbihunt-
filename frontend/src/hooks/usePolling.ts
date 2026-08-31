import { useEffect, useRef, useState, useCallback } from 'react';

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const saved = useRef(fetcher);
  saved.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await saved.current();
      setData(result);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e as Error);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const fn = saved.current;
      let result: T;
      let err: Error | null = null;
      try {
        result = await fn();
        if (!alive) return;
        setData(result);
        setError(null);
      } catch (e) {
        err = e as Error;
      }
      if (!alive) return;
      setError(err);
      setLoading(false);
    };
    void run();
    const timer = setInterval(() => void run(), intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error, loading, refresh };
}