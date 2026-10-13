# Examples — Onion Architecture on a fictional `orders` backend

The snippets use a made-up service (`orders`, `invoices`, `payments`) with the typical
layout from [SKILL.md](SKILL.md). Map the paths onto your project's layer map.
Section numbers match the rules in SKILL.md.

---

## 1. Routes hold no logic

### ❌ `src/modules/invoices/routes.ts`

The handler resolves the account, calls the payment provider, and upserts every invoice —
three layers' worth of work inside one route:

```ts
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';

app.get('/accounts/:id/invoices', { schema: { params: IdParams } }, async (req) => {
  const { tenantId } = await getContext(container, req);
  const [account] = await container.db
    .select()
    .from(t.accounts)
    .where(and(eq(t.accounts.tenantId, tenantId), eq(t.accounts.id, req.params.id)));
  if (!account) throw new NotFoundError('Account not found');

  const provider = await container.payments();
  const remote = await provider.listInvoices(account.externalId);
  for (const inv of remote) {
    await container.db.insert(t.invoices).values({ /* 12 fields */ })
      .onConflictDoUpdate({ /* … */ });
  }
  // … 200 more lines
});
```

Three things are wrong: the route imports the ORM, it holds the sync rule (a business
rule), and none of it is reachable from a job or a test without standing up HTTP.

### ✅ `src/modules/orders/routes.ts`

Same shape of work, correctly layered:

```ts
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OrderService } from './service.js';

export default async function ordersRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OrderService(container);

  app.get('/orders/:id/items', { schema: { params: IdParams } }, async (req) => {
    const { tenantId } = await getContext(container, req);
    return service.listItems(tenantId, req.params.id);
  });

  app.get('/orders/:id/timeline', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    const timeline = await service.getTimeline(req.params.id);
    if (!timeline) throw new NotFoundError('Order timeline not found');
    return timeline;
  });
}
```

Context → service → map → throw. Nothing else.

---

## 2. A service is callable without HTTP

### ✅ `src/modules/exports/service.ts`

The same service methods back an HTTP route *and* a background job, which is only
possible because nothing in the service names the web framework:

```ts
export class ExportService {
  private repo: ExportRepository;

  constructor(private container: Container) {
    this.repo = new ExportRepository(container.db);
  }

  registerBuildJobHandler(): void {
    this.container.jobs.register(BUILD_EXPORT_JOB_KIND, async (payload) => {
      await this.runBuildJob(payload as BuildExportPayload);
    });
  }

  async runBuildJob(payload: BuildExportPayload): Promise<void> {
    const { exportId, tenantId, format } = payload;
    const token = await this.container.secrets.get(STORAGE_TOKEN_SECRET);
    const rows = await this.repo.listRowsForExport(tenantId, exportId);
    const url = await this.container.storage.put(buildFileName(exportId, format), render(rows, format), { token });
    await this.repo.markReady(exportId, url);
  }
}
```

Note `container.storage` — the `ObjectStorage` **port**, not `S3Storage`. And `render` /
`buildFileName` are pure helpers, so the formatting rule is unit-testable with no storage.

---

## 3. Repository owns the SQL, splits by aggregate

### ✅ `src/modules/orders/repository.ts`

One public class, three colocated implementation modules, one import surface:

```ts
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Order, OrderItem, OrderTimeline } from '../../contracts/orders.js';
import type { OrderRow, ItemRow } from '../../db/rows.js';

export type { OrderRow, ItemRow };
export type PaymentRow = typeof t.payments.$inferSelect;

import * as orderRepo from './repository/order.repo.js';
import * as itemRepo from './repository/item.repo.js';
import * as paymentRepo from './repository/payment.repo.js';

export class OrderRepository {
  constructor(private db: Db) {}
  // composes the three modules; public API stays flat
}
```

`constructor(private db: Db)` — a `Db`, never a `Container`. Growing past one aggregate
splits the *implementation*, not the interface.

---

## 4. Row types: type-only, and never on the wire

### ❌ `src/modules/customers/helpers.ts`

