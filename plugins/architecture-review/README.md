# architecture-review

**`architecture-reviewer`** — a read-only sub-agent that reviews a diff for one thing only: whether it respects your
backend's **onion-architecture boundaries** (layers and the direction of dependencies). It returns findings with a
`file:line` citation each, a confidence score, and the exact rule each finding breaks. It never edits code.

It is deliberately *not* a general code review. A reviewer that is asked to find problems always finds some; by limiting
the scope to layering and requiring a citation and a rule for every finding, the output stays short and trustworthy —
and "no findings" is a normal, good result.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install architecture-review@devdigest-marketplace
```

Installing pulls in the plugin it depends on:

| Dependency | Version | Why |
|---|---|---|
| `engineering-paved-path` | `^1.0.0` | the agent loads `engineering-paved-path:onion-architecture` — the rule set it enforces |

`sdd-engineering` depends on this plugin and uses the reviewer in its review step, but `architecture-review` works
on its own.

## What you get

| Component | Type | What it does |
|---|---|---|
| `architecture-reviewer` | agent | Reviews a diff against the layering rules and reports cited, rule-tagged findings |

## What it checks

Rules from the `onion-architecture` skill, ordered by severity (CRITICAL → WARNING → SUGGESTION):

- Routes hold no logic; no ORM or schema import in routes or services
- SQL lives only in repositories; repositories take a db handle, not the container
- Third-party SDKs are imported only inside adapters; every external call goes through a port
- The pure core and wire contracts import nothing from outer layers
- Helpers are pure; row types are imported type-only and never reach an HTTP response
- Modules don't import each other's repositories, services or routes
- Configuration and background jobs enter through their designated doors

It does **not** review correctness, security, test quality, naming, performance, frontend code, or plan conformance — see
the exclusion table inside the agent for who owns each.

## Usage

```
Use the architecture-reviewer agent to review the changes on this branch against main.
```

Give it your project's specifics for the best result — all are optional, with defaults it will state in the report:

```
Use the architecture-reviewer agent.
Base ref: origin/main
Layer map: routes in src/http/, services in src/app/, repositories in src/db/repos/, ports in src/ports/,
           adapters in src/adapters/, container in src/container.ts, core in packages/core/
Dependency check: npx depcruise src --config .dependency-cruiser.cjs
Typecheck: npm run typecheck
Known violations: src/http/legacy/*.ts
Project rules: docs/ARCHITECTURE.md
```

### Inputs

| Input | Default when omitted |
|---|---|
| Target | working tree vs the base ref (staged, unstaged, untracked) |
| Base ref | merge-base with the default branch |
| Layer map | inferred from the code using the skill's typical layout (listed under *Assumptions*) |
| Dependency check command | the one configured in the repo, if found; otherwise none |
| Typecheck command | the repo's `typecheck` / `tsc --noEmit`, if present |
| Known violations | what the checker config or architecture doc lists; otherwise none |
| Project rules | architecture/instruction files at the repo root; they win over the skill's typical layout |

### Output

```markdown
# Architecture review: <target>
**Assumptions:** …
## Findings
| Severity | Confidence | Category | file:lines | Rule | Rationale |
## Checks run        ← dependency-check and typecheck output, verbatim
## Files reviewed
## Outside this agent's concern (not reviewed)
```

Rules of the road: findings below **0.7** confidence are not reported; a finding without a real changed-hunk citation
or a documented rule is dropped; legacy files on the known-violations list are not re-reported unless the diff *adds*
a violation; the agent never computes a score or a merge verdict — that stays with your pipeline.

## Safety model

- Tools: `Read, Grep, Glob, Bash`. No `Write`/`Edit`; it cannot change your files.
- `Bash` is for inspection and the two named checks (dependency check, typecheck). Redirection, in-place edits, commits
  and installs are forbidden by the agent's instructions.
- It spawns no other agents.

## Pair it with a dependency checker

An LLM review is a second line of defense. Configure `dependency-cruiser` or `eslint-plugin-boundaries` so the CRITICAL
rules fail your build; the reviewer runs that check first and treats its violations as the highest-confidence findings.

## Versioning

Semantic versioning; release tags are `architecture-review--v<version>`. A change to the agent's inputs or output
format is a major bump. See [CHANGELOG.md](CHANGELOG.md).
