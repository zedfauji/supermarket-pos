/**
 * MASTER DOMAIN CONTRACTS
 *
 * This is the SINGLE SOURCE OF TRUTH for all business entity types.
 * Every entity store, feature hook, and UI component imports types from HERE.
 * NEVER define entity types anywhere else.
 */

import { z } from 'zod';

// ============================================================================
// SHARED PRIMITIVES
// ============================================================================

export const MoneySchema = z.number().nonnegative().multipleOf(0.01);
export const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
export const TimestampSchema = z.coerce.date();
export const PinSchema = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const TimeStringSchema = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/);
export const UrlSchema = z
  .string()
  .regex(/^https?:\/\/.+/, 'Invalid URL')
  .refine(val => {
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid URL format');

// ============================================================================
// ENUMS
// ============================================================================

export const UserRoleSchema = z.enum(['cashier', 'manager', 'admin', 'kitchen']);
export const UserRole = {
  CASHIER: 'cashier',
  MANAGER: 'manager',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
} as const;

export type UserRole = z.infer<typeof UserRoleSchema>;

// Phase 21: per-staff UI locale preference (D-01/D-02). Two-layer validation
// with the DB CHECK constraint on profiles.locale (T-21-02).
export const LocaleSchema = z.enum(['es-MX', 'en-US']);
export type Locale = z.infer<typeof LocaleSchema>;

// Phase 13: role_permissions table — DB-backed RBAC matrix.
// One row per (role, action) pair that grants the permission.
export const RolePermissionSchema = z.object({
  id: UuidSchema,
  role: UserRoleSchema,
  action: z.string(),
  createdAt: TimestampSchema,
});

export const RolePermissionCreateSchema = RolePermissionSchema.omit({
  id: true,
  createdAt: true,
});

export type RolePermission = z.infer<typeof RolePermissionSchema>;
export type RolePermissionCreate = z.infer<typeof RolePermissionCreateSchema>;

export const TabStatusSchema = z.enum(['open', 'closed', 'paid', 'voided', 'split']);
export const TabStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
  PAID: 'paid',
  VOIDED: 'voided',
  SPLIT: 'split',
} as const;

export const OrderStatusSchema = z.enum(['pending', 'served', 'voided']);
export const OrderStatus = {
  PENDING: 'pending',
  SERVED: 'served',
  VOIDED: 'voided',
} as const;

export const PaymentMethodSchema = z.enum(['cash', 'card', 'rappi']);
export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  RAPPI: 'rappi',
} as const;

export const InventoryAdjustReasonSchema = z.enum([
  'sale',
  'manual_adjustment',
  'waste',
  'delivery',
  'correction',
  'physical_count',
  'expired',
]);
export const InventoryAdjustReason = {
  SALE: 'sale',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
  WASTE: 'waste',
  DELIVERY: 'delivery',
  CORRECTION: 'correction',
  PHYSICAL_COUNT: 'physical_count',
  EXPIRED: 'expired',
} as const;

/** Extended reason enum for the stock_movements ledger table (superset of InventoryAdjustReason) */
export const StockMovementReasonSchema = z.enum([
  'sale',
  'manual_adjustment',
  'waste',
  'delivery',
  'correction',
  'physical_count',
  'prep_production',
  'prep_consumption',
  'combo_component',
  'refund',
  'void',
  'expired',
]);
export const StockMovementReason = {
  SALE: 'sale',
  MANUAL_ADJUSTMENT: 'manual_adjustment',
  WASTE: 'waste',
  DELIVERY: 'delivery',
  CORRECTION: 'correction',
  PHYSICAL_COUNT: 'physical_count',
  PREP_PRODUCTION: 'prep_production',
  PREP_CONSUMPTION: 'prep_consumption',
  COMBO_COMPONENT: 'combo_component',
  REFUND: 'refund',
  VOID: 'void',
  EXPIRED: 'expired',
} as const;
export type StockMovementReason = z.infer<typeof StockMovementReasonSchema>;

export const DiscountScopeSchema = z.enum(['all', 'pool_only', 'consumptions_only']);
export const DiscountScope = {
  ALL: 'all',
  POOL_ONLY: 'pool_only',
  CONSUMPTIONS_ONLY: 'consumptions_only',
} as const;
export type DiscountScope = z.infer<typeof DiscountScopeSchema>;

export const DiscountTypeSchema = z.enum(['percent', 'fixed']);
export const DiscountType = {
  PERCENT: 'percent',
  FIXED: 'fixed',
} as const;
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const CategoryRoutingSchema = z.enum(['KITCHEN', 'BAR', 'NONE']);
export type CategoryRouting = z.infer<typeof CategoryRoutingSchema>;

// ============================================================================
// CATEGORY
// ============================================================================

export const CategorySchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(50),
  color: HexColorSchema,
  sortOrder: z.number().int().nonnegative(),
  /**
   * DEPRECATED — superseded by the promotions engine (Phase 20, D-01).
   * Always null now; kept nullable (not a JSDoc `@deprecated` tag — that
   * trips `@typescript-eslint/no-deprecated` across the remaining client
   * display consumers, which Plan 20-11 removes) to bound blast radius
   * pending that housekeeping removal.
   */
  happyHourStart: TimeStringSchema.nullable(),
  /**
   * DEPRECATED — superseded by the promotions engine (Phase 20, D-01).
   * Always null now; see {@link happyHourStart} for the full rationale.
   */
  happyHourEnd: TimeStringSchema.nullable(),
  routing: CategoryRoutingSchema.default('NONE'),
  /** Parent category id for hierarchical nesting (max depth 3). Null = root category. */
  parentId: UuidSchema.nullable().optional(),
  createdAt: TimestampSchema,
});

export const CategoryCreateSchema = CategorySchema.omit({
  id: true,
  createdAt: true,
});

export const CategoryUpdateSchema = CategorySchema.partial().required({ id: true });

export type Category = z.infer<typeof CategorySchema>;
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof CategoryUpdateSchema>;

// ============================================================================
// MODIFIER
// ============================================================================

export const ModifierSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(50),
  priceDelta: z.number().multipleOf(0.01),
  sortOrder: z.number().int().nonnegative(),
});

export const ModifierCreateSchema = ModifierSchema.omit({ id: true });

export const ModifierUpdateSchema = ModifierSchema.partial().required({ id: true });

export type Modifier = z.infer<typeof ModifierSchema>;
export type ModifierCreate = z.infer<typeof ModifierCreateSchema>;
export type ModifierUpdate = z.infer<typeof ModifierUpdateSchema>;

// ============================================================================
// PRODUCT
// ============================================================================

