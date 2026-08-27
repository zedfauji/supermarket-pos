/**
 * CONFIRM DIALOG COMPONENT
 *
 * Confirmation dialog with destructive variant support.
 * Wraps shadcn AlertDialog with consistent styling.
 */

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

export interface ConfirmDialogProps {
  /** Whether dialog is open */
  open: boolean;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description: string;
  /** Confirm button label (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Button variant - destructive shows red confirm button */
  variant?: 'default' | 'destructive';
  /** Called when user confirms */
  onConfirm: () => void | Promise<void>;
  /** Called when user cancels */
  onCancel: () => void;
  /** Loading state - shows spinner, disables buttons */
  isLoading?: boolean;
  /** Optional custom body content rendered under description */
  children?: React.ReactNode;
  /** Disable confirm action until requirements are met */
  confirmDisabled?: boolean;
  /** Optional extra classes merged onto the confirm button (opt-in only; no default changes) */
  confirmClassName?: string;
}

/**
 * ConfirmDialog - Confirmation dialog with keyboard support
 *
 * Features:
 * - Destructive variant for dangerous actions (red confirm button)
 * - Loading state with spinner in confirm button
 * - Keyboard support: Enter = confirm, Escape = cancel
 * - Accessible with proper ARIA labels
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={isOpen}
 *   title="Close Tab?"
 *   description="This will finalize the tab and require payment."
 *   confirmLabel="Close Tab"
 *   variant="destructive"
 *   onConfirm={handleCloseTab}
 *   onCancel={() => setIsOpen(false)}
 *   isLoading={isClosing}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  isLoading = false,
  children,
  confirmDisabled = false,
  confirmClassName,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  const handleConfirm = React.useCallback(async () => {
    await onConfirm();
  }, [onConfirm]);

  // Keyboard support
  React.useEffect(() => {
    if (!open || isLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, isLoading, handleConfirm, onCancel]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isLoading}
            onClick={() => {
              onCancel();
            }}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading || confirmDisabled}
            onClick={() => {
              void handleConfirm();
            }}
            className={cn(
              variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              confirmClassName
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('loading.generic')}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
