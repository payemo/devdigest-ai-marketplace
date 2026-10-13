# sdd-engineering

**Spec Driven Development (SDD) for Claude Code.** A set of agents and skills that take a change from a rough idea to
verified code in a fixed, reviewable cycle:

```
 spec ──► plan ──► implement ──► verify ──► retro
  │        │          │   ▲         │          │
  │        │          ▼   │         │          │
  │        │       review ─┘         │          │
  │        │     (bounded fix loop)  │          │
  ▼        ▼          ▼              ▼          ▼
 what    how it     code +        did it     what it cost,
 & why   gets built  tests        match the   what to
                                  plan?       trim next time
```

Each step has one owner, writes one artifact, and hands the next step a file — not a chat history. That is what makes
a run resumable, reviewable and cheap to re-run from the middle.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install sdd-engineering@devdigest-marketplace
```

The three plugins it depends on are installed automatically:

| Dependency | Version | Used for |
|---|---|---|
| [`engineering-paved-path`](../engineering-paved-path/README.md) | `^1.0.0` | Shared skills (React, Next.js, Fastify, onion architecture, testing, security) applied while planning and implementing |
| [`research-tools`](../research-tools/README.md) | `^1.0.0` | `researcher`, spawned by `spec-creator` to ground open questions |
| [`architecture-review`](../architecture-review/README.md) | `^1.0.0` | `architecture-reviewer`, the layering review in the review/fix loop |

Everything is addressed by namespace once installed: `sdd-engineering:implementer`, `/sdd-engineering:sdd`, …

## What you get

| Component | Type | Step | Accepts (inputs) | Produces (outputs) |
|---|---|---|---|---|
| `spec-creator` | agent | spec | a request / issue / rough ask; optional design files, context files, spec directory | one spec file (`FR-n` / `AC-n` requirements, edge cases, contracts; no implementation detail) |
| `implementation-planner` | agent | plan | a spec (or thin request); context files; test commands; optional skill-routing override | one Development Plan file (steps with `Closes`, `Files`, `Owner`, `Done when`; test plan; risks) |
| `implementer` | agent | implement | a plan path; optional design files, test commands | code changes left **uncommitted** + an implementation report |
| `architecture-review:architecture-reviewer` | agent (dependency) | review | a diff, base ref, layer map | cited findings (`CRITICAL`/`WARNING`/`SUGGESTION`) |
| `plan-verifier` | agent | verify | a plan path, base ref, test commands | per-step status table, re-run test evidence |
| `sdd` | skill | spec → verify | `--spec` / `--prompt` / `--designs` (at least one) + options | the whole pipeline, with two human checkpoints, ending in one summary |
| `implement` | skill | implement → verify | `--plan <path>` + options | execution + review + bounded fix loop + verification, for an **approved** plan |
| `workflow-retro` | skill | retro | a finished run (spec / plan) | a cost report and one ledger row |

### Which one do I call?

| Situation | Use |
|---|---|
| New feature, from scratch, end to end | `/sdd` |
| You already have an approved plan | `/implement --plan <path>` |
| You want only a spec, or only a plan | spawn `spec-creator` / `implementation-planner` directly |
| The run finished and you want to know what it cost | `/workflow-retro` |

## Usage

### End-to-end run

```
/sdd --prompt "Let shoppers reset a forgotten password: emailed one-hour, single-use link, then choose a new password" \
     --designs designs/forgot-password.png,designs/reset-form.png \
     --context docs/ARCHITECTURE.md,docs/CONVENTIONS.md \
     --reviewer-inputs "Layer map: routes in src/http/, services in src/app/, repositories in src/db/. Typecheck: npm run typecheck"
```

What happens:

1. **Spec.** `spec-creator` reads your context files (only the ones for the packages involved), asks 2–4 clarifying
   questions if the request is thin, spawns `researcher` for anything it can't verify by reading the repository, and writes
   `docs/specs/NN-password-reset.md`. It marks every unknown `[NEEDS CLARIFICATION: …]` instead of guessing.
   **Checkpoint 1:** you see a synopsis (goal, requirement count, open questions) and approve or request changes.
2. **Plan.** `implementation-planner` pressure-tests the spec, gives its own **Recommendation**, maps every planned file
   to the shared skills that apply, and writes `docs/plans/<slug>.plan.md`, with every acceptance criterion closed by a
   step. **Checkpoint 2:** you see step count, packages touched and migration/contract flags before any code exists.
3. **Execute.** `implementer` runs the steps it owns, applying the matched `engineering-paved-path:*` skills per file,
   then runs the test suites of the packages it changed — once, at the end.
4. **Review & fix loop.** `architecture-reviewer` (and a security reviewer if you have one) scan the diff. Any
   `CRITICAL`/`WARNING` becomes a short Fix Plan; `implementer` fixes; the same reviewers re-scan. Bounded by
   `--max-fix-rounds` (default 3); a finding that survives a fix unchanged is escalated to you instead of retried.
5. **Verify.** `plan-verifier` checks the original plan step by step, re-runs the plan's test commands, and reports each
   step as `Done as planned`, `Done, deviated (justified)`, `Done, deviated (unjustified/undisclosed)`, `Not done` or
   `Can't verify`.
