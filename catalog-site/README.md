# Catalog site

Search UI for the marketplace: find plugins, skills, agents, commands, hooks and MCP servers,
copy an install command, and assemble a bundle. Vite + React, no backend, no third-party requests.
Spec: [`docs/specs/catalog-site.md`](../docs/specs/catalog-site.md).

Kept apart from the marketplace itself (`.claude-plugin/`, `plugins/`); only `dist/` is published.

## Commands

Run from this directory (Node 22+).

| Command | What it does |
|---|---|
| `npm ci` | install dependencies (use `npm install` when changing them) |
| `npm run dev` | dev server with hot reload at http://localhost:5173/ |
| `npm test` | unit tests (search, URL state, bundle output) |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve `dist/` locally, http://localhost:4173/ — closest to GitHub Pages |

In dev, `?simulate=loading|error|empty` previews those states, e.g. http://localhost:5173/?simulate=error.

## Layout

```
index.html, changelog.html   the two pages (one shared bundle)
public/catalog.json          catalog data, shape = spec §11.1 (copied to dist/ as-is)
src/lib/                     pure logic: search, URL state, bundle output, formatting (+ tests)
src/components/, src/hooks/  React UI (no literal text: components reference message keys)
src/locales/en.json          ALL user-facing text, in one file
src/i18n/                    t() / list() / rich() lookup helpers + the guard tests
src/styles.css               design tokens (light/dark) + component styles
design/                      the original Claude Design prototype, for reference only (not built)
```

## Text and translations

Every string a visitor can read lives in `src/locales/en.json`. Components never contain literal text; they call
`t('results.count', { count })`, `list('hero.examples')` or `rich('card.tip', params, { code: … })` (for messages with
`<code>…</code>` or `<a>…</a>` markup, rendered as React elements, never as HTML). Plural messages are
`{ "one": "…", "other": "…" }` and pick the form from `count`. The static HTML pages (`<title>`, description,
`<noscript>`) use `%t:some.key%` placeholders, filled from the same file at build time.

`npm test` enforces it (`src/i18n/i18n.test.js`): every key used in code exists, no message is unused, and a JSX parser
fails the build if a component contains literal text, a literal `aria-label`/`title`/`placeholder`, or a literal toast.
To add a language, copy `en.json`, translate it, and point `src/i18n/index.js` at it. The search vocabulary
(stop words, synonyms in `src/lib/synonyms.json`) is language data too, but it is not UI text and stays in `src/lib/`.

## Deployment

`.github/workflows/pages.yml` ("Catalog site") is separate from the marketplace checks in `validate.yml`. It shows three
checks: **Unit tests**, **Build site** and **Deploy to GitHub Pages**. PRs touching this folder run the first two; pushes
to `main` also deploy `dist/`. To redeploy an older commit, run the workflow manually and set `ref`. One-time setting: repository →
Settings → Pages → Source: **GitHub Actions**.

`vite.config.js` uses `base: './'`, so the same build works under `/<repo>/` and at `/`.
The repository slug for links comes from `GITHUB_REPOSITORY` in CI (fallback: this repo).

## Data

`public/catalog.json` currently holds the **sample data from the design** (34 artifacts, 12 changes),
not this repository's real plugins. The planned `scripts/build-catalog.mjs` should generate it
(and `feed.xml`, `llms.txt`) into `public/` before `vite build`. The footer links to those three
files 404 until then.

`design/` can be opened for comparison while `npm run dev` is running:
http://localhost:5173/design/Catalog%20Site.dc.html