export const ProductSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  categoryId: UuidSchema,
  basePrice: MoneySchema,
  /**
   * DEPRECATED — superseded by the promotions engine (Phase 20, D-01).
   * Always null now; kept nullable (not a JSDoc `@deprecated` tag — that
   * trips `@typescript-eslint/no-deprecated` across the remaining client
   * display consumers, which Plan 20-11 removes) to bound blast radius
   * pending that housekeeping removal.
   */
  happyHourPrice: MoneySchema.nullable(),
  sku: z.string().nullable(),
  isActive: z.boolean(),
  soldByWeight: z.boolean().optional().default(false),
  imageUrl: UrlSchema.nullable(),
  stock_threshold: z.number().nullable(),
  barcode: z.string().nullable().optional(),
  /** Phase 27 D-02: set on the BOX (parent) product — pieces per package. Null = not open-unit-configured. */
  unitsPerPackage: z.number().int().positive().nullable(),
  /** Phase 27 D-01: set on the LOOSE (child) product — links it to its parent BOX product. */
  parentProductId: UuidSchema.nullable(),
  /** True when this product can be used as a component in a combo product */
  comboEligible: z.boolean().optional().default(true),
  /** True when this product IS a combo (composed of other products) */
  isCombo: z.boolean().optional().default(false),
  /** Null means price = sum of child list prices; absent = null (optional for backward compat) */
  comboPriceOverride: MoneySchema.nullable().optional(),
  category: CategorySchema.optional(),
  /** Phase 12: joined from `inventory.quantity_on_hand`. Undefined = no inventory row. */
  quantityOnHand: z.number().int().nonnegative().optional(),
  /** Phase 12: joined from `inventory.low_stock_threshold`. Undefined = no inventory row. */
  lowStockThreshold: z.number().int().nonnegative().optional(),
  modifiers: z.array(ModifierSchema).default([]),
});

export const ProductCreateSchema = ProductSchema.omit({
  id: true,
  category: true,
  modifiers: true,
});

export const ProductUpdateSchema = ProductSchema.omit({
  category: true,
  modifiers: true,
})
  .partial()
  .required({ id: true });

export type Product = z.infer<typeof ProductSchema>;
export type ProductCreate = z.infer<typeof ProductCreateSchema>;
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

// ============================================================================
// STAFF / PROFILE
// ============================================================================

export const StaffSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  email: z.email(),
  role: UserRoleSchema,
  pin: PinSchema,
  isActive: z.boolean(),
  mustChangePin: z.boolean(),
  /** D-02: defaults to es-MX for new/unset profiles. Drives i18n.changeLanguage() on login/rehydrate. */
  locale: LocaleSchema.default('es-MX'),
});

export const StaffCreateSchema = StaffSchema.omit({ id: true });

export const StaffUpdateSchema = StaffSchema.partial().required({ id: true });

export type Staff = z.infer<typeof StaffSchema>;
export type StaffCreate = z.infer<typeof StaffCreateSchema>;
export type StaffUpdate = z.infer<typeof StaffUpdateSchema>;

// ============================================================================
// SHIFT
// ============================================================================

export const ShiftSchema = z.object({
  id: UuidSchema,
  staffId: UuidSchema,
  clockIn: TimestampSchema,
  clockOut: TimestampSchema.nullable(),
  openingCash: MoneySchema,
  closingCash: MoneySchema.nullable(),
  staff: StaffSchema.optional(),
});

export const ShiftCreateSchema = ShiftSchema.omit({
  id: true,
  staff: true,
});

export const ShiftUpdateSchema = ShiftSchema.omit({ staff: true }).partial().required({ id: true });

export type Shift = z.infer<typeof ShiftSchema>;
export type ShiftCreate = z.infer<typeof ShiftCreateSchema>;
export type ShiftUpdate = z.infer<typeof ShiftUpdateSchema>;

// ============================================================================
// ORDER ITEM
// ============================================================================

export const OrderItemSchema = z.object({
  id: UuidSchema,
  orderId: UuidSchema,
  productId: UuidSchema,
  quantity: z.number().int().min(1).max(99),
  weightGrams: z.number().int().positive().max(50000).nullable().optional(),
  unitPrice: MoneySchema,
  modifierIds: z.array(UuidSchema).default([]),
  modifierPriceDelta: MoneySchema.default(0),
  costPriceSnapshot: MoneySchema.nullable().optional(),
  notes: z.string().max(200).nullable(),
  product: ProductSchema.optional(),
  modifiers: z.array(ModifierSchema).default([]),
  lineTotal: MoneySchema.optional(),
});

export const OrderItemCreateSchema = OrderItemSchema.omit({
  id: true,
  product: true,
  modifiers: true,
  lineTotal: true,
});

export const OrderItemUpdateSchema = OrderItemSchema.omit({
  product: true,
  modifiers: true,
  lineTotal: true,
})
  .partial()
  .required({ id: true });

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderItemCreate = z.infer<typeof OrderItemCreateSchema>;
export type OrderItemUpdate = z.infer<typeof OrderItemUpdateSchema>;

// ============================================================================
// ORDER
// ============================================================================

export const OrderSchema = z.object({
  id: UuidSchema,
  tabId: UuidSchema,
  staffId: UuidSchema,
  createdAt: TimestampSchema,
  status: OrderStatusSchema,
  notes: z.string().max(500).nullable(),
  items: z.array(OrderItemSchema).default([]),
  orderTotal: MoneySchema.optional(),
});

export const OrderCreateSchema = OrderSchema.omit({
  id: true,
  createdAt: true,
  items: true,
  orderTotal: true,
});

export const OrderUpdateSchema = OrderSchema.omit({
  items: true,
  orderTotal: true,
})
  .partial()
  .required({ id: true });

export type Order = z.infer<typeof OrderSchema>;
export type OrderCreate = z.infer<typeof OrderCreateSchema>;
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

// ============================================================================
// TAB
// ============================================================================

export const TabSchema = z.object({
  id: UuidSchema,
  customerName: z.string().min(1).max(100),
  staffId: UuidSchema,
  shiftId: UuidSchema,
  openedAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
  status: TabStatusSchema,
  notes: z.string().max(500).nullable(),
  orders: z.array(OrderSchema).default([]),
  items: z.array(OrderItemSchema).default([]),
  subtotal: MoneySchema.optional(),
  staff: StaffSchema.optional(),
  /** External Rappi order id when tab originated from delivery */
  rappiOrderId: z.string().min(1).max(128).nullable().optional(),
  /** Caja session under which this tab was opened */
  cajaSessionId: UuidSchema.nullable().optional(),
  /** Phase 15: optimistic-concurrency version. Server bumps on every UPDATE. */
  version: z.number().int().nonnegative().optional(),
  /** Phase 23: number of times this tab has been reopened (capped at 2). */
  reopenCount: z.number().int().nonnegative().optional(),
  /** Phase 23: timestamp of the most recent reopen (drives the 24h reopen window). */
  lastReopenedAt: TimestampSchema.nullable().optional(),
});

