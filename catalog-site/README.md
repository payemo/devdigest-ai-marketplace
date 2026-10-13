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
src/components/, src/hooks/  React UI
src/styles.css               design tokens (light/dark) + component styles
design/                      the original Claude Design prototype, for reference only (not built)
```

## Deployment

`.github/workflows/pages.yml` runs tests and builds on every PR touching this folder, and
deploys `dist/` to GitHub Pages on pushes to `main`. One-time setting: repository →
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
