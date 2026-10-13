import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildCatalog, buildFeed, buildLlmsTxt, detectRepo, pagesUrl, writeCatalog } from './build-catalog.mjs';

// Builds a throwaway marketplace in a temp dir; `files` maps relative path -> string | object (JSON).
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-catalog-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const sh = (root, ...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

const FILES = {
  '.claude-plugin/marketplace.json': {
    name: 'my-mp',
    description: 'My marketplace',
    owner: { name: 'Acme' },
    plugins: [
      { name: 'alpha', source: './plugins/alpha', description: 'Alpha plugin.', category: 'quality' },
      { name: 'beta', source: './plugins/beta', description: 'Beta plugin' },
    ],
  },
  'plugins/alpha/.claude-plugin/plugin.json': { name: 'alpha', description: 'Alpha plugin.', author: { name: 'a' }, keywords: ['one', 'two'] },
  'plugins/alpha/README.md': '# Alpha\n\nReadme text.\n',
  'plugins/alpha/skills/greet/SKILL.md': '---\nname: greet\ndescription: >\n  Greets the user\n  politely.\n---\nBody of the skill.\n',
  'plugins/alpha/agents/helper.md': '---\nname: helper\ndescription: Helps.\ntools: Read\n---\nAgent body.\n',
  'plugins/alpha/commands/say/hi.md': '---\ndescription: Says hi\n---\nSay hi.\n',
  'plugins/alpha/hooks/hooks.json': { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'true' }] }], SessionStart: [{ hooks: [] }] } },
  'plugins/alpha/.mcp.json': { mcpServers: { docs: { command: 'npx', args: ['-y', 'docs-mcp'] }, remote: { url: 'https://example.com/mcp' } } },
  'plugins/beta/.claude-plugin/plugin.json': { name: 'beta', description: 'Beta plugin', author: { name: 'b' } },
  'plugins/beta/skills/other/SKILL.md': '---\nname: other\ndescription: Other.\n---\nx\n',
};

const OPTIONS = { repo: 'Acme/My-Repo', now: new Date('2026-10-13T10:00:00Z') };

test('discovers every artifact type with ids, invoke strings and inherited tags/category', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  const byId = Object.fromEntries(c.artifacts.map((a) => [a.id, a]));
  assert.deepEqual(Object.keys(byId).sort(), [
    'agent:alpha/helper', 'command:alpha/hi', 'hook:alpha/PreToolUse:Bash', 'hook:alpha/SessionStart',
    'mcp:alpha/docs', 'mcp:alpha/remote', 'plugin:alpha', 'plugin:beta', 'skill:alpha/greet', 'skill:beta/other',
  ].sort());
  assert.equal(byId['skill:alpha/greet'].invoke, '/alpha:greet');
  assert.equal(byId['agent:alpha/helper'].invoke, 'alpha:helper');
  assert.equal(byId['command:alpha/hi'].invoke, '/alpha:hi');
  assert.equal(byId['skill:alpha/greet'].description, 'Greets the user politely.', 'folded description is joined');
  assert.equal(byId['skill:alpha/greet'].text, 'Body of the skill.');
  assert.equal(byId['skill:alpha/greet'].path, 'plugins/alpha/skills/greet/SKILL.md');
  assert.deepEqual(byId['skill:alpha/greet'].tags, ['one', 'two']);
  assert.equal(byId['skill:alpha/greet'].category, 'quality');
  assert.equal(byId['plugin:beta'].category, null);
  assert.equal(byId['hook:alpha/PreToolUse:Bash'].description, 'Runs on PreToolUse for Bash');
  assert.equal(byId['hook:alpha/PreToolUse:Bash'].title, 'PreToolUse · Bash');
  assert.equal(byId['mcp:alpha/docs'].description, 'npx -y docs-mcp');
  assert.equal(byId['mcp:alpha/remote'].description, 'https://example.com/mcp');
  assert.equal(byId['plugin:alpha'].install, '/plugin install alpha@my-mp');
  assert.deepEqual(byId['plugin:alpha'].counts, { skills: 1, agents: 1, commands: 1, hooks: 2, mcp: 2 });
  assert.deepEqual(c.categories, ['quality']);
});

test('plugin token estimate is the sum of its components (hooks and MCP cost nothing)', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  const alpha = c.artifacts.filter((a) => a.plugin === 'alpha');
  const plugin = c.artifacts.find((a) => a.id === 'plugin:alpha');
  assert.equal(plugin.tokens, alpha.reduce((s, a) => s + a.tokens, 0));
  assert.ok(alpha.find((a) => a.type === 'skill').tokens > 0);
  assert.ok(alpha.filter((a) => a.type === 'hook' || a.type === 'mcp').every((a) => a.tokens === 0));
});

test('marketplace block, Pages address and ids; no author names or emails anywhere', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  assert.deepEqual(c.marketplace, {
    name: 'my-mp', description: 'My marketplace', owner: 'Acme', repo: 'Acme/My-Repo', branch: 'main',
    baseUrl: 'https://acme.github.io/My-Repo/',
  });
  assert.equal(c.schemaVersion, 1);
  assert.equal(c.generatedAt, '2026-10-13T10:00:00Z');
  assert.equal(new Set(c.artifacts.map((a) => a.id)).size, c.artifacts.length);
  assert.ok(!/"author"/.test(JSON.stringify(c)));
});