export const TabCreateSchema = TabSchema.omit({
  id: true,
  openedAt: true,
  closedAt: true,
  orders: true,
  subtotal: true,
  staff: true,
});

export const TabUpdateSchema = TabSchema.omit({
  orders: true,
  subtotal: true,
  staff: true,
})
  .partial()
  .required({ id: true });

export type Tab = z.infer<typeof TabSchema>;
export type TabCreate = z.infer<typeof TabCreateSchema>;
export type TabUpdate = z.infer<typeof TabUpdateSchema>;

// ============================================================================
// PAYMENT
// ============================================================================

export const PaymentSchema = z.object({
  id: UuidSchema,
  tabId: UuidSchema,
  // Refund rows (isRefund: true) store a negative amount — the app's actual
  // ledger convention (see process_refund RPC) — so this can't be MoneySchema
  // (nonnegative). Keep the multipleOf(0.01) precision constraint without the
  // sign restriction.
  amount: z.number().multipleOf(0.01),
  tipAmount: MoneySchema,
  method: PaymentMethodSchema,
  squarePaymentId: z.string().nullable(),
  squareReceiptUrl: UrlSchema.nullable(),
  tenderedAmount: MoneySchema.nullable().optional(),
  referenceNumber: z.string().max(64).nullable().optional(),
  idempotencyKey: z.string().min(1).max(255).nullable().optional(),
  processedAt: TimestampSchema,
  processedBy: UuidSchema,
  discountScope: DiscountScopeSchema.optional(),
  discountType: DiscountTypeSchema.optional(),
  discountValue: z.number().nonnegative().optional(),
  discountAmount: MoneySchema.optional(),
  /** True when this payment record represents a refund (negative flow) */
  isRefund: z.boolean().default(false),
  /** FK to the refund record when isRefund = true */
  refundId: UuidSchema.nullable().optional(),
  /** Groups sibling payment rows created by a single split-payment submission */
  paymentGroupId: UuidSchema.nullable().optional(),
  /** Position (0-3) of this payment within its split-payment group */
  splitIndex: z.number().int().min(0).max(3).nullable().optional(),
  /** Phase 23: 'reopened_void' when the parent tab was reopened and this payment reversed */
  status: z.enum(['completed', 'reopened_void']).default('completed'),
});

export const PaymentCreateSchema = PaymentSchema.omit({
  id: true,
  processedAt: true,
});

export const PaymentUpdateSchema = PaymentSchema.partial().required({ id: true });

export type Payment = z.infer<typeof PaymentSchema>;
export type PaymentCreate = z.infer<typeof PaymentCreateSchema>;
export type PaymentUpdate = z.infer<typeof PaymentUpdateSchema>;

/**
 * One row of a split-payment submission — any payment method per row, each
 * with its own tip and method-specific fields (D-02/D-03).
 */
export const SplitPaymentLegSchema = z.object({
  method: PaymentMethodSchema,
  amount: MoneySchema,
  tipAmount: MoneySchema,
  tenderedAmount: MoneySchema.nullable().optional(),
  referenceNumber: z.string().max(64).nullable().optional(),
  rappiOrderId: z.string().max(128).nullable().optional(),
});

// ============================================================================
// INVENTORY
// ============================================================================

export const InventorySchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  quantityOnHand: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  unit: z.string().min(1).max(20),
  costPrice: MoneySchema.nullable().optional(),
  expiryDate: TimestampSchema.nullable().optional(),
  product: ProductSchema.optional(),
});

export const InventoryCreateSchema = InventorySchema.omit({
  id: true,
  product: true,
});

export const InventoryUpdateSchema = InventorySchema.omit({ product: true })
  .partial()
  .required({ id: true });

export type Inventory = z.infer<typeof InventorySchema>;
export type InventoryCreate = z.infer<typeof InventoryCreateSchema>;
export type InventoryUpdate = z.infer<typeof InventoryUpdateSchema>;

// ============================================================================
// SUPPLIERS
// ============================================================================

export const SupplierSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(150),
  contactName: z.string().max(120).nullable(),
  phone: z.string().max(30).nullable(),
  email: z.string().max(255).nullable(),
  address: z.string().max(300).nullable(),
  notes: z.string().max(500).nullable(),
  createdAt: TimestampSchema,
});
export const SupplierCreateSchema = SupplierSchema.omit({ id: true, createdAt: true });
export const SupplierUpdateSchema = SupplierCreateSchema.partial().extend({ id: UuidSchema });
export const SupplierProductSchema = z.object({
  id: UuidSchema,
  supplierId: UuidSchema,
  productId: UuidSchema,
  createdAt: TimestampSchema,
});
export type Supplier = z.infer<typeof SupplierSchema>;
export type SupplierCreate = z.infer<typeof SupplierCreateSchema>;
export type SupplierUpdate = z.infer<typeof SupplierUpdateSchema>;
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

export const PurchaseOrderStatusSchema = z.enum(['draft', 'received']);

export const PurchaseOrderItemSchema = z.object({
  id: UuidSchema,
  purchaseOrderId: UuidSchema,
  productId: UuidSchema,
  quantity: z.number().int().positive(),
  costPrice: MoneySchema,
  product: ProductSchema.optional(),
});
export const PurchaseOrderItemCreateSchema = PurchaseOrderItemSchema.omit({
  id: true,
  purchaseOrderId: true,
  product: true,
});
export const PurchaseOrderSchema = z.object({
  id: UuidSchema,
  supplierId: UuidSchema,
  status: PurchaseOrderStatusSchema,
  createdBy: UuidSchema,
  receivedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  supplier: SupplierSchema.optional(),
  items: z.array(PurchaseOrderItemSchema).optional(),
});
export const PurchaseOrderCreateSchema = z.object({
  supplierId: UuidSchema,
  items: z.array(PurchaseOrderItemCreateSchema).min(1),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;
export type PurchaseOrderItemCreate = z.infer<typeof PurchaseOrderItemCreateSchema>;
export type PurchaseOrderCreate = z.infer<typeof PurchaseOrderCreateSchema>;
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

// ============================================================================
// INVENTORY LOG
// ============================================================================

export const InventoryLogSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  quantityDelta: z.number().int(),
  reason: InventoryAdjustReasonSchema,
  staffId: UuidSchema,
  createdAt: TimestampSchema,
});

