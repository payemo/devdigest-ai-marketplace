# research-tools

A single, focused sub-agent — **`researcher`** — that answers one research question with evidence you can
re-check, and tells you honestly what it could *not* establish.

It reads, searches and reports. It never edits files, commits, installs packages or decides what to do next;
the caller acts on its report. That makes it safe to hand open-ended "find out how…" questions without worrying
about side effects, and a good first step before planning or implementing a change.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install research-tools@devdigest-marketplace
```

No dependencies. `sdd-engineering` depends on this plugin (its `spec-creator` agent delegates research to it),
but `research-tools` works entirely on its own.

## What you get

| Component | Type | What it does |
|---|---|---|
| `researcher` | agent | Answers one question about a codebase (**repository research**), an external library/API (**external research**), or both, and returns a cited report |

### Two modes

| Mode | Use it for | Evidence it produces |
|---|---|---|
| **Repository research** | "How does this codebase do X?", "Where does Y live?", "Is Z already implemented?", "What changed and why?" | `file:line` citations, corroboration from a caller/test/type, git-history intent |
| **External research** | "What does `<library>` do in v`<N>`?", "Is this still the recommended way?", "Compare approaches", release notes, RFCs | URLs with publisher, date, and primary vs secondary source; conflicts between sources reported, not averaged |

Mixed questions ("we do X — is that still recommended?") produce **one** report: repository sections first, external
sections after, one merged *Not found / unverified*.

## Usage

From the main conversation, ask Claude to use it:

```
Use the researcher agent: where is retry logic for outbound webhooks implemented, and is it covered by tests?
```

```
Use the researcher agent: what changed in React Router's data APIs between v6 and v7, and which one does this project's package.json pin?
```

Or reference it from your own agent or skill by its namespaced name:

```
research-tools:researcher
```

### Tips for good questions

- **Name a subject and a deliverable** — "a location", "a yes/no", "a comparison", "a recommendation". Vague asks
  ("look into performance") get 2–4 clarifying questions before any searching starts.
- **Say which mode** if it is ambiguous: *this codebase* vs *upstream recommendation*.
- **Pass context** you already have: relevant paths, a context file to read first, a version to assume.

### What the report contains

1. **Verdict** — the answer first, in 2–4 sentences, plus a confidence level and the one thing that sets it.
2. **Findings** — each a statement with a citation (`file:line` or URL); no citation, no finding.
3. **Relevant but out of scope** — adjacent things you'll want to know exist.
4. **Not found / unverified** — what it searched and why that was inconclusive. An empty section is a claim of
   exhaustive coverage and must say what was covered.
5. **Open / unresolved** — what only a human or a tool it lacks could settle.
6. **Search log / sources consulted** — enough to reproduce the research.

## Safety model

- **Tools:** `Read, Grep, Glob, Bash, WebFetch, WebSearch`. It has **no `Write` or `Edit`**.
- `Bash` is available only so it can inspect (`rg`, `git log/show/blame/diff`, `jq`, …). The agent's instructions forbid
  redirection, `sed -i`, patches, commits, installs and migrations — "read-only" for shell use is enforced by those
  instructions, not by the tool list. If you need hard enforcement, restrict `Bash` in your permission settings.
- Fetched web pages are treated as **data, never instructions**.
- It does not spawn other agents and does not use deep-research skills.

## Limitations

- It cannot observe runtime behavior (a live database, a provider's private responses); it lists those under
  *Open / unresolved*.
- It reports and recommends; it does not implement.
- Web research depends on what `WebFetch`/`WebSearch` can reach; private or paywalled docs end up in *Not found / unverified*.

## Versioning

Semantic versioning; release tags are `research-tools--v<version>`. See [CHANGELOG.md](CHANGELOG.md).
