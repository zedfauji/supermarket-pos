# Counter UX pass 2 — payments, promotions, checkout, settings, reports, inventory, peek window

Date: 2026-09-05 · Branch: `ui-redesign-fable` (worktree `ui-redesign-astra-6bcac4`) · Status: approved by delegation (user: "you make the decisions, no confirmation needed")

## Hard rules (non-negotiable, from the user)

1. Never touch `main`. All work lands on `ui-redesign-fable`.
2. No business logic, domain, or backend changes. Off-limits: `src/shared/lib/domain.ts`, `src/shared/lib/domain-helpers.ts`, every `entities/*/model/queries.ts` / `store.ts`, every `features/*/model/*` hook, `src/shared/lib/payment-processor.ts`, `promotion-pricing.ts`, RBAC action↔role maps in `src/shared/lib/rbac.ts`, permission gates (who can see what stays identical).
3. No Supabase migrations or edge functions. Nothing under `supabase/` changes; no `apply_migration`, no `deploy_edge_function`.

Allowed surface: `pages/`, `widgets/`, `features/*/ui/*`, `shared/ui/*`, `shared/config/navigation.ts`, `app/router.tsx` (route wiring only), i18n catalogs, unit tests, e2e specs, Storybook stories.

## What the user said, translated into problems

| Complaint | Root cause in current code |
|---|---|
| Promotion wizard "seriously do not like it" — put it back as a dialog | `PromotionWizardPage` is a 4-step gated tab wizard on its own route; a 6-field form was turned into a 4-screen journey with forward-nav gating. |
| Payment screens need reimagining | `PaymentPane` history is a flat list filtered by raw ID, five text buttons per row, a permanent 320 px "awaiting payment" column that is empty 95 % of the day; `PaymentForm` is one long scroll with no quick-tender and the order summary scrolls away. |
| Settings & Reports sub-options are generic | Both pages are one horizontal strip of 9–11 same-weight pill tabs. No grouping hierarchy, no descriptions, no visual priority. |
| Checkout layout "doesn't make sense" | Search is buried inside the grid column; hold-sale banner pushes the grid; cart total lives at the very bottom of a narrow column; no summary or clear action; tiles too tall for a barcode-first store. |
| Inventory too shallow | Three tabs; the change log prints raw product/staff UUIDs; no filters beyond category; no stock value; no way to reach catalog/receiving from here. |
| Products configured under Settings, should be Inventory | `ProductsSettingsTab` (products/categories/modifiers/modifier groups) lives in `SettingsTabsPanel`. |
| Peek window bland | Plain white column: square placeholder, small text rows. |

## Design system context

Everything uses the existing "Counter" tokens (`DESIGN-TOKENS.md`): `brand` is the single accent, `*-soft/*-strong` for status, radius scale md→3xl outward, Geist, `text-numeric` for money, `POSButton`/`Button` only, shadcn primitives from `@shared/ui`. No new colours, no hex, no arbitrary spacing classes (lint blocks them).

## 1. New shared primitive: vertical grouped tabs

**File:** `src/shared/ui/vertical-tabs.tsx` (+ `vertical-tabs.stories.tsx`, export from `shared/ui/index.ts`).

Thin styled wrappers over the existing Radix `Tabs` (keep `role="tab"`/`tablist`/`tabpanel` so every e2e `getByRole('tab', …)` keeps working):

