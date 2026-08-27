/**
 * QUANTITY CONTROL COMPONENT
 *
 * Three-button quantity selector with large touch targets.
 * Includes haptic feedback on mobile devices.
 */

import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui/button';

export type QuantityControlProps = {
  /** Current quantity value */
  value: number;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Disable all controls */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
};

/**
 * Triggers haptic feedback on mobile devices.
 */
function triggerHaptic() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

/**
 * Quantity control with increment/decrement buttons.
 *
 * @example
 * ```tsx
 * <QuantityControl
 *   value={quantity}
 *   min={1}
 *   max={99}
 *   onChange={setQuantity}
 * />
 * ```
 */
export function QuantityControl({
  value,
  min = 1,
  max = 99,
  onChange,
  disabled = false,
  className,
}: QuantityControlProps) {
  const { t } = useTranslation('common');
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = () => {
    if (canDecrement && !disabled) {
      triggerHaptic();
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (canIncrement && !disabled) {
      triggerHaptic();
      onChange(value + 1);
    }
  };

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="group"
      aria-label={t('quantityControl.group')}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={disabled || !canDecrement}
        aria-label={t('quantityControl.decrease')}
        className="h-11 w-11 touch-manipulation"
      >
        <Minus className="h-4 w-4" />
      </Button>

      <div
        className="flex h-11 w-16 items-center justify-center rounded-md border border-input bg-background font-mono text-lg font-semibold tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {value}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={disabled || !canIncrement}
        aria-label={t('quantityControl.increase')}
        className="h-11 w-11 touch-manipulation"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
