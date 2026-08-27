import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  callCreateSettingsBackup,
  callRestoreSettingsBackup,
  callSendSettingsTestEmail,
  callSettingsEmailStatus,
} from '@shared/lib/edge-function-contracts';
import { logger } from '@shared/lib/logger-instance';
/* eslint-disable i18next/no-literal-string -- query-key namespace strings +
   settings-table row-key lookups below (Map.get('general') etc.) are internal
   config identifiers, not UI copy. */
import {
  err,
  ok,
  parseSupabaseError,
  supabaseMutation,
  supabaseQuery,
  unknownError,
  type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables, TablesInsert } from '@shared/lib/supabase.types';
import {
  BillingSettingsSchema,
  EmailReceiptSettingsSchema,
  GeneralSettingsSchema,
  NearExpirySettingsSchema,
  PaymentMethodLabelsSchema,
  ReceiptSettingsSchema,
  SettingsBackupSummarySchema,
  TipDistributionSettingsSchema,
  type BillingSettings,
  type EmailReceiptSettings,
  type GeneralSettings,
  type NearExpirySettings,
  type PaymentMethodLabels,
  type ReceiptSettings,
  type SettingsBackupSummary,
  type SettingsKey,
  type TipDistributionSettings,
} from './types';

const DEFAULT_GENERAL: GeneralSettings = {
  barName: 'Bola 8',
  address: '',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  receiptFooterText: '',
};

const DEFAULT_BILLING: BillingSettings = {
  taxRatePercent: 16,
  defaultTipPercentages: [10, 15, 18, 20],
  paymentMethods: { cash: true, bbvaCard: true, rappi: true },
  firstHourMode: 'prorated',
};

const DEFAULT_EMAIL_RECEIPTS: EmailReceiptSettings = {
  fromEmail: '',
};

const DEFAULT_PAYMENT_LABELS: PaymentMethodLabels = {
  cash: 'Efectivo',
  card: 'Terminal BBVA',
  rappi: 'Rappi',
};

const DEFAULT_TIP_DISTRIBUTION: TipDistributionSettings = {
  floorPct: 34,
  barPct: 33,
  kitchenPct: 33,
};

const DEFAULT_NEAR_EXPIRY: NearExpirySettings = { thresholdDays: 14 };

const DEFAULT_RECEIPT: ReceiptSettings = {
  paperWidthChars: 32,
  showCashierName: true,
  showCustomerName: true,
  showReceiptNumber: true,
  headerLine2: '',
  footerText: '',
  boldTotals: true,
  printOnStart: false,
  autoCut: false,
  kdsEnabled: false,
  logoDataUrl: null,
};

export type SettingsSnapshot = {
  general: GeneralSettings;
  billing: BillingSettings;
  emailReceipts: EmailReceiptSettings;
  paymentLabels: PaymentMethodLabels;
  tipDistribution: TipDistributionSettings;
  nearExpiry: NearExpirySettings;
};

const settingsKeys = {
  all: ['settings'] as const,
  backups: () => [...settingsKeys.all, 'backups'] as const,
  emailStatus: () => [...settingsKeys.all, 'email-status'] as const,
};

// receipt_settings is a true one-row singleton (D-04) — every write upserts
// onto this same fixed id rather than a `key` column. Claude's Discretion
// (CONTEXT.md): lowest-risk, most reversible way to enforce "exactly one
// row" without a new schema constraint.
const RECEIPT_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

const receiptSettingsKeys = {
  all: ['receipt_settings'] as const,
};

type SettingsRow = Tables<'settings'>;
type SettingsInsert = TablesInsert<'settings'>;

const SETTINGS_KEYS: SettingsKey[] = [
  'general',
  'billing',
  'email_receipts',
  'pool_tables',
  'payment_labels',
  'tip_distribution',
  'near_expiry',
];

function parseGeneral(value: unknown): GeneralSettings {
  const parsed = GeneralSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GENERAL;
}

