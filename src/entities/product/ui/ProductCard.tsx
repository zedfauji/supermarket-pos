import { useTranslation } from 'react-i18next';
import type { Product, Category } from '@shared/lib/domain';
import { cn } from '@shared/lib/utils';
import { MoneyDisplay } from '@shared/ui/MoneyDisplay';
import { POSButton } from '@shared/ui/POSButton';
import { Badge } from '@shared/ui/badge';

export interface ProductCardProps {
  product: Product;
  category: Category;
  /** Catalog clock (defaults to `new Date()`), retained for prop-compat with callers. */
  now?: Date;
  onSelect: (product: Product) => void;
  className?: string;
}

export function ProductCard({ product, category, onSelect, className }: ProductCardProps) {
  const { t } = useTranslation('entities');
  const displayPrice = product.basePrice;
  const unavailable = !product.isActive;

  const handleClick = () => {
    if (unavailable) return;
    if ('vibrate' in navigator) navigator.vibrate(10);
    onSelect(product);
  };

  return (
    <POSButton
      type="button"
      touchSize="large"
      variant="outline"
      disabled={unavailable}
      onClick={handleClick}
      className={cn(
        'relative h-auto min-h-[120px] w-full flex-col items-stretch justify-start gap-2 rounded-lg border bg-card p-4 text-left font-normal',
        unavailable && 'cursor-not-allowed opacity-60',
        className
      )}
      aria-label={t('productCard.selectRegularPrice', { name: product.name })}
      aria-disabled={unavailable}
    >
      {unavailable && (
        <Badge variant="secondary" className="absolute right-2 top-2">
          {t('productCard.outOfStock')}
        </Badge>
      )}
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">{category.name}</span>
      </div>
      {product.barcode && (
        <span className="w-full truncate text-xs text-muted-foreground">
          {t('productCard.barcodeLabel', { code: product.barcode })}
        </span>
      )}
      <h3 className="w-full truncate text-lg font-semibold">{product.name}</h3>
      <MoneyDisplay amount={displayPrice} size="lg" />
    </POSButton>
  );
}
