---
phase: "33"
slug: "login-screen-store-branding"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-11"
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `33-RESEARCH.md` § Validation Architecture and the three finished plans
> (`33-01-PLAN.md`, `33-02-PLAN.md`, `33-03-PLAN.md`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4 (unit) + Playwright v1.59 (functional E2E and visual regression) |
| **Config file** | `vitest.config.ts` (`--project unit`); `playwright.config.ts` (functional, `workers: 1`); `playwright.visual.config.ts` (visual, `fullyParallel: true`) |
| **Quick run command** | `npx vitest run src/entities/settings/model/store-logo-file.test.ts` (unit) · `npx playwright test e2e/settings/store-branding.spec.ts` (functional) |
| **Full suite command** | `npm run test` + `npm run test:e2e` + `npm run test:e2e:visual` |
| **Estimated runtime** | unit single-file ~5s · `npm run test` ~90s · single E2E spec ~40-90s · `npm run test:e2e:visual` ~60-120s |

All commands run from `supermarket-pos/`. No framework install is required — every runner,
helper (`e2e/helpers/auth.ts`, `e2e/helpers/supabase.ts`, `e2e/helpers/rls-clients.ts`,
`e2e/helpers/requireEnv.ts`) and config file this phase needs already exists.

---

## Sampling Rate

- **After every task commit:** the task's own `<automated>` command (see the map below) — the
  unit/static tier (`npm run typecheck`, `npm run lint`, `npx vitest run <file>`) for code tasks,
  the single-spec Playwright command for E2E tasks.
- **After every plan wave:** `npm run test` + `npx playwright test e2e/settings/` — wave 3 also
  runs `npm run test:e2e:visual`.
- **Before `/gsd-verify-work`:** `npm run test`, `npm run test:e2e` and `npm run test:e2e:visual`
  all green.
- **Max feedback latency:** 15s on the unit/static tier; 40-180s on the E2E/visual tier. The E2E
  tier is deliberately above the 30s guideline — see the note under Validation Sign-Off.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | STORE-01, STORE-02 | T-33-02 | The JSONB key rewrite is idempotent, and `storeName`/`storeLogoPath` both carry Zod defaults so a row that missed the migration still parses instead of silently reverting address/timezone/currency | unit + static | `npm run test` · `npm run typecheck` · `npm run lint` | ✅ | ⬜ pending |
| 33-01-02 | 01 | 1 | STORE-01 | T-33-01 | The new anon grant is pinned to `key = 'general'` — an anon client reads exactly 1 row for `general` and 0 rows for `billing` | integration (DB) | `npx supabase migration list --local` | ✅ (CLI) | ⬜ pending |
| 33-01-03 | 01 | 1 | STORE-02, STORE-03 | T-33-01 | The unauthenticated login read is proven to depend on the policy, not to coincide with it — a policy-drop mutation probe must turn the configured case red and then restore the policy | e2e | `npx playwright test e2e/settings/store-branding.spec.ts` | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 2 | STORE-01 | T-33-06 | Bucket-visibility disposition (public-read accept vs. private-bucket mitigate) is chosen explicitly, not defaulted into | — | exempt — `checkpoint:decision`, produces no artifact to sample | — | ⬜ pending |
| 33-02-02 | 02 | 2 | STORE-01 | T-33-05 | Every write policy on the bucket carries the `role_permissions` EXISTS join on `manage_settings`; no `storage.objects` SELECT policy is added under option A, keeping `.list()` enumeration denied | integration (DB) | `npx supabase migration list --local` · `grep -c "manage_settings" supabase/migrations/20260911000002_store_branding_storage.sql` | ✅ | ⬜ pending |
| 33-02-03 | 02 | 2 | STORE-01 | T-33-04, T-33-07, T-33-10 | Object keys are built from `crypto.randomUUID()` only (no uploaded file name), the MIME/size allow-list holds at its boundaries, and the settings write is read-merge-write so no sibling field is erased | unit | `npx vitest run src/entities/settings/model/store-logo-file.test.ts` | ❌ W0 | ⬜ pending |
| 33-03-01 | 03 | 3 | STORE-01 | T-33-07 | The logo control sits inside the existing admin-only `manage_settings` gate and introduces no second gate and no new permission; the receipt-only logo field is untouched | static + e2e (behaviour asserted by 33-03-03) | `npm run typecheck` · `npm run lint` · the `node` i18n key-parity check in the plan | ✅ | ⬜ pending |
| 33-03-02 | 03 | 3 | STORE-02 | T-33-11 | A broken or deleted logo object degrades to a centred `ImageOff` inside the hero frame; the store name and the PIN form still render, so a bad object never blocks sign-in | static + visual | `npm run typecheck` · `npm run lint` · `git diff --name-only -- src/widgets/LogoImage/index.tsx` | ✅ | ⬜ pending |
| 33-03-03 | 03 | 3 | STORE-03 | T-33-05, T-33-08, T-33-09 | Cashier and anonymous `upload`/`update`/`remove` on the bucket are denied by Postgres (each denial paired with a service-client ground-truth read), and the widened anon settings grant is proven not to extend to `billing`/`near_expiry` | e2e + visual | `npx playwright test e2e/settings/store-branding.spec.ts e2e/settings/store-branding-rls.spec.ts` · `npm run test:e2e:visual` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan: every missing test artifact is created by the task that first needs it,
and each is named `❌ W0` in the map above.

- [ ] `e2e/settings/store-branding.spec.ts` — created by 33-01-03 (configured name, unconfigured
      fallback, unicode name, sibling-field preservation), extended by 33-03-03 (upload flow,
      HEIC rejection, remove, text-save-preserves-logo)
- [ ] `src/entities/settings/model/store-logo-file.test.ts` — created by 33-02-03, boundary cases
      for `validateStoreLogoFile` / `targetLogoDimensions` / `storeLogoObjectPath` /
      `storeLogoPublicUrl`
- [ ] `e2e/settings/store-branding-rls.spec.ts` — created by 33-03-03, mirrors
      `e2e/products/product-photo-rls.spec.ts` for the `store-branding` bucket and the widened
      `settings` anon read
- [ ] `e2e/visual/login-branding-baseline.spec.ts` — created by 33-03-03, configured and
      unconfigured aside baselines plus the hero-size `boundingBox()` measurement
- [x] Framework install — not needed; Vitest, Playwright, both Playwright configs and all four
      `e2e/helpers/` modules already exist

---

## Manual-Only Verifications

**All phase behaviors have automated verification.**

This repo bans manual verification outright (`CLAUDE.md` § "Testing & Verification Policy —
NON-NEGOTIABLE", `.planning/decisions/2026-08-07-mandatory-automated-testing-no-manual-verification.md`):
no `<human-check>`, no `checkpoint:human-verify`, no manual-UAT scenario, and `human_needed` is
never a valid terminal state. Phase 33 touches none of the documented carve-outs (native Tauri
window chrome, USB-HID keypad, Supabase `devtools` UI), so there is nothing to list here. Visual
judgement that would otherwise be human — "the logo is hero-size and dominant" (D-04) — is
expressed as a `boundingBox()` assertion plus a named visual baseline in
`e2e/visual/login-branding-baseline.spec.ts`.

The one non-automated task in this phase, `33-02-01`, is a `checkpoint:decision` — a choice the
executor needs from the user before writing code, not post-hoc verification of finished work — and
is explicitly outside the scope of that ban.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — the sole exception is
      `33-02-01`, a `checkpoint:decision`, which the Nyquist rule exempts
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every code-producing
      task in all three plans carries at least one `<automated>`/`<fails_when>` pair
- [x] Wave 0 covers all MISSING references — the four artifacts listed above, each created by the
      task that first needs it
- [x] No watch-mode flags — `npm run test` is `vitest run`, and no Playwright command uses `--ui`
- [x] Feedback latency: unit/static tier < 15s; E2E/visual tier 40-180s by policy (see note)
- [x] `nyquist_compliant: true` set in frontmatter

**Note on E2E latency:** four `<automated>` commands in this phase exceed the 30s latency
guideline (`npm run test`, the two single-spec Playwright commands, `npm run test:e2e:visual`).
This is mandated, not accidental: this repo's testing policy requires every verification to be an
automated Playwright assertion, and these commands are already scoped to single spec files rather
than full-suite runs. Do not shorten them by weakening coverage.

**Approval:** approved 2026-09-11
