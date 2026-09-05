---
status: verifying
trigger: "Promotions and Discount is not getting printed on reciept. and also Product quantity sign which is \"x\" , is getting printed as some chinease or some asian font."
created: 2026-09-05T17:50:00Z
updated: 2026-09-05T18:29:00Z
---

## Symptoms

- expected: Receipt item lines show the quantity with a normal ASCII `x`, and any applied promotion or discount is itemized so the customer can understand the adjusted total.
- actual: The printed quantity separator is mojibake (`6ï¿½...` in the scan), while the receipt total changes without printing a promotion or discount line.
- error_messages: None in the application or print-service logs.
- timeline: The user has never seen promotion or discount details printed and is unsure whether receipt support was implemented.
- reproduction: Complete and print a sale containing a multi-quantity product with a promotion or discount applied; inspect the physical receipt. The supplied scan shows a six-unit line and an unexplained difference between subtotal and total.

## Current Focus

- bug_class: bohrbug
- reasoning_checkpoint:
    hypothesis: The receipt defects are caused by two shared output-boundary failures: persisted promotion/ad-hoc discount metadata is dropped before formatting, and the formatter emits U+00D7 while the Rust ESC/POS path forwards its UTF-8 bytes without transcoding.
    confirming_evidence:
      - The agent-authored formatter tests fail because `buildThermalReceiptText()` outputs `2× Cerveza`/`0.375kg × Jamón` and emits no promotion or discount line even when its input contains that metadata.
      - Full path tracing found that payment/order-item columns persist the discounts, but receipt queries/contracts omit them; Rust writes formatter strings with `line.as_bytes()` and selects no code page.
    falsification_test: The hypothesis would be false if existing receipt builders already selected and mapped the persisted discount fields into `ReceiptData`, the formatter already rendered those fields, or the physical path converted U+00D7 to a supported printer glyph before writing bytes.
    fix_rationale: Preserve existing persisted values through the shared `ReceiptData` contract/builders, render them once in `buildThermalReceiptText()`, and replace U+00D7 with ASCII `x`; all receipt delivery paths already reuse this formatter, so no printer-specific layer or duplicate caller fixes are needed.
    blind_spots: A physical printer is unavailable for automated verification; receipt wording/localization and old rows without promotion snapshots must therefore be checked through formatter output and optional-field behavior.
    candidate_causes:
      - code: `buildThermalReceiptText()` hardcodes Unicode `×` and contains no discount-rendering branch.
      - data: Receipt builders and `ReceiptDataSchema` omit persisted payment/order-item discount snapshot fields.
      - environment: The ESC/POS printer decodes raw UTF-8 bytes using a legacy code page.
      - config: The print command selects no explicit code page or charset conversion.
    and_gate: yes — visible discounts require both metadata propagation and rendering; the corrupted quantity glyph requires both Unicode output and a non-UTF-8 printer byte interpretation.
- hypothesis: Implemented; the shared contract now carries persisted snapshots, every receipt builder maps them, and the shared formatter renders them with printer-safe ASCII quantity markers.
- test: Unit and real-Supabase reconstruction checks are green; inspect the complete scoped diff/no-op signal, then stash only production fix files and prove the formatter plus reprint regressions return before reapplying.
- expecting: Diff adds behavior rather than deleting it; both the original formatter test and persisted-data reconstruction test fail with production changes stashed and pass after reapply.
- next_action: Run scoped `git diff --check`/diff review, then perform the production-file-only stash/revert-and-reconfirm gate.
- tdd_checkpoint:
    test_file: src/shared/lib/receipt-format.test.ts
    test_names:
      - uses printer-safe ASCII x separators for unit and weighted item lines
      - prints both a line-item promotion and a sale-level discount
    status: green
    failure_output: "2 failed, 47 passed — expected output to contain `2x Cerveza`; received `2× Cerveza`. Expected a `Promoción ... -$10.00` line; receipt contained no promotion or discount line."
    green_result: "2 test files passed; 92 tests passed, 2 todo. Both original assertions and the zero/absent/schema boundary neighbors passed."

## Evidence

