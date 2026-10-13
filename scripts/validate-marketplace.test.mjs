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
