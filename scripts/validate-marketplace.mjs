#!/usr/bin/env node
// Structural linter for a Claude Code plugin marketplace repository.
// Zero dependencies. Complements `claude plugin validate`: it needs no CLI and
// catches problems that validate passes (missing source dir, misplaced hooks,
// name mismatches) or only warns about.
//
// Usage: node scripts/validate-marketplace.mjs [--root <dir>] [--strict]
//   --strict   treat warnings as errors
// Exit code: 0 clean, 1 errors (or warnings with --strict), 2 bad usage.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const RESERVED_MARKETPLACE_NAMES = new Set([
  'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official',
  'anthropic-marketplace', 'anthropic-plugins', 'agent-skills', 'anthropic-agent-skills',
  'life-sciences', 'knowledge-work-plugins', 'claude-for-legal',
  'claude-for-financial-services', 'financial-services-plugins', 'first-party-plugins',
  'claude-tag-plugins', 'claude-community', 'claude-plugins-community', 'healthcare',
  'anthropic-plugin-directory', 'claude-plugin-directory',
  'inline', 'builtin', 'skills-dir', 'synced', 'claude-plugin-test',
  'npm', 'pip', 'uv', 'cargo', 'github', 'gh',
  'constructor', 'hasownproperty', 'isprototypeof', 'propertyisenumerable',
  'tolocalestring', 'tostring', 'valueof',
]);
const RESERVED_PLUGIN_PREFIXES = ['claude-', 'anthropic-', 'anthropics-', 'cc-plugin-'];
const RESERVED_PLUGIN_NAMES = new Set(['claude', 'anthropic', 'anthropics', 'claude-code', 'claude-mods']);

const KNOWN_TOP_LEVEL = new Set([
  '$schema', 'name', 'owner', 'plugins', 'description', 'version', 'metadata',
  'forceRemoveDeletedPlugins', 'allowCrossMarketplaceDependenciesOn', 'renames',
]);
const KNOWN_SOURCE_TYPES = {
  github: ['repo'],
  url: ['url'],
  'git-subdir': ['url', 'path'],
  npm: ['package'],
  archive: ['url'],
  command: ['command'],
};
// Component keys of plugin.json / entries whose values are paths relative to the plugin root.
const PATH_COMPONENT_KEYS = ['skills', 'commands', 'agents', 'outputStyles', 'workflows'];

