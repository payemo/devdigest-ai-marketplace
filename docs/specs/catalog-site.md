# Catalog Site — Specification

Status: draft for design · Branch: `lab08-catalog-site`
Audience: designer first, then whoever implements it.

## 1. Purpose

A static website on GitHub Pages that lets people **find** things in this marketplace
(plugins, skills, agents, commands, hooks, MCP servers) by typing what they need,
and **install** them with one copy-paste.

Example: the user types *"I need a skill for code review"* and sees cards for every
artifact in the repository that matches those words.

### Goals
- Keyword search across the whole repository content, results shown as cards.
- Get from "found it" to "installed" in one click (copy command).
- Let a team assemble several plugins and get a ready-made install snippet.
- Show what changed recently and what a plugin costs in context.
- Make it easy to suggest a plugin or report a problem.

### Non-goals
- No backend, accounts, ratings, usage counters, analytics, or comments.
- No semantic/embedding search (keywords only).
- No dedicated plugin detail pages (a card expands in place instead).
- No UI framework, no front-end build step, no UI test suite.
- English only.

## 2. Scope (what is being designed)

| # | Feature | In scope |
|---|---|---|
| F1 | Keyword search with result cards, filters, shareable URL | yes (MVP) |
| F2 | Copy install command on every card | yes (MVP) |
| F3 | Bundle builder: select plugins, get install commands + `settings.json` snippet | yes (MVP) |
| F4 | Public machine-readable `catalog.json` and `llms.txt` | yes (MVP, no UI except a footer link) |
| F5 | Context-cost estimate on plugin cards | yes |
| F6 | "What's new" page + Atom feed from git history | yes |
| F7 | "Suggest a plugin" / "Report a problem" / "Edit on GitHub" links | yes |

## 3. Constraints that shape the design

- **Static only.** Everything is computed at build time or in the browser.
- **Public site.** All content shown is already public in the repository.
- **Catalog size.** Design for 5–200 plugins and up to ~1,000 artifacts. Layouts must
  work with 1 result and with 1,000.
- **Content is untrusted text** from repository files: long names, missing
  descriptions, no icons, no images. Cards must tolerate this. There is no artwork;
  identity comes from typography, color, and type badges.
- **Relative URLs only** (site is served under `/<repo>/`).
- **No third-party requests** (no CDN fonts, no trackers). System font stack or a
  self-hosted font file.

## 4. Information model (what a card can show)

Artifact types: `plugin`, `skill`, `agent`, `command`, `hook`, `mcp`.

| Field | Plugin | Skill | Agent | Command | Hook | MCP |
|---|---|---|---|---|---|---|
| Title | name (or `displayName`) | name | name | name | event + matcher | server name |
| Description | entry/plugin.json | frontmatter | frontmatter | frontmatter | – (generated: "Runs on PreToolUse for Bash") | generated: command or URL |
| Parent plugin | – | yes | yes | yes | yes | yes |
| Invoke string | – | `/plugin:skill` | `plugin:agent` | `/plugin:command` | – | – |
| Tags / category | yes | inherits | inherits | inherits | inherits | inherits |
| Component counts | yes | – | – | – | – | – |
| Context cost | yes (estimate) | yes | yes | yes | – | – |
| Last updated | yes | yes | yes | yes | yes | yes |
| Source link | folder | file | file | file | file | file |

Missing description → show muted text "No description provided." (never an empty gap).

## 5. Screens

Three pages, one shared header and footer.

