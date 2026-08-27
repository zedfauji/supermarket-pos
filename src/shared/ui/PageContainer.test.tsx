/**
 * Unit tests for PageContainer
 *
 * Tests: backTo/backLabel back-link behavior (SHELL-01 foundation).
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PageContainer } from './PageContainer';

describe('PageContainer', () => {
  it('renders no back link when backTo is omitted', () => {
    render(
      <MemoryRouter>
        <PageContainer title="X">
          <div data-testid="child" />
        </PageContainer>
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a "Home" back link when backTo is provided without backLabel', () => {
    render(
      <MemoryRouter>
        <PageContainer title="X" backTo="/home">
          <div data-testid="child" />
        </PageContainer>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/home');
  });

  it('renders a custom-labeled back link when backTo and backLabel are both provided', () => {
    render(
      <MemoryRouter>
        <PageContainer title="X" backTo="/pool-tables" backLabel="Pool Tables">
          <div data-testid="child" />
        </PageContainer>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /pool tables/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/pool-tables');
  });
});
