import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStaffList } from '@entities/staff/model/queries';
import { renderWithProviders } from '@shared/lib/test-utils';

import { ManagerPinDialog } from './ManagerPinDialog';

vi.mock('@entities/staff/model/queries', () => ({
  useStaffList: vi.fn(),
}));

const mockManager = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Test Manager',
  email: 'manager@example.com',
  role: 'manager' as const,
  pin: '789012',
  isActive: true,
};

const mockCashier = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  name: 'Test Cashier',
  email: 'cashier@example.com',
  role: 'cashier' as const,
  pin: '123456',
  isActive: true,
};

describe('ManagerPinDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useStaffList).mockReturnValue({
      data: [mockCashier, mockManager],
      isIdleOrLoading: false,
    } as ReturnType<typeof useStaffList>);
  });

  function renderDialog(
    overrides: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      onSuccess?: () => void;
    } = {}
  ) {
    const onOpenChange = overrides.onOpenChange ?? vi.fn();
    const onSuccess = overrides.onSuccess ?? vi.fn();
    renderWithProviders(
      <ManagerPinDialog
        open={overrides.open ?? true}
        onOpenChange={onOpenChange}
        requiredAction="view_reports"
        onSuccess={onSuccess}
      />
    );
    return { onOpenChange, onSuccess };
  }

  it('renders dialog with title when open', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Manager Access Required')).toBeInTheDocument();
    expect(within(dialog).getByText(/A manager or admin PIN is required/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('entering correct manager PIN calls onSuccess', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    const dialog = screen.getByRole('alertdialog');
    for (const ch of '789012') {
      await user.click(
        within(dialog).getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` })
      );
    }

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  // Phase 27 Plan 08 (G-27-13): onSuccess widened from () => void to
  // (staff: Staff) => void — callers need to know WHICH staff matched so
  // they can thread that staff's PIN to a server-side re-verification.
  it('entering correct manager PIN calls onSuccess with the matched staff object', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    const dialog = screen.getByRole('alertdialog');
    for (const ch of '789012') {
      await user.click(
        within(dialog).getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` })
      );
    }

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockManager);
    });
  });

  it('entering cashier PIN does not grant access — shows error', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByRole('alertdialog');
    for (const ch of '123456') {
      await user.click(
        within(dialog).getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` })
      );
    }

    await waitFor(() => {
      expect(within(dialog).getByText(/Incorrect PIN/i)).toBeInTheDocument();
    });
  });

  it('resets pin and error when dialog closes and reopens', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    const dialog = screen.getByRole('alertdialog');
    // Enter wrong PIN to trigger error
    for (const ch of '123456') {
      await user.click(
        within(dialog).getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` })
      );
    }
    await waitFor(() => {
      expect(within(dialog).getByText(/Incorrect PIN/i)).toBeInTheDocument();
    });

    // Close via Cancel
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows disabled keypad while staff list is loading', () => {
    vi.mocked(useStaffList).mockReturnValue({
      data: undefined,
      isIdleOrLoading: true,
    } as ReturnType<typeof useStaffList>);

    renderDialog();

    const dialog = screen.getByRole('alertdialog');
    // All digit buttons should be disabled during loading
    const key1 = within(dialog).getByRole('button', { name: 'Key 1' });
    expect(key1).toBeDisabled();
  });
});
