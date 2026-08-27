import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
// Real i18next singleton (not mocked) — resolves t('settings:tabs.*') to the
// actual catalog values so these assertions double as an es-MX byte-identical
// migration check (21-03 D-04/D-05).
import '@shared/lib/i18n';
import { SettingsTabsPanel } from './index';

const permissionState = {
  manageSettings: false,
  manageProducts: false,
};

const roleState: { role: 'admin' | 'manager' | 'cashier' | null } = {
  role: 'admin',
};

vi.mock('@entities/staff/model/store', () => ({
  useStaffStore: (selector: (state: { currentStaff: { role: string } | null }) => unknown) =>
    selector({
      currentStaff: roleState.role ? { role: roleState.role } : null,
    }),
}));

vi.mock('@entities/staff/model/usePermissions', () => ({
  usePermissions: () => ({
    can: (action: string) => {
      if (action === 'manage_settings') return permissionState.manageSettings;
      if (action === 'manage_products') return permissionState.manageProducts;
      return false;
    },
  }),
}));

vi.mock('./tabs/LanguageSettingsTab', () => ({
  LanguageSettingsTab: () => <div>Language tab content</div>,
}));
vi.mock('./tabs/GeneralSettingsTab', () => ({
  GeneralSettingsTab: () => <div>General tab content</div>,
}));
vi.mock('./tabs/HardwareSettingsTab', () => ({
  HardwareSettingsTab: () => <div>Hardware tab content</div>,
}));
vi.mock('./tabs/EmailReceiptsSettingsTab', () => ({
  EmailReceiptsSettingsTab: () => <div>Email tab content</div>,
}));
vi.mock('./tabs/BackupSettingsTab', () => ({
  BackupSettingsTab: () => <div>Backup tab content</div>,
}));
vi.mock('./tabs/ProductsSettingsTab', () => ({
  ProductsSettingsTab: () => <div>Products tab content</div>,
}));
vi.mock('./tabs/BillingSettingsTab', () => ({
  BillingSettingsTab: () => <div>Billing tab content</div>,
}));

describe('SettingsTabsPanel', () => {
  beforeEach(() => {
    permissionState.manageSettings = false;
    permissionState.manageProducts = false;
    roleState.role = 'admin';
  });

  it('shows manager tabs when only manage_products is granted', () => {
    permissionState.manageProducts = true;
    permissionState.manageSettings = false;
    roleState.role = 'manager';

    render(<SettingsTabsPanel />);

    expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument();
  });

  it('shows all tabs for admin with both permissions', () => {
    permissionState.manageProducts = true;
    permissionState.manageSettings = true;
    roleState.role = 'admin';

    render(<SettingsTabsPanel />);

    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Backup' })).toBeInTheDocument();
  });

  it('shows the role-agnostic Language tab as the default tab for a cashier with neither permission (D-03, Pitfall 1)', () => {
    permissionState.manageProducts = false;
    permissionState.manageSettings = false;
    roleState.role = 'cashier';

    render(<SettingsTabsPanel />);

    // test-setup.ts pins the suite to en-US — the tab label resolves to the en-US catalog value.
    const languageTab = screen.getByRole('tab', { name: 'Language' });
    expect(languageTab).toBeInTheDocument();
    expect(languageTab).toHaveAttribute('data-state', 'active');
    expect(screen.queryByText('You do not have permission to view settings.')).not.toBeInTheDocument();
  });
});
