import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main as release } from './release.mjs';
import { main as rollback } from './rollback.mjs';

Object.assign(process.env, {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull,
});

const g = (root, ...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const write = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (root, rel) => JSON.parse(read(root, rel));
const commit = (root, msg) => { g(root, 'add', '-A'); g(root, 'commit', '-q', '-m', msg); };

const changelog = (extra = '') => `# Changelog\n\n## [Unreleased]\n${extra}\n## [1.0.0] - 2026-01-01\n\n### Added\n- First release\n`;
const manifest = (name, extra = {}) => JSON.stringify({ name, version: '1.0.0', description: 'd', author: { name: 'a' }, ...extra }, null, 2) + '\n';

// A marketplace with `base` (1.0.0), `app` (1.0.0, depends on base ^1.0.0) and `plain` (no version).
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-release-'));
  g(root, 'init', '-q', '-b', 'main');
  write(root, '.claude-plugin/marketplace.json', JSON.stringify({
    name: 'mp', owner: { name: 'o' },
    plugins: ['base', 'app', 'plain'].map((n) => ({ name: n, source: `./plugins/${n}`, description: 'd' })),
  }, null, 2));
  write(root, 'plugins/base/.claude-plugin/plugin.json', manifest('base'));
  write(root, 'plugins/base/skills/a/SKILL.md', 'good\n');
  write(root, 'plugins/base/CHANGELOG.md', changelog());
  write(root, 'plugins/app/.claude-plugin/plugin.json', manifest('app', { dependencies: [{ name: 'base', version: '^1.0.0' }] }));
  write(root, 'plugins/app/CHANGELOG.md', changelog());
  write(root, 'plugins/plain/.claude-plugin/plugin.json', JSON.stringify({ name: 'plain', description: 'd' }));
  commit(root, 'init');
  return root;
}

function run(fn, root, args) {
  const logs = [], errs = [], outs = [];
  const code = fn([...args, '--root', root, '--skip-checks', '--date', '2026-02-02'], { log: (m) => logs.push(m), err: (m) => errs.push(m), out: (m) => outs.push(m) });
  return { code, logs: logs.join('\n'), err: errs.join('\n'), out: outs.join('\n') };
}

test('tag: annotated <plugin>--v<version> with the CHANGELOG section as message', () => {
  const root = repo();
  const r = run(release, root, ['tag', 'base']);
  assert.equal(r.code, 0, r.err);
  assert.equal(g(root, 'cat-file', '-t', 'base--v1.0.0'), 'tag');
  assert.match(g(root, 'tag', '-l', '--format=%(contents)', 'base--v1.0.0'), /First release/);
  assert.equal(run(release, root, ['tag', 'base']).code, 1); // already exists
});

test('tag: refuses unversioned plugins, dirty plugin dirs and non-main branches', () => {
  const root = repo();
  assert.match(run(release, root, ['tag', 'plain']).err, /tracks commits/);
  write(root, 'plugins/base/new.md', 'x');
  assert.match(run(release, root, ['tag', 'base']).err, /uncommitted/);
  fs.rmSync(path.join(root, 'plugins/base/new.md'));
  g(root, 'checkout', '-q', '-b', 'feature');
  assert.match(run(release, root, ['tag', 'base']).err, /on main/);
  assert.equal(run(release, root, ['tag', 'base', '--allow-branch']).code, 0);
});

test('tag: a release needs its CHANGELOG entry and a satisfied dependency tag', () => {
  const root = repo();
  assert.match(run(release, root, ['tag', 'app']).err, /release base first/); // base has no tag yet
  run(release, root, ['tag', 'base']);
  assert.equal(run(release, root, ['tag', 'app']).code, 0);
  write(root, 'plugins/base/.claude-plugin/plugin.json', manifest('base').replace('1.0.0', '1.0.1'));
  commit(root, 'bump without changelog');
  assert.match(run(release, root, ['tag', 'base']).err, /no "## \[1\.0\.1\]" section/);
});

