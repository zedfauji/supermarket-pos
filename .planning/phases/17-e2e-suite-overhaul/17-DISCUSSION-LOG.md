# Phase 17: E2E Suite Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 17-e2e-suite-overhaul
**Areas discussed:** Indian product test data, Rewrite scope & organization, DB-transaction verification depth, Speed & parallelization

---

## Indian Product Test Data

| Option | Description | Selected |
|--------|-------------|----------|
| Real seed overhaul | Replace supabase/seed.sql + scripts/seed-dev-data.ts end to end | ✓ |
| E2E-only fixture module | New e2e/fixtures/indian-products.ts, dev DB untouched | |
| Both, sequenced | E2E fixtures now, seed overhaul as fast-follow | |

**User's choice:** Real seed overhaul.

| Option | Description | Selected |
|--------|-------------|----------|
| Representative set, ~30-50 SKUs | Every category, 3-6 SKUs each | ✓ |
| Minimal, ~10-15 SKUs | Just enough to drive scenarios | |
| Exhaustive, 100+ SKUs | Full realistic shelf | |

**User's choice:** Representative set, ~30-50 SKUs.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing currency config, Indian names only | No INR formatting work | ✓ |
| Switch to INR formatting too | New i18n/currency scope | |

**User's choice:** Keep existing currency config, Indian names only.

| Option | Description | Selected |
|--------|-------------|----------|
| Mixed — packaged + case-pack + loose-weight | Exercises open-unit/loose-weight features | |
| Packaged goods only | Simple single-unit SKUs | ✓ |

**User's choice:** Packaged goods only.

| Option | Description | Selected |
|--------|-------------|----------|
| Add a few Indian loose/case items just for those specs | Keeps 49-open-units/52-loose-weight on-brand | |
| Leave those two specs on whatever non-Indian fixtures they need | | ✓ |

**User's choice:** Leave those two specs on whatever non-Indian fixtures they need.

---

## Rewrite Scope & Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Keep numbered-file convention, audit each file | Lowest risk, incremental | |
| Re-architect by feature/domain folder | New e2e/checkout/, e2e/inventory/, etc. | ✓ |

**User's choice:** Re-architect by feature/domain folder.

| Option | Description | Selected |
|--------|-------------|----------|
| Delete outright | Bar-pos-only files removed, git history preserves them | ✓ |
| Keep as test.skip with a comment | Larger diff noise | |

**User's choice:** Delete outright.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, update CLAUDE.md's E2E section | Docs match new structure immediately | ✓ |
| Leave docs for a follow-up | | |

**User's choice:** Yes, update CLAUDE.md's E2E section.

| Option | Description | Selected |
|--------|-------------|----------|
| Descriptive names, no prefix | Self-documenting | ✓ |
| Keep numeric prefixes per folder | Preserves suggested order | |

**User's choice:** Descriptive names, no prefix.

---

## DB-Transaction Verification Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, for state-changing flows | DB assertion alongside UI assertion | ✓ |
| UI-only assertions everywhere | Trust UI implies DB correctness | |

**User's choice:** Yes, for state-changing flows.

| Option | Description | Selected |
|--------|-------------|----------|
| Both — happy path + failure/rollback checks | Forced-failure test per atomic RPC | ✓ |
| Happy-path end state only | Smaller surface | |

**User's choice:** Both — happy path + failure/rollback checks.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared assertion helpers | Extend e2e/helpers/supabase.ts or new db-assertions.ts | ✓ |
| Inline per spec | More duplication | |

**User's choice:** Shared assertion helpers.

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope for E2E | RLS covered by Vitest integration tests | |
| Include representative RLS checks in E2E too | Belt-and-suspenders | ✓ |

**User's choice:** Include representative RLS checks in E2E too.

---

## Speed & Parallelization

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, redesign for isolation + parallel workers | Biggest wall-clock lever | |
| Keep serial, optimize individual specs only | Lower risk, smaller win | ✓ |

**User's choice:** Keep serial, optimize individual specs only.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect | Playwright default worker count | ✓ |
| Fixed count (e.g. 4) | Predictable resource usage | |

**User's choice:** Auto-detect. **Note:** not currently active since serial execution was chosen above — recorded as the stated preference if parallelization is revisited in a future phase.

| Option | Description | Selected |
|--------|-------------|----------|
| Trace/video only on failure | Standard Playwright speed practice | ✓ |
| Keep recording everything always | Larger e2e-results/ output | |

**User's choice:** Trace/video only on failure.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect newest installed version | Stays correct as agent-browser upgrades | ✓ |
| Pin the specific version currently installed | Breaks silently on upgrade | |

**User's choice:** Auto-detect newest installed version.

---

## Claude's Discretion

- Exact `e2e/` folder taxonomy (planner proposes, mapped against current 50 files + coverage gaps)
- Exact new spec files needed to close "every feature/component/flow/integration/DB transaction" coverage gaps
- Whether DB-assertion helpers extend `e2e/helpers/supabase.ts` or land in a new file
- Precise Indian product SKU list (names, categories, barcodes)

## Deferred Ideas

- Full INR (₹) currency/i18n formatting support — no phase scoped yet
- Case→piece / loose-weight variants for the Indian catalog itself
- Parallel-worker execution (`fullyParallel: true`) — biggest speed lever, deferred; would need a fixture-isolation redesign in a future phase
- `scripts/seed-combos.ts`, `scripts/seed-prep.ts` — likely-dead bar-pos scripts found outside this phase's `e2e/*.spec.ts` boundary during scouting; flagged for a future cleanup phase
