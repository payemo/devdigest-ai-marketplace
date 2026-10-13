import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GH } from './config.js';
import { useCatalog } from './hooks/useCatalog.js';
import { useDelayedFlag } from './hooks/useDelayedFlag.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { useTheme } from './hooks/useTheme.js';
import { buildIndex, runQuery } from './lib/search.js';
import { CHANGELOG_PAGE, SEARCH_PAGE, buildUrl, pageFromPath, pagePath, readUrlState } from './lib/urlState.js';
import BundlePanel from './components/BundlePanel.jsx';
import Changelog from './components/Changelog.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import { PlusIcon } from './components/Icons.jsx';
import SearchPage from './components/SearchPage.jsx';

const BUNDLE_KEY = 'ddm-bundle';

function initialState() {
  const u = readUrlState(location.search);
  let stored = [];
  try { stored = JSON.parse(localStorage.getItem(BUNDLE_KEY) || '[]'); } catch { /* ignore */ }
  const bundle = u.bundle ?? (Array.isArray(stored) ? stored : []);
  return {
    page: pageFromPath(location.pathname),
    input: u.query ?? '',
    filters: { type: u.type ?? 'all', cat: u.cat ?? '', sort: u.sort ?? 'best' },
    plugin: u.plugin ?? '',
    bundle,
  };
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { status, catalog, retry } = useCatalog();
  const desktop = useMediaQuery('(min-width: 1024px)');

  const [init] = useState(initialState);
  const [page, setPage] = useState(init.page);
  const [input, setInput] = useState(init.input);
  const [query, setQuery] = useState(init.input);
  const [filters, setFilters] = useState(init.filters);
  const [plugin, setPlugin] = useState(init.plugin);
  const [bundle, setBundle] = useState(init.bundle);
  const [panelOpen, setPanelOpen] = useState(init.bundle.length > 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const inputRef = useRef(null);
  const debounce = useRef(0);
  const toastTimer = useRef(0);

  const showSkeleton = useDelayedFlag(status === 'loading');
  const now = useMemo(() => (catalog ? new Date(catalog.generatedAt) : new Date()), [catalog]);
  const index = useMemo(() => (catalog ? buildIndex(catalog.artifacts) : null), [catalog]);
  const run = useMemo(() => (index ? runQuery(index, { query, ...filters }) : null), [index, query, filters]);

  // Drop bundle entries that are not plugins of this catalog (stale localStorage, hand-edited URL).
  useEffect(() => {
    if (!catalog) return;
    setBundle((b) => { const ok = b.filter((n) => catalog.pluginNames.includes(n)); return ok.length === b.length ? b : ok; });
  }, [catalog]);

  useEffect(() => { try { localStorage.setItem(BUNDLE_KEY, JSON.stringify(bundle)); } catch { /* storage may be blocked */ } }, [bundle]);

  // Mirror state in the URL so reload and sharing work.
  const stateForUrl = { page, query, plugin, bundle, ...filters };
  const url = buildUrl(stateForUrl);
  useEffect(() => { history.replaceState(null, '', url); }, [url]);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const onInput = useCallback((v) => {
    setInput(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(v), 120);
  }, []);
  const setNow = useCallback((v) => { setInput(v); clearTimeout(debounce.current); setQuery(v); }, []);
  const onClear = useCallback(() => { setNow(''); inputRef.current?.focus(); }, [setNow]);

  const navigate = useCallback((target) => {
    if (target !== page) history.pushState(null, '', pagePath(target));
    setPage(target); setMenuOpen(false); setSheetOpen(false);
    window.scrollTo(0, 0);
  }, [page]);

  // Browser back/forward between the two pages.
  useEffect(() => {
    const onPop = () => {
      const u = readUrlState(location.search);
      setPage(pageFromPath(location.pathname));
      setPlugin(u.plugin ?? '');
      setMenuOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // "/" focuses the search box, Esc closes the sheet and mobile menu.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (page !== SEARCH_PAGE) navigate(SEARCH_PAGE);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape') { setSheetOpen(false); setMenuOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page, navigate]);

  useEffect(() => { if (desktop) setSheetOpen(false); }, [desktop]);

  const toggleBundle = useCallback((name) => {
    setBundle((b) => (b.includes(name) ? b.filter((n) => n !== name) : [...b, name]));
    setPanelOpen(true);
  }, []);
  const removeFromBundle = useCallback((name) => setBundle((b) => b.filter((n) => n !== name)), []);
  const clearBundle = useCallback(() => setBundle([]), []);
  const shareBundle = useCallback(async () => {
    const link = new URL(buildUrl(stateForUrl, { shareBundle: true }), location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Bundle link copied');
    } catch {
      showToast('Copy blocked — link is in the address bar');
      history.replaceState(null, '', buildUrl(stateForUrl, { shareBundle: true }));
    }
  }, [stateForUrl, showToast]);

  const suggestHref = `${GH}/issues/new?template=plugin-suggestion.yml&title=${`Plugin suggestion: ${query.trim()}`.trim().replace(/ /g, '+').slice(0, 300)}`;
  const bundleRows = bundle.map((name) => ({ name, external: catalog?.externalPlugins.has(name) }));
  const showFab = !desktop && page === SEARCH_PAGE && !sheetOpen && !!catalog;

  return (
    <div className="app">
      <Header
        page={page} onNavigate={navigate} theme={theme} onToggleTheme={toggleTheme}
        menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} suggestHref={suggestHref}
      />
      <main>
        {page === SEARCH_PAGE && (
          <SearchPage
            catalog={catalog} status={status} showSkeleton={showSkeleton} retry={retry}
            input={input} onInput={onInput} onClear={onClear} onPick={setNow} inputRef={inputRef}
            filters={filters} setFilters={setFilters} run={run} bundle={bundle} desktop={desktop}
            panelOpen={panelOpen} setPanelOpen={setPanelOpen} suggestHref={suggestHref} now={now}
            onToggleBundle={toggleBundle} onRemove={removeFromBundle} onClearBundle={clearBundle} onShare={shareBundle} onToast={showToast}
          />
        )}
        {page === CHANGELOG_PAGE && catalog && <Changelog catalog={catalog} plugin={plugin} onPlugin={setPlugin} />}
        {page === CHANGELOG_PAGE && !catalog && status === 'error' && (
          <div className="wrap"><div role="alert" className="state"><h2>Couldn't load the catalog.</h2><button type="button" className="btn btn-primary" onClick={retry}>Retry</button></div></div>
        )}
      </main>
      <Footer suggestHref={suggestHref} catalog={catalog} />

      {showFab && (
        <button type="button" className={`fab${bundle.length ? ' has' : ''}`} onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-label={`Open bundle, ${bundle.length} plugin${bundle.length === 1 ? '' : 's'}`}>
          <PlusIcon size={16} /><span>Bundle ({bundle.length})</span>
        </button>
      )}
      {sheetOpen && !desktop && catalog && (
        <div className="sheet-wrap">
          <button type="button" className="scrim" aria-label="Close bundle" onClick={() => setSheetOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Your bundle" className="sheet">
            <div className="grabber" aria-hidden="true" />
            <BundlePanel variant="sheet" plugins={bundleRows} marketplace={catalog.marketplace} onRemove={removeFromBundle} onClear={clearBundle} onClose={() => setSheetOpen(false)} onShare={shareBundle} onToast={showToast} />
          </div>
        </div>
      )}
      {toast && <div role="status" className="toast">{toast}</div>}
    </div>
  );
}
