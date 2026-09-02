# Deferred Items — Phase 27 (Promotions & Discount Management)

## From Plan 27-03

**Pre-existing test failure (out of scope — not caused by 27-03):**

- `src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx` — `HomeDashboard > gated buttons show lock icon for cashier` expects `lockIcons.length` to be `8`, but the actual count is now `9`.
- **Root cause:** Plan 27-02 (`a196647 feat(27-02): /promotions route, page shell, and Home dashboard tile`) added a new admin-only-gated `/promotions` nav tile to the Home dashboard's big-box nav, which adds one more locked button for the `cashier` role in the test's fixture — the hardcoded `8` in this assertion was never updated to `9` when that tile was added.
- **Why not fixed here:** `HomeDashboard.tsx`/`HomeDashboard.test.tsx` are not in 27-03's `files_modified` list and the regression predates this plan's Task 1 (confirmed via `git log` — the failing count already diverges as of `a196647`, before any 27-03 commit). Per the executor's deviation-rules scope boundary, pre-existing failures in unrelated files are logged, not auto-fixed.
- **Suggested fix:** bump the expected `lockIcons.length` from `8` to `9` in that one assertion (one-line test-only change) — a future plan touching `HomeDashboard.test.tsx`, or a dedicated cleanup pass, should pick this up.
