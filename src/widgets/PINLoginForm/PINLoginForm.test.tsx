import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoginUiStore } from '@entities/staff/model/loginUiStore';
import * as staffQueries from '@entities/staff/model/queries';
import { useStaffStore } from '@entities/staff/model/store';
import { mockStaff } from '@entities/staff/model/types';
import type { Shift } from '@shared/lib/domain';
import { ok, err } from '@shared/lib/result';
import { PINLoginForm } from './PINLoginForm';

vi.mock('@entities/staff/model/queries', async importOriginal => {
  const actual = await importOriginal();
  return Object.assign({}, actual, { useMutationClockIn: vi.fn() });
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Overrides the global @shared/lib/supabase mock (src/shared/lib/test-setup.ts) for
// this file so the forced_pin_change tests can control signInWithPassword/updateUser/rpc.
const { mockSignInWithPassword, mockUpdateUser, mockRpc } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
  mockUpdateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  mockRpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      signInWithPassword: mockSignInWithPassword,
      updateUser: mockUpdateUser,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: mockRpc,
  },
}));

const shiftOk: Shift = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  staffId: mockStaff[0]!.id,
  clockIn: new Date(),
  clockOut: null,
  openingCash: 50,
  closingCash: null,
};

const staffMustChangePin = {
  ...mockStaff[0]!,
  id: '33333333-3333-3333-3333-333333333333',
  pin: '111111',
  mustChangePin: true,
};

function renderLoginForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PINLoginForm />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PINLoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStaffStore.getState().logout();
    useLoginUiStore.getState().clearSelection();
    useLoginUiStore.getState().setSelectedStaff(mockStaff[0]!);
  });

  it('after successful PIN and opening cash, logs into staffStore and clears login UI selection', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(ok(shiftOk));
    vi.mocked(staffQueries.useMutationClockIn).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof staffQueries.useMutationClockIn>);

    const user = userEvent.setup();
    renderLoginForm();

    for (const d of ['1', '2', '3', '4', '5', '6'] as const) {
      await user.click(screen.getByRole('button', { name: `Key ${d}` }));
    }

    await waitFor(() => {
      expect(
        screen.getByText(
          'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
        )
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Start shift' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        staffId: mockStaff[0]!.id,
        openingCash: 0,
      });
    });

    await waitFor(() => {
      const { currentStaff, currentShift, isAuthenticated } = useStaffStore.getState();
      expect(isAuthenticated).toBe(true);
      expect(currentStaff?.id).toBe(mockStaff[0]!.id);
      expect(currentShift?.id).toBe(shiftOk.id);
      expect(currentShift?.staffId).toBe(mockStaff[0]!.id);
      expect(useLoginUiStore.getState().selectedStaff).toBeNull();
    });
  });

  async function enterDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
    for (const d of digits) {
      await user.click(screen.getByRole('button', { name: `Key ${d}` }));
    }
  }

  describe('forced_pin_change phase', () => {
    beforeEach(() => {
      useLoginUiStore.getState().clearSelection();
      useLoginUiStore.getState().setSelectedStaff(staffMustChangePin);
    });

    it('is entered after a successful sign-in when mustChangePin is true, and hides "Not you? Go back"', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, staffMustChangePin.pin);

      await waitFor(() => {
        expect(screen.getByText('Set a new PIN')).toBeInTheDocument();
      });
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: staffMustChangePin.email,
        password: staffMustChangePin.pin,
      });
      expect(screen.queryByRole('button', { name: 'Not you? Go back' })).not.toBeInTheDocument();
    });

    it('rejects a mismatched confirm PIN and resets back to New PIN entry', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, staffMustChangePin.pin);
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '333333');
      await waitFor(() => {
        expect(screen.getByText("PINs don't match. Try again.")).toBeInTheDocument();
      });
      // Reset back to the New PIN step
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('rejects a new PIN identical to the current PIN', async () => {
      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, staffMustChangePin.pin);
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, staffMustChangePin.pin);
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, staffMustChangePin.pin);
      await waitFor(() => {
        expect(
          screen.getByText('Choose a PIN different from your current one.')
        ).toBeInTheDocument();
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('on a matching, different new PIN, updates auth password and clears the flag, then proceeds to opening cash', async () => {
      mockUpdateUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

      const user = userEvent.setup();
      renderLoginForm();

      await enterDigits(user, staffMustChangePin.pin);
      await waitFor(() => {
        expect(screen.getByText('New PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');
      await waitFor(() => {
        expect(screen.getByText('Confirm new PIN')).toBeInTheDocument();
      });

      await enterDigits(user, '222222');

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: '222222' });
      });
      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('clear_must_change_pin', {
          p_terminal_id: expect.any(String) as unknown as string,
        });
      });
      await waitFor(() => {
        expect(
          screen.getByText(
            'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  it('does not log in when clock-in fails', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(err({ code: 'TEST', message: 'Network down' }));
    vi.mocked(staffQueries.useMutationClockIn).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof staffQueries.useMutationClockIn>);

    const user = userEvent.setup();
    renderLoginForm();

    for (const d of ['1', '2', '3', '4', '5', '6'] as const) {
      await user.click(screen.getByRole('button', { name: `Key ${d}` }));
    }

    await waitFor(() => {
      expect(
        screen.getByText(
          'Enter the cash drawer float for this shift. You can use zero if nothing is counted yet.'
        )
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Start shift' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    expect(useStaffStore.getState().isAuthenticated).toBe(false);
    expect(useStaffStore.getState().currentShift).toBeNull();
  });
});
