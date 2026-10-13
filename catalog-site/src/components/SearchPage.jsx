import { GH } from '../config.js';
import { list, rich, t } from '../i18n/index.js';
import { TYPES } from '../lib/search.js';
import BundlePanel from './BundlePanel.jsx';
import Card from './Card.jsx';
import { CloseIcon, ExtMark, PlusIcon, SearchIcon } from './Icons.jsx';

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
  const examples = list('hero.examples');
  const ready = status === 'ready';
  const emptyCatalog = ready && catalog.artifacts.length === 0;
  const hasInput = !!input.trim();
  const hasFilters = filters.type !== 'all' || !!filters.cat;
  const filterDesc = [
    filters.type !== 'all' ? t('filters.byType', { type: t(`type.plural.${filters.type}`) }) : '',
    filters.cat ? t('filters.byCategory', { category: filters.cat }) : '',
  ].filter(Boolean).join(t('filters.and'));
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
  const countLine = !ready
    ? (status === 'loading' ? t('results.loading') : '')
    : t(run.hasQuery ? 'results.count' : 'results.items', { count: n });

  return (
    <>
      <div className={`wrap hero${hasInput ? ' is-compact' : ''}`}>
        {!hasInput && <h1>{t('hero.title')}</h1>}
        <div role="search" className="search">
          <label htmlFor="q" className="sr-only">{t('search.label')}</label>
          <div className="search-box">
            <SearchIcon size={19} className="search-icon" />
            <input
              id="q" ref={inputRef} type="search" autoComplete="off" spellCheck="false" value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClear(); } }}
              placeholder={t('search.placeholder')}
            />
            {hasInput && <button type="button" className="clear-btn" onClick={onClear} aria-label={t('search.clear')}><CloseIcon /></button>}
            {!hasInput && <kbd aria-hidden="true">/</kbd>}
          </div>
        </div>
        {!hasInput && (
          <div className="examples">
            <span>{t('hero.try')}</span>
            {examples.map((label) => <button key={label} type="button" className="chip plain" onClick={() => onPick(label)}>{label}</button>)}
          </div>
        )}
      </div>

      <div className={`wrap filters${hasInput ? ' is-compact' : ''}`}>
        <div className="type-row">
          <span id="type-label" className="muted small">{t('filters.type')}</span>
          <div role="radiogroup" aria-labelledby="type-label" className="chips">
            {['all', ...TYPES].map((type) => {
              const on = filters.type === type;
              const count = ready ? run.counts[type] : '–';
              const disabled = !on && count === 0 && type !== 'all';
              return (
                <button key={type} type="button" role="radio" aria-checked={on} disabled={disabled} className={`chip${on ? ' is-on' : ''}`} onClick={() => setFilters((f) => ({ ...f, type }))}>
                  <span>{type === 'all' ? t('type.all') : t(`type.plural.${type}`)}</span><span className="mono muted small">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="filter-row">
          {catalog?.categories.length > 0 && (
            <label className="field">{t('filters.category')}
              <select value={filters.cat} onChange={(e) => setFilters((f) => ({ ...f, cat: e.target.value }))}>
                <option value="">{t('filters.any')}</option>
                {catalog.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          {hasFilters && <button type="button" className="link-btn accent underline" onClick={resetFilters}>{t('filters.reset')}</button>}
          <div className="filter-end">
            <p aria-live="polite" className="muted small count-line">{countLine}</p>
            <label className="field">{t('filters.sort')}
              <select value={run?.sort ?? 'name'} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
                <option value="best" disabled={!run?.hasQuery}>{t('filters.sortBest')}</option>
                <option value="name">{t('filters.sortName')}</option>
                <option value="updated">{t('filters.sortUpdated')}</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="wrap results-row">
        <div role="region" aria-label={t('search.region')} className="results">
          {status === 'loading' && showSkeleton && <Skeletons />}
          {status === 'error' && (
            <div role="alert" className="state">
              <div className="state-icon" aria-hidden="true">!</div>
              <h2>{t('state.errorTitle')}</h2>
              <p className="muted">{t('state.errorBody')}</p>
              <div className="state-actions">
                <button type="button" className="btn btn-primary" onClick={retry}>{t('state.retry')}</button>
                <a className="btn" href={GH} target="_blank" rel="noopener">{t('state.openRepo')}<ExtMark /></a>
              </div>
            </div>
          )}
          {emptyCatalog && (
            <div className="state">
              <h2>{t('state.emptyTitle')}</h2>
              <p className="muted">{rich('state.emptyBody', {}, { code: (text) => <code>{text}</code> })}</p>
              <a href={suggestHref} target="_blank" rel="noopener">{t('state.suggest')}<ExtMark /></a>
            </div>
          )}
          {noResults && (
            <div className="state is-left">
              <h2>{t('state.noMatches', { query: input.trim() })}</h2>
              <ul>
                {hasFilters && <li><button type="button" className="link-btn accent underline" onClick={resetFilters}>{t('state.removeFilters')}</button>{t('state.filteringBy', { filters: filterDesc })}</li>}
                <li>{t('state.tryFewer')}</li>
                <li className="popular">{t('state.popular')}{examples.map((label) => <button key={label} type="button" className="chip" onClick={() => onPick(label)}>{label}</button>)}</li>
              </ul>
              <a className="btn" href={suggestHref} target="_blank" rel="noopener">{t('state.suggestForThis')}<ExtMark /></a>
            </div>
          )}
          {grouped && TYPES.map((type) => {
            const items = results.filter((x) => x.a.type === type);
            if (!items.length) return null;
            return (
              <section key={type} aria-labelledby={`g-${type}`} className="group">
                <h2 id={`g-${type}`}>{t(`type.plural.${type}`)} <span className="mono muted small">{items.length}</span></h2>
                <div className={`grid${wide ? ' is-wide' : ''}`}>{items.map(renderCard)}</div>
              </section>
            );
          })}
          {showResults && !grouped && <div className={`grid${wide ? ' is-wide' : ''}`}>{results.map(renderCard)}</div>}
        </div>

        {desktop && catalog && (
          <aside aria-label={t('bundle.region')} className={`aside${panelOpen ? '' : ' is-closed'}`}>
            {panelOpen ? (
              <BundlePanel plugins={bundleRows} marketplace={catalog.marketplace} onRemove={p.onRemove} onClear={p.onClearBundle} onClose={() => setPanelOpen(false)} onShare={p.onShare} onToast={p.onToast} />
            ) : (
              <button type="button" className="bundle-tab" onClick={() => setPanelOpen(true)} aria-expanded="false" aria-label={t('bundle.tabAria', { count: bundle.length })}>
                <PlusIcon size={15} /><span>{t('bundle.tab', { count: bundle.length })}</span>
              </button>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
