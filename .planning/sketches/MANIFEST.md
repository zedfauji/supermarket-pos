# Sketch Manifest

## Design Direction
POS UI currently reads as bland/generic. Redesign spike surveying 5 genuinely distinct
full-system visual directions (layout, density, typography, component shape — not palette
swaps) across the highest-impact flow: Home dashboard → checkout/cart → payment → receipt.
Grounded in this repo's actual stack (Tauri2/React19/Tailwind/shadcn, dark-mode default,
44-56px kiosk touch targets) so whichever direction wins is buildable via shadcn CSS-var
theming + this repo's existing CVA variant pattern (`touchSize`/`focusEmphasis` on
`Button`/`POSButton`), not just a static mock.

## Reference Points
No verified named GitHub POS-UI repos found (web search only returned generic topic-index
pages, not real repos worth citing — see research disposition in conversation). Grounded
instead in platform touch-target norms (Apple HIG 44×44pt, Material 48×48dp) and this
repo's own established consistency tooling (shadcn theming, CVA, Storybook/Playwright
visual regression already in `e2e/visual/`).

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | pos-redesign-directions | Which of 5 full-system visual directions should the POS redesign commit to? | null | layout, home, checkout, payment, receipt, redesign-spike |
