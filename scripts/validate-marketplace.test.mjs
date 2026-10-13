import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lint } from './validate-marketplace.mjs';

// Builds a throwaway marketplace in a temp dir; `files` maps relative path -> string | object (JSON).
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lint-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const SKILL = '---\nname: s\ndescription: d\n---\nbody\n';
const good = (over = {}) => ({
  '.claude-plugin/marketplace.json': {
    name: 'my-mp',
    description: 'd',
    owner: { name: 'o' },
    plugins: [{ name: 'p', source: './plugins/p', description: 'd' }],
    ...over,
  },
  'plugins/p/.claude-plugin/plugin.json': { name: 'p', description: 'd', author: { name: 'a' } },
  'plugins/p/skills/s/SKILL.md': SKILL,
});

const msgs = (r) => [...r.errors, ...r.warnings].map((x) => x.msg).join('\n');

test('valid marketplace has no errors or warnings', () => {
  const r = lint(fixture(good()));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('missing marketplace.json is an error', () => {
  assert.equal(lint(fixture({})).errors.length, 1);
});

test('reserved marketplace name', () => {
  const r = lint(fixture(good({ name: 'claude-plugins-official' })));
  assert.match(msgs(r), /reserved/);
});

test('missing source directory is an error', () => {
  const files = good();
  delete files['plugins/p/.claude-plugin/plugin.json'];
  delete files['plugins/p/skills/s/SKILL.md'];
  assert.match(msgs(lint(fixture(files))), /does not exist/);
});

test('source with ".." or without "./" is rejected', () => {
  assert.match(msgs(lint(fixture(good({ plugins: [{ name: 'p', source: './../p' }] })))), /"\.\."/);
  assert.match(msgs(lint(fixture(good({ plugins: [{ name: 'p', source: 'plugins/p' }] })))), /start with "\.\/"/);
});

test('entry name must match plugin.json name', () => {
  const files = good();
  files['plugins/p/.claude-plugin/plugin.json'] = { name: 'other' };
  assert.match(msgs(lint(fixture(files))), /differs from marketplace entry name/);
});

test('version in both entry and plugin.json is an error', () => {
  const files = good({ plugins: [{ name: 'p', source: './plugins/p', description: 'd', version: '1.0.0' }] });
  files['plugins/p/.claude-plugin/plugin.json'] = { name: 'p', version: '1.0.0' };
  assert.match(msgs(lint(fixture(files))), /set both here/);
});

test('hooks as a file path in an entry is an error', () => {
  const files = good({ plugins: [{ name: 'p', source: './plugins/p', description: 'd', hooks: './hooks/hooks.json' }] });
  assert.match(msgs(lint(fixture(files))), /inline object/);
});

test('components inside .claude-plugin are rejected', () => {
  const files = good();
  files['plugins/p/.claude-plugin/skills/x.md'] = 'x';
  assert.match(msgs(lint(fixture(files))), /must live at the plugin root/);
});

test('SKILL.md name must match folder', () => {
  const files = good();
  files['plugins/p/skills/s/SKILL.md'] = '---\nname: wrong\ndescription: d\n---\n';
  assert.match(msgs(lint(fixture(files))), /differs from folder name/);
});

test('hooks.json without "hooks" wrapper is an error', () => {
  const files = good();
  files['plugins/p/hooks/hooks.json'] = { PreToolUse: [] };
  assert.match(msgs(lint(fixture(files))), /top-level "hooks" object/);
});

test('duplicate plugin names and reserved plugin prefix', () => {
  const files = good({
    plugins: [
      { name: 'p', source: './plugins/p', description: 'd' },
      { name: 'p', source: './plugins/p', description: 'd' },
      { name: 'claude-helper', source: './plugins/p', description: 'd' },
    ],
  });
  const m = msgs(lint(fixture(files)));
  assert.match(m, /duplicate plugin name/);
  assert.match(m, /reserved prefix/);
});

test('renames chain must resolve', () => {
  assert.match(msgs(lint(fixture(good({ renames: { old: 'ghost' } })))), /chain does not resolve/);
  assert.deepEqual(lint(fixture(good({ renames: { old: 'p', gone: null } }))).errors, []);
});

test('orphan plugin directory is a warning', () => {
  const files = good();
  files['plugins/orphan/.claude-plugin/plugin.json'] = { name: 'orphan' };
  assert.match(msgs(lint(fixture(files))), /not referenced/);
});

test('external source without ref/sha is a warning, bad sha an error', () => {
  const ext = (source) => good({ plugins: [{ name: 'p', description: 'd', source }] });
  assert.match(msgs(lint(fixture(ext({ source: 'github', repo: 'o/r' })))), /not pinned/);
  assert.match(msgs(lint(fixture(ext({ source: 'github', repo: 'o/r', sha: 'abc' })))), /40-char/);
  assert.deepEqual(lint(fixture(ext({ source: 'github', repo: 'o/r', ref: 'v1' }))).errors, []);
});

// ---- dependencies, namespaces, release files, forbidden strings, read-only agents ----

const mp = (plugins) => ({
  '.claude-plugin/marketplace.json': {
    name: 'my-mp', description: 'd', owner: { name: 'o' },
    plugins: plugins.map((n) => ({ name: n, source: `./plugins/${n}`, description: 'd' })),
  },
});
const plugin = (name, extra = {}, files = {}) => ({
  [`plugins/${name}/.claude-plugin/plugin.json`]: { name, version: '1.0.0', description: 'd', author: { name: 'a' }, ...extra },
  [`plugins/${name}/README.md`]: `# ${name}\n`,
  [`plugins/${name}/CHANGELOG.md`]: `# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n`,
  [`plugins/${name}/skills/s/SKILL.md`]: SKILL,
  ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`plugins/${name}/${k}`, v])),
});
const dep = (name, version) => ({ dependencies: [version ? { name, version } : name] });