A pure helper pulling in the whole schema module to name one row:

```ts
import * as t from '../../db/schema.js';

export function toCustomerDto(row: typeof t.customers.$inferSelect): Customer {
  return { id: row.id, tenant_id: row.tenantId, /* … */ };
}
```

The mapper is correct — camelCase row → snake_case DTO is exactly right. The *import* is
the problem: a value import of the schema in the application layer.

### ✅ `src/modules/orders/helpers.ts`

```ts
import type { OrderItem } from '../../contracts/orders.js';
import type { ItemRow, OrderRow } from './repository.js';
```

Type-only, via the repository's re-export. A shared rows file exists for the same purpose
across modules:

```ts
// src/db/rows.ts
export type OrderRow = typeof t.orders.$inferSelect;
export type ItemRow = typeof t.orderItems.$inferSelect;
```

The fix for `customers/helpers.ts` is one line: add `CustomerRow` to `db/rows.ts` and
`import type { CustomerRow } from '../../db/rows.js'`.

---

## 5. Ports and adapters

### ✅ Port — `src/ports/payments.ts`

```ts
/**
 * Port interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `src/adapters/*`; mock implementations live
 * alongside for tests/dev (services depend on the interface, not the impl).
 */
export interface ChargeRequest {
  amountCents: number;
  currency: string;
  customerRef: string;
  idempotencyKey: string;
  timeoutMs?: number;
}

export interface PaymentProvider {
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(chargeId: string): Promise<void>;
}
```

### ✅ Composition root — `src/platform/container.ts`

Lazy, cached, resolved through the secrets port, overridable in tests:

```ts
get storage(): ObjectStorage {
  if (this.overrides.storage) return this.overrides.storage;
  this._storage ??= new S3ObjectStorage(this.config.exportBucket);
  return this._storage;
}

async payments(): Promise<PaymentProvider> {
  if (this.overrides.payments) return this.overrides.payments;
  if (this._payments) return this._payments;
  const key = await this.secrets.get('PAYMENTS_API_KEY');
  if (!key) throw new ConfigError('PAYMENTS_API_KEY is not configured');
  this._payments = new StripePaymentProvider(key);
  return this._payments;
}
```

The `ConfigError` throws when the feature is *used*, not at boot — that is what keeps a
missing key from breaking unrelated endpoints.

### ❌ What this prevents

```ts
// in a service — two rules broken at once
import Stripe from 'stripe';
const stripe = new Stripe(process.env.PAYMENTS_API_KEY!);
```

The SDK escapes `adapters/`, and the secret escapes the secrets port.

---

## 6. The pure core

### ✅ `packages/pricing-core/package.json`

The description is the architectural contract, and it must stay true:

```json
"description": "Pricing engine — pure logic (tax, discounts, rounding, order total recompute). No DB/network/FS; the only side effect is an injected ExchangeRates port. Consumed by the API and the batch worker as source via tsconfig path alias."
```

Its only runtime dependency is `zod`. It is consumed through a path alias:

```json
"paths": {
  "@acme/pricing-core": ["../packages/pricing-core/src/index.ts"],
  "@acme/contracts": ["./src/contracts/index.ts"]
}
```

That alias is why the batch worker can share the engine with no build step — and why
turning the core into a built package would break more than it fixes.

---

## 7. Adding a module — the full shape

```
src/modules/<domain>/
├── routes.ts        ← required. schema + getContext + service call
├── service.ts       ← the use case. ports + repository. no SQL, no web framework
├── repository.ts    ← the only ORM / schema import
├── helpers.ts       ← pure. type-only row imports
└── constants.ts     ← job kinds, secret names, thresholds
```

Only `routes.ts` is mandatory — but a module with a DB query and no `repository.ts` is a
known-violation case (§9 of [SKILL.md](SKILL.md#9-known-violations--do-not-copy)), not a
precedent.

Register it statically in the module index, then run the project's dependency checker
(for example `npx depcruise src --config .dependency-cruiser.cjs`).
