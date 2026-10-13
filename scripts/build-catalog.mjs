#!/usr/bin/env node
// Generates the catalog site's data files from the marketplace itself (spec: docs/specs/catalog-site.md §11).
// Zero dependencies.
//
//   node scripts/build-catalog.mjs [--root <dir>] [--out <dir>] [--repo owner/repo] [--branch main] [--base-url <url>]
//
// Writes catalog.json, feed.xml and llms.txt into --out (default catalog-site/public).
// Fails if the structural linter reports errors. Needs full git history (actions/checkout fetch-depth: 0) for
// "last updated" dates and the "What's new" list; without git it still works, with today's date and no changes.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { frontmatterFields, lint } from './validate-marketplace.mjs';

const TEXT_LIMIT = 4000;
const MAX_CHANGES = 100;
const FEED_ENTRIES = 50;

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const posix = (p) => p.split(path.sep).join('/');
const estimateTokens = (s) => Math.ceil(s.length / 4);
const read = (file) => fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
const readJson = (file) => JSON.parse(read(file));

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

function walkMarkdown(dir, out = []) {
  if (!isDir(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMarkdown(full, out);
    else if (e.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

function bodyOf(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '').trim();
}

/** "owner/repo" from the environment or the origin remote; null when neither is available. */
export function detectRepo(root, env = process.env) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const url = git(root, ['remote', 'get-url', 'origin']);
  const m = url && url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

/** GitHub Pages address of a repository: https://<owner>.github.io/<repo>/ (the host is always lower case). */
export function pagesUrl(repo) {
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

/** Context cost: what is always loaded for a component is its name and description (about 4 characters per token). */
const alwaysLoaded = (name, description) => estimateTokens(`${name} ${description}`);

function discoverComponents(plugin, ctx) {
  const { dir, name } = plugin;
  const items = [];
  const rel = (file) => posix(path.relative(ctx.root, file));
  const base = (type, itemName, over) => ({
    type, name: itemName, title: itemName, plugin: name,
    tags: plugin.tags, category: plugin.category, external: false,
    install: plugin.install, ...over,
  });

  for (const e of isDir(path.join(dir, 'skills')) ? fs.readdirSync(path.join(dir, 'skills'), { withFileTypes: true }) : []) {
    const file = path.join(dir, 'skills', e.name, 'SKILL.md');
    if (!e.isDirectory() || !isFile(file)) continue;
    const text = read(file);
    const fm = frontmatterFields(text) || {};
    const itemName = fm.name || e.name;
    const description = fm.description || '';
    items.push(base('skill', itemName, {
      description, path: rel(file), invoke: `/${name}:${itemName}`,
      tokens: alwaysLoaded(itemName, description), text: bodyOf(text).slice(0, TEXT_LIMIT),
    }));
  }

  for (const file of walkMarkdown(path.join(dir, 'agents'))) {
    const text = read(file);
    const fm = frontmatterFields(text) || {};
    const itemName = fm.name || path.basename(file, '.md');
    const description = fm.description || '';
    items.push(base('agent', itemName, {
      description, path: rel(file), invoke: `${name}:${itemName}`,
      tokens: alwaysLoaded(itemName, description), text: bodyOf(text).slice(0, TEXT_LIMIT),
    }));
  }

  for (const file of walkMarkdown(path.join(dir, 'commands'))) {
    const text = read(file);
    const fm = frontmatterFields(text) || {};
    const itemName = path.basename(file, '.md');
    const description = fm.description || '';
    items.push(base('command', itemName, {
      description, path: rel(file), invoke: `/${name}:${itemName}`,
      tokens: alwaysLoaded(itemName, description), text: bodyOf(text).slice(0, TEXT_LIMIT),
    }));
  }

  const hooksFile = path.join(dir, 'hooks', 'hooks.json');
  if (isFile(hooksFile)) {
    const hooks = readJson(hooksFile);
    const events = isObject(hooks.hooks) ? hooks.hooks : hooks;
    for (const [event, groups] of Object.entries(events)) {
      for (const group of Array.isArray(groups) ? groups : []) {
        const matcher = typeof group.matcher === 'string' && group.matcher ? group.matcher : null;
        items.push(base('hook', event, {
          title: matcher ? `${event} · ${matcher}` : event,
          description: `Runs on ${event}${matcher ? ` for ${matcher}` : ''}`,
          path: rel(hooksFile), invoke: null, tokens: 0, text: '',
          idSuffix: matcher ? `${event}:${matcher}` : event,
        }));
      }
    }
  }

  const mcpFile = path.join(dir, '.mcp.json');
  if (isFile(mcpFile)) {
    const mcp = readJson(mcpFile);
    const servers = isObject(mcp.mcpServers) ? mcp.mcpServers : mcp;
    for (const [serverName, cfg] of Object.entries(servers)) {
      if (!isObject(cfg)) continue;
      const description = cfg.url || [cfg.command, ...(Array.isArray(cfg.args) ? cfg.args : [])].filter(Boolean).join(' ');
      items.push(base('mcp', serverName, { description, path: rel(mcpFile), invoke: null, tokens: 0, text: '' }));
    }
  }
  return items;
}

function loadPlugins(root, mp, repo) {
  return mp.plugins.map((entry) => {
    const external = typeof entry.source !== 'string';
    const dir = external ? null : path.resolve(root, entry.source);
    const manifestFile = dir && path.join(dir, '.claude-plugin', 'plugin.json');
    const manifest = manifestFile && isFile(manifestFile) ? readJson(manifestFile) : {};
    return {
      name: entry.name,
      dir,
      external,
      relPath: dir ? posix(path.relative(root, dir)) : null,
      title: entry.displayName || manifest.displayName || entry.name,
      description: entry.description || manifest.description || '',
      tags: entry.tags || entry.keywords || manifest.keywords || [],
      category: typeof entry.category === 'string' ? entry.category : null,
      install: `/plugin install ${entry.name}@${mp.name}`,
      readme: dir && isFile(path.join(dir, 'README.md')) ? bodyOf(read(path.join(dir, 'README.md'))) : '',
    };
  });
}

/** "What's new": non-merge commits, newest first; `plugins` are the plugins whose folder the commit touched. */
function collectChanges(root, plugins) {
  const out = git(root, ['log', '--no-merges', `-n${MAX_CHANGES}`, '--name-only', '--format=%x1e%h%x1f%cs%x1f%s']);
  if (!out) return [];
  const byDir = plugins.filter((p) => p.relPath).map((p) => ({ prefix: `${p.relPath}/`, name: p.name }));
  const changes = [];
  for (const rec of out.split('\x1e').filter(Boolean)) {
    const [head, ...files] = rec.split('\n');
    const [sha, date, subject] = head.split('\x1f');
    const touched = new Set();
    for (const f of files.filter(Boolean)) {
      for (const { prefix, name } of byDir) if (f.startsWith(prefix)) touched.add(name);
    }
    changes.push({ date, sha, subject, plugins: [...touched].sort() });
  }
  return changes;
}

export function buildCatalog(root, { repo, branch = 'main', baseUrl, now = new Date() } = {}) {
  const report = lint(root);
  if (report.errors.length) {
    throw new Error('structural lint failed:\n' + report.errors.map((e) => `  ${e.where}: ${e.msg}`).join('\n'));
  }
  const mp = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  const repoName = repo || detectRepo(root) || 'owner/repo';
  const today = now.toISOString().slice(0, 10);
  const updated = (rel) => (rel && git(root, ['log', '-1', '--format=%cs', '--', rel])) || today;

  const plugins = loadPlugins(root, mp, repoName);
  const artifacts = [];
  for (const plugin of plugins) {
    const components = plugin.external ? [] : discoverComponents(plugin, { root });
    const counts = {};
    const plural = { skill: 'skills', agent: 'agents', command: 'commands', hook: 'hooks', mcp: 'mcp' };
    for (const c of components) counts[plural[c.type]] = (counts[plural[c.type]] || 0) + 1;

    artifacts.push({
      id: `plugin:${plugin.name}`, type: 'plugin', name: plugin.name, title: plugin.title,
      description: plugin.description, plugin: null, invoke: null,
      tags: plugin.tags, category: plugin.category, path: plugin.relPath, install: plugin.install,
      external: plugin.external, updatedAt: updated(plugin.relPath),
      tokens: components.reduce((sum, c) => sum + c.tokens, 0),
      counts: plugin.external ? {} : counts, text: plugin.readme.slice(0, TEXT_LIMIT),
    });
    for (const c of components) {
      const { idSuffix, ...rest } = c;
      artifacts.push({ id: `${c.type}:${plugin.name}/${idSuffix || c.name}`, ...rest, updatedAt: updated(c.path) });
    }
  }

  const ids = new Set();
  for (const a of artifacts) {
    if (ids.has(a.id)) throw new Error(`duplicate artifact id "${a.id}"`);
    ids.add(a.id);
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    commit: git(root, ['rev-parse', '--short', 'HEAD']) || 'unknown',
    marketplace: {
      name: mp.name,
      description: mp.description || mp.metadata?.description || '',
      owner: mp.owner?.name || '',
      repo: repoName,
      branch,
      baseUrl: baseUrl || pagesUrl(repoName),
    },
    categories: [...new Set(artifacts.map((a) => a.category).filter(Boolean))].sort(),
    artifacts,
    changes: collectChanges(root, plugins),
  };
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Atom feed of the latest changes, absolute URLs only. */
export function buildFeed(catalog) {
  const { marketplace: m, changes, generatedAt } = catalog;
  const gh = `https://github.com/${m.repo}`;
  const entries = changes.slice(0, FEED_ENTRIES).map((c) => [
    '  <entry>',
    `    <title>${xml(c.plugins.length ? `${c.plugins.join(', ')}: ${c.subject}` : c.subject)}</title>`,
    `    <id>${xml(`${gh}/commit/${c.sha}`)}</id>`,
    `    <link href="${xml(`${gh}/commit/${c.sha}`)}"/>`,
    `    <updated>${c.date}T00:00:00Z</updated>`,
    '  </entry>',
  ].join('\n'));
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${xml(m.name)}: what's new</title>`,
    `  <id>${xml(m.baseUrl)}</id>`,
    `  <link href="${xml(m.baseUrl)}"/>`,
    `  <link rel="self" href="${xml(new URL('feed.xml', m.baseUrl).href)}"/>`,
    `  <updated>${generatedAt}</updated>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

/** llms.txt: marketplace summary, then one line per plugin with its install command. */
export function buildLlmsTxt(catalog) {
  const { marketplace: m, artifacts } = catalog;
  const gh = `https://github.com/${m.repo}`;
  const lines = [`# ${m.name}`, '', `> ${m.description}`, '', `Catalog: ${m.baseUrl}`, `Data: ${new URL('catalog.json', m.baseUrl).href}`, '', '## Plugins', ''];
  for (const p of artifacts.filter((a) => a.type === 'plugin')) {
    const url = p.path ? `${gh}/tree/${m.branch}/${p.path}` : gh;
    lines.push(`- [${p.name}](${url}): ${p.description.replace(/[.\s]+$/, '')}. Install: \`${p.install}\``);
  }
  return lines.join('\n') + '\n';
}

export function writeCatalog(root, outDir, options) {
  const catalog = buildCatalog(root, options);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'feed.xml'), buildFeed(catalog));
  fs.writeFileSync(path.join(outDir, 'llms.txt'), buildLlmsTxt(catalog));
  return catalog;
}

function main(argv) {
  let root = path.resolve(import.meta.dirname, '..'); // the repository, wherever the script is run from
  let out;
  const options = {};
  const value = (i) => { if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`); return argv[i + 1]; };
  try {
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--root') root = path.resolve(value(i++));
      else if (argv[i] === '--out') out = path.resolve(value(i++));
      else if (argv[i] === '--repo') options.repo = value(i++);
      else if (argv[i] === '--branch') options.branch = value(i++);
      else if (argv[i] === '--base-url') options.baseUrl = value(i++);
      else throw new Error(`unknown argument: ${argv[i]}`);
    }
    out ||= path.join(root, 'catalog-site', 'public');
    const catalog = writeCatalog(root, out, options);
    const plugins = catalog.artifacts.filter((a) => a.type === 'plugin').length;
    console.log(`✔ catalog: ${plugins} plugin(s), ${catalog.artifacts.length} artifact(s), ${catalog.changes.length} change(s) → ${path.relative(process.cwd(), out) || '.'}`);
    return 0;
  } catch (err) {
    console.error(`${err.message}\nusage: build-catalog.mjs [--root <dir>] [--out <dir>] [--repo owner/repo] [--branch main] [--base-url <url>]`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
