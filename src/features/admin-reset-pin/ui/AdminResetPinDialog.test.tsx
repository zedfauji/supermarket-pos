import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Staff } from '@shared/lib/domain';

// ---------------------------------------------------------------------------
// jsdom polyfills — mirrors EditLocaleDialog.test.tsx's setup.
// ---------------------------------------------------------------------------
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const { mutateAsyncMock, toastErrorMock, toastSuccessMock, tMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  tMock: vi.fn((key: string) => key),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tMock }),
}));

const targetStaff: Staff = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Target Alex',
  email: 'target@b.dev',
  role: 'cashier',
  pin: '111111',
  isActive: true,
  mustChangePin: false,
  locale: 'es-MX',
};

const collisionStaff: Staff = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Collision Sam',
  email: 'sam@b.dev',
  role: 'admin',
  pin: '222222',
  isActive: true,
  mustChangePin: false,
  locale: 'es-MX',
};

vi.mock('@entities/staff/model/queries', () => ({
  useStaffList: () => ({ data: [targetStaff, collisionStaff] }),
}));

vi.mock('../model/useAdminResetPin', () => ({
  useAdminResetPin: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
}));

vi.mock('@features/manager-pin-gate', () => ({
  ManagerPinDialog: ({ open }: { open: boolean }) =>
    open ? <div role="alertdialog">manager-pin-gate</div> : null,
}));

import { AdminResetPinDialog } from './AdminResetPinDialog';

describe('AdminResetPinDialog', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    tMock.mockClear();
  });

  it('disables submit until both PIN fields are valid 6-digit matches', async () => {
    const user = userEvent.setup();
    render(<AdminResetPinDialog staff={targetStaff} open onOpenChange={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: 'resetPin.submit' });
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText('resetPin.newPinLabel'), '333333');
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByLabelText('resetPin.confirmPinLabel'), '333333');
    expect(submitBtn).not.toBeDisabled();
  });

  it('renders the collision warning when the new PIN matches another ACTIVE staff member (excluding the target itself)', async () => {
    const user = userEvent.setup();
    render(<AdminResetPinDialog staff={targetStaff} open onOpenChange={vi.fn()} />);

    // collisionStaff.pin === '222222'
    await user.type(screen.getByLabelText('resetPin.newPinLabel'), '222222');
    await user.type(screen.getByLabelText('resetPin.confirmPinLabel'), '222222');

    expect(tMock).toHaveBeenCalledWith('resetPin.collisionWarning', { name: collisionStaff.name });
    expect(screen.getByRole('button', { name: 'resetPin.submit' })).not.toBeDisabled();
  });

  it('does NOT warn when the entered PIN matches the TARGET staff member\'s own current PIN', async () => {
    const user = userEvent.setup();
    render(<AdminResetPinDialog staff={targetStaff} open onOpenChange={vi.fn()} />);

    // targetStaff.pin === '111111' — this is the target's own current PIN, not a collision.
    await user.type(screen.getByLabelText('resetPin.newPinLabel'), '111111');
    await user.type(screen.getByLabelText('resetPin.confirmPinLabel'), '111111');

    expect(tMock).not.toHaveBeenCalledWith('resetPin.collisionWarning', expect.anything());
  });

  it('clicking the dialog submit button never calls the mutation directly — it only opens the confirm gate', async () => {
    const user = userEvent.setup();
    render(<AdminResetPinDialog staff={targetStaff} open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText('resetPin.newPinLabel'), '333333');
    await user.type(screen.getByLabelText('resetPin.confirmPinLabel'), '333333');
    await user.click(screen.getByRole('button', { name: 'resetPin.submit' }));

    // Radix's own Dialog marks sibling subtrees aria-hidden while it's open
    // (focus-trap a11y behavior) — the reused ManagerPinDialog is a real
    // sibling AlertDialog (RefundSheet.tsx composes the two the same way),
    // so `hidden: true` is required to find it, matching real DOM behavior.
    expect(screen.getByRole('alertdialog', { hidden: true })).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
