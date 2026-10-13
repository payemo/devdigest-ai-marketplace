# SDD Engineering Plugins — Specification

Status: draft · Audience: the marketplace author, then whoever ports the components
Sources: screenshots of steps 2–5 (release walkthrough) + the original repository https://github.com/payemo/dev-digest (`.claude/agents`, `.claude/skills`), mapping in §12.

## 1. Goal

Ship a set of plugins for **Spec Driven Development (SDD)** in this marketplace:
a main plugin `sdd-engineering` with the full SDD cycle and three dependency plugins that can
be reused on their own.

The cycle: **spec → plan → implement → verify → retro**.

### Not ported (from the original repository)
Product specs · secrets · cache · DevDigest-specific instructions.

## 2. Plugins

| Plugin | Role | Contains |
|---|---|---|
| `sdd-engineering` | Main, the SDD cycle | agents: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`; skills: `sdd`, `implement`, `workflow-retro`; `evals/`; README; CHANGELOG |
| `engineering-paved-path` | Dependency: shared skills | skills: React, Next.js, Fastify, architecture, testing, security |
| `research-tools` | Dependency | read-only agent `researcher` |
| `architecture-review` | Dependency (itself depends on `engineering-paved-path`) | generalized agent `architecture-reviewer` |

Splitting rule: anything that makes sense **without** the SDD cycle (stack knowledge, review, research) lives in a
dependency plugin. `sdd-engineering` keeps only what implements the cycle itself.

### 2.1 `sdd-engineering`

| Component | Type | Purpose |
|---|---|---|
| `spec-creator` | agent | turns a task into a specification |
| `implementation-planner` | agent | turns a specification into an implementation plan |
| `implementer` | agent | executes an approved plan |
| `plan-verifier` | agent | checks that the result matches the plan/specification |
| `sdd` | skill | the full pipeline spec → plan → execute → review → verify |
| `implement` | skill | executes an **approved** plan: implementer → review → bounded fix loop → plan-verifier |
| `workflow-retro` | skill | analyzes a **finished** run and produces a retro |

Agents call shared skills only through the namespace, e.g. `engineering-paved-path:react-best-practices`.

### 2.2 `engineering-paved-path`
The single home for shared skills (React, Next.js, Fastify, architecture, testing, security).
Exact skill names are taken from the original repository; in the plugin each skill is its own folder
`skills/<name>/SKILL.md`. Skills are **not copied** into other plugins — only depended on.

### 2.3 `research-tools`
`researcher` is **read-only**: the frontmatter lists `Read, Grep, Glob, Bash, WebFetch, WebSearch` and **no `Write`/`Edit`**.
`Bash` is kept deliberately (decision, see §10): the method relies on `git log/blame/show` and `rg` for "why is it like this"
questions, so "read-only" for shell use is enforced by the agent's instructions, not by the tool list. The README says this plainly.

### 2.4 `architecture-review`
`architecture-reviewer` is generalized (no DevDigest structure); project rules arrive through explicit inputs
and through `engineering-paved-path:architecture`.

## 3. Dependency graph

```
sdd-engineering ──► engineering-paved-path  (^1.0.0)
                ├─► research-tools          (^1.0.0)
                └─► architecture-review     (^1.0.0) ──► engineering-paved-path (^1.0.0)