test('dependency on an unknown plugin is an error', () => {
  const r = lint(fixture({ ...mp(['a']), ...plugin('a', dep('ghost', '^1.0.0')) }));
  assert.match(msgs(r), /dependency "ghost" does not exist/);
});

test('invalid dependency range is an error', () => {
  const r = lint(fixture({ ...mp(['a', 'b']), ...plugin('a', dep('b', 'latest-ish')), ...plugin('b') }));
  assert.match(msgs(r), /not a valid semver range/);
});

test('valid dependencies with ranges produce no findings', () => {
  const r = lint(fixture({ ...mp(['a', 'b']), ...plugin('a', dep('b', '^1.0.0 || >=2.1')), ...plugin('b') }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('dependency cycles are detected', () => {
  const r = lint(fixture({ ...mp(['a', 'b']), ...plugin('a', dep('b', '^1.0.0')), ...plugin('b', dep('a', '^1.0.0')) }));
  assert.match(msgs(r), /dependency cycle: a -> b -> a|dependency cycle: b -> a -> b/);
});

test('a version range on an unversioned dependency can never resolve', () => {
  const files = { ...mp(['a', 'b']), ...plugin('a', dep('b', '^1.0.0')), ...plugin('b') };
  const b = files['plugins/b/.claude-plugin/plugin.json'];
  delete b.version;
  assert.match(msgs(lint(fixture(files))), /no "version" in plugin\.json/);
});

test('using another plugin\'s namespace without declaring the dependency is an error', () => {
  const files = { ...mp(['a', 'b']), ...plugin('a', {}, { 'agents/x.md': '---\nname: x\ndescription: d\nskills: b:s\n---\nUse b:s here.\n' }), ...plugin('b') };
  assert.match(msgs(lint(fixture(files))), /references "b:s" but "b" is not in this plugin's dependencies/);
});

test('declaring the dependency satisfies the namespace check', () => {
  const files = { ...mp(['a', 'b']), ...plugin('a', dep('b', '^1.0.0'), { 'agents/x.md': '---\nname: x\ndescription: d\n---\nUse b:s here.\n' }), ...plugin('b') };
  assert.deepEqual(lint(fixture(files)).errors, []);
});

test('versioned plugin needs README and a CHANGELOG entry for its version', () => {
  const files = { ...mp(['a']), ...plugin('a') };
  files['plugins/a/CHANGELOG.md'] = '# Changelog\n\n## [0.9.0] - 2026-01-01\n';
  delete files['plugins/a/README.md'];
  const m = msgs(lint(fixture(files)));
  assert.match(m, /no README\.md/);
  assert.match(m, /no "## \[1\.0\.0\]" entry/);
});

test('unversioned plugins are exempt from release files and forbidden strings', () => {
  const files = { ...mp(['a']), ...plugin('a', {}, { 'skills/s/SKILL.md': '---\nname: s\ndescription: d\n---\nDevDigest INSIGHTS.md\n' }) };
  const m = files['plugins/a/.claude-plugin/plugin.json'];
  delete m.version;
  delete files['plugins/a/README.md'];
  delete files['plugins/a/CHANGELOG.md'];
  assert.deepEqual(lint(fixture(files)).errors, []);
});

test('forbidden project-specific strings in a versioned plugin are errors', () => {
  const bad = ['DevDigest backend', 'see INSIGHTS.md', 'load .claude/skills/x/SKILL.md', '@devdigest/shared', 'reviewer-core', 'agent-runner', 'routing.md'];
  for (const line of bad) {
    const files = { ...mp(['a']), ...plugin('a', {}, { 'agents/x.md': `---\nname: x\ndescription: d\n---\n${line}\n` }) };
    assert.match(msgs(lint(fixture(files))), /forbidden string/, line);
  }
});

test('the marketplace\'s own name in install commands is allowed', () => {
  const files = { ...mp(['a']), ...plugin('a', {}, { 'x.md': '/plugin install a@devdigest-marketplace\n/plugin marketplace add o/devdigest-ai-marketplace\n' }) };
  assert.deepEqual(lint(fixture(files)).errors, []);
});

test('forbidden strings are found in non-skill files too (references, evals, agents)', () => {
  const files = { ...mp(['a']), ...plugin('a', {}, { 'skills/s/references.md': 'ok', 'evals/c/prompt.md': 'uses dev-digest fixtures' }) };
  const hit = lint(fixture(files)).errors.find((e) => /forbidden string/.test(e.msg));
  assert.ok(hit, 'expected a forbidden-string error');
  assert.match(hit.where, /plugins\/a\/evals\/c\/prompt\.md:1$/);
});

test('a read-only agent must not list write tools', () => {
  const agent = (tools) => `---\nname: x\ndescription: >\n  A read-only reviewer\n  that never edits.\ntools: ${tools}\n---\nbody\n`;
  const bad = lint(fixture({ ...mp(['a']), ...plugin('a', {}, { 'agents/x.md': agent('Read, Grep, Write') }) }));
  assert.match(msgs(bad), /read-only but lists write tool\(s\) in "tools": Write/);
  const ok = lint(fixture({ ...mp(['a']), ...plugin('a', {}, { 'agents/x.md': agent('Read, Grep, Bash') }) }));
  assert.deepEqual(ok.errors, []);
});

test('agent frontmatter name must match the file name', () => {
  const files = { ...mp(['a']), ...plugin('a', {}, { 'agents/x.md': '---\nname: y\ndescription: d\n---\nb\n' }) };
  assert.match(msgs(lint(fixture(files))), /differs from file name/);
});
