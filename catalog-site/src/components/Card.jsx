import { useEffect, useId, useRef, useState } from 'react';
import { GH } from '../config.js';
import { rich, t } from '../i18n/index.js';
import { relativeDate } from '../lib/format.js';
import Highlight from './Highlight.jsx';
import { CheckIcon, ChevronIcon, CopyIcon, DotsIcon, ExtMark, InfoIcon, PlusIcon } from './Icons.jsx';

const COUNT_ORDER = ['skills', 'agents', 'commands', 'hooks', 'mcp'];

function countsLine(item) {
  if (item.type !== 'plugin' || item.external || !item.counts) return '';
  return COUNT_ORDER.filter((k) => item.counts[k]).map((k) => t(`card.counts.${k}`, { count: item.counts[k] })).join(' · ');
}

function menuItems(item, pluginName) {
  const isPlugin = item.type === 'plugin';
  const source = item.external ? item.sourceUrl : `${GH}/${isPlugin ? 'tree' : 'blob'}/main/${item.path}`;
  return [
    { id: 'view', label: t('card.viewSource'), href: source },
    ...(item.external ? [] : [{ id: 'edit', label: t('card.editSource'), href: `${GH}/edit/main/${isPlugin ? `${item.path}/.claude-plugin/plugin.json` : item.path}` }]),
    { id: 'report', label: t('card.report'), href: `${GH}/issues/new?template=problem-report.yml&title=${encodeURIComponent(t('links.problemTitle', { plugin: pluginName }))}&artifact=${encodeURIComponent(item.path || '')}` },
  ];
}

