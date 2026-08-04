# Multi-Tenant SaaS Plan (CafePOS)

> **Status: PLAN ONLY — not yet implemented.** This document describes how to turn
> CafePOS from an effectively single-cafe app into a multi-tenant SaaS where many
> independent cafes each get an isolated space. Build later, in the phases below.

## 1. Goal

One deployment (one API + one database) serves many cafes ("tenants"). Each cafe's
owner signs up, gets an isolated workspace, and can **only ever see their own** menu,
tables, orders, staff, inventory, customers, etc. A platform **Super Admin** can see
across all tenants.

## 2. Where we are today (the gap)

- The app looks multi-cafe (there's a `Branch` entity, a **Branches** screen, a
  SuperAdmin **Tenant Management** screen, and subscription plan limits) but it is
  **single-cafe in reality**.
- Core operational data is **global**: `MenuItem`, `CafeTable`, `Order`,
  `InventoryItem`, `CafeSettings`, `Customer`, `Coupon`, etc. are **not scoped** to
  any cafe. Only `StaffMember` carries a `BranchId`.
- There is **no `Tenant` entity** and **no data isolation**. `Subscription` and
  `CafeSettings` are single global rows (`db.Subscriptions.FirstAsync()`,
  `db.Settings.FirstAsync()`).
- Auth (`JwtTokenService`, `Program.cs`) issues a JWT with role but **no tenant**.

So "multi-cafe" = introduce a tenant boundary across the **entire stack**.

## 3. Tenancy model decision

**Recommended: shared database, shared schema, row-level `TenantId` discriminator**,
enforced by **EF Core global query filters**.

| Model | Isolation | Ops cost | Fit here |
|---|---|---|---|
| Shared DB + `TenantId` column (**recommended**) | Logical (query filters) | Lowest | Best — minimal infra, works with current single `CafePosDbContext` and in-memory/Postgres setup |
| Schema-per-tenant | Stronger | Medium | Overkill; complicates migrations |
| Database-per-tenant | Strongest | Highest | Only if a big customer demands physical isolation |

Rationale: the app already runs on a single `CafePosDbContext` (in-memory in dev,
Postgres via `ConnectionStrings:CafePos`). A `TenantId` column + query filters gives
real isolation with the least churn and no per-tenant migration/provisioning work.

## 4. Data model changes

### 4.1 New entity: `Tenant` (the cafe/business)
```
Tenant { Id, Name, Slug (unique, used in URLs/subdomain), Status (Active/Suspended/Trial),
         CreatedAt, PlanId/SubscriptionId (nav), OwnerUserId (nav) }
```
Add `DbSet<Tenant> Tenants` to `CafePosDbContext`.

### 4.2 Add `TenantId` (denormalized) to every tenant-owned entity
Denormalize `TenantId` onto **all** tenant entities — even child rows — so a single
uniform query filter works everywhere without joins.

**Tenant-owned (get `TenantId`):**
`MenuItem`, `CafeTable`, `Order`, `OrderItem`, `InventoryItem`, `CafeSettings`,
`Customer`, `Coupon`, `GiftCard`, `FavoriteItem`, `StaffTask`, `AppNotification`,
`ApprovalRequest`, `AuditLogEntry`, `StaffMember`, `Shift`, `PerformanceReview`,
`Branch`, `Subscription`, `Integration`, `AppUser`.

**Global / platform-level (no `TenantId`):**
`Tenant` itself; platform Super Admin users (a Super Admin's `TenantId` is null).

Notes:
- `CafeSettings` and `Subscription` become **one row per tenant** (today they're single
  global rows — every `FirstAsync()` on them must become tenant-scoped).
- Introduce an `ITenantScoped` marker interface (`int TenantId { get; set; }`) so the
  filter/stamp logic can target entities generically.

## 5. Tenant resolution & auth

1. **JWT carries the tenant.** Add a `tenantId` claim in `JwtTokenService`. Never trust
   a tenant id from the request body/query — always derive from the validated token.
2. **`ITenantContext` (scoped service)** populated from `HttpContext.User` on each
   request (`CurrentTenantId`, `IsSuperAdmin`). Register in `Program.cs` DI.
3. **Signup creates a tenant.** New `POST /api/auth/register-cafe`: creates `Tenant` +
   Owner `AppUser` + default `CafeSettings` + default `Subscription` (Trial) in one
   transaction, then issues a JWT with the new `tenantId`.
4. **Super Admin** logs in with a tenant-less token and can target any tenant
   (impersonate / filter bypass — see §6).

## 6. EF Core enforcement (the safety net)

This is what makes isolation reliable instead of "remember to add `.Where(TenantId==)`
in every controller."

1. **Global query filters** in `OnModelCreating` for every `ITenantScoped` entity:
   `modelBuilder.Entity<T>().HasQueryFilter(e => e.TenantId == _tenant.CurrentTenantId)`.
   The context takes `ITenantContext` via constructor injection.
2. **Auto-stamp on insert.** Override `SaveChanges/SaveChangesAsync` to set
   `TenantId = _tenant.CurrentTenantId` on all `Added` `ITenantScoped` entries. This
   removes the burden from every controller (e.g., `OrdersController.Create` no longer
   needs to know about tenants).
3. **Super Admin bypass.** When `IsSuperAdmin`, either disable the filter
   (`IgnoreQueryFilters()`) for explicit cross-tenant admin queries, or scope to a
   selected "acting tenant" for impersonation.
4. **Seeding.** `SeedData.Apply` currently seeds one global catalog — change to seed a
   demo tenant (and seed new catalog per tenant on signup, or leave new tenants empty +
   guided onboarding).

## 7. Subscription & plans (per tenant)

- `Subscription` becomes per-tenant. Plan limits (`SubscriptionDto.PlanLimits`,
  branches/staff caps enforced in `BranchesController`/`StaffController`) now count
  **within a tenant**.
- Billing hooks (Stripe/Razorpay) are per-tenant — out of scope for phase 1; keep the
  existing mock/Trial behaviour, just tenant-scoped.

## 8. Frontend (React Native) changes

Good news: **the tenant travels inside the JWT**, so `core/network/api.ts` (which
already attaches `Authorization: Bearer` and refreshes tokens) needs **no per-request
tenant wiring**.

Required work:
1. **Signup flow**: a "Create your cafe" screen → `POST /auth/register-cafe`. Maps onto
   the existing onboarding wizard (`features/onboarding/...`).
2. **Cache hygiene**: on login/logout/tenant-switch, **clear React Query cache and
   redux-persist** so tenant A's data can never bleed into tenant B (persisted MMKV
   store + React Query keys). Add tenant id to top-level query keys as defence in depth.