// Versioned plugins (those that set "version" in plugin.json) are the publishable, project-neutral ones.
// Their shipped files must not carry couplings to the project they were extracted from.
// This marketplace's own name and repository name are legitimate (install commands name them) and are stripped
// before matching.
const SELF_REFERENCE_RE = /devdigest-(?:ai-)?marketplace/gi;
const FORBIDDEN_STRINGS = [
  { re: /dev-?digest/i, why: 'project name "DevDigest" (plugins must be project-neutral)' },
  { re: /@devdigest\//i, why: 'DevDigest package scope' },
  { re: /INSIGHTS\.md/, why: 'source-repository context file INSIGHTS.md (make it an input)' },
  { re: /(?:^|[^\w-])routing\.md/, why: 'source-repository file routing.md (use an explicit routing table)' },
  { re: /repo-rules\.md/, why: 'source-repository file repo-rules.md' },
  { re: /\.claude\/(?:skills|agents)\//, why: 'hardcoded .claude/skills|agents path (use ${CLAUDE_SKILL_DIR} or the plugin namespace)' },
  { re: /reviewer-core/, why: 'source-repository package reviewer-core' },
  { re: /agent-runner/, why: 'source-repository package agent-runner' },
];
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt', '.mjs', '.js', '.ts', '.tsx', '.sh', '.py', '.toml', '.html', '.css']);
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

class Report {
  constructor() { this.errors = []; this.warnings = []; }
  error(where, msg) { this.errors.push({ where, msg }); }
  warn(where, msg) { this.warnings.push({ where, msg }); }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

function readJson(file, report, where) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    report.error(where, `cannot read file: ${e.message}`);
    return undefined;
  }
  try { return JSON.parse(raw); } catch (e) {
    report.error(where, `invalid JSON: ${e.message}`);
    return undefined;
  }
}

function parseFrontmatter(text) {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return undefined;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

// A relative path from a manifest/entry: must be "./…", no "..", no backslashes.
function checkRelPath(value, where, report) {
  if (typeof value !== 'string') return false;
  if (value.includes('\\')) { report.error(where, `path "${value}" contains a backslash; use forward slashes`); return false; }
  if (!value.startsWith('./') && value !== '.') { report.error(where, `path "${value}" must start with "./"`); return false; }
  if (value.split('/').includes('..')) { report.error(where, `path "${value}" contains ".."`); return false; }
  return true;
}

function lintMarketplaceFields(mp, report) {
  const where = '.claude-plugin/marketplace.json';
  for (const key of Object.keys(mp)) {
    if (!KNOWN_TOP_LEVEL.has(key)) report.warn(where, `unknown top-level field "${key}" (ignored by Claude Code, likely a typo)`);
  }
  if (typeof mp.name !== 'string' || !mp.name) {
    report.error(where, 'missing "name"');
  } else {
    if (!NAME_RE.test(mp.name) || mp.name.includes('..')) report.error(where, `invalid marketplace name "${mp.name}" (letters, digits, ".", "_", "-"; start alphanumeric; no "..")`);
    if (RESERVED_MARKETPLACE_NAMES.has(mp.name.toLowerCase())) report.error(where, `marketplace name "${mp.name}" is reserved`);
    if (mp.name.toLowerCase().startsWith('claudeai-')) report.error(where, 'names starting with "claudeai-" are reserved for claude.ai marketplaces');
    if (/(claude|anthropic).*official|official.*(claude|anthropic)/i.test(mp.name)) report.error(where, `marketplace name "${mp.name}" impersonates an official marketplace`);
    if (mp.name.length > 128) report.warn(where, 'marketplace name longer than 128 chars is rejected by Claude Desktop');
  }
  if (!isObject(mp.owner) || typeof mp.owner.name !== 'string' || !mp.owner.name.trim()) report.error(where, '"owner.name" is required');
  if (typeof mp.description !== 'string' || !mp.description.trim()) {
    if (!(isObject(mp.metadata) && mp.metadata.description)) report.warn(where, 'no marketplace "description"');
  }
  if (!Array.isArray(mp.plugins)) report.error(where, '"plugins" must be an array');
  else if (mp.plugins.length === 0) report.warn(where, 'marketplace has no plugins');
}

function lintRenames(mp, pluginNames, report) {
  if (mp.renames === undefined) return;
  const where = '.claude-plugin/marketplace.json renames';
  if (!isObject(mp.renames)) { report.error(where, '"renames" must be an object'); return; }
  for (const start of Object.keys(mp.renames)) {
    const seen = new Set([start]);
    let cur = start;
    for (;;) {
      const next = mp.renames[cur];
      if (next === null) break;
      if (typeof next !== 'string') { report.error(where, `"${start}": target must be a string or null`); break; }
      if (pluginNames.has(next)) break;
      if (seen.has(next)) { report.error(where, `"${start}": chain cycles at "${next}"`); break; }
      if (!(next in mp.renames)) { report.error(where, `"${start}": chain does not resolve (target "${next}" is not a plugin, a key in renames, or null)`); break; }
      seen.add(next);
      cur = next;
    }
  }
}

function lintSource(entry, idx, report) {
  const where = `plugins[${idx}] (${entry.name})`;
  const { source } = entry;
  if (typeof source === 'string') return true;
  if (!isObject(source)) { report.error(where, '"source" must be a string or an object'); return false; }
  const required = KNOWN_SOURCE_TYPES[source.source];
  if (!required) { report.error(where, `unknown source type "${source.source}" (expected one of ${Object.keys(KNOWN_SOURCE_TYPES).join(', ')})`); return false; }
  for (const f of required) {
    if (typeof source[f] !== 'string' || !source[f]) report.error(where, `source type "${source.source}" requires "${f}"`);
  }
  if (source.source === 'github' && typeof source.repo === 'string' && !/^[\w.-]+\/[\w.-]+$/.test(source.repo)) {
    report.error(where, `github "repo" must look like owner/repo, got "${source.repo}"`);
  }
  if (source.source === 'archive') {
    if (typeof source.url === 'string' && !source.url.startsWith('https://')) report.error(where, 'archive "url" must use https://');
    if (!source.sha256) report.warn(where, 'archive source has no "sha256" pin');
  }
  if (source.sha !== undefined && !/^[0-9a-f]{40}$/.test(source.sha)) report.error(where, '"sha" must be a full 40-char lowercase commit SHA');
  if (['github', 'url', 'git-subdir'].includes(source.source) && !source.ref && !source.sha) {
    report.warn(where, 'external source is not pinned (set "ref" or "sha" to avoid unreviewed upstream changes)');
  }
  return false;
}

function lintSkills(pluginDir, rel, report) {
  const skillsDir = path.join(pluginDir, 'skills');
  if (!isDir(skillsDir)) return;
  for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const where = `${rel}/skills/${d.name}`;
    const skillFile = path.join(skillsDir, d.name, 'SKILL.md');
    if (!isFile(skillFile)) { report.error(where, 'missing SKILL.md'); continue; }
    const fm = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
    if (!fm) { report.error(`${where}/SKILL.md`, 'missing YAML frontmatter'); continue; }
    if (!fm.name) report.error(`${where}/SKILL.md`, 'frontmatter is missing "name"');
    else if (fm.name !== d.name) report.error(`${where}/SKILL.md`, `frontmatter name "${fm.name}" differs from folder name "${d.name}"`);
    if (!fm.description) report.error(`${where}/SKILL.md`, 'frontmatter is missing "description"');
  }
}

function walkFiles(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === '.git') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walkFiles(p, out);
    else if (d.isFile()) out.push(p);
  }
  return out;
}

