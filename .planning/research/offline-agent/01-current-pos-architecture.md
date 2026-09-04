# Current POS architecture (repository fact)

## Topology

The shipped application is a React 19/Vite renderer in Tauri 2. `src-tauri` is a thin native-integration shell (printing, cash drawer, print audit, runtime configuration), not a Rust domain backend ([`src-tauri/src/lib.rs`](../../../src-tauri/src/lib.rs)). Business data and identity use Supabase Auth, PostgREST/RPC, PostgreSQL and RLS. The frontend uses FSD aliases, TanStack Query and Zustand.

The existing `broker/` is a separately packaged Rust Windows print service with SQLite, proving that a bundled sidecar is a repository-consistent deployment pattern. Production customer configuration is cloud mode; installer checks reject loopback Supabase. The documented offline feature is a browser queue for `open-tab` and `place-order`, replayed after reconnect ([`OfflineQueueProcessor.tsx`](../../../src/app/OfflineQueueProcessor.tsx)); no local authoritative PostgreSQL/Supabase replica is packaged.

## Existing agent: migration target, not a foundation

`src/features/agent-chat` supplies a useful global chat UI, Zustand state and confirmation card. Its core (`src/shared/lib/agent`) is cloud-first: `brain.ts` calls the Supabase `agent-proxy`/Anthropic, `rag.ts` uses OpenAI embeddings and cloud pgvector, and its Ollama fallback has no tools. Tool files directly query/mutate Supabase from the renderer and `executeTool` relies on casts rather than runtime schema and permission enforcement. This is incompatible with the proposed local security boundary.

## Consequence

Offline *inference* is feasible. Offline answers about live operational data or agent mutations are **not supported by the present data topology** while cloud Supabase is unavailable. The first local agent must state data unavailability rather than invent or use stale cloud data.