export default function Card({ item, terms, components, inBundle, onToggleBundle, onToast, now }) {
  const uid = useId();
  const rootRef = useRef(null);
  const fieldRef = useRef(null);
  const copyTimer = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [tip, setTip] = useState(false);

  const pluginName = item.type === 'plugin' ? item.name : item.plugin;
  const tags = (item.tags || []).slice(0, 3);
  const extraTags = (item.tags || []).length - tags.length;

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  useEffect(() => {
    if (fallback && fieldRef.current) { fieldRef.current.focus(); fieldRef.current.select(); }
  }, [fallback]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(item.install);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallback(true);
      onToast?.(t('card.copyBlocked'));
    }
  }

  const typeBadge = (type, extra = '') => (
    <span className={`badge${extra}`} style={{ background: `var(--b-${type}-bg)`, color: `var(--b-${type}-fg)` }}>{t(`type.singular.${type}`)}</span>
  );
  const bundleLabel = inBundle ? t('card.bundleIn') : item.type === 'plugin' ? t('card.bundleAddPlugin') : t('card.bundleAddOther');
  const bundleAria = inBundle
    ? t('card.bundleRemoveAria', { plugin: pluginName })
    : item.type === 'plugin' ? t('card.bundleAddAria', { plugin: pluginName }) : t('card.bundleAddParentAria', { plugin: pluginName });
  const counts = countsLine(item);
  const panelId = `${uid}-panel`;

  return (
    <article
      ref={rootRef}
      className={`card${expanded ? ' is-expanded' : ''}`}
      aria-labelledby={`${uid}-title`}
      onKeyDown={(e) => { if (e.key === 'Escape') { setMenu(false); setTip(false); } }}
    >
      <div className="card-body">
        <div className="card-top">
          {typeBadge(item.type)}
          {item.external && <span className="badge-outline">{t('card.external')}</span>}
          <span className="card-owner">{item.type === 'plugin' ? item.category || '' : item.plugin}</span>
        </div>
        <h3 id={`${uid}-title`} className="card-title"><Highlight text={item.title} terms={terms} /></h3>
        {item.invoke && <code className="card-invoke">{item.invoke}</code>}
        {counts && <div className="card-counts">{counts}</div>}
        {item.description
          ? <p className={`card-desc${expanded ? '' : ' is-clamped'}`}><Highlight text={item.description} terms={terms} /></p>
          : <p className="card-desc is-empty">{t('card.noDescription')}</p>}
        {tags.length > 0 && (
          <div className="card-tags">
            {tags.map((tag) => <span key={tag}>#<Highlight text={tag} terms={terms} /></span>)}
            {extraTags > 0 && <span>+{extraTags}</span>}
          </div>
        )}
        <div className="card-meta">
          {item.tokens > 0 && (
            <>
              <span className="tip-wrap">
                <span>{t('card.tokens', { count: item.tokens })}</span>
                <button
                  type="button" className="info-btn" aria-label={t('card.tokensInfo')} aria-describedby={`${uid}-tip`}
                  onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)}
                ><InfoIcon size={14} /></button>
                {tip && (
                  <span role="tooltip" id={`${uid}-tip`} className="tooltip">
                    {rich('card.tip', { plugin: pluginName }, { code: (text) => <code>{text}</code> })}
                  </span>
                )}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{t('card.updated', { when: relativeDate(item.updatedAt, now) })}</span>
        </div>
        {expanded && (
          <div id={panelId} className="card-expanded">
            {components.length > 0 && (
              <div>
                <div className="card-section-label">{item.type === 'plugin' ? t('card.contents') : t('card.alsoIn', { plugin: item.plugin })}</div>
                <ul className="component-list">
                  {components.map((c, i) => (
                    <li key={`${c.type}:${c.title}:${i}`}>
                      {typeBadge(c.type, ' badge-sm')}
                      <span className="mono">{c.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.external && (
              <p className="card-external">
                {rich('card.externalNote', {}, { a: (text) => <a href={item.sourceUrl} target="_blank" rel="noopener">{text}<ExtMark /></a> })}
              </p>
            )}
            <dl className="card-facts">
              <dt>{t('card.factSource')}</dt><dd>{item.external ? (item.sourceUrl || '').replace('https://', '') : item.type === 'plugin' ? `${item.path}/` : item.path}</dd>
              <dt>{t('card.factInstall')}</dt><dd>{item.install}</dd>
              <dt>{t('card.factUpdated')}</dt><dd>{item.updatedAt}</dd>
            </dl>
          </div>
        )}
      </div>
      <div className="card-actions">
        {!fallback && (
          <button type="button" className="btn" onClick={copy} aria-label={copied ? t('card.copiedAria') : t('card.copyAria', { command: item.install })} style={copied ? { color: 'var(--success)' } : undefined}>
            {copied ? <><CheckIcon size={15} /><span>{t('card.copied')}</span></> : <><CopyIcon size={15} /><span>{t('card.copy')}</span></>}
          </button>
        )}
        {fallback && (
          <input
            ref={fieldRef} className="copy-field" readOnly value={item.install}
            aria-label={t('card.copyField')}
            onFocus={(e) => e.target.select()} onBlur={() => setFallback(false)}
          />
        )}
        <button
          type="button" className={`btn${inBundle ? ' is-on' : ''}`} aria-pressed={inBundle} aria-label={bundleAria} title={bundleAria}
          onClick={() => onToggleBundle(pluginName)}
        >
          {inBundle ? <CheckIcon size={15} /> : <PlusIcon size={15} />}<span>{bundleLabel}</span>
        </button>
        <div className="card-actions-end">
          <button type="button" className={`btn-icon${expanded ? ' is-on' : ''}`} aria-expanded={expanded} aria-controls={panelId} aria-label={expanded ? t('card.showLess') : t('card.showMore')} onClick={() => setExpanded((v) => !v)}>
            <ChevronIcon className={expanded ? 'flip' : ''} />
          </button>
          <button type="button" className={`btn-icon${menu ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={menu} aria-label={t('card.moreActions')} onClick={() => setMenu((v) => !v)}>
            <DotsIcon />
          </button>
        </div>
        {menu && (
          <div role="menu" aria-label={t('card.moreActions')} className="menu">
            {menuItems(item, pluginName).map((m) => (
              <a key={m.id} role="menuitem" href={m.href} target="_blank" rel="noopener">
                <span>{m.label}</span><span aria-hidden="true" className="muted">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