### 5.1 Home / Search (`index.html`) — primary screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ ◼ DevDigest Marketplace        Search   What's new   GitHub ↗   [☾]  │ header
├──────────────────────────────────────────────────────────────────────┤
│        Find skills, agents and plugins for Claude Code               │ hero (collapses
│  ┌────────────────────────────────────────────────────────────┐ [/]  │  once a query
│  │ 🔍  Describe what you need, e.g. "review pull requests"     │      │  is entered)
│  └────────────────────────────────────────────────────────────┘      │
│  Try: code review · commit messages · testing · docs                 │ example chips
├──────────────────────────────────────────────────────────────────────┤
│ Type:  [All] [Plugins] [Skills] [Agents] [Commands] [Hooks] [MCP]    │ filter bar
│ Category: [any ▾]                         12 results · Sort: Best ▾  │
├───────────────────────────────────────────────┬──────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐     │  (desktop only)      │
│ │ card      │ │ card      │ │ card      │     │  Bundle panel,       │
│ └───────────┘ └───────────┘ └───────────┘     │  see 5.3             │
│ ┌───────────┐ ┌───────────┐                   │                      │
│ │ card      │ │ card      │                   │                      │
│ └───────────┘ └───────────┘                   │                      │
└───────────────────────────────────────────────┴──────────────────────┘
```

Behavior
- Typing searches live (debounced ~120 ms). Enter is not required.
- `/` focuses the search box. `Esc` clears it.
- URL mirrors state: `?q=code+review&type=skill&cat=quality`. Reload and share work.
- Empty query shows everything, grouped by type (Plugins first), no hero collapse.
- Type filter chips show counts for the *current query*, e.g. `Skills 7`.
- A result count line is announced to screen readers (`aria-live="polite"`).

Search rules (see §8) are invisible to the user except through highlighting:
matched words are highlighted in title and description.

### 5.2 What's new (`changelog.html`)

```
What's new                                              [Atom feed ↗]
Filter: [All plugins ▾]

2026-10-12
  ● hello-devdigest   Add greeting skill                    a1b2c3d ↗
  ● (marketplace)     Add catalog site spec                 e4f5a6b ↗
2026-10-05
  ● …
