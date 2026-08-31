---
spike: 003
idea: bank-transfer-payment-tracking
name: reference-code-design
type: standard
validates: "Given a 6-digit payload + Luhn check digit inside SPEI's 7-digit referencia numerica limit, when a customer or admin mistypes it, then the mistype is almost always caught rather than silently matching the wrong sale"
verdict: VALIDATED
related: [002]
tags: [algorithm, payments, mexico, spei]
---

# Spike 003: Reference Code Design

## What This Validates

Given Spike 002 confirmed SPEI's `referencia numérica` field is capped at 7 digits, numeric only,
and not system-guaranteed unique, when the POS generates a reference code for a pending-transfer
sale, then that code must (a) fit the 7-digit limit, (b) catch common hand-typed transcription
errors so admin doesn't silently confirm the wrong sale, and (c) never collide with another
currently-pending sale's code.

## Research

No external dependency — pure algorithm design. Considered options:

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Random 7 digits, no check | Simple | Zero typo protection — a mistyped digit silently matches nothing, or worse, a coincidentally-valid different sale | Rejected |
| 6-digit payload + Luhn check digit | Industry-standard (credit cards, IMEI), catches 100% single-digit errors + ~90%+ adjacent transpositions, fits 7-digit limit exactly | Doesn't catch the specific 09↔90 transposition (well-documented Luhn blind spot) | **Chosen** |
| 5-digit payload + 2-digit checksum (custom) | Slightly stronger error detection possible | Non-standard, more code, not worth it for a 6-vs-5 digit tradeoff at this volume | Rejected |

**Chosen approach:** Luhn algorithm (mod-10), 6 payload digits + 1 check digit = 7 total. Sample
codes look like `8422818` — short enough to say aloud or type into a phone's transfer app.

## How to Run

```
node reference-code.cjs
```

## What to Expect

`All checks passed.` plus a printed catch-rate summary. No UI — this is a pure data-transformation
question with a binary correctness answer, not something to *feel*.

## Investigation Trail

- Started with plain Luhn (used by credit cards) — verified via brute-force mutation testing
  (every single-digit substitution across 500 generated codes: 27,000 mutations) that it catches
  **100%** of single-digit transcription errors, as expected from the algorithm's mathematical
  guarantee.
- Adjacent-digit transposition (a very common typo — swapping two digits while reading a code off
  a receipt) is Luhn's known weak spot for the specific `09↔90` pair. Rather than assume the
  textbook claim, ran 2,000 random adjacent-swap mutations: **97.3%** caught. Explicitly
  reproduced the `09↔90` blind spot with a targeted test case to confirm the ceiling is real, not
  theoretical — this is documented so a future implementer doesn't over-trust the code as
  typo-proof.
- Added `generateUniqueCode()` against a `pending` set after remembering Spike 002's finding that
  Banxico doesn't guarantee system-wide uniqueness on this field — the POS must self-enforce
  uniqueness among its own open pending-transfer sales (a code can be reused once its sale is
  confirmed/expired, no need for permanent global uniqueness).

## Results

**Verdict: VALIDATED.** 6-digit-payload + Luhn-check-digit is a solid design:
- Fits the 7-digit `referencia numérica` limit exactly.
- Catches 100% of single-digit typos, ~97% of adjacent transpositions.
- Known, accepted gap: `09↔90` transposition slips through (inherent to Luhn) — acceptable given
  the always-manual-tap confirmation policy already decided (a slipped-through wrong match still
  requires admin to eyeball amount + customer name before confirming, per the "always manual tap"
  requirement in MANIFEST.md — the check digit is a typo *catch*, not the sole source of truth).
- `generateUniqueCode()` is ready to drop into Spike 004's state model as the code-issuance step.

**Impact on remaining spikes:** Spike 004 can treat "generate a reference code" as solved — reuse
`reference-code.cjs`'s functions directly rather than re-deriving.
