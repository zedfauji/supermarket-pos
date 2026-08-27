---
title: Roll out barcode-scan product peek window beyond /pos
trigger_condition: After v1.4 (Phase 18) ships and the peek window has been used in daily /pos checkout for a while — extend the same scan-triggered peek window to other screens (e.g. /inventory, /suppliers receiving) where a quick barcode lookup would help.
planted_date: 2026-08-26
---

# Roll out barcode-scan product peek window beyond /pos

During `/gsd-explore` for the initial peek-window feature, the user confirmed v1 scope is `/pos`-only but explicitly said the same overlay/window "could be used elsewhere where its required" later.

**When this trigger fires**, revisit:

- Which non-POS screens actually want scan-to-peek (inventory lookup while stocking shelves? supplier receiving to double-check a line item?).
- Whether "Add to Cart" needs a different primary action per screen (e.g. "Add to shipment line item" on `/suppliers` receiving) or whether the window becomes read-only-plus-close outside `/pos`.
- Global scan-listener conflicts: `/pos` already has its own scan-to-search behavior; other screens may or may not want a competing global listener active simultaneously.
