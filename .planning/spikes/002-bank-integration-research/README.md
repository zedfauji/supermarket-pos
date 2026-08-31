---
spike: 002
idea: bank-transfer-payment-tracking
name: bank-integration-research
type: standard
validates: "Given the store banks with Banorte and others, when researched for MX SPEI/business-API/open-banking integration options, then a clear feasibility verdict on programmatic reconciliation vs. manual reference-code matching is produced"
verdict: PARTIAL
related: []
tags: [research, payments, mexico, spei]
---

# Spike 002: Bank Integration Research (Mexico, multi-bank)

## What This Validates

Given the store banks with Banorte (and others) and admin has explicitly ruled out ever importing
a bank statement into the POS, when the realistic programmatic-reconciliation landscape for
Mexican SPEI transfers is researched, then we get a grounded verdict on whether any automation
beats pure manual reference-code matching — and if so, what it costs to adopt.

Researched via 4 parallel subagents: Banorte-specific business banking APIs, Mexican
SPEI-reconciliation-as-a-product PSPs, multi-bank open-banking aggregators, and SPEI's own
concepto/reference field mechanics.

## Research

### 1. Banorte direct integration — not realistic today

- **Banorte Developer Portal** (developers.banorte.com): free sandbox, but the live API catalog
  currently has exactly one product — an ATM locator. No SPEI/deposit/webhook API exists there.
- **Cobranza Integral** (Banorte Pyme product): issues unique CLABEs per customer, tied to the
  store's own Banorte account — closest fit to "reference per transaction," but reconciliation is
  via periodic file/portal export, not a real-time webhook. Requires a Banorte business account +
  signed services contract, 48–72h activation, relationship-manager-driven onboarding (no
  published self-serve pricing).
- **CEP Interbancario**: lets you look up/validate one received transfer by folio — manual
  spot-check tool, not a feed.
- **Banorte–CONTPAQi integration** (new, ~2026): daily batch download of account movements into
  CONTPAQi accounting software via Banorte's business portal — a genuine near-real-time (daily
  batch) movements feed, but routed through third-party accounting software, not a direct
  bank→POS API.
- **Verdict: feasible with effort, not feasible now.** No instant push notification exists. Any
  Banorte-only path means a business banking contract + batch polling — realistic only if the
  store commits to Banorte as its sole receiving account.

### 2. Mexican SPEI-reconciliation-as-a-product (PSPs) — the actual off-the-shelf answer

This already exists as a product category ("CLABE virtual" / "SPEI referenciado"), and it inherits
Banxico's SPEI interbank rail — so it receives transfers from **any** Mexican bank, not just one.
No per-bank integration needed.

| Provider | Mechanism | Coverage | Cost | Fit for 1 store |
|---|---|---|---|---|
| **Conekta** | Unique/recurring CLABE per sale, webhook + dashboard, refund via SPEI | Any MX bank (SPEI) | $12.50 MXN + IVA per successful transfer (flat) | **Good** — self-serve, published pricing |
| **Clip (PayClip)** | Documented `/payments` SPEI API, unique CLABE + concept code per txn, 15-min window | Any MX bank | Not publicly disclosed | **Good** — brand small MX retailers already trust |
| Openpay (BBVA) | "Any bank" transfers, auto-reconciliation into back-office | Any MX bank | Unclear, BBVA sales-led | Fair — needs a sales call |
| STP | Wholesale rail most of the above sit on | Any MX bank | KYC/compliance-heavy | Poor — infra-grade, not small-merchant |
| Bitso Business / Kushki / Arcus | Same virtual-CLABE pattern | Any MX bank | Enterprise/dev-resourced | Poor — pitched above single-store scale |

**Chosen framing:** Conekta or Clip are the realistic near-term automation path if/when the store
wants to eliminate manual matching entirely — flat low per-transaction fee, self-serve signup,
webhook marks the sale paid automatically. This is a bigger decision (adds an external processor,
a fee per transfer, and a dependency) — flagged as a **future upgrade path**, not this spike round.

### 3. Multi-bank open-banking aggregators (Belvo, Fintoc, Finerio, Prometeo) — feasible, not justified yet

