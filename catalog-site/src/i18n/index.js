// Tiny message lookup. All user-facing text lives in src/locales/<locale>.json; components only reference keys.
//
//   t('results.count', { count: 3 })      plain string; {name} placeholders; plural objects ({ one, other }) pick by `count`
//   list('hero.examples')                 an array of strings
//   rich('card.tip', { plugin }, { code: (text) => <code>{text}</code> })
//                                         message with <tag>…</tag> markup mapped to React elements (never innerHTML)
import { createElement, Fragment } from 'react';
import en from '../locales/en.json';

export const LOCALE = 'en';
const MESSAGES = en;
const plurals = new Intl.PluralRules(LOCALE);

function lookup(key) {
  const node = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), MESSAGES);
  if (node === undefined) {
    if (import.meta.env?.DEV) throw new Error(`i18n: missing message "${key}"`);
    return key;
  }
  return node;
}

export const has = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), MESSAGES) !== undefined;

function interpolate(text, params = {}) {
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

function pick(node, params) {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && 'other' in node) return node[plurals.select(Number(params?.count))] ?? node.other;
  throw new Error('i18n: message is not a string or a plural object');
}

export const t = (key, params) => interpolate(pick(lookup(key), params), params);

export const list = (key) => {
  const node = lookup(key);
  if (!Array.isArray(node)) throw new Error(`i18n: "${key}" is not a list`);
  return node;
};

/** Split "text <a>link</a> text" into plain strings and elements built by `tags.a(children)`. */
export function rich(key, params, tags = {}) {
  const text = t(key, params);
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(/<(\w+)>(.*?)<\/\1>/g)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const make = tags[m[1]];
    out.push(make ? createElement(Fragment, { key: i++ }, make(m[2])) : m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