3. **Branding per tenant**: `CafeSettings` is already per-tenant after §4 — the theme /
   business name / logo (`brandingSlice`, `warmTheme`) load per tenant automatically.
4. **Super Admin app UX**: the existing `superadmin/TenantManagementScreen` becomes
   real (list/suspend/impersonate tenants) against real endpoints.
5. **`getApiBaseUrl()`** unchanged (single API host). If we later do subdomains
   (`acme.cafepos.app`), revisit.

## 9. Interaction with other features

- **QR web ordering (paused feature):** the public order URL must include the tenant,
  e.g. `/{tenantSlug}/order/{tableCode}`, and the public endpoints must resolve tenant
  from the slug (not a token, since customers are anonymous). Design the QR feature
  tenant-aware from the start to avoid rework.
- **Guest phone / CRM:** `Customer` upsert-by-phone must be scoped **within a tenant**
  (same phone can exist in two different cafes).

## 10. Migration strategy (Postgres)

1. Add `Tenant` table + nullable `TenantId` columns everywhere (`ef migrations add
   AddTenancy`).
2. Backfill: create a "Default Cafe" tenant, set all existing rows' `TenantId` to it.
3. Second migration: make `TenantId` **non-null** + add indexes on `(TenantId, ...)` for
   hot queries (orders, menu, tables).
4. In-memory dev DB: `EnsureCreated` + seed one demo tenant — no migration needed.

## 11. Security checklist

- Tenant id **only** from the validated JWT (or signed QR slug for public flows) —
  never from client input.
- Global query filters on 100% of tenant entities (add a startup assertion/test that
  every `ITenantScoped` type has a filter registered).
- Cross-tenant isolation tests (see §12).
- Rate limiting: current global limiter is per-IP; consider per-tenant limits.
- Audit entries are tenant-scoped; Super Admin actions logged at platform level.

## 12. Testing

