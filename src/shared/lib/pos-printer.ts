/**
 * Thermal receipt printing — Tauri ESC/POS on Windows, browser fallback elsewhere.
 */

import { toast } from 'sonner';
import type { ReceiptSettings } from '@shared/lib/domain';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import i18n from '@shared/lib/i18n';
import { getCurrentLocale } from '@shared/lib/i18n';
import { logger } from '@shared/lib/logger-instance';
import { buildThermalReceiptText } from '@shared/lib/receipt-format';
import type { AppErrorCode, Result } from '@shared/lib/result';
import { ok, err, tauriError } from '@shared/lib/result';

/** Also used by open-product-peek-window/CheckoutPanel to no-op Tauri-only
 * window/event IPC calls when running outside a Tauri runtime (e.g. this
 * project's Playwright suite drives `npm run dev`, a plain browser tab). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Bounded retry for a real (local IPC, not networked) printer — a fixed delay
// is sufficient per CONTEXT.md's discretion note (D-03).
const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Builds fully-translated (acting staff's locale) receipt lines for Rust
 * `print_receipt`, which only ESC/POS-encodes them (no label strings in Rust).
 */
export function receiptDataToPrinterLines(data: ReceiptData, settings: ReceiptSettings): string[] {
  const locale = getCurrentLocale();
  return buildThermalReceiptText(data, locale, settings).split('\n');
}

function printReceiptWebFallback(data: ReceiptData, settings: ReceiptSettings): void {
  const text = buildThermalReceiptText(data, getCurrentLocale(), settings);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=400,height=600');
  if (!w) {
    logger.warn('printer.web.fallback', { reason: 'popup_blocked' });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- minimal print fallback when not in Tauri
  w.document.write(
    `<!DOCTYPE html><html><head><title>Receipt</title></head><body><pre style="font-family:monospace;font-size:11px;">${escapeHtml(
      text
    )}</pre><script>window.onload=function(){window.print();}</script></body></html>`
  );
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function printReceipt(
  data: ReceiptData,
  settings: ReceiptSettings
): Promise<Result<void>> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const toastId = `print-${data.receiptNumber}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_PRINT_ATTEMPTS; attempt++) {
      try {
        await invoke('print_receipt', {
          lines: receiptDataToPrinterLines(data, settings),
          logoDataUrl: settings.logoDataUrl,
          paperWidthChars: settings.paperWidthChars,
        });
        if (attempt > 1) {
          toast.success(i18n.t('featOrders:printer.printSucceededAfterRetry'), { id: toastId });
        }
        return ok(undefined);
      } catch (e) {
        lastError = e;
        logger.warn('printer.receipt.attempt_failed', { attempt, raw: String(e) });
        if (attempt < MAX_PRINT_ATTEMPTS) {
          toast.loading(
            i18n.t('featOrders:printer.retryingPrint', { attempt, max: MAX_PRINT_ATTEMPTS }),
            { id: toastId }
          );
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    toast.error(i18n.t('featOrders:printer.printFailedAfterRetries', { max: MAX_PRINT_ATTEMPTS }), {
      id: toastId,
    });
    return err(
      tauriError(lastError instanceof Error ? lastError.message : 'Print failed', lastError)
    );
  }
  logger.info('printer.receipt.web_fallback', { receiptNumber: data.receiptNumber });
  printReceiptWebFallback(data, settings);
  return ok(undefined);
}

export async function openCashDrawer(): Promise<Result<void>> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_cash_drawer');
      return ok(undefined);
    } catch (e) {
      return err(tauriError(e instanceof Error ? e.message : 'Could not open cash drawer', e));
    }
  }
  window.alert('Cash drawer is only available when the POS runs in the desktop app (Tauri).');
  return ok(undefined);
}

/** Options for {@link printRawText}. */
export type PrintRawTextOptions = {
  /** When true, appends ESC/POS full-cut sequence (GS V A NUL) after the text. */
  autoCut: boolean | undefined;
};

/** ESC/POS full-cut command bytes: GS V A NUL */
const ESC_POS_FULL_CUT = '\x1d\x56\x41\x00';

/**
 * Prints arbitrary pre-formatted plain text on the thermal printer.
 * Used for pre-cheques, shift summaries, etc. where no ReceiptData is built.
 * In Tauri: invokes `print_raw_text` Rust command.
 * Browser fallback: opens a popup with the text for window.print().
 *
 * @param options.autoCut - When true, appends ESC/POS full-cut bytes after the text.
 */
export async function printRawText(
  text: string,
  options?: PrintRawTextOptions
): Promise<Result<void>> {
  const payload = options?.autoCut === true ? text + ESC_POS_FULL_CUT : text;

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_raw_text', { text: payload });
      return ok(undefined);
    } catch (e) {
      logger.warn('printer.raw_text.failed', { raw: String(e) });
      return err(tauriError(e instanceof Error ? e.message : 'Print failed', e));
    }
  }
  // Browser fallback: open popup with pre-formatted text
  const w = window.open('', '_blank', 'noopener,noreferrer,width=400,height=600');
  if (!w) {
    logger.warn('printer.raw_text.popup_blocked');
    return ok(undefined);
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- minimal print fallback when not in Tauri
  w.document.write(
    `<!DOCTYPE html><html><head><title>Pre-cheque</title></head><body><pre style="font-family:monospace;font-size:11px;">${escapeHtml(
      text
    )}</pre><script>window.onload=function(){window.print();}</` + `script></body></html>`
  );
  w.document.close();
  return ok(undefined);
}

/**
 * Broker-backed test print (Phase 19: Store-Local Durable Printing Service).
 * Returns the broker's durable job id on acceptance — not proof of physical
 * output (PRN-07). On failure, maps the Rust command's error string onto a
 * broker-specific AppErrorCode: `PRINT_BROKER_UNREACHABLE` when the broker
 * itself couldn't be reached within the connect-timeout window (D-12),
 * `PRINT_JOB_REJECTED` for any other submission failure (auth/payload/
 * persistence).
 */
export async function testPrint(): Promise<Result<{ jobId: string }>> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const ack = await invoke<{ job_id: string; status: string }>('test_print');
      return ok({ jobId: ack.job_id });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Test print failed';
      const code: AppErrorCode = message.includes('broker unreachable')
        ? 'PRINT_BROKER_UNREACHABLE'
        : 'PRINT_JOB_REJECTED';
      return err({ code, message, raw: e });
    }
  }
  window.alert('Test print is only available in the desktop app (Tauri).');
  return err(tauriError('Test print requires the Tauri desktop app.'));
}
