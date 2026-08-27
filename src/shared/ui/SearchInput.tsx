/**
 * SEARCH INPUT COMPONENT
 *
 * Search input with debouncing and clear button.
 */

import { Search, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import { Button } from './button';
import { Input } from './input';

export interface SearchInputProps {
  /** Current search value */
  value: string;
  /** Called when search value changes (debounced) */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SearchInput - Debounced search input with clear button
 *
 * Features:
 * - Debounces onChange calls (default 300ms)
 * - Clear button (X) when value is not empty
 * - Search icon for visual clarity
 * - Accessible with proper ARIA labels
 *
 * @example
 * ```tsx
 * <SearchInput
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   placeholder="Search products..."
 *   debounceMs={300}
 * />
 * ```
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const { t } = useTranslation('common');
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  // Sync external value changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  const handleChange = React.useCallback(
    (newValue: string) => {
      setLocalValue(newValue);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
    },
    [onChange, debounceMs]
  );

  // Clear search
  const handleClear = React.useCallback(() => {
    setLocalValue('');
    onChange('');
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
    }
  }, [onChange]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* Search Icon */}
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      {/* Input */}
      <Input
        type="text"
        value={localValue}
        onChange={e => {
          handleChange(e.target.value);
        }}
        placeholder={placeholder}
        className="pl-9 pr-9"
        aria-label={t('searchInput.search')}
      />

      {/* Clear Button */}
      {localValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2 touch-manipulation"
          onClick={handleClear}
          aria-label={t('searchInput.clear')}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
