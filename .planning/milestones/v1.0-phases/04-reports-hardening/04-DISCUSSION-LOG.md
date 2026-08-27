# Phase 4: Reports & Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-14
**Phase:** 04-reports-hardening
**Areas discussed:** Report tab trim scope, "Survive a full day" hardening, Caja close scope, Product Sales margin reporting

---

## Report Tab Trim Scope

### Tips tab
| Option | Description | Selected |
|--------|-------------|----------|
| Cut it | No tipping culture at a supermarket checkout — delete tab, widget, query | ✓ |
| Keep it | Staff still receive tips in some form worth tracking | |

**User's choice:** Cut it.

### Modifier Popularity tab
| Option | Description | Selected |
|--------|-------------|----------|
| Cut it | Supermarket products don't have order-time modifiers | ✓ |
| Keep it | Some products may still use modifiers (size/variant) | |

**User's choice:** Cut it.

### Staff Sales / Category Revenue tabs
| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Generic retail reporting, not bar-specific | ✓ |
| Cut Staff Sales only | Staff-level attribution matters less at a supermarket | |
| Cut both | Trim to exactly REP-02's named reports | |

**User's choice:** Keep both.

### "Remove" meaning
| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | Component, query hook, unused RPC/migration removed | ✓ |
| Hide only | Keep code, remove from nav | |

**User's choice:** Delete entirely.

---

## "Survive a full day" hardening

### Deliverable shape
| Option | Description | Selected |
|--------|-------------|----------|
| One full-day E2E soak spec | Scripted spec: caja open → sales → receiving → alert check → caja close → reconciliation | ✓ |
| Targeted stress/edge scenarios | Concurrency, offline replay, idempotency retry as separate specs | |
| Code review + fix pass | Audit and fix atomicity/error-handling, no new spec | |

**User's choice:** One full-day E2E soak spec.

### Scale
| Option | Description | Selected |
|--------|-------------|----------|
| Small but complete | ~10-15 sales, breadth over volume | |
| High-volume | 50-100+ sales, stress-test performance/locking | ✓ |

**User's choice:** High-volume.

### Concurrency
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, cover it | 1-2 terminal deployment — worth one concurrency test | |
| No, single-terminal only | Concurrency is an edge case, not core to "survive a day" | ✓ |

**User's choice:** No, single-terminal only.

### Re-verify existing atomicity
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, re-verify | Reuse/extend Phase 2/3's adversarial mid-way-failure cases | ✓ |
| No, trust prior verification | Phase 4 only proves reports and day-level sequence | |

**User's choice:** Yes, re-verify.

---

## Caja Close Scope

### REP-01 scope
| Option | Description | Selected |
|--------|-------------|----------|
| Pure verification | close_caja_session already works, reused as-is | ✓ |
| Add receiving-cost visibility | Surface day's receiving cost alongside cash reconciliation | |

**User's choice:** Pure verification.

### Caja-close summary/receipt changes
| Option | Description | Selected |
|--------|-------------|----------|
| Fine as-is | Payment-method-based summary already covers loose-weight/multi-unit via rollup | ✓ |
| Needs updates | Something specific should change | |

**User's choice:** Fine as-is.

---

## Product Sales Margin Reporting

### Add margin column
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add margin column | Within REP-02's product-sales scope, richer column not a new capability | ✓ |
| No, stay revenue-only | Defer profitability reporting to its own phase | |

**User's choice:** Yes, add margin column.

### Cost basis
| Option | Description | Selected |
|--------|-------------|----------|
| Current cost_price | Simple join at report time, may drift from what was actually paid | |
| Historical cost at sale time | Snapshot cost_price onto order_items at checkout for accuracy | ✓ |

**User's choice:** Historical cost at sale time (not the recommended simpler option) — user prioritized margin accuracy over avoiding a new write path into checkout.

---

## Claude's Discretion

- Exact structure of the full-day soak spec (single `e2e/` file vs. split into a few focused specs)
- Where in the codebase the RPC/migration deletions for Tips/Modifier Popularity land relative to other Phase 4 changes
- Specific query shape for joining historical cost onto Product Sales
- Supplier record contact-field granularity and receiving-line quick-add UI details are out of this phase's scope (Phase 3 concerns)

## Deferred Ideas

None — discussion stayed within phase scope. Concurrent-terminal/concurrent-cashier testing was explicitly considered and deliberately excluded from this phase (not deferred as a future capability) — revisit only if multi-terminal issues surface in real usage.
