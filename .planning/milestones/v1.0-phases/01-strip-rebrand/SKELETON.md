# Walking Skeleton — Supermarket POS

**Phase:** 1
**Generated:** 2026-08-10

## Capability Proven End-to-End

This phase is NOT a from-scratch scaffold — it is a pivot of a mature, working Tauri 2 + React 19 + Supabase codebase (bar/pool-parlour POS) into a supermarket POS. The "walking skeleton" here is the **retained shell** that survives the strip: the smallest capability proven end-to-end is "a new, separate Supabase project receives the full 144-migration schema history, the app connects to it instead of the live production bar project, and PIN login + role-based navigation + caja session tracking still work" — proven by Plan 01-01's tracer task before any bar/pool code is removed.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Tauri 2 + React 19 + TypeScript (unchanged) | Pivot-in-place per PROJECT.md — no fork, no rewrite |
| Data layer | Supabase (PostgreSQL + Auth + Realtime + RLS), **new separate project** | D-05/D-06: the linked project (`shsrhxleopmovzpzqmex`) is live production data for an operating bar and must never receive a DROP migration. A new project is provisioned, the full migration history replayed, and only then do new DROP migrations run — against the new project exclusively. |
| Auth | PIN-based login, unchanged; `bartender` role renamed to `cashier` | D-16 — role rename is atomic across DB constraint + TS schema + RLS + i18n, no partial rename |
| Architecture | Feature-Sliced Design (`app → pages → widgets → features → entities → shared`), unchanged | Existing enforced convention (`eslint-plugin-boundaries`); strip follows this direction (pages → widgets → features → entities → SQL) |
| Deployment target | Same as before — Tauri desktop build, dev via `npm run dev` (port 1420) | Unaffected by this phase |
| Directory layout | Unchanged — `src/{app,pages,widgets,features,entities,shared}/` | This phase only removes directories, never restructures the layout itself |

## Stack Touched in Phase 1

- [x] New Supabase project scaffold (provision + link + push baseline migration history — Plan 01-01)
- [x] Routing — all bar/pool routes removed, catch-all `<Route path="*">` added, retained routes (`/login`, `/home`, `/inventory`, `/staff`, `/reports`, `/settings`, `/payments`, `/rbac`, `/audit`, `/edit-history`) proven reachable (Plan 01-04)
- [x] Database — full 144-migration baseline replayed (real read+write) on the new project; new DROP migrations for 8 bar/pool feature groups pushed (Plans 01-01, 01-05..01-12)
- [x] UI — PIN login → role-gated HomeDashboard tile grid, proven interactive against the new project (Plan 01-01 smoke test, Plan 01-13 full-suite verification)
- [x] Deployment — dev-server run against the new project's `.env` values (documented local full-stack run command: `npm run dev`)

## Out of Scope (Deferred to Later Slices)

- Visual/logo rebrand (D-02 — strings-only this phase; a future milestone can pick up visual branding)
- Removing `PaymentMethodSchema`'s `'rappi'` enum value, `PaymentForm.tsx`'s `isRappiTab` branches, and `CajaReportPanel`'s "Rappi Sales" row — this logic lives inside the core, retained `process-payment` path that Phase 2 rebuilds on top of. Once Plan 01-05 removes the Rappi order-creation flow, `tab.rappiOrderId` can never be set again, so `isRappiTab` is permanently `false` and the Rappi payment button/row is unreachable dead code — functionally equivalent to removal without touching a high-risk retained payment surface mid-strip. Revisit in Phase 2 if desired.
- `ModifierGroup`/`manage-modifier-groups` (product-options UI) — not named by any locked decision, left in place per RESEARCH.md's Open Question 2 recommendation; dead weight, not a broken dependency, if grocery never uses it.
- `edit-history` route/tile and `edit-paid-tab`/`reopen-tab` features — kept (RESEARCH.md Assumption A1); D-08's "keep tabs schema" intent covers their audit trail.
- Core checkout rebuild (scan/cart/pay), supplier/receiving/expiry tracking, trimmed reports set — all of Phases 2-4.

## Subsequent Slice Plan

- Phase 2: Core Direct-Sale Checkout — scan/search → cart → pay (cash/card/split) → receipt, replacing the now-removed `/pos` tab-based page, built on the retained `tabs`/`order_items`/`process_payment` infra this phase preserved.
- Phase 3: Supplier, Receiving & Expiry Tracking — new supplier/receiving domain, parallelizable with Phase 2 since both depend only on this phase's clean shell.
- Phase 4: Reports & Hardening — trimmed reports set (bar/pool report tabs already removed in this phase) + full-day survivability hardening.
