import { describe, it, expect } from 'vitest';
import { installCommands, settingsJson } from './bundle.js';
import { buildUrl, readUrlState, pageFromPath } from './urlState.js';

const mkt = { name: 'devdigest-marketplace', repo: 'owner/repo' };

describe('bundle output', () => {
  it('builds Claude Code and shell commands', () => {
    expect(installCommands(['a', 'b'], 'claude', mkt)).toBe(
      '/plugin marketplace add owner/repo\n/plugin install a@devdigest-marketplace\n/plugin install b@devdigest-marketplace',
    );
    expect(installCommands(['a'], 'shell', mkt).split('\n')[1]).toBe('claude plugin install a@devdigest-marketplace');
  });
  it('9. settings snippet is valid JSON with the documented keys', () => {
    const json = JSON.parse(settingsJson(['a', 'b'], mkt));
    expect(json.extraKnownMarketplaces['devdigest-marketplace']).toEqual({ source: { source: 'github', repo: 'owner/repo' } });
    expect(json.enabledPlugins).toEqual({ 'a@devdigest-marketplace': true, 'b@devdigest-marketplace': true });
  });
});

describe('URL state', () => {
  const base = { page: 'search', query: ' code review ', type: 'skill', cat: 'quality', sort: 'best', plugin: '', bundle: ['a', 'b'] };
  it('6. round-trips filters, query and bundle', () => {
    const url = buildUrl(base);
    expect(url).toBe('./?q=code+review&type=skill&cat=quality&bundle=a,b');
    expect(readUrlState(url.slice(url.indexOf('?')))).toMatchObject({ query: 'code review', type: 'skill', cat: 'quality', bundle: ['a', 'b'] });
  });
  it('omits defaults', () => {
    expect(buildUrl({ ...base, query: '', type: 'all', cat: '', bundle: [] })).toBe('./');
  });
  it('share link carries only the bundle', () => {
    expect(buildUrl({ ...base, page: 'changelog' }, { shareBundle: true })).toBe('./?bundle=a,b');
  });
  it('changelog page keeps the plugin filter', () => {
    expect(buildUrl({ ...base, page: 'changelog', plugin: 'code-review' })).toBe('./changelog.html?plugin=code-review&bundle=a,b');
    expect(pageFromPath('/repo/changelog.html')).toBe('changelog');
    expect(pageFromPath('/repo/')).toBe('search');
  });
});
