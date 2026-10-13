# devdigest-ai-marketplace

[![Validate marketplace](https://github.com/payemo/devdigest-ai-marketplace/actions/workflows/validate.yml/badge.svg)](https://github.com/payemo/devdigest-ai-marketplace/actions/workflows/validate.yml)
[![Catalog site](https://github.com/payemo/devdigest-ai-marketplace/actions/workflows/pages.yml/badge.svg)](https://github.com/payemo/devdigest-ai-marketplace/actions/workflows/pages.yml)

Claude Code plugin marketplace.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install <plugin>@devdigest-marketplace
```

For a private repository, git credentials must already be stored on your machine
(SSH key without passphrase, or `gh auth login && gh auth setup-git`).

## Plugins

| Plugin | What it is | Depends on |
|---|---|---|
| [`sdd-engineering`](plugins/sdd-engineering/README.md) | Spec Driven Development: spec → plan → implement → verify → retro (4 agents, `sdd` / `implement` / `workflow-retro` skills) | `engineering-paved-path`, `research-tools`, `architecture-review` |
| [`engineering-paved-path`](plugins/engineering-paved-path/README.md) | Shared skills: React, Next.js, Fastify, onion architecture, React Testing Library, security | — |
| [`research-tools`](plugins/research-tools/README.md) | Read-only `researcher` agent with cited reports | — |
| [`architecture-review`](plugins/architecture-review/README.md) | Read-only `architecture-reviewer` agent for layering and dependency direction | `engineering-paved-path` |

```
sdd-engineering ──► engineering-paved-path
                ├─► research-tools
                └─► architecture-review ──► engineering-paved-path
```

Installing `sdd-engineering` installs the other three automatically:

```
/plugin install sdd-engineering@devdigest-marketplace
```

## Layout

```
.claude-plugin/marketplace.json   catalog
plugins/<name>/                   one directory per plugin (only this directory is shipped to users)
scripts/                          repo tooling, never shipped: linter, release and rollback scripts, and their tests
catalog-site/                     search site for the catalog, published to GitHub Pages (see its README)
.github/workflows/                validate.yml (marketplace harness), pages.yml (catalog site), release.yml (plugin releases)
```

Runtime scripts used by a plugin's hooks/MCP servers belong in `plugins/<name>/scripts/`
and are referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/...`. The root `scripts/` folder is not
available after installation.

## CI at a glance

Each concern is its own workflow, so a red mark always tells you which part broke:

| Workflow | Checks shown on a commit or PR | Covers |
|---|---|---|
| **Validate marketplace** (`validate.yml`) | `lint` | the marketplace harness: structural linter and the `scripts/` self-tests (linter, release, rollback) |
| **Catalog site** (`pages.yml`) | `Unit tests` · `Build site` · `Deploy to GitHub Pages` | the website only. Runs when `catalog-site/` changes; PRs run tests and the build but never deploy |
| **Publish plugin release** (`release.yml`) | `release` | a pushed `<plugin>--v<X.Y.Z>` tag |

## Adding a plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json` and components at the plugin root.
2. Add an entry to `.claude-plugin/marketplace.json`. The entry `name` must equal `plugin.json` `name`.
3. Run the checks below.

## Checks

```bash
node scripts/validate-marketplace.mjs --strict   # structural linter, no dependencies (see below)
node --test "scripts/*.test.mjs"                 # self-tests: linter, release and rollback scripts
claude plugin validate .                         # official validator (needs the CLI)
```

Besides structure, the linter enforces these rules for the plugin graph:

- every `dependencies` entry exists in this marketplace, has a valid semver range, and the graph has no cycles;
- a plugin that references another plugin by namespace (`other-plugin:component`) must declare it in `dependencies`;
- a versioned plugin has a `README.md` and a `CHANGELOG.md` section `## [<version>]` for the version in `plugin.json`;
- shipped files of versioned plugins (agents, skills, references, evals, READMEs) contain no project-specific strings
  (the source project's name, its package scopes, its context files, hardcoded `.claude/skills/` paths);
- an agent whose description says "read-only" lists no `Write`/`Edit`/`NotebookEdit` in `tools`.

## Versioning

`version` is intentionally omitted: every commit is an update for users. If you add it,
set it in `plugin.json` only and bump it on each release; otherwise users stay on the cached copy.

Two kinds of plugin therefore exist, and they are released and rolled back differently:

| | Unversioned (no `version`) | Versioned (`version` in `plugin.json`) |
|---|---|---|
| Users get an update | on every commit to the default branch | only when the `version` string changes |
| Release | merge to `main` | `release.mjs prepare` → merge → `release.mjs tag` |
| Rollback | `git revert <commit>` and merge | `rollback.mjs` (publishes a **higher** version with the old content) |
| Needed for | nothing special | `dependencies` with semver ranges such as `^1.0.0` |

## Release and rollback (versioned plugins)

Releases are tagged per plugin as `<plugin>--v<X.Y.Z>` (for example `research-tools--v1.0.0`). That is the format
Claude Code resolves dependency ranges against: a dependency installs from the highest tag that satisfies the range.
Every versioned plugin keeps a `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com) format with an
`## [Unreleased]` section. Scripts use only Node and git.

### Release

```bash
git switch -c release-research-tools
# 1. Collect notes under "## [Unreleased]" in plugins/research-tools/CHANGELOG.md while you work.
node scripts/release.mjs prepare research-tools minor    # patch | minor | major | X.Y.Z
#    bumps "version" in plugin.json, dates the CHANGELOG section, runs lint + `claude plugin validate`, commits
# 2. Open a PR and merge it into main.
git switch main && git pull
node scripts/release.mjs tag research-tools --push       # annotated tag + push
```

Pushing the tag runs `.github/workflows/release.yml`, which re-verifies it and creates a GitHub Release with the
CHANGELOG section as notes. `prepare` and `tag` refuse to continue when:

- the CHANGELOG has no entries to release, or no section for the version being tagged;
- `plugin.json` and the tag disagree, or the marketplace entry also sets a different `version`;
- the tag exists already, you are on the wrong branch, or the plugin directory has uncommitted changes;
- a dependency range (for example `^1.0.0`) has no matching tag yet. **Release dependencies first**, then their dependents.

Use `--dry-run` to see what would happen. To start versioning a plugin that has no `version` yet, set `"version": "1.0.0"`
and a `## [1.0.0] - <date>` CHANGELOG entry by hand, then run `release.mjs tag`.

### Roll back a bad release

```bash
git switch -c rollback-research-tools
node scripts/rollback.mjs research-tools --to 1.1.0 --reason "crashes on start"
# merge the PR into main, then:
node scripts/release.mjs tag research-tools --push
```

If `1.2.0` is bad, this restores the content of `1.1.0` and publishes it as **`1.2.1`**. Do not just revert and keep the
version: Claude Code caches a plugin by its `version`, so people who already have `1.2.0` would never see the fix. History is
kept: the CHANGELOG gets a new entry and the old tags stay. Dependents with `^1.0.0` pick up `1.2.1` automatically.

### Roll back or release the site

The catalog site (`catalog-site/`) is deployed by `pages.yml` from `main`. For a quick rollback, open the workflow in the
Actions tab → **Run workflow** → set `ref` to an earlier commit SHA (or run
`gh workflow run pages.yml -f ref=<sha>`). The next push to `main` that touches the site deploys `main` again, so follow up with a
`git revert` of the bad commit for a permanent fix.

### Rolling back anything else

For changes that are not versioned plugin content (`marketplace.json`, docs, tooling), or for unversioned plugins, use
`git revert` and merge; no special script is needed.
