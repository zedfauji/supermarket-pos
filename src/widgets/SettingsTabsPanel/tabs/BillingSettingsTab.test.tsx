import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsyncMock, toastErrorMock, toastSuccessMock, mockSettingsData } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  // Stable object reference — useEffect([data, ...]) fires on every render if data is recreated
  mockSettingsData: {
    billing: {
      taxRatePercent: 16,
      paymentMethods: { cash: true, bbvaCard: true, rappi: true },
      firstHourMode: 'prorated' as const,
      taxInclusive: true,
    },
    paymentLabels: { cash: 'Efectivo', card: 'Terminal BBVA', rappi: 'Rappi' },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('@entities/settings', () => ({
  useSettings: () => ({ data: mockSettingsData }),
  useMutationUpdateSetting: () => ({
    mutateAsync: mutateAsyncMock,
    mutate: mutateAsyncMock,
    isPending: false,
  }),
}));

import { BillingSettingsTab } from './BillingSettingsTab';

describe('BillingSettingsTab', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('keeps local form state when save fails', async () => {
    mutateAsyncMock.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Save failed' },
    });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    const taxInput = screen.getByLabelText('Tax rate (IVA %)');
    await user.clear(taxInput);
    await user.type(taxInput, '20');
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    expect(toastErrorMock).toHaveBeenCalledWith('Save failed');
    expect(screen.getByLabelText('Tax rate (IVA %)').getAttribute('value')).toBe('20');
  });

  it('renders Prorated and Full Hour option buttons', () => {
    render(<BillingSettingsTab currentRole="manager" />);

    expect(screen.getByRole('button', { name: /Prorated/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Full Hour/i })).toBeInTheDocument();
  });

  it('renders a taxInclusive toggle reflecting the live settings value', () => {
    render(<BillingSettingsTab currentRole="manager" />);

    expect(screen.getByRole('button', { name: /Included|Tax included/i })).toBeInTheDocument();
  });

  it('clicking the taxInclusive toggle then Save Billing shows a confirmation before saving (WR-03)', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Included/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    // Changing taxInclusive is a store-wide price reinterpretation — the
    // mutation must NOT fire until the confirmation is accepted.
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Change how tax applies to every price?')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'billing',
        value: expect.objectContaining({ taxInclusive: false }),
      })
    );
  });

  it('cancelling the taxInclusive confirmation dialog does not save', async () => {
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Included/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('toggling taxInclusive on, off, then on again then saving calls mutation with taxInclusive: true', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Included/i }));
    await user.click(screen.getByRole('button', { name: /Added at checkout/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'billing',
        value: expect.objectContaining({ taxInclusive: true }),
      })
    );
  });

  it('clicking Full Hour button then Save Billing calls mutation with firstHourMode: full', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Full Hour/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'billing',
        value: expect.objectContaining({ firstHourMode: 'full' }),
      })
    );
  });

  it('clicking Full Hour then Prorated then Save calls mutation with firstHourMode: prorated', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Full Hour/i }));
    await user.click(screen.getByRole('button', { name: /Prorated/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    expect(mutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'billing',
        value: expect.objectContaining({ firstHourMode: 'prorated' }),
      })
    );
  });

  it('saves successfully with toast on successful mutation', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();

    render(<BillingSettingsTab currentRole="manager" />);

    await user.click(screen.getByRole('button', { name: /Full Hour/i }));
    await user.click(screen.getByRole('button', { name: 'Save Billing' }));

    expect(toastSuccessMock).toHaveBeenCalledWith('Billing settings saved.');
  });
});
