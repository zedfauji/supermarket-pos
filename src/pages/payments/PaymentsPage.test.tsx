/**
 * Unit tests for PaymentsPage
 *
 * Tests: back-to-home link present, PaymentPane rendered
 */

import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@shared/lib/test-utils';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@widgets/PaymentPane', () => ({
  PaymentPane: () => <div data-testid="payment-pane">PaymentPane stub</div>,
}));

// BackToHomeButton uses react-router Link — we need MemoryRouter
// renderWithProviders wraps in QueryClientProvider; we add MemoryRouter here.

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import PaymentsPage from './index';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/payments']}>
      <PaymentsPage />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentsPage', () => {
  it('renders a link to /home', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/home');
  });

  it('renders PaymentPane', () => {
    renderPage();
    expect(screen.getByTestId('payment-pane')).toBeInTheDocument();
  });
});
