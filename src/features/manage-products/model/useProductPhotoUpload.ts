/**
 * Upload/replace mutation for a single product photo (Phase 31, D-16).
 * Sequence: isOnline guard -> validate -> resize -> Storage upload ->
 * link (products.photo_path write) -> delete the previous object last.
 * Each stage returns its own distinguishable AppError so the UI can choose
 * between errorUpload / errorLink / a silent orphan on a failed old delete
 * (Pitfall 6) — upsert stays off so a replace can never overwrite a live key.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateCatalogQueries, PRODUCT_PHOTO_BUCKET } from '@entities/product';
import { isOnline } from '@shared/lib/connectivity';
import { logger } from '@shared/lib/logger-instance';
import {
  err,
  networkOfflineError,
  ok,
  photoLinkFailedError,
  photoUploadFailedError,
  supabaseMutation,
  type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import { photoObjectPath, resizePhoto, validatePhotoFile } from './photo-file';

/* eslint-disable i18next/no-literal-string -- MIME-type literals, not UI copy */
const WEBP_CONTENT_TYPE = 'image/webp';
const JPEG_CONTENT_TYPE = 'image/jpeg';
/* eslint-enable i18next/no-literal-string */

export type ProductPhotoUploadInput = {
  productId: string;
  previousPath: string | null;
  file: File;
};

export function useProductPhotoUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProductPhotoUploadInput): Promise<Result<{ path: string }>> => {
      if (!isOnline()) {
        return err(networkOfflineError());
      }

      const validated = validatePhotoFile(input.file);
      if (!validated.ok) return validated;

      const resized = await resizePhoto(validated.data);
      if (!resized.ok) return resized;

      const path = photoObjectPath(input.productId, resized.data.ext);
      const contentType = resized.data.ext === 'webp' ? WEBP_CONTENT_TYPE : JPEG_CONTENT_TYPE;

      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_PHOTO_BUCKET)
        .upload(path, resized.data.blob, { contentType, upsert: false });
      if (uploadError) {
        logger.error('product.photo.upload_failed', { message: uploadError.message, path });
        return err(photoUploadFailedError(uploadError.message, uploadError));
      }

      const linkResult = await supabaseMutation(() =>
        supabase.from('products').update({ photo_path: path }).eq('id', input.productId).select('id').single()
      );
      if (!linkResult.ok) {
        logger.error('product.photo.link_failed', {
          message: linkResult.error.message,
          path,
          productId: input.productId,
        });
        return err(photoLinkFailedError(linkResult.error.message, linkResult.error));
      }

      if (input.previousPath) {
        const { error: removeError } = await supabase.storage
          .from(PRODUCT_PHOTO_BUCKET)
          .remove([input.previousPath]);
        if (removeError) {
          // Reported to the user as success (the new photo is live and linked) —
          // the old object is merely orphaned, not a broken reference. Logged so
          // it can be reclaimed later.
          logger.warn('product.photo.old_object_orphaned', {
            path: input.previousPath,
            message: removeError.message,
          });
        }
      }

      return ok({ path });
    },
    onSuccess: result => {
      if (result.ok) invalidateCatalogQueries(queryClient);
    },
  });
}
