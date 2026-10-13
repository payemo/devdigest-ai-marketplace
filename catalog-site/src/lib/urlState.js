export const SEARCH_PAGE = 'search';
export const CHANGELOG_PAGE = 'changelog';

export const pageFromPath = (pathname) => (/changelog(\.html)?$/.test(pathname) ? CHANGELOG_PAGE : SEARCH_PAGE);

/** Relative URL of a page, valid from either entry document. */
export const pagePath = (page) => (page === CHANGELOG_PAGE ? './changelog.html' : './');

/** Read the shareable state from a query string. Unknown/missing values are left undefined. */
export function readUrlState(search) {
  const u = new URLSearchParams(search);
  const bundle = u.get('bundle');
  return {
    query: u.get('q') ?? undefined,
    type: u.get('type') ?? undefined,
    cat: u.get('cat') ?? undefined,
    sort: u.get('sort') ?? undefined,
    plugin: u.get('plugin') ?? undefined,
    bundle: bundle ? bundle.split(',').filter(Boolean) : undefined,
  };
}

/**
 * URL mirroring the state. `shareBundle` produces a link that carries only the bundle
 * (not the current search), on the search page.
 */
export function buildUrl({ page, query, type, cat, sort, plugin, bundle }, { shareBundle = false } = {}) {
  const u = new URLSearchParams();
  const effectivePage = shareBundle ? SEARCH_PAGE : page;
  if (effectivePage === CHANGELOG_PAGE) {
    if (plugin) u.set('plugin', plugin);
  } else if (!shareBundle) {
    if (query.trim()) u.set('q', query.trim());
    if (type !== 'all') u.set('type', type);
    if (cat) u.set('cat', cat);
    if (sort !== 'best') u.set('sort', sort);
  }
  if (bundle.length) u.set('bundle', bundle.join(','));
  const qs = u.toString().replace(/%2C/g, ',');
  return pagePath(effectivePage) + (qs ? `?${qs}` : '');
}
