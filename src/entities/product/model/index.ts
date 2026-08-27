/**
 * PRODUCT ENTITY - BARREL EXPORT
 */

// Types & Schemas
export { ProductSchema, CategorySchema, ModifierSchema } from './types';

export type { Product, Category, Modifier } from './types';

// State Management
export { useProductStore } from './store';

// Data Fetching
export { useProducts, useProductsForManagement, useCategories, useModifiers, useMutationCreateProduct, useMutationUpdateProduct, useMutationDeactivateProduct, useMutationCreateModifier, useMutationUpdateModifier, useMutationDeleteModifier } from './queries';

export type { CreateProductInput, UpdateProductInput } from './queries';