6. **Summary.** One report: artifact paths, reviewer verdicts, test status, and a **Skipped steps** list.

Then run your own pre-PR checks and open the pull request yourself — the pipeline never opens one.

### Executing an existing plan

```
/implement --plan docs/plans/password-reset.plan.md --max-fix-rounds 2
```

### Retro

```
/workflow-retro --plan docs/plans/password-reset.plan.md
```

Reads per-agent token usage from your session transcripts, lists context that several agents loaded redundantly, proposes
at most five concrete prompt/handoff edits, and appends a row to `docs/retros/ledger.md` so the trend is visible.

### Inputs instead of hardcoded paths

Nothing in this plugin assumes a repository layout. Where a path or command is needed it is an **input** with a stated
default:

| Input | Flag / prompt field | Default |
|---|---|---|
| Spec directory | `--specs-dir` | existing `specs/` or `docs/specs/` |
| Plans directory | `--plans-dir` | existing plans directory or `docs/plans/` |
| Retros directory | `--retros-dir` | existing retros directory or `docs/retros/` |
| Context files | `--context` | root `README.md` + `CLAUDE.md` / `AGENTS.md` / `ARCHITECTURE.md` / `CONTRIBUTING.md` if present |
| Test commands | the plan's *Test plan* | the testing doc, else the packages' manifest scripts and CI config |
| Reviewer settings | `--reviewer-inputs` | inferred layer map, configured dependency checker |
| Design files | `--designs` | none |

## Optional steps and what happens without them

Two specialists are **not** part of this marketplace. The pipeline uses them only if an agent with that name is installed
in your session:

| Agent name | Step it would run | When absent |
|---|---|---|
| `test-writer` | test coverage for plan steps it owns | skipped, reported as **"skipped: not installed"**; those plan steps are listed as unowned |
| `security-reviewer` | security review when the diff's added lines touch secrets, raw SQL, new public routes, etc. | skipped, reported as **"skipped: not installed"**; use `engineering-paved-path:security` as a manual checklist |

`/implement` never runs `test-writer` by design (a cost-saving default); it reports the uncovered steps instead.

## Shared skills used, and where they come from

All come from `engineering-paved-path`, loaded by namespace — never copied here:

| Skill | Used by | When |
|---|---|---|
| `engineering-paved-path:react-best-practices` | planner, implementer | React components, hooks, state |
| `engineering-paved-path:react-testing-library` | planner, implementer | React tests |
| `engineering-paved-path:next-best-practices` | planner, implementer | Next.js app code |
| `engineering-paved-path:fastify-best-practices` | planner, implementer | Fastify routes, plugins, schemas |
| `engineering-paved-path:onion-architecture` | planner, implementer; reviewed by `architecture-reviewer` | backend layering |
| `engineering-paved-path:security` | planner, implementer | content-triggered: secrets, raw SQL, new public routes, auth, uploads |

Per file, at most three skills are loaded; the rest are checked by reading the relevant section only.

## Safety model

- `spec-creator` writes only spec files; `implementation-planner` writes only the plan; `plan-verifier` and the reviewers
  are read-only; `researcher` is read-only.
- `implementer` never commits, never opens a PR, never hand-edits generated files (migrations, lockfiles), never runs
  destructive data commands, and stops after two failed fix attempts at the same test.
- Orchestrating skills write only Fix Plan files and their own summary; they never write product code, specs or plans.
- Fix loops are capped; an unchanged finding is never retried blindly.

## Evals

`evals/` contains a starter suite for `claude plugin eval` on a neutral fictional project. See
[evals/README.md](evals/README.md).

## Limitations

- Skills run in the **main thread** (they orchestrate subagents and talk to you); they are not themselves subagents.
- The plan is the contract. A plan that omits a migration or contract change the work needs makes `implementer` stop
  rather than improvise.
- `workflow-retro` can only report token figures that session transcripts recorded; unavailable figures are `n/a`.

## Versioning

Semantic versioning; release tags are `sdd-engineering--v<version>`. A change that breaks agent/skill names or inputs
is a major bump and moves the dependency range in dependents. See [CHANGELOG.md](CHANGELOG.md).
