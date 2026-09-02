---
title: Batch/lot-level expiry tracking
trigger_condition: When the business needs per-shipment/lot expiry precision (e.g. two receivings of the same product with different expiry dates both in stock) — for FEFO (first-expire-first-out) stock rotation, or for expiry-proximity discounts to target the correct specific lot instead of the product's single current expiry_date.
planted_date: 2026-09-01
---

# Batch/lot-level expiry tracking

During `/gsd-explore` for Phase 25 (Promotions & Discount Management), research confirmed `inventory.expiry_date` is a single column per `product_id` — a new `receive_shipment` call overwrites the prior expiry date (`ON CONFLICT (product_id) DO UPDATE SET ... expiry_date = EXCLUDED.expiry_date`, `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql:94-99`). There is no batch/lot table anywhere in the schema.

The user's original ask ("if a batch of product will expire in 2 weeks, give them a discount") implied batch-level precision, but explicitly deferred it: "Keep per-product expiry but keep batch/lot tracking in future planning so that it won't be forgotten." Phase 25 ships expiry-proximity discounts keyed off the existing single `expiry_date`, not per-batch.

**When this trigger fires**, revisit:

- A `product_batches`/`inventory_lots` table (product_id, expiry_date, quantity_received, received_at, supplier_shipment_id) replacing or supplementing the single `inventory.expiry_date` column.
- FEFO consumption logic at checkout (which lot's stock decrements first) — currently checkout only decrements a single `inventory.quantity`, with no lot selection.
- How Phase 25's expiry-proximity promotion (PROMO-02) would need to re-target: from "product's current expiry_date" to "this specific batch's expiry_date," including how a sale would need to record which lot was actually sold (for the same audit/margin reasons PROMO-06 already established at the product level).
- Whether `receive_shipment`'s upsert-overwrite behavior needs to become insert-a-new-lot instead — a bigger change to the supplier-receiving RPC than the discount engine itself.
