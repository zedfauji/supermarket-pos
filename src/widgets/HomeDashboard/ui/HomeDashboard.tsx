import {
  BarChart,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  Lock,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ManagerPinDialog } from '@features/manager-pin-gate';
import { useNearExpiryAlerts } from '@entities/inventory';
import { useStaffStore } from '@entities/staff/model/store';
import { usePermissions } from '@entities/staff/model/usePermissions';
import type { StaffAction } from '@shared/lib/rbac';
import { Badge, Button } from '@shared/ui';

type DashboardItem = {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  requiredAction?: StaffAction;
  managerLabelKey?: string;
};

const ITEMS: DashboardItem[] = [
  { path: '/pos', labelKey: 'homeDashboard.tiles.pos', icon: ShoppingCart },
  { path: '/payments', labelKey: 'homeDashboard.tiles.payments', icon: CreditCard },
  { path: '/staff', labelKey: 'homeDashboard.tiles.staff', icon: Users },
  {
    path: '/reports',
    labelKey: 'homeDashboard.tiles.reports',
    icon: BarChart,
    requiredAction: 'view_reports',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
  {
    path: '/inventory',
    labelKey: 'homeDashboard.tiles.inventory',
    icon: Package,
    requiredAction: 'adjust_inventory',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
  {
    path: '/suppliers',
    labelKey: 'homeDashboard.tiles.suppliers',
    icon: Truck,
    requiredAction: 'adjust_inventory',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
  {
    path: '/purchase-orders',
    labelKey: 'homeDashboard.tiles.purchaseOrders',
    icon: FileText,
    requiredAction: 'manage_products',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
  {
    path: '/settings',
    labelKey: 'homeDashboard.tiles.settings',
    icon: Settings,
    requiredAction: 'manage_settings',
    managerLabelKey: 'homeDashboard.managerLabels.admin',
  },
  {
    path: '/rbac',
    labelKey: 'homeDashboard.tiles.rolesAndPermissions',
    icon: ShieldCheck,
    requiredAction: 'manage_staff',
    managerLabelKey: 'homeDashboard.managerLabels.admin',
  },
  {
    path: '/audit',
    labelKey: 'homeDashboard.tiles.auditLog',
    icon: ClipboardList,
    requiredAction: 'view_audit_log',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
  {
    path: '/edit-history',
    labelKey: 'homeDashboard.tiles.editHistory',
    icon: History,
    requiredAction: 'view_audit_log',
    managerLabelKey: 'homeDashboard.managerLabels.manager',
  },
];

type GatedTarget = { action: StaffAction; path: string };

export function HomeDashboard() {
  const { t } = useTranslation('wPanels');
  const { can } = usePermissions();
  const navigate = useNavigate();
  const currentStaff = useStaffStore(s => s.currentStaff);
  const logout = useStaffStore(s => s.logout);
  const grantManagerActions = useStaffStore(s => s.grantManagerActions);
  const [gatedTarget, setGatedTarget] = useState<GatedTarget | null>(null);
  const { data: nearExpiryAlerts } = useNearExpiryAlerts();

  function handleItemClick(item: DashboardItem) {
    if (!item.requiredAction || can(item.requiredAction)) {
      navigate(item.path);
    } else {
      setGatedTarget({ action: item.requiredAction, path: item.path });
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-8 p-8">
      {/* Staff context */}
      {currentStaff && (
        <div className="flex items-center gap-3">
          <span className="font-heading text-xl font-semibold">
            {t('homeDashboard.welcome', { name: currentStaff.name })}
          </span>
          <Badge variant="secondary" className="capitalize">
            {currentStaff.role}
          </Badge>
        </div>
      )}

      {/* Navigation grid */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
        {ITEMS.map(item => {
          const isGated = !!item.requiredAction && !can(item.requiredAction);
          const Icon = item.icon;
          const itemLabel = t(item.labelKey);
          return (
            <Button
              key={item.path}
              type="button"
              variant="ghost"
              onClick={() => {
                handleItemClick(item);
              }}
              className="relative flex min-h-[160px] min-w-[160px] flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 shadow transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={itemLabel}
              data-testid={item.path === '/audit' ? 'home-tile-audit' : undefined}
            >
              {isGated && (
                <Lock
                  className="absolute right-3 top-3 size-4 text-muted-foreground"
                  aria-hidden="true"
                  data-testid="lock-icon"
                />
              )}
              {item.path === '/inventory' && nearExpiryAlerts?.length ? (
                <Badge className="absolute left-3 top-3 bg-pos-warning text-amber-950 dark:text-amber-100" data-testid="home-near-expiry-badge">
                  {nearExpiryAlerts.length}
                </Badge>
              ) : null}
              <div className="relative">
                <Icon className="size-12" />
              </div>
              <span className="text-center text-sm font-medium">{itemLabel}</span>
              {isGated && item.managerLabelKey && (
                <Badge variant="secondary" className="text-xs">
                  {t(item.managerLabelKey)}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {/* Logout */}
      <Button variant="ghost" size="sm" onClick={handleLogout}>
        <LogOut className="mr-2 size-4" />
        {t('homeDashboard.logout')}
      </Button>

      {/* Manager PIN gate dialog */}
      <ManagerPinDialog
        open={gatedTarget !== null}
        onOpenChange={open => {
          if (!open) setGatedTarget(null);
        }}
        requiredAction={gatedTarget?.action ?? 'view_reports'}
        onSuccess={() => {
          if (!gatedTarget) return;
          // Grant this action so route-level guards see it as permitted
          grantManagerActions([gatedTarget.action]);
          const path = gatedTarget.path;
          setGatedTarget(null);
          navigate(path);
        }}
      />
    </div>
  );
}
