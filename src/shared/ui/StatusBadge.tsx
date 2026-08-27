/**
 * STATUS BADGE COMPONENT
 *
 * Displays status with appropriate color coding.
 * Maps domain status types to visual badges.
 */

import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import type { TabStatusSchema, OrderStatusSchema } from '@shared/lib/domain';
import { cn } from '@shared/lib/utils';
import { Badge } from '@shared/ui/badge';

/** Visual-only tiers for open-tab duration (not persisted domain status). */
export type TabOpenDurationBadgeStatus = 'tab_open_ok' | 'tab_open_warn' | 'tab_open_critical';

/** Inventory row stock tier (UI-only; not a persisted domain enum). */
export type InventoryStockBadgeStatus = 'inv_in_stock' | 'inv_low_stock' | 'inv_out_of_stock';

export type StatusBadgeProps = {
  /** Status value from domain types, or tab duration tier for open tabs */
  status:
    | z.infer<typeof TabStatusSchema>
    | z.infer<typeof OrderStatusSchema>
    | TabOpenDurationBadgeStatus
    | InventoryStockBadgeStatus
    | 'po_draft'
    | 'po_received';
  /** Additional CSS classes */
  className?: string;
};

type StatusConfig = {
  /** i18next key (within the `common` namespace) resolving to the display label */
  labelKey: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
};

const statusConfig: Record<string, StatusConfig> = {
  // Tab statuses
  open: {
    labelKey: 'statusBadge.open',
    variant: 'default',
    className: 'bg-pos-accent text-white hover:opacity-90',
  },
  closed: {
    labelKey: 'statusBadge.closed',
    variant: 'secondary',
  },
  paid: {
    labelKey: 'statusBadge.paid',
    variant: 'default',
    className: 'bg-primary text-primary-foreground hover:opacity-90',
  },
  voided: {
    labelKey: 'statusBadge.voided',
    variant: 'destructive',
  },

  // Order statuses
  pending: {
    labelKey: 'statusBadge.pending',
    variant: 'default',
    className: 'bg-pos-accent text-white hover:opacity-90',
  },
  served: {
    labelKey: 'statusBadge.served',
    variant: 'secondary',
  },

  // Open tab duration (how long the bill has been open)
  tab_open_ok: {
    labelKey: 'statusBadge.open',
    variant: 'default',
    className: 'bg-pos-accent text-white hover:opacity-90',
  },
  tab_open_warn: {
    labelKey: 'statusBadge.tabOpenWarn',
    variant: 'default',
    className: 'bg-pos-warning text-black hover:opacity-90',
  },
  tab_open_critical: {
    labelKey: 'statusBadge.tabOpenCritical',
    variant: 'destructive',
    className: 'bg-pos-danger text-white hover:opacity-90',
  },

  // Inventory (quantity vs threshold)
  inv_in_stock: {
    labelKey: 'statusBadge.inStock',
    variant: 'secondary',
    className: 'bg-muted text-muted-foreground hover:bg-muted',
  },
  inv_low_stock: {
    labelKey: 'statusBadge.lowStock',
    variant: 'destructive',
    className: 'bg-pos-danger text-white hover:opacity-90',
  },
  inv_out_of_stock: {
    labelKey: 'statusBadge.outOfStock',
    variant: 'destructive',
    className: 'bg-destructive text-white hover:opacity-90',
  },

  // Purchase order statuses
  po_draft: {
    labelKey: 'statusBadge.poDraft',
    variant: 'secondary',
  },
  po_received: {
    labelKey: 'statusBadge.poReceived',
    variant: 'default',
    className: 'bg-primary text-primary-foreground hover:opacity-90',
  },
};

/**
 * Displays a status badge with appropriate color coding.
 *
 * @example
 * ```tsx
 * <StatusBadge status="open" />
 * <StatusBadge status="pending" />
 * ```
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation('common');
  const config: StatusConfig | undefined = statusConfig[status];
  const label = config ? t(config.labelKey) : status;

  return (
    <Badge
      role="status"
      variant={config?.variant ?? 'outline'}
      className={cn(config?.className, className)}
      aria-label={`Status: ${label}`}
    >
      {label}
    </Badge>
  );
}
