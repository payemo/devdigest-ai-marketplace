import { useEffect, useId, useRef, useState } from 'react';
import { GH } from '../config.js';
import { relativeDate } from '../lib/format.js';
import Highlight from './Highlight.jsx';
import { CheckIcon, ChevronIcon, CopyIcon, DotsIcon, InfoIcon, PlusIcon } from './Icons.jsx';

const LABEL = { plugin: 'Plugin', skill: 'Skill', agent: 'Agent', command: 'Command', hook: 'Hook', mcp: 'MCP' };

function countsLine(item) {
  if (item.type !== 'plugin' || item.external || !item.counts) return '';
  const order = [['skills', 'skill'], ['agents', 'agent'], ['commands', 'command'], ['hooks', 'hook'], ['mcp', 'MCP server']];
  return order.filter(([k]) => item.counts[k]).map(([k, l]) => `${item.counts[k]} ${l}${item.counts[k] > 1 ? 's' : ''}`).join(' · ');
}

function menuItems(item, pluginName) {
  const isPlugin = item.type === 'plugin';
  const source = item.external ? item.sourceUrl : `${GH}/${isPlugin ? 'tree' : 'blob'}/main/${item.path}`;
  return [
    { label: 'View source on GitHub', href: source },
    ...(item.external ? [] : [{ label: 'Edit on GitHub', href: `${GH}/edit/main/${isPlugin ? `${item.path}/.claude-plugin/plugin.json` : item.path}` }]),
    { label: 'Report a problem', href: `${GH}/issues/new?template=problem-report.yml&title=${encodeURIComponent(`[${pluginName}] `)}&artifact=${encodeURIComponent(item.path || '')}` },
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
      onToast?.('Copy blocked — command selected. Press Ctrl+C / ⌘C.');
    }
  }

  const bundleLabel = inBundle ? 'In bundle' : item.type === 'plugin' ? 'Bundle' : 'Plugin';
  const bundleAria = inBundle
    ? `${pluginName} is in your bundle — remove`
    : item.type === 'plugin' ? `Add ${pluginName} to bundle` : `Add plugin ${pluginName} to bundle`;
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
          <span className="badge" style={{ background: `var(--b-${item.type}-bg)`, color: `var(--b-${item.type}-fg)` }}>{LABEL[item.type]}</span>
          {item.external && <span className="badge-outline">External</span>}
          <span className="card-owner">{item.type === 'plugin' ? item.category || '' : item.plugin}</span>
        </div>
        <h3 id={`${uid}-title`} className="card-title"><Highlight text={item.title} terms={terms} /></h3>
        {item.invoke && <code className="card-invoke">{item.invoke}</code>}
        {counts && <div className="card-counts">{counts}</div>}
        {item.description
          ? <p className={`card-desc${expanded ? '' : ' is-clamped'}`}><Highlight text={item.description} terms={terms} /></p>
          : <p className="card-desc is-empty">No description provided.</p>}
        {tags.length > 0 && (
          <div className="card-tags">
            {tags.map((t) => <span key={t}>#<Highlight text={t} terms={terms} /></span>)}
            {extraTags > 0 && <span>+{extraTags}</span>}
          </div>
        )}
        <div className="card-meta">
          {item.tokens > 0 && (
            <>
              <span className="tip-wrap">
                <span>~{item.tokens} tokens always loaded</span>
                <button
                  type="button" className="info-btn" aria-label="About this estimate" aria-describedby={`${uid}-tip`}
                  onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onFocus={() => setTip(true)} onBlur={() => setTip(false)}
                ><InfoIcon size={14} /></button>
                {tip && (
                  <span role="tooltip" id={`${uid}-tip`} className="tooltip">
                    Estimate based on name and description length. Run <code>claude plugin details {pluginName}</code> for the exact figure.
                  </span>
                )}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>Updated {relativeDate(item.updatedAt, now)}</span>
        </div>
        {expanded && (
          <div id={panelId} className="card-expanded">
            {components.length > 0 && (
              <div>
                <div className="card-section-label">{item.type === 'plugin' ? 'Contents' : `Also in ${item.plugin}`}</div>
                <ul className="component-list">
                  {components.map((c, i) => (
                    <li key={`${c.type}:${c.title}:${i}`}>
                      <span className="badge badge-sm" style={{ background: `var(--b-${c.type}-bg)`, color: `var(--b-${c.type}-fg)` }}>{LABEL[c.type]}</span>
                      <span className="mono">{c.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.external && (
              <p className="card-external">Contents are in the source repository. <a href={item.sourceUrl} target="_blank" rel="noopener">Open source repository ↗</a></p>
            )}
            <dl className="card-facts">
              <dt>Source</dt><dd>{item.external ? (item.sourceUrl || '').replace('https://', '') : item.type === 'plugin' ? `${item.path}/` : item.path}</dd>
              <dt>Install</dt><dd>{item.install}</dd>
              <dt>Updated</dt><dd>{item.updatedAt}</dd>
            </dl>
          </div>
        )}
      </div>
      <div className="card-actions">
        {!fallback && (
          <button type="button" className="btn" onClick={copy} aria-label={copied ? 'Copied install command' : `Copy install command: ${item.install}`} style={copied ? { color: 'var(--success)' } : undefined}>
            {copied ? <><CheckIcon size={15} /><span>Copied</span></> : <><CopyIcon size={15} /><span>Copy install</span></>}
          </button>
        )}
        {fallback && (
          <input
            ref={fieldRef} className="copy-field" readOnly value={item.install}
            aria-label="Install command — press Ctrl+C or ⌘C to copy"
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
          <button type="button" className={`btn-icon${expanded ? ' is-on' : ''}`} aria-expanded={expanded} aria-controls={panelId} aria-label={expanded ? 'Show less' : 'Show details'} onClick={() => setExpanded((v) => !v)}>
            <ChevronIcon className={expanded ? 'flip' : ''} />
          </button>
          <button type="button" className={`btn-icon${menu ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu((v) => !v)}>
            <DotsIcon />
          </button>
        </div>
        {menu && (
          <div role="menu" aria-label="More actions" className="menu">
            {menuItems(item, pluginName).map((m) => (
              <a key={m.label} role="menuitem" href={m.href} target="_blank" rel="noopener">
                <span>{m.label}</span><span aria-hidden="true" className="muted">↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