export const InventoryLogCreateSchema = InventoryLogSchema.omit({
  id: true,
  createdAt: true,
});

export const InventoryLogUpdateSchema = InventoryLogSchema.partial().required({ id: true });

export type InventoryLog = z.infer<typeof InventoryLogSchema>;
export type InventoryLogCreate = z.infer<typeof InventoryLogCreateSchema>;
export type InventoryLogUpdate = z.infer<typeof InventoryLogUpdateSchema>;

// ============================================================================
// OPEN UNITS (Phase 27 — cigarette-box pattern)
// ============================================================================

export const OpenUnitStatusSchema = z.enum(['active', 'exhausted', 'void']);
export type OpenUnitStatus = z.infer<typeof OpenUnitStatusSchema>;

export const OpenUnitSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  remainingCount: z.number().int().nonnegative(),
  status: OpenUnitStatusSchema,
  openedBy: UuidSchema.nullable(),
  openedAt: TimestampSchema,
  closedBy: UuidSchema.nullable(),
  closedAt: TimestampSchema.nullable(),
  closedReason: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  product: ProductSchema.optional(),
});

export type OpenUnit = z.infer<typeof OpenUnitSchema>;

export const OpenUnitCorrectionSchema = z.object({
  openUnitId: UuidSchema,
  remainingCount: z.number().int().nonnegative(),
  reason: z.string().trim().min(1),
});

export type OpenUnitCorrection = z.infer<typeof OpenUnitCorrectionSchema>;

// ============================================================================
// STOCK MOVEMENT (ledger table replacing inventory_log)
// ============================================================================

export const StockMovementSchema = z.object({
  id: UuidSchema,
  /** FK to products. null for ingredient-only movements (Phase 3+). */
  productId: UuidSchema.nullable(),
  quantityDelta: z.number(),
  reason: StockMovementReasonSchema,
  staffId: UuidSchema,
  /** Polymorphic reference type (e.g. 'order_item', 'manual_adjustment') */
  refType: z.string().nullable().optional(),
  /** Polymorphic reference id */
  refId: UuidSchema.nullable().optional(),
  /** FK to ingredient record (Phase 3 prep module; nullable until then) */
  ingredientId: UuidSchema.nullable().optional(),
  createdAt: TimestampSchema,
});

export const StockMovementCreateSchema = StockMovementSchema.omit({
  id: true,
  createdAt: true,
});

export type StockMovement = z.infer<typeof StockMovementSchema>;
export type StockMovementCreate = z.infer<typeof StockMovementCreateSchema>;

// ============================================================================
// MODIFIER GROUP
// ============================================================================

export const ModifierGroupSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().min(1),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
});

export const ModifierGroupCreateSchema = ModifierGroupSchema.omit({
  id: true,
  createdAt: true,
});

export const ModifierGroupUpdateSchema = ModifierGroupSchema.partial().required({ id: true });

export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;
export type ModifierGroupCreate = z.infer<typeof ModifierGroupCreateSchema>;
export type ModifierGroupUpdate = z.infer<typeof ModifierGroupUpdateSchema>;

// ============================================================================
// MODIFIER GROUP ITEM (links modifier_groups ↔ modifiers)
// ============================================================================

export const ModifierGroupItemSchema = z.object({
  groupId: UuidSchema,
  modifierId: UuidSchema,
  sortOrder: z.number().int().nonnegative(),
});

export const ModifierGroupItemCreateSchema = ModifierGroupItemSchema;

export type ModifierGroupItem = z.infer<typeof ModifierGroupItemSchema>;
export type ModifierGroupItemCreate = z.infer<typeof ModifierGroupItemCreateSchema>;

// ============================================================================
// PRODUCT MODIFIER GROUP (links products ↔ modifier_groups)
// ============================================================================

export const ProductModifierGroupSchema = z.object({
  productId: UuidSchema,
  groupId: UuidSchema,
  sortOrder: z.number().int().nonnegative().nullable(),
});

export const ProductModifierGroupCreateSchema = ProductModifierGroupSchema;

export type ProductModifierGroup = z.infer<typeof ProductModifierGroupSchema>;
export type ProductModifierGroupCreate = z.infer<typeof ProductModifierGroupCreateSchema>;

// ============================================================================
// INVENTORY ALERT
// ============================================================================

/**
 * Represents a product that is at or below its stock threshold.
 * Derived by joining inventory.quantity_on_hand with products.stock_threshold.
 */
export const InventoryAlertSchema = z.object({
  productId: UuidSchema,
  productName: z.string().min(1),
  currentStock: z.number().int().nonnegative(),
  threshold: z.number().int().nonnegative(),
});

export type InventoryAlert = z.infer<typeof InventoryAlertSchema>;

export const NearExpiryAlertSchema = z.object({
  productId: UuidSchema,
  productName: z.string().min(1),
  expiryDate: z.string(),
  daysUntilExpiry: z.number().int(),
});

export type NearExpiryAlert = z.infer<typeof NearExpiryAlertSchema>;

// ============================================================================
// SETTINGS
// ============================================================================

export const SettingsKeySchema = z.enum([
  'general',
  'billing',
  'email_receipts',
  'pool_tables',
  'receipt',
  'payment_labels',
  'tip_distribution',
  'near_expiry',
]);
export type SettingsKey = z.infer<typeof SettingsKeySchema>;

export const GeneralSettingsSchema = z.object({
  barName: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  timezone: z.string().min(1).max(100),
  currency: z.string().length(3).default('MXN'),
  receiptFooterText: z.string().max(240).default(''),
});

export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

export const BillingPaymentMethodsSchema = z.object({
  cash: z.boolean().default(true),
  bbvaCard: z.boolean().default(true),
  rappi: z.boolean().default(true),
});

export const PaymentMethodLabelsSchema = z.object({
  cash: z.string().min(1).max(40).default('Efectivo'),
  card: z.string().min(1).max(40).default('Terminal BBVA'),
  rappi: z.string().min(1).max(40).default('Rappi'),
});

export type PaymentMethodLabels = z.infer<typeof PaymentMethodLabelsSchema>;

export const BillingSettingsSchema = z.object({
  taxRatePercent: z.number().min(0).max(100).default(16),
  defaultTipPercentages: z
    .array(z.number().int().min(0).max(100))
    .min(1)
    .max(4)
    .default([10, 15, 18, 20]),
  paymentMethods: BillingPaymentMethodsSchema.default({
    cash: true,
    bbvaCard: true,
    rappi: true,
  }),
  firstHourMode: z.enum(['full', 'prorated']).default('prorated'),
});

