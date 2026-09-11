/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Licensing (see .planning/decisions/2026-09-06-licensing-and-subscription-control.md) */
  readonly VITE_LICENSE_SERVER_URL?: string;
  readonly VITE_LICENSE_SERVER_ANON_KEY?: string;
  readonly VITE_LICENSE_PUBLIC_KEY?: string;
  /** 'true' | 'false'; defaults to enforced in production builds, off in dev/e2e. */
  readonly VITE_LICENSE_ENFORCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