function lintPluginDir(entry, idx, pluginDir, rel, report) {
  const where = rel;

  // .claude-plugin/ may hold only plugin.json
  const metaDir = path.join(pluginDir, '.claude-plugin');
  if (isDir(metaDir)) {
    for (const f of fs.readdirSync(metaDir)) {
      if (f !== 'plugin.json') report.error(`${where}/.claude-plugin`, `"${f}" must live at the plugin root, not inside .claude-plugin/`);
    }
  }

  const manifestPath = path.join(metaDir, 'plugin.json');
  let manifest;
  if (isFile(manifestPath)) {
    manifest = readJson(manifestPath, report, `${where}/.claude-plugin/plugin.json`);
  } else {
    report.warn(where, 'no .claude-plugin/plugin.json (name/version/description/author are recommended)');
  }

  if (isObject(manifest)) {
    const mwhere = `${where}/.claude-plugin/plugin.json`;
    if (typeof manifest.name !== 'string' || !manifest.name) report.error(mwhere, 'missing "name"');
    else {
      if (manifest.name !== entry.name) report.error(mwhere, `name "${manifest.name}" differs from marketplace entry name "${entry.name}" (installs by manifest name will fail)`);
      if (!KEBAB_RE.test(manifest.name)) report.warn(mwhere, `name "${manifest.name}" is not kebab-case`);
    }
    if (manifest.version !== undefined && entry.version !== undefined) {
      report.error(mwhere, `"version" is set both here ("${manifest.version}") and in the marketplace entry ("${entry.version}"); plugin.json silently wins. Set it in one place or omit it`);
    }
    for (const f of ['description', 'author']) if (!manifest[f]) report.warn(mwhere, `missing "${f}"`);
    if (manifest.homepage !== undefined) {
      try { new URL(manifest.homepage); } catch { report.error(mwhere, `"homepage" is not a valid URL (the plugin will fail to load)`); }
    }
    for (const key of PATH_COMPONENT_KEYS) {
      const vals = manifest[key] === undefined ? [] : [].concat(typeof manifest[key] === 'string' || Array.isArray(manifest[key]) ? manifest[key] : []);
      for (const v of vals) {
        if (!checkRelPath(v, `${mwhere} ${key}`, report)) continue;
        if (!fs.existsSync(path.join(pluginDir, v))) report.error(`${mwhere} ${key}`, `path "${v}" does not exist`);
      }
    }
    if (typeof manifest.hooks === 'string') {
      if (checkRelPath(manifest.hooks, `${mwhere} hooks`, report) && !isFile(path.join(pluginDir, manifest.hooks))) report.error(`${mwhere} hooks`, `file "${manifest.hooks}" does not exist`);
    }
  }

  // hooks/hooks.json must wrap events in a top-level "hooks" key
  const hooksFile = path.join(pluginDir, 'hooks', 'hooks.json');
  if (isFile(hooksFile)) {
    const h = readJson(hooksFile, report, `${where}/hooks/hooks.json`);
    if (isObject(h) && !isObject(h.hooks)) report.error(`${where}/hooks/hooks.json`, 'must have a top-level "hooks" object wrapping the event map');
  }
  const mcpFile = path.join(pluginDir, '.mcp.json');
  if (isFile(mcpFile)) readJson(mcpFile, report, `${where}/.mcp.json`);

  if (isFile(path.join(pluginDir, 'CLAUDE.md'))) report.warn(where, 'CLAUDE.md at plugin root is not loaded as context; put instructions in a skill');
  if (isDir(path.join(pluginDir, 'bin'))) report.warn(where, 'top-level bin/ is rejected by claude.ai/Cowork org sync; keep executables in scripts/');

  lintSkills(pluginDir, where, report);

  // shell scripts should be executable
  if (process.platform !== 'win32') {
    for (const f of walkFiles(pluginDir)) {
      if (f.endsWith('.sh') && !(fs.statSync(f).mode & 0o111)) {
        report.warn(`${where}/${path.relative(pluginDir, f).split(path.sep).join('/')}`, 'shell script is not executable (chmod +x)');
      }
    }
  }
  return isObject(manifest) ? { name: entry.name, dir: pluginDir, rel, manifest } : undefined;
}

