---
name: workflow-retro
description: >
  Retrospective on one finished run of the SDD / implement pipeline: per-agent
  cost, context that was loaded more than once, and concrete prompt edits to make
  the next run cheaper — then appends one row to a retro ledger so the trend
  across runs is visible. Use after /sdd or /implement finishes, and for "retro
  the pipeline", "what did that run cost", "/workflow-retro".
---

# Workflow retro

Run once, after a pipeline run (`/sdd`, `/implement`) has finished. Read-only
on product code; the only writes are a report and one ledger row.

## Args

```
/workflow-retro [--spec <path>] [--plan <path>] [--retros-dir <dir>] [--topic "<slug>"]
```

| Flag | Default | Meaning |
|---|---|---|
| `--spec` | the spec the run's summary names, if any | The run's spec file. |
| `--plan` | the plan the run's summary names | The run's Development Plan. |
| `--retros-dir` | `docs/retros/` (or the retros directory the repo already uses) | Where the report and `ledger.md` live. |
| `--topic` | derived from the plan's file name | Slug used in the report's file name. |

If neither `--spec` nor `--plan` can be found, ask which run to analyze and stop.

## 1. Gather the run

Identify the run: the spec, the plan (from the args or the run's summary) and
the branch. Take per-agent figures from the session transcript(s) under
`~/.claude/projects/<project>/*.jsonl` — each subagent call records its `usage`
(input, output, cache-read, cache-creation tokens) and tool calls. If a figure
is not recoverable, write `n/a`; never estimate silently.

## 2. Measure

Per agent that actually ran (for example `spec-creator`, `researcher`×n,
`implementation-planner`, `implementer`, `architecture-reviewer`,
`plan-verifier`, and any optional test-writing or security agent that was
installed) — leave out agents that did not run:

| Agent | Calls | Input | Output | Cache read | Tool calls | Fix-loop round |
|---|---|---|---|---|---|---|

**Duplicated context** — files read by two or more agents (same path in
several agents' `Read`s): list path, readers, and which agent's brief could
have carried the excerpt instead. Highlight a whole project-notes or
instruction file read by every agent.

## 3. Recommend

At most five concrete edits, each naming the file to change and the change:

- *prompt* — a line to add/remove in an agent definition (its `agents/<name>.md`
  in the plugin that ships it, or the project's own override);
- *handoff* — what the orchestrator should pass in the spawn prompt so the
  agent skips a read;
- *skip* — a stage that added nothing this run (e.g. a second fix round).

No generic advice ("be concise"). If nothing stands out, say so.

## 4. Write

- Report: `<retros-dir>/<yyyy-mm-dd>-<topic-slug>.md` with sections Run,
  Cost table, Duplicated context, Recommendations.
- Ledger: append one row to `<retros-dir>/ledger.md` (create it with the header
  below if missing) — never edit earlier rows.

```markdown
| Date | Topic | Pipeline | Total tokens | Costliest agent | Fix rounds | Duplicated reads | Δ vs previous |
|---|---|---|---|---|---|---|---|
```

`Δ vs previous` compares *Total tokens* with the row above (`+12%`, `-8%`,
`first run`). That column is the trend; keep it filled.

## Don't

- Don't edit agent prompts yourself — recommend; the user applies.
- Don't invent numbers. `n/a` beats a guess.
