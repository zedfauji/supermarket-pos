import { isOnline } from '@shared/lib/connectivity';
import { err, ok, type AppError, type Result } from '@shared/lib/result';
import { getLicenseServerAnonKey, getLicenseServerUrl } from './config';
import { getPlatformLabel, getTerminalId, getTerminalName } from './terminal-id';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0';

/** Server error codes that mean "this terminal is no longer licensed" — the client clears its token. */
export const FATAL_LICENSE_CODES = new Set([
  'INVALID_KEY',
  'TERMINAL_REVOKED',
  'TERMINAL_NOT_REGISTERED',
  'TERMINAL_BOUND_ELSEWHERE',
]);

export interface LicenseServerError extends AppError {
  code: 'LICENSE_ERROR' | 'NETWORK_OFFLINE';
  /** Server code (INVALID_KEY, TERMINAL_LIMIT, TERMINAL_REVOKED, …) when the server answered. */
  serverCode: string | null;
}

async function post(
  path: 'activate' | 'heartbeat',
  body: Record<string, unknown>
): Promise<Result<{ token: string }, LicenseServerError>> {
  const url = getLicenseServerUrl();
  if (!url) {
    return err({
      code: 'LICENSE_ERROR',
      message: 'License server URL is not configured',
      serverCode: null,
    });
  }
  if (!isOnline()) {
    return err({
      code: 'NETWORK_OFFLINE',
      message: 'Offline — cannot reach the license server',
      serverCode: null,
    });
  }
  const anon = getLicenseServerAnonKey();
  try {
    const res = await fetch(`${url}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok || !json.token) {
      return err({
        code: 'LICENSE_ERROR',
        message: json.message ?? json.error ?? `License server error (${String(res.status)})`,
        serverCode: json.error ?? null,
      });
    }
    return ok({ token: json.token });
  } catch (e) {
    return err({
      code: 'NETWORK_OFFLINE',
      message: e instanceof Error ? e.message : 'Network error',
      serverCode: null,
    });
  }
}

function telemetry(): Record<string, string> {
  return { terminal_id: getTerminalId(), app_version: APP_VERSION, os: getPlatformLabel() };
}

/** First-run activation: bind this terminal to the tenant owning `licenseKey`. */
export function activateLicense(
  licenseKey: string
): Promise<Result<{ token: string }, LicenseServerError>> {
  return post('activate', {
    ...telemetry(),
    license_key: licenseKey.trim(),
    terminal_name: getTerminalName(),
  });
}

/** Periodic lease refresh for an already-activated terminal. */
export function heartbeatLicense(
  licenseKey: string
): Promise<Result<{ token: string }, LicenseServerError>> {
  return post('heartbeat', { ...telemetry(), license_key: licenseKey.trim() });
}
