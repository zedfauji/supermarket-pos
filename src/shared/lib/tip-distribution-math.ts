/**
 * computeTipDistribution — pure largest-remainder 3-way split (D-02).
 *
 * Spec oracle for the PL/pgSQL implementation in Plan 02 (close_caja_session
 * RPC extension). Implemented in integer cents to avoid float drift:
 *
 * 1. Convert totalTips to integer cents.
 * 2. Truncate each bucket to floor(totalCents * pct / 100) (Math.trunc is
 *    equivalent to floor for non-negative values — tips are always >= 0).
 * 3. Assign the FULL remainder (totalCents - sum of truncated buckets) to
 *    the bucket with the largest configured percentage, breaking ties in
 *    floor > bar > kitchen order.
 *
 * This guarantees floor + bar + kitchen === totalTips exactly, to the cent,
 * regardless of whether the configured percentages sum to 100 (D-02: no tip
 * money is ever lost or gained).
 *
 * Deviation (Rule 1 — bug fix): D-01 allows percentages to be configured
 * independently in [0,100] with no sum-to-100 validation, which means the
 * naive "add the whole remainder to the largest bucket" step can go negative
 * when the three percentages sum well over 100 (e.g. 90/90/90). A negative
 * bucket would violate the `MoneySchema.nonnegative()` constraint on
 * `TipDistributionEntrySchema.floorAmount/barAmount/kitchenAmount` (Task 1),
 * so when the remainder is negative (oversum case) it is drawn down from
 * buckets in floor > bar > kitchen priority order, clamping each at 0 and
 * cascading any leftover deficit to the next bucket in priority order. The
 * common case (percentages summing at or near 100, remainder is a small
 * positive number of leftover cents) is unaffected — this only changes
 * behavior for the pathological oversum case.
 */

export interface TipDistributionResult {
  floor: number;
  bar: number;
  kitchen: number;
}

export interface TipDistributionConfigInput {
  floorPct: number;
  barPct: number;
  kitchenPct: number;
}

type BucketKey = 'floor' | 'bar' | 'kitchen';

function priorityOrder(config: TipDistributionConfigInput): BucketKey[] {
  const buckets: Array<{ key: BucketKey; pct: number; rank: number }> = [
    { key: 'floor', pct: config.floorPct, rank: 0 },
    { key: 'bar', pct: config.barPct, rank: 1 },
    { key: 'kitchen', pct: config.kitchenPct, rank: 2 },
  ];
  // Largest pct first; ties broken by rank (floor > bar > kitchen).
  buckets.sort((a, b) => b.pct - a.pct || a.rank - b.rank);
  return buckets.map((b) => b.key);
}

export function computeTipDistribution(
  totalTips: number,
  config: TipDistributionConfigInput,
): TipDistributionResult {
  const { floorPct, barPct, kitchenPct } = config;

  const totalCents = Math.round(totalTips * 100);

  const cents: Record<BucketKey, number> = {
    floor: Math.trunc((totalCents * floorPct) / 100),
    bar: Math.trunc((totalCents * barPct) / 100),
    kitchen: Math.trunc((totalCents * kitchenPct) / 100),
  };

  const remainderCents = totalCents - (cents.floor + cents.bar + cents.kitchen);
  const order = priorityOrder(config);

  if (remainderCents > 0) {
    // Undersum (or exact) case: give the full leftover to the largest bucket.
    const winner = order[0];
    if (winner) {
      cents[winner] += remainderCents;
    }
  } else if (remainderCents < 0) {
    // Oversum case: draw down the deficit starting from the largest bucket,
    // clamping each at 0 and cascading any leftover to the next bucket, so
    // no bucket ever goes negative while the total is still preserved exactly.
    let deficit = -remainderCents;
    for (const key of order) {
      if (deficit <= 0) break;
      const take = Math.min(cents[key], deficit);
      cents[key] -= take;
      deficit -= take;
    }
  }

  return {
    floor: cents.floor / 100,
    bar: cents.bar / 100,
    kitchen: cents.kitchen / 100,
  };
}
