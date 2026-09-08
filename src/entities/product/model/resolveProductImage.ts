/**
 * D-14: the single shared answer to "which product image wins" — uploaded
 * photo wins, legacy free-text imageUrl is the fallback, null (placeholder)
 * when both are absent. Lives in entities/product because widgets/ and other
 * entities/* consumers may not import from features/ (FSD boundary).
 *
 * Storage responses are not Postgrest builders, so they're wrapped by hand
 * in ok/err here rather than through supabaseMutation/supabaseQuery.
 */
import { useQuery } from '@tanstack/react-query';
import { logger } from '@shared/lib/logger-instance';
import { err, ok, supabaseError, unknownError, type Result } from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Product } from './types';

export const PRODUCT_PHOTO_BUCKET = 'product-photos';
/** Signed-URL lifetime handed to Storage (D-16). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Re-sign before the TTL expires — TanStack Query staleTime for the signed-URL cache. */
export const SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000;

/** Mints a signed URL for a Storage object path. */
export async function signProductPhoto(path: string): Promise<Result<string>> {
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCT_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      logger.error('product.photo.sign_failed', { message: error.message, path });
      return err(supabaseError(error.message, undefined, error));
    }
    return ok(data.signedUrl);
  } catch (e) {
    logger.error('product.photo.sign_failed', {
      message: e instanceof Error ? e.message : String(e),
      path,
    });
    return err(unknownError(e));
  }
}

/** Pure precedence rule (D-14): a resolved signed URL wins, imageUrl is the fallback, else null. */
export function pickProductImage({
  signedUrl,
  imageUrl,
}: {
  signedUrl: string | null;
  imageUrl: string | null;
}): string | null {
  if (signedUrl) return signedUrl;
  return imageUrl ?? null;
}

/**
 * Resolves a single product's display image, signing photoPath on demand and
 * falling through to imageUrl (or null) on any signing failure — never a
 * broken/expired path string reaches the UI.
 */
export async function resolveProductImageUrl(product: {
  photoPath: string | null;
  imageUrl: string | null;
}): Promise<string | null> {
  const { photoPath, imageUrl } = product;
  if (!photoPath) {
    return pickProductImage({ signedUrl: null, imageUrl });
  }
  const signed = await signProductPhoto(photoPath);
  return pickProductImage({ signedUrl: signed.ok ? signed.data : null, imageUrl });
}

/**
 * TanStack Query hook for a single product's display image (dialog Photo
 * tab / catalog thumbnail). Keyed by product id + photoPath + imageUrl so an
 * upload/replace/remove naturally produces a fresh query with no manual
 * invalidation needed. The batch createSignedUrls path (list surfaces) is
 * Plan 03's work, not this hook.
 */
export function useProductImageUrl(
  product: Pick<Product, 'id' | 'photoPath' | 'imageUrl'>
): { url: string | null; isLoading: boolean } {
  const { id, photoPath, imageUrl } = product;
  const query = useQuery({
    // eslint-disable-next-line i18next/no-literal-string -- query-key namespace string, not UI copy
    queryKey: ['product-photo-url', id, photoPath, imageUrl],
    queryFn: () => resolveProductImageUrl({ photoPath, imageUrl }),
    staleTime: SIGNED_URL_STALE_TIME_MS,
  });

  return {
    url: query.data ?? null,
    isLoading: !!photoPath && query.isPending,
  };
}