```

Declared in each plugin's `plugin.json` (`dependencies` array):

| Plugin | `dependencies` | Why |
|---|---|---|
| `sdd-engineering` | `engineering-paved-path ^1.0.0`, `research-tools ^1.0.0`, `architecture-review ^1.0.0` | agents/skills call all three by namespace |
| `architecture-review` | `engineering-paved-path ^1.0.0` | `architecture-reviewer` declares `skills: engineering-paved-path:onion-architecture` and points to other paved-path skills (`security`, `fastify-best-practices`, …) as the owners of out-of-scope concerns |
| `engineering-paved-path` | none | leaf |
| `research-tools` | none | leaf |

Rule: a plugin declares **every** plugin whose skills/agents it references by namespace, even if that plugin
would also arrive transitively. So `sdd-engineering` declares `engineering-paved-path` directly: its
`implementation-planner` and `implementer` use those skills themselves, not only through `architecture-reviewer`.
The linter enforces the rule (§8).

There are no cycles. `engineering-paved-path` and `research-tools` are leaves; no dependency plugin
knows anything about `sdd-engineering`.

> The exact syntax of the `dependencies` field (name + `version` range, resolution behavior, the
> git-tag requirement for semver) must be checked against the current Claude Code documentation before
> implementation, see §10.
>
> **Verified against the Claude Code docs (2026-10-13):** `dependencies` is an array whose entries are either
> `"name"` or `{ "name": "...", "version": "^1.0.0" }` (optional `marketplace`). `version` is a node-semver range.
> A constrained dependency installs from the highest git tag `<plugin-name>--v<version>` that satisfies the range.
> For a relative-path plugin with no satisfying tag, Claude Code falls back to the marketplace's current copy and checks
> the range at load time.

## 4. Repository structure

```
.claude-plugin/marketplace.json
plugins/
  sdd-engineering/
    .claude-plugin/plugin.json
    agents/{spec-creator,implementation-planner,implementer,plan-verifier}.md
    skills/{sdd,implement,workflow-retro}/SKILL.md      (+ scripts/ if needed)
    evals/
    README.md          how everything works together
    CHANGELOG.md       versions and releases
  engineering-paved-path/
    .claude-plugin/plugin.json
    skills/{...}/SKILL.md
    README.md  CHANGELOG.md
  research-tools/
    .claude-plugin/plugin.json
    agents/researcher.md
    README.md  CHANGELOG.md
  architecture-review/
    .claude-plugin/plugin.json
    agents/architecture-reviewer.md
    README.md  CHANGELOG.md
