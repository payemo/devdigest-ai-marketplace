#!/usr/bin/env node
// Release tooling for versioned plugins (those that set "version" in plugin.json).
// Zero dependencies. Tags are <plugin>--v<version>, the format Claude Code resolves dependency ranges against.
//
//   node scripts/release.mjs prepare <plugin> <patch|minor|major|X.Y.Z> [--no-commit] [--allow-main]
//       Bump "version" in plugin.json, turn CHANGELOG [Unreleased] into a dated section, run the checks,
//       commit. Run it on a branch, open a PR, merge.
//   node scripts/release.mjs tag <plugin> [--push] [--allow-branch]
//       After the release is merged: verify and create the annotated tag <plugin>--v<version> on main.
//   node scripts/release.mjs verify <tag> [--notes]
//       Check a tag against the commit it points at (used by CI); --notes prints the CHANGELOG section.
//
// Common flags: --root <dir> (repository root, default cwd), --dry-run, --skip-checks, --date YYYY-MM-DD.
// Release dependency plugins before the plugins that depend on them (prepare/tag enforce this).
// To undo a bad release use scripts/rollback.mjs.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  bumpVersion, hasEntries, isVersion, parseTag, promoteUnreleased, releasedVersions, sectionFor,
  setVersionInText, tagName, unreleasedBody, compareVersions,
} from './lib/release-lib.mjs';
import { branch, git, hasRemote, isAncestor, isClean, tagExists, tags } from './lib/git.mjs';
import { UsageError, checkDependencies, fail, loadPlugin, parseArgs, runChecks, today } from './lib/release-ops.mjs';

const USAGE = 'usage: release.mjs prepare <plugin> <patch|minor|major|X.Y.Z> | tag <plugin> [--push] | verify <tag> [--notes]\n' +
  '       flags: --root <dir> --dry-run --skip-checks --no-commit --allow-main --allow-branch --date YYYY-MM-DD';

function currentVersion(plugin) {
  const v = plugin.manifest.version;
  if (!v) fail(`${plugin.name} has no "version" in plugin.json: it tracks commits and is not released with tags.\n` +
    `To start versioning it, set "version": "1.0.0" in plugin.json, add a CHANGELOG.md entry "## [1.0.0] - <date>", then run: release.mjs tag ${plugin.name}`);
  if (!isVersion(v)) fail(`${plugin.name}: version "${v}" is not X.Y.Z`);
  return v;
}

function prepare(root, [name, kind], f, log) {
  if (!name || !kind) fail(USAGE);
  const date = f.date || today();
  const plugin = loadPlugin(root, name);
  const current = currentVersion(plugin);
  const existing = tags(root);
  const base = [current, ...releasedVersions(existing, name)].sort(compareVersions).pop();
  const next = bumpVersion(base, kind);

  if (branch(root) === 'main' && !f['allow-main']) fail('refusing to prepare a release on main: use a branch and a PR (or pass --allow-main)');
  if (!isClean(root)) fail('working tree has uncommitted changes to tracked files; commit or stash them first');
  if (tagExists(root, tagName(name, next))) fail(`tag ${tagName(name, next)} already exists`);
  if (plugin.changelog === null) fail(`${plugin.changelogPath} not found`);
  const body = unreleasedBody(plugin.changelog);
  if (body === null) fail(`${plugin.changelogPath} has no "## [Unreleased]" section`);
  if (!hasEntries(body)) fail(`nothing to release: "## [Unreleased]" in ${plugin.changelogPath} has no entries`);
  const depProblems = checkDependencies(root, plugin, existing);
  if (depProblems.length) fail(depProblems.join('\n'));

  const newManifest = setVersionInText(plugin.manifestText, next);
  if (newManifest === null) fail(`could not find a top-level "version" in ${plugin.manifestPath}`);
  log(`${name}: ${current} -> ${next}  (${tagName(name, next)})`);
  if (f['dry-run']) { log('dry run: no files changed'); return; }

  fs.writeFileSync(path.join(root, plugin.manifestPath), newManifest);
  fs.writeFileSync(path.join(root, plugin.changelogPath), promoteUnreleased(plugin.changelog, next, date));
  try {
    if (!f['skip-checks']) runChecks(root, log);
  } catch (e) {
    git(root, ['checkout', '--', plugin.manifestPath, plugin.changelogPath]);
    throw e;
  }
  if (f['no-commit']) { log(`files updated, not committed. Next: commit, merge, then: node scripts/release.mjs tag ${name}`); return; }
  git(root, ['add', plugin.manifestPath, plugin.changelogPath]);
  git(root, ['commit', '-q', '-m', `Release ${name} ${next}`]);
  log(`committed "Release ${name} ${next}". Next: merge it into main, then run: node scripts/release.mjs tag ${name} --push`);
}