- `VerticalTabsList` — `TabsList` with `flex-col items-stretch h-auto w-full bg-transparent p-0 gap-0.5`, `aria-orientation="vertical"` via `<Tabs orientation="vertical">` on the root (caller passes it).
- `VerticalTabsGroupLabel` — eyebrow `p` (`text-[0.6875rem] font-semibold tracking-[0.12em] uppercase text-muted-foreground`, `px-3 pt-4 pb-1.5`, first group `pt-1`).
- `VerticalTabsTrigger` — `TabsTrigger` rendered as a left-aligned row: optional `icon` (lucide, `size-4`), `label`, optional one-line `description` (`text-xs text-muted-foreground`, hidden when compact), optional trailing `badge` node. Active state: `bg-card shadow-xs text-foreground` plus a 3 px `bg-brand` left bar (same visual language as the sidebar). Height ≥ 44 px (touch target). Accessible name must equal the label text only (put description in a `span aria-hidden` or after the label inside the same button — Playwright's `getByRole('tab', { name: 'Hardware' })` is a substring match by default, so a description inside the button is fine; but the `exact:true` / regex `^…$` usages in e2e — `/^(Idioma|Language)$/`, `/^(Product|Producto)$/` (that one is a column button, not a tab) — require the accessible name to be exactly the label. Therefore render the description with `aria-hidden="true"`.)

Layout contract for consumers: `grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]`; nav column is `lg:sticky lg:top-0 self-start`; on `<lg` the list collapses to a horizontally scrolling row (`flex-row overflow-x-auto`) — implemented inside `VerticalTabsList` via responsive classes so consumers do nothing.

## 2. Promotions — dialog replaces the wizard

### 2.1 `PromotionDialog` (`src/features/manage-promotions/ui/PromotionDialog.tsx`)

Props: `{ open: boolean; onOpenChange(open): void; promotion?: Promotion | null }` — same shape as the deleted `PromotionFormDialog`.

State: reuse `usePromotionWizardState(promotion)` unchanged (it already owns every field, validation predicate, and `save()`). Ignore `currentStep`/`furthestValidStep`. Mount the inner form as `<PromotionDialogForm key={open ? (promotion?.id ?? 'new') : 'closed'} …/>` so the hook's `useEffect([promotion])` reset also fires on every open.

Layout: `DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden"`.

```
┌ header (px-6 py-5, border-b) ───────────────────────────────────────────────┐
│ New Promotion                                   (subtitle: one sentence)     │
├ body: grid lg:grid-cols-[minmax(0,1fr)_18rem]  max-h-[min(70dvh,44rem)] ───┤
│ LEFT  (overflow-y-auto px-6 py-5 space-y-8)   │ RIGHT (border-l bg-muted/30)│
│  §1 Basics — Name · Discount (segmented        │  sticky summary card       │
│      Percent|Fixed + value input side by side) │  (StepReview body: name,   │
│  §2 Applies to — store-wide checkbox / picker  │  discount, scope, dates,   │
│  §3 When — DateRangePicker(PROMOTION presets)  │  recurrence + live example │
│      Recurring switch → day chips + time window│  price)                    │
├ footer (DialogFooter) ──────────────────────────────────────────────────────┤
│ [Cancel]                                   [Create Promotion / Save Changes]│
└─────────────────────────────────────────────────────────────────────────────┘
```

Each section: eyebrow number + title (`01 · Basics`), one-line helper. Sections are `<section aria-labelledby>` with a `ref` so submit can `scrollIntoView` the first invalid one.

Validation: no gating. On submit run `validateBasics()`, `isScopeStepValid()`, `isValidityStepValid()`; set `attempted = true` so `StepScope`/`StepValidityRecurrence` render their existing `role="alert"` messages; scroll to first invalid; return. On success `toast.success(t('promotionFormDialog.savedToast'))`, `onOpenChange(false)`.

Reuse the existing step bodies as section bodies: `StepScope`, `StepValidityRecurrence`, `StepReview` (drop `max-h-[60vh] overflow-y-auto` from `StepReview`'s root; the rail handles scroll). Keep their props.

Day-of-week: restyle the seven checkboxes as pill toggles but keep them real `Checkbox` elements inside `<label>` so `getByRole('checkbox', { name: 'Mon' })` still resolves.

### 2.2 Promotions page (`src/pages/promotions/index.tsx`)

- Delete `/promotions/new` and `/promotions/:id/edit` routes from `router.tsx`; delete `PromotionWizardPage.tsx`; remove its export from the feature `index.ts`; export `PromotionDialog` instead.
- Page owns `dialog: { open: boolean; promotion: Promotion | null }`. "New Promotion" header button and the empty-state action open create mode; row pencil opens edit mode.
- Deep links (keeps e2e simple): `?new=1` opens create; `?edit=<id>` opens edit once `promotions` has loaded. Clear the param on close via `setSearchParams({}, { replace: true })`.
- Above the table add a **status strip + filter**: four stat tiles (Active now · Scheduled · Expired/Inactive · Needs review) computed client-side with `derivePromotionStatus`; clicking a tile filters the table (toggle; second click clears). Tiles are `Button variant="ghost"` with `aria-pressed`. Add a text hint under the title: "Promotions apply automatically at checkout; the best price wins."
- Table unchanged otherwise (column ids, `Switch` aria-label, Edit/Delete icon buttons, `searchable`, `ConfirmDialog`).

### 2.3 E2E rewrite (`e2e/promotions/`)

- `wizard-step-validation.spec.ts` → rename `promotion-dialog-validation.spec.ts`. Test 1: click New Promotion → `getByRole('dialog', { name: /new promotion/i })` visible; click Create with empty name → `/name is required/i` visible; fill name + percent 20; uncheck store-wide; Create → `/select at least one product or category/i`; pick product; set recurring on with 18:00→16:00; Create → `/end time must be after start time/i`; fix times; assert live preview text `product.name` and `80.00` inside the dialog; Create → dialog hidden, URL still `/promotions`, row visible after search. Test 2 (former "edit mode any step"): `goto('/promotions?edit=<id>')` → dialog `/edit promotion/i` visible, name input has value, all three section headings visible (`/basics/i`, `/applies to/i`, `/when/i`) — no gating concept remains. Test 3 (scope guard): same as today but through the dialog: uncheck store-wide, remove the chip, Save Changes → error visible, dialog still open, DB `promotion_targets` count unchanged.
- `percent-field-input.spec.ts`, `migrated-review-flag.spec.ts`: drop the three `Next` clicks; the rest is identical (labels unchanged: `/^name/i`, `/discount percent/i`, `/create promotion/i`).

## 3. Payments

### 3.1 `PaymentPane` (`src/widgets/PaymentPane/ui/PaymentPane.tsx`)

Left column ("Tabs Awaiting Payment"): keep heading text, `data-testid="tabs-waiting-for-payment"`, card `aria-label="tab {name}"`, `aria-pressed`. Changes: width `w-72`, header shows a count pill, and when there are zero open tabs the column shrinks to `w-56` with the existing `EmptyState` (still rendered, still the same copy). No logic change.

Right column, no tab selected → **payment history** redesign (`PaymentHistoryList`):

- Header row: eyebrow "Recent Payments" (keep text), then a **summary strip**: "Today" tile (count + sum of non-refund payments whose `processedAt` is today), "Refunds today" tile (count + abs sum). Pure client-side derivation from `payments`.
- Toolbar: existing `SearchInput` (placeholder `paymentPane.filterByIdPlaceholder`, still seeded from `?id=`) + method filter chips (All · Cash · Card · Bank transfer · Refunds) as `Button variant="ghost/outline"` with `aria-pressed`. Chip filter is client-side on `payment.method` / `payment.isRefund`.
- Rows: keep `data-testid="payment-row-{id}"` and the existing action buttons (`ReprintButton`, Edit ticket, Reopen ticket, Edit items, Refund — same components, same accessible names). Restructure each row into: left = amount (`MoneyDisplay size="md"`, refunds prefixed by a `Badge variant="destructive"` "Refund" and shown in `text-destructive`), method `Badge variant="muted"` (capitalised method label — reuse the `paymentLabels` from `useSettings` where available, fallback raw), date+time via `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })`, short id `font-mono text-xs` (first 8 chars) with a `title` of the full id; right = actions cluster, `Refund` last and visually distinct (`variant="destructive"` already). Row hover `bg-muted/40`, `divide-y`.
- Group rows by day with sticky day headers ("Today", "Yesterday", `dateStyle: 'full'`) — computed client-side, `Intl.RelativeTimeFormat` not required; simple date-key grouping.

Right column, tab selected: unchanged flow (header with back button + `h2` customer name, PIN card, then `PaymentForm`). Restyle only.

### 3.2 `PaymentForm` (`src/widgets/PaymentModal/ui/PaymentForm.tsx`) — JSX-only changes

No state, handler, reducer, or effect changes. Keep every `data-testid`, label, and accessible name (tests: `payment-btn-*`, `discount-section`, `discount-toggle`, `discount-type-*`, `discount-value-input`, `discount-applied-label`, `discount-row`, `tax-row`, `total-row`, `apply-promotion-select`, `split-mode-toggle`, `/amount tendered/i`, `Amount`, `Payment N`, `Remove payment N`, `Fully allocated ✓`, `/remaining to pay/i`, `Process split payment`, `Cancel`, receipt step unchanged).

Layout at `lg:` becomes two columns inside the existing `ScrollArea`:

```
grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start
LEFT  (order 1): payment method section (split toggle, method buttons),
                 method-specific inputs (cash tendered + NEW quick-tender row,
                 card charge/reference, bank-transfer customer fields),
                 error alert
RIGHT (order 2, lg:sticky lg:top-0): order summary card (items), apply-promotion,
                 discount section, totals card
```

On `<lg` everything stacks in the current order (summary first).

**Quick tender (cash, non-split only):** a row of `POSButton variant="outline" touchSize="large"` under the tendered input: `Exact` (sets `tenderedAmount = runningTotal`), then `$100 · $200 · $500 · $1000` (sets `tenderedAmount = value`, formatted via `formatMoney`). Buttons carry `data-testid="quick-tender-exact"` / `quick-tender-100` etc. `aria-label` = `t('paymentForm.quickTender', { amount })`. New i18n keys: `paymentForm.quickTenderExact`, `paymentForm.quickTender`.

Totals card: make the total line the visual anchor (`MoneyDisplay size="xl"`), keep `data-testid="total-row"`.

Footer: unchanged buttons; on `lg:` right-align the primary and keep Cancel as a ghost to its left in one row.

`CheckoutPanel` payment container: `max-w-3xl` → `max-w-5xl`.

### 3.3 Payments page (`src/pages/payments/index.tsx`)

Keep the three tabs and their names. Restyle the tab strip row: tabs on the left, a muted one-line description of the active tab on the right (`pages.payments.descriptions.*`, new keys). No other change.

## 4. Checkout (`CheckoutPanel`, `ProductGrid`, `ProductCard`, `CartItem`)

Keep: `aside` is the only `<aside>` on the page; cart lines keep `data-testid="cart-line"` and the class trio `rounded-lg border bg-card` on the line root (e2e `aside .rounded-lg.border.bg-card`); `cart-item-notes-{productId}` input; product tiles keep `aria-label="Select {name}"` (`productCard.selectRegularPrice`) and the barcode text; search `placeholder="Search products"`; category tabs `aria-label="Filter by {name}"`; buttons `Hold` (exact `^hold$`), `Process payment` (`^process payment$`), `Resume`, `Discard`; empty copy "Cart is empty"; `[aria-label="Promotion applied"]` on discounted lines; "% off" text.

New layout:

```
┌ toolbar (col-span-2, h-16, border-b, px-5, flex gap-4) ──────────────────────┐
│ [🔍 Search products ………………………… ⌨︎ scan]   [HoldSaleBanner (inline, compact)] │
├ catalogue (p-4 lg:p-5, flex-col) ──────────────┬ aside cart (w 24–28rem) ────┤
│ CategoryTabs (pills)                            │ header: Cart · N items  [Clear]│
│ ProductGrid — denser tiles                      │ lines (ScrollArea)            │
│   grid-cols-3 md:4 xl:5 2xl:6, min-h 6.75rem    │ ───────────────────────────── │
│   tile: name (2 lines), price, small category   │ footer (bg-card, border-t):   │
│   dot + barcode mono; weight icon top-right     │  Items N · Subtotal $X (sm)   │
│                                                 │  TOTAL  $X.XX (text-[2.5rem]) │
│                                                 │  [Hold]  [Process payment →]  │
└─────────────────────────────────────────────────┴───────────────────────────────┘
```

- Search input moves out of `ProductGrid` into the toolbar (ProductGrid keeps the `search` prop; the input JSX moves to `CheckoutPanel`). `autoFocus` on the search input; a visible "scan or type" hint pill on the right of the input (`checkoutPanel.scanHint` key already exists).
- `HoldSaleBanner` renders inline in the toolbar (`shrink-0`, `ml-auto`); its own component is unchanged (its "Hold" is not here — the cart footer owns `Hold`).
- Cart header gains `Clear` (`Button variant="ghost" size="sm"`, disabled when empty) → `clearCart()` after a `ConfirmDialog` (new keys `checkoutPanel.clearCart`, `clearCartTitle`, `clearCartBody`, `clearCartConfirm`). Accessible name "Clear cart".
- Cart footer: two-line summary (items, subtotal) above a dominant total; action row `grid grid-cols-[auto_1fr] gap-2`: `Hold` outline + `Process payment` brand `touchSize="xl"`. Button labels unchanged.
- `ProductCard`: reduce to `min-h-[6.75rem] p-3`, name `text-sm`, price `size="md"`, keep category band + dot + barcode. Keep the `Scale` icon for weight items.
- `CartItem`: tighten to `p-2.5 gap-2`, quantity control `size` unchanged; notes input stays but becomes an inline "Add note" ghost toggle? — **No** (e2e fills `cart-item-notes-*` directly, must remain always-rendered). Keep as is, just `h-8`.
- Payment step: container `max-w-5xl` (see §3.2).

## 5. Settings (`SettingsTabsPanel`)

Same component file (`src/widgets/SettingsTabsPanel/index.tsx`), same gates, same tab keys, same `defaultValue` logic (Language first). Layout switches to `VerticalTabs`:

| Group (eyebrow) | Tabs (unchanged labels) | Gate (unchanged) |
|---|---|---|
| Personal | Language | everyone |
| Store | General · Billing | General: `manage_settings`; Billing: `manage_products` (existing quirk, keep) |
| Receipts & hardware | Hardware · Email Receipts | `manage_settings` |
| Stock rules | Near Expiry | `manage_settings` |
| Security & data | Auto-Lock Timeout · Backup | `manage_settings` |

Products tab is **removed** (moves to Inventory, §7). Hide any group whose tabs are all gated out (cashier sees only "Personal › Language" — e2e asserts exactly one `role=tab`).

Each trigger: lucide icon (Languages, Store, Receipt, Printer, Mail, CalendarClock, Lock, DatabaseBackup), label, description (new `settings.json` keys `descriptions.<tabKey>`, both locales).

Content column: card `rounded-2xl border bg-card shadow-xs p-6` (existing), `min-h-[24rem]`. The tab bodies are untouched (all ids like `#paper-width`, `#near-expiry-threshold`, `#settings-language`, `#lock-timeout-threshold` stay).

`SettingsTabsPanel.test.tsx`: update the two assertions that expect a `Products` tab (manage_products role now sees Language + Billing; admin sees all except Products).

## 6. Reports (`src/pages/reports/index.tsx`)

Same tab values/labels. Layout → `VerticalTabs` with groups Sales / Inventory / Staff / Operations (existing `pages.reports.groups.*`), each trigger with icon + description (`pages.reports.descriptions.*`, new keys).

Content column header (sticky inside the content well): active report title (`h3`), description, and **one** `DateRangePicker` on the right for every tab except `session` (which keeps the caja selector inside `CajaReportPanel`). Remove the per-tab `DateRangePicker` duplicates. `ReportsPage.test` still finds ≥ 2 date inputs after switching to Product Sales; e2e `getByLabel('From:').nth(0)` still resolves.

Default tab stays `session`.

## 7. Inventory hub (`src/widgets/InventoryPagePanel/`)

Refactor the single 500-line file into a folder: `index.ts`, `ui/InventoryPagePanel.tsx` (tabs shell), `ui/StockTab.tsx`, `ui/CatalogTab.tsx`, `ui/MovementsTab.tsx`, `ui/NearExpiryTab.tsx`. `OpenUnitsTab.tsx` stays where it is (imported as today). Keep the widget's public name `InventoryPagePanel`.

Tabs (`TabsList` segmented, keep horizontal — the page header already carries the title/actions): **Stock** · **Catalog** (gated `can('manage_products')`, tab hidden otherwise) · **Open Units** · **Near Expiry** · **Movements**. Labels: existing keys for the first three; new `inventoryPagePanel.catalogTabLabel` = "Catalog"/"Catálogo", `movementsTabLabel` = "Movements"/"Movimientos".

### Stock tab
- Stat tiles become **filter tiles** (`Button variant="ghost"`, `aria-pressed`): All SKUs · Low stock · Out of stock · Near expiry (count from `useNearExpiryAlerts`), plus a non-interactive **Stock value** tile = Σ `quantityOnHand × costPrice` over rows with a cost price (`MoneyDisplay`), with a footnote "N products without cost". Clicking a tile filters `displayedRows`.
- Toolbar keeps `#inv-category-filter` (a11y spec tabs from it straight to the Product column header — so the category select must stay the **last** focusable control before the table) and adds, *before* it in DOM order, a `SearchInput` (name/SKU/barcode, client-side). Keep `Adjust` and `Export CSV` buttons and their names.
- Table unchanged (`inventoryRowColumns` from entities, `getRowClassName` highlights, `enableSorting`).
- Quick links row under the tiles: "Receive shipment → /suppliers", "Purchase orders → /purchase-orders", "Catalog" (switches tab) — `Button variant="link"`; hidden for roles without `adjust_inventory`.
- Batch adjustment dialog unchanged (`#batch-product`, labels, footer order).

### Catalog tab
Body of the former `ProductsSettingsTab` (title, description, nested `Tabs` Products/Categories/Modifiers/Modifier Groups, `ProtectedAction action="manage_products"`). Move the file to `src/widgets/InventoryPagePanel/ui/CatalogTab.tsx`; delete the settings copy. Keep i18n keys `productsSettingsTab.*` (rename not worth the churn) but change the title copy to "Catalog"/"Catálogo" and description to mention Inventory.

### Movements tab
The change-log table, promoted. Columns: When (`Intl.DateTimeFormat` medium+short) · Product (**name**, resolved client-side from `useInventory()` rows by `productId`; fallback to the short id) · Δ (signed, `text-success-strong`/`text-destructive`, `tabular-nums`) · Reason (`Badge variant="muted"`, humanised via existing `inventoryPagePanel.reasonOption*` keys) · Staff (**name** via `useStaffList()` by id; fallback short id). Filter chips by reason (client-side). `useInventoryLog()` is called only inside this tab (lazy).

### Near Expiry tab
Same data; rows sorted by `daysUntilExpiry` asc; add a `Badge` per row: ≤3 days `destructive`, ≤7 `warning`, else `muted`; keep the three columns' header text.

### E2E updates for the Products move
- `e2e/products/product-management.spec.ts` `navigateToProductsSettingsTab`: `goto('/inventory')` → click tab `Catalog` → (sub-tab logic unchanged). Update the docblock.
- `e2e/products/categories.spec.ts`: every `goto('/settings')` + `tab 'Products'` → `goto('/inventory')` + `tab 'Catalog'` (T1 heading assertion → `Inventory`). T8 → `goto('/inventory')`, expect `tab 'Catalog'` count 0 (cashier).
- `e2e/inventory/open-units.spec.ts` step 1: `goto('/inventory')` + `tab 'Catalog'`.
- `e2e/home/home-navigation.spec.ts` T11 comment lists tabs — update the comment only; assertion (`toHaveCount(1)`) still holds.
- `e2e/errors/error-scenarios-and-validation.spec.ts` FV7: it already goes to `/inventory` and looks for `tab /products/i` — change to click `Catalog` first (the nested `Products` sub-tab is default-selected).
- `e2e/settings/i18n-locale-switch.spec.ts` line ~187 comment mentions Products — comment only.

## 8. Peek window (`ProductPeekWindow`)

Keep: heading with product name (`h1`), exact-text nodes for `sku` and `barcode`, `/\d+ in stock/` text, "Sold by weight (kg)" / "Sold by piece", `QuantityControl` (increase/decrease aria-labels), `Add to Cart` button, `Close` button, `WeightEntryDialog` flow, risky-add confirm, all Tauri event wiring (untouched — only JSX/classes change).

New layout (window is 480×720):

```
┌ top strip (bg-ink text-ink-foreground? no — use bg-muted/50) ─────────────┐
│ eyebrow "Scanned product" · barcode (mono)                 category chip  │
├ hero ─────────────────────────────────────────────────────────────────────┤
│ 200px tall: image object-contain on bg-muted, or monogram tile: first two │
│ letters of the name, text-5xl font-semibold, on a soft wash of the        │
│ category colour (inline style: backgroundColor = color + '22' when hex,   │
│ else `color-mix(in oklab, <color> 14%, transparent)`) with a 4px band.    │
├ body (px-6 space-y-5) ────────────────────────────────────────────────────┤
│ h1 name (text-2xl, 2 lines)                                               │
│ price row: MoneyDisplay text-4xl + unit pill ("per kg" / "each")          │
│   if a promotion/expiry price applies: strike base price, show promo      │
│   price in text-success-strong + Badge "X% off" (reuses                   │
│   evaluateBestPromotion with usePromotions/useSettings/useNearExpiryAlerts│
│   — display only, same call as ProductGrid.resolvePromotionMatch)         │
│ stock: StatusBadge + "N in stock" + a 6px meter bar (qty / max(3×thr,1))  │
│ details grid 2-col: SKU · Barcode (mono chips)                            │
│ quantity: QuantityControl (piece items)                                   │
├ footer (sticky, border-t, bg-card, p-4) ──────────────────────────────────┤
│ line: "Total" · qty × price = MoneyDisplay lg                             │
│ [Close ghost]  [Add to Cart — brand, touchSize xl, flex-1]                │
└───────────────────────────────────────────────────────────────────────────┘
```

Not-found: `EmptyState` + the scanned code in a mono chip + hint "Scan again". Loading: skeleton matching hero/title/price blocks. New keys: `productPeekPanel.scannedEyebrow`, `perKg`, `each`, `total`, `promoPrice`, `scanAgainHint` — both locales.

The `productStockTier` helper and all handlers stay verbatim.

## 9. i18n additions (both `en-US` and `es-MX`)

- `settings.json`: `groups.{personal,store,receipts,stock,security}`, `descriptions.{language,general,billing,hardware,email,nearExpiry,lockTimeout,backup}`.
- `pages.json`: `reports.descriptions.<tab>` (11), `payments.descriptions.{payments,refunds,bankTransfers}`, `inventory.quickLinks.{receive,purchaseOrders,catalog}`.
- `wPanels.json`: `checkoutPanel.{clearCart,clearCartTitle,clearCartBody,clearCartConfirm,itemsLine,subtotal}`, `paymentPane.{today,refundsToday,filterAll,filterCash,filterCard,filterTransfer,filterRefunds,dayToday,dayYesterday,refundBadge}`, `paymentForm.{quickTenderExact,quickTender}`, `productPeekPanel.*` (see §8).
- `wAdmin.json`: `inventoryPagePanel.{catalogTabLabel,movementsTabLabel,searchPlaceholder,filterAll,filterLow,filterOut,filterNearExpiry,stockValue,stockValueHint,columnProduct,columnStaff,reasonFilterAll}`, `promotionsListPanel.{statActive,statScheduled,statInactive,statNeedsReview,hint}`, `promotionDialog.{subtitleCreate,subtitleEdit,sectionBasics,sectionBasicsHint,sectionScope,sectionScopeHint,sectionWhen,sectionWhenHint,summaryTitle,cancel}`, `productsSettingsTab.title/description` copy change.

es-MX values are real Spanish (this branch is a redesign, not the byte-identical migration rule).

## 10. Testing

- **Unit (Vitest):** update `SettingsTabsPanel.test.tsx`; keep `PaymentPane.test.tsx`, `PaymentForm.test.tsx`, `CheckoutPanel.test.tsx`, `ReportsPage.test.tsx`, `PaymentsPage.test.tsx`, `HomeDashboard.test.tsx`, `usePromotionWizardState.test.ts` green; add `PromotionDialog.test.tsx` (renders, submit with empty name shows the name error, valid submit calls save/closes — mock the entity mutations the way the wizard-state test does); add `vertical-tabs.stories.tsx`.
- **E2E (Playwright, headless, targeted):** promotions (3 rewritten specs + `promotion-deleted-mid-cart`), `products/*`, `inventory/open-units`, `inventory/inventory-management`, `inventory/near-expiry-alerts`, `a11y/focus-tab-order`, `payments/payment-pane`, `payments/split-payment`, `payments/apply-promotion-and-custom-discount`, `checkout/happy-path`, `checkout/peek-window`, `checkout/barcode-scan-search`, `reports/report-tabs`, `reports/product-sales`, `settings/*`, `receipts/settings`, `receipts/printer-selection`, `home/home-navigation`, `errors/error-scenarios-and-validation`. Full `npm run test:e2e` once at the end as the integration gate.
- `npm run typecheck`, `npm run lint`, `npm run test` must pass before every commit.

## 11. Execution model

Fable writes the plan; Sonnet 5 executors (high effort) implement task by task with atomic commits; Fable reviews each task against this spec. Conventional commits `feat(ui): …` / `test(e2e): …`, `Co-Authored-By` trailer.
