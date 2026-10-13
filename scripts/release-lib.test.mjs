import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpVersion, compareVersions, hasEntries, insertReleaseSection, parseTag, promoteUnreleased, readDependencies,
  releasedVersions, satisfies, sectionFor, setVersionInText, tagName, unreleasedBody,
} from './lib/release-lib.mjs';

test('bumpVersion', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(bumpVersion('1.2.3', '1.5.0'), '1.5.0');
  assert.throws(() => bumpVersion('1.2.3', '1.2.3'), /higher/);
  assert.throws(() => bumpVersion('1.2.3', '1.2'), /invalid/);
  assert.throws(() => bumpVersion('1.2.3-beta.1', 'patch'), /invalid/);
});

test('compareVersions is numeric, not lexical', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('tags: <plugin>--v<version>', () => {
  assert.equal(tagName('research-tools', '1.0.0'), 'research-tools--v1.0.0');
  assert.deepEqual(parseTag('research-tools--v1.0.0'), { plugin: 'research-tools', version: '1.0.0' });
  assert.equal(parseTag('v1.0.0'), null);
  assert.equal(parseTag('a--v1.0'), null);
  const tags = ['a--v1.0.0', 'a--v1.10.0', 'a--v1.2.0', 'b--v9.0.0', 'junk'];
  assert.deepEqual(releasedVersions(tags, 'a'), ['1.10.0', '1.2.0', '1.0.0']);
});

test('satisfies: documented node-semver ranges', () => {
  const yes = [['1.4.2', '^1.0.0'], ['1.0.0', '^1.0.0'], ['2.9.0', '^2.0'], ['2.1.5', '~2.1.0'], ['2.1.0', '=2.1.0'],
    ['1.4.0', '>=1.4'], ['3.0.0', '>=1.4'], ['0.2.9', '^0.2.3'], ['1.2.9', '1.2'], ['2.0.0', '*'], ['2.5.0', '>=2.0.0 <3.0.0']];
  const no = [['2.0.0', '^1.0.0'], ['0.9.9', '^1.0.0'], ['2.2.0', '~2.1.0'], ['2.1.1', '=2.1.0'], ['1.3.9', '>=1.4'],
    ['0.3.0', '^0.2.3'], ['0.0.4', '^0.0.3'], ['1.3.0', '1.2'], ['3.0.0', '>=2.0.0 <3.0.0'], ['1.0.0', '>1.0.0']];
  for (const [v, r] of yes) assert.ok(satisfies(v, r), `${v} should satisfy ${r}`);
  for (const [v, r] of no) assert.ok(!satisfies(v, r), `${v} should not satisfy ${r}`);
  assert.throws(() => satisfies('1.0.0', '^1.0.0 || ^2.0.0'), /unsupported/);
  assert.throws(() => satisfies('1.0.0', 'latest'), /unsupported/);
});

test('readDependencies handles strings, name@marketplace and objects', () => {
  assert.deepEqual(readDependencies({ dependencies: ['a', 'b@other', { name: 'c', version: '^1.0.0' }, { name: 'd', marketplace: 'm' }] }), [
    { name: 'a', range: null, marketplace: null },
    { name: 'b', range: null, marketplace: 'other' },
    { name: 'c', range: '^1.0.0', marketplace: null },
    { name: 'd', range: null, marketplace: 'm' },
  ]);
  assert.deepEqual(readDependencies({}), []);
});

test('setVersionInText only touches the top-level version and keeps formatting', () => {
  const text = '{\n  "name": "x",\n  "dependencies": [{ "name": "d", "version": "^1.0.0" }],\n  "version":   "1.0.0",\n  "keywords": ["a"]\n}\n';
  const out = setVersionInText(text, '1.1.0');
  assert.equal(JSON.parse(out).version, '1.1.0');
  assert.equal(JSON.parse(out).dependencies[0].version, '^1.0.0');
  assert.equal(out, text.replace('"1.0.0",\n  "keywords"', '"1.1.0",\n  "keywords"'));
  assert.equal(setVersionInText('{ "name": "x" }', '1.0.0'), null);
});

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- New thing

## [1.0.0] - 2026-01-01

### Added
- First release
`;

test('CHANGELOG: read sections', () => {
  assert.equal(unreleasedBody(CHANGELOG), '### Added\n- New thing');
  assert.equal(sectionFor(CHANGELOG, '1.0.0'), '### Added\n- First release');
  assert.equal(sectionFor(CHANGELOG, '2.0.0'), null);
  assert.equal(sectionFor(CHANGELOG, '1.0'), null); // not a prefix match
  assert.equal(hasEntries('### Added\n\n### Fixed\n'), false);
  assert.equal(hasEntries('### Added\n- x'), true);
});

test('CHANGELOG: promoteUnreleased leaves a fresh empty Unreleased', () => {
  const out = promoteUnreleased(CHANGELOG, '1.1.0', '2026-02-02');
  assert.match(out, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-02-02\n\n### Added\n- New thing/);
  assert.equal(unreleasedBody(out), '');
  assert.equal(sectionFor(out, '1.1.0'), '### Added\n- New thing');
  assert.throws(() => promoteUnreleased('# Changelog\n', '1.0.0', '2026-01-01'), /Unreleased/);
});

test('CHANGELOG: insertReleaseSection goes under Unreleased and keeps history', () => {
  const out = insertReleaseSection(CHANGELOG, '1.0.1', '2026-03-03', '### Changed\n- Roll back');
  assert.ok(out.indexOf('## [1.0.1]') < out.indexOf('## [1.0.0]'));
  assert.ok(out.indexOf('## [Unreleased]') < out.indexOf('## [1.0.1]'));
  assert.equal(sectionFor(out, '1.0.0'), '### Added\n- First release');
  assert.equal(unreleasedBody(out), '### Added\n- New thing');
  assert.ok(!/\n{3,}/.test(out));
});
