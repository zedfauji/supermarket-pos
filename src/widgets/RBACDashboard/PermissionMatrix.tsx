import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useMutationTogglePermission } from '@features/toggle-permission';
import { useRolePermissions } from '@entities/rbac';
import { useStaffStore } from '@entities/staff/model/store';
import { logger } from '@shared/lib/logger-instance';
import { STAFF_ACTIONS, STAFF_ROLES } from '@shared/lib/rbac';
import type { StaffAction, StaffRole } from '@shared/lib/rbac';
import { Switch } from '@shared/ui';

const ROLE_LABELS: Record<StaffRole, string> = {
  cashier: 'Cashier',
  manager: 'Manager',
  admin: 'Admin',
  kitchen: 'Kitchen',
};

export function PermissionMatrix() {
  const { t } = useTranslation('wAdmin');
  const currentRole = useStaffStore(s => s.currentStaff?.role);
  const isAdmin = currentRole === 'admin';

  const { data: permResult, isLoading } = useRolePermissions();
  const permMap =
    permResult && permResult.ok ? permResult.data : new Map<StaffRole, Set<StaffAction>>();

  const mutation = useMutationTogglePermission();

  const handleToggle = async (
    role: StaffRole,
    action: StaffAction,
    checked: boolean
  ): Promise<void> => {
    const result = await mutation.mutateAsync({ role, action, enabled: checked });
    if (!result.ok) {
      logger.error('permission-matrix.toggle.failed', {
        role,
        action,
        message: result.error.message,
      });
      toast.error(t('permissionMatrix.updateFailed'), { description: result.error.message });
      return;
    }
    toast.success(
      checked ? t('permissionMatrix.permissionEnabled') : t('permissionMatrix.permissionDisabled'),
      {
        description: `${ROLE_LABELS[role]} / ${action}`,
      }
    );
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t('permissionMatrix.loading')}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="min-w-[180px] py-2 pr-4 text-left font-medium text-muted-foreground">
              {t('permissionMatrix.columnAction')}
            </th>
            {STAFF_ROLES.map(role => (
              <th
                key={role}
                className="min-w-[90px] px-3 py-2 text-center font-medium capitalize"
              >
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAFF_ACTIONS.map(action => (
            <tr key={action} className="border-t border-border">
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{action}</td>
              {STAFF_ROLES.map(role => {
                const checked = permMap.get(role)?.has(action) ?? false;
                return (
                  <td key={role} className="px-3 py-2 text-center">
                    <Switch
                      checked={checked}
                      disabled={!isAdmin || mutation.isPending}
                      onCheckedChange={newChecked => {
                        void handleToggle(role, action, newChecked);
                      }}
                      aria-label={`${ROLE_LABELS[role]} can ${action}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
