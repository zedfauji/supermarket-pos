import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { STAFF_ACTIONS, STAFF_ROLES } from '@shared/lib/rbac';

import { PermissionMatrix } from './PermissionMatrix';

vi.mock('@entities/rbac', () => ({
  useRolePermissions: vi.fn(() => ({
    data: { ok: true, data: new Map() },
    isLoading: false,
  })),
  rbacKeys: { all: ['role_permissions'], list: () => ['role_permissions', 'list'] },
}));

vi.mock('@entities/staff/model/store', () => ({
  useStaffStore: vi.fn(
    (selector: (s: { currentStaff: { role: string } | null }) => unknown) =>
      selector({ currentStaff: { role: 'admin' } })
  ),
}));

vi.mock('@features/toggle-permission', () => ({
  useMutationTogglePermission: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@shared/lib/logger-instance', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('PermissionMatrix', () => {
  it('renders one action row per STAFF_ACTIONS entry', () => {
    render(<PermissionMatrix />);
    for (const action of STAFF_ACTIONS) {
      expect(screen.getByText(action)).toBeInTheDocument();
    }
  });

  it('renders 4 role columns (Cashier, Manager, Admin, Kitchen)', () => {
    render(<PermissionMatrix />);
    expect(screen.getByText('Cashier')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(STAFF_ROLES).toHaveLength(4);
  });

  it('renders one switch per action row × role column', () => {
    render(<PermissionMatrix />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(STAFF_ACTIONS.length * STAFF_ROLES.length);
  });

  it('shows switches as enabled (not disabled) for admin user', () => {
    render(<PermissionMatrix />);
    const switches = screen.getAllByRole('switch');
    switches.forEach(sw => {
      expect(sw).not.toBeDisabled();
    });
  });
});
