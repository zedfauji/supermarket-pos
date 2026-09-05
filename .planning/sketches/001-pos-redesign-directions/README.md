---
sketch: 001
name: pos-redesign-directions
question: "Which of 5 full-system visual directions should the POS redesign commit to?"
winner: null
tags: [layout, home, checkout, payment, receipt, redesign-spike]
---

# Sketch 001: POS Redesign Directions (v3)

## Design Question
Current POS (Home dashboard, checkout/cart, payment, receipt) reads as generic/bland.
Which of 5 genuinely distinct visual+structural directions should the redesign commit to?

**Revision history:** v1 was rejected as generic AI-template output (emoji icons, flat
boxy cards, no real motion). v2 fixed icons/type/motion but was still built from generic
component libraries (motion-primitives, cult-ui), not real POS software — still didn't
read as professional. v3 (current) is grounded in actual real-product screenshots
researched on Dribbble, not invented from aesthetic adjectives.

## Real references used (Dribbble, checked live in-browser)
- **[Green Grounds Coffee POS](https://dribbble.com/shots/25471101) — SlabPixel** (80.4k views): category
  cards with status pills ("Available"/"Need to re-stock"), circular product-photo tiles
  with a quantity badge overlay + circular add(+) button, Dine In/Takeaway ticket header,
  order list with modifier subtext, sage-green/cream palette. → drove the product-card and
  category-pill patterns used in all 5 variants.
- **[Register POS iPad app](https://dribbble.com/shots/26305682) — Robin Holesinsky** (109k views,
  PRO+): category pill tabs with underline, client-avatar order rows, full-width pill
  "Charge $X" bar, near-black + single saturated accent. → drove the pill ticket/charge
  button and restrained single-accent palette discipline.
- **[PayPoint POS Dashboard](https://dribbble.com/shots/22350932) — Hatypo Studio**: persistent
  left icon-sidebar (not a full-page tile launcher), numbered step progress, status-colored
  pill badges. → drove the sidebar-shell IA that replaced v1/v2's big-box tile-grid Home.
- **[POS Webapp 2024](https://dribbble.com/shots/24920302) — Turja Sen Das Partho**: stat cards +
  line chart + avatar/status transaction list dashboard. → drove the Home screen becoming a
  real stat-card dashboard instead of a nav-only icon grid.

No real GitHub POS repo cleared the bar as genuine prior art (checked via `gh api`
search — nothing past ~1,000 stars, nothing award-quality); the credible references were
all on Dribbble, from designers with real client/product context.

## How to View
Open `.planning/sketches/001-pos-redesign-directions/index.html` in a browser.
Top bar switches between the 5 directions. Each has a persistent left sidebar (Home,
Checkout, Inventory, Suppliers, Staff, Reports, Payments, Settings) — click to switch
screens within that variant. Category pills filter the product grid (functional). Product
tiles: click to add (quantity badge increments, toast confirms). Cart quantity steppers,
tender selection, and "Complete Sale" → Receipt are all functional with real running-total
math (animated/counting, not instant-snap).

## Variants
- **A: Tactile Big-Touch Retail** — warm amber on near-black, heavy rounding, large
  circular product tiles, kiosk-tactile feel. Spanish-language chrome (matches this app's
  es-MX default locale).
- **B: Data-Dense Pro Terminal** — near-black charcoal, monospace (IBM Plex Mono),
  keyboard-shortcut hints (F1–F12), terse lowercase system-log voice, sharp 4-6px radii.
- **C: Structured SaaS Backoffice** — clean light theme (white/very-light-gray), single
  violet accent, soft shadows — the closest of the 5 to a real modern B2B SaaS dashboard
  (Stripe/Linear-adjacent). Note this is the first *light-theme* direction offered; prior
  rounds defaulted to dark-only.
- **D: Minimal / Editorial** — serif (Fraunces) + sans pairing, hairline dividers, list
  instead of a grid for products, near-mono muted palette with one accent.
- **E: Bold Neo-Brutalist** — thick black borders, hard offset shadows, yellow/black/red/
  cyan, oversized uppercase Archivo Black/Space Grotesk. Deliberately not grounded in a
  real POS reference (none exist in this style) — a distinctive creative swing, not a
  "this is how real POS software looks" claim.

## Consistency Spine (baked into the markup, not just described)
Every variant scopes its own CSS custom-property token set (`--bg`, `--surface`, `--text`,
`--primary`, `--accent`, `--border`, `--radius`) on its root `#v-*` selector — mirrors this
repo's shadcn `--primary`/`--radius` CSS-var theming (`ui.shadcn.com/docs/theming`). All 5
variants share one JS-driven template (`variantHTML()` in the sketch's `<script>`) — same
DOM structure, sidebar, screens, and interaction logic — only the per-variant token/label
object differs. That maps directly onto real implementation: swap the token block + extend
this repo's existing `touchSize`/`focusEmphasis` CVA variants on `Button`/`POSButton`,
don't rebuild each screen from scratch.

All 5 variants render the identical sample cart and stat data so the only variable being
judged is the design system, not the content.

## What to Look For
- Does the sidebar-shell IA (vs. the old full-page tile-launcher Home) feel like a real
  back-office tool you'd trust with money?
- Does the category-pill + circular product-tile pattern actually speed up scanning a
  product list, or does it feel like overhead for a small grocery catalog?
- C is the only light-theme option — does dark-mode-by-default (this app's current
  convention) still win, or does a light checkout screen actually read as more
  "professional POS" the way the real references skewed?
- Cherry-picking across directions is fine — e.g. "C's light dashboard + A's checkout
  density" — call it out and I'll build a synthesis variant.
