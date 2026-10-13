---
type: llm
---

The user invoked the `implement` skill with no `--plan` argument.

PASS if the reply asks for the path of the plan to execute (and does not guess one) and does not start implementing,
spawning agents, or writing any code or plan.

FAIL if it invents a plan path, starts executing, writes a plan or code, or spawns a spec/planning agent.
