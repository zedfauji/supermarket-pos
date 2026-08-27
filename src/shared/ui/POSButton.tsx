/**
 * POS BUTTON COMPONENT
 *
 * Extended Button component optimized for POS touchscreen use.
 * Larger touch targets and press animations.
 */

import * as React from 'react';
import { cn } from '@shared/lib/utils';
import { Button, type ButtonProps } from './button';

export interface POSButtonProps extends ButtonProps {
  /** Touch target size */
  touchSize?: 'default' | 'large' | 'xl';
}

/**
 * POSButton - Button optimized for touchscreen POS environment
 *
 * Features:
 * - Large touch targets (56px - 72px) for bartender use
 * - Press animation (scale-95 on active)
 * - All standard Button variants supported
 *
 * Touch Sizes:
 * - default: 44px (standard mobile touch target)
 * - large: 56px (comfortable for bartenders)
 * - xl: 72px (for primary actions like "Place Order", "Process Payment")
 *
 * @example
 * ```tsx
 * <POSButton touchSize="xl" variant="default">
 *   Process Payment
 * </POSButton>
 * ```
 */
export const POSButton = React.forwardRef<HTMLButtonElement, POSButtonProps>(
  ({ className, touchSize = 'default', ...props }, ref) => {
    /* eslint-disable i18next/no-literal-string -- Tailwind class-name lookup table, not UI copy */
    const touchSizeClasses = {
      default: 'min-h-[44px]',
      large: 'min-h-[56px] text-base',
      xl: 'min-h-[72px] text-lg font-semibold',
    };
    /* eslint-enable i18next/no-literal-string */

    return (
      <Button
        ref={ref}
        className={cn(
          touchSizeClasses[touchSize],
          'active:scale-95 transition-transform',
          className
        )}
        {...props}
      />
    );
  }
);

POSButton.displayName = 'POSButton';