// ---- cross-plugin checks: dependencies, namespace use, release files, forbidden strings, read-only agents ----

// A pragmatic node-semver range check: comparator sets joined by "||", comparators like ^1.2.3, ~1.2, >=1, 1.x, =1.0.0.
const COMPARATOR_RE = /^(?:\^|~|>=|<=|>|<|=)?v?\d+(?:\.(?:\d+|x|\*)(?:\.(?:\d+|x|\*)(?:-[\w.]+)?)?)?$|^\*$/;
export function isValidRange(range) {
  if (typeof range !== 'string' || !range.trim()) return false;
  return range.split('||').every((set) => {
    const parts = set.trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every((c) => COMPARATOR_RE.test(c));
  });
}

function normalizeDependencies(manifest, where, report) {
  if (manifest.dependencies === undefined) return [];
  if (!Array.isArray(manifest.dependencies)) { report.error(where, '"dependencies" must be an array of "name" strings or { name, version?, marketplace? } objects'); return []; }
  const out = [];
  manifest.dependencies.forEach((d, i) => {
    const w = `${where} dependencies[${i}]`;
    if (typeof d === 'string') {
      const [name, marketplace] = d.split('@');
      if (!name) { report.error(w, `invalid dependency "${d}"`); return; }
      out.push({ name, marketplace, w });
    } else if (isObject(d)) {
      if (typeof d.name !== 'string' || !d.name) { report.error(w, 'missing "name"'); return; }
      if (d.version !== undefined && !isValidRange(d.version)) report.error(w, `"version" range "${d.version}" is not a valid semver range`);
      out.push({ name: d.name, marketplace: d.marketplace, version: d.version, w });
    } else {
      report.error(w, 'must be a string or an object');
    }
  });
  return out;
}

function isTextFile(file) { return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()); }

// Minimal frontmatter reader that understands folded/literal blocks (`description: >`), which parseFrontmatter does not.
export function frontmatterFields(text) {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return undefined;
  const fields = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (/^[>|][+-]?$/.test(value.trim())) {
      value = '';
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) value += ' ' + lines[++i].trim();
    }
    fields[kv[1]] = value.replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

