import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from './useMediaQuery.js';

const KEY = 'ddm-theme';

function savedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

/** Theme = saved choice, otherwise the OS setting. Applied as data-theme on <html>. */
export function useTheme() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [pref, setPref] = useState(savedTheme);
  const theme = pref ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* storage may be blocked */ }
    setPref(next);
  }, [theme]);

  return { theme, toggle };
}
