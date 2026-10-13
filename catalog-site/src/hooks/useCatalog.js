import { useCallback, useEffect, useState } from 'react';
import { loadCatalog } from '../lib/catalog.js';

// Read once at load: App rewrites the URL (dropping unknown params) and StrictMode re-runs effects.
const SIMULATE = import.meta.env.DEV ? new URLSearchParams(location.search).get('simulate') : null;

/**
 * Loads catalog.json. status: 'loading' | 'ready' | 'error'.
 * In dev, ?simulate=loading|error|empty previews those states.
 */
export function useCatalog() {
  const [state, setState] = useState({ status: 'loading', catalog: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    const simulate = SIMULATE;
    setState({ status: 'loading', catalog: null });
    if (simulate === 'loading') return () => ctl.abort();
    loadCatalog(ctl.signal)
      .then((catalog) => {
        if (simulate === 'error' && attempt === 0) throw new Error('simulated');
        if (simulate === 'empty') catalog = { ...catalog, artifacts: [], pluginNames: [], categories: [], changes: [], componentsByPlugin: {} };
        setState({ status: 'ready', catalog });
      })
      .catch((err) => { if (err.name !== 'AbortError') setState({ status: 'error', catalog: null }); });
    return () => ctl.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
