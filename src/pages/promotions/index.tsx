/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Percent, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCategories } from '@entities/category';
import { useProducts } from '@entities/product';
import {
  usePromotions,
  useMutationUpdatePromotion,
  useMutationDeletePromotion,
  type Promotion,
} from '@entities/promotion';
import { PromotionFormDialog } from '@features/manage-promotions';
import {
  Badge,
  ConfirmDialog,
  DataTable,
  EmptyState,
  MoneyDisplay,
  PageContainer,
  POSButton,
  StatusBadge,
  Switch,
} from '@shared/ui';
import type { StatusBadgeProps } from '@shared/ui';

function derivePromotionStatus(p: Promotion): StatusBadgeProps['status'] {
  const now = new Date();
  if (!p.active) return 'promo_inactive';
  if (p.startsAt > now) return 'promo_scheduled';
  if (now > p.endsAt) return 'promo_expired';
  return 'promo_active';
}

export default function PromotionsPage() {
  const { t } = useTranslation('pages');
  const { t: tAdmin } = useTranslation('wAdmin');
  const { data: fetchedPromotions, isLoading, resultError } = usePromotions();
  const { data: products } = useProducts();
  const { data: categories } = useCategories();
  const updateMutation = useMutationUpdatePromotion();
  const deleteMutation = useMutationDeletePromotion();

  const [lastGoodPromotions, setLastGoodPromotions] = useState<Promotion[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch-failure backstop:
       remember the last-known-good rows so a background refetch failure keeps
       the table populated instead of clearing to blank (must_haves backstop) */
    if (fetchedPromotions) setLastGoodPromotions(fetchedPromotions);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchedPromotions]);

  useEffect(() => {
    if (resultError) toast.error(tAdmin('promotionsListPanel.loadError'));
  }, [resultError, tAdmin]);

  // Fetch-failure backstop: keep the last-known rows rendered rather than
  // clearing the table to blank (must_haves backstop truth).
  const promotions = fetchedPromotions ?? lastGoodPromotions;

  const productNameById = new Map((products ?? []).map(p => [p.id, p.name]));
  const categoryNameById = new Map((categories ?? []).map(c => [c.id, c.name]));

  function openCreateDialog() {
    setEditingPromotion(null);
    setFormOpen(true);
  }

  const columns: ColumnDef<Promotion>[] = [
    {
      id: 'name',
      accessorFn: p => p.name,
      header: tAdmin('promotionsListPanel.columnName'),
      cell: info => <span className="font-medium">{info.getValue<string>()}</span>,
    },
    {
      id: 'scope',
      header: tAdmin('promotionsListPanel.columnScope'),
      cell: ({ row }) => {
        const p = row.original;
        const targetName =
          p.scopeType === 'product'
            ? (productNameById.get(p.productId ?? '') ?? '')
            : (categoryNameById.get(p.categoryId ?? '') ?? '');
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">{targetName}</span>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {p.scopeType === 'product'
                ? tAdmin('promotionsListPanel.scopeProduct')
                : tAdmin('promotionsListPanel.scopeCategory')}
            </Badge>
          </div>
        );
      },
    },
    {
      id: 'discount',
      header: tAdmin('promotionsListPanel.columnDiscount'),
      cell: ({ row }) =>
        row.original.discountType === 'percent' ? (
          <span className="font-mono tabular-nums">{row.original.discountValue}%</span>
        ) : (
          <MoneyDisplay amount={row.original.discountValue} size="sm" />
        ),
    },
    {
      id: 'dateRange',
      header: tAdmin('promotionsListPanel.columnDateRange'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.startsAt.toLocaleDateString()} – {row.original.endsAt.toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'status',
      header: tAdmin('promotionsListPanel.columnStatus'),
      cell: ({ row }) => <StatusBadge status={derivePromotionStatus(row.original)} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Switch
              checked={p.active}
              disabled={updateMutation.isPending}
              aria-label={tAdmin('promotionsListPanel.toggleActiveAriaLabel')}
              onCheckedChange={checked => {
                void updateMutation.mutateAsync({ id: p.id, active: checked });
              }}
            />
            <POSButton
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tAdmin('promotionsListPanel.edit')}
              onClick={e => {
                e.stopPropagation();
                setEditingPromotion(p);
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </POSButton>
            <POSButton
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tAdmin('promotionsListPanel.delete')}
              onClick={e => {
                e.stopPropagation();
                setDeleteId(p.id);
              }}
            >
              <Trash2 className="size-4" />
            </POSButton>
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer
      title={t('promotions.title')}
      backTo="/home"
      actions={
        <POSButton type="button" onClick={openCreateDialog}>
          {t('promotions.newPromotion')}
        </POSButton>
      }
    >
      <DataTable
        columns={columns}
        data={promotions}
        isLoading={isLoading}
        searchable
        emptyState={
          <EmptyState
            icon={Percent}
            title={tAdmin('promotionsListPanel.emptyTitle')}
            description={tAdmin('promotionsListPanel.emptyBody')}
            action={{ label: t('promotions.newPromotion'), onClick: openCreateDialog }}
          />
        }
      />

      <PromotionFormDialog
        open={formOpen}
        onOpenChange={open => {
          setFormOpen(open);
          if (!open) setEditingPromotion(null);
        }}
        promotion={editingPromotion}
      />

      <ConfirmDialog
        open={!!deleteId}
        title={tAdmin('promotionsListPanel.deleteTitle')}
        description={tAdmin('promotionsListPanel.deleteBody')}
        confirmLabel={tAdmin('promotionsListPanel.delete')}
        variant="destructive"
        onCancel={() => {
          setDeleteId(null);
        }}
        onConfirm={() => {
          if (deleteId) void deleteMutation.mutateAsync(deleteId);
          setDeleteId(null);
        }}
      />
    </PageContainer>
  );
}
