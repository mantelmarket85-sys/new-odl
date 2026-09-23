// ============================================================
//  useApi — tiny data-fetching hook for LMS pages
//  ------------------------------------------------------------
//  Handles loading / error / data state for an async API call and
//  exposes a `reload()` so pages can refresh after mutations.
//
//  Usage:
//    const { data, loading, error, reload } = useApi(() => api.student.courses(), []);
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';

export default function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current();
      setData(res);
      return res;
    } catch (e) {
      setError(e.message || 'Failed to load data');
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load, setData };
}
