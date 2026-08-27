# Coding Conventions

**Analysis Date:** 2026-08-10

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `POSButton.tsx`, `StatusBadge.tsx`, `InventoryPagePanel.tsx`)
- Utilities/functions: camelCase (e.g., `promotion-pricing.ts`, `billing-settings.ts`)
- Directories (features): kebab-case (e.g., `src/features/remove-tab-item/`, `src/features/split-tab/`)
- Test files: `<name>.test.ts` or `<name>.test.tsx`
- Story files: `<name>.stories.tsx`
- Integration tests: `<name>.integration.test.ts`

**Functions:**
- camelCase (e.g., `mapProductRow()`, `applyPromotionStack()`)
- Hooks use `use` prefix (e.g., `useRemoveTabItem()`, `useQuery()`)
- Async functions named with action verbs (e.g., `fetchTabData()`, `submitPayment()`)
- Private/internal functions can use leading underscore (e.g., `_validateInput()`)

**Variables:**
- camelCase for all variables (e.g., `tabId`, `orderItems`, `isLoading`)
- Boolean variables: `is` or `has` prefix (e.g., `isOnline`, `hasErrors`, `canDelete`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_ITEMS`, `DEFAULT_TIMEOUT`)

**Types:**
- PascalCase for type names (e.g., `Tab`, `OrderItem`, `AppError`)
- Interfaces: PascalCase with leading `I` optional (e.g., `RemoveTabItemInput`, `LogContext`)
- Union types: PascalCase (e.g., `AppErrorCode`, `LogLevel`)
- Zod schemas: PascalCase ending in `Schema` (e.g., `TabSchema`, `ProductSchema`)

**Query Keys:**
- Nested object pattern in `src/entities/*/model/queries.ts`
- Namespace-based (e.g., `tabKeys.all`, `tabKeys.list()`, `tabKeys.detail(id)`)
- Pattern: `{ all: ['tabs'], lists: [...], list: (filters) => [...], ... }`

## Code Style

**Formatting:**
- Tool: Prettier (`.prettierrc`)
- Semicolons: enabled (`semi: true`)
- Quotes: single quotes (`singleQuote: true`)
- Tab width: 2 spaces (`tabWidth: 2`)
- Print width: 100 characters (`printWidth: 100`)
- Trailing commas: ES5 mode (`trailingComma: 'es5'`)
- Arrow function parens: omit when single param (`arrowParens: 'avoid'`)
- Line endings: LF (`endOfLine: 'lf'`)

**Run before committing:**
```bash
npm run lint:fix    # Auto-fix ESLint issues
npm run format      # Run Prettier
npm run typecheck   # TypeScript strict check (no emit)
```

**Linting:**
- Tool: ESLint with flat config (`eslint.config.js`)
- TypeScript: strict type checking enabled
- Plugins: 
  - `typescript-eslint` (strict rules)
  - `react` / `react-hooks` / `react-refresh`
  - `jsx-a11y` (accessibility)
  - `import` (import ordering)
  - `boundaries` (FSD layer enforcement)
  - `tailwindcss` (Tailwind drift detection)
  - `i18next` (literal string enforcement in shared/ui/entities/features/widgets/pages layers)

**ESLint Rules (Key):**
- `@typescript-eslint/no-explicit-any: error` — No `any` without justification
- `@typescript-eslint/no-unused-vars: ['error', { argsIgnorePattern: '^_' }]` — Unused params marked with `_`
- `@typescript-eslint/consistent-type-imports: error` — Use `import type` for types
- `no-console: ['warn', { allow: ['warn', 'error'] }]` — Only warn/error console allowed
- `import/order: error` — Imports ordered by category then alphabetically
- `boundaries/dependencies: error` — FSD layer hierarchy strictly enforced
- `no-relative-import-paths: off` — Relative imports allowed (use path aliases instead)
- `i18next/no-literal-string: error` — Hardcoded UI strings banned in 5 layers (shared/ui, entities, features, widgets, pages)

## Import Organization

**Order (enforced by ESLint):**
1. Builtin Node modules (e.g., `import path from 'path'`)
2. External npm packages (e.g., `import React from 'react'`)
3. Internal aliases (path aliases below)
4. Relative imports (parent `../`, sibling `./*`)

**Path Aliases (from tsconfig.json):**
```
@app/*      → src/app/*
@pages/*    → src/pages/*
@widgets/*  → src/widgets/*
@features/* → src/features/*
@entities/* → src/entities/*
@shared/*   → src/shared/*
```

**Pattern:**
```typescript
// Builtin
import path from 'path';

// External
import React, { type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';

// Internal (FSD path aliases, alphabetically)
import { useStaffStore } from '@entities/staff/model/store';
import { useTabStore } from '@entities/tab/model/store';
import { Button } from '@shared/ui/button';
import { logger } from '@shared/lib/logger';

// Relative (rare)
import { localHelper } from './local-helper';
```

## Error Handling

**Pattern:** All async operations return `Result<T>` from `src/shared/lib/result.ts`

```typescript
type Result<T, E = AppError> = { ok: true; data: T } | { ok: false; error: E };

// Create success result
const result = ok(data);

// Create error result
const result = err({ code: 'NOT_FOUND', message: 'Tab not found' });

// Always check before using
if (!result.ok) {
  logger.error('action.failed', { code: result.error.code });
  return;
}
const tab = result.data; // typed as Tab, not null
```

**AppError Structure:**
```typescript
type AppError = {
  code: AppErrorCode;        // Machine-readable: 'NOT_FOUND', 'VALIDATION_ERROR', etc.
  message: string;           // User-safe message
  detail?: string;           // Technical details (logs only)
  raw?: unknown;             // Underlying error (logs only)
};
```

**Error Factories (use these, don't construct manually):**
```typescript
notFoundError(resource?: string)
validationError(fields: Record<string, string>)
networkOfflineError()
authForbiddenError(requiredRole: string)
supabaseError(message, detail?, raw?)
unknownError(raw?)
```

**Supabase Query Pattern:**
```typescript
const result = await supabaseQuery(() =>
  supabase.from('tabs').select('*').eq('id', tabId).single()
);

if (!result.ok) {
  logger.error('tab.fetch.failed', { code: result.error.code });
  return;
}

const tab = result.data; // Typed, no null
```

**Never throw unhandled errors** — use Result type instead. Only use `try/catch` inside Result wrappers or for initialization code.

## Logging

**Framework:** `src/shared/lib/logger.ts` — structured, namespaced, PII-safe

**Pattern:**
```typescript
import { logger } from '@shared/lib/logger-instance';

// Always use namespaced event names: "category.action"
logger.info('tab.opened', { tabId: '123', itemCount: 5 });
logger.error('payment.failed', { code: 'PAYMENT_DECLINED' }, rawError);
```

**Levels:** `debug < info < warn < error` (hierarchy-based filtering)

**PII Guard (TypeScript enforced):**
- Banned keys: `pin`, `cardNumber`, `cvv`, `password`, `fullName` (with amount), `rappiOrderId`, etc.
- Compiler errors if you try to log them
- Use `logger.sanitizePayload()` for untrusted input

**Rule:** Never log sensitive data. Log only:
- IDs (user ID, not name)
- Operation results
- Error codes (not full error traces in production)
- Event timing/metrics

**Development:** Pretty-printed to console with colors. Production: Minimal console + Tauri file + remote batching.

## Comments

**When to Comment:**
- Algorithm complexity or non-obvious logic
- Workarounds or temporary fixes (mark with `TODO`, `FIXME`, `HACK`)
- Performance-critical sections
- Security/PII considerations

**Avoid:**
- Over-commenting obvious code
- Redundant comments that restate the code

**JSDoc/TSDoc:**
- Required for:
  - All exported functions
  - Complex types
  - Public APIs
- Pattern:
  ```typescript
  /**
   * Applies a stack of promotions to a base price.
   *
   * @param basePrice - Starting price in dollars
   * @param promotions - Array of discounts (applied sequentially)
   * @returns Final price after all discounts, never negative
   */
  export function applyPromotionStack(
    basePrice: number,
    promotions: Promotion[]
  ): number { ... }
  ```

## Function Design

**Size:** Keep functions small (~20-40 lines is reasonable, >100 lines is a sign to refactor)

**Parameters:**
- Use object destructuring for multiple params (>2)
- Example: `function processPayment({ tabId, amount, method }: PaymentInput)`
- Avoid `props` or `options` as generic names — name the shape

**Return Values:**
- Use `Result<T>` for async operations that can fail
- Use tuples only when semantically necessary (rare)
- Don't return `undefined` alongside data — use `null` or `Result`

**Async Operations:**
- All async functions must return `Result<T>` (wrapped in `supabaseQuery()`, `supabaseMutation()`, etc.)
- Use `isOnline()` guard before mutations
- Always log failures with `logger.error()`

## Module Design

**Exports:**
- Export only what's needed — don't use `export *` (banned by ESLint)
- Keep interfaces/types internal unless they're part of the public contract
- Example good:
  ```typescript
  export function useRemoveTabItem() { ... }
  export interface RemoveTabItemInput { ... }
  ```

**Barrel Files:**
- Explicitly re-export only what's needed
- Example:
  ```typescript
  export { useRemoveTabItem, type RemoveTabItemInput } from './useRemoveTabItem';
  ```

**Entity Structure (from `src/entities/<name>/`):**
- `model/types.ts` — Domain types (Zod schemas)
- `model/store.ts` — Zustand state + Realtime subscriptions
- `model/queries.ts` — TanStack Query hooks + query keys
- `ui/` — Components and sub-components
- `index.ts` — Explicit exports only

**Feature Structure (from `src/features/<action-name>/`):**
- `use<ActionName>.ts` — Custom hook implementing the action
- `<ActionName>Component.tsx` — UI component using the hook
- `index.ts` — Explicit exports
- Pattern: one user action per folder

## TypeScript Gotchas (Critical)

**`exactOptionalPropertyTypes: true`** — Never write `prop?: string` for mutation inputs:
```typescript
// ❌ Wrong
interface CreateTabInput { name?: string }

// ✅ Correct
interface CreateTabInput { name: string | undefined }

// Default values still work normally
function create(input: CreateTabInput = { name: undefined }) { ... }
```

**`noUncheckedIndexedAccess: true`** — Array access returns `T | undefined`:
```typescript
const items = [1, 2, 3];
const first = items[0];  // typed as number | undefined

if (first !== undefined) {
  console.log(first);    // now safe
}
```

**No `any` without justification:**
```typescript
// ❌ Wrong
const x: any = response;

// ✅ Correct
const x: any = response; // eslint-disable-line @typescript-eslint/no-explicit-any -- pre-type-regen workaround
```

## Validation

**Zod is the single source of truth** — `src/shared/lib/domain.ts`

```typescript
// Define once in domain.ts
const TabSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'closed', 'voided']),
  total: z.number().min(0),
});

// Infer type (don't write it manually)
type Tab = z.infer<typeof TabSchema>;

// Validate external data
const parsed = TabSchema.parse(apiResponse);
```

**Validation at trust boundaries:**
- User input
- API responses
- Supabase query results
- Never assume external data is safe

## Styling

**Tailwind CSS + shadcn/ui**
- Use Tailwind classes for layout/spacing/colors
- Use `cn()` utility from `src/shared/lib/cn.ts` to merge class names
- CSS custom variables for theming (dark mode is default)
- Theme colors in `src/app/globals.css` (`@theme` block in Tailwind v4)
- No custom CSS in component files — use Tailwind or shadcn components first

**Example:**
```typescript
import { cn } from '@shared/lib/cn';

export function Button({ variant, className, ...props }) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg font-semibold',
        variant === 'primary' && 'bg-blue-600 text-white',
        variant === 'outline' && 'border border-gray-300',
        className
      )}
      {...props}
    />
  );
}
```

---

*Convention analysis: 2026-08-10*
