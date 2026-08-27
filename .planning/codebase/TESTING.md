# Testing Patterns

**Analysis Date:** 2026-08-10

## Test Framework

**Runner:**
- Vitest v4 (unit + integration tests)
- Playwright v1.59 (E2E tests)
- Config: `bar-pos/vitest.config.ts`, `bar-pos/playwright.config.ts`

**Assertion Library:**
- Vitest built-in (`expect()`)
- React Testing Library (component assertions)
- Playwright assertions (E2E)

**Run Commands:**
```bash
npm run test              # Run all unit tests once (--project unit)
npm run test:watch       # Watch mode for unit tests
npm run test:ui          # Vitest UI with browser interface
npm run test:coverage    # Coverage report (HTML in coverage/)
npm run test:integration # Real-Supabase integration tests (*.integration.test.ts)
npm run test:e2e         # Playwright E2E (requires dev server on port 1420)
npm run test:e2e:report  # Open last E2E HTML report
```

**Single File:**
```bash
npx vitest run src/path/to/file.test.ts
npx playwright test e2e/02-caja.spec.ts
```

## Test File Organization

**Location:**
- Unit tests: co-located with source (same directory)
- Integration tests: co-located with source (same directory)
- E2E tests: `e2e/` directory at repo root

**Naming:**
- Unit: `<name>.test.ts` or `<name>.test.tsx`
- Integration: `<name>.integration.test.ts`
- E2E: `<name>.spec.ts` (in `e2e/` only)
- Story tests: `<name>.stories.tsx` (Storybook + Vitest)

**Separation:**
- `npm run test` runs unit tests only (excludes `*.integration.test.ts`)
- `npm run test:integration` runs integration tests only
- Unit tests use mocked Supabase (global mock in `test-setup.ts`)
- Integration tests unmock Supabase and hit real DB

**Example Directory:**
```
src/features/remove-tab-item/
├── useRemoveTabItem.ts
├── useRemoveTabItem.test.ts        # Unit test
├── RemoveTabItemDialog.tsx
└── RemoveTabItemDialog.test.tsx    # Unit test

src/entities/tab/model/
├── queries.ts
├── queries.integration.test.ts     # Real Supabase queries
├── store.ts
└── store.test.ts                   # Unit test
```

## Test Structure

**Suite Organization (from actual tests):**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

describe('useRemoveTabItem', () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = makeQueryClient();
    invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('calls remove_tab_item RPC with p_item_id + p_reason', async () => {
    mockedRpc.mockResolvedValue({ data: { ok: true }, error: null } as never);
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(() => useRemoveTabItem(), { wrapper });
    const res = await result.current.removeTabItem(baseInput);
    expect(res.ok).toBe(true);
    expect(mockedRpc).toHaveBeenCalledWith('remove_tab_item', {
      p_item_id: baseInput.itemId,
      p_reason: baseInput.reason,
    });
  });
});
```

**Patterns:**
- Use `describe()` for test suites
- Use `it()` for individual assertions
- `beforeEach()` / `afterEach()` for setup/cleanup
- Descriptive test names: "should [behavior] when [condition]"
- One assertion per test when possible, or group related assertions

## Mocking

**Framework:** Vitest's `vi.mock()` and `vi.spyOn()`

**Global Mocks (in `src/shared/lib/test-setup.ts`):**
- `@tauri-apps/api/core` — IPC invoke
- `@shared/lib/supabase` — Supabase client (full mock)
- `@tauri-apps/plugin-updater` — Auto-updater
- `@tauri-apps/plugin-process` — Tauri process
- `window.matchMedia` — Media queries
- `ResizeObserver` — For ScrollArea component

**Unit Tests use Mocked Supabase:**
```typescript
// Tests get the mocked version by default
import { supabase } from '@shared/lib/supabase';
vi.mocked(supabase.rpc).mockResolvedValue({ data: { ok: true }, error: null } as never);
```

**Integration Tests Unmock:**
```typescript
// At top of *.integration.test.ts
vi.unmock('@shared/lib/supabase');
import { supabase } from '@shared/lib/supabase'; // now real

// Use .env.local for E2E credentials
```

**Mocking Modules (per test file):**
```typescript
import { isOnline } from '@shared/lib/connectivity';

vi.mock('@shared/lib/connectivity', () => ({
  isOnline: vi.fn(() => true),
}));

