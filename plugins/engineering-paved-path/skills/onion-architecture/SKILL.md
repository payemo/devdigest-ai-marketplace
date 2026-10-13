---
name: onion-architecture
description: >
  Enforces Onion Architecture layering in a TypeScript/Node backend. Decides which
  layer a piece of backend code belongs to and which imports that layer may have:
  routes vs service vs repository, ports vs adapters, what may touch the ORM, what
  may touch the web framework, what the composition root is for. Use when adding or
  changing a backend module, adding a route, service or repository, writing a
  database query, adding an adapter or port, wiring something into the container,
  or reviewing a backend diff for boundary violations. Also for "where does this
  query go", "can I query the DB here", "should this be a service", "layering",
  "coupling", "dependency direction", "clean architecture", "hexagonal". Does NOT
  cover how to write the web-framework route itself — see
  [fastify-best-practices](../fastify-best-practices/SKILL.md) for Fastify — or ORM
  query syntax.
---

# Onion Architecture — layering rules for a backend

Where backend code goes, and what it is allowed to import. The point of this skill
is to state the rule so it applies to a *new* file, and to stop existing violations
from becoming the pattern.

This is the **layering** half. The **authoring** halves are the framework skill
(for Fastify: [fastify-best-practices](../fastify-best-practices/SKILL.md)) and your
ORM's documentation. Don't duplicate their rules here.

## Inputs: map the rules onto the project first

The rules below talk about *layers*; paths differ per project. Before applying them,
establish this **layer map** (use values the caller passed in; otherwise infer them
from the code, and say what you assumed):

| Layer | Typical location (override per project) |
|---|---|
| Edge | `modules/*/routes.ts`, app/server bootstrap, request-context helpers |
| Composition root | `platform/container.ts` (or `composition/`, `di/`) |
| Infrastructure | `adapters/**`, `db/**`, `modules/*/repository{,/*}.ts` |
| Application | `modules/*/service.ts`, `modules/*/helpers.ts` (pure) |
| Ports | `ports/**` (interfaces for everything outside the process) |
| Core | domain/engine packages, wire contracts (`contracts/**`) |

Also establish: the web framework, the ORM, the third-party SDKs that must stay in
adapters, and whether a dependency checker (`dependency-cruiser`, `eslint-plugin-boundaries`,
`madge`) is configured. If the project has its own architecture document, **it wins**
over the typical layout here; this skill supplies the principle and the checklist.

## Severity Levels

- **CRITICAL** — breaks the dependency rule; should be caught by a dependency checker and reverted in review
- **HIGH** — erodes a layer without technically inverting it
- **MEDIUM** — inconsistency; cheap now, bulk cleanup later

---

## The dependency rule

> All code can depend on layers more central, but code cannot depend on layers
> further out from the core.
> — [Palermo, 2008](references.md)

Outer depends on inner. Never the reverse. **Many secondary write-ups state this
backwards** — if a source tells you inner may depend on outer, it is wrong; check it
against Palermo before following it.

The database is not the centre. It is external, and so is every third-party API, the
LLM, the filesystem and the web framework.

## Layer map

```
                  ┌─────────────────────────────────────┐
   Edge           │ routes · app/server bootstrap       │
                  │ request-context helpers             │
                  ├─────────────────────────────────────┤
   Composition    │ container (composition root)        │
                  ├─────────────────────────────────────┤
   Infrastructure │ adapters/** · db/**                 │
                  │ repositories                        │
                  ├─────────────────────────────────────┤
   Application    │ services                            │
                  │ helpers (pure)                      │
                  ├─────────────────────────────────────┤
   Ports          │ interfaces for external things      │
                  ├─────────────────────────────────────┤
   Core           │ domain logic · wire contracts       │
                  └─────────────────────────────────────┘
```

Two things that look like violations but are not:

- **Mixed utility folders are allowed to stay mixed.** A `platform/` or `shared/`
  folder may hold both infrastructure-flavoured and pure utilities. Aim the rules at
  the layered folders (`modules/**`, `adapters/**`, `db/**`, contracts) and don't
  "fix" the utility folder as a drive-by.
