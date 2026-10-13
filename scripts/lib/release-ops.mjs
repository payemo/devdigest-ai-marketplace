// I/O helpers shared by release.mjs and rollback.mjs: read a plugin (from disk or a git ref), check its
// dependencies against existing tags, run the repo's checks.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDependencies, releasedVersions, satisfies } from './release-lib.mjs';
import { showAt, tags } from './git.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARKETPLACE = '.claude-plugin/marketplace.json';

export class UsageError extends Error {}
export const fail = (msg) => { throw new UsageError(msg); };

/** Minimal flag parser: returns { _: positionals, flags }. Flags in `withValue` take the next argument. */
export function parseArgs(argv, withValue = []) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (withValue.includes(key)) {
      if (argv[i + 1] === undefined) fail(`--${key} needs a value`);
      out.flags[key] = argv[++i];
    } else out.flags[key] = true;
  }
  return out;
}

/** Read a file from the working tree (ref = null) or from a git ref. Returns null if missing. */
function read(root, ref, rel) {
  if (ref) return showAt(root, ref, rel);
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

/**
 * Locate and read one plugin. Only relative-path plugins ("./plugins/x") are released from this repo.
 * Returns { name, dir, manifestPath, manifestText, manifest, changelogPath, changelog, marketplace }.
 */
export function loadPlugin(root, name, ref = null) {
  const mpText = read(root, ref, MARKETPLACE);
  if (mpText === null) fail(`${MARKETPLACE} not found${ref ? ` at ${ref}` : ''} (is --root the repository root?)`);
  const marketplace = JSON.parse(mpText);
  const entry = (marketplace.plugins || []).find((p) => p.name === name);
  if (!entry) fail(`plugin "${name}" is not listed in ${MARKETPLACE}`);
  if (typeof entry.source !== 'string' || !entry.source.startsWith('./')) {
    fail(`plugin "${name}" has a non-relative source; its releases are tagged in its own repository, not here`);
  }
  const dir = path.posix.normalize(entry.source);
  const manifestPath = `${dir}/.claude-plugin/plugin.json`;
  const manifestText = read(root, ref, manifestPath);
  if (manifestText === null) fail(`${manifestPath} not found${ref ? ` at ${ref}` : ''}`);
  const changelogPath = `${dir}/CHANGELOG.md`;
  return { name, dir, entry, marketplace, manifestPath, manifestText, manifest: JSON.parse(manifestText), changelogPath, changelog: read(root, ref, changelogPath) };
}

/** Every same-marketplace dependency that declares a range must already have a tag satisfying it. */
export function checkDependencies(root, plugin, existingTags = tags(root)) {
  const problems = [];
  const known = new Set((plugin.marketplace.plugins || []).map((p) => p.name));
  for (const dep of readDependencies(plugin.manifest)) {
    if (dep.marketplace && dep.marketplace !== plugin.marketplace.name) continue; // other marketplace: not ours to tag
    if (!known.has(dep.name)) { problems.push(`dependency "${dep.name}" is not a plugin of this marketplace`); continue; }
    if (!dep.range) continue;
    let ok;
    try { ok = releasedVersions(existingTags, dep.name).some((v) => satisfies(v, dep.range)); }
    catch (e) { problems.push(`dependency "${dep.name}": ${e.message}`); continue; }
    if (!ok) problems.push(`dependency "${dep.name}" ${dep.range} has no release tag yet — release ${dep.name} first (tag ${dep.name}--v<version>)`);
  }
  return problems;
}

/** Repo linter (strict) and, when the CLI is installed, the official validator. */
export function runChecks(root, log = console.log) {
  log('› structural lint');
  const lint = spawnSync(process.execPath, [path.join(HERE, '..', 'validate-marketplace.mjs'), '--root', root, '--strict'], { encoding: 'utf8' });
  if (lint.status !== 0) fail(`lint failed:\n${(lint.stdout + lint.stderr).trim()}`);
  const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (cli.error || cli.status !== 0) { log('› claude CLI not found, skipping `claude plugin validate`'); return; }
  log('› claude plugin validate');
  const v = spawnSync('claude', ['plugin', 'validate', '.'], { cwd: root, encoding: 'utf8' });
  if (v.status !== 0) fail(`claude plugin validate failed:\n${(v.stdout + v.stderr).trim()}`);
}

export const today = () => new Date().toISOString().slice(0, 10);
