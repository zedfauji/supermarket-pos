# Agent security model

The model is an untrusted parser, never a principal. Treat its text and structured output as hostile input.

| Class | Examples | Policy |
|---|---|---|
| READ-ONLY | sales, product, low-stock, tables/tabs | schema + tool allow-list + current JWT/RLS/permission at execution; bounded result |
| LOW-RISK MUTATION | none in V1 | normal authorization, user-visible preview and fresh bound confirmation |
| PRIVILEGED MUTATION | inventory/product/settings/caja/purchase orders | explicit tool policy, manager/admin authorization, re-auth/manager PIN where normal POS needs it, durable audit |
| FORBIDDEN | payments, refunds, void/reopen/edit-paid sale, discounts, RBAC/staff role, backup restore, audit modifications, SQL/shell/network | never expose as an agent tool in V1 |

The gateway rejects unknown tools/keys, validates runtime schema/ranges/IDs, resolves the **current** authenticated session, checks permission independently of the model, applies confirmation policy, calls the normal authorised RPC/feature service, then records immutable `source=agent`, actor, terminal, model/runtime/version/hash, validated arguments, approval and outcome. Audit history is not model writable. Existing client-memory confirmation tokens and fire-and-forget `agent_audit_log` telemetry are insufficient.

Prompt injection is contained by separating tool results from instructions, fixed system/tool contracts, no retrieved text that can alter policy, no arbitrary tool chaining, size limits and model output parsing. A compromised sidecar can propose requests; it cannot execute them.