export type BillingSettings = z.infer<typeof BillingSettingsSchema>;

export const EmailReceiptSettingsSchema = z.object({
  fromEmail: z.email().trim().default(''),
});

export type EmailReceiptSettings = z.infer<typeof EmailReceiptSettingsSchema>;

export const TipDistributionSettingsSchema = z.object({
  floorPct: z.number().min(0).max(100),
  barPct: z.number().min(0).max(100),
  kitchenPct: z.number().min(0).max(100),
});

export type TipDistributionSettings = z.infer<typeof TipDistributionSettingsSchema>;

export const NearExpirySettingsSchema = z.object({
  thresholdDays: z.number().int().min(1).max(365).default(14),
});

export type NearExpirySettings = z.infer<typeof NearExpirySettingsSchema>;

// ============================================================================
// RECEIPT SETTINGS
// ============================================================================

export const ReceiptPaperWidthSchema = z.union([z.literal(32), z.literal(40), z.literal(48)]);

export const ReceiptSettingsSchema = z.object({
  paperWidthChars: ReceiptPaperWidthSchema.default(32),
  showCashierName: z.boolean().default(true),
  showCustomerName: z.boolean().default(true),
  showReceiptNumber: z.boolean().default(true),
  headerLine2: z.string().max(48).default(''),
  footerText: z.string().max(480).default(''),
  boldTotals: z.boolean().default(true),
  printOnStart: z.boolean().default(false),
  autoCut: z.boolean().default(false),
  kdsEnabled: z.boolean().default(false),
  logoDataUrl: z.string().nullable().default(null),
});

export type ReceiptSettings = z.infer<typeof ReceiptSettingsSchema>;

// ============================================================================
// CAJA SESSION
// ============================================================================

export const CajaStatusSchema = z.enum(['open', 'closed']);
export type CajaStatus = z.infer<typeof CajaStatusSchema>;

export const CajaSessionSchema = z.object({
  id: UuidSchema,
  openedAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
  openedBy: UuidSchema,
  closedBy: UuidSchema.nullable(),
  openingCash: MoneySchema,
  closingCash: MoneySchema.nullable(),
  notes: z.string().max(500).nullable(),
  status: CajaStatusSchema,
  openedByName: z.string().optional(),
  closedByName: z.string().nullable().optional(),
  /** Phase 15: optimistic-concurrency version. Server bumps on every UPDATE. */
  version: z.number().int().nonnegative().optional(),
});

export const CajaSessionCreateSchema = CajaSessionSchema.omit({
  id: true,
  closedAt: true,
  closedBy: true,
  closingCash: true,
  status: true,
  openedByName: true,
  closedByName: true,
});

export type CajaSession = z.infer<typeof CajaSessionSchema>;
export type CajaSessionCreate = z.infer<typeof CajaSessionCreateSchema>;

// ============================================================================
// CAJA ENTRY (expense / income against an open caja session)
// ============================================================================

export const CajaEntryTypeSchema = z.enum(['expense', 'income']);
export type CajaEntryType = z.infer<typeof CajaEntryTypeSchema>;

export const CajaEntrySchema = z.object({
  id: UuidSchema,
  cajaSessionId: UuidSchema,
  type: CajaEntryTypeSchema,
  amount: MoneySchema,
  concept: z.string().min(1).max(200),
  createdAt: TimestampSchema,
  staffId: UuidSchema,
  staffName: z.string().optional(),
});
export type CajaEntry = z.infer<typeof CajaEntrySchema>;

// ============================================================================
// TIP DISTRIBUTION ENTRY (immutable per-caja-close 3-way split snapshot)
// ============================================================================

export const TipDistributionEntrySchema = z.object({
  id: UuidSchema,
  cajaSessionId: UuidSchema,
  floorPct: z.number().min(0).max(100),
  barPct: z.number().min(0).max(100),
  kitchenPct: z.number().min(0).max(100),
  totalTips: MoneySchema,
  floorAmount: MoneySchema,
  barAmount: MoneySchema,
  kitchenAmount: MoneySchema,
  createdAt: TimestampSchema,
});
export type TipDistributionEntry = z.infer<typeof TipDistributionEntrySchema>;

export const CajaEntryCreateSchema = z.object({
  cajaSessionId: UuidSchema,
  type: CajaEntryTypeSchema,
  amount: MoneySchema,
  concept: z.string().min(1).max(200),
  staffId: UuidSchema,
});
export type CajaEntryCreate = z.infer<typeof CajaEntryCreateSchema>;

// ============================================================================
// CAJA REPORT (returned by get_caja_report RPC)
// ============================================================================

export const CajaReportSummarySchema = z.object({
  totalRevenue: MoneySchema,
  cashSales: MoneySchema,
  cardSales: MoneySchema,
  rappiSales: MoneySchema,
  orderCount: z.number().int().nonnegative(),
  tabCount: z.number().int().nonnegative(),
  totalExpenses: MoneySchema,
  totalIncome: MoneySchema,
  // netBalance can be negative when expenses exceed revenue, so use a signed money schema
  netBalance: z.number().multipleOf(0.01),
});

export const CashReconciliationSchema = z.object({
  openingCash: MoneySchema,
  cashSales: MoneySchema,
  expectedCash: MoneySchema,
  closingCash: MoneySchema.nullable(),
  variance: z.number().nullable(),
});

export const CajaReportTopProductSchema = z.object({
  productName: z.string(),
  quantity: z.number().int(),
  revenue: MoneySchema,
  categoryId: UuidSchema.nullable().optional(),
  categoryName: z.string().nullable().optional(),
});

export const CajaReportStaffSchema = z.object({
  staffId: UuidSchema,
  staffName: z.string(),
  orderCount: z.number().int(),
  salesTotal: MoneySchema,
});

export const CajaReportSchema = z.object({
  cajaSession: CajaSessionSchema,
  summary: CajaReportSummarySchema,
  cashReconciliation: CashReconciliationSchema,
  topProducts: z.array(CajaReportTopProductSchema),
  staffSummary: z.array(CajaReportStaffSchema),
  cajaEntries: z.array(CajaEntrySchema),
});

export type CajaReport = z.infer<typeof CajaReportSchema>;
export type CajaReportSummary = z.infer<typeof CajaReportSummarySchema>;
export type CashReconciliation = z.infer<typeof CashReconciliationSchema>;
export type CajaReportTopProduct = z.infer<typeof CajaReportTopProductSchema>;
export type CajaReportStaff = z.infer<typeof CajaReportStaffSchema>;

