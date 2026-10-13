/** "today", "5d ago", or "Aug 30" relative to `now` (a Date). */
export function relativeDate(isoDate, now) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - Date.UTC(y, m - 1, d)) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const weekday = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
};

/** Stable hue (0-359) from a plugin name, for its colour dot. */
export function hue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
