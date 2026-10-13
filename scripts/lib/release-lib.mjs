// Pure helpers for release.mjs / rollback.mjs: semver, tags, plugin.json editing, CHANGELOG editing.
// No I/O here, so everything is unit-testable.

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v) {
  const m = VERSION_RE.exec(String(v));
  if (!m) throw new Error(`invalid version "${v}" (expected X.Y.Z, no pre-release suffix)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export const isVersion = (v) => VERSION_RE.test(String(v));

export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** `kind` is major | minor | patch, or an explicit X.Y.Z that must be higher than `current`. */
export function bumpVersion(current, kind) {
  const [maj, min, pat] = parseVersion(current);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  parseVersion(kind);
  if (compareVersions(kind, current) <= 0) throw new Error(`new version ${kind} must be higher than ${current}`);
  return kind;
}

// ---- tags: <plugin-name>--v<version> (the format Claude Code resolves dependency ranges against) ----

export const tagName = (plugin, version) => `${plugin}--v${version}`;

export function parseTag(tag) {
  const m = /^(.+)--v(\d+\.\d+\.\d+)$/.exec(tag);
  return m ? { plugin: m[1], version: m[2] } : null;
}

/** Versions released for `plugin`, highest first. */
export function releasedVersions(tags, plugin) {
  return tags
    .map(parseTag)
    .filter((t) => t && t.plugin === plugin)
    .map((t) => t.version)
    .sort((a, b) => compareVersions(b, a));
}

// ---- semver ranges: the node-semver subset Claude Code documents (^ ~ >= > <= < = and X.Y partials) ----

const COMPARATOR_RE = /^(\^|~|>=|<=|>|<|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/;
const wild = (s) => s === undefined || s === 'x' || s === '*';

function toBounds(token, range) {
  if (token === '*' || token === 'x' || token === '') return [];
  const m = COMPARATOR_RE.exec(token);
  if (!m) throw new Error(`unsupported version range "${range}"`);
  const op = m[1] || '=';
  const parts = [m[2], m[3], m[4]].filter((p) => !wild(p)).map(Number);
  const n = parts.length;
  const [maj, min = 0, pat = 0] = parts;
  const lo = [maj, min, pat];
  const v = (a, b, c) => [['>=', lo], ['<', [a, b, c]]];
  switch (op) {
    case '^':
      if (maj > 0) return v(maj + 1, 0, 0);
      if (n === 1) return v(1, 0, 0);
      if (min > 0) return v(0, min + 1, 0);
      if (n === 2) return v(0, 1, 0);
      return v(0, 0, pat + 1);
    case '~':
      return n === 1 ? v(maj + 1, 0, 0) : v(maj, min + 1, 0);
    case '=':
      if (n === 3) return [['=', lo]];
      return n === 2 ? v(maj, min + 1, 0) : v(maj + 1, 0, 0);
    case '>=':
      return [['>=', lo]];
    case '<':
      return [['<', lo]];
    default: // '>' and '<=' with a partial version mean something subtler in node-semver
      if (n !== 3) throw new Error(`unsupported version range "${range}"`);
      return [[op, lo]];
  }
}

/** True when `version` (X.Y.Z) satisfies `range`. Space-separated comparators are ANDed; `||` is unsupported. */
export function satisfies(version, range) {
  if (/\|\|/.test(range)) throw new Error(`unsupported version range "${range}" (|| is not supported)`);
  const target = parseVersion(version);
  const tokens = range.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/);
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  return tokens.flatMap((t) => toBounds(t, range)).every(([op, bound]) => {
    const c = cmp(target, bound);
    return op === '>=' ? c >= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : op === '<=' ? c <= 0 : c === 0;
  });
}

// ---- plugin.json ----

/** Normalise the `dependencies` array: strings or { name, version?, marketplace? } -> { name, range, marketplace }. */
export function readDependencies(manifest) {
  return (manifest.dependencies || []).map((d) => {
    if (typeof d === 'string') {
      const [name, marketplace] = d.split('@');
      return { name, range: null, marketplace: marketplace || null };
    }
    return { name: d.name, range: d.version || null, marketplace: d.marketplace || null };
  });
}

/**
 * Replace the top-level "version" value in plugin.json text without reformatting the file
 * (nested "version" keys, e.g. in `dependencies`, are left alone). Returns null if there is none.
 */
export function setVersionInText(text, version) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const str = text.slice(i + 1, j);
      const m = /^(\s*:\s*")((?:[^"\\]|\\.)*)"/.exec(text.slice(j + 1));
      if (depth === 1 && str === 'version' && m) {
        const start = j + 1 + m[1].length;
        return text.slice(0, start) + version + text.slice(start + m[2].length);
      }
      i = j;
    }
  }
  return null;
}

// ---- CHANGELOG.md (Keep a Changelog) ----

const UNRELEASED_RE = /^## \[Unreleased\][ \t]*$/im;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lines between a `## ` heading and the next one. */
function bodyAfter(text, headingMatch) {
  const start = headingMatch.index + headingMatch[0].length;
  const next = text.slice(start).search(/^## /m);
  return text.slice(start, next === -1 ? undefined : start + next);
}

/** True if a section body has real entries (not just blank lines and empty `###` headings). */
export const hasEntries = (body) => body.split('\n').some((l) => l.trim() && !/^#{3,}\s/.test(l.trim()));

export function unreleasedBody(text) {
  const m = UNRELEASED_RE.exec(text);
  return m ? bodyAfter(text, m).trim() : null;
}

export function sectionFor(text, version) {
  const m = new RegExp(`^## \\[${escapeRe(version)}\\](?: - .*)?[ \\t]*$`, 'm').exec(text);
  return m ? bodyAfter(text, m).trim() : null;
}

/** Turn `## [Unreleased]` content into a dated release section and leave a fresh empty Unreleased above it. */
export function promoteUnreleased(text, version, date) {
  const m = UNRELEASED_RE.exec(text);
  if (!m) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  return text.replace(UNRELEASED_RE, `## [Unreleased]\n\n## [${version}] - ${date}`);
}

/** Insert a new release section (with the given markdown body) directly under `## [Unreleased]`. */
export function insertReleaseSection(text, version, date, body) {
  const section = `## [${version}] - ${date}\n\n${body.trim()}\n\n`;
  const m = UNRELEASED_RE.exec(text);
  if (m) {
    const after = m.index + m[0].length;
    const rest = text.slice(after).replace(/^\n+/, '\n');
    const nextHeading = rest.search(/^## /m);
    const head = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    const tail = nextHeading === -1 ? '' : rest.slice(nextHeading);
    return `${text.slice(0, after)}${head.trimEnd()}\n\n${section}${tail}`.replace(/\n{3,}/g, '\n\n');
  }
  const first = /^## \[/m.exec(text);
  return first ? text.slice(0, first.index) + section + text.slice(first.index) : `${text.trimEnd()}\n\n${section}`;
}
