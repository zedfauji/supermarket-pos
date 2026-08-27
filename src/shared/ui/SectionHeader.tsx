/**
 * SECTION HEADER COMPONENT
 *
 * Consistent page/section headers with optional action and badge.
 */

import { Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@shared/lib/utils';
import { POSButton } from '@shared/ui/POSButton';
import { Badge } from '@shared/ui/badge';

export type SectionHeaderProps = {
  /** Section title */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional action button or element */
  action?: React.ReactNode;
  /** Optional badge (count or label) */
  badge?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Optional back-navigation target. Omit to render no back link. */
  backTo?: string;
  /** Optional back-link label. Defaults to "Home" when backTo is provided. */
  backLabel?: string;
};

/**
 * Section header with title, description, action, and badge.
 *
 * @example
 * ```tsx
 * <SectionHeader
 *   title="Open Tabs"
 *   description="Currently active customer tabs"
 *   badge={5}
 *   action={<Button>New Tab</Button>}
 * />
 * ```
 */
export function SectionHeader({
  title,
  description,
  action,
  badge,
  className,
  backTo,
  backLabel,
}: SectionHeaderProps) {
  const { t } = useTranslation('common');
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b pb-4', className)}>
      <div className="flex items-center gap-4">
        {backTo && (
          <POSButton
            variant="outline"
            touchSize="large"
            focusEmphasis="high"
            asChild
            className="shrink-0 gap-2 border-2 px-4"
          >
            <Link to={backTo}>
              <Home className="h-5 w-5" />
              {backLabel ?? t('sectionHeader.backHome')}
            </Link>
          </POSButton>
        )}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-semibold leading-none tracking-tight">
              {title}
            </h2>
            {badge !== undefined && (
              <Badge variant="secondary" aria-label={`Count: ${String(badge)}`}>
                {badge}
              </Badge>
            )}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
