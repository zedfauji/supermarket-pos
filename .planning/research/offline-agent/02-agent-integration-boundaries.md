# Agent integration boundaries

## Recommended flow

`AgentPanel → local-agent bridge → loopback model → validated ToolRequest → tool gateway → existing authorised feature/RPC path → bounded ToolResult → renderer`.

The bridge owns model selection and never gives the sidecar a Supabase URL, JWT, DB credential, shell capability or general HTTP capability. Retain the existing chat UI only after replacing `brain.ts` and `tools/index.ts`; do not extend their direct-Supabase dispatch.

```ts
type ToolRequest = { tool: 'reports.today_sales'; arguments: { date: 'today' } };
type LocalModel = { complete(request: AgentRequest): Promise<UntrustedModelOutput>; metadata(): ModelMetadata };
```

This deliberately small TypeScript seam suits the current renderer-owned business access. A later Rust gateway may implement the same protocol; it is not justified until domain operations move behind a native/service boundary.

## Initial allow-list

Read-only candidates grounded in existing query modules: product sales, peak hours, voids, category revenue, payment methods and deletion reports in [`queries-reports.ts`](../../../src/entities/tab/model/queries-reports.ts); caja report, inventory/near-expiry, product lookup, open-tab details and staff metrics. Each production tool needs a narrow adapter, output cap, explicit permission policy and feature/RPC invocation—not a generic table/query tool.

No SQL, PostgREST, Supabase client, audit table, arbitrary URL, shell, filesystem or printer tool belongs in the model tool list.
