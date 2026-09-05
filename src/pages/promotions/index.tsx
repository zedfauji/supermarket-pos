/* eslint-disable import/order, @typescript-eslint/no-confusing-void-expression */
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Percent, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  usePromotions,
  useMutationUpdatePromotion,
  useMutationDeletePromotion,
  type Promotion,
} from '@entities/promotion';
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
  const navigate = useNavigate();
  const { data: fetchedPromotions, isLoading, resultError } = usePromotions();
  const updateMutation = useMutationUpdatePromotion();
  const deleteMutation = useMutationDeletePromotion();

  const [lastGoodPromotions, setLastGoodPromotions] = useState<Promotion[]>([]);
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

  function openCreateDialog() {
    void navigate('/promotions/new');
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
        if (p.targets.length === 0) {
          return (
            <Badge variant="secondary" className="text-xs">
              {tAdmin('promotionsListPanel.scopeStoreWide')}
            </Badge>
          );
        }
        const productCount = p.targets.filter(t => t.productId !== null).length;
        const categoryCount = p.targets.filter(t => t.categoryId !== null).length;
        return (
          <span className="text-sm">
            {tAdmin('promotionsListPanel.scopeTargetCounts', { productCount, categoryCount })}
          </span>
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
      id: 'review',
      header: tAdmin('promotionsListPanel.columnReview'),
      cell: ({ row }) =>
        row.original.needsReview ? <StatusBadge status="promo_needs_review" /> : null,
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
                void navigate(`/promotions/${p.id}/edit`);
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
