# Verification Overrides

Per `CLAUDE.md`'s Testing & Verification Policy, `human_needed` is not a valid terminal
verification status for any v1.1 phase. When a verifier legitimately surfaces an item that
requires a product/security judgment call rather than an automatable test, the call is made
here, in writing, with a reasoned justification — not left pending indefinitely.

---

## Phase 9 — Reopen-and-edit a completed sale (2026-08-18)

**Item:** `09-VERIFICATION.md` / `09-REVIEW.md` CR-01 — `create_order_with_items` and
`remove_tab_item` have no server-side role check distinguishing "editing a reopened,
previously-paid sale" from "editing a normal in-progress open tab." The `ManagerPinDialog`
gates this phase adds in front of both RPCs are a client-side UX confirmation, not a security
boundary; an authenticated cashier session could call either RPC directly on a reopened tab id.

**Decision:** Accept as a pre-existing architectural condition, not a Phase 9 regression.
`remove_tab_item`'s own migration (`supabase/migrations/20260721000005_remove_tab_item_rpc.sql`,
D-07) already documents this is deliberate — item removal has never had a role gate.
`create_order_with_items` has never had one either; it's the same RPC every other add-item flow
in the app (including the ordinary open-tab and direct-sale paths) already calls unguarded.
Phase 9 composes new UI on top of two RPCs whose authorization posture predates it by months —
it does not loosen or introduce anything. This matches `09-CONTEXT.md` D-05 ("reuse
`RemoveTabItemDialog`/`useRemoveTabItem` as-is — no rewrite") and `09-RESEARCH.md`'s Open
Question 2, which explicitly flagged this exact question at planning time and recommended
treating it as out-of-scope, to be handled as "a separate phase/ticket, not bundled here."

**Reason this isn't a UAT/manual-check evasion:** No amount of automated testing changes this
verdict — it is a scope-boundary decision about whether to expand Phase 9 into an RPC
authorization hardening project. That decision was already made once, explicitly, at
discuss-phase time (D-05) and re-confirmed at research time (Open Question 2); this override
simply carries that same decision through to phase close rather than re-litigating it as a
blocking gap.

**Follow-up:** Tracked as a deferred item in `.planning/STATE.md` — a future security-hardening
phase should add a conditional `AUTH_FORBIDDEN` role check to both RPCs, gated on
`tabs.reopened_at IS NOT NULL` (or equivalent), per `09-VERIFICATION.md`'s suggested fix shape.

**Result:** `09-VERIFICATION.md` status treated as `passed` for phase-completion purposes. All 5
ROADMAP success criteria for SALE-03 are independently verified; this override resolves the
sole non-SC-blocking item the verifier escalated.
