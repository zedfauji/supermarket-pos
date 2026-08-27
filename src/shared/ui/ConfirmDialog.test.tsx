/**
 * Unit tests for ConfirmDialog
 *
 * Tests: confirmClassName passthrough reaches the confirm AlertDialogAction (closes Pitfall 2).
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog confirmClassName', () => {
  it('merges confirmClassName onto the confirm button, not the cancel button', () => {
    render(
      <ConfirmDialog
        open
        title="Delete item?"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmClassName="min-h-[72px] focus-visible:ring-4"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    expect(confirmButton.className).toContain('min-h-[72px]');
    expect(confirmButton.className).toContain('focus-visible:ring-4');

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton.className).not.toContain('min-h-[72px]');
    expect(cancelButton.className).not.toContain('focus-visible:ring-4');
  });

  it('renders the confirm button unchanged when confirmClassName is omitted', () => {
    render(
      <ConfirmDialog
        open
        title="Confirm?"
        description="Are you sure?"
        confirmLabel="Confirm"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton.className).not.toContain('min-h-[72px]');
  });
});
