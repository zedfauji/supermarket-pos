---
phase: 02
slug: core-direct-sale-checkout
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-12
---

# Phase 02 — Security

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cashier keypad → direct-sale RPC | Untrusted weight input must be bounded before it affects price or stock. | Weight in grams |
| Client held-cart state | An unfinished sale remains in memory until payment. | Cart contents |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-10 | Tampering | Loose-weight input | high | mitigate | Client keypad and atomic RPC reject weights outside `(0, 50000]`. | closed |
| T-02-11 | Tampering | Inventory unit semantics | medium | mitigate | Migration and column comment define grams for `sold_by_weight` products and prohibit cross-type aggregation. | closed |
| T-02-12 | Repudiation | In-memory held cart | low | accept | Alpha intentionally does not persist held sales; cart state has no storage middleware. | closed |

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-12 | A held cart is lost on app restart; persistence is outside Alpha scope. | Phase plan | 2026-08-12 |

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-12 | 3 | 3 | 0 | gsd-security-auditor |

## Sign-Off

- [x] All threats have a disposition.
- [x] Accepted risk documented.
- [x] `threats_open: 0` confirmed.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-08-12