- **A pure core may be a sibling package consumed as source** (e.g. through a tsconfig
  path alias) instead of a built package. If the project does that on purpose to
  share the core with another runtime without a build step, keep it that way.

## Decision table (start here)

| I have a new… | It goes in | May import |
|---|---|---|
| HTTP endpoint | `modules/<domain>/routes.ts` | zod contract, request-context helper, its service, typed errors |
| Use case / business rule | `modules/<domain>/service.ts` | ports, its repository, helpers, the container (see §8) |
| SQL query | `modules/<domain>/repository.ts` | the ORM, the schema, the db client |
| SQL for a second aggregate in the same domain | `modules/<domain>/repository/<agg>.repo.ts` | same as above |
| Pure transform / DTO mapper | `modules/<domain>/helpers.ts` | contracts, **type-only** row types |
| Magic number, job kind, secret name | `modules/<domain>/constants.ts` | nothing |
| Call to a third-party SDK | `adapters/<thing>/<impl>.ts` | that SDK |
| Interface for an external thing | `ports/<thing>.ts` | contracts |
| Request/response shape | `contracts/<area>.ts` | zod only |
| Domain/engine logic with no I/O | the core package | zod, injected ports |
| Wiring, lifetime, secret resolution | the container | everything |

If two rows apply, take the **inner** one. Pushing logic inward is always safe;
pulling it outward is what this skill exists to prevent.

---

## 1. Routes hold no logic (CRITICAL)

A handler does exactly four things: resolve context, hand off to the service, map the
result, translate errors. No SQL, no branching on business state, no third-party SDK.

```ts
app.get('/orders/:id/items', { schema: { params: IdParams } }, async (req) => {
  const { tenantId } = await getContext(container, req);
  return service.listItems(tenantId, req.params.id);
});
```

- **Never import the ORM or the schema in a `routes.ts`.**
- **Validation is the route's schema** (zod, JSON schema), not a hand-rolled parse in
  the body. Invalid input is rejected before your handler runs.
- **Construct the service once**, above the handlers, not per request.
- **Resolve the request context on every authenticated route.** It is the one place
  tenant/workspace scoping is resolved; skipping it is how a tenancy leak gets in.

## 2. Services own the use case (CRITICAL)

`service.ts` is the application layer: it orchestrates ports and its repository to
satisfy one use case. It is the *only* layer that knows the business rule.

- **No SQL, ever.** No ORM import, no schema import, no `container.db`. Persistence
  goes through the repository.
- **No web framework.** A service must be callable from a job handler and a test with
  no HTTP in sight.
- **Depend on ports, not implementations.** `container.payments`, `container.mailer`
  return interfaces. Never `new StripeClient(...)` inside a service.
- **The container in the constructor is allowed here** — see §8.

## 3. Repositories are the only place SQL lives (CRITICAL)

`repository.ts` is the persistence adapter. It is the sole holder of ORM and schema
imports for its domain.

- **Return a contract type or a row type — never a query builder.** Nothing
  lazily-evaluated crosses the boundary.
- **Split by aggregate when it grows**, into `repository/<agg>.repo.ts`, with the
  class composing them so its public API stays flat.
- **Never import the container.** A repository takes the db handle in its constructor
  and nothing else. Reaching for the container here means the query wants data it
  should have been passed.
- **Own the tenant scope.** Every query filters by the tenant/workspace id (directly,
  or via the parent row that carries it).

## 4. Row types vs contracts (HIGH)

The seam that keeps the ORM out of the wire format.

- **An inferred row type may cross module boundaries** — put shared row types in one
  type-only file (e.g. `db/rows.ts`) so a consumer never has to import another
  module's `repository.ts` just to name a shape.
- **A row must never reach an HTTP response.** Map it to a contract first. This is the
  camelCase-column → snake_case-wire rule restated as a boundary: `totalCents` (row)
  → `total_cents` (DTO). Use whatever casing the project's wire format uses.
- **Import row types type-only:**

  ```ts
  import type { OrderRow, ItemRow } from './repository.js';
  ```

  not `import * as t from '../../db/schema.js'` for a `typeof t.x.$inferSelect`. The
  first names a type; the second drags the schema module into a layer that has no
  business knowing it exists.