```

## 5. Packaging rules (all four plugins)

These plugins are public and not tied to any one project. The rules below apply to **every** file shipped in
`plugins/<name>/` — agents, skills, skill references/examples, evals, READMEs — not just to skills.

1. **No DevDigest couplings anywhere.** Forbidden in any shipped file: the strings `devdigest` / `dev-digest` / `DevDigest`;
   the source repository's package scope (`@devdigest/*`), packages (`reviewer-core`, `agent-runner`) and context files
   (`INSIGHTS.md`, `routing.md`, `repo-rules.md`, `TESTING.md`); hardcoded `.claude/skills/` and `.claude/agents/` paths;
   links to the source repository; product-specific module names in examples. The linter enforces the machine-checkable
   subset (§8); the rest (e.g. `server/`, `client/` as layout assumptions, `pnpm`-specific commands) is checked by review and
   by the grep audit in §9. **Allowed:** this marketplace's own name (`devdigest-marketplace`, `devdigest-ai-marketplace`)
   in install commands, and the `author`/`owner` name in manifests. Third-party attribution lives in a `NOTICE.md`.
2. **Replace paths with explicit inputs** (a skill/agent argument or a stated default): where the spec lives,
   where the plan lives, where to write the result, which context files to read, which test command to run.
   A default such as `docs/plans/` is acceptable only as a **stated, overridable default** in an *Inputs* table, and the
   agent first prefers a directory the repository already uses. Project context files (`CLAUDE.md`, `AGENTS.md`, …) may be
   named only as *optional* things to look for, never as required inputs.
3. Call skills/agents of other plugins through the namespace (`engineering-paved-path:react-best-practices`,
   `research-tools:researcher`, `architecture-review:architecture-reviewer`) and declare that plugin in `dependencies` (§3).
   Never copy a skill into another plugin.
4. Locate helper scripts through `${CLAUDE_SKILL_DIR}`, **not** through `.claude/skills/`.
   Everything needed at runtime lives inside `plugins/<name>/` (the repository's root `scripts/` folder
   is not available after installation).
5. Examples in prompts use a neutral fictional project (e.g. `src/orders/…`), never DevDigest module names
   (`digest`, `finding-labels`, `pr-notes`, `review-exports`, `severity-policy`).
6. Before a release: search every plugin for the forbidden strings above, secrets, caches and product specs —
   the result must be empty. The linter does this automatically (§8).

### 5.1 README for every plugin (required)

Every plugin ships a `README.md` written for someone who has never seen this repository. Common sections:
what it is and when to use it · installation (`/plugin marketplace add …`, `/plugin install <name>@devdigest-marketplace`,
what is pulled in as dependencies) · a table of components (name, type, what it does, inputs, outputs) ·
usage examples with real invocations · dependencies and what each is used for · customization/inputs ·
limitations · link to `CHANGELOG.md` · license/attribution.

Plugin-specific content:

- `sdd-engineering`: what SDD is, and a diagram of the cycle spec → plan → implement → verify → retro; a table of
  which agent/skill runs at which step; an end-to-end example run; which shared skills are used and where they come from;
  how optional steps behave when `test-writer`/`security-reviewer`/`pr-self-review` are not installed.
- `engineering-paved-path`: a table of the 6 skills (what each covers, when it triggers, `user-invocable` or not);
  how agents in other plugins use them by namespace; third-party attribution and licenses.
- `research-tools`: how to call `researcher` (question → cited answer), what it can and cannot do, its tool list.
- `architecture-review`: what it checks and what it does not (single-concern), inputs (layers, dependency direction,
  packages/rules), output format (findings with `file:line`), its dependency on `engineering-paved-path`.

Source for README content: the original repository's `.claude/agents/README.md` and `.claude/skills/README.md`
(and per-skill READMEs such as `react-testing-library/README.md`) may be reused where they describe generic
behavior; they must pass the same forbidden-strings check before landing here.

### 5.2 CHANGELOG (the versions and releases file)
A `CHANGELOG.md` in every plugin, Keep a Changelog format: `## [1.0.0] - YYYY-MM-DD`, with sections
Added / Changed / Fixed / Removed. The version in the changelog = `version` in `plugin.json` = the git tag version.

## 6. Registration in the marketplace

- Four entries in `.claude-plugin/marketplace.json`; each has `name`, `source` (`./plugins/<name>`),
  `description`, an owner (`author` in `plugin.json` / the marketplace `owner`) and `version`.
- All initial versions are `1.0.0`.
- A commit or tag of the marketplace pins the state of the catalog.

**Conflict with the repository's current rules:**
1. The linter (`scripts/validate-marketplace.mjs`) reports an error if `version` is set in both the entry and `plugin.json`.
   → set `version` **only in `plugin.json`** (the screenshot says "in the entry", but this is safer for the linter
   and for the Claude Code docs, where `plugin.json` takes precedence).
2. The README says "`version` is intentionally omitted". These plugins need it (semver dependencies
   `^1.0.0`), so update the README: the `sdd-*`/dependency plugins are versioned.

## 7. Release process
1. Update `CHANGELOG.md` and `version` in the plugin's `plugin.json`.
2. Lint + tests (`node scripts/validate-marketplace.mjs --strict`, `node --test "scripts/*.test.mjs"`, `claude plugin validate .`).
3. Merge into `main`, then create the plugin's git tag (tag format: whatever dependency resolution requires, §10).
4. Release order: dependency plugins first, then `sdd-engineering`.
5. A change that breaks inputs/skill names → a major version and `^2.0.0` in the dependents.

> **Verified (2026-10-13):** the tag format is `<plugin-name>--v<version>` (e.g. `research-tools--v1.0.0`), where `<version>` equals
> `version` in that commit's `plugin.json`. Because a manifest that sets `version` keeps users on the cached copy until the string changes,
> a rollback of a versioned plugin must be a **new, higher version** that restores the old content, not a revert under the same version.
> The tooling for steps 1–4 and for rollback is described in the repository README ("Release and rollback").

## 8. New linter checks (proposal)
- In `dependencies`, every dependency exists in this marketplace, the range is valid, and there are no cycles.
- **Undeclared namespace use:** if any file in a plugin references `<other-plugin>:<component>` where `<other-plugin>`
  is a plugin of this marketplace, that plugin must be in the referencing plugin's `dependencies` → error otherwise.
  (This is what catches `architecture-review` using `engineering-paved-path:*` without declaring it.)
- Every plugin with a `version` has a `CHANGELOG.md` with an entry for exactly that version, and a `README.md`.
- **Forbidden strings in every text file of every versioned plugin** (agents, skills, references, evals, READMEs;
  `.claude-plugin/plugin.json` is exempt): `devdigest`/`dev-digest` (case-insensitive, after stripping the marketplace's own
  name `devdigest-marketplace` / `devdigest-ai-marketplace`), `@devdigest/`, `INSIGHTS.md`, `routing.md`, `repo-rules.md`,
  `.claude/skills/`, `.claude/agents/`, `reviewer-core`, `agent-runner` → error. "Versioned" (has `version` in `plugin.json`)
  is the trigger, so an unversioned sample plugin is exempt without a hardcoded list. Generic layout words such as `server/` and
  `client/` are not linted (too many legitimate uses); they are covered by review.
- Agent frontmatter: `name` equals the file name and `description` is present.
- **Status: implemented** in `scripts/validate-marketplace.mjs` with tests in `scripts/validate-marketplace.test.mjs`.
- `researcher` has no write tools in `tools`.

## 9. Acceptance criteria
1. `/plugin install sdd-engineering@devdigest-marketplace` also installs the three dependencies.
2. All 4 agents and all three skills (`sdd`, `implement`, `workflow-retro`) appear under the `sdd-engineering:` namespace.
3. Calling `engineering-paved-path:*` from an agent works without any local copies.
4. None of the four plugins (agents, skills, references, evals, READMEs) contains DevDigest names, paths, repository
   links, secrets, caches or product specs (§5 rule 1; checked by the linter plus a grep audit for secrets and layout words).
5. Scripts are found through `${CLAUDE_SKILL_DIR}`; the plugins work after installation into someone else's project.
6. `researcher` has no `Write`/`Edit` in `tools`.
7. Every plugin has a README (§5.1); the `sdd-engineering` README describes the cycle; the CHANGELOG has a `1.0.0` entry for each of the four plugins.
8. `architecture-review` declares `engineering-paved-path` in `dependencies`; installing it alone also installs `engineering-paved-path`.
9. The linter and `claude plugin validate .` pass.

## 10. Decisions made and open questions

Decided:
1. The plan-execution skill keeps the name **`implement`** (`/implement`); the name `run-plan` from the screenshot is not used.
2. The skill **`sdd`** is part of `sdd-engineering` (the full cycle), alongside `implement` and `workflow-retro`.
3. `test-writer`, `security-reviewer`, `doc-writer`, `brainstorm`, `pr-self-review`, `architecture-reviewer-lite`
   are **not ported**. Steps in `sdd`/`implement`/`implementation-planner` that reference them become **optional**:
   they run only if the corresponding agent/skill is installed, otherwise the summary marks them "skipped: not installed".
4. Dependencies are declared per §3, including `architecture-review → engineering-paved-path`.
5. `engineering-paved-path` 1.0.0 = exactly 6 skills (§12.2). `zod`, `typescript-expert`, `drizzle-orm-patterns`,
   `postgresql-table-design`, `mermaid-diagram` are candidates for 1.1.0.

6. `researcher` keeps `Bash` (no `Write`/`Edit`); acceptance #6 is "no `Write`/`Edit` in `tools`" (§12.3).
7. `architecture-reviewer-lite` is not ported: in the source it is the B side of an eval A/B, not a product agent.
8. `devdigest-marketplace` / `devdigest-ai-marketplace` are allowed in install commands (§5 rule 1).

Open:
- **Licenses of third-party skills.** `fastify-best-practices` comes from `mcollina/skills` — **MIT**, attributed in
  `plugins/engineering-paved-path/NOTICE.md`. `next-best-practices` comes from `vercel-labs/next-skills`, which has **no
  license file** (checked 2026-10-13): redistribution rights are unconfirmed. Before tagging `engineering-paved-path--v1.0.0`
  either get permission/a license from upstream, or drop the skill from 1.0.0 (then 5 skills; add it back in 1.1.0).
- Check against the Claude Code docs: the `dependencies` syntax and the git tag format for semver resolution. *(Resolved 2026-10-13, see the notes in §3 and §7.)*
- *(Resolved: `hello-devdigest` was removed in commit 8fd4e12.)*

## 11. Order of work
1. `engineering-paved-path` (skills from the source) → 2. `research-tools` → 3. `architecture-review` →
4. `sdd-engineering` (agents, skills, evals, README, CHANGELOG, dependencies) →
5. registration in `marketplace.json`, update the repository README →
6. the linter checks from §8, run all checks, tags.

## 12. Mapping from the original repository (`payemo/dev-digest`, `.claude/`)

### 12.1 `sdd-engineering`

| Source | Target | What to change |
|---|---|---|
| `agents/spec-creator.md` | `agents/spec-creator.md` | paths `specs/NN-*.md`, `INSIGHTS.md` (≈19 + 7 mentions) → inputs "where to write the spec" and "which context files to read"; remove `doc-writer`; `Agent` stays, but only for `researcher` (→ `research-tools:researcher`) |
| `agents/implementation-planner.md` | same | the most DevDigest couplings (`CLAUDE.md` ×16, `server/`, `routing.md`, `docs/plans`): the plan path = an input; routing skills → an explicit "file/stack → skill" table with the `engineering-paved-path:*` namespace; keep the "single agent vs multi-agent" question |
| `agents/implementer.md` | same | remove `server/ client/ reviewer-core/ @devdigest/*`; packages and test commands come from the plan/inputs; remove `pr-self-review`, `routing.md` |
| `agents/plan-verifier.md` | same | `docs/plans` → an input; generalize `server/ client/` in examples |
| `skills/implement/SKILL.md` | `skills/implement/SKILL.md` | the name stays `implement`; `test-writer`/`security-reviewer`/`pr-self-review` become optional; `--plan` stays; reviewer → `architecture-review:architecture-reviewer` |
| `skills/workflow-retro/SKILL.md` | `skills/workflow-retro/SKILL.md` | paths `docs/retros/ledger.md`, `docs/plans`, `specs/` → inputs with defaults; shorten the agent list to those present |
| `skills/sdd/SKILL.md` | `skills/sdd/SKILL.md` | the same changes as `implement`; `test-writer`/`security-reviewer`/`pr-self-review` optional |

Not ported: `brainstorm`, `doc-writer`, `test-writer`, `security-reviewer`, `hooks/pr-self-review-gate.sh`,
`hooks/write-verdict.js`, `settings.json`, the skills `pr-self-review`, `dependency-checker`, `commit`,
`engineering-insights`, `frontend-code-organization`.

### 12.2 `engineering-paved-path` (6 skills)

| Area from the screenshot | Skill from the original | Note |
|---|---|---|
| React | `react-best-practices` | already generic, few changes |
| Next.js | `next-best-practices` | `user-invocable: false`, stays |
| Fastify | `fastify-best-practices` | third-party (mcollina), remove `tile.json`, check the license |
| architecture | `onion-architecture` | **description and content are tied to DevDigest** (`server/`, Container, `reviewer-core`) → generalize; do **not** port the eval fixtures `digest/`, `finding-labels/` etc. (DevDigest code) |
| testing | `react-testing-library` | generic ("Applicable to any Vite + React project") |
| security | `security` | generic OWASP 2025; `references.md`, `checklists.md`, `examples.md` stay |

### 12.3 `research-tools` and `architecture-review`

| Plugin | Source | What to change |
|---|---|---|
| `research-tools` | `agents/researcher.md` | remove `@devdigest`, `INSIGHTS.md`, `server/ client/ reviewer-core` in examples. The original has `Bash` without `Write/Edit` — "read-only" rests on the prompt, not on the tools; keep it in the plugin but describe it clearly (refine acceptance #6: `Write`/`Edit` are absent) |
| `architecture-review` | `agents/architecture-reviewer.md` (+ `architecture-reviewer-lite.md` — decide whether to take it) | currently **onion-only and backend-only** (`server/**`, `reviewer-core/**`); generalize to "layers and dependency direction", with packages/rules as inputs; `skills: onion-architecture` → `engineering-paved-path:onion-architecture` |

### 12.4 Evals
In the original, evals exist only in the `onion-architecture` skill (`evals/evals.json` + DevDigest code fixtures). For `sdd-engineering/evals/`
there are no ready-made fixtures: create new, neutral ones (a minimal fictional project) — a separate work item.