- timestamp: 2026-09-05T17:53:00Z
  checked: `.planning/debug/knowledge-base.md` for semantically related receipt, discount-printing, multiplication-glyph, or encoding resolutions
  found: No prior resolution matches these physical-receipt symptoms; the only discount entry concerns deployed manager authorization and the other entry concerns E2E settings timing.
  implication: No known-pattern hypothesis is available; investigate the live receipt generation and printing path directly.
- timestamp: 2026-09-05T17:55:00Z
  checked: Codebase search for receipt output, discount fields, printer calls, and multiplication characters
  found: `src/shared/lib/receipt-format.ts` constructs receipt item labels with Unicode `×`; `src/shared/lib/pos-printer.ts` sends its lines to Rust `print_receipt`; top-level receipt data supports `discountAmount`, while durable order items separately contain promotion snapshot fields.
  implication: The formatter is the likely shared output boundary for both symptoms, but complete-file tracing is required to confirm data is present and all callers share it.
- timestamp: 2026-09-05T17:57:00Z
  checked: Full `buildThermalReceiptText()` → `receiptDataToPrinterLines()` → Rust `lines_to_esc_pos()` path and every non-test formatter caller
  found: Print, preview, PDF, email, and reprint all share `buildThermalReceiptText()`. Unit and weighted item labels contain Unicode `×`; Rust appends `line.as_bytes()` byte-for-byte after ESC/POS initialization and never selects/transcodes a code page.
  implication: The scan's corrupted quantity separator is generated before printer submission; ASCII `x` at the shared formatter fixes every receipt delivery path without printer-specific machinery.
- timestamp: 2026-09-05T17:58:00Z
  checked: `ReceiptDataSchema`, direct-sale/payment/split-payment receipt builders, reprint reconstruction, migrations, and formatter discount references
  found: `payments` persist ad-hoc `discount_*` and `order_items` persist promotion snapshots, but direct-sale, generic payment, and reprint receipt queries omit those columns; split payment carries only top-level discount metadata; `ReceiptData.items` has no promotion fields; `buildThermalReceiptText()` references no discount field at all.
  implication: Promotion and discount support was implemented for pricing/persistence but never completed through the receipt contract and renderer, explaining why it has never appeared without producing an error.
- timestamp: 2026-09-05T18:00:00Z
  checked: Phase 1.25 SBFL eligibility and common-pattern map
  found: No existing failing receipt test or per-test failing/passing coverage spectrum exists, so SBFL is skipped. Symptoms match Data Shape/API Contract (persisted fields dropped before output) and Encoding Mismatch (UTF-8 bytes interpreted by a legacy ESC/POS code page).
  implication: Treat as a deterministic Bohrbug and use a minimal formatter reproduction before changing implementation.
- timestamp: 2026-09-05T18:03:00Z
  checked: Targeted Vitest run after adding two production-independent formatter regression tests
  found: The file is RED exactly at both reported symptoms: output contains `2× Cerveza`/`0.375kg × Jamón`, and a receipt populated with promotion and sale-discount metadata contains neither `Promoción` nor `Descuento` (2 failed, 47 passed).
  implication: The tests reproduce both defects at the shared formatter boundary and are ready for the TDD green phase.
- timestamp: 2026-09-05T18:16:11Z
  checked: Complete receipt formatter, contract, direct-sale/payment/split-payment builders, reprint reconstruction, persisted SQL semantics, and direct tests before the green edit
  found: `process-split-payment` already maps sale-level payment discounts but not item promotion snapshots; the other three builders omit both. `order_items.discount_amount`/`discount_rate` are durable promotion snapshots and split-payment stores the sale discount only on its first leg.
  implication: A minimal complete fix must touch the shared schema/formatter and each receipt assembly boundary; changing only the formatter would green the synthetic test but leave real receipts without data.
- timestamp: 2026-09-05T18:21:00Z
  checked: Targeted Vitest green run for `receipt-format.test.ts` and `edge-function-contracts.test.ts`
  found: Both files passed (92 passed, 2 todo), including the unchanged original ASCII/promotion assertions and new zero/absent/negative boundary neighbors.
  implication: TDD green is achieved at the shared formatter and contract boundaries without weakening the reproduction.
