/**
 * EMPTY STATE COMPONENT
 *
 * Displays a centered empty state with icon, title, description, and optional action.
 * Used when lists or tables have no data.
 */

import type { LucideIcon } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui/button';

export type EmptyStateProps = {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Main title */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional CSS classes */
  className?: string;
};

/**
 * Empty state component for lists and tables.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={FileText}
 *   title="No tabs open"
 *   description="Open a new tab to get started"
 *   action={{
 *     label: "Open Tab",
 *     onClick: handleOpenTab
 *   }}
 * />
 * ```
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
      data-testid="empty-state"
      role="status"
      aria-live="polite"
    >
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>

      <h3 className="mb-2 text-lg font-semibold">{title}</h3>

      {description && <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>}

      {action && (
        <Button onClick={action.onClick} aria-label={action.label}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
