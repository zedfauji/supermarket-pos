---
phase: 15
slug: receipt-designer-layout-branding-logo-printing
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-23
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (TS unit) + Rust `cargo test` (src-tauri) + Playwright (E2E) |
| **Config file** | `vitest.config.ts` / `src-tauri/Cargo.toml` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run <changed test file>` or `cd src-tauri && cargo test <fn>` |
| **Full suite command** | `npm run test && cd src-tauri && cargo test && cd .. && npm run typecheck && npm run lint` |
| **Estimated runtime** | ~60-90 seconds (unit + cargo test + typecheck/lint); Playwright wave (15-04 task 2) adds ~30-60s |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` command (see Per-Task map below)
- **After every plan wave:** Run the full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npx playwright test e2e/08-settings-receipt.spec.ts`
- **Max feedback latency:** ~90 seconds (cargo test is the slowest single step)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | RCPD-01 | — | N/A | unit (tdd, tracer) | `npx vitest run src/shared/lib/receipt-format.test.ts` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | RCPD-01 | — | N/A | unit (tdd) | `npx vitest run src/shared/lib/receipt-format.test.ts` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 1 | RCPD-02 | T-15-02 | Malformed/oversized image input degrades gracefully (no panic, no hang) — decode-bomb guard | unit (tdd, tracer, Rust) | `cd src-tauri && cargo test encode_logo_raster` | ✅ | ⬜ pending |
| 15-02-02 | 02 | 1 | RCPD-02 | T-15-02 | Malformed data-URL input returns `Err`, never panics | unit (tdd, Rust) | `cd src-tauri && cargo test decode_data_url` | ✅ | ⬜ pending |
| 15-02-03 | 02 | 1 | RCPD-02 | — | N/A | build/lint (Rust) | `cd src-tauri && cargo build && cargo clippy -- -D warnings` | ✅ | ⬜ pending |
| 15-03-01 | 03 | 2 | RCPD-01, RCPD-02 | — | N/A | unit | `npx vitest run src/shared/lib/pos-printer.test.ts src/shared/lib/email-receipt.test.ts` | ✅ | ⬜ pending |
| 15-03-02 | 03 | 2 | RCPD-01, RCPD-02 | — | N/A | unit | `npx vitest run src/features/process-payment/ui/ReceiptPreview.test.tsx src/features/process-payment/ui/EmailReceiptDialog.test.tsx` | ✅ | ⬜ pending |
| 15-03-03 | 03 | 2 | RCPD-01, RCPD-02 | — | N/A | unit | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx src/widgets/PaymentModal/PaymentModal.test.tsx` | ✅ | ⬜ pending |
| 15-04-01 | 04 | 2 | RCPD-01 | T-15-04 | Live-preview `<pre>{text}</pre>` renders as an escaped text node (no `dangerouslySetInnerHTML`) — XSS not applicable, inherited from `ReceiptPreview.tsx` pattern | build/lint | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 15-04-02 | 04 | 2 | RCPD-01 | — | N/A | e2e (Playwright) | `npx playwright test e2e/08-settings-receipt.spec.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Note: RCPD-02's literal "Playwright asserts raw `GS v 0` bytes sent to hardware" success criterion is verified via the `cargo test encode_logo_raster` byte-exact fixture test (15-02-01) instead of Playwright — this repo's Playwright suite only ever runs against the browser-only `npm run dev` server, never the compiled Tauri/Rust binary (confirmed in 15-RESEARCH.md). IPC wiring (frontend invokes `print_receipt` with the correct `logoDataUrl`/`paperWidthChars`) is covered by 15-03-01's vitest assertion on the mocked `invoke` call. This substitution was flagged by 15-RESEARCH.md Open Question 3 and confirmed compliant by the plan-checker.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework, fixtures, or scaffolding needed — `receipt-format.test.ts`, Rust's built-in `#[cfg(test)]` harness (`printer.rs`, following `logger.rs`'s existing precedent), and the existing `playwright.config.ts` / `vitest.config.ts` are all already in place.

---

## Manual-Only Verifications

All phase behaviors have automated verification. Per CLAUDE.md's non-negotiable testing policy, no `checkpoint:human-verify` or manual UAT scenario exists in any of the 4 plans — confirmed by the gsd-plan-checker verification pass (2026-08-23).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra sufficient)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-23 (gsd-plan-checker VERIFICATION PASSED, all 4 plans, 0 blockers)