- Mexico has **no live mandated open-banking API** for transaction data — the Ley Fintech
  secondary regulation covering transactional data is years overdue (an amparo injunction was
  filed against CNBV/Banxico/SHCP over the delay, Jan 2026). Every aggregator gets data via
  credential-based access to bank web/apps, not a regulated interface.
- Belvo and Fintoc are the strongest MX-specific candidates (business-account support,
  transaction-level data, Fintoc has webhooks for payment events) — but pricing is enterprise
  sales-led (one third-party estimate: Belvo subscriptions from ~$1,000 USD/mo), and neither could
  be confirmed to explicitly list Banorte in a public bank-coverage list.
- Plaid does not cover Mexico at all.
- **Verdict: feasible with effort, not realistic for this business size** — cost and reliance on
  unregulated credential-based access don't pencil out for a single store's transaction volume.

### 4. SPEI's own reference fields — the real near-term design lever

- **Concepto** (concept/memo): up to ~40 characters, freeform, definitely user-editable in every
  major bank's app (BBVA's own consumer education confirms this). Risk: concepto text is actively
  scanned by receiving institutions' fraud/UIF systems — a real MX news report (Apr 2026) describes
  accounts getting blocked over jokey/suspicious concepto phrasing. Not a reason to avoid it, but a
  reason to avoid natural-language codes.
- **Referencia numérica**: a *separate*, Banxico-standard SPEI field — up to **7 digits, numeric
  only**, explicitly designed by Banxico for sender-chosen reconciliation identifiers ("fácil
  recordar," for exactly the disputes/reconciliation case this spike is solving). This is the field
  Mexican SPEI-referenciado business products (e.g. Mercado Pago's) build on. Not guaranteed unique
  by the system — a freeform digit field the payer types — so collisions across different payers
  remain possible without also checking amount/date, consistent with the "always manual tap"
  decision already made for this idea.
- Distinct from **clave de rastreo** (tracking key) — bank-generated, up to 30 alphanumeric chars,
  unique per transfer, useful for a *dispute/support* lookup but not something a customer can
  choose ahead of time, so not usable as our reference code.
- Not confirmed whether every bank's app exposes the numeric referencia field for a plain
  CLABE-to-CLABE transfer (vs. only for registered SPEI-referenciado business collectors) — concepto
  is the more universally-available fallback.

## What to Expect

No code artifact for this spike — it's a research/feasibility question, verdict is the deliverable.

## Investigation Trail

Ran 4 parallel research agents rather than sequentially, per explicit user request given the store
manages multiple banks. Banorte-specific and open-banking-aggregator findings converged
independently on the same conclusion: no live push-API exists in Mexico for this yet, at any bank
or via any regulated interface. The PSP research (Conekta/Clip) and the SPEI-field-mechanics
research together surfaced the more useful finding: Banxico already standardized a
reconciliation-purpose field (referencia numérica) that fits a hand-typed digit code, independent
of whether the store ever adopts a paid PSP integration.

## Results

**Verdict: PARTIAL.**

- **No feasible "free/simple" instant automation exists today** — direct Banorte integration is
  batch/contract-driven, open-banking aggregators are unregulated and enterprise-priced, ruling out
  a low-effort automated path for this spike round.
- **A real automated path does exist and is realistic to adopt later**: Conekta or Clip's SPEI-CLABE
  product, at a flat ~$12.50 MXN/txn (Conekta), self-serve, works across every MX bank via SPEI
  itself. Recommended as a documented future upgrade, not built now — it changes the payment
  collection model (unique CLABE per sale instead of the store's single account) and adds an
  external dependency, which is a bigger decision than this spike round covers.
- **For the near-term manual-reconciliation build**: use Banxico's own **referencia numérica**
  field (≤7 digits) as the primary target for the POS-generated reference code — it's the
  standard-designed field for this exact purpose — with concepto (40 chars) as fallback when a
  customer's bank doesn't expose the numeric field for a plain transfer. Avoid natural-language
  phrasing in any concepto-based code (fraud-filter risk); keep it strictly numeric/alphanumeric.

**Impact on remaining spikes:** confirms spike 004 (transfer-payment-state-model) should design the
reference code as numeric-first (fits referencia numérica), and confirms the "always manual
tap-to-confirm" decision already made is the right MVP shape — no auto-match spike needed, since no
automated transaction feed is realistically available yet.
