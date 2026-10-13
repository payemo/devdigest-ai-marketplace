import SYNONYM_GROUPS from './synonyms.json';

export const TYPES = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp'];

const STOP = new Set(
  'i,need,a,an,the,for,to,of,that,which,with,my,me,want,looking,something,some,is,are,can,and,or,in,on,it,this,please,would,like,any,how,what,will,we,our,you'.split(','),
);
const TYPE_WORDS = {
  skill: 'skill', skills: 'skill', agent: 'agent', agents: 'agent', subagent: 'agent', subagents: 'agent',
  plugin: 'plugin', plugins: 'plugin', command: 'command', commands: 'command', hook: 'hook', hooks: 'hook', mcp: 'mcp',
};

/** Light stemming: plural, -ing, -ed. */
export function stem(word) {
  const w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const SYNONYMS = SYNONYM_GROUPS.map((g) => g.map(stem));
const synonymGroup = (kw) => SYNONYMS.find((g) => g.includes(kw));

const tokenize = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((raw) => ({ raw, stem: stem(raw) }));

/** True when a and b are equal or differ by one insertion, deletion or substitution. */
export function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return d + (la - i) + (lb - j) <= 1;
}

/** 1 exact, 0.7 prefix (>=3 chars), 0.45 edit distance 1 (>=4 chars), else 0. */
function matchQuality(tokens, q) {
  let best = 0;
  for (const t of tokens) {
    if (t.stem === q || t.raw === q) return 1;
    if (q.length >= 3 && t.raw.startsWith(q)) best = Math.max(best, 0.7);
    else if (q.length >= 4 && t.stem.length >= 4 && withinOneEdit(t.stem, q)) best = Math.max(best, 0.45);
  }
  return best;
}

/** Build the search index once per catalog: title x5, tags/category x3, description x3, plugin x2, body x1. */
export function buildIndex(artifacts) {
  return artifacts.map((a) => ({
    a,
    fields: [
      [5, tokenize(a.title)],
      [3, tokenize((a.tags || []).join(' ') + ' ' + (a.category || ''))],
      [3, tokenize(a.description)],
      [2, tokenize(a.plugin)],
      [1, tokenize(a.text)],
    ],
  }));
}

/** Split a query into stemmed keywords and artifact-type boosts; stop words are dropped. */
export function parseQuery(query) {
  const keywords = [];
  const types = new Set();
  for (const raw of (query || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (STOP.has(raw)) continue;
    if (TYPE_WORDS[raw]) { types.add(TYPE_WORDS[raw]); continue; }
    keywords.push(stem(raw));
  }
  return { keywords, types };
}

/** Keywords plus their synonyms: what should be highlighted in results. */
export function highlightTerms(keywords) {
  return [...new Set(keywords.flatMap((k) => synonymGroup(k) || [k]))];
}

function scoreAll(index, keywords, types) {
  const alternatives = keywords.map((k) => {
    const g = synonymGroup(k);
    return [{ term: k, weight: 1 }, ...(g ? g.filter((x) => x !== k).map((term) => ({ term, weight: 0.8 })) : [])];
  });
  const out = [];
  for (const { a, fields } of index) {
    let total = 0, matched = 0;
    for (const alt of alternatives) {
      let best = 0;
      for (const { term, weight } of alt) {
        let s = 0;
        for (const [w, tokens] of fields) s += w * matchQuality(tokens, term);
        best = Math.max(best, s * weight);
      }
      if (best > 0) { matched++; total += best; }
    }
    if (!matched) continue;
    let score = total * (matched / keywords.length);
    if (types.has(a.type)) score *= 1.6;
    out.push({ a, score });
  }
  return out;
}

const byName = (x, y) => (x.a.type === 'plugin' ? 0 : 1) - (y.a.type === 'plugin' ? 0 : 1) || x.a.title.localeCompare(y.a.title);

/** Sort used when "best match" is requested but there is no query: name order. */
export const effectiveSort = (sort, hasQuery) => (!hasQuery && sort === 'best' ? 'name' : sort);

/**
 * Run the whole pipeline: query -> category filter -> type counts -> type filter -> sort.
 * Counts reflect the current query and category, not the type filter.
 */
export function runQuery(index, { query = '', type = 'all', cat = '', sort = 'best' } = {}) {
  const { keywords, types } = parseQuery(query);
  const hasQuery = keywords.length > 0;
  let scored = hasQuery ? scoreAll(index, keywords, types) : index.map(({ a }) => ({ a, score: 0 }));
  if (cat) scored = scored.filter((x) => x.a.category === cat);
  const counts = { all: scored.length };
  for (const t of TYPES) counts[t] = scored.filter((x) => x.a.type === t).length;
  const filtered = type === 'all' ? scored : scored.filter((x) => x.a.type === type);
  const eff = effectiveSort(sort, hasQuery);
  const cmp = eff === 'best'
    ? (x, y) => y.score - x.score || byName(x, y)
    : eff === 'updated'
      ? (x, y) => y.a.updatedAt.localeCompare(x.a.updatedAt) || byName(x, y)
      : byName;
  return { hasQuery, terms: hasQuery ? highlightTerms(keywords) : [], counts, results: filtered.slice().sort(cmp), sort: eff };
}

function isHit(word, terms) {
  const raw = word.toLowerCase();
  const s = stem(raw);
  return terms.some((t) => s === t || raw === t || (t.length >= 3 && raw.startsWith(t)) || (t.length >= 4 && s.length >= 4 && withinOneEdit(s, t)));
}

/** Split text into [{ text, hit }] segments so matches can be wrapped in <mark> without innerHTML. */
export function highlightSegments(text, terms) {
  const out = [];
  if (!text) return out;
  for (const part of String(text).split(/([A-Za-z0-9]+)/)) {
    if (!part) continue;
    const hit = !!(terms && terms.length && /^[A-Za-z0-9]+$/.test(part) && isHit(part, terms));
    const last = out[out.length - 1];
    if (last && !last.hit && !hit) last.text += part;
    else out.push({ text: part, hit });
  }
  return out;
}
