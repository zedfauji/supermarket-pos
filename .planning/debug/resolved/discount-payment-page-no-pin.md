---
status: resolved
trigger: "On Payment Page , Selecting discount switch , then adding correct PIN , aplied 10% discount , while processing payment its showing error Ad-hoc discount requires manager authorization and its not even asking for any PIN and not letting me complete the payment. Its on tajhouseofspice store , production and i believe it was debugged earlier and fixed"
created: 2026-09-05T05:35:45Z
updated: 2026-09-05T08:00:00Z
---

## Symptoms

- expected: On the Payment Page (PaymentPane, /payments — reopened-tab payment screen), toggling the ad-hoc discount switch, entering a correct manager PIN, and setting a 10% discount lets the payment complete with the discount applied.
- actual: At payment submission, server rejects with "Ad-hoc discount requires manager authorization" (DISCOUNT_REQUIRES_MANAGER). No PIN re-prompt occurs. Payment cannot complete.
- error_messages: "Ad-hoc discount requires manager authorization"
- timeline: User believes this was already debugged/fixed. A RELATED bug (same error class, CheckoutPanel/direct-sale path) was diagnosed 2026-09-03 in .planning/debug/adhoc-discount-manager-pin-rejected-after-entry.md (root cause confirmed, fix NOT yet applied — that session's goal was find_root_cause_only). That prior session's "Eliminated"/Evidence section already flagged a SEPARATE, independent finding on this exact PaymentPane path (see its Evidence entry timestamped 2026-09-03T00:52:00Z): process-payment edge function's BodySchema did not forward discountScope/discountType/discountValue/discountAmount/managerOverride at all, and process_payment_atomic/process_split_payment_atomic had no manager-override authorization check. Since then (2026-09-04/05), migrations 20260903091500_process_payment_manager_override_wiring, 20260903093000_manager_override_null_coalesce_guard, and 20260904000002_manager_pin_identity_audit were deployed to this same remote prod project (mkvinyekkyennyegfoxq / Taj House of Spices) — these ADD a manager-override + manager_pin re-verification check to process_payment_atomic/process_split_payment_atomic (previously they had none). This current report may be that dormant PaymentPane gap now surfacing as a hard rejection where before it may have silently passed — needs verification, do not assume.
- reproduction: On /payments (PaymentPane, reopened/paid tab), toggle the ad-hoc discount section, have a manager type their PIN into ManagerPinDialog (success), set discount to 10%, submit payment.

## Current Focus

- bug_class: Bohrbug (deterministic — every discounted payment on this store's prod fails identically)
- hypothesis: CONFIRMED — three-tier deployment skew on project mkvinyekkyennyegfoxq. Not a code defect: repo HEAD is correct on every tier. The prod DB is migrated all the way to 20260904000002 (Phase 27 final), but the prod EDGE FUNCTIONS were last deployed 2026-08-29 20:13 UTC (pre-Phase-27) and the newest RELEASE TAG (v1.2.3, 2026-09-03 10:13) predates the client-side managerPin threading (d612c10, 2026-09-03 22:33).
- test: n/a — confirmed by direct inspection of the live deployed artifacts (`supabase functions list/download`, `supabase migration list`, `git tag --contains`), not a runtime experiment.
- next_action: NONE — session closed. Both AND-gate halves confirmed fixed end-to-end at the store terminal on 2026-09-05 (terminal updated to v1.2.8; a real 10%-discount sale completed successfully; user: "okay it worked, now i can apply discount successfully"). Session archived to .planning/debug/resolved/.
- reasoning_checkpoint:
    hypothesis: "The DB tier enforces a contract (p_manager_override + p_manager_pin) that neither the deployed edge-function tier nor the shipped client tier sends, because only the DB tier was ever advanced to Phase 27 final."
    confirming_evidence:
      - "`supabase migration list --project-ref mkvinyekkyennyegfoxq` → remote has 20260903090000/091500/093000/20260904000002 applied (Phase 27 manager-PIN re-verification + COALESCE guard all live)."
      - "`supabase functions list` → process-payment/process-direct-sale/process-split-payment all version 3, updated_at 1788034432881 = 2026-08-29T20:13:52Z, entrypoint under `.claude/worktrees/agent-ac0c8d350d9b8fd10/` — i.e. a stale worktree bulk deploy that predates every Phase 27 commit."
      - "`supabase functions download process-direct-sale` → deployed source forwards p_discount_scope/type/value/amount but has NO managerOverride/managerPin in its BodySchema and never passes p_manager_override/p_manager_pin. Its discountScope enum still contains the retired pool_only/consumptions_only members (retired in repo by 0ca508c), independently dating it pre-Phase-27."
      - "`supabase functions download process-payment` → 313 lines, ZERO occurrences of `discount` or `manager` anywhere; the discount fields are silently dropped on the /payments (PaymentPane) path entirely."
      - "`git tag --contains d612c10` → EMPTY. v1.2.3 (newest tag) contains dab6da7 (the PIN gate the user sees) but `git show v1.2.3:src/widgets/PaymentModal/ui/PaymentForm.tsx | grep -c managerPin` → 0. The shipped desktop app asks for the PIN and never transmits it."
      - "The string 'Ad-hoc discount requires manager authorization' exists ONLY in SQL migrations — no client/i18n source — so the rejection provably originated in process_direct_sale_atomic/process_payment_atomic, not client-side validation."
    falsification_test: "If the deployed process-direct-sale had contained `p_manager_override` in its RPC call, the skew hypothesis would be dead and the fault would have to be client-side or in the RPC body. It does not contain it."
    fix_rationale: "The rejection is produced by a live server-side guard receiving default `false` because no tier upstream of it sends the value. Redeploying the (already-correct) edge functions restores the transport; shipping a client >= d612c10 restores the payload. Nothing in the repo needs editing."
    blind_spots: "Not verified WHICH build the store terminal is actually running — v1.2.3 is the newest tag, but a hand-built/side-loaded binary from a newer commit is possible. If the terminal already runs >= d612c10, the edge-function deploy alone fully resolves it."
    candidate_causes:
      - "code: client/edge/RPC wiring drops managerOverride — ELIMINATED, repo HEAD wires it end-to-end on all three tiers"
      - "environment/deployment: deployed edge functions predate the applied migrations — CONFIRMED"
      - "environment/release: shipped desktop build predates the client-side managerPin threading — CONFIRMED"
      - "config: RPC overload ambiguity from an appended parameter — ELIMINATED, 20260903091500 explicitly DROPs each prior signature before re-CREATE"
    and_gate: "YES — this failure requires BOTH contributing conditions and fixing either alone leaves it broken: deploy the edge functions only → the v1.2.3 client sends managerOverride:true with no PIN → the RPC's `WHERE p.pin = p_manager_pin` finds nothing → FORBIDDEN 'Not authorized to apply a manager override'. Ship the client only → the stale edge function's Zod schema strips managerPin/managerOverride before the RPC ever sees them → DISCOUNT_REQUIRES_MANAGER, unchanged."
- tdd_checkpoint:
    oracle: "deployed-artifact assertion (derived oracle — the deployed bundle must contain the contract the live DB enforces)"
    check: "supabase functions download process-direct-sale && grep -c p_manager_override supabase/functions/process-direct-sale/index.ts"
    status_before_fix: "RED — 0 occurrences in the deployed bundle (also 0 for process-payment, which lacks 'discount' entirely)"
    status_after_fix: "GREEN — re-downloaded bundles contain p_manager_override/p_manager_pin on all three functions (2026-09-05T06:20:00Z verification), and the live behavioural oracle (a real 10%-discount sale on the store terminal) now completes successfully on v1.2.8."

## Evidence

- timestamp: 2026-09-05T06:05:00Z
  checked: repo HEAD wiring on all three tiers — ManagerPinDialog.tsx (onSuccess now `(staff: Staff) => void`), PaymentForm.tsx:1405-1422 (`setAuthorizingManagerPin(staff.pin)`), payment-processor.ts:68/105/151/185, process-payment/index.ts:19-24 + 167-176
  found: Repo HEAD forwards discountScope/Type/Value/Amount + managerOverride + managerPin end-to-end, with `?? false` on p_manager_override (the CR-01 fix, commit 4e5163e) and `?? null` on p_manager_pin.
  implication: There is NO code defect at HEAD. The earlier session's primary and secondary findings were both already fixed in-repo (commits d612c10, 8d69276, a747ed1, 4e5163e). The fault must be in what is actually running, not in what is written.

- timestamp: 2026-09-05T06:12:00Z
  checked: `supabase migration list --project-ref mkvinyekkyennyegfoxq`
  found: Remote has every migration through 20260904000002 applied, including 20260903090000 (direct-sale PIN re-verify), 20260903091500 (process_payment_atomic/process_split_payment_atomic manager-override wiring), 20260903093000 (COALESCE(p_manager_override,false) guard) and 20260904000002 (manager-PIN identity audit).
  implication: The DB tier is fully advanced and is actively enforcing `IF NOT p_manager_override THEN RETURN DISCOUNT_REQUIRES_MANAGER`.

- timestamp: 2026-09-05T06:15:00Z
  checked: `supabase functions list --project-ref mkvinyekkyennyegfoxq`
  found: process-payment, process-direct-sale, process-split-payment (plus agent-proxy, get-server-time, receive-shipment) are all at version 3, updated_at 2026-08-29T20:13:52Z, with entrypoint_path under `.claude/worktrees/agent-ac0c8d350d9b8fd10/`. Only create-staff/send-receipt-email/settings-* (2026-08-30) and admin-reset-pin (2026-08-31) are newer. Nothing has been deployed since 2026-08-31; Phase 27 began 2026-09-01.
  implication: The entire Phase 27 edge-function surface — 5 commits' worth (7f29c66, 0ca508c, 91fcd05, 8d69276, 4e5163e) — has never reached production.

- timestamp: 2026-09-05T06:20:00Z
  checked: downloaded deployed bundles for process-direct-sale / process-payment / process-split-payment
  found: |
    process-direct-sale (deployed): BodySchema has discountScope/discountType/discountValue/discountAmount and the RPC call passes p_discount_scope/type/value/amount — but there is NO managerOverride/managerPin field and NO p_manager_override/p_manager_pin argument. Its discountScope enum still lists the retired pool_only/consumptions_only members.
    process-payment (deployed): 313 lines, zero matches for /discount|manager/ — no discount handling at all.
    process-split-payment (deployed): forwards p_discount_* only, no manager fields.
  implication: THE MECHANISM. On the checkout/direct-sale payment step the client's discount fields DO reach process_direct_sale_atomic while managerOverride is stripped by the stale Zod schema, so the RPC sees p_discount_scope='all' with p_manager_override defaulting to false and returns DISCOUNT_REQUIRES_MANAGER — verbatim the reported message. The user is never re-prompted because the client already considers the PIN accepted. Separately, on /payments (PaymentPane) the discount is dropped outright, so that screen underpays/leaves the tab open rather than erroring.

- timestamp: 2026-09-05T06:24:00Z
  checked: `git tag --contains d612c10` / `git tag --contains dab6da7` / `git show v1.2.3:src/widgets/PaymentModal/ui/PaymentForm.tsx | grep -c managerPin`
  found: No tag contains d612c10 (client-side managerPin threading, committed 2026-09-03T22:33 -0600). v1.2.1/v1.2.2/v1.2.3 contain dab6da7 (the PIN gate on the discount switch). v1.2.3's PaymentForm has 0 occurrences of managerPin. Newest tag v1.2.3 is dated 2026-09-03T10:13 -0600, i.e. ~12h before d612c10 landed.
  implication: SECOND CONTRIBUTING CAUSE. The shipped desktop build prompts for the manager PIN but never transmits it, so redeploying the edge functions alone converts DISCOUNT_REQUIRES_MANAGER into FORBIDDEN ("Not authorized to apply a manager override") rather than fixing the flow. A client release containing d612c10 or later is required as well.

- timestamp: 2026-09-05T06:26:00Z
  checked: `grep -rn "requires manager|REQUIRES_MANAGER" src/ e2e/` and the i18n catalogs
  found: The literal "Ad-hoc discount requires manager authorization" appears only in supabase/migrations/*.sql. The client only maps the CODE (edge-function-contracts.ts:203-204, result.ts:209) and renders `result.error.message` verbatim.
  implication: Rules out any client-side pre-flight guard as the source of the message — the rejection is unambiguously server-side, from the RPC.

- timestamp: 2026-09-05T06:45:00Z
  checked: repo-wide search for the error string; cross-referenced against the deployed functions' entrypoint_path
  found: Every hit outside supabase/migrations/ is a copy inside `.claude/worktrees/agent-*/` — the repo carries several stale agent worktrees (agent-a40d5ad0a13720d7e, agent-a431f83cc2e8d07a1, agent-a4687484a82eebb5a, agent-a7900f0cf6da7ae8b, …), each holding its own partial snapshot of the Phase 27 migrations. Prod's stale bundles were deployed from one of these: entrypoint_path = `.claude/worktrees/agent-ac0c8d350d9b8fd10/supabase/functions/…`.
  implication: WHY-NOT-CAUGHT mechanism. Backend deploys have been fired from ad-hoc agent worktrees rather than the main checkout via scripts/deploy-remote-backend.ps1. A worktree pinned at an old commit deploys old function sources while `supabase db push` (run from wherever) advances the shared remote DB — the two tiers drift with nothing comparing them. Each worktree also holds a DIFFERENT subset of the migrations (some have 20260904000001, some stop at 20260903090000), so which snapshot deployed determines how stale prod gets.

## Eliminated

- hypothesis: The deployed process-payment is the intermediate commit-8d69276 build whose `p_manager_override: body.managerOverride ?? null` (SQL NULL) is coerced to false by migration 20260903093000's new COALESCE guard.
  evidence: Downloaded the actual deployed bundle — it has zero occurrences of `discount` or `manager` and is 313 lines vs repo HEAD's 377. It predates 8d69276 entirely (deployed 2026-08-29; 8d69276 landed 2026-09-03). The CR-01 NULL-coalesce build was therefore never deployed to this project at all.
  timestamp: 2026-09-05T06:20:00Z

- hypothesis: A client-side state bug lets discountAmount > 0 reach the RPC while managerOverride is false (e.g. toggling the discount switch off/on, or the tab-change reset clearing managerOverride but not discountValue).
  evidence: Read PaymentForm.tsx:238-268 (tab-change reset clears discountValue AND managerOverride AND authorizingManagerPin together), :843-862 (switch-off clears all three together; switch-on cannot set discountExpanded without a successful PIN) and :437-454 (discountInfoArg always carries effectiveManagerOverride). No reachable state has discountAmount > 0 with managerOverride false. Moot regardless: the deployed edge function strips managerOverride whatever its value.
  timestamp: 2026-09-05T06:08:00Z

- hypothesis: A Postgres function-overload ambiguity (the pre-existing 17-param process_direct_sale_atomic left reachable when p_manager_pin was appended) is selecting the old signature without the manager params.
  evidence: 20260903091500 lines 59-61 explicitly `DROP FUNCTION IF EXISTS` each pre-migration signature immediately before its CREATE OR REPLACE, and that migration is confirmed applied on remote. An ambiguity would also surface as PostgREST "function is not unique", not as DISCOUNT_REQUIRES_MANAGER.
  timestamp: 2026-09-05T06:13:00Z

- hypothesis: The client bypasses the edge functions and calls process_payment_atomic / process_direct_sale_atomic directly via PostgREST on some path (offline-queue replay, close_tab, etc.).
  evidence: `grep -rn "process_payment_atomic|process_direct_sale_atomic|process_split_payment_atomic" src/` returns only comments, generated supabase.types.ts entries, and doc strings — no `supabase.rpc(...)` call site. Every payment path goes through callProcessPayment/callProcessDirectSale/callProcessSplitPayment → supabase.functions.invoke.
  timestamp: 2026-09-05T06:26:00Z

- timestamp: 2026-09-05T07:00:00Z
  checked: coordinator-reported release-cut status (human action, in progress)
  found: |
    DATA_START
    User confirmed the store terminal is on v1.2.3 (predates d612c10, matching this session's blind_spot
    check). Cutting release now: bumped src-tauri/tauri.conf.json to 1.2.8, committed e5ecac6, pushed to
    main, tagged v1.2.8, pushed the tag. GitHub Actions release.yml run 33948397622 is in progress
    (sync-customers job building/signing for taj-house-of-spices), publishing to
    zedfauji/supermarket-pos-taj as v1.2.8, non-draft, becomes Latest on the Tauri updater endpoint.
    2f8e36a (main HEAD immediately before the version bump) already contains d612c10, so v1.2.8 carries
    the managerPin-forwarding fix. Coordinator also separately confirmed the `.claude/worktrees/agent-*/`
    vs scripts/deploy-remote-backend.ps1 deploy-drift finding independently, for the CI migration-drift-gate
    follow-up noted in this session's "Not done, deliberately" scope-cut.
    DATA_END
  implication: |
    Half 2 of the AND-gate (client release) is now underway but NOT yet complete — CI run in progress,
    terminal has not installed v1.2.8, no discounted sale has been attempted. Checkpoint stays OPEN.
    Coordinator explicitly asked to hold rather than proceed; no further investigation is warranted until
    the release finishes and a real discounted-sale attempt is reported (confirmed fixed, or exact error
    text).

- timestamp: 2026-09-05T07:15:00Z
  checked: coordinator-reported release-publish status (human action, completed)
  found: |
    DATA_START
    Release v1.2.8 is live: build+sign succeeded (GitHub Actions run 33948397622), published non-draft
    to zedfauji/supermarket-pos-taj, marked Latest, all 5 expected assets present (setup.exe + .sig,
    msi + .sig, latest.json). Contains d612c10 (managerPin threading) plus the same edge-function fixes
    already redeployed server-side earlier in this session.
    DATA_END
  implication: |
    Both AND-gate halves are now shipped: server tier verified GREEN (2026-09-05T06:20:00Z evidence) and
    client tier now verified published as Latest. No repo/deploy action remains on either side. The only
    outstanding step is store-side and physical: the terminal's Tauri updater must actually apply v1.2.8
    (auto-poll of releases/latest/download/latest.json, or a restart), then a real 10%-discount sale must
    be rung up on that terminal to confirm end-to-end. Checkpoint stays OPEN for that human verification —
    nothing further to automate or investigate from this session.

- timestamp: 2026-09-05T08:00:00Z
  checked: human end-to-end verification at the store terminal (checkpoint response)
  found: |
    DATA_START
    User confirmed: "okay it worked, now i can apply discount successfully." Terminal updated to v1.2.8;
    discount + manager PIN flow on the Payment Page now completes payment successfully.
    DATA_END
  implication: |
    AND-gate closed. Server tier (redeployed edge functions) + client tier (v1.2.8 containing d612c10)
    together restore the managerOverride/managerPin transport that the fully-migrated prod DB requires.
    Root cause confirmed correct — it was deployment skew, not a code defect — and the fix is verified by
    the strongest available oracle: a real discounted sale on the real terminal. Session resolved.

## Resolution

- root_cause: |
    Three-tier deployment skew on the production project mkvinyekkyennyegfoxq (Taj House of Spices) — no code defect exists at repo HEAD. TWO conditions must both hold, and both do (AND-gate):
    (1) The prod DB has every Phase 27 migration applied (through 20260904000002), so process_direct_sale_atomic / process_payment_atomic / process_split_payment_atomic actively enforce `IF p_discount_* IS NOT NULL AND NOT p_manager_override THEN RETURN DISCOUNT_REQUIRES_MANAGER` — but the prod EDGE FUNCTIONS were last deployed 2026-08-29T20:13Z, before Phase 27 began. The deployed process-direct-sale forwards the discount fields while its Zod BodySchema silently strips managerOverride/managerPin and never passes p_manager_override to the RPC, so the guard sees the parameter's `DEFAULT false` and rejects with the exact message the user reported. (The deployed process-payment is worse still: it has no discount handling whatsoever, so the /payments PaymentPane discount is dropped silently instead.)
    (2) The newest shipped release, v1.2.3, predates commit d612c10 — it contains the PIN gate on the discount switch (dab6da7) but not the client-side threading of the matched staff member's PIN into managerPin. The running terminal therefore asks for a PIN and never sends it, so deploying the edge functions alone would only change the rejection to FORBIDDEN.
- fix: |
    Half 1 (APPLIED, server tier): redeployed the three stale payment edge functions from repo HEAD to
    mkvinyekkyennyegfoxq —
      supabase functions deploy process-direct-sale process-payment process-split-payment --project-ref mkvinyekkyennyegfoxq
    No source edit was needed or made: repo HEAD already contained the correct wiring (d612c10, 8d69276,
    a747ed1/91fcd05, 4e5163e). Deployment was scoped to those three functions rather than a bulk
    `supabase functions deploy`, because they are the only ones whose repo source had advanced past
    their last deploy (verified with `git log --since="2026-08-29 20:13" --name-only -- supabase/functions/`:
    every other changed function was already redeployed on 2026-08-30/08-31, and `_shared/tax.ts` ships
    inside the three payment bundles).
    Half 2 (APPLIED, client tier): cut and shipped desktop release v1.2.8 from main HEAD (2f8e36a, which
    contains d612c10), so the terminal actually transmits `managerPin`. Version bump committed as e5ecac6
    (src-tauri/tauri.conf.json 1.2.3 → 1.2.8 — release metadata only, no logic change), tagged v1.2.8,
    built/signed by GitHub Actions run 33948397622, published non-draft to zedfauji/supermarket-pos-taj
    and marked Latest on the Tauri updater endpoint (all 5 assets present: setup.exe + .sig, .msi + .sig,
    latest.json). The store terminal's updater then applied v1.2.8.
    Neither half required a source-code edit — the fix was entirely "make the deployed artifacts match the
    already-correct repo HEAD" on both tiers.
- verification: |
    - signal: deployed-artifact assertion (the tdd_checkpoint oracle)
      before_fix: RED — `supabase functions download` showed p_manager_override=0 / p_manager_pin=0 in all
        three deployed bundles (process-payment additionally had 0 occurrences of `discount` at all).
      after_fix: GREEN — re-downloaded from prod: process-direct-sale p_manager_override=1 p_manager_pin=2
        p_discount_scope=1; process-payment 3/1/1; process-split-payment 2/1/1.
    - signal: revert-check equivalence — the deployed bundle was the ONLY thing that changed; the bug is
      re-creatable at will by redeploying the 2026-08-29 sources, confirming the deployed artifact (not
      any repo source) was the fault carrier.
    - signal: blast-radius — non-discount payments were never affected and remain unaffected: the client
      only attaches discount/managerOverride fields when a discount or override is in play
      (PaymentForm.tsx:443-454), and the RPC guards only fire when a discount field is non-null.
    - signal: scope closure — no other prod edge function is stale (checked all of supabase/functions/
      against the 2026-08-29 deploy timestamp).
    - signal: client-tier artifact assertion
      before_fix: RED — `git tag --contains d612c10` empty; newest shipped tag v1.2.3 had 0 occurrences of
        managerPin in PaymentForm.tsx.
      after_fix: GREEN — v1.2.8 tagged from 2f8e36a (contains d612c10), built/signed, published Latest,
        and installed on the store terminal.
    - signal: human end-to-end verification (the real behavioural oracle) — CONFIRMED 2026-09-05. On the
      updated v1.2.8 terminal against the redeployed prod edge functions, a real 10%-discount sale with
      manager PIN completed successfully. User: "okay it worked, now i can apply discount successfully."
      Both AND-gate halves are therefore confirmed jointly sufficient in production, closing the last open
      item from the earlier blind_spot ("not verified WHICH build the store terminal is running" — it was
      v1.2.3, exactly as predicted).
- files_changed: []  # no repo source was edited by this debug session; the fix was (a) redeploying
    # already-correct HEAD edge-function sources and (b) shipping release v1.2.8 from an existing HEAD
    # commit. The only repo commit in the loop, e5ecac6, is a release-metadata version bump in
    # src-tauri/tauri.conf.json (1.2.3 → 1.2.8), not a code change to the failing path.