function lintAgents(plugin, report) {
  const dir = path.join(plugin.dir, 'agents');
  if (!isDir(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const where = `${plugin.rel}/agents/${f}`;
    const fm = frontmatterFields(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!fm) { report.error(where, 'missing YAML frontmatter'); continue; }
    if (!fm.name) report.error(where, 'frontmatter is missing "name"');
    else if (fm.name !== f.replace(/\.md$/, '')) report.error(where, `frontmatter name "${fm.name}" differs from file name "${f}"`);
    if (!fm.description) report.error(where, 'frontmatter is missing "description"');
    if (/read-only/i.test(fm.description ?? '') && fm.tools) {
      const tools = fm.tools.split(',').map((t) => t.trim());
      const bad = tools.filter((t) => WRITE_TOOLS.includes(t));
      if (bad.length) report.error(where, `agent describes itself as read-only but lists write tool(s) in "tools": ${bad.join(', ')}`);
    }
  }
}

function lintVersionedFiles(plugin, report) {
  const version = plugin.manifest.version;
  if (version === undefined) return;
  if (!isFile(path.join(plugin.dir, 'README.md'))) report.error(plugin.rel, 'versioned plugin has no README.md');
  const changelog = path.join(plugin.dir, 'CHANGELOG.md');
  if (!isFile(changelog)) { report.error(plugin.rel, 'versioned plugin has no CHANGELOG.md'); return; }
  const re = new RegExp(`^## \\[${String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm');
  if (!re.test(fs.readFileSync(changelog, 'utf8'))) report.error(`${plugin.rel}/CHANGELOG.md`, `no "## [${version}]" entry for the version set in plugin.json`);
}

function scanShippedFiles(plugin, nsRe, declared, report) {
  const forbidden = plugin.manifest.version !== undefined;
  for (const file of walkFiles(plugin.dir)) {
    const relFile = path.relative(plugin.dir, file).split(path.sep).join('/');
    if (!isTextFile(file) || fs.statSync(file).size > 2_000_000) continue;
    const where = `${plugin.rel}/${relFile}`;
    const text = fs.readFileSync(file, 'utf8');

    // namespace use (all plugins, including the manifest-free text of agents/skills/READMEs)
    if (relFile !== '.claude-plugin/plugin.json' && nsRe) {
      const seen = new Set();
      for (const m of text.matchAll(nsRe)) {
        const dep = m[1];
        if (dep === plugin.name || declared.has(dep) || seen.has(dep)) continue;
        seen.add(dep);
        report.error(where, `references "${m[0]}" but "${dep}" is not in this plugin's dependencies (declare it in plugin.json)`);
      }
    }

    // forbidden strings (versioned plugins only; the manifest's own author/owner fields are exempt)
    if (forbidden && relFile !== '.claude-plugin/plugin.json') {
      const cleaned = text.replace(SELF_REFERENCE_RE, '');
      const lines = cleaned.split(/\r?\n/);
      for (const { re, why } of FORBIDDEN_STRINGS) {
        const i = lines.findIndex((l) => re.test(l));
        if (i !== -1) report.error(`${where}:${i + 1}`, `forbidden string: ${why}`);
      }
    }
  }
}

function lintCrossPlugin(plugins, mpName, report) {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const names = [...byName.keys()];
  const nsRe = names.length
    ? new RegExp(`(?<![\\w-])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):[a-z][\\w-]*`, 'g')
    : null;

  const graph = new Map();
  for (const plugin of plugins) {
    const mwhere = `${plugin.rel}/.claude-plugin/plugin.json`;
    const deps = normalizeDependencies(plugin.manifest, mwhere, report);
    const declared = new Set();
    const edges = [];
    for (const d of deps) {
      const sameMarketplace = !d.marketplace || d.marketplace === mpName;
      if (!sameMarketplace) continue; // cross-marketplace deps are governed by allowCrossMarketplaceDependenciesOn
      if (!byName.has(d.name)) { report.error(d.w, `dependency "${d.name}" does not exist in this marketplace`); continue; }
      if (d.name === plugin.name) { report.error(d.w, 'a plugin cannot depend on itself'); continue; }
      declared.add(d.name);
      edges.push(d.name);
      const target = byName.get(d.name);
      if (d.version && target.manifest.version === undefined) report.error(d.w, `"${d.name}" has no "version" in plugin.json, so the range "${d.version}" can never be satisfied`);
    }
    graph.set(plugin.name, edges);
    scanShippedFiles(plugin, nsRe, declared, report);
    lintVersionedFiles(plugin, report);
    lintAgents(plugin, report);
  }

  // cycles
  const state = new Map();
  const stack = [];
  const visit = (n) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'active') { report.error('dependencies', `dependency cycle: ${[...stack.slice(stack.indexOf(n)), n].join(' -> ')}`); return; }
    state.set(n, 'active'); stack.push(n);
    for (const m of graph.get(n) ?? []) visit(m);
    stack.pop(); state.set(n, 'done');
  };
  for (const n of graph.keys()) visit(n);
}

