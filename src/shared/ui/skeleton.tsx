/**
 * SKELETON COMPONENT (shadcn/ui)
 *
 * Placeholder for shadcn/ui Skeleton component.
 * Install with: npx shadcn@latest add skeleton
 */

import { cn } from '@shared/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
