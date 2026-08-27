/**
 * Unit tests for HardwareSettingsTab — broker-submission failure-class toast
 * copy (Phase 19: Store-Local Durable Printing Service).
 *
 * Covers: runTestPrint / runOpenDrawer both routing through the shared
 * mapErrorToCopyKey helper — PRINT_BROKER_UNREACHABLE and PRINT_JOB_REJECTED
 * show their locked common:printJobError.* copy, while any other
 * AppErrorCode falls back to the raw result.error.message (today's
 * pre-existing behavior, preserved).
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openCashDrawer, testPrint } from '@shared/lib/pos-printer';
import { err, ok } from '@shared/lib/result';
import { renderWithProviders } from '@shared/lib/test-utils';

import { HardwareSettingsTab } from './HardwareSettingsTab';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@shared/lib/pos-printer', () => ({
  testPrint: vi.fn(),
  openCashDrawer: vi.fn(),
}));

vi.mock('@entities/settings', () => ({
  useReceiptSettings: () => ({ data: undefined }),
  useMutationUpdateReceiptSettings: () => ({ mutate: vi.fn() }),
}));

describe('HardwareSettingsTab — printJobError copy mapping', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(testPrint).mockReset();
    vi.mocked(openCashDrawer).mockReset();
    vi.mocked(testPrint).mockResolvedValue(ok({ jobId: 'x' }));
    vi.mocked(openCashDrawer).mockResolvedValue(ok({ jobId: 'x' }));
  });

  it('shows the translated brokerUnreachable copy on Test Print (not the raw message)', async () => {
    const user = userEvent.setup();
    vi.mocked(testPrint).mockResolvedValue(
      err({ code: 'PRINT_BROKER_UNREACHABLE', message: 'raw' })
    );
    renderWithProviders(<HardwareSettingsTab currentRole="admin" />);

    await user.click(screen.getByRole('button', { name: 'Test Print' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Print service unavailable — check that the print broker is running.'
    );
  });

  it('shows the translated rejected copy on Test Print (not the raw message)', async () => {
    const user = userEvent.setup();
    vi.mocked(testPrint).mockResolvedValue(err({ code: 'PRINT_JOB_REJECTED', message: 'raw' }));
    renderWithProviders(<HardwareSettingsTab currentRole="admin" />);

    await user.click(screen.getByRole('button', { name: 'Test Print' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Printer rejected this job. Check the printer name in Settings and try again.'
    );
  });

  it('shows the same brokerUnreachable copy on Open Cash Drawer (shared mapErrorToCopyKey)', async () => {
    const user = userEvent.setup();
    vi.mocked(openCashDrawer).mockResolvedValue(
      err({ code: 'PRINT_BROKER_UNREACHABLE', message: 'raw' })
    );
    renderWithProviders(<HardwareSettingsTab currentRole="admin" />);

    await user.click(screen.getByRole('button', { name: 'Open Cash Drawer' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Print service unavailable — check that the print broker is running.'
    );
  });

  it('falls back to the raw message for a non-print AppErrorCode', async () => {
    const user = userEvent.setup();
    vi.mocked(testPrint).mockResolvedValue(err({ code: 'NETWORK_OFFLINE', message: 'offline raw' }));
    renderWithProviders(<HardwareSettingsTab currentRole="admin" />);

    await user.click(screen.getByRole('button', { name: 'Test Print' }));

    expect(toast.error).toHaveBeenCalledWith('offline raw');
  });
});
