import { describe, expect, it } from 'vitest';
import { BillingSettingsSchema } from './domain';

describe('BillingSettingsSchema firstHourMode', () => {
  it('defaults firstHourMode to prorated', () => {
    const result = BillingSettingsSchema.parse({
      taxRatePercent: 16,
      defaultTipPercentages: [10, 15],
      paymentMethods: { cash: true, bbvaCard: true, rappi: true },
    });
    expect(result.firstHourMode).toBe('prorated');
  });

  it('accepts full mode', () => {
    const result = BillingSettingsSchema.parse({
      taxRatePercent: 16,
      defaultTipPercentages: [10, 15],
      paymentMethods: { cash: true, bbvaCard: true, rappi: true },
      firstHourMode: 'full',
    });
    expect(result.firstHourMode).toBe('full');
  });

  it('accepts prorated mode explicitly', () => {
    const result = BillingSettingsSchema.parse({
      taxRatePercent: 16,
      defaultTipPercentages: [10, 15],
      paymentMethods: { cash: true, bbvaCard: true, rappi: true },
      firstHourMode: 'prorated',
    });
    expect(result.firstHourMode).toBe('prorated');
  });

  it('rejects invalid firstHourMode', () => {
    expect(() =>
      BillingSettingsSchema.parse({
        taxRatePercent: 16,
        defaultTipPercentages: [],
        paymentMethods: { cash: true, bbvaCard: true, rappi: true },
        firstHourMode: 'half',
      })
    ).toThrow();
  });
});
