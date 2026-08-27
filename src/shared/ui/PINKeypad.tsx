/**
 * PIN KEYPAD COMPONENT
 *
 * 10-key numeric keypad for PIN entry in bar environment.
 * Large touch targets, displays value as dots for security.
 */

import { Delete, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { Button } from './button';

export interface PINKeypadProps {
  /** Current PIN value */
  value: string;
  /** Called when PIN value changes */
  onChange: (value: string) => void;
  /** Maximum PIN length (default: 6) */
  maxLength?: number;
  /** Called when PIN reaches maxLength */
  onComplete?: (pin: string) => void;
  /** Label text above keypad */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Loading state - disables all keys */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * PINKeypad - Numeric keypad for secure PIN entry
 *
 * Features:
 * - Large 64px Ã— 64px buttons for fat-finger bar environment
 * - Displays value as dots (â—â—â—â—) not actual digits
 * - Auto-fires onComplete when maxLength reached
 * - Loading state with spinner
 * - Error state with red border
 *
 * @example
 * ```tsx
 * <PINKeypad
 *   value={pin}
 *   onChange={setPin}
 *   maxLength={4}
 *   onComplete={(pin) => handleLogin(pin)}
 *   label="Enter PIN"
 *   error={error}
 *   isLoading={isLoading}
 * />
 * ```
 */
export function PINKeypad({
  value,
  onChange,
  maxLength = 6,
  onComplete,
  label,
  error,
  isLoading = false,
  className,
}: PINKeypadProps) {
  const { t } = useTranslation('common');
  const handleKeyPress = React.useCallback(
    (digit: string) => {
      if (isLoading || value.length >= maxLength) return;

      const newValue = value + digit;
      onChange(newValue);

      // Auto-fire onComplete when maxLength reached
      if (newValue.length === maxLength && onComplete) {
        onComplete(newValue);
      }
    },
    [value, maxLength, onChange, onComplete, isLoading]
  );

  const handleBackspace = React.useCallback(() => {
    if (isLoading || value.length === 0) return;
    onChange(value.slice(0, -1));
  }, [value, onChange, isLoading]);

  // Keyboard support
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyPress, handleBackspace, isLoading]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Label */}
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}

      {/* PIN Display */}
      <div
        className={cn(
          'flex h-16 items-center justify-center gap-2 rounded-md border-2 bg-background px-4',
          error ? 'border-destructive' : 'border-input',
          isLoading && 'opacity-50'
        )}
        aria-label={t('pinKeypad.display')}
        aria-live="polite"
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <>
            {Array.from({ length: maxLength }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'text-2xl w-8 flex items-center justify-center flex-shrink-0',
                  i < value.length ? 'text-foreground' : 'text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {i < value.length ? '\u25CF' : '\u25CB'}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('pinKeypad.keypad')}>
        {/* Keys 1-9 */}
        {keys.slice(0, 9).map(key => (
          <Button
            key={key}
            variant="outline"
            size="lg"
            className="h-16 w-full text-xl font-semibold"
            onClick={() => {
              handleKeyPress(key);
            }}
            disabled={isLoading || value.length >= maxLength}
            aria-label={`Key ${key}`}
          >
            {key}
          </Button>
        ))}

        {/* Empty space, 0, Backspace */}
        <div />
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-full text-xl font-semibold"
          onClick={() => {
            handleKeyPress('0');
          }}
          disabled={isLoading || value.length >= maxLength}
          aria-label={t('pinKeypad.key0')}
        >
          0
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-full"
          onClick={() => {
            handleBackspace();
          }}
          disabled={isLoading || value.length === 0}
          aria-label={t('pinKeypad.backspace')}
        >
          <Delete className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