// ============================================================================
// STAFF METRICS (for Staff Reports)
// ============================================================================

export const StaffMetricSchema = z.object({
  staffId: UuidSchema,
  staffName: z.string().min(1),
  revenue: MoneySchema,
  transactionCount: z.number().int().nonnegative(),
  avgCheckSize: MoneySchema,
  voidCount: z.number().int().nonnegative(),
});

export type StaffMetric = z.infer<typeof StaffMetricSchema>;

export const SettingsBackupSummarySchema = z.object({
  id: UuidSchema,
  label: z.string().min(1).max(120),
  createdAt: TimestampSchema,
  createdBy: UuidSchema.nullable(),
  restoredAt: TimestampSchema.nullable(),
  restoredBy: UuidSchema.nullable(),
});

export type SettingsBackupSummary = z.infer<typeof SettingsBackupSummarySchema>;

// ============================================================================
// REPORT ROW TYPES (used by report queries and exporters)
// ============================================================================

export type ProductSalesRow = {
  productId: string;
  productName: string;
  categoryName: string;
  units: number;
  revenue: number;
  costTotal: number | null;
  margin: number | null;
  marginPct: number | null;
  pctTotal: number;
};

// D-04: extended with day-of-week + a per-row "busiest hour" indicator so the
// Hourly tab reads as genuine peak-hours analysis (RPC-backed, Plan 24-02).
export const HourlyRowSchema = z.object({
  hour: z.number(),
  orderCount: z.number(),
  revenue: z.number(),
  dayOfWeek: z.number(),
  isBusiest: z.boolean(),
});

export type HourlyRow = z.infer<typeof HourlyRowSchema>;

export const VoidRefundRowSchema = z.object({
  orderId: UuidSchema,
  voidedAt: TimestampSchema,
  staffName: z.string(),
  amount: MoneySchema,
  reason: z.string(),
});

export type VoidRefundRow = z.infer<typeof VoidRefundRowSchema>;

// D-05 variant A: pre-send order-item removal (remove_tab_item, Plan 24-04).
export const DeletionsPreRowSchema = z.object({
  orderId: UuidSchema,
  itemName: z.string(),
  removedAt: TimestampSchema,
  staffName: z.string(),
  reason: z.string(),
});

export type DeletionsPreRow = z.infer<typeof DeletionsPreRowSchema>;

// D-05 variant B: post-close correction via edit_paid_tab (tab.edit_paid audit rows).
export const DeletionsPostRowSchema = z.object({
  tabId: UuidSchema,
  editedAt: TimestampSchema,
  staffName: z.string(),
  reason: z.string(),
  fieldsChanged: z.array(z.string()),
});

export type DeletionsPostRow = z.infer<typeof DeletionsPostRowSchema>;

// D-08: per-caja-session rows (cajaSessionId set) plus one day-level rollup
// row (cajaSessionId null, isRollup true) pinned to the table bottom.
export const PaymentMethodRowSchema = z.object({
  cajaSessionId: UuidSchema.nullable(),
  method: PaymentMethodSchema,
  legCount: z.number(),
  grossAmount: MoneySchema,
  tipAmount: MoneySchema,
  isRollup: z.boolean(),
});

export type PaymentMethodRow = z.infer<typeof PaymentMethodRowSchema>;

export type CategoryRevenueRow = {
  categoryId: string;
  categoryName: string;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  pctTotal: number;
};

// ============================================================================
// CART ITEM (client-only â€” not in DB)
// ============================================================================

export const CartItemSchema = z.object({
  tempId: z.string(),
  product: ProductSchema,
  quantity: z.number().int().min(1),
  weightGrams: z.number().int().positive().max(50000).nullable().optional(),
  selectedModifiers: z.array(ModifierSchema),
  unitPrice: MoneySchema,
  notes: z.string().max(200).default(''),
  lineTotal: MoneySchema,
});

export const CartItemCreateSchema = CartItemSchema.omit({ tempId: true, lineTotal: true });

export const CartItemInputSchema = z.object({
  productId: UuidSchema,
  product: ProductSchema,
  quantity: z.number().int().positive(),
  selectedModifiers: z.array(ModifierSchema),
  unitPrice: MoneySchema,
});

export type CartItem = z.infer<typeof CartItemSchema>;
export type CartItemCreate = z.infer<typeof CartItemCreateSchema>;
export type CartItemInput = z.infer<typeof CartItemInputSchema>;

// ============================================================================
// DOMAIN NAMESPACE EXPORT
// ============================================================================

