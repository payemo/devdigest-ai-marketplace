import { useMemo } from 'react';
import { GH } from '../config.js';
import { t } from '../i18n/index.js';
import { hue, weekday } from '../lib/format.js';
import { ExtMark } from './Icons.jsx';

const MARKETPLACE = '(marketplace)'; // internal id for repo-level changes; its label comes from the locale file

/** Commits grouped by day (newest first); a commit touching several plugins appears once per plugin. */
function groupByDay(changes, plugin) {
  const rows = [];
  for (const c of changes) for (const p of c.plugins.length ? c.plugins : [MARKETPLACE]) rows.push({ ...c, plugin: p });
  const byDay = new Map();
  for (const r of plugin ? rows.filter((x) => x.plugin === plugin) : rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }
  return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export default function Changelog({ catalog, plugin, onPlugin }) {
  const days = useMemo(() => groupByDay(catalog.changes, plugin), [catalog.changes, plugin]);
  const label = (p) => (p === MARKETPLACE ? t('changelog.marketplace') : p);

  return (
    <div className="changelog wrap">
      <div className="changelog-head">
        <div>
          <h1>{t('changelog.title')}</h1>
          <p className="muted">{t('changelog.subtitle')}</p>
        </div>
        <a className="btn" href="feed.xml">{t('changelog.feed')}<ExtMark /></a>
      </div>
      <label className="field">
        {t('changelog.filter')}
        <select value={plugin} onChange={(e) => onPlugin(e.target.value)}>
          <option value="">{t('changelog.allPlugins')}</option>
          <option value={MARKETPLACE}>{label(MARKETPLACE)}</option>
          {catalog.pluginNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {days.length === 0 && <p className="muted">{t('changelog.none')}</p>}
      {days.map(([date, rows]) => (
        <section key={date} aria-labelledby={`d-${date}`}>
          <h2 id={`d-${date}`} className="day">{date} <span>{weekday(date)}</span></h2>
          <ul className="change-list">
            {rows.map((r) => (
              <li key={`${r.sha}:${r.plugin}`}>
                <span className="change-plugin">
                  <span className="dot" aria-hidden="true" style={r.plugin === MARKETPLACE ? { background: 'var(--muted)' } : { '--h': hue(r.plugin) }} />
                  <button type="button" onClick={() => onPlugin(r.plugin)} title={t('changelog.showOnly', { plugin: label(r.plugin) })}>
                    {label(r.plugin)}
                  </button>
                </span>
                <span className="change-subject">{r.subject}</span>
                <a className="sha" href={`${GH}/commit/${r.sha}`} target="_blank" rel="noopener" aria-label={t('changelog.commitAria', { sha: r.sha })}>{r.sha}<ExtMark /></a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">{t('changelog.limit')}</p>
    </div>
  );
}
