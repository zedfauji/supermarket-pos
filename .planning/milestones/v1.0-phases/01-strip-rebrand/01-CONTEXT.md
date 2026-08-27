# Phase 1: Strip & Rebrand - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all bar/pool-parlour domain code (tabs UI, pool tables/timers, KDS, kitchen prep, waitlist, Rappi delivery, combos/recipes/ingredient costing, promotions engine, modifier-inventory rules) down to the reusable generic retail shell (auth, RBAC, caja, payments, barcode scanning, printing, AI vision, base inventory), and rebrand the app identity from "bar-pos"/"Bar POS" to "Supermarket POS". Delivers no new v1 requirement itself — prerequisite groundwork for Phases 2-4 (per ROADMAP.md).

</domain>

<decisions>
## Implementation Decisions

### Rebrand identity
- **D-01:** New app name is "Supermarket POS" (matches PROJECT.md's project title).
- **D-02:** Rebrand is strings-only in Phase 1 — no visual redesign. Keep existing dark-mode Tailwind theme, icon, and colors as-is.
- **D-03:** Rename applies to all user-visible + config strings: `package.json` "name", `tauri.conf.json` window title, `README.md`, any in-app footer/about text.
- **D-04:** The AI chat feature (`agent-chat`) persona/naming is left as-is — not bar-specific, not worth touching.

### Supabase project separation (CRITICAL — surfaced by user, not initially identified by Claude)
- **D-05:** The Supabase project currently linked (config.toml `project_id = "shsrhxleopmovzpzqmex"`) is **live production data for an actual operating bar**. It must NOT receive destructive migrations. — **Reversibility:** one-way — running a DROP migration against the live bar's database would destroy that business's real operational data; there is no undo.
- **D-06 (REVISED 2026-08-10, mid-Phase-1 — see 01-01-PLAN.md checkpoint):** Original decision assumed a new Supabase **Cloud** project. User lost their Supabase Cloud subscription during Phase 1 execution. Superseded by: Phase 1 provisions a **self-hosted Supabase stack (the open-source Docker Compose bundle — Postgres + GoTrue Auth + PostgREST + Realtime + Storage)** running on one always-on local machine on the store's LAN (a back-office PC or a dedicated mini-PC/NUC), with all POS terminals connecting to it as thin clients over LAN — never as separate per-terminal databases. This satisfies "locally installed PostgreSQL is non-negotiable" while preserving the existing Supabase-client-based codebase, all 144 migrations, RLS policies, RPC functions, and Realtime subscriptions essentially unchanged (only the API URL/keys change from a cloud ref to a local/LAN URL + self-generated anon/service keys). Apply the full existing migration history to the fresh local instance to establish baseline schema, then apply the bar/pool DROP migrations (D-08/D-09/D-10) on top of it only. Local `.env`/Supabase config must point at the local stack's URL before any other Phase 1 SQL work runs. New ops responsibilities this decision adds (out of scope for Phase 1 code, but must be tracked): Docker Compose autostart-on-boot reliability (Windows service / systemd wrapper), and a nightly `pg_dump` backup routine (no more managed cloud backup) — see multi-agent research synthesis in session history for full comparison against bundled-Postgres and sync-framework alternatives (all rejected: either SQLite-based, alpha/single-connection, or multi-week rewrite cost). Actual Docker stack provisioning is an execution-time action performed by the user (infra/credentials only they can create), not something performed during planning.

### /pos route gap (bar tab-based checkout → grocery direct-sale checkout)
- **D-07:** Remove the `/pos` route and its nav link entirely in Phase 1, along with the tab-based checkout page. No stub/placeholder — nothing links to `/pos` until Phase 2 adds the new direct-sale checkout route.
- **D-08:** Keep the `tabs`/`order_items` schema and RPCs (including `process_payment`'s atomic-RPC discipline) — do not drop this schema. Phase 2 adapts/renames it for direct-sale checkout rather than rebuilding from scratch. Phase 1 removes only pool-specific linkage (`pool_session_id`/table linkage) and bar-tab-transfer/split-by-seat semantics.
- **D-09:** Strip `transfer-tab` feature entirely (pure pool-table concept, no meaning without tables). Strip split-**tab** (splitting a shared bar tab by seat/item — no grocery equivalent). Keep split-**payment** (multi-tender cash+card in one sale — directly relevant to grocery checkout, maps toward CHK-03). Keep `process-refund` (a store still needs returns, even though not a numbered v1 requirement).
- **D-10:** Add explicit Playwright E2E assertions that removed routes (`/pos`, `/pool-tables`, `/kds`, `/kds-bar`, `/kitchen-prep`, `/waitlist`, `/rappi`) 404 or redirect — directly proves ROADMAP.md Success Criterion 1 for this phase.

### E2E spec handling
- **D-11:** Delete (not archive) the ~20 E2E spec files testing removed features: `04-pool-timer`, `21-carom-billing`, `24-pool-advanced`, `28-kds`, `40-kds-bar`, `25-rappi-orders`, `32-combos`, `33-ingredients`, `36-recipes`, `43-promotions`, `24-waitlist`, `24-modifier-inventory-rules`, `21-prep`, and similar. Git history preserves them if ever needed.
- **D-12:** For mixed/ambiguous specs, apply a simple rule: delete anything whose test flow drives the UI through tab-based checkout (e.g. `03-tab-order`, `06-transfer`). Phase 2 writes fresh specs against the new direct-sale checkout flow rather than retrofitting these.
- **D-13:** Infra/build specs not tied to the bar/pool domain (`18-updater`, `13-tauri-build`, `12-infrastructure`, `11-offline`, `01-ci`) are left untouched.

### Home dashboard nav
- **D-14:** HomePage keeps tiles only for retained routes (`/inventory`, `/staff`, `/reports`, `/settings`, `/payments`, `/rbac`, `/audit`) — no placeholder tiles added for future Phase 2/3 features. A sparse dashboard is expected and acceptable for this prerequisite phase.
- **D-15:** No explicit dashboard grid redesign — let the layout re-flow naturally with fewer tiles (standard responsive grid/flex behavior).

### RBAC role rename (bartender → cashier)
- **D-16:** Rename `bartender` role to `cashier` everywhere, fully — DB role enum/check constraint, TypeScript RBAC types/constants, i18n role labels across namespaces, E2E auth helper (`loginAs(page, 'cashier')` etc. in `e2e/helpers/auth.ts`), and seed/dev-user scripts. No partial rename (UI-only) — that would leave a permanent code/DB naming mismatch. — **Reversibility:** costly — touches a DB enum plus every RBAC call site; a later re-rename would need another full sweep.
- **D-17:** Do NOT rename tab-named RBAC action strings (`close_tab`, `delete_tab`) in Phase 1 — consistent with keeping the tabs schema as internal plumbing (D-08); premature until Phase 2 actually renames the underlying schema. Exception: delete the `transfer_tab` action entirely since that feature is stripped (D-09).

### SQL migration strategy
- **D-18:** Remove bar/pool SQL objects via new forward DROP migrations (not squashed/rewritten history) — applied against the NEW Supabase project (D-06) only, never the live bar's project.
- **D-19:** DROP migrations include DOWN scripts, matching the Phase 8+ convention, since these are newly authored migrations.
- **D-20:** Split DROP migrations per feature (pool/resources, KDS, waitlist, rappi, combos/recipes, promotions) rather than one combined migration — matches the dependency-order strip approach already noted in STATE.md, and makes it easier to bisect which removal caused an E2E regression.

### Settings/i18n cleanup
- **D-21:** Remove bar-specific Settings tabs (Tip Distribution/Tip Split settings + report tabs — bar tip-splitting doesn't apply to grocery cashiers) together with their feature code, not as a separate pass.
- **D-22:** Prune orphaned i18n keys via manual grep per removed feature as each feature is stripped (bounded set of ~7-8 features) — no new tooling needed for this one-time cleanup.

### Claude's Discretion
- Exact migration file naming/ordering within the per-feature split (D-20).
- Which specific in-app strings need a "bar-pos"/"Bar POS" grep pass beyond the files explicitly named in D-03.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — pivot rationale, validated/active/out-of-scope requirements, key decisions
- `.planning/REQUIREMENTS.md` — v1/v2 requirement definitions and phase traceability
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, mode, dependencies
- `.planning/STATE.md` — session history, accumulated context, blockers/concerns (SQL strip risk, checkout risk)
- `.planning/specs/2026-08-10-supermarket-pos-pivot-design.md` — pivot strategy notes

### Codebase maps (generated 2026-08-10, current-state ground truth)
- `.planning/codebase/CONCERNS.md` — fragile areas, tech debt, `pool_tables → resources` rename fragility precedent (directly informs D-20's per-feature split caution)
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`, `.planning/codebase/INTEGRATIONS.md`

### Project config
- `CLAUDE.md` — FSD import boundaries, i18n namespace scheme, RBAC action list, E2E suite list, testing policy (automated Playwright only, no manual UAT)
- `supabase/config.toml` — current project_id link (`shsrhxleopmovzpzqmex`) — **must be repointed to the new project per D-06 before SQL work**

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/entities/tab/`, `process_payment` RPC family — kept per D-08, generic order+payment infra reusable for Phase 2's direct-sale checkout.
- `src/shared/lib/rbac.ts` — RBAC action/role definitions; role enum needs the `bartender → cashier` rename (D-16).
- `e2e/helpers/auth.ts` — `loginAs(page, role)` helper; needs role-string update for D-16.
- i18n namespace scheme (`src/shared/lib/i18n/locales/{es-MX,en-US}/`) — 10 namespaces; removed-feature keys live in `featOrders`, `wPanels`, `wAdmin`, `entities` primarily (per D-22).

### Established Patterns
- FSD layering (`app → pages → widgets → features → entities → shared`) — strip must respect this direction; SQL/entity removal should follow pages→features→entities→SQL order per STATE.md's documented precedent.
- Migration convention: DOWN scripts standard since Phase 8 (52/76 pre-Phase-8 migrations lack them) — D-19 follows this convention for new DROP migrations.

### Integration Points
- `src/app/router.tsx` — route list to prune (`/pos`, `/pool-tables`, `/kds`, `/kds-bar`, `/kitchen-prep`, `/waitlist`, `/rappi`, `/pool-tables/:tableId`).
- HomePage nav tile list — prune to match retained routes (D-14).
- `supabase/migrations/` — grep target for hidden SQL-side dependencies (RLS, RPCs, triggers, Realtime publications) per STATE.md's documented `pool_tables → resources` fragility precedent.

</code_context>

<specifics>
## Specific Ideas

- Owner explicitly flagged the live-production-DB risk before any migration strategy could be finalized — this was the single most consequential correction in this discussion and drove D-05/D-06.
- No specific UI/visual mockup references given — visual rebrand explicitly deferred (D-02).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope. (Visual/logo rebrand was considered and explicitly deferred, not because it's out of scope for the project, but because D-02 scoped Phase 1 to strings-only; a future phase or milestone can pick up visual branding if desired.)

### Reviewed Todos (not folded)
None — `.planning/STATE.md` "Pending Todos" was empty at discussion time.

</deferred>

---

*Phase: 1-Strip & Rebrand*
*Context gathered: 2026-08-10*