export const domain = {
  schemas: {
    // Primitives
    Money: MoneySchema,
    Uuid: UuidSchema,
    Timestamp: TimestampSchema,
    Pin: PinSchema,
    HexColor: HexColorSchema,
    TimeString: TimeStringSchema,

    // Enums
    UserRole: UserRoleSchema,
    Locale: LocaleSchema,
    TabStatus: TabStatusSchema,
    OrderStatus: OrderStatusSchema,
    PaymentMethod: PaymentMethodSchema,
    InventoryAdjustReason: InventoryAdjustReasonSchema,
    StockMovementReason: StockMovementReasonSchema,

    // Entities
    Category: CategorySchema,
    CategoryCreate: CategoryCreateSchema,
    CategoryUpdate: CategoryUpdateSchema,

    Modifier: ModifierSchema,
    ModifierCreate: ModifierCreateSchema,
    ModifierUpdate: ModifierUpdateSchema,

    Product: ProductSchema,
    ProductCreate: ProductCreateSchema,
    ProductUpdate: ProductUpdateSchema,

    Staff: StaffSchema,
    StaffCreate: StaffCreateSchema,
    StaffUpdate: StaffUpdateSchema,

    Shift: ShiftSchema,
    ShiftCreate: ShiftCreateSchema,
    ShiftUpdate: ShiftUpdateSchema,

    OrderItem: OrderItemSchema,
    OrderItemCreate: OrderItemCreateSchema,
    OrderItemUpdate: OrderItemUpdateSchema,

    Order: OrderSchema,
    OrderCreate: OrderCreateSchema,
    OrderUpdate: OrderUpdateSchema,

    Tab: TabSchema,
    TabCreate: TabCreateSchema,
    TabUpdate: TabUpdateSchema,

    Payment: PaymentSchema,
    PaymentCreate: PaymentCreateSchema,
    PaymentUpdate: PaymentUpdateSchema,

    Inventory: InventorySchema,
    InventoryCreate: InventoryCreateSchema,
    InventoryUpdate: InventoryUpdateSchema,

    Supplier: SupplierSchema,
    SupplierCreate: SupplierCreateSchema,
    SupplierUpdate: SupplierUpdateSchema,
    SupplierProduct: SupplierProductSchema,

    InventoryLog: InventoryLogSchema,
    InventoryLogCreate: InventoryLogCreateSchema,
    InventoryLogUpdate: InventoryLogUpdateSchema,
    InventoryAlert: InventoryAlertSchema,
    NearExpiryAlert: NearExpiryAlertSchema,

    OpenUnitStatus: OpenUnitStatusSchema,
    OpenUnit: OpenUnitSchema,
    OpenUnitCorrection: OpenUnitCorrectionSchema,

    StockMovement: StockMovementSchema,
    StockMovementCreate: StockMovementCreateSchema,

    ModifierGroup: ModifierGroupSchema,
    ModifierGroupCreate: ModifierGroupCreateSchema,
    ModifierGroupUpdate: ModifierGroupUpdateSchema,

    ModifierGroupItem: ModifierGroupItemSchema,
    ModifierGroupItemCreate: ModifierGroupItemCreateSchema,

    ProductModifierGroup: ProductModifierGroupSchema,
    ProductModifierGroupCreate: ProductModifierGroupCreateSchema,

    SettingsKey: SettingsKeySchema,
    GeneralSettings: GeneralSettingsSchema,
    BillingPaymentMethods: BillingPaymentMethodsSchema,
    PaymentMethodLabels: PaymentMethodLabelsSchema,
    BillingSettings: BillingSettingsSchema,
    EmailReceiptSettings: EmailReceiptSettingsSchema,
    ReceiptSettings: ReceiptSettingsSchema,
    SettingsBackupSummary: SettingsBackupSummarySchema,
    TipDistributionSettings: TipDistributionSettingsSchema,
    NearExpirySettings: NearExpirySettingsSchema,

    CajaStatus: CajaStatusSchema,
    CajaSession: CajaSessionSchema,
    CajaSessionCreate: CajaSessionCreateSchema,
    CajaEntryType: CajaEntryTypeSchema,
    CajaEntry: CajaEntrySchema,
    CajaEntryCreate: CajaEntryCreateSchema,
    TipDistributionEntry: TipDistributionEntrySchema,
    CajaReport: CajaReportSchema,
    CajaReportSummary: CajaReportSummarySchema,
    CashReconciliation: CashReconciliationSchema,
    CajaReportTopProduct: CajaReportTopProductSchema,
    CajaReportStaff: CajaReportStaffSchema,

    StaffMetric: StaffMetricSchema,

    CartItem: CartItemSchema,
    CartItemCreate: CartItemCreateSchema,
    CartItemInput: CartItemInputSchema,
  },
  types: {} as {
    // Enums
    UserRole: z.infer<typeof UserRoleSchema>;
    Locale: Locale;
    TabStatus: z.infer<typeof TabStatusSchema>;
    OrderStatus: z.infer<typeof OrderStatusSchema>;
    PaymentMethod: z.infer<typeof PaymentMethodSchema>;
    InventoryAdjustReason: z.infer<typeof InventoryAdjustReasonSchema>;
    StockMovementReason: StockMovementReason;

    // Entities
    Category: Category;
    CategoryCreate: CategoryCreate;
    CategoryUpdate: CategoryUpdate;

    Modifier: Modifier;
    ModifierCreate: ModifierCreate;
    ModifierUpdate: ModifierUpdate;

    Product: Product;
    ProductCreate: ProductCreate;
    ProductUpdate: ProductUpdate;

    Staff: Staff;
    StaffCreate: StaffCreate;
    StaffUpdate: StaffUpdate;

    Shift: Shift;
    ShiftCreate: ShiftCreate;
    ShiftUpdate: ShiftUpdate;

    OrderItem: OrderItem;
    OrderItemCreate: OrderItemCreate;
    OrderItemUpdate: OrderItemUpdate;

    Order: Order;
    OrderCreate: OrderCreate;
    OrderUpdate: OrderUpdate;

    Tab: Tab;
    TabCreate: TabCreate;
    TabUpdate: TabUpdate;

    Payment: Payment;
    PaymentCreate: PaymentCreate;
    PaymentUpdate: PaymentUpdate;

    Inventory: Inventory;
    InventoryCreate: InventoryCreate;
    InventoryUpdate: InventoryUpdate;

    InventoryLog: InventoryLog;
    InventoryLogCreate: InventoryLogCreate;
    InventoryLogUpdate: InventoryLogUpdate;

    OpenUnitStatus: OpenUnitStatus;
    OpenUnit: OpenUnit;
    OpenUnitCorrection: OpenUnitCorrection;

    StockMovement: StockMovement;
    StockMovementCreate: StockMovementCreate;

    ModifierGroup: ModifierGroup;
    ModifierGroupCreate: ModifierGroupCreate;
    ModifierGroupUpdate: ModifierGroupUpdate;

    ModifierGroupItem: ModifierGroupItem;
    ModifierGroupItemCreate: ModifierGroupItemCreate;

    ProductModifierGroup: ProductModifierGroup;
    ProductModifierGroupCreate: ProductModifierGroupCreate;

    SettingsKey: SettingsKey;
    GeneralSettings: GeneralSettings;
    BillingSettings: BillingSettings;
    PaymentMethodLabels: PaymentMethodLabels;
    EmailReceiptSettings: EmailReceiptSettings;
    ReceiptSettings: ReceiptSettings;
    SettingsBackupSummary: SettingsBackupSummary;

    CajaStatus: CajaStatus;
    CajaSession: CajaSession;
    CajaSessionCreate: CajaSessionCreate;
    CajaEntryType: CajaEntryType;
    CajaEntry: CajaEntry;
    CajaEntryCreate: CajaEntryCreate;
    CajaReport: CajaReport;

    StaffMetric: StaffMetric;

    CartItem: CartItem;
    CartItemCreate: CartItemCreate;
    CartItemInput: CartItemInput;
  },
  mocks: {
    tab: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      customerName: 'Alice',
      staffId: '123e4567-e89b-12d3-a456-426614174001',
      shiftId: '123e4567-e89b-12d3-a456-426614174002',
      openedAt: new Date(),
      closedAt: null,
      status: 'open',
      notes: null,
      orders: [],
      items: [],
      subtotal: 0,
    } as Tab,
    product: {
      id: '123e4567-e89b-12d3-a456-426614174003',
      name: 'Beer',
      categoryId: '123e4567-e89b-12d3-a456-426614174004',
      basePrice: 500,
      happyHourPrice: 400,
      sku: 'BEER-01',
      isActive: true,
      soldByWeight: false,
      imageUrl: null,
      stock_threshold: null,
      unitsPerPackage: null,
      parentProductId: null,
      comboEligible: true,
      isCombo: false,
      modifiers: [],
    } as Product,
    cartItem: {
      tempId: 'temp_1',
      product: {
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Beer',
        categoryId: '123e4567-e89b-12d3-a456-426614174004',
        basePrice: 500,
        happyHourPrice: 400,
        sku: 'BEER-01',
        isActive: true,
        soldByWeight: false,
        imageUrl: null,
        stock_threshold: null,
        unitsPerPackage: null,
        parentProductId: null,
        comboEligible: true,
        isCombo: false,
        modifiers: [],
      },
      quantity: 1,
      selectedModifiers: [],
      unitPrice: 500,
      notes: '',
      lineTotal: 500,
    } as CartItem,
  },
};

