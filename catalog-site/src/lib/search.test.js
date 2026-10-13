import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildIndex, runQuery, parseQuery, highlightSegments } from './search.js';
import { deriveCatalog } from './catalog.js';

const catalog = deriveCatalog(JSON.parse(readFileSync(new URL('../../public/catalog.json', import.meta.url), 'utf8')));
const index = buildIndex(catalog.artifacts);
const ids = (q, extra) => runQuery(index, { query: q, ...extra }).results.map((r) => r.a.id);

describe('search (acceptance §13)', () => {
  it('1. "I need a skill to greet" puts the hello skill first', () => {
    expect(ids('I need a skill to greet')[0]).toBe('skill:hello-devdigest/hello');
  });
  it('2. "greeting plugin" finds the plugin and the skill', () => {
    const r = ids('greeting plugin');
    expect(r).toContain('plugin:hello-devdigest');
    expect(r).toContain('skill:hello-devdigest/hello');
    expect(r[0]).toBe('plugin:hello-devdigest'); // "plugin" boosts the plugin type
  });
  it('3. tolerates a typo ("helo")', () => {
    expect(ids('helo')).toContain('skill:hello-devdigest/hello');
  });
  it('4. only stop words behaves as an empty query', () => {
    const r = runQuery(index, { query: 'the a for' });
    expect(r.hasQuery).toBe(false);
    expect(r.results).toHaveLength(catalog.artifacts.length);
  });
  it('5. nonsense gives no results', () => {
    expect(ids('zzzz')).toEqual([]);
  });
});

describe('query processing', () => {
  it('moves type words out of the keywords', () => {
    const { keywords, types } = parseQuery('a skill for review');
    expect(keywords).toEqual(['review']);
    expect([...types]).toEqual(['skill']);
  });
  it('expands synonyms (review ~ audit)', () => {
    expect(ids('audit')).toContain('skill:code-review/review-pr');
  });
  it('counts reflect the query, not the type filter', () => {
    const all = runQuery(index, { query: 'review' });
    const onlySkills = runQuery(index, { query: 'review', type: 'skill' });
    expect(onlySkills.counts).toEqual(all.counts);
    expect(onlySkills.results.every((r) => r.a.type === 'skill')).toBe(true);
  });
  it('lists plugins first for an empty query, then A–Z', () => {
    const r = runQuery(index, {}).results.map((x) => x.a);
    expect(r[0].type).toBe('plugin');
    const plugins = r.filter((a) => a.type === 'plugin').map((a) => a.title);
    expect(plugins).toEqual([...plugins].sort((a, b) => a.localeCompare(b)));
  });
  it('highlights matches without markup', () => {
    const segs = highlightSegments('Greets the user <b>', ['greet']);
    expect(segs.find((s) => s.hit).text).toBe('Greets');
    expect(segs.map((s) => s.text).join('')).toBe('Greets the user <b>');
  });
});
