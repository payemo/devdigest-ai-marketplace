# engineering-paved-path

A set of shared, stack-specific engineering skills — the "paved path" other plugins and your own
agents lean on instead of re-explaining React, Next.js, Fastify, layering, testing and security every time.

The skills are plain `SKILL.md` knowledge packs. Claude loads them **on demand** when the task matches a
skill's description, or you can name one explicitly. Other plugins call them through the plugin namespace,
e.g. `engineering-paved-path:react-best-practices`, so there is exactly one copy of each rule set.

## Install

```
/plugin marketplace add <owner>/devdigest-ai-marketplace
/plugin install engineering-paved-path@devdigest-marketplace
```

No dependencies. It is a leaf in the marketplace's dependency graph: `sdd-engineering` and `architecture-review`
depend on it, not the other way round.

## What's inside

| Skill | Covers | Loads when you… | Invocable by you? |
|---|---|---|---|
| `react-best-practices` | Component design, state, hooks misuse, performance, data fetching; a severity-tagged anti-pattern catalog | write, review or refactor React components and hooks | yes |
| `next-best-practices` | Next.js App Router: file conventions, RSC boundaries, async APIs, data patterns, metadata, error handling, route handlers, images/fonts, bundling, self-hosting | work on a Next.js app | no — loaded by Claude as background knowledge |
| `fastify-best-practices` | Fastify routes, plugins, hooks, JSON-schema validation, serialization, error handling, logging, testing, deployment, WebSockets | build or debug a Fastify backend | yes |
| `onion-architecture` | Layering rules for a TypeScript/Node backend: routes → service → repository, ports and adapters, composition root, pure core, typed errors, config and job rules; a review checklist | add a route/service/repository/adapter, or review a diff for boundary violations | yes |
| `react-testing-library` | User-flow-oriented React Testing Library + Vitest: query priority, scenario matrix, MSW-first mocking, spec templates | write, review or set up React component and hook tests | yes |
| `security` | OWASP Top 10:2025 review guidance with a confidence-based reporting model, checklists, unsafe/safe code pairs and references | review code for vulnerabilities, or implement auth, input handling, uploads, secrets | yes |

Each skill is a folder under `skills/<name>/` with `SKILL.md` plus supporting files (`examples.md`, `references.md`,
`rules/…`, per-topic notes) that Claude opens only when needed.

## Using the skills

**Let Claude pick them up.** Describe the task naturally ("review this Fastify plugin", "where should this query live?")
and the matching skill loads.

**Name one explicitly.**

```
Use the onion-architecture skill to review the diff on this branch.
```

**From another plugin's agent or skill**, use the namespaced name:

```
engineering-paved-path:onion-architecture
engineering-paved-path:security
```

Skills with `user-invocable: false` (currently `next-best-practices`) are not meant to be run by hand; they only
inform Claude.

### Making `onion-architecture` fit your project

The skill states layering *principles* with a typical folder layout. It starts by asking for — or inferring — your
**layer map** (where routes, services, repositories, adapters, ports and the container live, which ORM and
framework you use, whether a dependency checker is configured). Pass that in the prompt for the best result:

```
Use onion-architecture. Layer map: routes in src/http/, services in src/app/, repositories in src/db/repos/,
ports in src/ports/, adapters in src/adapters/, container in src/container.ts. Review the staged diff.
```

If your repo has its own architecture document, it takes precedence; the skill supplies the checklist.

### Scope and limitations

- `security` is written for a **React + Express + MongoDB + JWT** stack. The OWASP principles and the
  "trace the data flow before you flag" model apply broadly; the code samples assume that stack.
- `react-testing-library` assumes a Vite + React + Vitest setup but works for any React project.
- `onion-architecture` targets TypeScript/Node backends. The principles hold elsewhere; the code samples don't.
- The skills are guidance, not linters: pair `onion-architecture` with a dependency checker
  (`dependency-cruiser`, `eslint-plugin-boundaries`) to enforce the CRITICAL rules mechanically.

## Candidates for a later release

`zod`, `typescript-expert`, `drizzle-orm-patterns`, `postgresql-table-design` and `mermaid-diagram` are planned for
1.1.0. 1.0.0 intentionally ships exactly the six skills above.

## Versioning and releases

Semantic versioning; release tags are `engineering-paved-path--v<version>`. A change that renames a skill or alters
what a dependent plugin relies on is a major bump. See [CHANGELOG.md](CHANGELOG.md).

## License and attribution

MIT. `fastify-best-practices` and `next-best-practices` are adapted from third-party work — see
[NOTICE.md](NOTICE.md) for sources and license terms.