- **A type-only import may point "outward" and that is fine.** It is erased at compile
  time, so it creates no runtime dependency and no runtime cycle. Configure the cycle
  checker to ignore cycles whose every hop is type-only — otherwise the import style
  this section mandates would fail its own check.

## 5. Helpers are pure (HIGH)

`helpers.ts` holds functions over their arguments. Data in, data out.

- **No I/O, no container, no `this`.** The test: it can be unit-tested with no mocks
  and no DB.
- **May import contracts and type-only row types.** May not import the schema or ORM.
- **If it needs the container, it is a service method**, not a helper.

## 6. Ports and adapters (CRITICAL)

Every call leaving the process goes through an interface.

- **The port is an interface in the ports folder** — e.g. `PaymentProvider`,
  `EmailSender`, `GitClient`, `LLMProvider`, `SecretsProvider`. Inner layers name only
  these.
- **The implementation lives in `adapters/<thing>/`** and is the only place its SDK may
  be imported. Keep the allow-list of "SDK → adapter folder" explicit and enforced.
- **Adding an external dependency means adding a port first.** If the interface feels
  awkward to define, the feature is reaching for the wrong seam.
- **Mocks are peers of the real adapters** (e.g. `adapters/mocks.ts`). A test swaps
  them through container overrides — it does not monkey-patch a module.

## 7. The core stays pure (CRITICAL)

The domain/engine package and `contracts/**` are the centre.

- **No DB, no network, no filesystem, no web framework, no `process.env`.** The only
  side effects are injected ports.
- **Contracts import zod and nothing else.** A contract that imports the schema has
  inverted the dependency: the wire format would then be defined by the storage format.
- **Business invariants live in the core.** A rule such as "an order total is recomputed
  from its surviving line items" is a business rule, so it belongs in the core, not in
  a route.

## 8. The composition root (HIGH)

The container is the one place that knows every concrete class. It resolves secrets,
caches clients, and hands out interfaces.

- **Only the container constructs adapters.** Lazily, through a getter, so a missing
  API key fails when the feature is used rather than at boot.
- **Cross-cutting repositories are built here** so one module never reaches into
  another module's data layer.
- **The container in a service constructor is an accepted exception.** It is formally a
  service locator — the application layer naming the composition root — and a stricter
  onion would inject each port explicitly. Many teams allow it because it is typed and
  fully swappable in tests, which is the property the rule protects.

  **Direction of travel:** new services may take explicit ports instead
  (`constructor(private mailer: EmailSender, private repo: OrderRepository)`) and that
  is preferred for anything with a narrow dependency set. Don't retrofit existing
  services as a drive-by.
- **Never import the container from a repository or a helper** (§3, §5).

## 9. Known violations — do not copy (CRITICAL)

Most real codebases have modules that predate the rule and query the ORM straight from
route handlers. If the project keeps such an exception list (in the dependency checker
config or an architecture doc), treat it as a **debt list that should only shrink**.

**If you are editing one of those files anyway, extract the queries you touch into a
`repository.ts` and remove the module from the exception list.** Do not add a new query
to them, and do not use them as a precedent when judging new code.

When reviewing, report a violation in a legacy file only if the diff *adds* to it.

## 10. Tests follow the layers (MEDIUM)

- **Unit tests mock at the port.** Container overrides + the mock adapters; no DB, no
  network.
- **Mark DB-backed tests with one naming convention** (e.g. `*.it.test.ts`) so CI can
  split the hermetic lane from the database lane. A DB-backed file without the marker
  silently runs in the hermetic lane and fails there.
- **Test the service, not the route,** for business rules. The route has no logic left
  to test (§1); the use case is where the behaviour is.
- **Cover the kinds of breakage per layer,** don't chase coverage numbers.

---

## 11. Modules don't reach into each other (HIGH)

A module is a vertical slice: its `routes.ts`, `service.ts` and `repository.ts` are
private to it. Reaching across slices couples two domains' persistence and makes the
import graph un-layerable.