```

- Grouped by day, newest first, last 100 qualifying commits.
- Each row: plugin color dot + plugin name (or "marketplace" for repo-level changes),
  commit subject, short SHA linking to the commit on GitHub.
- A commit touching several plugins appears once per plugin.
- Plugin filter dropdown; state in URL (`?plugin=name`).
- Never shows author names or emails.

### 5.3 Bundle builder (panel on Home, not a separate page)

Purpose: pick several plugins → copy one block of commands, or one `settings.json`
snippet for a team repository.

- **Desktop (≥1024 px):** persistent right-hand panel, collapsed to a slim "Bundle (0)"
  tab when empty.
- **Tablet/mobile:** floating "Bundle (n)" button bottom-right → opens a bottom sheet.

```
┌ Your bundle (2) ─────────────── [Clear] ┐
│ ☑ hello-devdigest            [remove ×] │
│ ☑ code-review                [remove ×] │
│                                         │
│ Install with  (•) In Claude Code        │
│               ( ) From the shell        │
│ ┌─────────────────────────────────────┐ │
│ │ /plugin marketplace add owner/repo  │ │
│ │ /plugin install hello-devdigest@…   │ │
│ │ /plugin install code-review@…       │ │
│ └─────────────────────────────────────┘ │
│ [Copy commands]                         │
│                                         │
│ Share with your team (settings.json)    │
│ ┌─────────────────────────────────────┐ │
│ │ { "extraKnownMarketplaces": { … },  │ │
│ │   "enabledPlugins": { … } }         │ │
│ └─────────────────────────────────────┘ │
│ [Copy JSON]   Put this in .claude/…     │
└─────────────────────────────────────────┘
```

- Bundles contain **plugins only**. Adding a skill/agent/command/hook/MCP card to the
  bundle adds its parent plugin (button label on those cards: "Add plugin to bundle").
- Selection persists in `localStorage` (failures ignored) and in the URL as
  `?bundle=a,b`, so a bundle is shareable.
- Empty state: "Select plugins with the **+** button on any card. Commands and a
  team settings snippet appear here."
- A small note under the JSON: "Teammates still run
  `claude plugin install <name>@<marketplace> --scope project` once for plugins whose
  files live outside this repository." Shown only when relevant.

## 6. Components (design inventory)

For each component the designer should provide: default, hover, focus-visible,
active/pressed, disabled, and the states listed.

### 6.1 Card

```
┌───────────────────────────────────────────┐
│ [SKILL]                       hello-devdigest │ type badge · parent plugin
│ hello                                     │ title (mono or semibold)
│ /hello-devdigest:hello                    │ invoke string (mono, muted)
│ Greets the user and confirms that the …   │ description, 3-line clamp
│ #sample  #demo                            │ tags (max 3, "+2")
│ ~120 tokens always loaded · Updated 5d ago│ meta row
│ ───────────────────────────────────────── │
│ [ Copy install ]  [ + Bundle ]   [ ⌄ ]  [⋯]│ actions
└───────────────────────────────────────────┘
```

- **Type badge:** six visually distinct but quiet variants. Color must never be the
  only differentiator (badge text always present).
- **Plugin cards** additionally show component counts ("3 skills · 1 agent · 2 hooks")
  and the context-cost estimate (see §9); they sit first in the result order for ties.
- **Description:** clamped to 3 lines; full text in the expanded state.
- **Copy install:** copies `/plugin install <plugin>@<marketplace>`. After click the
  label changes to "Copied ✓" for 2 s. If the Clipboard API fails, the command is
  selected in a small inline field instead.
- **+ Bundle:** toggle; pressed state shows "In bundle ✓".
- **Expand (⌄):** shows full description, list of the plugin's components (each a row
  with type badge + name), the source path, and last-updated date. Keyboard accessible
  (`aria-expanded`).
- **Overflow (⋯) menu:** "View source on GitHub", "Edit on GitHub", "Report a problem".
- **States:** default · hover · focus · expanded · in-bundle · long-title (wrap, never
  truncate with ellipsis on mobile) · no-description · external-source.
- **External-source plugins** (hosted in another repository; their files can't be read
  at build time) show a "External" badge and only the fields from the marketplace
  entry; expanded view says "Contents are in the source repository" with a link.

Density: grid of cards, min card width ~300 px, 1 column on mobile, 2–3 on tablet and
desktop (4 on wide screens only if bundle panel is closed).

### 6.2 Search box
Large, single line, leading search icon, trailing clear button (visible when non-empty),
visible `/` shortcut hint on desktop. States: empty · focused · filled · no-results.

### 6.3 Filter chips and dropdowns
Single-select type chips (with counts), category dropdown (options derived from data;
hidden if no categories exist), sort dropdown (Best match / Name A–Z / Recently updated;
"Best match" disabled with an empty query).

### 6.4 Result states

| State | Content |
|---|---|
| Loading | Skeleton cards (catalog is small; shown only if load > 200 ms) |
| Results | Card grid + count line |
| No results | "No matches for "<query>"." Suggestions: remove filters, try fewer words, popular searches; link "Suggest a plugin for this" (prefilled, see §10) |
| Load error | "Couldn't load the catalog." + Retry + link to the GitHub repository |
| Empty catalog | "This marketplace has no plugins yet." |

### 6.5 Header / footer
- Header: logo + name, nav (Search, What's new), "GitHub ↗", theme toggle.
  Collapses to a menu button below 640 px.
- Footer: "Suggest a plugin", "Atom feed", "catalog.json", "llms.txt", "Source on GitHub",
  build info ("Catalog built 2026-10-13 · commit a1b2c3d").

### 6.6 Toasts
Only for "Copied" fallbacks and bundle-link copy. Auto-dismiss, never block.

## 7. Visual & interaction guidance (for the designer)

- **Personality:** developer tool — calm, dense but airy, text-first. Closer to a docs
  site than a store. No stock illustrations.
- **Typography:** system UI stack for text; monospace for names, invoke strings,
  commands, SHAs. Define a scale (title / body / small / mono).
- **Color:** a neutral base, one accent, six muted type-badge hues, semantic
  success/warning/danger. Provide **light and dark** themes; default to the OS setting
  (`prefers-color-scheme`), with a manual toggle remembered in `localStorage`.
  Deliver tokens (name → value) for: background, surface, border, text, muted text,
  accent, focus ring, each badge, semantic colors.
- **Spacing/radius/elevation:** define a small scale (e.g. 4-pt grid); cards are
  flat with a border, elevation only on hover/expanded.
- **Motion:** minimal (≤150 ms); respect `prefers-reduced-motion`. No scroll-jacking.
- **Responsive breakpoints:** <640 (mobile), 640–1023 (tablet), ≥1024 (desktop),
  ≥1440 (wide, max content width ~1280).
- **Accessibility (required):** WCAG 2.2 AA contrast in both themes; visible focus
  ring; every control reachable by keyboard; search results region labelled;
  count line `aria-live`; expandable cards use disclosure pattern; touch targets
  ≥ 44 px on mobile; no information by color alone.
- **Highlighting:** search matches use a background tint + underline-free emphasis that
  meets contrast in both themes.
- **Microcopy tone:** short, literal, no jargon beyond Claude Code terms.

Deliverables expected from design: low/high-fidelity mockups for the three screens at
mobile and desktop, both themes; the card in all states; bundle panel (empty, filled,
mobile sheet); empty/error states; token sheet; icon list (search, copy, check, plus,
chevron, external link, menu, sun/moon, overflow).

## 8. Search behavior (affects result expectations in mockups)

Documents: one per artifact. Searchable fields and weights:
title ×5 · tags/category ×3 · description ×3 · parent plugin name ×2 · body text ×1
(body = file content after frontmatter, first 4,000 chars).

Query processing:
1. Lowercase, split on non-letters/digits.
2. Remove English stop words (`i, need, a, an, the, for, to, of, that, which, with, my, me, want, looking, something …`).
3. **Type words** (`skill, skills, agent, agents, plugin, plugins, command, hook, mcp`)
   are removed from keywords and instead give a **boost** to that artifact type
   ("a skill for review" → skills about *review* rank first, other types still shown).
4. Light stemming (plural/-ing/-ed) applied to query and documents.
5. Synonym groups from `site/synonyms.json` expand each keyword
   (e.g. `review ≈ audit ≈ critique`).
6. A word matches exactly, as a prefix (≥3 chars), or within edit distance 1
   (≥5 chars; lower weight).
7. Score = Σ(field weight × match quality), multiplied by a coverage factor (more
   distinct query words matched → higher). At least one keyword must match.
8. Ties: plugins first, then name A–Z.

If all words are stop words, treat the query as empty.

## 9. Context-cost estimate (F5)

- Computed at build time. For each skill, agent and command:
  `ceil((len(name) + len(description)) / 4)` tokens — the part Claude keeps in context
  every turn. A plugin's value is the sum over its components.
- Shown as "~N tokens always loaded" with an info tooltip: "Estimate based on name and
  description length. Run `claude plugin details <name>` for the exact figure."
- Hide the line when N = 0.

## 10. Contribution links (F7)

All are plain `https://github.com/<owner>/<repo>/…` links built at build time.