function parseBilling(value: unknown): BillingSettings {
  const parsed = BillingSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BILLING;
}

function parseEmailReceipts(value: unknown): EmailReceiptSettings {
  const parsed = EmailReceiptSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_EMAIL_RECEIPTS;
}

function parsePaymentLabels(value: unknown): PaymentMethodLabels {
  const parsed = PaymentMethodLabelsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PAYMENT_LABELS;
}

function parseReceipt(value: unknown): ReceiptSettings {
  const parsed = ReceiptSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RECEIPT;
}

// Derived from the generated `receipt_settings` Row type (DATA-03) so a
// future column rename is caught by typecheck instead of silently drifting.
type ReceiptSettingsRow = Pick<
  Tables<'receipt_settings'>,
  | 'paper_width_chars'
  | 'show_cashier_name'
  | 'show_customer_name'
  | 'show_receipt_number'
  | 'header_line_2'
  | 'footer_text'
  | 'bold_totals'
  | 'print_on_start'
  | 'auto_cut'
  | 'kds_enabled'
  | 'logo_data_url'
>;

function mapReceiptRow(row: ReceiptSettingsRow): ReceiptSettings {
  return parseReceipt({
    paperWidthChars: row.paper_width_chars,
    showCashierName: row.show_cashier_name,
    showCustomerName: row.show_customer_name,
    showReceiptNumber: row.show_receipt_number,
    headerLine2: row.header_line_2,
    footerText: row.footer_text,
    boldTotals: row.bold_totals,
    printOnStart: row.print_on_start,
    autoCut: row.auto_cut,
    kdsEnabled: row.kds_enabled,
    logoDataUrl: row.logo_data_url,
  });
}

function toReceiptPayload(value: ReceiptSettings): ReceiptSettingsRow {
  return {
    paper_width_chars: value.paperWidthChars,
    show_cashier_name: value.showCashierName,
    show_customer_name: value.showCustomerName,
    show_receipt_number: value.showReceiptNumber,
    header_line_2: value.headerLine2,
    footer_text: value.footerText,
    bold_totals: value.boldTotals,
    print_on_start: value.printOnStart,
    auto_cut: value.autoCut,
    kds_enabled: value.kdsEnabled,
    logo_data_url: value.logoDataUrl,
  };
}

function parseTipDistribution(value: unknown): TipDistributionSettings {
  const parsed = TipDistributionSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TIP_DISTRIBUTION;
}

function parseNearExpiry(value: unknown): NearExpirySettings {
  const parsed = NearExpirySettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_NEAR_EXPIRY;
}

function parseBackup(row: Tables<'settings_backups'>): Result<SettingsBackupSummary> {
  try {
    return ok(
      SettingsBackupSummarySchema.parse({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        createdBy: row.created_by,
        restoredAt: row.restored_at,
        restoredBy: row.restored_by,
      })
    );
  } catch (error) {
    return err(unknownError(error));
  }
}

function toSnapshot(rows: SettingsRow[]): SettingsSnapshot {
  const byKey = new Map(rows.map(row => [row.key, row.value] as const));
  const snapshot: SettingsSnapshot = {
    general: parseGeneral(byKey.get('general')),
    billing: parseBilling(byKey.get('billing')),
    emailReceipts: parseEmailReceipts(byKey.get('email_receipts')),
    paymentLabels: parsePaymentLabels(byKey.get('payment_labels')),
    tipDistribution: parseTipDistribution(byKey.get('tip_distribution')),
    nearExpiry: parseNearExpiry(byKey.get('near_expiry')),
  };
  return snapshot;
}

