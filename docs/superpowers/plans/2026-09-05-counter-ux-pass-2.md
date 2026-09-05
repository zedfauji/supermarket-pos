# Counter UX Pass 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-lay-out the payments, promotions (dialog instead of wizard), checkout, settings, reports, inventory (with the product catalog moved in) and peek-window screens of the supermarket POS without touching any business logic.

**Architecture:** Feature-Sliced Design React 19 app (`app → pages → widgets → features → entities → shared`). Every change in this plan is presentational: page/widget/feature-UI JSX, one new `shared/ui` primitive (grouped vertical tabs), i18n catalogs, route wiring in `app/router.tsx`, and the unit/e2e tests that pin the UI. All data hooks, Zustand stores, Zod schemas, RPCs and RBAC maps are reused verbatim.

**Tech Stack:** React 19, TypeScript 5.8 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tailwind v4 with the "Counter" tokens in `src/app/globals.css`, shadcn/Radix primitives in `src/shared/ui`, TanStack Query v5, react-i18next, Vitest + RTL, Playwright (headless, `e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-05-counter-ux-pass-2-design.md` — read it first; every task below cites a section of it.

## Global Constraints

- Work only in this worktree: `D:\Projects\Code\supermarket-pos\.claude\worktrees\ui-redesign-astra-6bcac4`, branch `ui-redesign-fable`. Never check out, merge into, or push `main`. Run every command from the worktree root (it *is* the package root — `package.json`, `src/`, `e2e/` live here).
- **No business logic / domain / backend changes.** Do not edit: `src/shared/lib/domain.ts`, `src/shared/lib/domain-helpers.ts`, `src/shared/lib/rbac.ts`, `src/shared/lib/payment-processor.ts`, any `src/entities/*/model/queries.ts|store.ts|types.ts`, any `src/features/*/model/*`, `src/entities/promotion/model/promotion-pricing.ts`, anything under `supabase/`, `src-tauri/`. Do not change who can see what (every `can(...)`/`ProtectedAction` gate keeps its action).
- **No Supabase migrations or edge functions** — never call `apply_migration`, `deploy_edge_function`, `execute_sql`.
- Lint rules that will fail the build if ignored (`npm run lint` runs with `--max-warnings 0`):
  - `i18next/no-literal-string` (mode `all`) in `shared/ui`, `entities`, `features`, `widgets`, `pages`: every user-visible string goes through `t()`. Class strings, `data-testid`, `id`, `value`, `variant`, `size`, `type`, `key` attributes are exempt. Anything else literal needs `// eslint-disable-next-line i18next/no-literal-string -- <reason>`.
  - `no-restricted-syntax` UI-drift rules in `pages|widgets|features`: no raw `<button>` (use `Button`/`POSButton`), no raw `<input>` except `type="color|time|date|file"` (use `Input`/`MoneyInput`/`SearchInput`), no hex or `rgb()` literals, no arbitrary-value **spacing** classes (`p-[…]`, `gap-[…]`, `m-[…]`, `space-y-[…]`) — width/height/grid arbitrary values are fine.
  - No `.toFixed(2)` or `` `$${…}` `` for money — use `formatMoney()` / `<MoneyDisplay>`.
  - `tailwindcss/no-custom-classname`: only classes Tailwind can derive from `src/app/globals.css` tokens. Tokens available: `background foreground card popover muted primary secondary accent brand(-soft/-strong/-foreground) success(-soft/-strong) warning(-soft/-strong) destructive(-soft) border border-strong input ring sidebar-* surface surface-raised ink`. Never `text-amber-500` etc.
  - `import/order`: groups builtin → external → internal (`@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared` in that order) → parent → sibling, alphabetized. Run `npm run lint:fix` before `npm run lint`.
  - `@typescript-eslint/consistent-type-imports`: `import type { X }`.
  - FSD boundaries: `pages` may import `widgets|features|entities|shared`; `widgets` → `features|entities|shared` (+ other widgets); `features` → `entities|shared`; `shared` → nothing above it.
- TypeScript: with `exactOptionalPropertyTypes`, pass optional props conditionally: `{...(desc ? { description: desc } : {})}`. Array index access is `T | undefined`.
- i18n: two catalogs per namespace under `src/shared/lib/i18n/locales/{en-US,es-MX}/`. Every new key is added to **both**. es-MX values are real Spanish. Namespaces used here: `pages`, `settings`, `wPanels`, `wAdmin`, `common`, `entities`.
- Design tokens & conventions: `DESIGN-TOKENS.md` at the repo root. Radius outward md→lg→xl→2xl; `brand` is the only accent; `POSButton variant="brand"` is reserved for the one primary action per screen; eyebrows are `text-[0.6875rem] font-semibold tracking-[0.12em] uppercase text-muted-foreground`.
- Touch targets ≥ 44 px for anything a cashier taps.
- Tests: unit via `npx vitest run <file>`; e2e via `npx playwright test <spec> --reporter=line` (headless; the Playwright `webServer` block auto-starts `npm run dev` on port 1520 and reuses a running one; `.env.local` is present). Run only the targeted files named in each task; the full suite runs once in Task 12.
- Before every commit: `npm run typecheck && npm run lint && npx vitest run <touched test files>`. Commit with Conventional Commits and the trailer:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  ```

  Never `--no-verify`. Never `git stash` (shared stash stack) — if you must set work aside, make a WIP commit.
- E2E stable-selector contract (from the spec) — the accessible names, `data-testid`s and ids listed in each task's "Keep" bullet are load-bearing; do not rename them.

---

## File map

| Area | Create | Modify | Delete |
|---|---|---|---|
| Vertical tabs | `src/shared/ui/vertical-tabs.tsx`, `vertical-tabs.stories.tsx`, `vertical-tabs.test.tsx` | `src/shared/ui/index.ts` | |
| Inventory hub | `src/widgets/InventoryPagePanel/index.ts`, `ui/InventoryPagePanel.tsx`, `ui/StockTab.tsx`, `ui/CatalogTab.tsx`, `ui/MovementsTab.tsx`, `ui/NearExpiryTab.tsx` | `src/widgets/SettingsTabsPanel/index.ts`(x), `SettingsTabsPanel.test.tsx`, i18n `wAdmin`, e2e products/inventory/errors specs | `src/widgets/InventoryPagePanel.tsx`, `src/widgets/SettingsTabsPanel/tabs/ProductsSettingsTab.tsx` |
| Settings | | `src/widgets/SettingsTabsPanel/index.tsx`, i18n `settings` | |
| Reports | | `src/pages/reports/index.tsx`, i18n `pages` | |
| Promotions | `src/features/manage-promotions/ui/PromotionDialog.tsx`, `PromotionDialog.test.tsx`, `e2e/promotions/promotion-dialog-validation.spec.ts` | `src/pages/promotions/index.tsx`, `src/app/router.tsx`, `src/features/manage-promotions/index.ts`, `ui/wizard/StepReview.tsx`, `ui/wizard/StepValidityRecurrence.tsx`, i18n `wAdmin`, e2e promotions specs | `src/features/manage-promotions/ui/PromotionWizardPage.tsx`, `e2e/promotions/wizard-step-validation.spec.ts` |
| Payments | | `src/widgets/PaymentPane/ui/PaymentPane.tsx`, `src/widgets/PaymentModal/ui/PaymentForm.tsx`, `src/pages/payments/index.tsx`, i18n `wPanels`, `pages` | |
| Checkout | | `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`, `src/widgets/ProductGrid/ui/ProductGrid.tsx`, `src/entities/product/ui/ProductCard.tsx`, `src/entities/tab/ui/CartItem.tsx`, i18n `wPanels` | |
| Peek | | `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx`, i18n `wPanels` | |
| Docs | | `DESIGN-TOKENS.md`, `CLAUDE.md` | |

---

### Task 1: `VerticalTabs` shared primitive

**Spec:** §1.

**Files:**
- Create: `src/shared/ui/vertical-tabs.tsx`, `src/shared/ui/vertical-tabs.stories.tsx`, `src/shared/ui/vertical-tabs.test.tsx`
- Modify: `src/shared/ui/index.ts` (Navigation section)

**Interfaces:**
- Produces: `VerticalTabsList`, `VerticalTabsGroupLabel`, `VerticalTabsTrigger` (props `{ value: string; label: string; icon?: LucideIcon; description?: string; badge?: ReactNode; className?: string; disabled?: boolean }`), all exported from `@shared/ui`. Consumers wrap them in the existing `<Tabs orientation="vertical">` / `<TabsContent>` from `@shared/ui/tabs`.

- [ ] **Step 1: Write the failing test**

`src/shared/ui/vertical-tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Printer } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent } from './tabs';
import { VerticalTabsGroupLabel, VerticalTabsList, VerticalTabsTrigger } from './vertical-tabs';

function Fixture() {
  return (
    <Tabs defaultValue="hardware" orientation="vertical">
      <VerticalTabsList aria-label="Settings sections">
        <VerticalTabsGroupLabel>Receipts</VerticalTabsGroupLabel>
        <VerticalTabsTrigger
          value="hardware"
          icon={Printer}
          label="Hardware"
          description="Printer, paper width and drawer"
        />
        <VerticalTabsTrigger value="email" label="Email Receipts" />
      </VerticalTabsList>
      <TabsContent value="hardware">Hardware body</TabsContent>
      <TabsContent value="email">Email body</TabsContent>
    </Tabs>
  );
}

