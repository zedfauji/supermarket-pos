# Deferred Items — Phase 19

Out-of-scope discoveries logged during plan execution, per the executor's scope
boundary rule (do not auto-fix issues unrelated to the current task's changes).

## Plan 19-04

- **`src/features/open-product-peek-window/model/useProductPeekWindow.test.ts`
  (3 failing tests)** — pre-existing failure, unrelated to this plan's
  print-call-site hardening work. Confirmed pre-existing by running the file
  in isolation (`npx vitest run src/features/open-product-peek-window/model/useProductPeekWindow.test.ts`)
  with no other changes in play; this worktree's `pos-printer.ts` `isTauri()`
  implementation is unmodified by Plan 19-04. Per the parallel-execution brief
  for this plan, a separate non-GSD Claude Code session is independently
  fixing an `isTauri()` correctness bug directly in the main working tree
  (uncommitted) — this worktree was forked before that fix landed, so the bug
  is still present here. Not fixed in this plan; the orchestrator/a future
  session should reconcile once that fix is committed upstream.