export function useSettings() {
  const query = useQuery({
    queryKey: settingsKeys.all,
    queryFn: async (): Promise<Result<SettingsSnapshot>> => {
      const res = await supabaseQuery(() =>
        supabase
          .from('settings')
          .select('*')
          .in('key', SETTINGS_KEYS)
          .order('updated_at', { ascending: false })
      );
      if (!res.ok) {
        logger.error('settings.fetch_failed', { message: res.error.message, code: res.error.code });
        return res;
      }

      return ok(toSnapshot(res.data));
    },
    staleTime: 30 * 1000,
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

export function useMutationUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: SettingsKey;
      value:
        | GeneralSettings
        | BillingSettings
        | EmailReceiptSettings
        | PaymentMethodLabels
        | ReceiptSettings
        | TipDistributionSettings
        | NearExpirySettings
        | Record<string, unknown>;
    }): Promise<Result<void>> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload: SettingsInsert = {
        key,
        value: value as unknown as TablesInsert<'settings'>['value'],
        updated_by: user?.id ?? null,
      };

      const res = await supabaseMutation(() =>
        supabase.from('settings').upsert(payload, { onConflict: 'key' }).select('id').single()
      );
      if (!res.ok) {
        logger.error('settings.update_failed', {
          key,
          message: res.error.message,
          code: res.error.code,
        });
        return res;
      }
      return ok(undefined);
    },
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      }
    },
  });
}

export function useReceiptSettings() {
  const query = useQuery({
    queryKey: receiptSettingsKeys.all,
    queryFn: async (): Promise<Result<ReceiptSettings>> => {
      // Read directly (NOT via supabaseQuery()): supabaseQuery() treats a null
      // row as a NOT_FOUND error, but an empty receipt_settings table is the
      // legitimate D-06 starting state, not an error.
      const { data, error } = await supabase.from('receipt_settings').select('*').maybeSingle();

      if (error) {
        logger.error('receipt_settings.fetch_failed', { message: error.message, code: error.code });
        return err(parseSupabaseError(error));
      }

      return ok(data ? mapReceiptRow(data) : DEFAULT_RECEIPT);
    },
    staleTime: 30 * 1000,
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

export function useMutationUpdateReceiptSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (value: ReceiptSettings): Promise<Result<void>> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        id: RECEIPT_SETTINGS_SINGLETON_ID,
        ...toReceiptPayload(value),
        updated_by: user?.id ?? null,
      };

      const { error } = await supabase
        .from('receipt_settings')
        .upsert(payload, { onConflict: 'id' })
        .select('id')
        .single();

      if (error) {
        logger.error('receipt_settings.update_failed', { message: error.message, code: error.code });
        return err(parseSupabaseError(error));
      }
      return ok(undefined);
    },
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: receiptSettingsKeys.all });
      }
    },
  });
}

export function useSettingsBackups() {
  const query = useQuery({
    queryKey: settingsKeys.backups(),
    queryFn: async (): Promise<Result<SettingsBackupSummary[]>> => {
      const res = await supabaseQuery(() =>
        supabase
          .from('settings_backups')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(25)
      );
      if (!res.ok) {
        return res;
      }
      const backups: SettingsBackupSummary[] = [];
      for (const row of res.data) {
        const parsed = parseBackup(row);
        if (!parsed.ok) return parsed;
        backups.push(parsed.data);
      }
      return ok(backups);
    },
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

export function useMutationCreateSettingsBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => callCreateSettingsBackup({ label }),
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: settingsKeys.backups() });
      }
    },
  });
}

export function useMutationRestoreSettingsBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ backupId }: { backupId: string }) =>
      callRestoreSettingsBackup({ backupId }),
    onSuccess: result => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
        void queryClient.invalidateQueries({ queryKey: settingsKeys.backups() });
      }
    },
  });
}

export function useEmailSettingsStatus() {
  const query = useQuery({
    queryKey: settingsKeys.emailStatus(),
    queryFn: async () => callSettingsEmailStatus(),
    staleTime: 60 * 1000,
  });
  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

export function useMutationSendSettingsTestEmail() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => callSendSettingsTestEmail({ email }),
  });
}