describe('VerticalTabs', () => {
  it('exposes each trigger as a tab whose accessible name is the label only', () => {
    render(<Fixture />);
    expect(screen.getByRole('tab', { name: 'Hardware', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email Receipts', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /paper width/i })).not.toBeInTheDocument();
  });

  it('marks the default tab active and renders its panel', () => {
    render(<Fixture />);
    expect(screen.getByRole('tab', { name: 'Hardware' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Hardware body')).toBeInTheDocument();
  });

  it('renders the group label as decorative text', () => {
    render(<Fixture />);
    expect(screen.getByText('Receipts')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/shared/ui/vertical-tabs.test.tsx`
Expected: FAIL — cannot resolve `./vertical-tabs`.

- [ ] **Step 3: Implement the primitive**

`src/shared/ui/vertical-tabs.tsx`:

```tsx
/**
 * VERTICAL TABS
 *
 * Grouped, left-rail tab navigation for settings-style and report-style
 * pages. Thin styling over the Radix Tabs primitives in ./tabs so every
 * trigger keeps role="tab" and every consumer keeps using <Tabs>/<TabsContent>.
 * Below the `lg` breakpoint the rail collapses to a horizontally scrolling
 * row; group labels and descriptions hide there.
 */

import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@shared/lib/utils';

import { TabsList, TabsTrigger } from './tabs';

export function VerticalTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        'flex h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 text-muted-foreground',
        'lg:flex-col lg:gap-0.5 lg:overflow-visible',
        className
      )}
      {...props}
    />
  );
}

export function VerticalTabsGroupLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      aria-hidden="true"
      className={cn(
        'hidden px-3 pt-4 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase first:pt-1 lg:block',
        className
      )}
    >
      {children}
    </p>
  );
}

export interface VerticalTabsTriggerProps
  extends Omit<React.ComponentProps<typeof TabsTrigger>, 'children'> {
  label: string;
  icon?: LucideIcon;
  /** One-line hint under the label. Decorative — excluded from the accessible name. */
  description?: string;
  /** Trailing element (count badge). Keep it text-free or it joins the accessible name. */
  badge?: React.ReactNode;
}

export function VerticalTabsTrigger({
  label,
  icon: Icon,
  description,
  badge,
  className,
  ...props
}: VerticalTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        'group/vtab relative h-auto min-h-11 flex-none justify-start gap-3 rounded-lg px-3 py-2 text-left whitespace-normal',
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
        'lg:w-full',
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-0 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand opacity-0 transition-opacity duration-150 group-data-[state=active]/vtab:opacity-100 lg:block"
      />
      {Icon && (
        <Icon
          className="size-4 shrink-0 text-muted-foreground transition-colors group-data-[state=active]/vtab:text-brand"
          aria-hidden="true"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        {description && (
          <span
            aria-hidden="true"
            className="hidden truncate text-xs font-normal text-muted-foreground lg:block"
          >
            {description}
          </span>
        )}
      </span>
      {badge}
    </TabsTrigger>
  );
}
```

Add to `src/shared/ui/index.ts` under `// Navigation`:

```ts
export { VerticalTabsList, VerticalTabsGroupLabel, VerticalTabsTrigger } from './vertical-tabs';
export type { VerticalTabsTriggerProps } from './vertical-tabs';
```

- [ ] **Step 4: Storybook story**

`src/shared/ui/vertical-tabs.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatabaseBackup, Languages, Mail, Printer, Store } from 'lucide-react';
import { Tabs, TabsContent } from './tabs';
import { VerticalTabsGroupLabel, VerticalTabsList, VerticalTabsTrigger } from './vertical-tabs';

/**
 * VerticalTabs — grouped left-rail navigation used by Settings and Reports.
 * Collapses to a horizontal scrolling row below the `lg` breakpoint.
 */
const meta = {
  title: 'Shared/UI/VerticalTabs',
  component: VerticalTabsTrigger,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof VerticalTabsTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grouped: Story = {
  args: { value: 'general', label: 'General' },
  render: () => (
    <Tabs defaultValue="general" orientation="vertical" className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <VerticalTabsList aria-label="Settings sections" className="self-start">
        <VerticalTabsGroupLabel>Personal</VerticalTabsGroupLabel>
        <VerticalTabsTrigger value="language" icon={Languages} label="Language" description="Interface language for your account" />
        <VerticalTabsGroupLabel>Store</VerticalTabsGroupLabel>
        <VerticalTabsTrigger value="general" icon={Store} label="General" description="Name, address, timezone" />
        <VerticalTabsGroupLabel>Receipts & hardware</VerticalTabsGroupLabel>
        <VerticalTabsTrigger value="hardware" icon={Printer} label="Hardware" description="Printer, paper, drawer" />
        <VerticalTabsTrigger value="email" icon={Mail} label="Email Receipts" description="Sender and test email" />
        <VerticalTabsGroupLabel>Security & data</VerticalTabsGroupLabel>
        <VerticalTabsTrigger value="backup" icon={DatabaseBackup} label="Backup" description="Snapshots and restore" />
      </VerticalTabsList>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <TabsContent value="language">Language body</TabsContent>
        <TabsContent value="general">General body</TabsContent>
        <TabsContent value="hardware">Hardware body</TabsContent>
        <TabsContent value="email">Email body</TabsContent>
        <TabsContent value="backup">Backup body</TabsContent>
      </div>
    </Tabs>
  ),
};
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run src/shared/ui/vertical-tabs.test.tsx && npm run typecheck && npm run lint`
Expected: 3 tests pass; no type or lint errors (story files are lint-exempt from i18n).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ui/vertical-tabs.tsx src/shared/ui/vertical-tabs.stories.tsx src/shared/ui/vertical-tabs.test.tsx src/shared/ui/index.ts
git commit -m "feat(ui): add VerticalTabs grouped left-rail tab primitive

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Move the product catalog from Settings to Inventory (IA move only)

**Spec:** §7 (Catalog tab), §5 (Products removed from Settings), §7 "E2E updates for the Products move".

**Files:**
- Create: `src/widgets/InventoryPagePanel/index.ts`, `src/widgets/InventoryPagePanel/ui/InventoryPagePanel.tsx` (moved), `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx`
- Delete: `src/widgets/InventoryPagePanel.tsx`, `src/widgets/SettingsTabsPanel/tabs/ProductsSettingsTab.tsx`
- Modify: `src/widgets/SettingsTabsPanel/index.tsx`, `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`, `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json`, `e2e/products/product-management.spec.ts`, `e2e/products/categories.spec.ts`, `e2e/inventory/open-units.spec.ts`, `e2e/errors/error-scenarios-and-validation.spec.ts`, `e2e/home/home-navigation.spec.ts` (comment), `e2e/settings/i18n-locale-switch.spec.ts` (comment)

**Interfaces:**
- Produces: `@widgets/InventoryPagePanel` still exports `InventoryPagePanel` (folder index). `CatalogTab({ currentRole })` in `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx`. Inventory tab values: `stock | catalog | open-units | near-expiry` (Task 3 adds `movements`). i18n key `wAdmin:inventoryPagePanel.catalogTabLabel`.
- Keep (e2e/unit contract): inventory tab labels `Stock`/`Existencias`, `Open Units`/`Unidades abiertas`, `Near Expiry`/`Próxima caducidad`; nested catalog tabs `Products`, `Categories`, `Modifiers`, `Modifier Groups`; `Add product` button; settings tabs `Language/Idioma`, `General`, `Hardware`, `Email Receipts`, `Backup`, `Near Expiry`, `Auto-Lock Timeout`, `Billing`; cashier on `/settings` sees exactly one `role=tab`.

- [ ] **Step 1: Move the widget into a folder**

```bash
mkdir -p src/widgets/InventoryPagePanel/ui
git mv src/widgets/InventoryPagePanel.tsx src/widgets/InventoryPagePanel/ui/InventoryPagePanel.tsx
git mv src/widgets/SettingsTabsPanel/tabs/ProductsSettingsTab.tsx src/widgets/InventoryPagePanel/ui/CatalogTab.tsx
```

Create `src/widgets/InventoryPagePanel/index.ts`:

```ts
export { InventoryPagePanel } from './ui/InventoryPagePanel';
```

In `ui/InventoryPagePanel.tsx` change the relative import `import { OpenUnitsTab } from './OpenUnitsTab';` to `import { OpenUnitsTab } from '@widgets/OpenUnitsTab';` (keep import-order groups: it belongs with the `@widgets` internal group, before `@entities`).

- [ ] **Step 2: Turn `ProductsSettingsTab` into `CatalogTab`**

Rewrite `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx` (same body, new name, keeps the `manage_products` gate):

```tsx
import { useTranslation } from 'react-i18next';
import { CategoryTreeEditor } from '@features/manage-categories';
import { ModifierGroupEditor } from '@features/manage-modifier-groups';
import { CatalogModifiersTab, CatalogProductsTab } from '@features/manage-products';
import type { UserRole } from '@shared/lib/domain';
import { ProtectedAction } from '@shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';

type Props = {
  currentRole: UserRole | null;
};

/**
 * Product catalog management (products, categories, modifiers, modifier
 * groups). Lived under Settings › Products until the 2026-09 UX pass; it is
 * inventory work, so it now renders as the Inventory page's "Catalog" tab.
 */
export function CatalogTab({ currentRole }: Props) {
  const { t } = useTranslation('wAdmin');
  return (
    <ProtectedAction action="manage_products" currentRole={currentRole}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('productsSettingsTab.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('productsSettingsTab.description')}</p>
        </div>
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="products">{t('productsSettingsTab.tabProducts')}</TabsTrigger>
            <TabsTrigger value="categories">{t('productsSettingsTab.tabCategories')}</TabsTrigger>
            <TabsTrigger value="modifiers">{t('productsSettingsTab.tabModifiers')}</TabsTrigger>
            <TabsTrigger value="modifier-groups">
              {t('productsSettingsTab.tabModifierGroups')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <CatalogProductsTab />
          </TabsContent>
          <TabsContent value="categories">
            <CategoryTreeEditor />
          </TabsContent>
          <TabsContent value="modifiers">
            <CatalogModifiersTab />
          </TabsContent>
          <TabsContent value="modifier-groups">
            <ModifierGroupEditor />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedAction>
  );
}
```

- [ ] **Step 3: Add the Catalog tab to the inventory panel**

In `ui/InventoryPagePanel.tsx`:

1. Add imports: `import { usePermissions } from '@entities/staff/model/usePermissions';` and `import { CatalogTab } from './CatalogTab';`.
2. Inside `InventoryPagePanel()` after `const staffId = …` add `const { can } = usePermissions(); const canManageProducts = can('manage_products');`.
3. In the `TabsList`, insert after the `stock` trigger:

```tsx
        {canManageProducts && (
          <TabsTrigger value="catalog">{t('inventoryPagePanel.catalogTabLabel')}</TabsTrigger>
        )}
```

4. Insert after the `stock` `TabsContent`:

```tsx
      {canManageProducts && (
        <TabsContent value="catalog">
          <CatalogTab currentRole={currentRole ?? null} />
        </TabsContent>
      )}
```

(`currentRole` is already `currentStaff?.role`, typed `UserRole | undefined` — coalesce to `null` for the prop.)

- [ ] **Step 4: Remove Products from Settings**

In `src/widgets/SettingsTabsPanel/index.tsx`: delete the `ProductsSettingsTab` import and, inside `if (canManageProducts) { out.push( … ) }`, remove the `products` entry so only the `billing` entry remains. Keep the `canManageProducts` gate for Billing unchanged.

- [ ] **Step 5: i18n keys**

`wAdmin.json` — add `"catalogTabLabel"` inside `inventoryPagePanel` and update `productsSettingsTab.title/description`:

en-US:
```json
"catalogTabLabel": "Catalog",
```
```json
"productsSettingsTab": {
  "title": "Catalog",
  "description": "Products, categories, modifiers and modifier groups sold at this store. Changes apply immediately after save.",
```
es-MX:
```json
"catalogTabLabel": "Catálogo",
```
```json
"productsSettingsTab": {
  "title": "Catálogo",
  "description": "Productos, categorías, modificadores y grupos de modificadores de la tienda. Los cambios se aplican de inmediato al guardar.",
```
(keep the four `tab*` keys as they are.)

- [ ] **Step 6: Update the unit test**

In `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`:
- Delete the `vi.mock('./tabs/ProductsSettingsTab', …)` block.
- In "shows manager tabs when only manage_products is granted": replace `expect(screen.getByRole('tab', { name: 'Products' })).toBeInTheDocument();` with `expect(screen.queryByRole('tab', { name: 'Products' })).not.toBeInTheDocument();` (Billing assertion stays).
- In the admin test: replace the `Products` `getByRole` assertion with the same `queryByRole … not.toBeInTheDocument()`.

Run: `npx vitest run src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx` → PASS.

- [ ] **Step 7: Update the e2e specs for the new location**

`e2e/products/product-management.spec.ts` — replace the body of `navigateToProductsSettingsTab` (keep the function name to minimise churn; fix the docblock to say "Inventory › Catalog"):

```ts
async function navigateToProductsSettingsTab(
  page: Parameters<typeof loginAs>[0],
  subTab: 'products' | 'categories' = 'products'
): Promise<boolean> {
  await page.goto('/inventory');
  const catalogTab = page.getByRole('tab', { name: 'Catalog' });
  const catalogTabVisible = await catalogTab.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!catalogTabVisible) return false;
  await catalogTab.click();
  // Nested catalog tabs: "Products" is selected by default.
  await page.getByRole('tab', { name: 'Products' }).click();

  if (subTab === 'categories') {
    const categoriesSubTab = page.getByRole('tab', { name: 'Categories' });
    const visible = await categoriesSubTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!visible) return false;
    await categoriesSubTab.click();
  }
  return true;
}
```

`e2e/products/categories.spec.ts` — in T1 and every test that does `await page.goto('/settings'); await page.getByRole('tab', { name: 'Products' }).click();` replace with:

```ts
    await page.goto('/inventory');
    await page.getByRole('tab', { name: 'Catalog' }).click();
```

In T1 change the heading assertion to `page.getByRole('heading', { name: 'Inventory' })`. In T8 (cashier): `goto('/inventory')`, assert `page.getByRole('heading', { name: /inventory|inventario/i })` visible, and `await expect(page.getByRole('tab', { name: /^(Catalog|Catálogo)$/ })).toHaveCount(0);` (drop the `Idioma` assertion — it belonged to Settings). Update the test title to "T8: cashier sees no Catalog tab on Inventory".

`e2e/inventory/open-units.spec.ts` step 1:

```ts
      await page.goto('/inventory');
      await page.getByRole('tab', { name: 'Catalog' }).click();
```

`e2e/errors/error-scenarios-and-validation.spec.ts` FV7 — replace the `prodTab` lines with:

```ts
    const catalogTab = page.getByRole('tab', { name: /catalog|catálogo/i });
    if (await catalogTab.isVisible({ timeout: 3_000 }).catch(() => false)) await catalogTab.click();
```

`e2e/home/home-navigation.spec.ts` T11 and `e2e/settings/i18n-locale-switch.spec.ts` (~line 187): edit the comments that list "Products" among the settings tabs (say "Products now lives under Inventory › Catalog"); no assertion changes.

- [ ] **Step 8: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx src/widgets/OpenUnitsTab.test.tsx
npx playwright test e2e/products/categories.spec.ts e2e/products/product-management.spec.ts e2e/settings/i18n-locale-switch.spec.ts --reporter=line
```
Expected: all green. If a products spec fails on the nested `Products` click because it is already selected, that click is harmless (Radix keeps it active) — investigate the actual failure line before changing anything else.

- [ ] **Step 9: Commit**

```bash
git add -A src/widgets/InventoryPagePanel src/widgets/InventoryPagePanel.tsx src/widgets/SettingsTabsPanel src/shared/lib/i18n e2e/products e2e/inventory/open-units.spec.ts e2e/errors/error-scenarios-and-validation.spec.ts e2e/home/home-navigation.spec.ts e2e/settings/i18n-locale-switch.spec.ts
git commit -m "feat(ui): move product catalog from Settings to Inventory › Catalog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Inventory depth — Stock filters, Movements tab, Near-expiry polish

**Spec:** §7 Stock / Movements / Near Expiry tabs.

**Files:**
- Create: `src/widgets/InventoryPagePanel/ui/StockTab.tsx`, `ui/MovementsTab.tsx`, `ui/NearExpiryTab.tsx`
- Modify: `src/widgets/InventoryPagePanel/ui/InventoryPagePanel.tsx` (becomes the shell), i18n `wAdmin` + `pages`

**Interfaces:**
- Consumes: `CatalogTab` (Task 2), `OpenUnitsTab` (`@widgets/OpenUnitsTab`), entity hooks `useInventory`, `useNearExpiryAlerts`, `useInventoryLog`, `useMutationAdjustInventory` (`@entities/inventory`), `inventoryRowColumns` (`@entities/inventory`), `useStaffList` (`@entities/staff/model/queries`).
- Produces: `StockTab({ onOpenCatalog })`, `MovementsTab()`, `NearExpiryTab()`. Tab values `stock | catalog | open-units | near-expiry | movements`.
- Keep: `#inv-category-filter` select must be the **last focusable control before the table** (a11y spec tabs from it to the Product column header); buttons `Adjust` (exact) and `Export CSV`; batch dialog title `Batch adjustment` with `#batch-product`, delta label `Quantity delta`, `Reason` select, Cancel then Apply; stats text `Total SKUs`, `Low stock`, `Out of stock`; `data-testid="physical-count-btn"` lives in the page header (untouched).

- [ ] **Step 1: Split the shell**

Rewrite `ui/InventoryPagePanel.tsx` to only compose tabs:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OpenUnitsTab } from '@widgets/OpenUnitsTab';
import { useStaffStore } from '@entities/staff/model/store';
import { usePermissions } from '@entities/staff/model/usePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { CatalogTab } from './CatalogTab';
import { MovementsTab } from './MovementsTab';
import { NearExpiryTab } from './NearExpiryTab';
import { StockTab } from './StockTab';

type InventoryTab = 'stock' | 'catalog' | 'open-units' | 'near-expiry' | 'movements';

export function InventoryPagePanel() {
  const { t } = useTranslation('wAdmin');
  const currentRole = useStaffStore(s => s.currentStaff?.role ?? null);
  const { can } = usePermissions();
  const canManageProducts = can('manage_products');
  const [tab, setTab] = useState<InventoryTab>('stock');

  return (
    <Tabs
      value={tab}
      onValueChange={next => {
        setTab(next as InventoryTab);
      }}
      className="w-full"
    >
      <TabsList className="mb-4 h-auto flex-wrap">
        <TabsTrigger value="stock">{t('inventoryPagePanel.stockTabLabel')}</TabsTrigger>
        {canManageProducts && (
          <TabsTrigger value="catalog">{t('inventoryPagePanel.catalogTabLabel')}</TabsTrigger>
        )}
        <TabsTrigger value="open-units">{t('inventoryPagePanel.openUnitsTabLabel')}</TabsTrigger>
        <TabsTrigger value="near-expiry">{t('inventoryPagePanel.nearExpiryTabLabel')}</TabsTrigger>
        <TabsTrigger value="movements">{t('inventoryPagePanel.movementsTabLabel')}</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <StockTab
          onOpenCatalog={
            canManageProducts
              ? () => {
                  setTab('catalog');
                }
              : undefined
          }
        />
      </TabsContent>
      {canManageProducts && (
        <TabsContent value="catalog">
          <CatalogTab currentRole={currentRole} />
        </TabsContent>
      )}
      <TabsContent value="open-units">
        <OpenUnitsTab />
      </TabsContent>
      <TabsContent value="near-expiry">
        <NearExpiryTab />
      </TabsContent>
      <TabsContent value="movements">
        <MovementsTab />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: `StockTab.tsx`**

Move everything stock-related out of the old file (the `stockSortPriority`, `sortInventoryRows`, `rowHighlightClass`, CSV helpers, the stats/actions row, the on-hand `DataTable`, the batch dialog). Drop the change-log `<section>` (moves to MovementsTab). Then apply these changes inside `StockTab`:

Props: `{ onOpenCatalog: (() => void) | undefined }`.

State additions:

```ts
type StockFilter = 'all' | 'low' | 'out' | 'near-expiry';
const [stockFilter, setStockFilter] = useState<StockFilter>('all');
const [search, setSearch] = useState('');
```

Derived values (replace the old `stats`/`displayedRows` memos):

```ts
const nearExpiryIds = useMemo(
  () => new Set((nearExpiryAlerts ?? []).map(alert => alert.productId)),
  [nearExpiryAlerts]
);

const stats = useMemo(() => {
  const rows = data ?? [];
  let lowStock = 0;
  let outOfStock = 0;
  let stockValue = 0;
  let withoutCost = 0;
  for (const r of rows) {
    if (r.quantityOnHand === 0) outOfStock += 1;
    else if (r.quantityOnHand <= r.lowStockThreshold) lowStock += 1;
    if (r.costPrice != null) stockValue += r.quantityOnHand * r.costPrice;
    else withoutCost += 1;
  }
  return {
    totalSkus: rows.length,
    lowStock,
    outOfStock,
    nearExpiry: nearExpiryIds.size,
    stockValue: Math.round(stockValue * 100) / 100,
    withoutCost,
  };
}, [data, nearExpiryIds]);

const displayedRows = useMemo(() => {
  const query = search.trim().toLowerCase();
  let rows = data ?? [];
  if (categoryFilter !== '__all__') {
    rows = rows.filter(r => (r.product?.category?.name ?? '') === categoryFilter);
  }
  if (stockFilter === 'low') {
    rows = rows.filter(r => r.quantityOnHand > 0 && r.quantityOnHand <= r.lowStockThreshold);
  } else if (stockFilter === 'out') {
    rows = rows.filter(r => r.quantityOnHand === 0);
  } else if (stockFilter === 'near-expiry') {
    rows = rows.filter(r => nearExpiryIds.has(r.productId));
  }
  if (query) {
    rows = rows.filter(r => {
      const p = r.product;
      return (
        (p?.name ?? '').toLowerCase().includes(query) ||
        (p?.sku ?? '').toLowerCase().includes(query) ||
        (p?.barcode ?? '').toLowerCase().includes(query)
      );
    });
  }
  return sortInventoryRows(rows);
}, [data, categoryFilter, stockFilter, search, nearExpiryIds]);
```

Filter tiles — replace the three static stat cards with this component defined in the same file:

```tsx
function FilterTile({
  label,
  value,
  tone,
  pressed,
  onClick,
}: {
  label: string;
  value: ReactNode;
  tone: 'default' | 'warning' | 'destructive';
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'h-auto min-w-[9rem] flex-col items-start gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-xs hover:bg-card',
        'transition-[border-color,box-shadow] duration-150 hover:border-border-strong',
        pressed && 'border-brand ring-2 ring-brand/30'
      )}
    >
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          'text-numeric text-2xl font-semibold',
          tone === 'warning' && 'text-warning-strong',
          tone === 'destructive' && 'text-destructive'
        )}
      >
        {value}
      </span>
    </Button>
  );
}
```

Render the tiles row (`flex flex-wrap items-stretch gap-3`): `All SKUs` (`stats.totalSkus`, tone default, pressed when `stockFilter === 'all'`, onClick → `'all'`), `Low stock` (warning if > 0, toggles `'low'`), `Out of stock` (destructive if > 0, toggles `'out'`), `Near expiry` (warning if > 0, toggles `'near-expiry'`). Toggle helper: `const toggle = (f: StockFilter) => setStockFilter(prev => (prev === f ? 'all' : f));`. Then a non-interactive stock-value card:

```tsx
<div className="min-w-[11rem] rounded-xl border border-border bg-muted/40 px-4 py-3">
  <div className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
    {t('inventoryPagePanel.stockValue')}
  </div>
  <MoneyDisplay amount={stats.stockValue} size="lg" className="mt-1 block" />
  {stats.withoutCost > 0 && (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {t('inventoryPagePanel.stockValueHint', { count: stats.withoutCost })}
    </p>
  )}
</div>
```

Keep the `Adjust` / `Export CSV` buttons in the same row (`ml-auto`).

Quick links row (only when `onOpenCatalog` or the role can adjust — use `ProtectedAction`-free rendering: show the row when `currentRole` can `adjust_inventory` via `canAccess(currentRole, 'adjust_inventory')` from `@shared/lib/rbac`):

```tsx
<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
  <span className="text-muted-foreground">{t('inventoryPagePanel.quickLinksLabel')}</span>
  <Button variant="link" className="h-auto p-0" asChild>
    <Link to="/suppliers">
      <Truck className="size-4" aria-hidden="true" />
      {t('inventoryPagePanel.quickLinkReceive')}
    </Link>
  </Button>
  <Button variant="link" className="h-auto p-0" asChild>
    <Link to="/purchase-orders">
      <FileText className="size-4" aria-hidden="true" />
      {t('inventoryPagePanel.quickLinkPurchaseOrders')}
    </Link>
  </Button>
  {onOpenCatalog && (
    <Button variant="link" className="h-auto p-0" onClick={onOpenCatalog}>
      <Tags className="size-4" aria-hidden="true" />
      {t('inventoryPagePanel.quickLinkCatalog')}
    </Button>
  )}
</div>
```

Toolbar: put the `SearchInput` **before** the category `<label>`/`<select>` in DOM order (search first, category select last):

```tsx
const toolbar = (
  <div className="flex flex-wrap items-center gap-3">
    <SearchInput
      value={search}
      onChange={setSearch}
      placeholder={t('inventoryPagePanel.searchPlaceholder')}
      className="w-64"
    />
    <label htmlFor="inv-category-filter" className="text-sm text-muted-foreground">
      {t('inventoryPagePanel.categoryLabel')}
    </label>
    <select id="inv-category-filter" …unchanged… />
  </div>
);
```

Empty state for the filtered table: when `(data?.length ?? 0) > 0 && displayedRows.length === 0` show `t('inventoryPagePanel.noRowsForFilter')`.

Imports needed in `StockTab.tsx`: `Link` from `react-router-dom`; `FileText, Tags, Truck` from `lucide-react`; `Button` from `@shared/ui/button`; `MoneyDisplay` from `@shared/ui/MoneyDisplay`; `SearchInput` from `@shared/ui/SearchInput`; `canAccess` from `@shared/lib/rbac`; `type ReactNode` from `react`.

- [ ] **Step 3: `MovementsTab.tsx`**

```tsx
import { ArrowDownUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory, useInventoryLog } from '@entities/inventory';
import { useStaffList } from '@entities/staff/model/queries';
import { cn } from '@shared/lib/utils';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { EmptyState } from '@shared/ui/EmptyState';
import { SectionHeader } from '@shared/ui/SectionHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table';

// Reason enum values come from InventoryAdjustReasonSchema (domain.ts); the
// label keys already exist for the batch-adjustment reason picker.
const REASON_LABEL_KEY: Record<string, string> = {
  waste: 'inventoryPagePanel.reasonOptionWaste',
  expired: 'inventoryPagePanel.reasonOptionExpired',
  delivery: 'inventoryPagePanel.reasonOptionDelivery',
  correction: 'inventoryPagePanel.reasonOptionCorrection',
  manual_adjustment: 'inventoryPagePanel.reasonOptionManualAdjustment',
  physical_count: 'inventoryPagePanel.reasonOptionPhysicalCount',
  sale: 'inventoryPagePanel.reasonOptionSale',
};

const FILTERS = ['all', 'delivery', 'sale', 'waste', 'expired', 'correction', 'manual_adjustment', 'physical_count'] as const;
type ReasonFilter = (typeof FILTERS)[number];

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function MovementsTab() {
  const { t, i18n } = useTranslation('wAdmin');
  const { data: logs, isLoading } = useInventoryLog();
  const { data: inventory } = useInventory();
  const { data: staff } = useStaffList();
  const [filter, setFilter] = useState<ReasonFilter>('all');

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of inventory ?? []) {
      if (row.product) map.set(row.productId, row.product.name);
    }
    return map;
  }, [inventory]);

  const staffNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staff ?? []) map.set(s.id, s.name);
    return map;
  }, [staff]);

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  );

  const visible = (logs ?? []).filter(log => filter === 'all' || log.reason === filter);

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <SectionHeader
        title={t('inventoryPagePanel.changeLogTitle')}
        description={t('inventoryPagePanel.changeLogDescription')}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('inventoryPagePanel.reasonFilterLabel')}>
        {FILTERS.map(value => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
            }}
          >
            {value === 'all'
              ? t('inventoryPagePanel.reasonFilterAll')
              : t(REASON_LABEL_KEY[value] ?? 'inventoryPagePanel.reasonFilterAll')}
          </Button>
        ))}
      </div>
      {!isLoading && visible.length === 0 ? (
        <EmptyState
          icon={ArrowDownUp}
          title={t('inventoryPagePanel.noLogEntries')}
          description={t('inventoryPagePanel.noLogEntriesBody')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventoryPagePanel.columnWhen')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnProduct')}</TableHead>
                <TableHead className="text-right">{t('inventoryPagePanel.columnDelta')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnReason')}</TableHead>
                <TableHead>{t('inventoryPagePanel.columnStaff')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {t('inventoryPagePanel.loading')}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatter.format(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {productNames.get(log.productId) ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {shortId(log.productId)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        log.quantityDelta > 0 ? 'text-success-strong' : 'text-destructive'
                      )}
                    >
                      {log.quantityDelta > 0 ? `+${String(log.quantityDelta)}` : String(log.quantityDelta)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">
                        {t(REASON_LABEL_KEY[log.reason] ?? 'inventoryPagePanel.reasonOptionManualAdjustment')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {staffNames.get(log.staffId) ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {shortId(log.staffId)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
```

(If `useStaffList` is not exported from `@entities/staff` index, import it from `@entities/staff/model/queries` as shown — that is a read hook, allowed.)

- [ ] **Step 4: `NearExpiryTab.tsx`**

```tsx
import { PackageX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNearExpiryAlerts } from '@entities/inventory';
import { Badge } from '@shared/ui/badge';
import { EmptyState } from '@shared/ui/EmptyState';
import { SectionHeader } from '@shared/ui/SectionHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table';

function urgency(days: number): 'destructive' | 'warning' | 'muted' {
  if (days <= 3) return 'destructive';
  if (days <= 7) return 'warning';
  return 'muted';
}

export function NearExpiryTab() {
  const { t } = useTranslation('wAdmin');
  const { t: tEntities } = useTranslation('entities');
  const { data: alerts, isEmpty } = useNearExpiryAlerts();
  const rows = [...(alerts ?? [])].sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  if (isEmpty) {
    return (
      <EmptyState
        icon={PackageX}
        title={t('inventoryPagePanel.nothingExpiringSoonTitle')}
        description={t('inventoryPagePanel.nothingExpiringSoonBody')}
      />
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <SectionHeader
        title={t('inventoryPagePanel.nearExpiryTabLabel')}
        description={t('inventoryPagePanel.nearExpiryDescription')}
        badge={rows.length}
      />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tEntities('inventoryRow.columns.product')}</TableHead>
              <TableHead>{t('inventoryPagePanel.expiryDate')}</TableHead>
              <TableHead>{t('inventoryPagePanel.daysRemaining')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(alert => (
              <TableRow key={alert.productId}>
                <TableCell className="font-medium">{alert.productName}</TableCell>
                <TableCell className="text-muted-foreground">{alert.expiryDate}</TableCell>
                <TableCell>
                  <Badge variant={urgency(alert.daysUntilExpiry)} className="tabular-nums">
                    {t('inventoryPagePanel.daysBadge', { count: alert.daysUntilExpiry })}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: i18n keys (`wAdmin.json` → `inventoryPagePanel`)**

en-US:
```json
"movementsTabLabel": "Movements",
"searchPlaceholder": "Search product, SKU or barcode…",
"filterAllSkus": "All SKUs",
"nearExpiry": "Near expiry",
"stockValue": "Stock value (at cost)",
"stockValueHint_one": "{{count}} product without a cost price",
"stockValueHint_other": "{{count}} products without a cost price",
"quickLinksLabel": "Go to",
"quickLinkReceive": "Receive shipment",
"quickLinkPurchaseOrders": "Purchase orders",
"quickLinkCatalog": "Catalog",
"noRowsForFilter": "No products match these filters.",
"columnProduct": "Product",
"columnStaff": "Staff",
"reasonFilterLabel": "Filter by reason",
"reasonFilterAll": "All reasons",
"reasonOptionSale": "Sale",
"noLogEntriesBody": "Stock movements from sales, deliveries and adjustments show up here.",
"nearExpiryDescription": "Products inside the near-expiry alert window, soonest first.",
"daysBadge_one": "{{count}} day",
"daysBadge_other": "{{count}} days"
```
es-MX:
```json
"movementsTabLabel": "Movimientos",
"searchPlaceholder": "Buscar producto, SKU o código de barras…",
"filterAllSkus": "Todos los SKU",
"nearExpiry": "Próxima caducidad",
"stockValue": "Valor del inventario (a costo)",
"stockValueHint_one": "{{count}} producto sin precio de costo",
"stockValueHint_other": "{{count}} productos sin precio de costo",
"quickLinksLabel": "Ir a",
"quickLinkReceive": "Recibir envío",
"quickLinkPurchaseOrders": "Órdenes de compra",
"quickLinkCatalog": "Catálogo",
"noRowsForFilter": "Ningún producto coincide con estos filtros.",
"columnProduct": "Producto",
"columnStaff": "Personal",
"reasonFilterLabel": "Filtrar por motivo",
"reasonFilterAll": "Todos los motivos",
"reasonOptionSale": "Venta",
"noLogEntriesBody": "Aquí aparecen los movimientos de inventario por ventas, entregas y ajustes.",
"nearExpiryDescription": "Productos dentro de la ventana de alerta de caducidad, los más próximos primero.",
"daysBadge_one": "{{count}} día",
"daysBadge_other": "{{count}} días"
```
Use `t('inventoryPagePanel.filterAllSkus')` for the first tile label and keep `totalSkus`/`lowStock`/`outOfStock` keys for the others.

- [ ] **Step 6: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/OpenUnitsTab.test.tsx src/entities/inventory
npx playwright test e2e/inventory/inventory-management.spec.ts e2e/inventory/inventory-intelligence.spec.ts e2e/a11y/focus-tab-order.spec.ts e2e/inventory/near-expiry-alerts.spec.ts --reporter=line
```
Expected: green. The a11y spec (surface b) tabs from `#inv-category-filter` to the Product header — if it fails, the search input landed after the select in DOM order; fix the order, not the test.

- [ ] **Step 7: Commit**

```bash
git add -A src/widgets/InventoryPagePanel src/shared/lib/i18n
git commit -m "feat(ui): deepen inventory — filter tiles, stock value, search, movements tab, near-expiry urgency

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Settings as grouped vertical navigation

**Spec:** §5.

**Files:**
- Modify: `src/widgets/SettingsTabsPanel/index.tsx`, `src/shared/lib/i18n/locales/{en-US,es-MX}/settings.json`
- Test: `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx` (existing, must stay green)

**Interfaces:**
- Consumes: `VerticalTabsList`, `VerticalTabsGroupLabel`, `VerticalTabsTrigger` (Task 1).
- Keep: tab keys/labels and gates exactly as today; Language is first and default; cashier sees exactly one tab; every tab body component and its ids unchanged.

- [ ] **Step 1: Add i18n keys to `settings.json`**

en-US (add top-level objects):
```json
"navLabel": "Settings sections",
"groups": {
  "personal": "Personal",
  "store": "Store",
  "receipts": "Receipts & hardware",
  "stock": "Stock rules",
  "security": "Security & data"
},
"descriptions": {
  "language": "Interface language for your account",
  "general": "Store name, address, timezone, currency",
  "billing": "Tax, payment methods, button labels",
  "hardware": "Receipt printer, paper width, cash drawer",
  "email": "Sender address and test emails",
  "nearExpiry": "Alert window and automatic discount",
  "lockTimeout": "Idle time before the screen locks",
  "backup": "Manual snapshots and restore"
}
```
es-MX:
```json
"navLabel": "Secciones de configuración",
"groups": {
  "personal": "Personal",
  "store": "Tienda",
  "receipts": "Recibos y hardware",
  "stock": "Reglas de inventario",
  "security": "Seguridad y datos"
},
"descriptions": {
  "language": "Idioma de la interfaz para tu cuenta",
  "general": "Nombre, dirección, zona horaria y moneda",
  "billing": "Impuestos, métodos de pago y etiquetas",
  "hardware": "Impresora de recibos, ancho de papel y cajón",
  "email": "Remitente y correos de prueba",
  "nearExpiry": "Ventana de alerta y descuento automático",
  "lockTimeout": "Tiempo inactivo antes de bloquear la pantalla",
  "backup": "Respaldos manuales y restauración"
}
```

- [ ] **Step 2: Rewrite the panel render**

Replace `src/widgets/SettingsTabsPanel/index.tsx` with:

```tsx
import {
  CalendarClock,
  DatabaseBackup,
  Languages,
  Lock,
  Mail,
  Printer,
  Receipt,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffStore } from '@entities/staff/model/store';
import { usePermissions } from '@entities/staff/model/usePermissions';
import { Tabs, TabsContent } from '@shared/ui/tabs';
import { VerticalTabsGroupLabel, VerticalTabsList, VerticalTabsTrigger } from '@shared/ui/vertical-tabs';
import { BackupSettingsTab } from './tabs/BackupSettingsTab';
import { BillingSettingsTab } from './tabs/BillingSettingsTab';
import { EmailReceiptsSettingsTab } from './tabs/EmailReceiptsSettingsTab';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { HardwareSettingsTab } from './tabs/HardwareSettingsTab';
import { LanguageSettingsTab } from './tabs/LanguageSettingsTab';
import { LockSettingsTab } from './tabs/LockSettingsTab';
import { NearExpirySettingsTab } from './tabs/NearExpirySettingsTab';

type TabItem = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  render: () => ReactNode;
};

type TabGroup = {
  key: 'personal' | 'store' | 'receipts' | 'stock' | 'security';
  tabs: TabItem[];
};

export function SettingsTabsPanel() {
  const { t } = useTranslation('settings');
  const currentRole = useStaffStore(s => s.currentStaff?.role ?? null);
  const { can } = usePermissions();
  const canManageSettings = can('manage_settings');
  const canManageProducts = can('manage_products');

  const groups = useMemo<TabGroup[]>(() => {
    // Role-agnostic — always present so every authenticated role (incl.
    // cashier) has a non-empty list and Language is the default tab.
    const personal: TabItem[] = [
      {
        key: 'language',
        label: t('tabs.language'),
        description: t('descriptions.language'),
        icon: Languages,
        render: () => <LanguageSettingsTab />,
      },
    ];
    const store: TabItem[] = [];
    const receipts: TabItem[] = [];
    const stock: TabItem[] = [];
    const security: TabItem[] = [];

    if (canManageSettings) {
      store.push({
        key: 'general',
        label: t('tabs.general'),
        description: t('descriptions.general'),
        icon: Store,
        render: () => <GeneralSettingsTab currentRole={currentRole} />,
      });
      receipts.push(
        {
          key: 'hardware',
          label: t('tabs.hardware'),
          description: t('descriptions.hardware'),
          icon: Printer,
          render: () => <HardwareSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'email',
          label: t('tabs.email'),
          description: t('descriptions.email'),
          icon: Mail,
          render: () => <EmailReceiptsSettingsTab currentRole={currentRole} />,
        }
      );
      stock.push({
        key: 'near-expiry',
        label: t('tabs.nearExpiry'),
        description: t('descriptions.nearExpiry'),
        icon: CalendarClock,
        render: () => <NearExpirySettingsTab currentRole={currentRole} />,
      });
      security.push(
        {
          key: 'lock-timeout',
          label: t('tabs.lockTimeout'),
          description: t('descriptions.lockTimeout'),
          icon: Lock,
          render: () => <LockSettingsTab currentRole={currentRole} />,
        },
        {
          key: 'backup',
          label: t('tabs.backup'),
          description: t('descriptions.backup'),
          icon: DatabaseBackup,
          render: () => <BackupSettingsTab currentRole={currentRole} />,
        }
      );
    }
    // Billing keeps its historical manage_products gate (unchanged behaviour).
    if (canManageProducts) {
      store.push({
        key: 'billing',
        label: t('tabs.billing'),
        description: t('descriptions.billing'),
        icon: Receipt,
        render: () => <BillingSettingsTab currentRole={currentRole} />,
      });
    }

    const all: TabGroup[] = [
      { key: 'personal', tabs: personal },
      { key: 'store', tabs: store },
      { key: 'receipts', tabs: receipts },
      { key: 'stock', tabs: stock },
      { key: 'security', tabs: security },
    ];
    return all.filter(group => group.tabs.length > 0);
  }, [canManageProducts, canManageSettings, currentRole, t]);

  const allTabs = groups.flatMap(group => group.tabs);
  const firstTab = allTabs[0];
  if (!firstTab) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-xs">
        {t('noPermission')}
      </section>
    );
  }

  return (
    <Tabs
      defaultValue={firstTab.key}
      orientation="vertical"
      className="grid w-full gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <VerticalTabsList aria-label={t('navLabel')} className="self-start lg:sticky lg:top-0">
        {groups.map(group => (
          <Fragment key={group.key}>
            <VerticalTabsGroupLabel>{t(`groups.${group.key}`)}</VerticalTabsGroupLabel>
            {group.tabs.map(tab => (
              <VerticalTabsTrigger
                key={tab.key}
                value={tab.key}
                icon={tab.icon}
                label={tab.label}
                description={tab.description}
              />
            ))}
          </Fragment>
        ))}
      </VerticalTabsList>
      <div className="min-w-0">
        {allTabs.map(tab => (
          <TabsContent
            key={tab.key}
            value={tab.key}
            className="min-h-[24rem] rounded-2xl border border-border bg-card p-6 shadow-xs"
          >
            {tab.render()}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
```

Note the tab order in the DOM is now grouped (Language, General, Billing, Hardware, Email, Near Expiry, Lock, Backup). The `t(\`groups.${group.key}\`)` template is a `t()` call, which the i18n lint rule allows.

- [ ] **Step 3: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx
npx playwright test e2e/settings e2e/receipts/settings.spec.ts e2e/receipts/printer-selection.spec.ts e2e/home/home-navigation.spec.ts --reporter=line
```
Expected: green (the cashier count-of-tabs assertion still sees one tab; `getByRole('tab', { name: /auto-lock timeout|…/ })` resolves).

- [ ] **Step 4: Commit**

```bash
git add src/widgets/SettingsTabsPanel/index.tsx src/shared/lib/i18n
git commit -m "feat(ui): regroup Settings into a vertical, described navigation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Reports as grouped vertical navigation with one date range

**Spec:** §6.

**Files:**
- Modify: `src/pages/reports/index.tsx`, `src/shared/lib/i18n/locales/{en-US,es-MX}/pages.json`
- Test: `src/pages/reports/ReportsPage.test.tsx` (existing, must stay green)

**Interfaces:**
- Consumes: `VerticalTabs*` (Task 1), `DateRangePicker`, all report widgets (unchanged imports).
- Keep: tab values and labels unchanged (`session`, `products`, `hourly`, `categories`, `payment-methods`, `inventory-analytics`, `staff`, `voids`, `deletions-pre`, `deletions-post`, `refunds-reg`); default `session`; `From:`/`To:` date inputs exist whenever a date-driven tab is active; `#caja-selector` inside `CajaReportPanel` untouched.

- [ ] **Step 1: i18n keys (`pages.json` → `reports`)**

en-US:
```json
"navLabel": "Report sections",
"descriptions": {
  "session": "Cash reconciliation, totals and top products for one register session",
  "products": "Units, revenue and margin per product",
  "hourly": "Sales volume by hour of day",
  "categories": "Revenue split by category",
  "paymentMethods": "Cash, card and transfer totals",
  "inventoryAnalytics": "Valuation, shrinkage, expiry loss and turnover",
  "staff": "Sales and transactions per staff member",
  "voids": "Refunded and voided sales",
  "deletionsPre": "Lines removed from carts before payment",
  "deletionsPost": "Edits made to paid tickets",
  "refundsReg": "Every refund with reason and approver"
}
```
es-MX:
```json
"navLabel": "Secciones de reportes",
"descriptions": {
  "session": "Conciliación de efectivo, totales y productos top de una sesión de caja",
  "products": "Unidades, ingresos y margen por producto",
  "hourly": "Volumen de ventas por hora del día",
  "categories": "Ingresos por categoría",
  "paymentMethods": "Totales en efectivo, tarjeta y transferencia",
  "inventoryAnalytics": "Valuación, mermas, pérdida por caducidad y rotación",
  "staff": "Ventas y transacciones por persona",
  "voids": "Ventas reembolsadas y anuladas",
  "deletionsPre": "Partidas eliminadas del carrito antes de pagar",
  "deletionsPost": "Ediciones a tickets ya pagados",
  "refundsReg": "Cada reembolso con motivo y quién lo autorizó"
}
```

- [ ] **Step 2: Rewrite `ReportsPage`**

Keep `toDateStr`/`fromDateStr` helpers and the `fromStr/toStr` state. Replace the JSX with a config-driven layout:

```tsx
type ReportKey =
  | 'session' | 'products' | 'hourly' | 'categories' | 'payment-methods'
  | 'inventory-analytics' | 'staff' | 'voids' | 'deletions-pre' | 'deletions-post' | 'refunds-reg';

type ReportDef = {
  key: ReportKey;
  group: 'sales' | 'inventoryAnalytics' | 'staffTips' | 'operations';
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
  usesDateRange: boolean;
  render: (range: { from: Date; to: Date }) => ReactNode;
};

const REPORTS: ReportDef[] = [
  { key: 'session', group: 'sales', labelKey: 'reports.tabs.session', descKey: 'reports.descriptions.session', icon: CalendarCheck, usesDateRange: false, render: () => <CajaReportPanel /> },
  { key: 'products', group: 'sales', labelKey: 'reports.tabs.products', descKey: 'reports.descriptions.products', icon: Package, usesDateRange: true, render: r => <ProductSalesPanel dateRange={r} /> },
  { key: 'hourly', group: 'sales', labelKey: 'reports.tabs.hourly', descKey: 'reports.descriptions.hourly', icon: Clock, usesDateRange: true, render: r => <HourlyBreakdownPanel dateRange={r} /> },
  { key: 'categories', group: 'sales', labelKey: 'reports.tabs.categories', descKey: 'reports.descriptions.categories', icon: Layers, usesDateRange: true, render: r => <CategoryRevenuePanel dateRange={r} /> },
  { key: 'payment-methods', group: 'sales', labelKey: 'reports.tabs.paymentMethods', descKey: 'reports.descriptions.paymentMethods', icon: CreditCard, usesDateRange: true, render: r => <PaymentMethodsReport dateRange={r} /> },
  { key: 'inventory-analytics', group: 'inventoryAnalytics', labelKey: 'reports.tabs.inventoryAnalytics', descKey: 'reports.descriptions.inventoryAnalytics', icon: BarChart3, usesDateRange: true, render: r => <InventoryAnalyticsPanel dateRange={r} /> },
  { key: 'staff', group: 'staffTips', labelKey: 'reports.tabs.staff', descKey: 'reports.descriptions.staff', icon: Users, usesDateRange: true, render: r => <StaffSalesPanel dateRange={r} /> },
  { key: 'voids', group: 'operations', labelKey: 'reports.tabs.voids', descKey: 'reports.descriptions.voids', icon: Undo2, usesDateRange: true, render: r => <VoidRefundPanel dateRange={r} /> },
  { key: 'deletions-pre', group: 'operations', labelKey: 'reports.tabs.deletionsPre', descKey: 'reports.descriptions.deletionsPre', icon: Trash2, usesDateRange: true, render: r => <DeletionsPreSendPanel dateRange={r} /> },
  { key: 'deletions-post', group: 'operations', labelKey: 'reports.tabs.deletionsPost', descKey: 'reports.descriptions.deletionsPost', icon: History, usesDateRange: true, render: r => <DeletionsPostCloseReport dateRange={r} /> },
  { key: 'refunds-reg', group: 'operations', labelKey: 'reports.tabs.refundsReg', descKey: 'reports.descriptions.refundsReg', icon: ReceiptText, usesDateRange: true, render: r => <RefundsRegister dateRange={r} /> },
];

const GROUP_ORDER = ['sales', 'inventoryAnalytics', 'staffTips', 'operations'] as const;
```

Component body:

```tsx
export default function ReportsPage() {
  const { t } = useTranslation('pages');
  const today = toDateStr(new Date());
  const [fromStr, setFromStr] = useState(today);
  const [toStr, setToStr] = useState(today);
  const [active, setActive] = useState<ReportKey>('session');

  const dateRange = { from: fromDateStr(fromStr, false), to: fromDateStr(toStr, true) };
  const activeDef = REPORTS.find(r => r.key === active) ?? REPORTS[0];

  return (
    <PageContainer title={t('reports.title')} width="fluid">
      <Tabs
        value={active}
        onValueChange={next => {
          setActive(next as ReportKey);
        }}
        orientation="vertical"
        className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"
      >
        <VerticalTabsList aria-label={t('reports.navLabel')} className="self-start lg:sticky lg:top-0">
          {GROUP_ORDER.map(group => (
            <Fragment key={group}>
              <VerticalTabsGroupLabel>{t(`reports.groups.${group}`)}</VerticalTabsGroupLabel>
              {REPORTS.filter(r => r.group === group).map(r => (
                <VerticalTabsTrigger
                  key={r.key}
                  value={r.key}
                  icon={r.icon}
                  label={t(r.labelKey)}
                  description={t(r.descKey)}
                />
              ))}
            </Fragment>
          ))}
        </VerticalTabsList>

        <div className="min-w-0 space-y-4">
          {activeDef && (
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
              <div className="min-w-0 space-y-1">
                <h3 className="text-lg font-semibold tracking-tight">{t(activeDef.labelKey)}</h3>
                <p className="text-sm text-muted-foreground">{t(activeDef.descKey)}</p>
              </div>
              {activeDef.usesDateRange && (
                <DateRangePicker
                  fromStr={fromStr}
                  toStr={toStr}
                  onChange={(f, tStr) => {
                    setFromStr(f);
                    setToStr(tStr);
                  }}
                />
              )}
            </div>
          )}
          {REPORTS.map(r => (
            <TabsContent key={r.key} value={r.key}>
              {r.render(dateRange)}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </PageContainer>
  );
}
```

Imports: `Fragment, useState, type ReactNode` from `react`; icons `BarChart3, CalendarCheck, Clock, CreditCard, History, Layers, Package, ReceiptText, Trash2, Undo2, Users, type LucideIcon` from `lucide-react`; `VerticalTabsGroupLabel, VerticalTabsList, VerticalTabsTrigger` from `@shared/ui/vertical-tabs`; `Tabs, TabsContent` from `@shared/ui/tabs`. The `REPORTS` array holds only keys/components, no literal copy, so the i18n rule is satisfied; if the linter flags `labelKey`/`descKey` string properties, they are in the rule's `object-properties.exclude` list only for `labelKey` — rename `descKey` to `descriptionLabelKey`? No: add `// eslint-disable-next-line i18next/no-literal-string -- i18n key identifier` above each flagged property instead of renaming.

- [ ] **Step 3: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/pages/reports/ReportsPage.test.tsx
npx playwright test e2e/reports/report-tabs.spec.ts e2e/reports/product-sales.spec.ts e2e/reports/export.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/reports/index.tsx src/shared/lib/i18n
git commit -m "feat(ui): reports — grouped vertical navigation with a single shared date range

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `PromotionDialog` replaces the wizard page

**Spec:** §2.1, §2.2.

**Files:**
- Create: `src/features/manage-promotions/ui/PromotionDialog.tsx`, `src/features/manage-promotions/ui/PromotionDialog.test.tsx`
- Modify: `src/features/manage-promotions/index.ts`, `src/features/manage-promotions/ui/wizard/StepReview.tsx` (root class), `src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx` (day pills), `src/pages/promotions/index.tsx`, `src/app/router.tsx`, i18n `wAdmin`
- Delete: `src/features/manage-promotions/ui/PromotionWizardPage.tsx`

**Interfaces:**
- Consumes: `usePromotionWizardState(promotion)` (unchanged — fields, `validateBasics`, `isScopeStepValid`, `isValidityStepValid`, `save`, `isPending`, setters), `StepScope`, `StepValidityRecurrence`, `StepReview`.
- Produces: `PromotionDialog({ open, onOpenChange, promotion })` exported from `@features/manage-promotions`.
- Keep (e2e, Task 7 rewrites the specs against these): dialog titles `New Promotion` / `Edit Promotion`; labels `Name`, `Discount percent`, `Discount amount`; buttons `Create Promotion` / `Save Changes`; checkbox `Store-wide (no restriction)`; switch `Recurring`; `Start time`/`End time`; error copy unchanged (`Name is required`, `Select at least one product or category…`, `End time must be after start time`); picker button `Select products or categories…` and its search placeholder; page button `New Promotion`; table row actions `Edit`/`Delete`.

- [ ] **Step 1: Write the failing dialog test**

`src/features/manage-promotions/ui/PromotionDialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@shared/lib/i18n';

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock('@entities/promotion', async () => {
  const actual = await vi.importActual<typeof import('@entities/promotion')>('@entities/promotion');
  return {
    ...actual,
    useMutationCreatePromotion: () => ({ mutateAsync: createMutateAsync, isPending: false }),
    useMutationUpdatePromotion: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  };
});
vi.mock('@entities/product', () => ({
  useProducts: () => ({
    data: [
      {
        id: 'p1', name: 'Parle-G', categoryId: 'c1', basePrice: 100, happyHourPrice: null, sku: null,
        isActive: true, soldByWeight: false, imageUrl: null, stock_threshold: null, barcode: null,
        unitsPerPackage: null, parentProductId: null, comboEligible: true, isCombo: false, modifiers: [],
      },
    ],
  }),
}));
vi.mock('@entities/category', () => ({
  useCategories: () => ({ data: [{ id: 'c1', name: 'Biscuits', parentId: null }] }),
}));
vi.mock('@entities/settings', () => ({
  useSettings: () => ({
    data: {
      nearExpiry: { discountPercent: 0, thresholdDays: 14 },
      general: { timezone: 'America/Mexico_City' },
    },
  }),
}));

const { PromotionDialog } = await import('./PromotionDialog');

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('PromotionDialog', () => {
  beforeEach(() => {
    createMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
    updateMutateAsync.mockReset().mockResolvedValue({ ok: true, data: null });
  });

  it('shows the name error and does not save when submitted empty', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    expect(await screen.findByText(/name is required|el nombre es obligatorio/i)).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('saves a store-wide percent promotion and closes', async () => {
    const onOpenChange = vi.fn();
    render(<PromotionDialog open onOpenChange={onOpenChange} promotion={null} />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText(/^name|^nombre/i), 'Diwali 20');
    const percent = screen.getByLabelText(/discount percent|porcentaje de descuento/i);
    await userEvent.clear(percent);
    await userEvent.type(percent, '20');
    await userEvent.click(screen.getByRole('button', { name: /create promotion|crear promoción/i }));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync.mock.calls[0]?.[0]).toMatchObject({
      name: 'Diwali 20',
      discountType: 'percent',
      discountValue: 20,
      targets: [],
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
```

Run: `npx vitest run src/features/manage-promotions/ui/PromotionDialog.test.tsx` → FAIL (module missing).

- [ ] **Step 2: Implement `PromotionDialog.tsx`**

```tsx
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Promotion } from '@entities/promotion';
import type { DiscountType } from '@shared/lib/domain';
import { cn } from '@shared/lib/utils';
import { FormField, Input, MoneyInput, POSButton } from '@shared/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
import { usePromotionWizardState } from '../model/usePromotionWizardState';
import { StepReview } from './wizard/StepReview';
import { StepScope } from './wizard/StepScope';
import { StepValidityRecurrence } from './wizard/StepValidityRecurrence';

export interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit/null for create mode; pass the row being edited for edit mode. */
  promotion?: Promotion | null;
}

/**
 * Create/edit promotion dialog. Replaces the 4-step wizard page: every field
 * is visible at once, validation runs on submit, and the right rail shows a
 * live summary + example price. State and save() come from
 * usePromotionWizardState unchanged — only the step navigation is gone.
 */
export function PromotionDialog({ open, onOpenChange, promotion = null }: PromotionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl" showCloseButton>
        {open && (
          <PromotionDialogForm
            key={promotion?.id ?? 'new'}
            promotion={promotion}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({ index, title, hint, id }: { index: string; title: string; hint: string; id: string }) {
  return (
    <div className="space-y-1">
      <h3 id={id} className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <span className="font-mono text-xs font-medium text-brand-strong">{index}</span>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function PromotionDialogForm({
  promotion,
  onClose,
}: {
  promotion: Promotion | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('wAdmin');
  const wizard = usePromotionWizardState(promotion);
  const isEdit = promotion !== null;
  const [attempted, setAttempted] = useState(false);
  const basicsRef = useRef<HTMLElement>(null);
  const scopeRef = useRef<HTMLElement>(null);
  const whenRef = useRef<HTMLElement>(null);

  async function handleSubmit() {
    setAttempted(true);
    const basicsOk = wizard.validateBasics();
    const scopeOk = wizard.isScopeStepValid();
    const whenOk = wizard.isValidityStepValid();
    const firstInvalid = !basicsOk ? basicsRef : !scopeOk ? scopeRef : !whenOk ? whenRef : null;
    if (firstInvalid) {
      firstInvalid.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const result = await wizard.save();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t('promotionFormDialog.savedToast'));
    onClose();
  }

  return (
    <>
      <DialogHeader className="border-b border-border px-6 py-5">
        <DialogTitle className="text-xl">
          {isEdit ? t('promotionFormDialog.editTitle') : t('promotionFormDialog.createTitle')}
        </DialogTitle>
        <DialogDescription>
          {isEdit ? t('promotionDialog.subtitleEdit') : t('promotionDialog.subtitleCreate')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid max-h-[min(70dvh,44rem)] lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-0 space-y-8 overflow-y-auto px-6 py-5">
          <section ref={basicsRef} aria-labelledby="promo-basics" className="space-y-4 scroll-mt-4">
            {/* eslint-disable-next-line i18next/no-literal-string -- ordinal marker, not copy */}
            <SectionHeading id="promo-basics" index="01" title={t('promotionDialog.sectionBasics')} hint={t('promotionDialog.sectionBasicsHint')} />
            <FormField
              label={t('promotionFormDialog.nameLabel')}
              required
              {...(wizard.nameError ? { error: t(`promotionFormDialog.${wizard.nameError}`) } : {})}
            >
              <Input
                value={wizard.name}
                onChange={e => {
                  wizard.setName(e.target.value);
                }}
                disabled={wizard.isPending}
                autoFocus
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('promotionFormDialog.discountTypeLabel')}</p>
                <div className="flex gap-1 rounded-xl bg-muted p-1">
                  {/* eslint-disable-next-line i18next/no-literal-string -- fixed discount-type enum identifiers, not UI copy */}
                  {(['percent', 'fixed'] as const).map((type: DiscountType) => (
                    <POSButton
                      key={type}
                      type="button"
                      touchSize="default"
                      variant={wizard.discountType === type ? 'default' : 'ghost'}
                      aria-pressed={wizard.discountType === type}
                      disabled={wizard.isPending}
                      onClick={() => {
                        wizard.handleDiscountTypeChange(type);
                      }}
                      className={cn('min-w-28', wizard.discountType !== type && 'hover:bg-card')}
                    >
                      {type === 'percent'
                        ? t('promotionFormDialog.discountTypePercent')
                        : t('promotionFormDialog.discountTypeFixed')}
                    </POSButton>
                  ))}
                </div>
              </div>
              {wizard.discountType === 'percent' ? (
                <FormField
                  label={t('promotionFormDialog.discountPercentLabel')}
                  required
                  {...(wizard.valueError ? { error: t(`promotionFormDialog.${wizard.valueError}`) } : {})}
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    value={wizard.discountPercentStr}
                    onChange={e => {
                      wizard.setDiscountPercentStr(e.target.value);
                    }}
                    disabled={wizard.isPending}
                  />
                </FormField>
              ) : (
                <FormField
                  label={t('promotionFormDialog.discountAmountLabel')}
                  required
                  {...(wizard.valueError ? { error: t(`promotionFormDialog.${wizard.valueError}`) } : {})}
                >
                  <MoneyInput
                    value={wizard.discountValue}
                    onChange={wizard.setDiscountValue}
                    disabled={wizard.isPending}
                  />
                </FormField>
              )}
            </div>
          </section>

          <section ref={scopeRef} aria-labelledby="promo-scope" className="space-y-4 scroll-mt-4">
            {/* eslint-disable-next-line i18next/no-literal-string -- ordinal marker, not copy */}
            <SectionHeading id="promo-scope" index="02" title={t('promotionDialog.sectionScope')} hint={t('promotionDialog.sectionScopeHint')} />
            <StepScope
              storeWide={wizard.storeWide}
              onStoreWideChange={wizard.handleStoreWideChange}
              selectedProductIds={wizard.selectedProductIds}
              selectedCategoryIds={wizard.selectedCategoryIds}
              onScopeSelectionChange={wizard.handleScopeSelectionChange}
              showValidationError={attempted && !wizard.isScopeStepValid()}
              disabled={wizard.isPending}
            />
          </section>

          <section ref={whenRef} aria-labelledby="promo-when" className="space-y-4 scroll-mt-4">
            {/* eslint-disable-next-line i18next/no-literal-string -- ordinal marker, not copy */}
            <SectionHeading id="promo-when" index="03" title={t('promotionDialog.sectionWhen')} hint={t('promotionDialog.sectionWhenHint')} />
            <StepValidityRecurrence
              fromStr={wizard.fromStr}
              toStr={wizard.toStr}
              onDateRangeChange={wizard.handleDateRangeChange}
              recurring={wizard.recurring}
              onRecurringChange={wizard.handleRecurringChange}
              daysOfWeek={wizard.daysOfWeek}
              onToggleDayOfWeek={wizard.toggleDayOfWeek}
              startTime={wizard.startTime}
              endTime={wizard.endTime}
              onStartTimeChange={wizard.setStartTime}
              onEndTimeChange={wizard.setEndTime}
              showValidationError={attempted && !wizard.isValidityStepValid()}
              disabled={wizard.isPending}
            />
          </section>
        </div>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-muted/30 px-5 py-5 lg:block">
          <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t('promotionDialog.summaryTitle')}
          </p>
          <StepReview
            name={wizard.name}
            discountType={wizard.discountType}
            discountValue={wizard.discountValue}
            discountPercentStr={wizard.discountPercentStr}
            fromStr={wizard.fromStr}
            toStr={wizard.toStr}
            storeWide={wizard.storeWide}
            selectedProductIds={wizard.selectedProductIds}
            selectedCategoryIds={wizard.selectedCategoryIds}
            recurring={wizard.recurring}
            daysOfWeek={wizard.daysOfWeek}
            startTime={wizard.startTime}
            endTime={wizard.endTime}
          />
        </aside>
      </div>

      <DialogFooter className="mx-0 mb-0 rounded-b-2xl px-6 py-4 sm:justify-between">
        <POSButton type="button" variant="ghost" touchSize="large" disabled={wizard.isPending} onClick={onClose}>
          {t('promotionDialog.cancel')}
        </POSButton>
        <POSButton
          type="button"
          variant="brand"
          touchSize="large"
          disabled={wizard.isPending}
          onClick={() => {
            void handleSubmit();
          }}
        >
          {isEdit ? t('promotionWizard.saveChanges') : t('promotionWizard.createPromotion')}
        </POSButton>
      </DialogFooter>
    </>
  );
}
```

Check `@shared/ui/dialog` exports `DialogDescription` (it is a standard shadcn export; if missing, add it following the `DialogTitle` pattern: `DialogPrimitive.Description` with `className="text-sm text-muted-foreground"`). `DialogFooter` already applies `-mx-6 -mb-6`; the `mx-0 mb-0` override above cancels that because the content has `p-0`.

In `StepReview.tsx` change the root `div` class from `max-h-[60vh] space-y-4 overflow-y-auto` to `space-y-4`. In `StepValidityRecurrence.tsx` restyle the day checkboxes as pills — replace the day `<label>` with:

```tsx
<label
  key={key}
  className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-sm shadow-xs transition-colors has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand-soft has-data-[state=checked]:text-brand-strong"
>
  <Checkbox … unchanged … />
  {t(`promotionWizard.validity.day.${key}`)}
</label>
```

(the wrapper `div` becomes `flex flex-wrap gap-2`).

- [ ] **Step 3: Wire the page, router and feature index**

`src/features/manage-promotions/index.ts` → `export { PromotionDialog } from './ui/PromotionDialog'; export type { PromotionDialogProps } from './ui/PromotionDialog';` (remove the wizard export). `git rm src/features/manage-promotions/ui/PromotionWizardPage.tsx`.

`src/app/router.tsx`: remove the `PromotionWizardPage` lazy import and the two `/promotions/new` and `/promotions/:id/edit` `<Route>`s.

`src/pages/promotions/index.tsx`:
- Replace `useNavigate` with `useSearchParams`.
- State: `const [dialog, setDialog] = useState<{ open: boolean; promotion: Promotion | null }>({ open: false, promotion: null });` and `const [statusFilter, setStatusFilter] = useState<StatusBadgeProps['status'] | null>(null);`
- Deep links (adjust-state-during-render pattern is not needed; a small effect is fine here):

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const wantsNew = searchParams.get('new') === '1';
const editId = searchParams.get('edit');
useEffect(() => {
  if (wantsNew) setDialog({ open: true, promotion: null });
}, [wantsNew]);
useEffect(() => {
  if (!editId) return;
  const target = promotions.find(p => p.id === editId);
  if (target) setDialog({ open: true, promotion: target });
}, [editId, promotions]);

function closeDialog() {
  setDialog({ open: false, promotion: null });
  if (wantsNew || editId) setSearchParams({}, { replace: true });
}
```

  (Both effects set state from props → add `/* eslint-disable react-hooks/set-state-in-effect -- deep-link → dialog sync */` around them, matching the file's existing pattern.)
- `openCreateDialog = () => setDialog({ open: true, promotion: null })`; pencil → `setDialog({ open: true, promotion: p })`.
- Status strip above the table:

```tsx
const counts = useMemo(() => {
  const c = { promo_active: 0, promo_scheduled: 0, promo_expired: 0, promo_inactive: 0, needsReview: 0 };
  for (const p of promotions) {
    c[derivePromotionStatus(p)] += 1;
    if (p.needsReview) c.needsReview += 1;
  }
  return c;
}, [promotions]);
const visiblePromotions = statusFilter
  ? promotions.filter(p => derivePromotionStatus(p) === statusFilter)
  : promotions;
```

```tsx
<p className="text-sm text-muted-foreground">{tAdmin('promotionsListPanel.hint')}</p>
<div className="flex flex-wrap gap-3" role="group" aria-label={tAdmin('promotionsListPanel.statusFilterLabel')}>
  {(
    [
      ['promo_active', tAdmin('promotionsListPanel.statActive'), 'text-success-strong'],
      ['promo_scheduled', tAdmin('promotionsListPanel.statScheduled'), 'text-brand-strong'],
      ['promo_expired', tAdmin('promotionsListPanel.statExpired'), 'text-destructive'],
      ['promo_inactive', tAdmin('promotionsListPanel.statInactive'), 'text-muted-foreground'],
    ] as const
  ).map(([status, label, tone]) => (
    <Button
      key={status}
      type="button"
      variant="ghost"
      aria-pressed={statusFilter === status}
      onClick={() => {
        setStatusFilter(prev => (prev === status ? null : status));
      }}
      className={cn(
        'h-auto min-w-[9rem] flex-col items-start gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-xs hover:bg-card hover:border-border-strong',
        statusFilter === status && 'border-brand ring-2 ring-brand/30'
      )}
    >
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
      <span className={cn('text-numeric text-2xl font-semibold', tone)}>{counts[status]}</span>
    </Button>
  ))}
  {counts.needsReview > 0 && (
    <div className="flex min-w-[9rem] flex-col gap-1 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-warning-strong uppercase">{tAdmin('promotionsListPanel.statNeedsReview')}</span>
      <span className="text-numeric text-2xl font-semibold text-warning-strong">{counts.needsReview}</span>
    </div>
  )}
</div>
```

  Pass `visiblePromotions` to `DataTable`. Render `<PromotionDialog open={dialog.open} promotion={dialog.promotion} onOpenChange={open => { if (!open) closeDialog(); }} />` next to the `ConfirmDialog`. Tone class strings are Tailwind classes (allowed literals: they are not JSX text; if the i18n rule flags the tuple, add the `eslint-disable-next-line i18next/no-literal-string -- Tailwind class lookup` comment above the array).

- [ ] **Step 4: i18n keys (`wAdmin.json`)**

en-US: add

```json
"promotionDialog": {
  "subtitleCreate": "Set the discount, choose what it applies to and when it runs. Checkout applies it automatically.",
  "subtitleEdit": "Changes apply to future sales only — completed sales keep the price they were charged.",
  "sectionBasics": "Basics",
  "sectionBasicsHint": "A short name staff will recognise, and how much comes off.",
  "sectionScope": "Applies to",
  "sectionScopeHint": "Store-wide, or only specific products and categories.",
  "sectionWhen": "When",
  "sectionWhenHint": "Active dates, plus optional weekdays and hours.",
  "summaryTitle": "Summary",
  "cancel": "Cancel"
}
```
and inside `promotionsListPanel`:
```json
"hint": "Promotions apply automatically at checkout; when several match, the best price wins.",
"statusFilterLabel": "Filter by status",
"statActive": "Active now",
"statScheduled": "Scheduled",
"statExpired": "Expired",
"statInactive": "Paused",
"statNeedsReview": "Needs review"
```
es-MX:
```json
"promotionDialog": {
  "subtitleCreate": "Define el descuento, elige a qué aplica y cuándo corre. El cobro lo aplica automáticamente.",
  "subtitleEdit": "Los cambios aplican solo a ventas futuras: las ventas completadas conservan el precio cobrado.",
  "sectionBasics": "Datos",
  "sectionBasicsHint": "Un nombre corto que el personal reconozca y cuánto se descuenta.",
  "sectionScope": "Aplica a",
  "sectionScopeHint": "A toda la tienda o solo a productos y categorías específicos.",
  "sectionWhen": "Cuándo",
  "sectionWhenHint": "Fechas de vigencia y, opcionalmente, días y horario.",
  "summaryTitle": "Resumen",
  "cancel": "Cancelar"
}
```
```json
"hint": "Las promociones se aplican automáticamente al cobrar; si varias coinciden, gana el mejor precio.",
"statusFilterLabel": "Filtrar por estado",
"statActive": "Activas ahora",
"statScheduled": "Programadas",
"statExpired": "Vencidas",
"statInactive": "Pausadas",
"statNeedsReview": "Requieren revisión"
```

- [ ] **Step 5: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/features/manage-promotions src/pages/promotions
```
Expected: dialog tests + wizard-state tests green. Do not run the promotions e2e yet — Task 7 rewrites them.

- [ ] **Step 6: Commit**

```bash
git add -A src/features/manage-promotions src/pages/promotions/index.tsx src/app/router.tsx src/shared/lib/i18n
git commit -m "feat(ui): promotions — single-screen create/edit dialog replaces the step wizard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Promotions e2e specs for the dialog

**Spec:** §2.3.

**Files:**
- Create: `e2e/promotions/promotion-dialog-validation.spec.ts` (from `wizard-step-validation.spec.ts`)
- Delete: `e2e/promotions/wizard-step-validation.spec.ts`
- Modify: `e2e/promotions/percent-field-input.spec.ts`, `e2e/promotions/migrated-review-flag.spec.ts`

**Interfaces:**
- Consumes: `PromotionDialog` behaviour from Task 6; deep links `?edit=<id>`.

- [ ] **Step 1: Rewrite the validation spec**

`git mv e2e/promotions/wizard-step-validation.spec.ts e2e/promotions/promotion-dialog-validation.spec.ts`. Keep the seeding helpers and `beforeEach`/`afterEach`. Replace the three tests' bodies:

Test 1 — "blocks Create on every invalid section, shows the live preview, and creates the promotion":

```ts
    await page.goto('/promotions');
    await page.getByRole('button', { name: /new promotion/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();

    // Empty name blocks Create.
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/name is required/i)).toBeVisible();

    await dialog.getByLabel(/^name/i).fill(name);
    await dialog.getByLabel(/discount percent/i).fill('20');

    // Unchecking store-wide with nothing selected blocks Create.
    await dialog.getByRole('checkbox', { name: /store-wide/i }).uncheck();
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/select at least one product or category/i)).toBeVisible();

    await dialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(product.name);
    await page.getByRole('option', { name: new RegExp(product.name, 'i') }).click();
    await page.keyboard.press('Escape');

    // Invalid time window blocks Create.
    await dialog.getByRole('switch', { name: /recurring/i }).click();
    await dialog.getByLabel(/start time/i).fill('18:00');
    await dialog.getByLabel(/end time/i).fill('16:00');
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/end time must be after start time/i)).toBeVisible();

    await dialog.getByLabel(/start time/i).fill('00:00');
    await dialog.getByLabel(/end time/i).fill('23:59');

    // Live preview in the summary rail: 20% off $100 -> $80.00.
    const expectedDiscounted = round2(basePrice * (1 - 20 / 100));
    await expect(dialog.getByText(new RegExp(expectedDiscounted.toFixed(2)))).toBeVisible();
    await expect(dialog.getByText(new RegExp(product.name)).first()).toBeVisible();

    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/promotions$/);
    await page.getByPlaceholder(/search/i).fill(name);
    await expect(page.getByRole('row', { name: new RegExp(name, 'i') })).toBeVisible();
```

Test 2 — rename to "edit deep link opens the dialog with every section visible (no step gating)"; after seeding:

```ts
    await page.goto(`/promotions?edit=${promotionId}`);
    const dialog = page.getByRole('dialog', { name: /edit promotion/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel(/^name/i)).toHaveValue(name);
    await expect(dialog.getByRole('heading', { name: /basics/i })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /applies to/i })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /when/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeEnabled();
```

Test 3 — keep its seeding and DB assertions; replace navigation/interaction with:

```ts
    await page.goto(`/promotions?edit=${promotionId}`);
    const dialog = page.getByRole('dialog', { name: /edit promotion/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('checkbox', { name: /store-wide/i })).not.toBeChecked();
    await dialog.getByRole('button', { name: new RegExp(`remove ${product.name}`, 'i') }).click();
    await dialog.getByRole('button', { name: /save changes/i }).click();
    await expect(dialog.getByText(/select at least one product or category/i)).toBeVisible();
    await expect(dialog).toBeVisible();
```

  (then the existing DB check that `promotion_targets` still has one row). Read the rest of the original test 3 to keep the chip-removal locator it used if it differs from `remove {name}` — `MultiSelectPicker` labels chip remove buttons via `removeLabel(name)` = `t('promotionWizard.scope.removeChip', { name })` = `Remove {{name}}`.

- [ ] **Step 2: Trim the other two specs**

In `percent-field-input.spec.ts` delete lines 75–79 (the three `Next` clicks and the two step assertions); in `migrated-review-flag.spec.ts` delete the three consecutive `Next` clicks (lines ~99–101). Everything else stays.

- [ ] **Step 3: Run**

```bash
npx playwright test e2e/promotions/promotion-dialog-validation.spec.ts e2e/promotions/percent-field-input.spec.ts e2e/promotions/migrated-review-flag.spec.ts e2e/promotions/promotion-deleted-mid-cart.spec.ts --reporter=line
```
Expected: green. Debug with the trace in `e2e-results/` if a locator misses; fix the app only if the spec exposes a real dialog bug (e.g. a missing `DialogDescription` id), otherwise fix the spec.

- [ ] **Step 4: Commit**

```bash
git add -A e2e/promotions
git commit -m "test(e2e): promotions specs drive the create/edit dialog instead of the wizard routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Payment history redesign in `PaymentPane`

**Spec:** §3.1.

**Files:**
- Modify: `src/widgets/PaymentPane/ui/PaymentPane.tsx`, i18n `wPanels`
- Test: `src/widgets/PaymentPane/ui/PaymentPane.test.tsx` (existing, stays green)

**Interfaces:**
- Consumes: `usePayments()` (`Payment[]` with `id, tabId, amount, method, processedAt: Date, isRefund`), `useSettings()` (`data?.paymentLabels.{cash,card,rappi}`), existing action components.
- Keep: `Tabs Awaiting Payment` heading text; `data-testid="tabs-waiting-for-payment"`; `Recent Payments` text; `No payment records found.`; `Loading payments…`; `data-testid="payment-row-{id}"`; filter placeholder `Filter by ID…` seeded from `?id=`; buttons `Reprint`, `Edit ticket`, `Reopen ticket`, `Edit items`, `Refund`; `Verify PIN to Process Payment`; `Back to tab list` aria-label; `h2` customer name.

- [ ] **Step 1: i18n keys (`wPanels.json` → `paymentPane`)**

en-US:
```json
"todayTile": "Today",
"refundsTodayTile": "Refunds today",
"paymentsCount_one": "{{count}} payment",
"paymentsCount_other": "{{count}} payments",
"filterAll": "All",
"filterCash": "Cash",
"filterCard": "Card",
"filterTransfer": "Transfer",
"filterRefunds": "Refunds",
"filterLabel": "Filter by method",
"dayToday": "Today",
"dayYesterday": "Yesterday",
"refundBadge": "Refund",
"awaitingCount_one": "{{count}} waiting",
"awaitingCount_other": "{{count}} waiting"
```
es-MX:
```json
"todayTile": "Hoy",
"refundsTodayTile": "Reembolsos de hoy",
"paymentsCount_one": "{{count}} pago",
"paymentsCount_other": "{{count}} pagos",
"filterAll": "Todos",
"filterCash": "Efectivo",
"filterCard": "Tarjeta",
"filterTransfer": "Transferencia",
"filterRefunds": "Reembolsos",
"filterLabel": "Filtrar por método",
"dayToday": "Hoy",
"dayYesterday": "Ayer",
"refundBadge": "Reembolso",
"awaitingCount_one": "{{count}} en espera",
"awaitingCount_other": "{{count}} en espera"
```

- [ ] **Step 2: Rewrite `PaymentHistoryList`**

Replace the component (keep its props and the `?id=` seeding block verbatim) with:

```tsx
type MethodFilter = 'all' | 'cash' | 'card' | 'bank_transfer' | 'refunds';

function dayKey(d: Date): string {
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PaymentHistoryList({ onRefund, onEdit, onReopen, onEditItems }: { … same … }) {
  const { t, i18n } = useTranslation('wPanels');
  const { t: tOrders } = useTranslation('featOrders');
  const { data: payments, isLoading } = usePayments();
  const { data: appSettings } = useSettings();
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id');
  const [filterValue, setFilterValue] = useState(() => (idParam ?? '').trim());
  const [seededIdParam, setSeededIdParam] = useState(idParam);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  if (idParam && idParam !== seededIdParam) {
    setSeededIdParam(idParam);
    setFilterValue(idParam.trim());
  }

  const methodLabel = (method: Payment['method']): string => {
    const labels = appSettings?.paymentLabels;
    if (method === 'cash') return labels?.cash ?? t('paymentForm.defaultLabelCash');
    if (method === 'card') return labels?.card ?? t('paymentForm.defaultLabelCard');
    if (method === 'rappi') return labels?.rappi ?? t('paymentForm.defaultLabelRappi');
    return tOrders('checkoutSale.bankTransferMethodLabel');
  };
  const timeFmt = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' });
  const todayKey = dayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  if (isLoading) { …unchanged loading block… }
  if (!payments || payments.length === 0) { …unchanged empty block… }

  const todays = payments.filter(p => dayKey(p.processedAt) === todayKey);
  const todaySales = todays.filter(p => !p.isRefund);
  const todayRefunds = todays.filter(p => p.isRefund);
  const sum = (list: Payment[]) => Math.round(list.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  const visiblePayments = payments.filter(p => {
    if (filterValue && !p.id.includes(filterValue.trim())) return false;
    if (methodFilter === 'refunds') return p.isRefund;
    if (methodFilter === 'all') return true;
    return !p.isRefund && p.method === methodFilter;
  });

  const groups = new Map<string, Payment[]>();
  for (const p of visiblePayments) {
    const key = dayKey(p.processedAt);
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  const dayLabel = (key: string, sample: Date) =>
    key === todayKey ? t('paymentPane.dayToday') : key === yesterdayKey ? t('paymentPane.dayYesterday') : dayFmt.format(sample);

  const FILTERS: { key: MethodFilter; label: string }[] = [
    { key: 'all', label: t('paymentPane.filterAll') },
    { key: 'cash', label: t('paymentPane.filterCash') },
    { key: 'card', label: t('paymentPane.filterCard') },
    { key: 'bank_transfer', label: t('paymentPane.filterTransfer') },
    { key: 'refunds', label: t('paymentPane.filterRefunds') },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="space-y-4 border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t('paymentPane.recentPayments')}
          </h2>
          <div className="flex gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-2 shadow-xs">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('paymentPane.todayTile')}</p>
              <div className="flex items-baseline gap-2">
                <MoneyDisplay amount={sum(todaySales)} size="lg" />
                <span className="text-xs text-muted-foreground">{t('paymentPane.paymentsCount', { count: todaySales.length })}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-2 shadow-xs">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('paymentPane.refundsTodayTile')}</p>
              <div className="flex items-baseline gap-2">
                <MoneyDisplay amount={Math.abs(sum(todayRefunds))} negative={todayRefunds.length > 0} size="lg" />
                <span className="text-xs text-muted-foreground">{t('paymentPane.paymentsCount', { count: todayRefunds.length })}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={filterValue} onChange={setFilterValue} placeholder={t('paymentPane.filterByIdPlaceholder')} className="w-64" />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('paymentPane.filterLabel')}>
            {FILTERS.map(f => (
              <Button key={f.key} type="button" size="sm" variant={methodFilter === f.key ? 'default' : 'outline'} aria-pressed={methodFilter === f.key} onClick={() => { setMethodFilter(f.key); }}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {visiblePayments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-center text-muted-foreground">{t('paymentPane.noPaymentRecords')}</p>
        </div>
      ) : (
        [...groups.entries()].map(([key, list]) => (
          <section key={key} aria-label={dayLabel(key, list[0]?.processedAt ?? new Date())}>
            <h3 className="sticky top-0 z-10 border-b border-border bg-background/90 px-5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
              {dayLabel(key, list[0]?.processedAt ?? new Date())}
            </h3>
            <div className="divide-y divide-border">
              {list.map(payment => (
                <div key={payment.id} data-testid={`payment-row-${payment.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-4">
                    <MoneyDisplay amount={Math.abs(payment.amount)} negative={payment.isRefund} size="md" className={cn('w-24 shrink-0', payment.isRefund && 'text-destructive')} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        {payment.isRefund && <Badge variant="destructive">{t('paymentPane.refundBadge')}</Badge>}
                        <Badge variant="muted">{methodLabel(payment.method)}</Badge>
                        <span className="text-xs text-muted-foreground">{timeFmt.format(payment.processedAt)}</span>
                      </div>
                      <span className="font-mono text-[0.6875rem] text-muted-foreground/80" title={payment.id}>{payment.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ReprintButton payment={payment} />
                    <EditTicketButton payment={payment} onEdit={onEdit} />
                    <ReopenTabButton payment={payment} onReopen={onReopen} />
                    <EditItemsButton payment={payment} onEditItems={onEditItems} />
                    <RefundButton payment={payment} onRefund={onRefund} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
```

Imports to add: `useSettings` from `@entities/settings`; `Badge` from `@shared/ui/badge`; `Button` from `@shared/ui/button`; `cn` from `@shared/lib/utils`. `PaymentPane.test.tsx` mocks `@entities/payment`, `@entities/refund`, `@entities/tab/model/queries`, `@entities/product`, `@entities/staff/model/store` — it does **not** mock `@entities/settings`; `useSettings` inside the RTL test would hit the real query hook (no Supabase). Add to the test file: `vi.mock('@entities/settings', () => ({ useSettings: () => ({ data: undefined }), useReceiptSettings: () => ({ data: undefined }) }));` — check whether the test already renders `PaymentForm` stubbed (it does) so this mock is safe.

Left column tweak in `PaymentPane`: header gets a count pill:

```tsx
<div className="flex items-center justify-between border-b border-border px-5 py-4">
  <h2 className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
    {t('paymentPane.tabsAwaitingPayment')}
  </h2>
  {openCount > 0 && <Badge variant="brand" className="tabular-nums">{t('paymentPane.awaitingCount', { count: openCount })}</Badge>}
</div>
```

where `openCount` comes from `useTabs()` already used by `TabPaymentList` — call `const { data: tabs } = useTabs();` in `PaymentPane` and `const openCount = (tabs ?? []).filter(tab => tab.status === 'open').length;` (`useTabs` is mocked in the unit test, so this is safe). Column classes: `w-72 shrink-0` when `openCount > 0`, `w-56` otherwise.

- [ ] **Step 3: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/PaymentPane src/pages/payments
npx playwright test e2e/payments/payment-pane.spec.ts e2e/payments/refund.spec.ts e2e/tabs/reopen-closed-ticket.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/PaymentPane src/shared/lib/i18n
git commit -m "feat(ui): payments — day-grouped history with method filters and today's totals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `PaymentForm` two-column layout + quick tender; payments page tab descriptions

**Spec:** §3.2, §3.3.

**Files:**
- Modify: `src/widgets/PaymentModal/ui/PaymentForm.tsx` (JSX only, lines ≈752–1370), `src/pages/payments/index.tsx`, i18n `wPanels` + `pages`
- Test: `src/widgets/PaymentModal/ui/PaymentForm.test.tsx`, `src/widgets/PaymentModal/PaymentModal.test.tsx` (existing, stay green)

**Interfaces:**
- Consumes: existing component state (`method`, `isSplitMode`, `tenderedAmount`, `setTenderedAmount`, `runningTotal`, `isProcessing`).
- Keep: every `data-testid`, label and button name listed in the spec §3.2; no change to any handler, effect, reducer or computed value.

- [ ] **Step 1: i18n keys**

`wPanels.json` → `paymentForm`: en `"quickTenderExact": "Exact", "quickTender": "Tender {{amount}}"`; es `"quickTenderExact": "Exacto", "quickTender": "Recibir {{amount}}"`.
`pages.json` → `payments.descriptions`: en `{ "payments": "Charge waiting tickets and review every completed payment", "refunds": "Every refund processed on this terminal", "bankTransfers": "Confirm or dispute pending bank transfers" }`; es `{ "payments": "Cobra tickets en espera y revisa cada pago completado", "refunds": "Todos los reembolsos procesados en esta terminal", "bankTransfers": "Confirma o disputa transferencias bancarias pendientes" }`.

- [ ] **Step 2: Restructure the pay-step JSX**

Inside `return ( <> <ScrollArea className="flex-1 p-4 sm:px-6"> … )`, change the inner wrapper from `<div className="space-y-5 pb-2">` to:

```tsx
<div className="grid gap-5 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
  <div className="order-2 space-y-5 lg:order-1">
    {/* Payment method section (heading + split toggle + method buttons / split rows) — moved here unchanged */}
    {/* !isSplitMode && method === 'cash' block — unchanged, plus the quick-tender row below the MoneyInput */}
    {/* !isSplitMode && method === 'card' block — unchanged */}
    {/* !isSplitMode && method === 'bank_transfer' block — unchanged */}
    {/* errorMessage alert — unchanged */}
  </div>
  <div className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-0">
    {/* order summary card (tab.customerName + groupedItems) — unchanged */}
    {/* apply-promotion section — unchanged */}
    {/* discount section — unchanged */}
    {/* rappi notice — unchanged */}
    {/* totals card — unchanged except: total MoneyDisplay size="xl" */}
  </div>
</div>
```

Move the existing `<section>` blocks into those two slots by cut/paste; do not edit their internals except the total size. On `<lg` the DOM order is summary column first (`order-1`), which matches the current top-to-bottom reading order.

Quick-tender row — insert directly under the `MoneyInput label={t('paymentForm.amountTendered')}` in the cash block:

```tsx
<div className="grid grid-cols-5 gap-2" role="group" aria-label={t('paymentForm.amountTendered')}>
  <POSButton
    type="button"
    variant="outline"
    touchSize="large"
    disabled={isProcessing}
    data-testid="quick-tender-exact"
    onClick={() => {
      setTenderedAmount(runningTotal);
    }}
  >
    {t('paymentForm.quickTenderExact')}
  </POSButton>
  {QUICK_TENDER_AMOUNTS.map(amount => (
    <POSButton
      key={amount}
      type="button"
      variant="outline"
      touchSize="large"
      disabled={isProcessing}
      data-testid={`quick-tender-${String(amount)}`}
      aria-label={t('paymentForm.quickTender', { amount: formatMoney(amount) })}
      onClick={() => {
        setTenderedAmount(amount);
      }}
    >
      {formatMoney(amount)}
    </POSButton>
  ))}
</div>
```

with, at module scope: `const QUICK_TENDER_AMOUNTS = [100, 200, 500, 1000] as const;` (MXN notes). `formatMoney` is already imported.

Footer: change the footer wrapper to `flex flex-col gap-2 border-t … sm:flex-row-reverse sm:items-center` so the primary is on the right and `Cancel` on the left at `sm+`; button props unchanged (`w-full` → `sm:flex-1` on the primary, `sm:w-auto` on Cancel).

- [ ] **Step 3: Payments page tab strip**

In `src/pages/payments/index.tsx` make `Tabs` controlled (`const [tab, setTab] = useState<'payments' | 'refunds' | 'bankTransfers'>('payments')`) and render, inside the existing strip div:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <TabsList>…unchanged triggers…</TabsList>
  <p className="text-sm text-muted-foreground">{t(`payments.descriptions.${tab}`)}</p>
</div>
```

- [ ] **Step 4: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/PaymentModal src/pages/payments
npx playwright test e2e/checkout/happy-path.spec.ts e2e/payments/split-payment.spec.ts e2e/payments/apply-promotion-and-custom-discount.spec.ts e2e/payments/edge-cases.spec.ts e2e/checkout/bank-transfer-checkout.spec.ts --reporter=line
```

- [ ] **Step 5: Commit**

```bash
git add src/widgets/PaymentModal/ui/PaymentForm.tsx src/pages/payments/index.tsx src/shared/lib/i18n
git commit -m "feat(ui): payment form — two-column layout with sticky totals and quick cash tender

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Checkout layout

**Spec:** §4.

**Files:**
- Modify: `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`, `src/widgets/ProductGrid/ui/ProductGrid.tsx`, `src/entities/product/ui/ProductCard.tsx`, `src/entities/tab/ui/CartItem.tsx`, i18n `wPanels`
- Test: `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx`, `src/entities/product/ui/ProductCard.test.tsx`, `src/widgets/ProductGrid` (none), existing e2e.

**Interfaces:**
- Consumes: `useCartStore` actions already destructured (`clearCart`, `holdCart`, …), `HoldSaleBanner`, `ProductGrid` props (`search`, `onSearchChange`, …).
- Keep: single `<aside>` for the cart; `data-testid="cart-line"` + `rounded-lg border bg-card` classes on each line root; `cart-item-notes-{id}`; product tile `aria-label` `Select {name}` and barcode text; search `placeholder` `Search products` (`checkoutPanel.searchPlaceholder`); category tab aria-labels; buttons `Hold`, `Process payment`, `Resume`, `Discard`; empty copy `Cart is empty`; `[aria-label="Promotion applied"]`.

- [ ] **Step 1: i18n keys (`wPanels.json` → `checkoutPanel`)**

en: `"clearCart": "Clear cart", "clearCartTitle": "Clear the cart?", "clearCartBody": "All lines are removed. Nothing has been charged.", "clearCartConfirm": "Clear", "itemsLine_one": "{{count}} item", "itemsLine_other": "{{count}} items", "subtotal": "Subtotal", "scanReady": "Scanner ready"`.
es: `"clearCart": "Vaciar carrito", "clearCartTitle": "¿Vaciar el carrito?", "clearCartBody": "Se quitan todas las partidas. No se ha cobrado nada.", "clearCartConfirm": "Vaciar", "itemsLine_one": "{{count}} artículo", "itemsLine_other": "{{count}} artículos", "subtotal": "Subtotal", "scanReady": "Escáner listo"`.

- [ ] **Step 2: Move the search bar out of `ProductGrid`**

In `ProductGrid.tsx` delete the `{/* Search / scan bar */}` block (the `div.group/search` with `Input`), remove the now-unused `Search`/`ScanBarcode`/`Input` imports. Keep the `search`/`onSearchChange` props (still used for filtering and clearing after select).

- [ ] **Step 3: New `CheckoutPanel` cart-screen JSX**

Replace the non-payment `return (…)` with:

```tsx
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background">
      {/* Toolbar: search/scan + held sale */}
      <div className="flex items-center gap-4 border-b border-border bg-card px-4 py-3 lg:px-5">
        <div className="group/search relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/search:text-brand"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
            }}
            placeholder={t('checkoutPanel.searchPlaceholder')}
            aria-label={t('checkoutPanel.searchPlaceholder')}
            className="h-12 rounded-xl pr-36 pl-11 text-base shadow-xs"
            autoComplete="off"
            autoFocus
          />
          <span
            className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:flex"
            aria-hidden="true"
          >
            <ScanBarcode className="size-3.5" />
            {t('checkoutPanel.scanReady')}
          </span>
        </div>
        <HoldSaleBanner />
      </div>

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)]">
        {/* Catalogue */}
        <section className="flex min-h-0 flex-col gap-3 p-4 lg:p-5">
          <ProductGrid
            weightEntry={weightEntry}
            search={search}
            onSearchChange={setSearch}
            resolvePromotionMatch={resolvePromotionMatch}
            onSelect={product => {
              const match = resolvePromotionMatch(product);
              addItem(product, [], match?.discountedUnitPrice, match?.promotionId ?? null);
            }}
          />
        </section>

        {/* Cart */}
        <aside className="flex min-h-0 flex-col border-l border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="size-[1.125rem] text-muted-foreground" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight">{t('checkoutPanel.cartTitle')}</h2>
              {itemCount > 0 && (
                <Badge variant="muted" className="tabular-nums">
                  {t('checkoutPanel.itemCount', { count: itemCount })}
                </Badge>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={items.length === 0}
              onClick={() => {
                setClearOpen(true);
              }}
            >
              <Eraser className="size-4" aria-hidden="true" />
              {t('checkoutPanel.clearCart')}
            </Button>
          </div>

          {items.length === 0 ? ( …unchanged empty state… ) : ( …unchanged ScrollArea list, container padding p-3 gap-2… )}

          <div className="shrink-0 space-y-3 border-t border-border bg-background/60 p-4 backdrop-blur-sm">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>{t('checkoutPanel.itemsLine', { count: itemCount })}</dt>
                <dd>{t('checkoutPanel.subtotal')}</dd>
              </div>
              <div className="flex items-end justify-between">
                <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {t('checkoutPanel.cartTotal')}
                </dt>
                <dd>
                  <MoneyDisplay amount={total} size="xl" className="text-[2.5rem] leading-none" />
                </dd>
              </div>
            </dl>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <POSButton type="button" variant="outline" touchSize="xl" disabled={items.length === 0 || isHeld} onClick={holdCart}>
                <PauseCircle className="size-5" aria-hidden="true" />
                {t('checkoutPanel.hold')}
              </POSButton>
              <POSButton
                type="button"
                variant="brand"
                touchSize="xl"
                className="justify-between px-6"
                disabled={items.length === 0 || !staffId || hasPriceConflict}
                onClick={() => {
                  setPaymentOpen(true);
                }}
              >
                <span>{t('checkoutPanel.processPayment')}</span>
                <ArrowRight className="size-5" aria-hidden="true" />
              </POSButton>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={clearOpen}
        title={t('checkoutPanel.clearCartTitle')}
        description={t('checkoutPanel.clearCartBody')}
        confirmLabel={t('checkoutPanel.clearCartConfirm')}
        variant="destructive"
        onCancel={() => { setClearOpen(false); }}
        onConfirm={() => { clearCart(); setClearOpen(false); }}
      />
      {editingWeightItem?.weightGrams != null && ( …unchanged WeightEntryDialog… )}
    </div>
  );
```

Add `const [clearOpen, setClearOpen] = useState(false);` next to the other state; imports `Eraser, Search` from `lucide-react`, `Button` from `@shared/ui/button`, `Input` from `@shared/ui/input`, `ConfirmDialog` from `@shared/ui`. In the payment branch change `max-w-3xl` → `max-w-5xl`.

- [ ] **Step 4: Tile and line density**

`ProductCard.tsx` root classes: `min-h-[8.25rem] … p-3.5` → `min-h-[6.75rem] … p-3`; name `text-[0.9375rem]` → `text-sm`; price `size="lg"` → `size="md"`. `ProductGrid` grid: `grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5` → `grid-cols-3 gap-2.5 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6`. `CartItem.tsx` root: `gap-3 … p-3` → `gap-2 … p-2.5` (keep `rounded-lg border border-border bg-card`).

- [ ] **Step 5: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/CheckoutPanel src/entities/product/ui src/entities/tab/ui
npx playwright test e2e/checkout/happy-path.spec.ts e2e/checkout/barcode-scan-search.spec.ts e2e/checkout/promotion-live-price.spec.ts e2e/inventory/loose-weight-hold-sale.spec.ts e2e/checkout/modifier-notes.spec.ts --reporter=line
```

- [ ] **Step 6: Commit**

```bash
git add src/widgets/CheckoutPanel src/widgets/ProductGrid src/entities/product/ui/ProductCard.tsx src/entities/tab/ui/CartItem.tsx src/shared/lib/i18n
git commit -m "feat(ui): checkout — top scan bar, denser tiles, cart summary with clear action

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Peek window

**Spec:** §8.

**Files:**
- Modify: `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx`, i18n `wPanels`

**Interfaces:**
- Consumes: `evaluateBestPromotion`, `usePromotions` (`@entities/promotion`), `useSettings` (`@entities/settings`), `useNearExpiryAlerts` (`@entities/inventory`) — read-only.
- Keep: heading = product name; exact-text `sku` and `barcode`; `{{count}} in stock`; `Sold by weight (kg)` / `Sold by piece`; `QuantityControl`; `Add to Cart`; `Close`; every handler, effect and Tauri event call verbatim; `PeekProductDetail` props.

- [ ] **Step 1: i18n keys (`wPanels.json` → `productPeekPanel`)**

en: `"scannedEyebrow": "Scanned product", "perKg": "per kg", "each": "each", "total": "Total", "promoPrice": "Promo price", "wasPrice": "Was {{price}}", "scanAgainHint": "Point the scanner at the barcode again.", "scannedCode": "Scanned code"`.
es: `"scannedEyebrow": "Producto escaneado", "perKg": "por kg", "each": "c/u", "total": "Total", "promoPrice": "Precio promo", "wasPrice": "Antes {{price}}", "scanAgainHint": "Vuelve a apuntar el escáner al código de barras.", "scannedCode": "Código escaneado"`.

- [ ] **Step 2: New shell + detail JSX**

Replace `PeekWindowShell`:

```tsx
function PeekWindowShell({ header, children, footer }: { header?: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="flex items-center gap-2 border-t border-border bg-card p-4">{footer}</div>
    </div>
  );
}
```

Add a helper for the hero wash (no hex literal — the colour is data):

```tsx
function washStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  // eslint-disable-next-line i18next/no-literal-string -- CSS color-mix expression, not UI copy
  return { backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` };
}
```

Inside `PeekProductDetail` add (after `const stockTier = …`):

```tsx
const { data: activePromotions } = usePromotions();
const { data: appSettings } = useSettings();
const { data: nearExpiryAlerts } = useNearExpiryAlerts();
const match =
  activePromotions && appSettings
    ? evaluateBestPromotion(
        { productId: product.id, categoryId: product.categoryId, basePrice: product.basePrice },
        activePromotions,
        new Date(),
        appSettings.nearExpiry.discountPercent,
        nearExpiryAlerts?.find(alert => alert.productId === product.id)?.daysUntilExpiry ?? null,
        appSettings.nearExpiry.thresholdDays,
        appSettings.general.timezone
      )
    : null;
const unitPrice = match?.discountedUnitPrice ?? product.basePrice;
const lineTotal = product.soldByWeight ? unitPrice : unitPrice * qty;
const meterMax = Math.max((product.lowStockThreshold ?? 0) * 3, 1);
const meterPct = Math.min(100, Math.round(((product.quantityOnHand ?? 0) / meterMax) * 100));
const initials = product.name.trim().slice(0, 2).toUpperCase();
```

Render:

```tsx
<PeekWindowShell
  header={
    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-5 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScanBarcode className="size-4" aria-hidden="true" />
        <span className="font-semibold tracking-[0.1em] uppercase">{t('productPeekPanel.scannedEyebrow')}</span>
        {product.barcode && <span className="font-mono">{product.barcode}</span>}
      </div>
      {product.category && (
        <Badge variant="muted" className="gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: product.category.color }} aria-hidden="true" />
          {product.category.name}
        </Badge>
      )}
    </div>
  }
  footer={
    <>
      <div className="mr-auto flex flex-col leading-tight">
        <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('productPeekPanel.total')}</span>
        <MoneyDisplay amount={lineTotal} size="lg" />
      </div>
      <CloseButton onClose={onClose} />
      <POSButton type="button" variant="brand" touchSize="xl" className="min-w-44" onClick={handleAddToCart}>
        {t('productPeekPanel.addToCart')}
      </POSButton>
    </>
  }
>
  <div className="relative flex h-52 items-center justify-center overflow-hidden bg-muted" style={washStyle(product.category?.color)}>
    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={product.category ? { backgroundColor: product.category.color } : undefined} />
    {product.imageUrl ? (
      <img src={product.imageUrl} alt={product.name} className="size-full object-contain p-4" />
    ) : (
      <>
        <span aria-hidden="true" className="text-6xl font-semibold tracking-tight text-foreground/70">{initials}</span>
        <span className="sr-only">{t('productPeekPanel.noPhoto')}</span>
      </>
    )}
  </div>

  <div className="space-y-5 px-6 py-5">
    <h1 title={product.name} className="line-clamp-2 text-2xl font-semibold tracking-tight">{product.name}</h1>

    <div className="flex flex-wrap items-end gap-3">
      <MoneyDisplay amount={unitPrice} size="xl" className={cn('text-4xl', match && 'text-success-strong')} />
      <Badge variant="muted">{product.soldByWeight ? t('productPeekPanel.perKg') : t('productPeekPanel.each')}</Badge>
      {match && (
        <div className="flex items-center gap-2">
          <Badge variant="success">{t('productPeekPanel.promoPrice')}</Badge>
          <span className="text-sm text-muted-foreground line-through">
            {t('productPeekPanel.wasPrice', { price: formatMoney(product.basePrice) })}
          </span>
        </div>
      )}
    </div>

    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <StatusBadge status={stockTier} />
        <span className="text-sm text-muted-foreground">{t('productPeekPanel.stockCount', { count: product.quantityOnHand ?? 0 })}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn('h-full rounded-full', stockTier === 'inv_out_of_stock' ? 'bg-destructive' : stockTier === 'inv_low_stock' ? 'bg-warning' : 'bg-success')}
          style={{ width: `${String(meterPct)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {product.soldByWeight ? t('productPeekPanel.unitWeight') : t('productPeekPanel.unitPiece')}
      </p>
    </div>

    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('productPeekPanel.skuLabel')}</dt>
        <dd className="font-mono"><span>{product.sku ?? '—'}</span></dd>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('productPeekPanel.barcodeLabel')}</dt>
        <dd className="font-mono"><span>{product.barcode ?? '—'}</span></dd>
      </div>
    </dl>

    {!product.soldByWeight && <QuantityControl value={qty} onChange={setQty} />}
  </div>
</PeekWindowShell>
```

The e2e spec asserts the barcode text with `getByText(barcode, { exact: true })` — the header `span` and the `dd span` both match; use `.first()`-safe rendering by making the header show the barcode only when the details `dd` would not (simplest: drop the barcode from the header strip and keep it only in the `dd`). Do that.

Not-found view: `EmptyState` plus a mono chip with the scanned code (`new URLSearchParams(window.location.search).get('barcode')`) under the label `scannedCode`, and `scanAgainHint` as the description. Loading view: three `CardSkeleton`s (`height={208}`, `height={40}`, `height={120}`) inside the same shell.

Imports to add: `ScanBarcode` from `lucide-react`; `type CSSProperties` from `react`; `useNearExpiryAlerts` from `@entities/inventory`; `evaluateBestPromotion, usePromotions` from `@entities/promotion`; `useSettings` from `@entities/settings`; `formatMoney` from `@shared/lib/format`; `cn` from `@shared/lib/utils`; `Badge` from `@shared/ui/badge`.

- [ ] **Step 3: Verify**

```bash
npm run lint:fix && npm run typecheck && npm run lint
npx vitest run src/widgets/ProductPeekWindow src/features/open-product-peek-window
npx playwright test e2e/checkout/peek-window.spec.ts --reporter=line
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/ProductPeekWindow src/shared/lib/i18n
git commit -m "feat(ui): peek window — hero, promo price, stock meter and sticky add-to-cart

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Integration gate, docs, memory

**Files:**
- Modify: `DESIGN-TOKENS.md` (component conventions), `CLAUDE.md` (routes/feature notes), `C:\Users\giris\.claude\projects\D--Projects-Code-supermarket-pos\memory\project_ui_redesign_fable_branch.md`

- [ ] **Step 1: Full local gates**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green. Fix anything red at the source (not by loosening a test) and commit as `fix(ui): …`.

- [ ] **Step 2: Full E2E**

```bash
npx playwright test --reporter=line
```
Expected: green apart from any spec that was already red on `ui-redesign-fable` before this plan (check with `git stash`-free method: `git log` shows the last full run in the redesign session found 6 failures that were fixed in commits `0906fad`/`c97171f`; treat any remaining failure as yours unless the trace proves it is data/env). Fix and commit.

- [ ] **Step 3: Docs**

`DESIGN-TOKENS.md` → "Component conventions" add: "Grouped settings-style navigation uses `VerticalTabsList`/`VerticalTabsGroupLabel`/`VerticalTabsTrigger` inside `<Tabs orientation="vertical">` — never a hand-built list of buttons."
`CLAUDE.md` → in "Routes" note that promotions create/edit is a dialog on `/promotions` (`?new=1`, `?edit=<id>`); in "Implemented Features" product/category/modifier management is under Inventory › Catalog (not Settings).

- [ ] **Step 4: Memory**

Append to the memory file's body: the IA decisions (catalog under Inventory, promotion dialog with deep links, vertical tabs primitive) and the e2e-selector contract that constrained them (`aside` singleton, `cart-line` classes, tab names). Keep the `MEMORY.md` index line unchanged.

- [ ] **Step 5: Commit**

```bash
git add DESIGN-TOKENS.md CLAUDE.md
git commit -m "docs(ui): record Counter UX pass 2 conventions and IA moves

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review (done by the planner)

- **Spec coverage:** §1 → T1; §2.1/2.2 → T6; §2.3 → T7; §3.1 → T8; §3.2/3.3 → T9; §4 → T10; §5 → T4 (+ Products removal in T2); §6 → T5; §7 → T2 + T3; §8 → T11; §9 keys are distributed per task; §10 tests are per task + T12; §11 is the execution model.
- **Type consistency:** `CatalogTab({ currentRole: UserRole | null })` in T2 is what T3's shell passes (`useStaffStore(s => s.currentStaff?.role ?? null)`); `StockTab({ onOpenCatalog: (() => void) | undefined })` matches the shell; `PromotionDialog` props match the page usage in T6 and the spec; `VerticalTabsTrigger` props match T4/T5 usage.
- **Placeholders:** none; every code step contains the code or the exact edit.
