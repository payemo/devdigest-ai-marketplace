#!/usr/bin/env node
// Roll a versioned plugin back by publishing a NEW, higher version with the content of an older release.
//
//   node scripts/rollback.mjs <plugin> --to <version> [--bump patch|minor|X.Y.Z] [--reason "<text>"]
//                             [--no-commit] [--dry-run] [--skip-checks] [--root <dir>] [--date YYYY-MM-DD]
//
// Why not just revert? Claude Code keys a plugin's cache on "version" from plugin.json: users who already have the bad
// release keep it until the version string changes, so a revert under the same version never reaches them.
// Rolling forward (1.3.0 is bad -> publish 1.3.1 with the 1.2.0 content) does. Dependents with ^ ranges pick it up
// because constraints resolve to the highest matching tag.
//
// The script restores plugins/<plugin>/ from the tag <plugin>--v<version>, bumps the version, adds a CHANGELOG entry
// (history is kept, not rewritten) and commits. Then merge it and run: release.mjs tag <plugin> --push.
// Plugins without a "version" track commits: roll those back with `git revert` instead.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  bumpVersion, compareVersions, hasEntries, insertReleaseSection, isVersion, releasedVersions, setVersionInText,
  tagName, unreleasedBody,
} from './lib/release-lib.mjs';
import { branch, git, isAncestor, isClean, tagExists, tags } from './lib/git.mjs';
import { UsageError, fail, loadPlugin, parseArgs, runChecks, today } from './lib/release-ops.mjs';

const USAGE = 'usage: rollback.mjs <plugin> --to <version> [--bump patch|minor|X.Y.Z] [--reason "<text>"] [--no-commit] [--dry-run] [--skip-checks] [--allow-main] [--root <dir>]';

export function main(argv, { log = console.log, err = console.error } = {}) {
  try {
    const { _: [name], flags: f } = parseArgs(argv, ['root', 'date', 'to', 'bump', 'reason']);
    if (!name || !f.to) fail(USAGE);
    if (!isVersion(f.to)) fail(`--to "${f.to}" is not X.Y.Z`);
    const root = path.resolve(f.root || process.cwd());
    const date = f.date || today();

    const plugin = loadPlugin(root, name);
    const current = plugin.manifest.version;
    if (!current) fail(`${name} has no "version": it tracks commits, so roll it back with \`git revert <commit>\` (users get the new commit automatically).`);
    const target = tagName(name, f.to);
    if (!tagExists(root, target)) fail(`tag ${target} does not exist (known releases: ${releasedVersions(tags(root), name).join(', ') || 'none'})`);
    if (!isAncestor(root, target, 'HEAD')) fail(`${target} is not an ancestor of HEAD`);

    const released = releasedVersions(tags(root), name);
    const base = [current, ...released].sort(compareVersions).pop();
    if (compareVersions(f.to, base) >= 0) fail(`${f.to} is not older than the latest release ${base}: nothing to roll back`);
    const next = bumpVersion(base, f.bump || 'patch');
    const reverted = released.filter((v) => compareVersions(v, f.to) > 0).reverse();

    if (branch(root) === 'main' && !f['allow-main']) fail('refusing to roll back on main: use a branch and a PR (or pass --allow-main)');
    if (!isClean(root)) fail('working tree has uncommitted changes to tracked files; commit or stash them first');
    if (tagExists(root, tagName(name, next))) fail(`tag ${tagName(name, next)} already exists`);
    if (plugin.changelog === null) fail(`${plugin.changelogPath} not found`);

    log(`${name}: restore the content of ${f.to}, publish as ${next} (replaces ${reverted.join(', ')})`);
    log(git(root, ['diff', '--stat', target, 'HEAD', '--', plugin.dir]).out || '(no content difference)');
    if (f['dry-run']) { log('dry run: no files changed'); return 0; }

    // Restore the plugin directory exactly as it was at the target tag, then re-apply the version and CHANGELOG.
    git(root, ['rm', '-rq', '--ignore-unmatch', '--', plugin.dir]);
    git(root, ['checkout', target, '--', plugin.dir]);
    try {
      const restored = fs.readFileSync(path.join(root, plugin.manifestPath), 'utf8');
      const manifest = setVersionInText(restored, next);
      if (manifest === null) fail(`${plugin.manifestPath} at ${target} has no top-level "version"`);
      fs.writeFileSync(path.join(root, plugin.manifestPath), manifest);
      const reason = f.reason ? ` Reason: ${f.reason}.` : '';
      const entry = `### Changed\n- Roll back to ${f.to}: restores the content of ${f.to}, replacing ${reverted.join(', ')}.${reason}`;
      fs.writeFileSync(path.join(root, plugin.changelogPath), insertReleaseSection(plugin.changelog, next, date, entry));
      if (!f['skip-checks']) runChecks(root, log);
    } catch (e) {
      git(root, ['reset', '-q', '--hard', 'HEAD']); // tree was clean, so this only discards what we just did
      throw e;
    }
    const pending = unreleasedBody(plugin.changelog);
    if (pending && hasEntries(pending)) log('warning: "## [Unreleased]" still has entries from the rolled-back work; review them in CHANGELOG.md');

    git(root, ['add', '-A', '--', plugin.dir]);
    if (f['no-commit']) { log(`changes staged, not committed. Next: commit, merge, then: node scripts/release.mjs tag ${name} --push`); return 0; }
    git(root, ['commit', '-q', '-m', `Roll back ${name} to ${f.to} as ${next}`]);
    log(`committed "Roll back ${name} to ${f.to} as ${next}". Next: merge it into main, then run: node scripts/release.mjs tag ${name} --push`);
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
