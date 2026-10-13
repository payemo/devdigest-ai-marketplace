import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { has, list, rich, t } from './index.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const MESSAGES = JSON.parse(readFileSync(join(SRC, 'locales/en.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'locales' ? [] : walk(p);
    return ['.js', '.jsx'].includes(extname(p)) && !/\.test\./.test(p) ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ path: relative(SRC, p), code: readFileSync(p, 'utf8') }));

// Every leaf key of a message tree (a plural object `{ one, other }` counts as one message).
function leafKeys(node, prefix = '') {
  if (typeof node === 'string' || Array.isArray(node)) return [prefix];
  if ('other' in node) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}
const ALL_KEYS = leafKeys(MESSAGES);

const used = new Set(); // keys passed straight to t()/list()/rich()
const prefixes = new Set(); // keys built as t(`type.plural.${x}`)
const quoted = new Set(); // any string literal in code that is exactly a message key (e.g. via a ternary or a table)
for (const { code } of files) {
  for (const m of code.matchAll(/\b(?:t|list|rich)\(\s*['"]([\w.]+)['"]/g)) used.add(m[1]);
  for (const m of code.matchAll(/\b(?:t|list|rich)\(\s*`([\w.]+)\.\$\{/g)) prefixes.add(m[1]);
  for (const m of code.matchAll(/['"]([a-z][\w]*(?:\.\w+)+)['"]/gi)) quoted.add(m[1]);
}

describe('messages', () => {
  it('every key referenced in code exists', () => {
    const missing = [...used].filter((k) => !has(k));
    expect(missing).toEqual([]);
  });
  it('no message is unused (dead translations)', () => {
    const unused = ALL_KEYS.filter((k) => !used.has(k) && !quoted.has(k) && ![...prefixes].some((p) => k.startsWith(`${p}.`)) && !k.startsWith('meta.') && !k.startsWith('noscript.'));
    expect(unused).toEqual([]);
  });
  it('every {placeholder} used in a message is documented by a call site', () => {
    // Guards against typos such as {cout}: a plural message must use {count}.
    for (const k of ALL_KEYS) {
      const node = k.split('.').reduce((o, p) => o[p], MESSAGES);
      if (typeof node === 'object' && !Array.isArray(node)) {
        for (const form of Object.values(node)) expect(form, k).toContain('{count}');
      }
    }
  });
});

describe('helpers', () => {
  it('interpolates and picks plural forms', () => {
    expect(t('results.count', { count: 1 })).toBe('1 result');
    expect(t('results.count', { count: 5 })).toBe('5 results');
    expect(t('card.bundleAddAria', { plugin: 'x' })).toBe('Add x to bundle');
  });
  it('returns lists', () => {
    expect(list('hero.examples')).toContain('code review');
  });
  it('rich() maps <tag> markup to elements and keeps surrounding text', () => {
    const out = rich('footer.built', { date: '2026-10-13', sha: 'abc' }, { a: (txt) => `[${txt}]` });
    expect(out.flatMap((n) => (typeof n === 'string' ? [n] : [n.props.children])).join('')).toBe('Catalog built 2026-10-13 · commit [abc]');
  });
});

// The point of this suite: user-facing text must come from locales/*.json, not from components.
// Parsed with a real JSX parser, so code between tags is never mistaken for text.
const TEXT_ATTRS = new Set(['aria-label', 'aria-roledescription', 'placeholder', 'title', 'alt']);
const TOAST_CALLS = new Set(['onToast', 'showToast']);
const hasWords = (s) => /[A-Za-z]{2,}/.test(s);

function literalText(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked).join('');
  return '';
}

function findHardcodedText(code) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const found = [];
  const walk = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'JSXText' && hasWords(node.value)) found.push(`JSX text "${node.value.trim().slice(0, 50)}"`);
    if (node.type === 'JSXAttribute' && TEXT_ATTRS.has(node.name.name) && node.value?.type === 'StringLiteral' && hasWords(node.value.value)) {
      found.push(`${node.name.name}="${node.value.value}"`);
    }
    if (node.type === 'JSXExpressionContainer' && parent && /^JSX(Element|Fragment)$/.test(parent.type) && hasWords(literalText(node.expression))) {
      found.push(`JSX child {"${literalText(node.expression).slice(0, 50)}"}`);
    }
    if (node.type === 'CallExpression') {
      const callee = node.callee.type === 'OptionalMemberExpression' || node.callee.type === 'MemberExpression' ? node.callee.property?.name : node.callee.name;
      if (TOAST_CALLS.has(callee) && hasWords(literalText(node.arguments[0]))) found.push(`${callee}("${literalText(node.arguments[0]).slice(0, 50)}")`);
    }
    for (const [key, v] of Object.entries(node)) {
      if (key === 'loc' || key === 'extra') continue;
      if (Array.isArray(v)) v.forEach((c) => walk(c, node));
      else if (v && typeof v === 'object') walk(v, node);
    }
  };
  walk(ast.program, null);
  return found;
}

describe('no hardcoded UI text in components', () => {
  const jsx = files.filter((f) => f.path.endsWith('.jsx'));
  it('finds hardcoded text in a bad component (the check itself works)', () => {
    const bad = `export default () => <button title="Close" aria-label="Go">Click me{'Hello there'}</button>;
      const f = () => showToast('Oops it broke');`;
    expect(findHardcodedText(bad)).toEqual(expect.arrayContaining([
      'title="Close"', 'aria-label="Go"', 'JSX text "Click me"', 'JSX child {"Hello there"}', 'showToast("Oops it broke")',
    ]));
  });
  for (const { path, code } of jsx) {
    it(`${path} has no literal UI text`, () => {
      expect(findHardcodedText(code)).toEqual([]);
    });
  }
});