/** Checks shared by `tag` and `verify`; `ref` null = working tree. Returns the plugin and version. */
function verifyRelease(root, name, ref, expectedVersion) {
  const plugin = loadPlugin(root, name, ref);
  const version = currentVersion(plugin);
  if (expectedVersion && version !== expectedVersion) fail(`plugin.json says ${version} but the tag is for ${expectedVersion}`);
  if (plugin.changelog === null) fail(`${plugin.changelogPath} not found: every versioned plugin needs a CHANGELOG`);
  const section = sectionFor(plugin.changelog, version);
  if (section === null) fail(`${plugin.changelogPath} has no "## [${version}]" section`);
  if (!hasEntries(section)) fail(`the "## [${version}]" section of ${plugin.changelogPath} is empty`);
  if (plugin.entry.version && plugin.entry.version !== version) fail(`marketplace entry says ${plugin.entry.version}, plugin.json says ${version}: set version in plugin.json only`);
  const problems = checkDependencies(root, plugin, ref ? tags(root).filter((t) => t !== tagName(name, version)) : tags(root));
  if (problems.length) fail(problems.join('\n'));
  return { plugin, version, section };
}

function tag(root, [name], f, log) {
  if (!name) fail(USAGE);
  const plugin = loadPlugin(root, name);
  const version = currentVersion(plugin);
  const t = tagName(name, version);
  if (branch(root) !== 'main' && !f['allow-branch']) fail('tags are created on main after the release is merged (or pass --allow-branch)');
  if (!isClean(root, [plugin.dir], { untracked: true })) fail(`uncommitted changes under ${plugin.dir}`);
  if (tagExists(root, t)) fail(`tag ${t} already exists`);
  const { section } = verifyRelease(root, name, null, version);
  if (hasRemote(root)) {
    git(root, ['fetch', '-q', 'origin'], { allowFail: true });
    if (f.push && !isAncestor(root, 'HEAD', 'origin/main')) fail('HEAD is not on origin/main: push main first so the tag points at published history');
  }
  log(`tag ${t} -> ${git(root, ['rev-parse', '--short', 'HEAD']).out}`);
  if (f['dry-run']) { log('dry run: no tag created'); return; }
  if (!f['skip-checks']) runChecks(root, log);
  git(root, ['tag', '-a', t, '-m', `${name} ${version}\n\n${section}`]);
  if (f.push) { git(root, ['push', 'origin', t]); log(`pushed ${t}`); }
  else log(`created ${t}. Publish it with: git push origin ${t}`);
}

function verify(root, [t], f, log, out) {
  const parsed = t && parseTag(t);
  if (!parsed) fail(`"${t ?? ''}" is not a release tag (<plugin>--v<X.Y.Z>)`);
  if (!tagExists(root, t)) fail(`tag ${t} does not exist in this clone (fetch tags first)`);
  const { section } = verifyRelease(root, parsed.plugin, t, parsed.version);
  (f.notes ? console.error : log)(`${t}: plugin.json, CHANGELOG and dependencies are consistent`);
  if (f.notes) out(section);
}

export function main(argv, { log = console.log, out = console.log, err = console.error } = {}) {
  try {
    const { _: [cmd, ...args], flags } = parseArgs(argv, ['root', 'date']);
    const root = path.resolve(flags.root || process.cwd());
    const run = { prepare, tag, verify }[cmd];
    if (!run) fail(USAGE);
    run(root, args, flags, log, out);
    return 0;
  } catch (e) {
    if (e instanceof UsageError) { err(e.message); return 1; }
    err(e.stack || String(e));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
