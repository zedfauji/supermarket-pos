import { emit } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { Product } from '@shared/lib/domain';
import i18n from '@shared/lib/i18n';

export const PEEK_WINDOW_LABEL = 'peek';
export const BARCODE_SCANNED_EVENT = 'barcode-scanned';
export const ADD_TO_CART_EVENT = 'add-to-cart';

export interface BarcodeScannedPayload {
  code: string;
}

export interface AddToCartPayload {
  product: Product;
  qty?: number;
  weightGrams?: number;
}

/**
 * Opens the "peek" window on the first scan, or reuses it (show + focus +
 * relay) on every subsequent scan while it already exists — never
 * constructs a second WebviewWindow with the same label (Pitfall 4).
 *
 * The very first barcode is delivered via the creation URL's query string,
 * not a post-creation emit(), because the new window's JS hasn't mounted
 * (and therefore hasn't called listen()) by the time the constructor
 * returns — an immediate emit() would race the bootstrap and be lost
 * (RESEARCH.md Pattern 1 / Pitfall 1).
 */
export async function ensurePeekWindowShown(code: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel(PEEK_WINDOW_LABEL);
  if (existing === null) {
    new WebviewWindow(PEEK_WINDOW_LABEL, {
      url: `/?window=peek&barcode=${encodeURIComponent(code)}`,
      title: i18n.t('wPanels:productPeekPanel.windowTitle'),
      width: 480,
      height: 720,
      minWidth: 400,
      minHeight: 600,
      resizable: true,
      center: true,
    });
    return;
  }
  await existing.show();
  await existing.setFocus();
  await emit(BARCODE_SCANNED_EVENT, { code });
}