- Integration test: tenant A cannot read/modify tenant B's orders/menu/customers
  (expect empty/404, never another tenant's row).
- Auto-stamp test: creating any entity as tenant A always lands with A's `TenantId`.
- Super Admin cross-tenant read works; a normal owner's cross-tenant read fails.

## 13. Phased rollout

| Phase | Scope | Outcome |
|---|---|---|
| **0. Plumbing** | `Tenant` entity, `ITenantScoped`, `ITenantContext`, `tenantId` JWT claim, nullable `TenantId` columns + backfill migration | Infra in place, behaviour unchanged (single default tenant) |
| **1. Isolation** | Global query filters + `SaveChanges` auto-stamp + `register-cafe` signup + per-tenant `CafeSettings`/`Subscription` | Real isolation; new cafes can sign up |
| **2. Platform admin** | Super Admin real endpoints (list/suspend/impersonate), plan limits per tenant | Operable SaaS |
| **3. Frontend UX** | Signup screen, cache-wipe on tenant change, per-tenant branding, Super Admin screens | Usable end-to-end |
| **4. Hardening** | `TenantId` non-null migration, indexes, isolation tests, per-tenant rate limits | Production-ready |

## 14. Effort & risk

- **Effort:** large — every controller/query, the auth layer, migrations, and several
  screens. Phases 0–1 are the bulk of the risk; 2–4 are incremental.
- **Biggest risk:** a missed query filter = cross-tenant data leak. Mitigate with the
  `SaveChanges` auto-stamp, a startup assertion that all tenant entities have filters,
  and isolation tests (§12).
- **Rollback-friendly:** Phase 0 ships behind a single default tenant with no behaviour
  change, so it can land safely before isolation is switched on.

## 15. Open decisions (confirm before building)

1. Tenant addressing: single host + JWT only (simplest) vs subdomains
   (`acme.cafepos.app`) vs path (`/t/acme`).
2. New tenant catalog: start empty + onboarding, or clone a starter menu?
3. Relationship to **Branches**: is a branch a sub-unit *within* a tenant (recommended)
   — i.e. Tenant → many Branches → data optionally branch-scoped too?
4. Billing provider + when to enforce paid plans vs Trial.

---

## 16. Plan tiers & feature gating (Normal / Plus / Premium)

### 16.1 Tiers
| Tier | Launch | Purpose |
|---|---|---|
| **Normal** | Now | Core POS: take orders, tables, KDS, receipts |
| **Plus** | Now | Growth: CRM, analytics, AI, staff/inventory |
| **Premium** | **Later** (with integrations) | Everything in Plus **+ Integrations Hub** and enterprise add-ons |

Premium ships in a later phase together with the third-party **integration features**,
so it stays defined-but-locked until then.

### 16.2 The flag & how it "links" to staff (already the right model)
The plan is **not** a per-user setting. It lives once at the **business/tenant level**
(the tenant's `Subscription.Plan`). Every user under that tenant — Owner, Manager,
Waiter — **inherits** it automatically. That is exactly the behaviour you described:
> a flag set on the admin's id, which the manager and waiter are linked to, so they see
> the screens the plan includes.

This already works in code today: [`RequirePlan`](../src/shared/components/guards/RequirePlan.tsx)
reads the plan from `useSubscription()` (business-level), not from the logged-in user —
so all roles inherit it. The user's **role** only changes the *upgrade affordance*
(Owner sees "Upgrade Plan"; Manager/Waiter see "Contact your Store Owner").

So **screen visibility = plan (from tenant) × role (from user)**:
- **Plan** decides *which features exist* for the whole cafe.
- **Role** decides *which of those the person may use* (mirrors
  `src/core/auth/permissions.ts` / backend `Policies`).

### 16.3 Naming migration (current → target)
Today's tiers are `FREE_TRIAL / STARTER / PROFESSIONAL / ENTERPRISE`
(`saasSlice.ts`, `subscriptionApi.ts`, `RequirePlan.planHierarchy`, backend
`Subscription`/`SubscriptionDto.PlanLimits`). Consolidate to:

```
NORMAL (0)  ->  PLUS (1)  ->  PREMIUM (2)
```
- Update the tier enum in **both** frontend (`SubscriptionTier`, `planHierarchy`) and
  backend (`Subscription` plan enum + `PlanLimits`), plus any `RequirePlan requiredPlan`
  usages, and the Subscription screen copy.
- Keep the numeric hierarchy so `RequirePlan` keeps working (`userLevel >= requiredLevel`).
- Map existing data in a migration: FREE_TRIAL/STARTER → NORMAL, PROFESSIONAL → PLUS,
  ENTERPRISE → PREMIUM (confirm mapping).

### 16.4 Proposed feature → plan matrix (confirm before building)
| Area / screen | Normal | Plus | Premium |
|---|---|---|---|
| POS ordering, Tables, KDS, Receipts | ✅ | ✅ | ✅ |
| Menu management, basic Orders list | ✅ | ✅ | ✅ |
| Guest details (name/phone), basic CRM capture | ✅ | ✅ | ✅ |
| Dashboard & Analytics | — | ✅ | ✅ |
| CRM suite (loyalty, coupons, gift cards, campaigns) | — | ✅ | ✅ |
| AI Assistant / AI Chat / forecasts | — | ✅ | ✅ |
| Staff / Team Portal, Inventory, Approvals, Tasks | — | ✅ | ✅ |
| Multi-branch | — | ✅ | ✅ |
| **Integrations Hub** (payments/accounting/delivery, API) | — | — | ✅ (later) |
| White-label / advanced enterprise | — | — | ✅ (later) |

### 16.5 Enforcement (when built)
- **Frontend:** wrap gated screens/tabs with `RequirePlan` and hide their nav entries
  in `AppNavigator` / `MoreScreen` when below the required tier. Gate is cosmetic only —
  the server is the source of truth.
- **Backend:** enforce plan on the relevant endpoints (a `RequirePlan` policy/attribute
  analogous to the existing role `Policies`), so a locked feature can't be reached by
  calling the API directly. Plan is read from the tenant's `Subscription`.
- **Premium/integrations:** keep behind the same gate; simply flip Integrations from
  Premium-locked to available when that phase launches.

### 16.6 Effort note
This tier work is **smaller and largely independent** of the multi-tenant isolation
refactor — the gating model already exists via `RequirePlan`. It could be delivered on
its own (rename tiers + define matrix + wrap screens + backend policy) **before** the
full multi-tenant work, if desired. The only hard dependency is that "plan per tenant"
becomes fully correct once `Subscription` is tenant-scoped (§7).
