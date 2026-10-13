import { REPO } from '../config.js';

/** Fetch catalog.json (relative to the current document, so it works under /<repo>/). */
export async function loadCatalog(signal) {
  const res = await fetch(new URL('catalog.json', document.baseURI), { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
  return deriveCatalog(await res.json());
}

/** Validate the §11.1 shape and add the lookups the UI needs. */
export function deriveCatalog(raw) {
  if (!raw || !Array.isArray(raw.artifacts) || !raw.marketplace?.name) throw new Error('catalog.json: unexpected shape');
  const artifacts = raw.artifacts;
  const plugins = artifacts.filter((a) => a.type === 'plugin');
  const componentsByPlugin = {};
  for (const a of artifacts) {
    if (a.type !== 'plugin') (componentsByPlugin[a.plugin] ||= []).push({ type: a.type, title: a.title });
  }
  return {
    marketplace: { ...raw.marketplace, repo: raw.marketplace.repo || REPO },
    generatedAt: raw.generatedAt,
    commit: raw.commit,
    artifacts,
    changes: raw.changes || [],
    categories: raw.categories || [...new Set(artifacts.map((a) => a.category).filter(Boolean))].sort(),
    pluginNames: plugins.map((p) => p.name),
    externalPlugins: new Set(plugins.filter((p) => p.external).map((p) => p.name)),
    componentsByPlugin,
  };
}
