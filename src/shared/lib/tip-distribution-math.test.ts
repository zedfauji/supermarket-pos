import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { computeTipDistribution } from './tip-distribution-math';

// ============================================================================
// computeTipDistribution — largest-remainder 3-way split (D-02)
//
// Pure function, no I/O. This is the spec oracle for the PL/pgSQL
// implementation in Plan 02: floor + bar + kitchen must ALWAYS equal the
// total to the cent, leftover cents go to the largest-percentage bucket,
// with a deterministic floor > bar > kitchen tiebreak.
// ============================================================================

describe('computeTipDistribution', () => {
  test('zero total tips yields all-zero buckets (Pitfall 5)', () => {
    const result = computeTipDistribution(0, { floorPct: 34, barPct: 33, kitchenPct: 33 });
    expect(result).toEqual({ floor: 0, bar: 0, kitchen: 0 });
  });

  test('evenly divisible split (34/33/33 of 100) sums exactly', () => {
    const result = computeTipDistribution(100, { floorPct: 34, barPct: 33, kitchenPct: 33 });
    expect(result).toEqual({ floor: 34, bar: 33, kitchen: 33 });
  });

  test('repeating-decimal split (33.33/33.33/33.33 of 100): remainder to floor', () => {
    const result = computeTipDistribution(100, {
      floorPct: 33.33,
      barPct: 33.33,
      kitchenPct: 33.33,
    });
    expect(result.floor).toBeCloseTo(33.34, 2);
    expect(result.bar).toBeCloseTo(33.33, 2);
    expect(result.kitchen).toBeCloseTo(33.33, 2);
    expect(result.floor + result.bar + result.kitchen).toBeCloseTo(100, 2);
  });

  test('non-100 config still sums to the full total (D-02 no money lost)', () => {
    const result = computeTipDistribution(100, { floorPct: 50, barPct: 30, kitchenPct: 0 });
    expect(result).toEqual({ floor: 70, bar: 30, kitchen: 0 });
    expect(result.floor + result.bar + result.kitchen).toBe(100);
  });

  test('property: floor+bar+kitchen === totalTips exactly, every bucket >= 0 (arbitrary independent pcts, incl. oversum configs)', () => {
    // D-01 allows floor/bar/kitchen to each be configured independently in
    // [0,100] with no sum-to-100 validation, so this property intentionally
    // includes oversum configs (e.g. 90/90/90 summing to 270%) to prove the
    // sum-preservation + non-negativity invariants hold even in that
    // pathological case (Rule 1 deviation — see computeTipDistribution doc).
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        (totalTips, floorPct, barPct, kitchenPct) => {
          const result = computeTipDistribution(totalTips, { floorPct, barPct, kitchenPct });
          const totalCents = Math.round(totalTips * 100);
          const sumCents = Math.round(result.floor * 100) +
            Math.round(result.bar * 100) +
            Math.round(result.kitchen * 100);
          expect(sumCents).toBe(totalCents);
          expect(result.floor).toBeGreaterThanOrEqual(0);
          expect(result.bar).toBeGreaterThanOrEqual(0);
          expect(result.kitchen).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  test('property: each non-winning bucket equals trunc(total*pct/100) when pcts sum to <= 100 (realistic config)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        fc.integer({ min: 0, max: 100_00 }).map((cents) => cents / 100),
        (totalTips, floorPct, barPct, kitchenPct) => {
          fc.pre(floorPct + barPct + kitchenPct <= 100);
          const result = computeTipDistribution(totalTips, { floorPct, barPct, kitchenPct });
          const totalCents = Math.round(totalTips * 100);
          const sumCents = Math.round(result.floor * 100) +
            Math.round(result.bar * 100) +
            Math.round(result.kitchen * 100);
          expect(sumCents).toBe(totalCents);
          expect(result.floor).toBeGreaterThanOrEqual(0);
          expect(result.bar).toBeGreaterThanOrEqual(0);
          expect(result.kitchen).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  test('property: floor > bar > kitchen tiebreak when pcts are equal (realistic config, remainder is always additive)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_00 }).map((cents) => cents / 100),
        // Cap at 33 so 3x pct never exceeds 100 (keeps the remainder additive,
        // matching the tiebreak's documented additive-remainder scenario).
        fc.integer({ min: 0, max: 33_00 }).map((cents) => cents / 100),
        (totalTips, pct) => {
          // All three buckets share the same pct — remainder must go to floor.
          const result = computeTipDistribution(totalTips, {
            floorPct: pct,
            barPct: pct,
            kitchenPct: pct,
          });
          const totalCents = Math.round(totalTips * 100);
          const floorCents = Math.round(result.floor * 100);
          const barCents = Math.round(result.bar * 100);
          const kitchenCents = Math.round(result.kitchen * 100);
          expect(floorCents + barCents + kitchenCents).toBe(totalCents);
          // floor's cents must be >= bar's and bar's >= kitchen's (remainder favors floor first)
          expect(floorCents).toBeGreaterThanOrEqual(barCents);
          expect(barCents).toBeGreaterThanOrEqual(kitchenCents);
        },
      ),
      { numRuns: 500 },
    );
  });
});