test('prepare: bumps plugin.json, promotes Unreleased, commits on a branch', () => {
  const root = repo();
  write(root, 'plugins/base/CHANGELOG.md', changelog('\n### Added\n- Shiny\n'));
  commit(root, 'wip');
  assert.match(run(release, root, ['prepare', 'base', 'minor']).err, /on main/);
  g(root, 'checkout', '-q', '-b', 'rel');
  const dry = run(release, root, ['prepare', 'base', 'minor', '--dry-run']);
  assert.match(dry.logs, /1\.0\.0 -> 1\.1\.0/);
  assert.equal(json(root, 'plugins/base/.claude-plugin/plugin.json').version, '1.0.0');
  const r = run(release, root, ['prepare', 'base', 'minor']);
  assert.equal(r.code, 0, r.err);
  assert.equal(json(root, 'plugins/base/.claude-plugin/plugin.json').version, '1.1.0');
  assert.match(read(root, 'plugins/base/CHANGELOG.md'), /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-02-02\n\n### Added\n- Shiny/);
  assert.equal(g(root, 'log', '-1', '--format=%s'), 'Release base 1.1.0');
  assert.equal(g(root, 'status', '--porcelain'), '');
});

test('prepare: refuses an empty Unreleased and unmet dependency ranges', () => {
  const root = repo();
  g(root, 'checkout', '-q', '-b', 'rel');
  assert.match(run(release, root, ['prepare', 'base', 'patch']).err, /nothing to release/);
  write(root, 'plugins/app/CHANGELOG.md', changelog('\n### Added\n- x\n'));
  write(root, 'plugins/app/.claude-plugin/plugin.json', manifest('app', { dependencies: [{ name: 'base', version: '^2.0.0' }] }));
  commit(root, 'wip');
  assert.match(run(release, root, ['prepare', 'app', 'patch']).err, /release base first/);
});

test('verify: checks a tag against its own commit and prints notes', () => {
  const root = repo();
  run(release, root, ['tag', 'base']);
  const r = run(release, root, ['verify', 'base--v1.0.0', '--notes']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /First release/);
  g(root, 'tag', 'base--v9.9.9'); // plugin.json says 1.0.0
  assert.match(run(release, root, ['verify', 'base--v9.9.9']).err, /says 1\.0\.0 but the tag is for 9\.9\.9/);
  assert.equal(run(release, root, ['verify', 'nonsense']).code, 1);
});

// base 1.0.0 (good) -> 1.1.0 (bad: edits a skill, adds a file) released on main
function badRelease() {
  const root = repo();
  run(release, root, ['tag', 'base']);
  write(root, 'plugins/base/skills/a/SKILL.md', 'BAD\n');
  write(root, 'plugins/base/skills/b/SKILL.md', 'new and bad\n');
  write(root, 'plugins/base/CHANGELOG.md', changelog('\n### Added\n- Risky change\n'));
  commit(root, 'risky work');
  g(root, 'checkout', '-q', '-b', 'rel');
  assert.equal(run(release, root, ['prepare', 'base', 'minor']).code, 0);
  g(root, 'checkout', '-q', 'main');
  g(root, 'merge', '-q', '--ff-only', 'rel');
  assert.equal(run(release, root, ['tag', 'base']).code, 0);
  return root;
}

test('rollback: publishes a higher version with the old content, keeps history', () => {
  const root = badRelease();
  g(root, 'checkout', '-q', '-b', 'fix');
  const dry = run(rollback, root, ['base', '--to', '1.0.0', '--dry-run']);
  assert.match(dry.logs, /publish as 1\.1\.1/);
  assert.equal(read(root, 'plugins/base/skills/a/SKILL.md'), 'BAD\n');

  const r = run(rollback, root, ['base', '--to', '1.0.0', '--reason', 'crashes on start']);
  assert.equal(r.code, 0, r.err);
  assert.equal(read(root, 'plugins/base/skills/a/SKILL.md'), 'good\n');
  assert.ok(!fs.existsSync(path.join(root, 'plugins/base/skills/b')), 'files added by the bad release are removed');
  assert.equal(json(root, 'plugins/base/.claude-plugin/plugin.json').version, '1.1.1');
  const log = read(root, 'plugins/base/CHANGELOG.md');
  assert.match(log, /## \[1\.1\.1\] - 2026-02-02\n\n### Changed\n- Roll back to 1\.0\.0: restores the content of 1\.0\.0, replacing 1\.1\.0\. Reason: crashes on start\./);
  assert.match(log, /## \[1\.1\.0\]/); // history kept
  assert.equal(g(root, 'log', '-1', '--format=%s'), 'Roll back base to 1.0.0 as 1.1.1');

  g(root, 'checkout', '-q', 'main');
  g(root, 'merge', '-q', '--ff-only', 'fix');
  assert.equal(run(release, root, ['tag', 'base']).code, 0, 'the rollback version can be tagged like any release');
  assert.equal(g(root, 'tag', '-l', 'base--v*').split('\n').length, 3);
});

test('rollback: refuses what cannot be rolled back', () => {
  const root = badRelease();
  g(root, 'checkout', '-q', '-b', 'fix');
  assert.match(run(rollback, root, ['plain', '--to', '1.0.0']).err, /git revert/);
  assert.match(run(rollback, root, ['base', '--to', '0.9.0']).err, /does not exist/);
  assert.match(run(rollback, root, ['base', '--to', '1.1.0']).err, /nothing to roll back/);
  assert.equal(run(rollback, root, ['base']).code, 1);
  g(root, 'checkout', '-q', 'main');
  assert.match(run(rollback, root, ['base', '--to', '1.0.0']).err, /on main/);
});