| Link | Target |
|---|---|
| Suggest a plugin (header/footer, no-results) | `issues/new?template=plugin-suggestion.yml&title=Plugin+suggestion:+<query>` (query prefilled when coming from a search) |
| Report a problem (card menu) | `issues/new?template=problem-report.yml&title=[<plugin>]+&artifact=<path>` |
| Edit on GitHub (card menu) | `edit/main/<path>` |
| View source (card menu) | `blob/main/<path>` or `tree/main/<dir>` |

Requires two issue forms in `.github/ISSUE_TEMPLATE/`. Long prefilled values are
truncated so URLs stay under ~7,000 characters.

## 11. Data contract

### 11.1 `catalog.json` (also the public API, F4)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-13T09:00:00Z",
  "commit": "a1b2c3d",
  "marketplace": { "name": "devdigest-marketplace", "description": "…", "owner": "DevDigest",
                   "repo": "owner/repo", "branch": "main", "baseUrl": "https://owner.github.io/repo/" },
  "categories": ["quality", "docs"],
  "artifacts": [
    {
      "id": "skill:hello-devdigest/hello",
      "type": "skill",                 // plugin|skill|agent|command|hook|mcp
      "name": "hello",
      "title": "hello",
      "description": "…",
      "plugin": "hello-devdigest",     // null for type=plugin
      "invoke": "/hello-devdigest:hello",
      "tags": ["sample"], "category": "quality",
      "path": "plugins/hello-devdigest/skills/hello/SKILL.md",
      "install": "/plugin install hello-devdigest@devdigest-marketplace",
      "external": false,
      "updatedAt": "2026-10-12",
      "tokens": 38,                    // estimate; plugin = sum of components
      "counts": { "skills": 1 },       // plugin only
      "text": "first 4000 chars of body"
    }
  ],
  "changes": [
    { "date": "2026-10-12", "sha": "a1b2c3d", "subject": "Add greeting skill",
      "plugins": ["hello-devdigest"] }       // [] = repo-level
  ]
}
```

Rules: ids unique; strings are plain text (never HTML); `text` capped at 4,000 chars;
author names/emails never included.

### 11.2 Other generated files
- `feed.xml` — Atom feed of `changes` (last 50), absolute URLs from `baseUrl`.
- `llms.txt` — marketplace summary, then one line per plugin
  (`- [name](url): description`) with install command.

### 11.3 How artifacts are discovered
- Plugins: `marketplace.json` entries (+ `plugin.json` for relative-path plugins).
- Skills: `skills/*/SKILL.md` frontmatter `name`, `description`.
- Agents: `agents/**/*.md` frontmatter `name`, `description`.
- Commands: `commands/**/*.md` (name from filename, frontmatter `description`).
- Hooks: `hooks/hooks.json` (one artifact per event+matcher).
- MCP: `.mcp.json` (one artifact per server).
- Reuse the parsing helpers already present in `scripts/validate-marketplace.mjs`
  where practical; the build fails if the linter reports errors.

## 12. Technical approach (summary)

```
site/                     index.html, changelog.html, app.js, style.css, synonyms.json
scripts/build-catalog.mjs generates catalog.json, feed.xml, llms.txt into _site/
.github/workflows/pages.yml  lint → build → deploy (actions/deploy-pages)
.github/ISSUE_TEMPLATE/   plugin-suggestion.yml, problem-report.yml
```

- Vanilla HTML/CSS/ES modules. No bundler, no framework, no npm dependencies.
- `build-catalog.mjs` is Node, dependency-free, run in CI with `fetch-depth: 0`
  (needed for `git log`).
- **XSS rule:** all repository-derived text is inserted with `textContent`; no
  `innerHTML` and no Markdown rendering.
- **Privacy:** no cookies, no external requests, no analytics.
- Pages source must be set to "GitHub Actions" in repository settings (manual, once).
- Performance budget: first render of results < 1 s on a mid-range phone;
  `catalog.json` < 500 KB gzipped for 1,000 artifacts.

## 13. Acceptance criteria

Search (using the sample data, extend as plugins are added)
1. `I need a skill to greet` → the `hello` skill is the first card.
2. `greeting plugin` → `hello-devdigest` plugin card appears; skill card also appears.
3. `helo` (typo) → `hello` still found.
4. `the a for` (only stop words) → behaves as empty query.
5. `zzzz` → no-results state with working "Suggest a plugin" link prefilled with `zzzz`.
6. Filters + query are restored after reload and from a pasted URL.

Cards & bundle
7. "Copy install" puts exactly `/plugin install <plugin>@<marketplace>` on the clipboard.
8. Adding a skill card to the bundle adds its plugin once; removing works from the panel.
9. Generated `settings.json` snippet is valid JSON and matches the documented keys
   (`extraKnownMarketplaces`, `enabledPlugins`).

Pages & data
10. What's new lists commits grouped by day with no author info; feed validates as Atom.
11. `catalog.json` matches §11.1 and the build fails on duplicate ids or missing
    required fields.
12. Site works under a sub-path (`/<repo>/`), with JS disabled shows a notice
    ("This site needs JavaScript to search") plus a link to the repository.
13. Keyboard-only run-through of search → copy → bundle → copy JSON succeeds; both
    themes meet AA contrast.

## 14. Open items

- Final marketplace/site name and logo (placeholder wordmark until decided).
- Repository slug for links: derived from `GITHUB_REPOSITORY` in CI, from
  `git remote` locally (`payemo/devdigest-ai-marketplace` today).
- Whether `category` should become required in marketplace entries (the sample plugin
  has none; the category filter is hidden when no category exists).
- Synonym list ownership and initial content.
- Hooks/MCP cards: confirm they are worth showing as standalone results or only
  inside the expanded plugin card.

## 15. Suggested delivery order

1. `build-catalog.mjs` + `catalog.json` (+ self-checks in CI).
2. Search page: search box, cards, filters, URL state.
3. Bundle panel, copy actions.
4. Context-cost and What's new + feed.
5. Contribution links and issue forms.
6. `llms.txt`, Pages workflow, polish (themes, a11y pass).
