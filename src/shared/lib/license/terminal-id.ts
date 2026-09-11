const TERMINAL_ID_KEY = 'pos.license.terminal_id';

/**
 * Stable per-installation UUID, minted once and kept in localStorage (WebView2 persists
 * it in the app's user-data dir). The license server keys terminals by this value.
 * ponytail: no hardware fingerprint — the portal's revoke button covers a copied install.
 */
export function getTerminalId(): string {
  try {
    const existing = localStorage.getItem(TERMINAL_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(TERMINAL_ID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** Human label shown in the portal — reuses the caja terminal label already in use. */
export function getTerminalName(): string {
  return (import.meta.env.VITE_TERMINAL_ID as string | undefined)?.trim() || 'POS-1';
}

export function getPlatformLabel(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  if (/Mac/i.test(ua)) return 'macos';
  return 'unknown';
}
