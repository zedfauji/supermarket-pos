---
phase: 06-security-hardening
verified: 2026-08-18T22:15:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "receipt_settings' singleton invariant is enforced at the schema level (not merely client convention), so no authenticated write path can create a second row that breaks the app's read path"
  gaps_remaining: []
  regressions: []
---

# Phase 6: Security Hardening Verification Report

**Phase Goal:** Users' Anthropic API usage and receipt-settings data are only ever accessed through authenticated, server-side, access-controlled paths — no client-exposed API key, no unauditable table.
**Verified:** 2026-08-18T22:15:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit `d928407`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A production build's output contains zero occurrences of the Anthropic API key, `@anthropic-ai/sdk` reference, or a real Anthropic key literal (ROADMAP SC1) | ✓ VERIFIED | Re-ran `rm -rf dist && npm run build` this session. `grep -rl "@anthropic-ai/sdk" dist/` → 0. `grep -rl "VITE_ANTHROPIC_API_KEY\|ANTHROPIC_API_KEY" dist/` → 0. `grep -rlE "sk-ant-[a-zA-Z0-9_-]{20,}" dist/` → 0. |
| 2 | `brain.ts`/`vision.ts` never construct an Anthropic SDK client; every request flows through `agent-proxy` via `callAgentProxy`, proven by a Vitest test mocking the edge-function boundary (ROADMAP SC2) | ✓ VERIFIED | `grep -n "from '@anthropic-ai/sdk'\|new Anthropic("` on both files → 0 matches (no SDK client construction). Correction to prior report's evidence text: `grep -n "Anthropic"` on `brain.ts` alone actually returns 8 matches (`AnthropicMessageParam`, `AnthropicTextBlock`, `AnthropicToolResultBlockParam`, `AnthropicToolUseBlock`) — these are local type names imported from the phase's own `./anthropic-types` module (verified by reading brain.ts's import block), not SDK references; `vision.ts` has 0 matches. The truth itself (no SDK client construction) still holds; only the prior verifier's grep description was imprecise. Re-ran `npx vitest run src/shared/lib/agent/vision.test.ts src/shared/lib/agent/brain.test.ts src/shared/lib/edge-function-contracts.test.ts` this session → 3 files, 44 passed / 2 todo. |
| 3 | `@anthropic-ai/sdk` is absent from client `package.json` dependencies (ROADMAP SC3) | ✓ VERIFIED | `grep -n "anthropic" package.json` → no output. `npm ls @anthropic-ai/sdk` → `extraneous` (leftover in `node_modules` only, not in the dependency tree). |
| 4 | A request to `agent-proxy` without a valid Bearer JWT is rejected with 401 before any Anthropic API call is attempted | ✓ VERIFIED | Unchanged since prior run; `supabase/functions/agent-proxy/index.ts` not touched by the gap-closure commit. Re-confirmed by read: 401 check (lines ~44-47) precedes body parsing and the Anthropic `fetch`. |
| 5 | Multiple concurrent `agent-proxy` calls do not interfere with each other (stateless, no shared server-side state or DB write) | ✓ VERIFIED | Unchanged; `agent-proxy/index.ts` still performs no DB write and holds no module-level mutable state. |
| 6 | `receipt_settings` exists as a migration-tracked `CREATE TABLE` (not a defensive `IF EXISTS` guard) with `ENABLE ROW LEVEL SECURITY` and exactly 4 active policies on the live self-hosted DB (ROADMAP SC4, part a) | ✓ VERIFIED | Re-ran live-DB `psql` query this session: `select policyname,cmd from pg_policies where tablename='receipt_settings'` → exactly 4 rows (`receipt_settings_select_authenticated`, `receipt_settings_insert_admin`, `receipt_settings_update_admin`, `receipt_settings_delete_manager_admin`). `select relrowsecurity from pg_class where relname='receipt_settings'` → `t`. |
| 7 | The generic `settings` table no longer has a row for `key='receipt'` after the migration runs | ✓ VERIFIED | Re-ran live-DB query: `select count(*) from settings where key='receipt'` → `0`. |
| 8 | `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` read/write `receipt_settings` directly and fall back to `DEFAULT_RECEIPT` when the table is empty (D-06) | ✓ VERIFIED | Unchanged since prior run; not touched by the gap-closure commit. `queries.ts` still calls `supabase.from('receipt_settings').select('*').maybeSingle()` directly and returns `ok(DEFAULT_RECEIPT)` on `data === null`. |
| 9 | Saving receipt settings twice with the same values is idempotent — the fixed-sentinel-id upsert always targets the single existing row | ✓ VERIFIED | Unchanged; `useMutationUpdateReceiptSettings()`'s `mutationFn` still upserts `{id: RECEIPT_SETTINGS_SINGLETON_ID, ...}` with `{onConflict:'id'}`, and this id now also matches the DB column's own default (`00000000-0000-0000-0000-000000000001`), making the invariant doubly enforced (client convention + DB default + DB constraint). |
| 10 | A cashier-role session can `SELECT` the single `receipt_settings` row but any `INSERT`/`UPDATE`/`DELETE` is rejected; a manager/admin session can perform all four (ROADMAP SC4, part b, reinterpreted per D-05) | ✓ VERIFIED | Re-ran `npx vitest run src/entities/settings/model/receipt-settings-rls.integration.test.ts` this session (rewritten test, service-role-driven, against the live self-hosted Supabase stack, not mocked) → **5/5 passed**: cashier SELECT succeeds; cashier INSERT rejected; cashier UPDATE rejected (0 rows mutated); manager second-row INSERT rejected for both a non-sentinel id (RLS `WITH CHECK` on `id`) and the sentinel id (PK uniqueness, since the sentinel row already exists); manager UPDATE+DELETE of the real singleton row both succeed (with service-role restore afterward so the app's live row isn't corrupted by the test). |
| 11 | No code path anywhere in `src/` reads or writes the old `settings` table's `key='receipt'` row anymore | ✓ VERIFIED | Unchanged; `grep -rn "key: 'receipt'" src/` → 0 matches. |
| 12 | `receipt_settings`' singleton invariant is enforced at the schema level (not merely client convention), so no authenticated write path can create a second row that breaks the app's read path | ✓ VERIFIED (gap closed) | Migration `20260819000004_receipt_settings_singleton_enforce.sql` applied to the live DB and registered in `supabase_migrations.schema_migrations` (confirmed: `20260819000004 | receipt_settings_singleton_enforce` is the newest row). Independently re-verified against the live DB this session, not trusting the migration file alone: (1) `select column_default from information_schema.columns where table_name='receipt_settings' and column_name='id'` → `'00000000-0000-0000-0000-000000000001'::uuid`. (2) `select with_check from pg_policies where policyname='receipt_settings_insert_admin'` → `(get_user_role() = ANY (ARRAY['manager'::user_role,'admin'::user_role])) AND (id = '00000000-0000-0000-0000-000000000001'::uuid)`. (3) `select id, count(*) from receipt_settings group by id` → exactly one row, at the sentinel id. The phase's own integration test (item 10 above) directly exercises and proves the exploit path is now closed: a manager/admin's second-row INSERT is rejected both for a non-sentinel id (RLS) and for the sentinel id (PK uniqueness against the existing row). |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/agent-proxy/index.ts` | Bearer-authenticated pass-through proxy to the Anthropic Messages API | ✓ VERIFIED | Unchanged since prior run. |
| `src/shared/lib/agent/anthropic-types.ts` | Minimal local Anthropic type definitions | ✓ VERIFIED | Unchanged; consumed by `brain.ts`'s type-only imports (see Truth #2). |
| `src/shared/lib/agent/vision.test.ts` | Vitest coverage for both extraction functions mocking the edge-function boundary | ✓ VERIFIED | Unchanged, re-ran and passing. |
| `supabase/migrations/20260819000001_receipt_settings.sql` | `CREATE TABLE receipt_settings` + RLS policies + old-row cleanup | ✓ VERIFIED | Unchanged base migration. |
| `supabase/migrations/20260819000004_receipt_settings_singleton_enforce.sql` | DB-level singleton enforcement (gap closure) | ✓ VERIFIED | New file, applied to live DB, contents match 06-REVIEW.md CR-01's recommended fix exactly (id default pinned to sentinel + INSERT policy `WITH CHECK` requires sentinel id); pre-collapses any non-sentinel rows before applying. |
| `src/entities/settings/model/queries.ts` (`useReceiptSettings`/`useMutationUpdateReceiptSettings`) | New query/mutation pair for `receipt_settings` | ✓ VERIFIED | Present, exported, wired into all 4 consumers (unchanged). |
| `src/entities/settings/model/receipt-settings-rls.integration.test.ts` | Service-role integration test proving role-scoped RLS write isolation, including singleton enforcement | ✓ VERIFIED | Rewritten (git log: `fix(06): enforce receipt_settings singleton at the DB level (gap closure)`, commit `d928407`); 5/5 passing against the live DB this session. Old "manager can INSERT a new row" assertion (which asserted the now-fixed-wrong behavior) replaced with assertions proving rejection. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `vision.ts` (`extractProductsFromText`/`extractProductsFromImage`) | `edge-function-contracts.ts` (`callAgentProxy`) | Direct function call | ✓ WIRED | Unchanged; re-confirmed by passing tests. |
| `brain.ts` (`runAgent`) | `edge-function-contracts.ts` (`callAgentProxy`) | Direct function call | ✓ WIRED | Unchanged; re-confirmed by passing tests. |
| `edge-function-contracts.ts` (`callAgentProxy`) | `supabase/functions/agent-proxy` | Authenticated `fetch()` with Bearer token | ✓ WIRED | Unchanged. |
| `agent-proxy/index.ts` | `https://api.anthropic.com/v1/messages` | `fetch()` with `Deno.env.get('ANTHROPIC_API_KEY')` | ✓ WIRED (deployment pending — see Deferred) | Code path correct; real secret provisioning is still the explicit, user-owned `checkpoint:human-action` (Task 4), not a code gap. |
| `HardwareSettingsTab.tsx` / `useUploadLogo.ts` / `LogoImage/index.tsx` / `CajaDashboard.tsx` | `receipt_settings` table | `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` | ✓ WIRED | Unchanged. |
| Client's `RECEIPT_SETTINGS_SINGLETON_ID` upsert target | DB's `id` column default | Both pinned to `00000000-0000-0000-0000-000000000001` | ✓ WIRED (new) | Confirmed by grep of `queries.ts` (`RECEIPT_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'`) matching the live DB's column default exactly — client convention and DB-level default/constraint are now the same value, closing the gap end-to-end. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SEC-01 unit/contract tests (vision, brain, edge-function-contracts) | `npx vitest run src/shared/lib/agent/vision.test.ts src/shared/lib/agent/brain.test.ts src/shared/lib/edge-function-contracts.test.ts` | 3 files, 44 passed / 2 todo | ✓ PASS |
| SEC-02 RLS role-isolation + singleton-enforcement proof | `npx vitest run src/entities/settings/model/receipt-settings-rls.integration.test.ts` | **5/5 passed** (live self-hosted Supabase, not mocked) | ✓ PASS |
| SEC-01 build-output cleanliness | `rm -rf dist && npm run build` then grep `dist/` for SDK ref / key env names / key literal pattern | 0/0/0 matches | ✓ PASS |
| SEC-02 live DB singleton enforcement | `docker exec supabase-db psql` — column default, INSERT policy `WITH CHECK`, row count/id | default = sentinel UUID; `WITH CHECK` includes `id = sentinel`; exactly 1 row at the sentinel id | ✓ PASS |
| SEC-02 live DB policy/row state | `docker exec supabase-db psql` — policy count, RLS flag, old-`settings`-row count | 4 policies, RLS enabled, old row count 0 | ✓ PASS |
| Typecheck / lint clean | `npm run typecheck && npm run lint` | Both exit 0 (lint's only output is an informational `eslint-plugin-boundaries` legacy-selector-syntax notice, not an error) | ✓ PASS |
| Debt-marker sweep on new/changed files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on the new migration + rewritten test | 0 matches | ✓ PASS |
| Migration registered on live DB | `select version, name from supabase_migrations.schema_migrations order by version desc limit 1` | `20260819000004 | receipt_settings_singleton_enforce` | ✓ PASS |

Full workspace test suite and prior-run's build/lint/typecheck were already confirmed clean; this run additionally re-ran `npm run typecheck` and `npm run lint` directly (not merely trusting the launching context's claim) and both passed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-01 | 06-01-PLAN.md | Anthropic API call moves server-side into one shared Bearer-authenticated edge function; `@anthropic-ai/sdk` removed from client deps; build-output grep clean | ✓ SATISFIED (code-level) | Truths #1-5, all artifacts above. Task 4 (real `ANTHROPIC_API_KEY` secret + deploy) remains an explicit, user-owned `checkpoint:human-action`, deliberately deferred to just before shipping — not a code gap. |
| SEC-02 | 06-02-PLAN.md, 06-03-PLAN.md | `receipt_settings` has an explicit migration-tracked `CREATE TABLE` + RLS with policies matching the role hierarchy, and is auditable and correct | ✓ SATISFIED | Truths #6-12 all verified. The one remaining gap from the prior run (Truth #12, DB-level singleton enforcement) is now closed by migration `20260819000004` and proven by the rewritten integration test. SEC-02 is now fully satisfied, not merely "satisfied with gap." |

No orphaned requirements: REQUIREMENTS.md's traceability table maps only SEC-01 and SEC-02 to Phase 6, and both appear in plan frontmatter `requirements:` fields.

**Documentation note (non-blocking, unchanged from prior run):** REQUIREMENTS.md still shows `[ ]` (unchecked) for SEC-01/SEC-02 and its Traceability table still says "Not started" for both — this is bookkeeping staleness, not a code gap; should be updated now that verification has passed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/agent-proxy/index.ts` | 27-33 | No upper bound on `max_tokens`/message-array size (WR-01 in 06-REVIEW.md) | ℹ️ Info (accepted by design) | Unchanged from prior run — explicitly assessed and accepted in this phase's own threat model (T-06-04), deferred to v1.2 rate-limiting backlog per D-03. Not a gap. |
| `supabase/migrations/20260819000001_receipt_settings.sql` (as amended by `20260819000004`) | — | RLS grants manager+admin write; the only UI entry point (`manage_settings`) is admin-only (WR-02 in 06-REVIEW.md) | ℹ️ Info (locked design decision, D-04) | Unchanged from prior run — deliberate, user-approved decision at discuss-phase (D-04). Not a gap. |
| `supabase/migrations/20260819000001_receipt_settings.sql` | 32 | `logo_data_url TEXT` has no DB-side size cap (WR-03 in 06-REVIEW.md) | ℹ️ Info | Unchanged from prior run — not part of this phase's stated must-haves; flagged for a future hardening pass. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in the new migration or the rewritten integration test.

### Gaps Summary

None. The single blocking gap from the prior verification (`06-VERIFICATION.md`, 2026-08-18T22:04:00Z: `receipt_settings`' singleton invariant had no DB-level enforcement) is closed by commit `d928407`:

- Migration `supabase/migrations/20260819000004_receipt_settings_singleton_enforce.sql` is applied to the live local Supabase DB and registered in `supabase_migrations.schema_migrations` as the newest migration.
- The `id` column's default is pinned to the sentinel UUID `00000000-0000-0000-0000-000000000001` (independently confirmed via live `information_schema.columns` query).
- The INSERT policy's `WITH CHECK` now requires `id = '00000000-0000-0000-0000-000000000001'` in addition to the existing manager/admin role check (independently confirmed via live `pg_policies` query).
- The table currently holds exactly one row, at the sentinel id (independently confirmed via live `receipt_settings` row count/group-by query).
- The rewritten integration test (`receipt-settings-rls.integration.test.ts`) proves, against the live DB (not mocked), that a manager/admin's second-row INSERT is now rejected both for a non-sentinel id (by the RLS `WITH CHECK`) and for the sentinel id (by primary-key uniqueness against the pre-existing row) — directly exercising and closing the exploit path the prior verification and `06-REVIEW.md`'s CR-01 identified. The same test also proves manager UPDATE/DELETE of the real singleton row still work, with a service-role restore step so the test doesn't corrupt the app's live singleton row.

All 12 must-haves (roadmap Success Criteria SC1-SC4 plus PLAN-frontmatter-derived truths) are now verified. SEC-01 and SEC-02 are both fully satisfied at the code/schema level.

**Not a gap:** SEC-01's Task 4 (provisioning the real `ANTHROPIC_API_KEY` secret and deploying/restarting `agent-proxy`) remains an explicit `checkpoint:human-action` the user has stated they will complete themselves immediately before shipping. Every code-level truth SEC-01 requires (no client-exposed key, no SDK reference, correct auth-then-forward flow) is verified independently of that step, per this project's CLAUDE.md testing policy (which bans manual/human UAT as a terminal verification state — this item is a deployment/secrets-provisioning action, not a verification gap).

**Correction to prior report:** Truth #2's evidence in the prior verification stated "`grep -n "Anthropic" src/shared/lib/agent/brain.ts` ... → 0 matches" — this was imprecise. The grep actually returns 8 matches, all local type names (`AnthropicMessageParam`, `AnthropicTextBlock`, `AnthropicToolResultBlockParam`, `AnthropicToolUseBlock`) imported from the phase's own `./anthropic-types` module, not the `@anthropic-ai/sdk` package. There is no `import ... from '@anthropic-ai/sdk'` and no `new Anthropic(...)` client construction anywhere in `brain.ts` or `vision.ts` — the underlying truth (no SDK client construction) holds; only the prior report's grep description was overstated. Not a regression, not a new gap — corrected here for accuracy.

---

_Verified: 2026-08-18T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