// Later in test
vi.mocked(isOnline).mockReturnValue(false);
```

**Spying:**
```typescript
const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
// Use it
expect(invalidateSpy).toHaveBeenCalledWith(tabKeys.all);
```

**What to Mock:**
- External services (Supabase, Tauri, APIs)
- Platform APIs (matchMedia, ResizeObserver)
- Time-sensitive operations (via `vi.useFakeTimers()`)
- Module dependencies to isolate the unit

**What NOT to Mock:**
- Don't mock the unit under test
- Don't mock Zustand stores (test them as-is)
- Don't mock pure utility functions (test them directly)
- Don't mock the entire React library

## Fixtures and Factories

**Test Data (from actual tests):**
```typescript
const baseInput: RemoveTabItemInput = {
  tabId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  productId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  quantity: 1,
  reason: 'Wrong item',
};

// Reuse in multiple tests
const result = await hook.removeTabItem(baseInput);
```

**Factory Pattern (for complex objects):**
```typescript
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}
```

**Location:**
- Test data constants: top of test file
- Factories: as functions in test file
- Shared fixtures: no separate fixture files in this codebase (inline)

## Coverage

**Requirements:** No coverage gate enforced — this is a policy decision for the project

**View Coverage:**
```bash
npm run test:coverage
# Opens coverage/index.html
```

**Provider:** V8 (built into Vitest)

**Included:** All `src/**/*.ts` and `src/**/*.tsx`

**Excluded:**
- `**/*.stories.tsx`
- `**/*.test.*`
- `src/shared/lib/supabase.types.ts` (generated)
- `**/*.d.ts`

## Test Types

**Unit Tests:**
- Scope: Single function/hook/component in isolation
- Mocks: All external dependencies (Supabase, Tauri, APIs)
- Speed: <100ms per test (failures indicate over-integration)
- Location: `src/**/*.test.ts` or `src/**/*.test.tsx`
- Example: `useRemoveTabItem.test.ts` mocks the RPC and tests the hook logic
- Run: `npm run test` (default)

**Integration Tests:**
- Scope: Multiple modules working together + real Supabase
- Mocks: Only platform APIs (Tauri, Playwright)
- Speed: 1-30s per test (real DB latency)
- Location: `src/**/*.integration.test.ts`
- Example: `queries.integration.test.ts` calls real RPCs and validates parsing
- Run: `npm run test:integration` (or explicitly with `npx vitest run <path>`)
- Credentials: `.env.local` file required (E2E credentials for Supabase)

**E2E Tests:**
- Scope: Full user workflow in browser + dev server
- Mocks: None (real app, real API, real data)
- Speed: 15-60s per spec (browser startup + network)
- Location: `e2e/*.spec.ts` (61 specs in this codebase)
- Config: `playwright.config.ts`
- Run: `npm run test:e2e` (requires `npm run dev` running, or use Playwright's built-in webServer)
- Examples: `05-payments.spec.ts`, `02-caja.spec.ts`, `09-rbac.spec.ts`

**Storybook Tests:**
- Scope: Component UI in isolation (no app context)
- Config: `@storybook/addon-vitest/vitest-plugin` in vitest.config.ts
- Run: `npm run test:storybook` or `npm run test -- --project storybook`
- Opt-in: Set `RUN_STORYBOOK_TESTS=1` to include in full suite
- Browser: Playwright Chromium (headless)

## Common Patterns

**Async Testing (Vitest + React Testing Library):**
```typescript
import { renderHook, waitFor } from '@testing-library/react';

it('fetches data on mount', async () => {
  const { result } = renderHook(() => useGetTab());

  // Wait for loading to finish
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  expect(result.current.data).toEqual(expectedTab);
});
```

**Error Testing:**
```typescript
it('returns error when RPC fails', async () => {
  mockedRpc.mockRejectedValueOnce(new Error('Network error'));
  const wrapper = makeWrapper(queryClient);
  const { result } = renderHook(() => useRemoveTabItem(), { wrapper });

  const res = await result.current.removeTabItem(baseInput);

  expect(res.ok).toBe(false);
  expect(res.error.code).toBe('NETWORK_OFFLINE');
});
```

**Component Testing (React Testing Library):**
```typescript
import { render, screen, fireEvent } from '@testing-library/react';

it('displays tab info and allows closing', () => {
  render(<TabCard tab={mockTab} onClose={vi.fn()} />);

  expect(screen.getByText(mockTab.number.toString())).toBeInTheDocument();
  const closeButton = screen.getByRole('button', { name: /close/i });
  fireEvent.click(closeButton);
  expect(mockOnClose).toHaveBeenCalled();
});
```

**Snapshot Testing (Rare):**
```typescript
it('renders the layout correctly', () => {
  const { container } = render(<FormLayout />);
  expect(container.firstChild).toMatchSnapshot();
});
```

**Property-Based Testing (for math/billing logic):**
```typescript
import * as fc from 'fast-check';

describe('applyPromotionStack: property tests', () => {
  it('P11a: fixed_amount chains are order-independent', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000 }),
        fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 0, maxLength: 8 }),
        (basePrice, amounts) => {
          const promos = amounts.map(v => ({ discountType: 'fixed_amount', discountValue: v }));
          const forward = applyPromotionStack(basePrice, promos);
          const reversed = applyPromotionStack(basePrice, [...promos].reverse());
          expect(forward).toBe(reversed);
        }
      )
    );
  });
});
```

## E2E Playwright Patterns

**Config:**
- Headless: `headless: true` by default (CLAUDE.md policy)
- Headed debugging: `HEADED=1 npm run test:e2e`
- Fast mode: `FAST_E2E=1 npm run test:e2e`
- Timeout: 60s per test, 10s per assertion (configurable)
- Browser: Chrome (real `channel: 'chrome'`, not Chromium)

**Spec Structure:**
```typescript
import { test, expect } from './fixtures';  // Custom fixture in e2e/fixtures.ts

test('closes tab and shows payment confirmation', async ({ page, loginAs }) => {
  await loginAs(page, 'admin');  // Login helper
  await page.goto('/pos');

  // Interaction
  await page.click('[data-testid="tab-123"]');
  await page.fill('input[name="amount"]', '50.00');
  await page.click('button:has-text("Process Payment")');

  // Assertion
  await expect(page).toHaveURL('/pos');
  await expect(page.locator('text=Payment successful')).toBeVisible();
});
```

**Helpers (in `e2e/helpers/`):**
- `auth.ts` — `loginAs(page, role)`, user creation
- `db.ts` — Test data setup (if needed)
- `assertions.ts` — Common assertions

**Recording:**
- Video: always on (`video: 'on'`)
- Trace: always on (`trace: 'on'`)
- Screenshot: on failure (`screenshot: 'on'`)
- Artifacts: `e2e-results/` (videos, traces, JSON reports)

**Running Specific Specs:**
```bash
npx playwright test e2e/05-payments.spec.ts
npx playwright test e2e/02-caja.spec.ts --headed  # Interactive
npx playwright test --grep "closes tab"  # By name pattern
```

## CI/CD & Automation

**Pre-commit (Git Hooks):**
- Husky + lint-staged (configured but `.husky/` is gitignored on fresh clone)
- Manual run before committing:
  ```bash
  npm run typecheck  # Must pass
  npm run lint       # Must pass
  npm run test       # Must pass (on local dev)
  ```

**Automated Test Suites:**
- Unit tests (`npm run test`) — fast, gating
- Playwright E2E (`npm run test:e2e`) — manual pre-release (not in CI)
- CI pipeline: TypeScript check + ESLint only (see `tauri-build` job)

## Testing Best Practices

1. **Test behavior, not implementation** — Don't mock internal functions; test inputs/outputs
2. **Use proper queries** — Prefer `getByRole()` / `getByLabelText()` over `getByTestId()`
3. **Avoid `waitFor()` with logic** — Use `screen.findBy*()` instead
4. **Isolate per test** — `beforeEach()` / `afterEach()` for setup/cleanup
5. **Test happy path + error cases** — Not every permutation, but success + main failures
6. **Mock at module boundary** — Not at the function level inside a module
7. **Use factories for complex fixtures** — Keep test data DRY
8. **Property tests for math** — `fast-check` for billing, discounts, etc.
9. **E2E for user flows** — End-to-end: login → action → success/error
10. **Headless by default** — Only use `--headed` for debugging

## Debugging Failed Tests

**Unit Test Debugging:**
```bash
npm run test:watch  # Watch mode with rerun on file change
npm run test:ui     # Browser UI (localhost:51204)
npx vitest run --inspect-brk src/path/to.test.ts  # Chrome DevTools
```

**E2E Debugging:**
```bash
HEADED=1 npx playwright test e2e/05-payments.spec.ts
# Opens real Chrome window — interact live, see failures
npx playwright show-report  # View trace/video from last run
```

**Common Issues:**
- **Test hangs** → Check for unresolved promises or infinite loops; reduce timeout
- **"Cannot find" errors** → Mock setup missing or wrong path aliases
- **Flaky tests** → Add proper async waits; avoid `setTimeout()`
- **E2E port conflict** — Ensure dev server (port 1420) isn't already running

---

*Testing analysis: 2026-08-10*