- timestamp: 2026-09-05T18:23:00Z
  checked: Repository TypeScript check and scoped ESLint on all changed TypeScript paths
  found: `npm run typecheck` passed. ESLint found four `no-unnecessary-type-conversion` violations in the typed reprint mapper; its project service cannot parse the Deno edge-function files because they are not included in the configured TS project.
  implication: Production frontend types are valid; make the mechanical four-line lint cleanup and validate edge files with the repository's Deno path instead of weakening ESLint configuration.
- timestamp: 2026-09-05T18:25:00Z
  checked: Scoped source ESLint after cleanup, Deno runtime/config availability, and mutation tooling availability
  found: Changed `src/` files pass ESLint. No Deno CLI/config or Stryker dependency/config is installed in this repository.
  implication: Edge-function native check and mutation signal must be explicitly skipped as unavailable; typecheck/lint/adjacent tests/revert causality remain applicable.
- timestamp: 2026-09-05T18:27:00Z
  checked: Receipt import-graph unit tests and formatting check
  found: Eight adjacent unit files pass (165 passed, 2 todo), covering printer lines, web preview, PDF, email, payment orchestration, and direct checkout. Prettier reports changed source files need normalization.
  implication: No adjacent caller regression is visible; format the touched source files before the integration and causality gates.
- timestamp: 2026-09-05T18:29:00Z
  checked: Real-Supabase `receipt-reconstruction.integration.test.ts`
  found: All four tests passed against the local stack; the single-tender fixture returned item `discountRate`/`discountAmount` plus top-level `discountScope`/`discountType`/`discountValue`/`discountAmount` exactly as persisted.
  implication: Reprints now preserve both line-item promotion snapshots and sale-level discount metadata from durable rows.

## Eliminated

- hypothesis: The printer chose an unexpected Asian font while receiving a normal ASCII `x`.
  evidence: The TypeScript formatter itself emits U+00D7 `×` (UTF-8 C3 97), and Rust forwards those raw bytes without font or code-page commands; ASCII `x` never reaches the printer.
  timestamp: 2026-09-05T17:57:00Z
- hypothesis: Discounts are absent because checkout never persists them.
  evidence: Current migrations persist ad-hoc discounts on `payments` and promotion snapshots on `order_items`; the loss occurs later in receipt queries/contracts/rendering.
  timestamp: 2026-09-05T17:58:00Z

## Resolution

root_cause:
  - Receipt output support for promotions/ad-hoc discounts was never completed: persisted discount columns are omitted by receipt builders/reconstruction, per-item promotion fields are absent from `ReceiptDataSchema`, and the shared formatter has no discount lines.
  - The shared formatter uses Unicode multiplication sign `×`, while Rust sends UTF-8 bytes directly to ESC/POS without code-page selection/transcoding; the store printer decodes those bytes as unrelated glyphs.
fix:
  - Added optional item-level promotion snapshot fields to `ReceiptDataSchema` and mapped them from `order_items` in direct, generic, split, and reprint receipt assembly.
  - Mapped persisted payment discount metadata into direct, generic, and reprint receipts (split receipts already mapped it).
  - Rendered localized promotion/sale-discount lines and replaced Unicode multiplication glyphs with ASCII `x` in both receipt and pre-cheque output.
verification:
oracle_type: specified — the user explicitly requires ASCII `x` and visible promotion/discount details on the receipt.
files_changed:
  - src/shared/lib/receipt-format.test.ts
  - src/shared/lib/receipt-format.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/edge-function-contracts.test.ts
  - src/shared/lib/i18n/locales/es-MX/receipt.json
  - src/shared/lib/i18n/locales/en-US/receipt.json
  - supabase/functions/process-direct-sale/index.ts
  - supabase/functions/process-payment/index.ts
  - supabase/functions/process-split-payment/index.ts
  - src/entities/payment/model/queries.ts
  - src/entities/payment/model/receipt-reconstruction.integration.test.ts
