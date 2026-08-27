---
phase: 18-barcode-scan-product-peek-window
verified: 2026-08-26T22:05:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/4
  gaps_closed:
    - "Existing e2e/checkout/ automated coverage continues to pass after Phase 18's changes"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 18: Barcode Scan Product Peek Window Verification Report

**Phase Goal:** Scanning a barcode on `/pos` opens a separate Tauri OS window showing full product detail with a qty/weight input, letting the cashier inspect and choose to add-or-skip before it touches the cart.
**Verified:** 2026-08-26T22:05:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | Scanning a barcode on `/pos` opens a separate Tauri window showing name, size/unit, photo, price, inventory, SKU, barcode | ✓ VERIFIED | Unchanged since initial verification. Independently re-ran `e2e/checkout/peek-window.spec.ts` — PEEK-01 test passes (`context.pages().length === 2`, all fields asserted against live Supabase data). |
| 2 | The window has a qty/weight input matching the product's unit type, and reuses the existing out-of-stock/near-expiry guard components rather than new ones | ✓ VERIFIED | Unchanged. `QuantityControl`/`WeightEntryDialog` reused; `getProductRiskFlag`/`useConfirmRiskyAdd` shared with `ProductGrid`. New this round: a low-stock risky-add-confirm-toast test was added (mirroring the zero-price one) and re-run to pass — closes a coverage gap the SUMMARY flagged as new, independently confirmed by reading the test and re-executing it. |
| 3 | "Add to Cart" adds the entered amount to the active `/pos` cart and closes the window; "Close" dismisses without any cart change | ✓ VERIFIED | Unchanged; re-run confirmed both tests pass. |
| 4 | Scanning a second barcode while the window is open replaces its content with the new product, and the main `/pos` window's own scan-to-search listener still fires on that same scan | ✓ VERIFIED | Unchanged; CR-01/CR-02 regression tests re-run and pass. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Gap Closure Verification (the item that failed the previous round)

**Previous gap:** `e2e/checkout/barcode-scan-search.spec.ts` still asserted the pre-Phase-18 direct-scan-to-cart UX; 9 of 12 tests failed against the actual (intentionally changed) `CheckoutPanel.onScan` behavior.

**Independent re-verification of the fix (not trusting SUMMARY):**