// ============================================================================
// S4 — SPLIT BILL + REFUND
// ============================================================================

export const RefundReasonSchema = z.enum([
  'wrong_order',
  'quality_issue',
  'customer_complaint',
  'billing_error',
  'other',
]);

export const RefundItemSchema = z.object({
  id: UuidSchema,
  refundId: UuidSchema,
  orderItemId: UuidSchema,
  qty: z.number().int().min(1),
  amount: z.number().positive(),
  restock: z.boolean(),
  createdAt: TimestampSchema,
});

export const RefundSchema = z.object({
  id: UuidSchema,
  originalPaymentId: UuidSchema,
  reason: RefundReasonSchema,
  amount: z.number().positive(),
  createdBy: UuidSchema,
  createdAt: TimestampSchema,
  items: z.array(RefundItemSchema).default([]),
});

export const RefundCreateSchema = RefundSchema.omit({ id: true, createdAt: true, items: true });

export type Refund = z.infer<typeof RefundSchema>;
export type RefundCreate = z.infer<typeof RefundCreateSchema>;
export type RefundItem = z.infer<typeof RefundItemSchema>;
export type RefundReason = z.infer<typeof RefundReasonSchema>;

// process_refund RPC input payload — client-side validation (SALE-06,
// defense-in-depth; the RPC's REFUND_EXCEEDS_ORIGINAL/ITEM_NOT_IN_ORIGINAL_ORDER
// checks remain the sole authority for cross-row/DB-state business rules).
export const ProcessRefundInputSchema = z
  .object({
    originalPaymentId: UuidSchema,
    items: z
      .array(
        z.object({
          order_item_id: UuidSchema,
          qty: z.number().int().positive(),
          amount: z.number().positive(),
          restock: z.boolean(),
        })
      )
      .nonempty(),
    reason: RefundReasonSchema,
  })
  .refine((data) => new Set(data.items.map((i) => i.order_item_id)).size === data.items.length, {
    message: 'Duplicate order_item_id in refund items',
    path: ['items'],
  });

export type ProcessRefundInput = z.infer<typeof ProcessRefundInputSchema>;

// ============================================================================
// Phase 8 S6-01: Report row schemas for analytics widgets
// ============================================================================

export const RefundRegisterRowSchema = z.object({
  id: UuidSchema,
  date: TimestampSchema,
  operatorName: z.string(),
  originalPaymentId: UuidSchema,
  amount: z.number().positive(),
  reason: RefundReasonSchema,
  restockCount: z.number().int(),
  items: z.array(RefundItemSchema).default([]),
});
export type RefundRegisterRow = z.infer<typeof RefundRegisterRowSchema>;

// ============================================================================
// AUDIT LOG (Phase 14)
// ============================================================================

export const AuditSourceSchema = z.enum(['rpc', 'edge', 'client', 'trigger']);
export type AuditSource = z.infer<typeof AuditSourceSchema>;

export const AuditLogSchema = z.object({
  id: UuidSchema,
  actorId: UuidSchema.nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: UuidSchema.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  terminalId: z.string().nullable(),
  source: AuditSourceSchema,
  createdAt: TimestampSchema,
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditLogFiltersSchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  actorId: UuidSchema.optional(),
  dateFrom: TimestampSchema.optional(),
  dateTo: TimestampSchema.optional(),
  search: z.string().optional(),
});

export type AuditLogFilters = z.infer<typeof AuditLogFiltersSchema>;

// ============================================================================
// PRINT JOB (Phase 19 — Store-Local Durable Printing Service)
// ============================================================================

/** 6-way status vocabulary (PRN-07) reported by the store-local print broker. */
export const PrintJobStatusSchema = z.enum([
  'accepted',
  'submitted_to_os',
  'os_reported_printed',
  'failed',
  'cancelled',
  'unknown',
]);
export type PrintJobStatus = z.infer<typeof PrintJobStatusSchema>;

export const PrintJobSchema = z.object({
  jobId: z.string(),
  status: PrintJobStatusSchema,
  origin: z.string(),
  printerName: z.string(),
  attempts: z.number(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type PrintJob = z.infer<typeof PrintJobSchema>;

export const PrintJobEventSchema = z.object({
  ts: TimestampSchema,
  category: z.string(),
  detail: z.string().nullable(),
});
export type PrintJobEvent = z.infer<typeof PrintJobEventSchema>;

export const PrintJobDetailSchema = PrintJobSchema.extend({
  winSpoolJobId: z.number().nullable(),
  lastError: z.string().nullable(),
  events: z.array(PrintJobEventSchema),
});
export type PrintJobDetail = z.infer<typeof PrintJobDetailSchema>;

export const PrintJobFiltersSchema = z.object({
  origin: z.string().optional(),
  printerName: z.string().optional(),
  status: PrintJobStatusSchema.optional(),
  dateFrom: TimestampSchema.optional(),
  dateTo: TimestampSchema.optional(),
});
export type PrintJobFilters = z.infer<typeof PrintJobFiltersSchema>;

// ============================================================================
// OFFLINE ACTION QUEUE — Phase 15 Plan 04
// Locked enum: 4 literals only. Pre-Phase-15 queues may contain other types
// (e.g. 'close-tab') — store rehydration filters those out.
// ============================================================================

export const OfflineActionTypeSchema = z.enum([
  'open-tab',
  'place-order',
  'start-pool-timer',
  'stop-pool-timer',
] as const);
export type OfflineActionType = z.infer<typeof OfflineActionTypeSchema>;

export const OfflineActionSchema = z.object({
  id: UuidSchema,
  type: OfflineActionTypeSchema,
  payload: z.unknown(),
  expectedVersion: z.number().int().min(0),
  timestamp: z.number().int().nonnegative(),
  retryCount: z.number().int().min(0),
});
export type OfflineAction = z.infer<typeof OfflineActionSchema>;
