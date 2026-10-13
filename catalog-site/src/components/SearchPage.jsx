import { PLURAL, TYPES } from '../lib/search.js';
import { CloseIcon, PlusIcon, SearchIcon } from './Icons.jsx';
import Card from './Card.jsx';
import BundlePanel from './BundlePanel.jsx';
import { GH } from '../config.js';

const EXAMPLES = ['code review', 'commit messages', 'testing', 'docs'];

function Skeletons() {
  return (
    <div className="grid" aria-busy="true">
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <div key={k} className="skeleton"><i style={{ width: 56, height: 18 }} /><i style={{ width: '60%', height: 16 }} /><i style={{ width: '100%', height: 12 }} /><i style={{ width: '85%', height: 12 }} /><i className="push" /></div>
      ))}
    </div>
  );
}

export default function SearchPage(p) {
  const { catalog, status, showSkeleton, retry, input, onInput, onClear, inputRef, filters, setFilters, run, bundle, desktop, panelOpen, setPanelOpen, suggestHref, now, onPick } = p;
  const ready = status === 'ready';
  const emptyCatalog = ready && catalog.artifacts.length === 0;
  const hasInput = !!input.trim();
  const hasFilters = filters.type !== 'all' || !!filters.cat;
  const filterDesc = [filters.type !== 'all' ? `type “${PLURAL[filters.type]}”` : '', filters.cat ? `category “${filters.cat}”` : ''].filter(Boolean).join(' and ');
  const results = run?.results ?? [];
  const n = results.length;
  const showResults = ready && !emptyCatalog && n > 0;
  const noResults = ready && !emptyCatalog && n === 0;
  const grouped = showResults && !run.hasQuery;
  const wide = desktop && !panelOpen && bundle.length === 0;
  const resetFilters = () => setFilters((f) => ({ ...f, type: 'all', cat: '' }));

  const renderCard = (x) => (
    <Card
      key={x.a.id} item={x.a} terms={run.terms} now={now}
      components={x.a.type === 'plugin' ? catalog.componentsByPlugin[x.a.name] || [] : []}
      inBundle={bundle.includes(x.a.type === 'plugin' ? x.a.name : x.a.plugin)}
      onToggleBundle={p.onToggleBundle} onToast={p.onToast}
    />
  );
  const bundleRows = bundle.map((name) => ({ name, external: catalog?.externalPlugins.has(name) }));
  const countLine = !ready ? (status === 'loading' ? 'Loading…' : '') : run.hasQuery ? `${n} result${n === 1 ? '' : 's'}` : `${n} item${n === 1 ? '' : 's'}`;

  return (
    <>
      <div className={`wrap hero${hasInput ? ' is-compact' : ''}`}>
        {!hasInput && <h1>Find skills, agents and plugins for Claude Code</h1>}
        <div role="search" className="search">
          <label htmlFor="q" className="sr-only">Search the catalog</label>
          <div className="search-box">
            <SearchIcon size={19} className="search-icon" />
            <input
              id="q" ref={inputRef} type="search" autoComplete="off" spellCheck="false" value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClear(); } }}
              placeholder="Describe what you need, e.g. “review pull requests”"
            />
            {hasInput && <button type="button" className="clear-btn" onClick={onClear} aria-label="Clear search"><CloseIcon /></button>}
            {!hasInput && <kbd aria-hidden="true">/</kbd>}
          </div>
        </div>
        {!hasInput && (
          <div className="examples">
            <span>Try:</span>
            {EXAMPLES.map((label) => <button key={label} type="button" className="chip plain" onClick={() => onPick(label)}>{label}</button>)}
          </div>
        )}
      </div>

      <div className={`wrap filters${hasInput ? ' is-compact' : ''}`}>
        <div className="type-row">
          <span id="type-label" className="muted small">Type</span>
          <div role="radiogroup" aria-labelledby="type-label" className="chips">
            {['all', ...TYPES].map((t) => {
              const on = filters.type === t;
              const count = ready ? run.counts[t] : '–';
              const disabled = !on && count === 0 && t !== 'all';
              return (
                <button key={t} type="button" role="radio" aria-checked={on} disabled={disabled} className={`chip${on ? ' is-on' : ''}`} onClick={() => setFilters((f) => ({ ...f, type: t }))}>
                  <span>{t === 'all' ? 'All' : PLURAL[t]}</span><span className="mono muted small">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="filter-row">
          {catalog?.categories.length > 0 && (
            <label className="field">Category
              <select value={filters.cat} onChange={(e) => setFilters((f) => ({ ...f, cat: e.target.value }))}>
                <option value="">any</option>
                {catalog.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          {hasFilters && <button type="button" className="link-btn accent underline" onClick={resetFilters}>Reset filters</button>}
          <div className="filter-end">
            <p aria-live="polite" className="muted small count-line">{countLine}</p>
            <label className="field">Sort
              <select value={run?.sort ?? 'name'} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
                <option value="best" disabled={!run?.hasQuery}>Best match</option>
                <option value="name">Name A–Z</option>
                <option value="updated">Recently updated</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="wrap results-row">
        <div role="region" aria-label="Search results" className="results">
          {status === 'loading' && showSkeleton && <Skeletons />}
          {status === 'error' && (
            <div role="alert" className="state">
              <div className="state-icon" aria-hidden="true">!</div>
              <h2>Couldn't load the catalog.</h2>
              <p className="muted">Check your connection and try again, or browse the plugins directly on GitHub.</p>
              <div className="state-actions">
                <button type="button" className="btn btn-primary" onClick={retry}>Retry</button>
                <a className="btn" href={GH} target="_blank" rel="noopener">Open repository ↗</a>
              </div>
            </div>
          )}
          {emptyCatalog && (
            <div className="state">
              <h2>This marketplace has no plugins yet.</h2>
              <p className="muted">Plugins appear here once they are added to <code>marketplace.json</code>.</p>
              <a href={suggestHref} target="_blank" rel="noopener">Suggest a plugin ↗</a>
            </div>
          )}
          {noResults && (
            <div className="state is-left">
              <h2>No matches for “{input.trim()}”.</h2>
              <ul>
                {hasFilters && <li><button type="button" className="link-btn accent underline" onClick={resetFilters}>Remove filters</button> — you're filtering by {filterDesc}.</li>}
                <li>Try fewer or more general words.</li>
                <li className="popular">Popular searches:{EXAMPLES.map((label) => <button key={label} type="button" className="chip" onClick={() => onPick(label)}>{label}</button>)}</li>
              </ul>
              <a className="btn" href={suggestHref} target="_blank" rel="noopener">Suggest a plugin for this <span aria-hidden="true" className="muted">↗</span></a>
            </div>
          )}
          {grouped && TYPES.map((t) => {
            const items = results.filter((x) => x.a.type === t);
            if (!items.length) return null;
            return (
              <section key={t} aria-labelledby={`g-${t}`} className="group">
                <h2 id={`g-${t}`}>{PLURAL[t]} <span className="mono muted small">{items.length}</span></h2>
                <div className={`grid${wide ? ' is-wide' : ''}`}>{items.map(renderCard)}</div>
              </section>
            );
          })}
          {showResults && !grouped && <div className={`grid${wide ? ' is-wide' : ''}`}>{results.map(renderCard)}</div>}
        </div>

        {desktop && catalog && (
          <aside aria-label="Bundle" className={`aside${panelOpen ? '' : ' is-closed'}`}>
            {panelOpen ? (
              <BundlePanel plugins={bundleRows} marketplace={catalog.marketplace} onRemove={p.onRemove} onClear={p.onClearBundle} onClose={() => setPanelOpen(false)} onShare={p.onShare} onToast={p.onToast} />
            ) : (
              <button type="button" className="bundle-tab" onClick={() => setPanelOpen(true)} aria-expanded="false" aria-label={`Open bundle, ${bundle.length} plugin${bundle.length === 1 ? '' : 's'}`}>
                <PlusIcon size={15} /><span>Bundle ({bundle.length})</span>
              </button>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