1. **Read the current file directly** (`e2e/checkout/barcode-scan-search.spec.ts`, 141 lines). It now contains exactly 3 tests, all scoped to `Product search (manual, non-scan)`: manual search resolves a product tile (VER-02), a manual zero-price selection gates through the confirm toast, and category-tab + search composition. A doc comment at the top of the file explicitly states the retired scan-triggered coverage now lives in `e2e/checkout/peek-window.spec.ts` (add-to-cart/confirm-gate/weight/not-found/rescan) and in `CheckoutPanel.test.tsx` (unit-level scanner-gating: disabled during payment/weight-entry, restored after).
2. **Confirmed the unit-test claim is true, not asserted**: read `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` — it has `it('populates the search box with the scanned barcode instead of adding to the cart')`, `it('ignores a scanner burst while payment/receipt UI is active (CHK-01)')`, `it('ignores a scanner burst while the weight-entry dialog is open')`, and `it('restores ordinary scanning once payment is cancelled back to the cart screen')`. Re-ran this file directly: `npx vitest run src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` → 1 file, 4 tests, all pass.
3. **Confirmed the dead-hook removal**: `useScanBarcodeToCart.ts` and its test were deleted (commit `1b834fb`). `grep -rn "useScanBarcodeToCart" src/ e2e/` now returns only comment references (in `useCheckoutSale.test.ts`'s doc comment and `useLookupProductByBarcode.ts`'s port-provenance comment) — no live imports, confirming it was genuinely dead code and not a used module that got silently orphaned.
4. **Confirmed the audit-trail restoration**: read `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` — `auditScanFailed()` calls `supabase.rpc('record_audit', { p_action: 'barcode.scan_failed', ... })` on a genuine miss (`!data` branch), ported verbatim in intent from the deleted hook. `record_audit` is a real, migrated RPC (confirmed via grep across `supabase/migrations/*.sql`, used identically elsewhere for `shipment.receive`/`caja.close`).
5. **Ran the actual E2E suite myself** (not the SUMMARY's numbers): `npx playwright test e2e/checkout/peek-window.spec.ts e2e/checkout/barcode-scan-search.spec.ts --reporter=list` against the live local Supabase stack and dev server → **14 tests total, 13 passed, 1 failed** (`category tabs compose with search and show the empty state`, a `locator.focus()` 15s timeout). This is the exact, sole pre-existing failure this project's own `deferred-items.md` already documented as failing on `main` *before* any Phase 18 file was touched (a `.focus()` timing issue unrelated to scanning) — re-confirmed it is not a new regression: the retired-test list in the prior VERIFICATION.md separately named this same test as already broken for reasons unrelated to the scan-UX change, and it remains the same single failure post-fix, not a new one.
6. **New audit-log assertion in `peek-window.spec.ts`'s unmatched-barcode test passed on this run** — confirms `record_audit`'s RPC call actually reaches the DB in the live test environment (`await expect.poll(...)` against `audit_logs` where `action = 'barcode.scan_failed'`), not just that the source code calls it.

**Verdict: gap closed.** No stale assertions remain against the removed direct-scan-to-cart UX; the underlying behavior it used to test is proven end-to-end via `peek-window.spec.ts` plus unit-level scanner-gating coverage in `CheckoutPanel.test.tsx`; the one remaining failure in the file is confirmed pre-existing, unrelated debt, not a Phase 18 regression.

### Required Artifacts

Unchanged from initial verification — no gap-closure work touched `ProductPeekWindow.tsx`, `useProductPeekWindow.ts`, `PeekApp.tsx`, `main.tsx`, or `src-tauri/capabilities/default.json`. Re-confirmed all still exist and are unmodified by `git show --stat` on the gap-closure commits (`eb840c7`, `1b834fb`, `4d39d11`, `fd2aa6b`) — only `e2e/checkout/barcode-scan-search.spec.ts`, `e2e/checkout/peek-window.spec.ts`, `src/entities/product/model/useConfirmRiskyAdd.ts` (comment only), and `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` were touched, plus deletion of `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.{ts,test.ts}`.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `e2e/checkout/barcode-scan-search.spec.ts` | Manual-search-only coverage, no stale scan-triggered assertions | ✓ VERIFIED | Read directly: 3 tests, all manual/non-scan, doc comment explains the split |
| `e2e/checkout/peek-window.spec.ts` | Full PEEK-01..04 + low-stock confirm + audit-log coverage | ✓ VERIFIED | 11 tests, re-run, 10/11 exercised in this run all pass (the 11th, "a second window... session restore", also confirmed passing in the earlier full run) |
| `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` | Restored `barcode.scan_failed` audit call | ✓ VERIFIED | Read source; `record_audit` RPC call present and reached in live E2E run |
| `src/features/scan-barcode-to-cart/` (dead hook) | Deleted, not referenced | ✓ VERIFIED | `grep` confirms zero live imports remain |

### Behavioral Spot-Checks / E2E Execution (independently re-run, not trusted from SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `barcode-scan-search.spec.ts` + `peek-window.spec.ts` combined | `npx playwright test e2e/checkout/peek-window.spec.ts e2e/checkout/barcode-scan-search.spec.ts --reporter=list` | 13 passed, 1 failed (pre-existing `.focus()` timeout, confirmed unrelated) | ✓ PASS (matches expected known-debt baseline) |
| Unit coverage for touched/gap-closure-adjacent modules | `npx vitest run src/widgets/ProductPeekWindow src/features/open-product-peek-window src/features/add-loose-weight-item src/widgets/CheckoutPanel src/features/lookup-product-by-barcode` | 3 files, 14 tests, all pass | ✓ PASS |
| `CheckoutPanel.test.tsx` alone (the file the SUMMARY claims covers retired scanner-gating assertions) | `npx vitest run src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` | 1 file, 4 tests, all pass | ✓ PASS |
| Type safety | `npm run typecheck` | clean, exit 0 | ✓ PASS |
| Lint | `npm run lint` | clean, exit 0 (only the pre-existing non-blocking `eslint-plugin-boundaries` legacy-selector info notice) | ✓ PASS |
| Production build | `npm run build` | clean, exit 0 (only pre-existing bundle-size warnings, no errors) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| PEEK-01 | 18-02, 18-03 | Separate Tauri OS window with full product detail | ✓ SATISFIED | Unchanged from initial verification; re-confirmed via re-run |
| PEEK-02 | 18-01, 18-02, 18-03 | Qty/weight input + reused guards | ✓ SATISFIED | Unchanged; low-stock confirm-toast test added and re-run passing |
| PEEK-03 | 18-01, 18-02, 18-03 | Add to Cart / Close semantics | ✓ SATISFIED | Unchanged; re-confirmed |
| PEEK-04 | 18-01, 18-02, 18-03 | Rescan-replaces-content + main window's independent scan | ✓ SATISFIED | Unchanged; re-confirmed |

REQUIREMENTS.md marks all four `[x]` complete; matches independently-verified behavior. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Gap-closure files (`barcode-scan-search.spec.ts`, `peek-window.spec.ts`, `useLookupProductByBarcode.ts`, `useConfirmRiskyAdd.ts`) | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers | — | ℹ️ Info — clean |
| `src-tauri/capabilities/default.json` | 5-22 | Peek window shares the full main-window capability set rather than a scoped-down `peek.json` (WR-02, carried forward from initial verification) | ⚠️ Warning (unfixed, previously triaged as non-blocking) | Least-privilege improvement, not a functional gap; not part of this gap-closure round |
| `useProductPeekWindow.ts` / `CheckoutPanel.tsx` / `ProductPeekWindow.tsx` | various | Fire-and-forget IPC calls (WR-03), no request-generation guard against out-of-order rescans (WR-04), TOCTOU window-creation race (WR-01) — carried forward, untouched by this round | ⚠️ Warning (unfixed, previously triaged as non-blocking) | Real but lower-probability edge cases; not reproduced by any test |

These two carried-forward Warnings were already present and explicitly triaged as non-blocking in the initial (`gaps_found`) verification round and 18-REVIEW.md; they do not affect this round's pass/fail determination since they were never the blocking gap.

### Human Verification Required

None.

### Gaps Summary

The single blocking gap from the initial verification — stale `e2e/checkout/barcode-scan-search.spec.ts` assertions against the removed direct-scan-to-cart UX — is closed. Independently confirmed by reading the current file (3 tests, scoped to manual/non-scan search, explicit doc comment explaining the coverage split), by re-running the full relevant E2E slice myself (13/14 pass, the 1 failure being the same pre-existing `.focus()` timeout debt already documented before this phase touched anything), by re-running the unit test file the SUMMARY claims now covers scanner-gating logic (4/4 pass), and by confirming the restored `barcode.scan_failed` audit trail actually writes to `audit_logs` in a live E2E run (not just present in source).

All four roadmap Success Criteria (PEEK-01..04) remain independently verified as they were in the initial round; no regressions were introduced by the gap-closure changes (`ProductPeekWindow.tsx`, `useProductPeekWindow.ts`, capability grants, and i18n catalogs were untouched by the fix commits). `npm run build`, `npm run typecheck`, and `npm run lint` were all independently re-run and are clean.

Phase 18 is complete. Ready to proceed.

---

_Verified: 2026-08-26T22:05:00Z_
_Verifier: Claude (gsd-verifier)_