- **Never import another module's `repository.ts` or `repository/*`.** If two modules
  need the same data, build the repository in the container and hand it in, or move the
  shared row type to the type-only rows file.
- **Don't import another module's `service.ts` or `routes.ts` either.** Share a pure
  function through that module's `helpers.ts`/`constants.ts`, or extract it to a shared
  utility folder when it is genuinely cross-cutting. Two services calling each other is
  how a cycle gets in.
- **Why:** a repository is the one place that knows a table's shape and scope rules (§3).
  A second module querying through it bypasses the owning service's business rules.

## 12. Failure is a typed error (MEDIUM)

Define one error taxonomy (`NotFoundError`, `ValidationError`, `ConflictError`,
`ExternalServiceError`, …) and let the app's error handler turn each into the response
envelope with the right status.

- **Services and helpers throw these**, never `new Error(...)` and never a status code.
  A bare `Error` surfaces as an opaque 500, and a status code in a service is HTTP
  leaking inward (§2).
- **Routes don't catch to re-map.** Let the typed error propagate to the handler.

## 13. Configuration enters through one door (HIGH)

`process.env` is read in exactly two places: the config module (env → typed config) and
the secrets adapter (secrets, with env as fallback). Everything else receives values by
injection.

- **No `process.env` in `modules/**`, `db/**` or `contracts/**`.** A service that needs a
  limit reads it from the injected config; one that needs a secret asks the secrets
  port. Reading the environment inline makes the use case untestable without mutating
  global state and hides a config key from the config type.
- Secrets never go in the config object — the secrets port only.

---

## 14. Background work goes through the job runner (HIGH)

Anything slow or retryable (clone, index, report build) runs on a job runner exposed by
the container: a concurrency-limited queue with timeout and retry, ideally mirrored to a
table so a failed run is visible and resumable.

- **Register the handler once, in the service constructor**, keyed by a kind constant
  from `constants.ts`. Registering inside a method re-registers on every call and
  silently replaces the handler.
- **Enqueue from the service**, never from `routes.ts`. The route calls a service
  method; the service decides what runs async. A route that calls `jobs.enqueue(...)` has
  put a use-case decision in the edge (§1).
- **No bare string kinds** (`'report.build'`) at call sites; they drift from the
  registration and nothing type-checks the match.
- **Payloads are plain JSON.** The job may run after the request is gone, so the handler
  never captures `req`/`reply` or a per-request object.

## 15. Prompts live in files; models come from settings (MEDIUM)

Applies only if the project calls an LLM.

- **System prompts are files** (Markdown), loaded through one helper and named by a
  constant. A service never holds a multi-line prompt string: it can't be reviewed or
  versioned as a prompt, and it bypasses any injection guard that wraps system prompts.
- **The model call goes through the port** (`container.llm(provider)`).
- **The model/provider choice comes from one settings lookup.** Importing that lookup
  from another module is the accepted shared function, not a §11 violation.

---

## Review checklist

- [ ] No ORM / schema import in a `routes.ts` or `service.ts`
- [ ] No `container.db` outside a repository
- [ ] No third-party SDK imported outside `adapters/`
- [ ] No web-framework import outside routes / app bootstrap / request-context helper
- [ ] Repository takes the db handle, not the container
- [ ] Row types imported **type-only**; no row shape in an HTTP response
- [ ] `helpers.ts` is pure — no container, no I/O
- [ ] New external dependency has a port first
- [ ] The core and `contracts/` still import nothing but zod and ports
- [ ] Request context resolved on every authenticated route
- [ ] DB-backed tests carry the project's marker
- [ ] No import of another module's `repository`, `service` or `routes`
- [ ] Services throw the typed errors — no bare `Error`, no status codes
- [ ] Job handler registered once in the service constructor; `enqueue` only from a service, with a kind constant
- [ ] System prompts are files, not inline strings (if an LLM is used)
- [ ] No `process.env` outside the config module and the secrets adapter
- [ ] The project's dependency checker passes (if one is configured)

See [examples.md](examples.md) for each of these as a before/after on a fictional
`orders` module, and [references.md](references.md) for the sources these rules come
from.