export function lint(root) {
  const report = new Report();
  const mpFile = path.join(root, '.claude-plugin', 'marketplace.json');
  if (!isFile(mpFile)) {
    report.error('.claude-plugin/marketplace.json', 'file not found');
    return report;
  }
  const mp = readJson(mpFile, report, '.claude-plugin/marketplace.json');
  if (!isObject(mp)) {
    if (mp !== undefined) report.error('.claude-plugin/marketplace.json', 'root must be a JSON object');
    return report;
  }
  lintMarketplaceFields(mp, report);
  if (!Array.isArray(mp.plugins)) return report;

  const names = new Set();
  const referencedDirs = new Set();
  const loaded = [];
  mp.plugins.forEach((entry, idx) => {
    const where = `plugins[${idx}]`;
    if (!isObject(entry)) { report.error(where, 'entry must be an object'); return; }
    if (typeof entry.name !== 'string' || !entry.name) { report.error(where, 'missing "name"'); return; }
    const ewhere = `${where} (${entry.name})`;
    if (!NAME_RE.test(entry.name)) report.error(ewhere, `invalid plugin name (letters, digits, ".", "_", "-"; start alphanumeric)`);
    if (names.has(entry.name)) report.error(ewhere, 'duplicate plugin name');
    names.add(entry.name);
    const lower = entry.name.toLowerCase();
    if (RESERVED_PLUGIN_NAMES.has(lower) || RESERVED_PLUGIN_PREFIXES.some((p) => lower.startsWith(p))) {
      report.error(ewhere, 'plugin name passes as one of Anthropic\'s own (reserved prefix/name)');
    }
    if (!KEBAB_RE.test(entry.name)) report.warn(ewhere, 'plugin name is not kebab-case');
    if (!entry.description) report.warn(ewhere, 'missing "description" (shown in /plugin listings)');
    if (entry.source === undefined) { report.error(ewhere, 'missing "source"'); return; }

    // hooks in an entry must be an inline object
    if (entry.hooks !== undefined && !isObject(entry.hooks)) {
      report.error(ewhere, '"hooks" in a marketplace entry must be an inline object; a file path/array never runs. Put file-based hooks in the plugin\'s hooks/hooks.json');
    }
    if (entry.strict === false && ['commands', 'agents', 'skills', 'hooks', 'outputStyles', 'themes'].some((k) => entry[k] !== undefined) && entry.source !== undefined) {
      report.warn(ewhere, '"strict": false with component fields conflicts if the plugin also ships plugin.json');
    }

    const isRelative = lintSource(entry, idx, report);
    if (!isRelative) return;
    const src = entry.source;
    if (!checkRelPath(src, ewhere + ' source', report)) return;
    const pluginDir = path.resolve(root, src);
    if (path.relative(root, pluginDir).startsWith('..')) { report.error(ewhere, `source "${src}" escapes the marketplace root`); return; }
    if (!isDir(pluginDir)) { report.error(ewhere, `source directory "${src}" does not exist (validate passes this; install fails)`); return; }
    referencedDirs.add(pluginDir);
    const info = lintPluginDir(entry, idx, pluginDir, path.relative(root, pluginDir).split(path.sep).join('/'), report);
    if (info) loaded.push(info);
  });

  lintCrossPlugin(loaded, mp.name, report);

  lintRenames(mp, names, report);

  // orphans: directories under plugins/ that no entry references
  const pluginsRoot = path.join(root, 'plugins');
  if (isDir(pluginsRoot)) {
    for (const d of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (d.isDirectory() && !referencedDirs.has(path.join(pluginsRoot, d.name))) {
        report.warn(`plugins/${d.name}`, 'directory is not referenced by any marketplace entry');
      }
    }
  }
  return report;
}

function main(argv) {
  let root = process.cwd();
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--strict') strict = true;
    else { console.error(`unknown argument: ${argv[i]}\nusage: validate-marketplace.mjs [--root <dir>] [--strict]`); return 2; }
  }
  const { errors, warnings } = lint(root);
  for (const { where, msg } of errors) console.error(`error   ${where}: ${msg}`);
  for (const { where, msg } of warnings) console.warn(`warning ${where}: ${msg}`);
  const failed = errors.length > 0 || (strict && warnings.length > 0);
  console.log(`${failed ? '✖' : '✔'} ${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' (strict)' : ''}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
