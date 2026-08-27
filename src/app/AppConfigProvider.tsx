import { useEffect, useState } from 'react';
import { initSupabaseClient } from '@shared/lib/supabase';

interface Props {
  children: React.ReactNode;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function AppConfigProvider({ children }: Props) {
  // In non-Tauri environments (dev server / tests) skip the command
  const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
  const [ready, setReady] = useState(!isTauri);

  useEffect(() => {
    if (!isTauri) return;

    import('@tauri-apps/api/core')
      .then(({ invoke }) =>
        invoke<{ supabaseUrl: string; supabaseAnonKey: string }>('get_runtime_config')
      )
      .then(cfg => {
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
          initSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        }
      })
      .catch(() => {
        /* fallback to VITE_ env vars via lazy getClient() */
      })
      .finally(() => {
        setReady(true);
      });
  }, [isTauri]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading configuration…</p>
      </div>
    );
  }

  return <>{children}</>;
}
