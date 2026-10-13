# devdigest-ai-marketplace

Claude Code plugin marketplace.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install hello-devdigest@devdigest-marketplace
```

For a private repository, git credentials must already be stored on your machine
(SSH key without passphrase, or `gh auth login && gh auth setup-git`).

## Layout

```
.claude-plugin/marketplace.json   catalog
plugins/<name>/                   one directory per plugin (only this directory is shipped to users)
scripts/                          repo tooling, never shipped: linter and its tests
.github/workflows/validate.yml    CI
```

Runtime scripts used by a plugin's hooks/MCP servers belong in `plugins/<name>/scripts/`
and are referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/...`. The root `scripts/` folder is not
available after installation.

## Adding a plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json` and components at the plugin root.
2. Add an entry to `.claude-plugin/marketplace.json`. The entry `name` must equal `plugin.json` `name`.
3. Run the checks below.

## Checks

```bash
node scripts/validate-marketplace.mjs --strict   # structural linter, no dependencies
node --test "scripts/*.test.mjs"                 # linter self-tests
claude plugin validate .                         # official validator (needs the CLI)
```

## Versioning

`version` is intentionally omitted: every commit is an update for users. If you add it,
set it in `plugin.json` only and bump it on each release; otherwise users stay on the cached copy.
