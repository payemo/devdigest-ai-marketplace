# Evals

A small starter suite for `claude plugin eval`. Every case runs in an empty workspace on a made-up project
(a "password reset email" feature for an imaginary store), so nothing here depends on any real repository.

```bash
cd plugins/sdd-engineering
claude plugin eval . --max-cost-usd 2          # run the whole suite
claude plugin eval . --case 'spec-creator-*'   # one group
```

| Case | Checks |
|---|---|
| `spec-creator-stays-implementation-free` | The spec has the required sections and AC-IDs and names no files, functions or libraries |
| `spec-creator-asks-when-unspecific` | A vague request ("make it better") yields clarifying questions, not a guessed spec |
| `implement-requires-a-plan` | `/implement` without `--plan` asks for the path and does not start work |

These are behavioral checks on LLM output, so they are statistical: run them more than once (`runs:` in a case's
frontmatter) before treating a single failure as a regression. Add cases by creating `evals/<name>/prompt.md` plus
`graders/*.md`; keep fixtures fictional and project-neutral.
