---
sketch: 001
name: pos-redesign-directions
question: "Which of 5 full-system visual directions should the POS redesign commit to?"
winner: null
tags: [layout, home, checkout, payment, receipt, redesign-spike]
---

# Sketch 001: POS Redesign Directions

## Design Question
Current POS (Home dashboard, checkout/cart, payment, receipt) reads as generic/bland.
Which of 5 genuinely distinct visual+structural directions should the redesign commit to?
Not a palette exercise — each variant differs in layout density, component shape,
typography system, and interaction weight, not just color.

## How to View
Open `.planning/sketches/001-pos-redesign-directions/index.html` in a browser.
Top bar switches between the 5 directions. Within each, a screen-tab bar switches
Home → POS/Checkout → Payment → Receipt. Cart quantity steppers, tender selection,
and "Complete Sale" → Receipt are functional (fake data, real interaction loop).

## Variants
- **A: Tactile Big-Touch Retail** — large physical-feeling tiles/buttons (min 44-56px+),
  warm amber accent, heavy rounding, big shadows, icon+label pairing. Kiosk feel.
- **B: Data-Dense Pro Terminal** — cashier power-user optimized: table-based product list
  (not cards), monospace accents, keyboard-shortcut hints (F1-F12), thin borders, tight
  spacing, near-black charcoal palette. Speed over whitespace.
- **C: Card-Based Modern SaaS** — soft elevated rounded cards, gradient accents, generous
  gaps, greeting header, pill-shaped controls. shadcn-native dashboard polish.
- **D: Minimal / Editorial** — serif headline pairing, hairline dividers, near-mono muted
  palette with one accent, list-based product view (no cards/emoji), typographic hierarchy
  carries the design instead of chrome.
- **E: Bold Neo-Brutalist** — thick black borders, hard offset shadows (no blur), high
  contrast black/yellow/red/cyan blocks, oversized uppercase type, torn-edge receipt.

## Consistency Spine (baked into the markup, not just described)
Every variant scopes its own CSS custom-property token set (`--bg`, `--surface`, `--text`,
`--primary`, `--accent`, `--border`, `--radius`, `--shadow`) on its root `#v-*` selector —
directly mirroring this repo's shadcn `--primary`/`--radius` CSS-var theming approach
(`ui.shadcn.com/docs/theming`). Shared structural classes (`.tile`, `.product-card`,
`.cart-panel`, `.tender-btn`, `.receipt`, etc.) are reused across all 5 and all 4 screens
within a variant — only token values and a handful of per-variant structural overrides
change. That's the intended mapping to real implementation: swap the token block +
extend the existing `touchSize`/`focusEmphasis` CVA variants on `Button`/`POSButton`,
don't rebuild each screen from scratch.

All 5 variants render the identical sample cart (Tata Salt, Basmati Rice, Amul Ghee,
$28.62 total) so the only variable being judged is the design system, not the data.

## What to Look For
- Does the direction still feel legible/fast at a glance mid-rush (this is a real
  checkout flow, not a marketing page)?
- Do touch targets read as comfortably tappable (44-56px+) in each direction?
- Which direction's Home dashboard scales cleanly to 8 nav tiles without feeling cramped
  or sparse?
- Which receipt/payment screens would still look right printed/exported, not just on
  glass?
- Cherry-picking across directions is fine — e.g. "B's product table + A's payment
  keypad" — call it out and I'll build a synthesis variant.
