---
phase: "24"
slug: "tax-configuration-inclusive-exclusive-toggle"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-01"
---

# Phase 24 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Authenticated staff client → `process_direct_sale_atomic` | Untrusted `p_amount`/`p_expected_total`, computed client-side by `PaymentForm.tsx` from cached settings, crosses into a `SECURITY DEFINER` function whose anti-tamper guard is this phase's core safety net | Payment amount, expected total |
| `process-direct-sale` edge function → `settings` table | Server-side read, not attacker-controlled, but a mismatched fallback default here would silently misclassify every receipt's tax mode | `settings.billing.taxInclusive`, `taxRatePercent` |
| Admin-role browser client → `settings` table (`key='billing'`) | Write gated client-side by `ProtectedAction action="manage_products"`; the write goes through `useMutationUpdateSetting`, no new RPC | Billing settings row |
| `process-payment`/`process-split-payment` edge functions → `settings` table | Server-side read via the already-privileged `admin` (service-role) client, same trust level as existing payment-processing logic in these functions | `settings.billing.taxInclusive`, `taxRatePercent` |
| Test-only surface (Plan 04) | All files touched are `*.test.ts`/`*.spec.ts`/`*.stories.tsx` or a new `e2e/helpers/tax.ts` test utility — no new production trust boundary | n/a |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-24-01 | Tampering | `process_direct_sale_atomic` anti-tamper guard vs. client formula divergence | high | mitigate | RPC re-reads `settings.billing` itself, never trusts a client-submitted mode flag; client and server share the identical subtotal-first-then-subtract rounding discipline | closed |
| T-24-02 | Tampering | Client submitting an amount computed under the wrong mode | medium | accept | Exclusive vs. inclusive totals differ by the full tax amount, not a rounding-scale drift, so a wrong-mode submission is rejected outright by the existing `> 0.01` anti-tamper tolerance already accepted in production for every other payment path | closed (accepted) |
| T-24-03 | Tampering | Migration signature mismatch silently creating a duplicate `process_direct_sale_atomic` overload | critical | mitigate | Task 1 copies the exact prior 17-parameter signature; live-verified `SELECT count(*) FROM pg_proc WHERE proname = 'process_direct_sale_atomic'` = 1 | closed |
| T-24-04 | Tampering | `BillingSettingsTab.save()` wholesale value overwrite dropping `taxInclusive` | medium | mitigate | `taxInclusive` included in the save payload from Task 1 onward; dedicated unit test asserts the field is always present in the mutation call | closed |
| T-24-05 | Elevation of Privilege | `ProtectedAction action="manage_products"` gating a billing/tax field | low | accept | Pre-existing gate-naming mismatch shared by the already-shipped `taxRatePercent` field on the same tab; correcting it is explicitly out of this phase's scope (would alter RBAC for the whole tab, not just this field) | closed (accepted) |
| T-24-06 | Repudiation / Information Disclosure | `process-payment`, `process-split-payment` receipt tax data | medium | mitigate | Both functions derive receipt tax data identically to `process-direct-sale` via the shared `decomposeTax` helper, closing the inconsistent-receipt dispute risk | closed |
| T-24-07 | Tampering | Formula drift between the three edge functions (`_shared/tax.ts` reuse) | low | mitigate | No formula re-derived in either file touched by Plan 03 — both import the exact same already-unit-tested `decomposeTax` function; live-verified `grep -c "decomposeTax(" process-payment/index.ts process-split-payment/index.ts` = 1 each, `grep -c "const total = subtotal"` = 0 each | closed |
| T-24-08 | Tampering | Test-formula drift masking a real regression (`e2e/helpers/tax.ts` vs. production formula) | medium | mitigate | One shared, mode-aware e2e helper replaces 8 independent hardcoded copies; live-verified `grep -rln "\* 1\.16\|function computeAuthoritativeTotal\|function getTaxRatePercent" e2e/ \| grep -v e2e/helpers/tax.ts` returns only comment-text false positives in `tax-inclusive-mode.spec.ts` (no live formula code) | closed |
| T-24-09 | Repudiation | Fixture assertion silently weakened to force a pass (Plan 04 Task 2/3) | low | accept | Explicit instruction in both tasks to fix root cause, never patch an assertion to hide a regression; enforced by human/session code review of the diff — no automated gate fully prevents this class of shortcut | closed (accepted) |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (`high`) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-24-01 | T-24-02 | Wrong-mode submission rejected outright by existing anti-tamper tolerance; residual risk bounded to the pre-existing $0.01 tolerance already accepted production-wide | Phase 24 Plan 01 threat model | 2026-09-01 |
| R-24-02 | T-24-05 | Pre-existing RBAC gate-naming mismatch shared by an already-shipped sibling field; correcting scoped out of this phase to avoid altering tab-wide RBAC | Phase 24 Plan 02 threat model | 2026-09-01 |
| R-24-03 | T-24-09 | No automated gate can fully prevent a weakened test assertion; mitigated by explicit no-shortcut instruction + diff review, not further automatable within this phase | Phase 24 Plan 04 threat model | 2026-09-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-01 | 9 | 9 | 0 | /gsd-verify-work 24 → /gsd-secure-phase 24 (orchestrator, short-circuit path: register_authored_at_plan_time=true, asvs_level=1, threats_open=0 after live re-verification — no auditor subagent spawned) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-01