test('caps text at 4000 characters', () => {
  const files = { ...FILES, 'plugins/beta/skills/other/SKILL.md': `---\nname: other\ndescription: Other.\n---\n${'x'.repeat(9000)}\n` };
  const c = buildCatalog(fixture(files), OPTIONS);
  assert.equal(c.artifacts.find((a) => a.id === 'skill:beta/other').text.length, 4000);
});

test('refuses to build when the structural linter reports errors', () => {
  const files = { ...FILES, 'plugins/alpha/.claude-plugin/plugin.json': { name: 'wrong-name', description: 'x' } };
  assert.throws(() => buildCatalog(fixture(files), OPTIONS), /structural lint failed/);
});

test('without git it still builds, with no changes and "unknown" commit', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  assert.deepEqual(c.changes, []);
  assert.equal(c.commit, 'unknown');
  assert.equal(c.artifacts[0].updatedAt, '2026-10-13');
});

test('with git: updatedAt, commit and changes (merges skipped, one plugin list per commit)', () => {
  const root = fixture(FILES);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'user.email', 'secret@example.com');
  sh(root, 'config', 'user.name', 'Secret Name');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'Add plugins', '--date', '2026-09-01T12:00:00Z');
  fs.writeFileSync(path.join(root, 'README.md'), 'repo level\n');
  sh(root, 'add', '.');
  sh(root, 'commit', '-q', '-m', 'Repo-level change');
  fs.appendFileSync(path.join(root, 'plugins/beta/skills/other/SKILL.md'), 'more\n');
  sh(root, 'commit', '-q', '-am', 'Tweak beta skill');

  const c = buildCatalog(root, OPTIONS);
  assert.deepEqual(c.changes.map((x) => [x.subject, x.plugins]), [
    ['Tweak beta skill', ['beta']],
    ['Repo-level change', []],
    ['Add plugins', ['alpha', 'beta']],
  ]);
  assert.match(c.commit, /^[0-9a-f]{7,}$/);
  assert.equal(c.changes[0].sha, c.commit);
  assert.match(c.artifacts.find((a) => a.id === 'skill:beta/other').updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!JSON.stringify(c).includes('secret@example.com') && !JSON.stringify(c).includes('Secret Name'));
});

test('feed.xml is a valid-looking Atom feed with absolute, escaped URLs', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  c.changes = [{ date: '2026-10-12', sha: 'abc1234', subject: 'Fix <b> & "quotes"', plugins: ['alpha'] }];
  const feed = buildFeed(c);
  assert.match(feed, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(feed, /<link rel="self" href="https:\/\/acme\.github\.io\/My-Repo\/feed\.xml"\/>/);
  assert.match(feed, /<id>https:\/\/github\.com\/Acme\/My-Repo\/commit\/abc1234<\/id>/);
  assert.match(feed, /<title>alpha: Fix &lt;b&gt; &amp; &quot;quotes&quot;<\/title>/);
  assert.match(feed, /<updated>2026-10-12T00:00:00Z<\/updated>/);
});

test('feed.xml lists at most the 50 newest changes', () => {
  const c = buildCatalog(fixture(FILES), OPTIONS);
  c.changes = Array.from({ length: 80 }, (_, i) => ({ date: '2026-10-12', sha: `s${i}`, subject: `c${i}`, plugins: [] }));
  assert.equal(buildFeed(c).match(/<entry>/g).length, 50);
});

test('llms.txt has a summary and one install line per plugin', () => {
  const txt = buildLlmsTxt(buildCatalog(fixture(FILES), OPTIONS));
  assert.match(txt, /^# my-mp\n\n> My marketplace\n/);
  assert.match(txt, /- \[alpha\]\(https:\/\/github\.com\/Acme\/My-Repo\/tree\/main\/plugins\/alpha\): Alpha plugin\. Install: `\/plugin install alpha@my-mp`/);
  assert.match(txt, /- \[beta\].*: Beta plugin\. Install: `\/plugin install beta@my-mp`/);
});

test('writeCatalog writes the three files', () => {
  const out = path.join(fixture({}), 'out');
  writeCatalog(fixture(FILES), out, OPTIONS);
  assert.deepEqual(fs.readdirSync(out).sort(), ['catalog.json', 'feed.xml', 'llms.txt']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'catalog.json'), 'utf8')).schemaVersion, 1);
});

test('repo detection: environment first, then the origin remote', () => {
  assert.equal(detectRepo(os.tmpdir(), { GITHUB_REPOSITORY: 'o/r' }), 'o/r');
  const root = fixture({});
  sh(root, 'init', '-q');
  sh(root, 'remote', 'add', 'origin', 'git@github.com:Owner/Repo.git');
  assert.equal(detectRepo(root, {}), 'Owner/Repo');
  sh(root, 'remote', 'set-url', 'origin', 'https://github.com/Owner/Repo');
  assert.equal(detectRepo(root, {}), 'Owner/Repo');
  assert.equal(pagesUrl('Owner/Repo'), 'https://owner.github.io/Repo/');
});

test('this repository builds, with unique ids and a plugin card for every marketplace entry', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const c = buildCatalog(root, { repo: 'o/r' });
  const mp = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.deepEqual(c.artifacts.filter((a) => a.type === 'plugin').map((a) => a.name), mp.plugins.map((p) => p.name));
  assert.ok(c.artifacts.every((a) => a.description !== undefined && a.install.startsWith('/plugin install ')));
});
