/**
 * Photo panel mounted in the product edit dialog (Phase 31, Task 2 tracer
 * slice). Wires ONE path only: OS file picker -> resize -> upload -> link ->
 * signed-URL preview. No drag-and-drop, no clipboard paste, no replace/remove
 * buttons yet — those are later plans (Plan 02). Clicking the populated
 * preview re-opens the picker so a second upload is still reachable without
 * a dedicated Replace button.
 */
import { ImageOff, ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useProductImageUrl } from '@entities/product';
import type { Product } from '@shared/lib/domain';
import type { AppError } from '@shared/lib/result';
import { cn } from '@shared/lib/utils';
import { EmptyState } from '@shared/ui/EmptyState';
import { LoadingSpinner } from '@shared/ui/LoadingSpinner';
import { Skeleton } from '@shared/ui/skeleton';
import { ACCEPTED_PHOTO_MIME_TYPES } from '../../model/photo-file';
import { useProductPhotoUpload } from '../../model/useProductPhotoUpload';

export type ProductPhotoTabProps = {
  product: Product;
  submitting: boolean;
};

const ACCEPT_ATTR = ACCEPTED_PHOTO_MIME_TYPES.join(',');

export function ProductPhotoTab({ product, submitting }: ProductPhotoTabProps) {
  const { t } = useTranslation('featMgmt');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const uploadMutation = useProductPhotoUpload();
  const { url, isLoading: isSigning } = useProductImageUrl(product);

  const disabled = submitting || uploadMutation.isPending;

  function errorCopyFor(error: AppError): string {
    const unknownTypeLabel = t('manageProducts.productDialog.photo.unknownType');
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return t('manageProducts.productDialog.photo.errorUnsupportedType', {
          type: error.detail === 'unknownType' || !error.detail ? unknownTypeLabel : error.detail,
        });
      case 'PHOTO_TOO_LARGE':
        return t('manageProducts.productDialog.photo.errorTooLarge', { size: error.detail ?? '' });
      case 'PHOTO_DECODE_FAILED':
        return t('manageProducts.productDialog.photo.errorDecode', {
          type: error.detail === 'unknownType' || !error.detail ? unknownTypeLabel : error.detail,
        });
      case 'PHOTO_UPLOAD_FAILED':
        return t('manageProducts.productDialog.photo.errorUpload', { message: error.message });
      case 'PHOTO_LINK_FAILED':
        return t('manageProducts.productDialog.photo.errorLink');
      case 'NETWORK_OFFLINE':
        return t('manageProducts.productDialog.photo.errorOffline');
      default:
        return error.message;
    }
  }

  function openPicker(): void {
    if (disabled) return;
    fileInputRef.current?.click();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMessage(null);
    setImgFailed(false);
    uploadMutation.mutate(
      { productId: product.id, previousPath: product.photoPath, file },
      {
        onSuccess: result => {
          if (!result.ok) {
            const message = errorCopyFor(result.error);
            setErrorMessage(message);
            toast.error(message);
            return;
          }
          toast.success(t('manageProducts.productDialog.photo.uploaded'));
        },
      }
    );
  }

  const hasPhoto = product.photoPath != null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        data-testid="product-photo-dropzone"
        className={cn(
          'relative aspect-square w-full max-w-[20rem] overflow-hidden rounded-xl',
          hasPhoto
            ? 'border border-border bg-muted'
            : 'border-2 border-dashed border-border-strong bg-card transition-colors duration-150',
          disabled && 'pointer-events-none opacity-70'
        )}
        {...(hasPhoto
          ? {
              role: 'button' as const,
              tabIndex: 0,
              onClick: openPicker,
              onKeyDown: handleKeyDown,
              'aria-label': t('manageProducts.productDialog.photo.chooseFile'),
            }
          : {})}
      >
        {hasPhoto ? (
          isSigning || !url ? (
            <Skeleton className="size-full rounded-xl" />
          ) : imgFailed ? (
            <div className="flex size-full flex-col items-center justify-center gap-2">
              <ImageOff className="size-10 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">
                {t('manageProducts.productDialog.photo.errorLoad')}
              </span>
            </div>
          ) : (
            <img
              data-testid="product-photo-preview"
              src={url}
              alt={t('manageProducts.productDialog.photo.altText', { name: product.name })}
              className="size-full object-contain p-4"
              onError={() => {
                setImgFailed(true);
              }}
            />
          )
        ) : (
          <EmptyState
            className="[&_h3]:text-lg"
            icon={ImagePlus}
            title={t('manageProducts.productDialog.photo.emptyTitle')}
            description={t('manageProducts.productDialog.photo.emptyBody')}
            action={{ label: t('manageProducts.productDialog.photo.chooseFile'), onClick: openPicker }}
          />
        )}

        {uploadMutation.isPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-popover/70">
            <LoadingSpinner />
            <span className="text-sm text-muted-foreground">
              {t('manageProducts.productDialog.photo.uploading')}
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          data-testid="product-photo-file-input"
          className="sr-only"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>

      {!hasPhoto && (
        <p className="text-sm text-muted-foreground">
          {t('manageProducts.productDialog.photo.formatsHint')}
        </p>
      )}

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive text-center max-w-[20rem]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
