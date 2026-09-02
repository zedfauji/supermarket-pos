# Phase 26: Multi-Customer Deployment - Research

**Researched:** 2026-09-01
**Domain:** GitHub Actions CI/CD, Tauri 2 build/updater config, GitHub CLI automation, Supabase CLI multi-project fan-out
**Confidence:** MEDIUM (mechanics are well-documented and several claims were tool-verified this session; a few items depend on facts only the user/account owner can confirm — see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Customer repos are full mirrors of core's `main` (not thin workflow-only repos) — `git push --mirror` on release. Reversibility: costly.
- **D-02:** Core's own release workflow triggers the sync (mirror-push to each customer repo on tag/dispatch), not `repository_dispatch` fan-out or a pull-based model on the customer side.
- **D-03:** Sync target selection is gated by an active-customer manifest (`customers.json` or one file per customer) with a `status: active | suspended` field — the sync job only mirror-pushes to customers marked active. Flipping a customer to `suspended` is a one-line edit + commit; no build/release changes needed.
- **D-04:** Release cadence is effectively lockstep among *active* customers (one core release = one sync attempt to every active customer), with suspension as the per-customer override mechanism — not independent per-customer version pinning.
- **D-05:** Full licensing/billing system is explicitly out of scope for this phase — see Deferred Ideas. This phase only builds the manual active/suspended gate a future licensing phase could eventually flip automatically.
- **D-06:** `customers/<name>/tauri.override.json` lives in core (not in the customer repo), synced by the same mirror push. Fields: `identifier`, `publisher`, `updater.endpoints`, icon path. Applied at build time via `tauri-action`'s `--config` deep-merge (same mechanism already used in `release.yml` for the cert-thumbprint override, validated for this exact purpose by Spike 008).
- **D-07:** Per-customer icons live in `customers/<name>/icons/` in core, synced alongside the override file, referenced by the same `--config` merge.
- **D-08:** A missing or malformed override file at build time **fails the build loudly** — never silently falls back to core's generic defaults. Reversibility: reversible (CI-step behavior, not a data/schema decision).
- **D-09:** Onboarding produces both a script and docs: `scripts/onboard-customer.ps1` (repo creation via `gh` CLI, mirror-push target registration, GitHub Environment creation, `tauri.override.json` + icon template scaffolding, `customers.json` manifest entry) plus a `docs/` runbook for the parts that can't be scripted. Matches this repo's existing `scripts/` convention.
- **D-10:** Creating/registering the new customer's Supabase project itself is a **manual** step (dashboard or `supabase` CLI, `supabase db push --project-ref` per Spike 010's validated pattern) — not scripted end-to-end. The script's plumbing picks up after the project exists.
- **D-11:** `scripts/onboard-customer.ps1` sets up plumbing only — it does **not** trigger the customer's first release. The first sync happens naturally on the next normal release-workflow run once the customer is marked `active`, using the exact same path every subsequent release uses (no special-cased first-run logic).
- **D-12:** The script is idempotent — every step checks current state first and skips/updates rather than failing or duplicating, so a partially-failed onboarding run can be safely re-run.
- **D-13:** `customers.json` manifest entry fields: `name`, `repo`, `status`, `supabase_project_ref`, `deployment_mode`.
- **D-14:** `deployment_mode` (`"cloud" | "self_hosted"`) is added to the manifest schema now as an architectural door-open, but only `"cloud"` is implemented in this phase's script and CI. Reversibility: reversible (additive field).
- **D-15:** Phase 26 retrofits Taj House of Spices (the one real existing customer) into the new model rather than leaving them on the old hardcoded path.
- **D-16:** Core's `tauri.conf.json` is stripped to a generic, customer-agnostic placeholder identity (e.g. `com.example.supermarketpos`) that fails loudly per D-08 if built without an override. Taj's real values move into `customers/taj-house-of-spices/tauri.override.json`. Reversibility: one-way for already-installed Taj clients — changing `identifier` after Taj is live would require a fresh install, not an in-place update. The retrofit must preserve the exact current identifier value, not invent a new one.
- **D-17:** Cutover order is parallel-run, not a direct cut: stand up Taj's new mirrored repo + override file + release pipeline while core's existing `release.yml` keeps working as today's fallback; verify a real signed installer and a real update cycle through the new path; only then retire the direct-from-core release path.
- **D-18:** This phase depends on two already-filed todos landing first (or as part of this phase's own early tasks): `fix-ci-tauri-build-broker-order.md` (blocks `tauri-build`/CI entirely today) and `migrate-env-production-to-github-environment.md` (interim single-customer credential-hygiene fix for Taj, ahead of the full N-customer machinery). Sequence these as prerequisite or first-wave work.

### Claude's Discretion

- Exact `gh` CLI invocations and GitHub Environment naming convention inside `onboard-customer.ps1`.
- Whether the mirror-push sync runs as a step in the existing `release.yml` or a new dedicated workflow file — implementation detail, not a user-facing decision.
- Exact retry/error-handling behavior when a mirror-push to one customer fails mid-fan-out — planner should pick continue + report failures (don't let one customer's push failure block others), can flag if it needs confirmation.

### Deferred Ideas (OUT OF SCOPE)

- **Licensing/billing/payment-tracking system** — invoicing, automated payment detection, auto-suspending non-paying customers. This phase only builds the manual `active`/`suspended` gate (D-03); the system itself needs its own future roadmap phase.
- **Self-hosted-Supabase-in-Docker production support** — manifest reserves `deployment_mode` (D-14) but the CI deploy path (migrations via `--db-url`, secrets in that stack's own env) is unbuilt and unvalidated. Build when a real customer needs it.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP.md lists **"Requirements: TBD"** for Phase 26 — `REQUIREMENTS.md` has no `PHASE-26`-specific `REQ-ID`s at time of research (traceability table has no row for Phase 26; the nearest formalized precedent is Phase 23/24's pattern of retroactively assigning IDs from `CONTEXT.md`'s locked decisions during `/gsd-plan-phase`). This phase's canonical requirement set is **CONTEXT.md's D-01..D-18**, not a `REQUIREMENTS.md` table. The planner should either (a) formalize `MCD-01..MCD-NN` IDs from D-01..D-18 during planning (matching the Phase 22/23 precedent), or (b) plan directly against the D-numbers and let a later `/gsd-progress` pass backfill `REQUIREMENTS.md`. Either way, do not invent requirement IDs that aren't traceable to a specific D-number below.

| D-# | Description | Research Support |
|-----|-------------|-------------------|
| D-01/D-02 | Mirror-push sync, core-triggered | See "git push --mirror mechanics" below |
| D-03/D-04 | Active-customer manifest gates sync | See "customers.json manifest" + Code Examples |
| D-06/D-07/D-08 | Per-customer override file + icons, fail-loud merge | See "tauri-action --config deep-merge" below |
| D-09/D-12 | Idempotent onboarding script | See "scripts/ PowerShell conventions" below |
| D-10 | Manual Supabase project creation, scripted `db push` fan-out | See "Supabase CLI --project-ref fan-out" below |
| D-13/D-14 | Manifest schema | See Code Examples — `customers.json` |
| D-16 | Identifier change = fresh install | See "Tauri identifier field implications" below |
| D-17 | Parallel-run cutover | See Architecture Patterns |
| D-18 | Prerequisite todos | See "Existing Workflow Structure" below |
</phase_requirements>

## Summary

This is a pure CI/CD + packaging phase — no application code, no frontend surface, no `UI-SPEC.md` needed (confirmed: `release.yml`/`ci.yml` are the only files this phase's core mechanism touches; `scripts/onboard-customer.ps1` and `docs/` are ops tooling, not UI). Every mechanism named in D-01..D-18 is a documented, standard capability of `git`, GitHub Actions, `gh` CLI, `tauri-action`, and the Supabase CLI — nothing here requires inventing a workaround. The three riskiest technical unknowns going into planning are: (1) whether `tauri-action`'s `args:` input safely forwards **two** `--config` flags in one string, given the installed `@tauri-apps/cli` (`^2`, so resolves to whatever 2.x npm picks — confirmed the multi-`--config`-merge CLI feature shipped in `@tauri-apps/cli` 2.4.0, well below any current `^2` resolution) — this is standard-CLI-behavior-confirmed but not `tauri-action`-README-confirmed, so the plan should smoke-test it; (2) that **GitHub Environments require GitHub Pro/Team/Enterprise for private repositories** (Free-plan private repos cannot use Environments or environment secrets at all) — and this session's own `gh api` call against the core repo returned `"private": false` (it is currently **public**), which directly changes the calculus for D-06/D-18's environment-secrets plan if customer repos are meant to be private; and (3) that the job-level `environment:` key must use the **long/object form** (`environment: { name: ${{ matrix.x }} }`) to accept a matrix-driven expression — the short string form with an expression is a documented `actions/runner` bug (#998).

**Primary recommendation:** Extend `release.yml` (not a new workflow file — Claude's Discretion, but the existing file already runs on the correct self-hosted runner and already does one `--config` merge, so adding a fan-out step here is the smaller diff) with: a manifest-read step, a `matrix: {customer: [...active customers from customers.json...]}` fan-out job using `environment: { name: <customer>.github_environment }` (long form) for per-customer secrets, a `git push --mirror` step using a PAT stored as that environment's secret, and a second `--config` argument appended to the existing `tauri-action` invocation pointing at `customers/<name>/tauri.override.json`. Land the two D-18 prerequisite todos first (`fix-ci-tauri-build-broker-order.md` blocks `tauri-build`/CI entirely today).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mirror-push sync (core → customer repos) | CI/CD (GitHub Actions) | — | Pure git/CI operation, no app code involved |
| Active-customer gating (`customers.json`) | CI/CD (GitHub Actions, read at workflow start) | Repo (source of truth, committed file) | A committed manifest file is the source of truth; the workflow only reads it |
| Per-customer identity override | Build tooling (Tauri CLI `--config` merge) | CI/CD (supplies the file path) | Merge happens inside the Tauri build step, not in app runtime code |
| Secrets isolation per customer | CI/CD (GitHub Environments) | — | GitHub's own secret-scoping primitive; no app-level secret handling needed |
| New-customer Supabase provisioning | Manual (human, dashboard/CLI) | CI/CD (scripted `db push` fan-out only) | D-10 explicitly keeps project creation manual; only migration push is automatable |
| Onboarding plumbing (`onboard-customer.ps1`) | Local dev tooling (PowerShell script, run by a human, not CI) | `gh` CLI (GitHub API calls) | Runs on a developer machine before the customer is `active`, not inside a workflow |

## Standard Stack

### Core

| Tool | Version (verified) | Purpose | Why Standard |
|------|---------------------|---------|---------------|
| `git` | 2.52.0 (this session's dev machine) `[VERIFIED: git --version this session]` | `push --mirror` for the sync mechanism | Native, no dependency to add |
| `gh` CLI | 2.83.1 (this session's dev machine) `[VERIFIED: gh --version this session]` | Repo creation, Environment creation, secret setting for `onboard-customer.ps1` | Already the project's convention (used by `deploy-remote-backend.ps1`-adjacent tooling); avoids hand-rolled REST calls |
| `supabase` CLI | 2.116.0 (this session's dev machine) `[VERIFIED: supabase --version this session]` | `db push --project-ref` fan-out for new-customer migrations | Already used by `deploy-remote-backend.ps1` and Spike 006/010 |
| `tauri-apps/tauri-action` | pinned `@v0.6.2` in `release.yml` `[VERIFIED: .github/workflows/release.yml:50 this session]` | Builds + signs + publishes the installer, already does one `--config` merge | Already in use; D-06 extends its existing merge mechanism, no new tool |
| `@tauri-apps/cli` | `^2` in `package.json` `[VERIFIED: package.json this session]` | The actual CLI `tauri-action` shells out to; resolves to latest 2.x on `npm ci` | Multi-`--config` merge (needed for D-06+existing-cert-override to coexist) shipped in 2.4.0 — any current `^2` resolution is well past this |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `wearerequired/git-mirror-action` (or hand-rolled `git push --mirror` steps) | Off-the-shelf mirror-push action | Only if the team prefers a marketplace action over 3-4 lines of `git remote add` + `git push --mirror`; the hand-rolled version is simpler to make idempotent/loop-friendly across N customers in one job and keeps auth handling (PAT vs. deploy key) explicit — recommend hand-rolled given D-01..D-04's per-customer fan-out + manifest-gating logic doesn't map cleanly onto a single marketplace action's inputs |
| `jq` or PowerShell's `ConvertFrom-Json` | Reading `customers.json` in CI (bash) or in `onboard-customer.ps1` (PowerShell) | `ConvertFrom-Json` already used in `verify-installer-integrity.ps1` (`Get-Content -Raw | ConvertFrom-Json`) — reuse that exact pattern for `customers.json` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `git push --mirror` steps | `wearerequired/git-mirror-action` | Marketplace action adds a third-party dependency for what is 3 lines of shell; loses fine control over per-customer looping/manifest-gating/continue-on-failure semantics (D-04's discretion point). Not recommended. |
| PAT stored per-customer in GitHub Environment | SSH deploy key per customer repo | Deploy keys are more narrowly scoped (repo-only, no account-wide blast radius) but require managing an SSH keypair per customer (`ssh-keygen`, register public half via `gh repo deploy-key add`, store private half as the Environment secret, plus `known_hosts` setup in the workflow) — more moving parts for `onboard-customer.ps1` to automate idempotently. A fine-grained PAT scoped to just the target customer repo (`contents: write` only) is simpler to script and matches this repo's existing pattern of GitHub-native secrets (no SSH agent setup anywhere else in this repo's CI). Recommend PAT unless the team has an existing deploy-key rotation process. |

**Installation:** No new npm/pip/cargo packages — this phase is CI/CD-native tooling (`git`, `gh`, `supabase`, GitHub Actions YAML, PowerShell). See Package Legitimacy Audit below.

## Package Legitimacy Audit

**Not applicable.** This phase installs no new npm/PyPI/crates packages — every tool used (`git`, `gh`, `supabase` CLI, `tauri-action`, PowerShell) is either already a dependency of this repo's CI (`release.yml`/`ci.yml`) or a system-level CLI, not a package pulled into `package.json`/`Cargo.toml`. If the planner chooses the marketplace-action alternative (`wearerequired/git-mirror-action` or similar) for the mirror-push step, that specific action reference **must** go through this gate at plan time (a GitHub Action reference is a supply-chain dependency exactly like an npm package — verify org/maintainer, star count, and pin to a commit SHA, not a floating tag).

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │  core repo (zedfauji/supermarket-pos)    │
                    │  - main branch (single source of truth)  │
                    │  - customers/<name>/tauri.override.json  │
                    │  - customers/<name>/icons/                │
                    │  - customers.json (active/suspended)     │
                    └───────────────────┬───────────────────────┘
                                         │ push tag v* / workflow_dispatch
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │  release.yml (self-hosted Windows runner) │
                    │  1. checkout core@main                    │
                    │  2. read customers.json → active list     │
                    │  3. FAN-OUT (matrix: active customers)     │
                    │     a. git push --mirror → customer repo   │
                    │        (auth: per-customer PAT from        │
                    │         GitHub Environment secret)          │
                    │     b. tauri-action build, --config x2:     │
                    │        cert override (existing) +           │
                    │        customers/<name>/tauri.override.json │
                    │        → fails loudly if override missing   │
                    │        (D-08)                                 │
                    │     c. publish installer + latest.json to    │
                    │        customer repo's OWN /releases          │
                    └───────────────┬─────────────┬──────────────┘
                                    │             │
                     customer A's repo      customer B's repo
                     (mirror of core@main)  (mirror of core@main)
                     - Actions run there     - own /releases/latest
                       too (full mirror)       (genuine per-customer
                                                 update channel — Spike 007)
                                    │             │
                                    ▼             ▼
                          installed app A    installed app B
                          (identifier=        (identifier=
                           com.customerA...)   com.customerB...)
                          polls A's            polls B's
                          /releases/latest      /releases/latest
```

### Recommended Project Structure

```
customers/
├── taj-house-of-spices/
│   ├── tauri.override.json   # identifier, publisher, updater.endpoints, icon path
│   └── icons/                # per-customer icon set (D-07)
├── <next-customer>/
│   ├── tauri.override.json
│   └── icons/
customers.json                # manifest: name, repo, status, supabase_project_ref, deployment_mode (D-13/D-14)
scripts/
└── onboard-customer.ps1      # D-09
docs/
└── onboarding-new-customer.md  # D-09 runbook for the unscriptable parts (D-10)
.github/workflows/
└── release.yml               # extended with fan-out sync step
```

### Pattern 1: Mirror-push a repo in GitHub Actions using a PAT

**What:** Push core's full `main` (and all refs/tags) to a customer's separate repo as a step in the release workflow.
**When to use:** D-01/D-02 — every release, for every `active` customer.
**Example:**
```yaml
# Source: git-scm.com (git-push docs, --mirror semantics) + GitHub CLI/Actions conventions
- name: Mirror-push to customer repo
  shell: bash
  env:
    CUSTOMER_PAT: ${{ secrets.CUSTOMER_MIRROR_PAT }}   # from the customer's GitHub Environment
    CUSTOMER_REPO: ${{ matrix.customer.repo }}          # e.g. zedfauji/supermarket-pos-taj
  run: |
    set -euo pipefail
    git remote add customer "https://x-access-token:${CUSTOMER_PAT}@github.com/${CUSTOMER_REPO}.git" || \
      git remote set-url customer "https://x-access-token:${CUSTOMER_PAT}@github.com/${CUSTOMER_REPO}.git"
    git push --mirror customer
    git remote remove customer
```
`[CITED: git-scm.com/docs/git-push — "--mirror" forces the destination to exactly match the source: every ref (branches, tags) is pushed, and refs on the destination not present locally are DELETED. This is intentional per D-01 (full mirror) but is a real footgun if the customer repo is ever manually modified — any manual commit on the customer repo is silently wiped on the next mirror push.]`

**Pitfall (auth):** cross-repo pushes from a GitHub Actions job **cannot** use the job's own `secrets.GITHUB_TOKEN`, which is scoped to the triggering repo only `[CITED: multiple GitHub Actions community discussions on cross-repo push from GITHUB_TOKEN]`. A PAT (or deploy key) with `contents: write` on the target customer repo is required as a separate secret.

### Pattern 2: Per-customer secrets via a matrix-driven GitHub Environment (long form required)

**What:** Fan out one job across all `active` customers, each resolving its own Environment's secrets.
**When to use:** D-06/D-18 — any step needing a per-customer secret (mirror PAT, Supabase access token/project-ref/DB password).
**Example:**
```yaml
# Source: GitHub Actions docs (environments) + actions/runner issue #998 (short-form bug)
jobs:
  sync:
    needs: [read-manifest]
    strategy:
      fail-fast: false          # D-04's discretion: one customer's failure must not block others
      matrix:
        customer: ${{ fromJson(needs.read-manifest.outputs.active_customers) }}
    environment:
      name: ${{ matrix.customer.github_environment }}   # LONG FORM — short-form `environment: ${{ }}` with a matrix expression is a known actions/runner bug (#998)
    runs-on: [self-hosted, windows]
    steps:
      - run: echo "syncing ${{ matrix.customer.name }}"
```
`[CITED: github.com/actions/runner issue #998 — "Setting job environment dynamically doesn't work when using key-value format"; the object/long form `environment: { name: <expr> }` is the documented workaround]`

**Anti-pattern to avoid:** Putting a secret value itself inside the `matrix:` array. Matrix values are interpolated into job names/metadata **before** secret-masking is applied, so a secret placed there can leak in the Actions UI even though it's masked in logs `[CITED: GitHub community discussion #190708 on matrix secret exposure]`. Only put non-secret identifiers (customer name, environment name, repo slug) in the matrix; resolve actual secret values via `secrets.<NAME>` inside steps, scoped by the job's `environment:`.

### Pattern 3: `tauri-action` with two `--config` overrides

**What:** Merge the existing cert-thumbprint override AND the new per-customer identity override in one build.
**When to use:** D-06 — every customer build.
**Example:**
```yaml
# Source: v2.tauri.app/reference/cli/ (repeated -c/--config merges sequentially, later wins, RFC 7396 JSON Merge Patch)
- uses: tauri-apps/tauri-action@v0.6.2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    tagName: v__VERSION__
    releaseName: 'Supermarket POS v__VERSION__'
    includeUpdaterJson: true
    projectPath: .
    args: >-
      --config {"bundle":{"windows":{"certificateThumbprint":"${{ steps.gencert.outputs.thumbprint }}","digestAlgorithm":"sha256"}}}
      --config customers/${{ matrix.customer.name }}/tauri.override.json
```
`[CITED: v2.tauri.app/reference/cli/ — the -c/--config flag "can be repeated multiple times... configurations are merged sequentially... later specifications override earlier ones"]` `[ASSUMED: tauri-action's `args:` input is forwarded verbatim to the underlying `tauri build` invocation (documented only as "Additional arguments to the current tauri build command", not explicitly confirmed to support a repeated flag) — this is very likely correct given the action's existing single-`--config` usage already works today, but was not confirmed by reading `tauri-action`'s `dist/index.js` source this session. Recommend a `workflow_dispatch` dry-run smoke test before wiring this into the real fan-out job.]`

**Pitfall (array replacement, not merge):** RFC 7396 JSON Merge Patch replaces arrays **wholesale**, not element-by-element. `bundle.icon` is an array — the customer override's icon array fully replaces core's, which is the desired D-07 behavior, but this same behavior means any array field accidentally present in both the cert-override JSON and the customer override JSON would silently drop one side's entries. Keep the two override objects touching disjoint top-level keys (cert override → `bundle.windows.*`; customer override → `identifier`, `publisher`, `plugins.updater.endpoints`, `bundle.icon`) to avoid collision.

### Pattern 4: `customers.json` manifest read + gate (D-03/D-13/D-14)

```json
// customers/customers.json — Source: D-13 field list, this session's design
[
  {
    "name": "taj-house-of-spices",
    "repo": "zedfauji/supermarket-pos-taj",
    "status": "active",
    "supabase_project_ref": "mkvinyekkyennyegfoxq",
    "deployment_mode": "cloud",
    "github_environment": "taj-house-of-spices"
  }
]
```
```yaml
# read-manifest job — Source: this session's design, following verify-installer-integrity.ps1's
# ConvertFrom-Json convention for the equivalent PowerShell-side read
- id: filter
  shell: pwsh
  run: |
    $customers = Get-Content customers/customers.json -Raw | ConvertFrom-Json
    $active = $customers | Where-Object { $_.status -eq 'active' }
    $json = $active | ConvertTo-Json -Compress -AsArray
    echo "active_customers=$json" >> $env:GITHUB_OUTPUT
```

### Anti-Patterns to Avoid

- **Using `supabase link`/`--linked` in the fan-out loop:** the self-hosted runner's workspace persists across jobs/customers (confirmed pattern from Spike 009/010 and this repo's `.env.production` incident history) — `link`'s on-disk `.temp/project-ref` state is a cross-customer collision risk. Always pass `--project-ref <ref>` explicitly per invocation, never rely on a prior `link`.
- **Leaving materialized secrets/files on the self-hosted runner:** any per-customer `.env.production`, `tauri.override.json` copy, or PAT-embedded git remote URL must be cleaned up (git remote removed, temp files deleted) before the job ends — this exact class of bug already caused two real incidents this session (`broker.exe`, a locked native module) per the spike manifest's "Established Patterns" note.
- **Silent fallback to core defaults on a missing override file:** explicitly forbidden by D-08. The build step must check the override file exists **before** invoking `tauri-action` and hard-fail (non-zero exit) if not — don't rely on `tauri-action`/`tauri build` itself to surface a clear-enough error for a missing `--config` file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-customer secret isolation | A custom secrets-vault/encryption scheme in the repo | GitHub Environments (already validated, Spike 009) | Native, already proven in this repo, zero new infra |
| Cross-repo mirroring | A custom rsync/tarball-copy script between repos | `git push --mirror` | Git already does exact-mirror semantics correctly (refs, tags, history) in one command |
| JSON config merging for per-customer identity | A custom JSON-deep-merge script/JS build step | Tauri's built-in `-c/--config` (RFC 7396 merge patch), already used for the cert override | Zero new code; the merge engine ships inside the tool you're already invoking |
| Non-interactive Supabase migration confirmation | Piping `yes \|` into `supabase db push` (a documented but fragile workaround for a CLI bug) | The `--yes` **global flag** (`supabase db push --project-ref <ref> --yes`) `[VERIFIED: supabase CLI 2.116.0 --help output, this session — "--yes: answer yes to all prompts" is a global flag]` | The documented `yes \|` workaround exists because of an older CLI bug (github.com/supabase/cli#2238) with auto-detecting non-interactive shells through wrapper scripts; the current CLI's own `--yes` flag is the supported, direct fix |

**Key insight:** every mechanism this phase needs already exists natively in a tool this repo already depends on (`git`, `gh`, `supabase`, `tauri`, GitHub Actions). The entire phase is wiring, not invention — resist the temptation to add a marketplace action or custom script where 3-10 lines of the native tool's own flag does the job.

## Common Pitfalls

### Pitfall 1: GitHub Environments require a paid plan for private repos — and the core repo is currently PUBLIC
**What goes wrong:** GitHub Environments (and therefore environment-scoped secrets) are available on the Free plan **only for public repositories**; a private repo needs GitHub Pro, Team, or Enterprise to use Environments/environment secrets at all `[CITED: docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments — "For access to environments, environment secrets, and deployment branches in private or internal repositories, you must use GitHub Pro, GitHub Team, or GitHub Enterprise"]`.
**Why it happens:** This session ran `gh api repos/zedfauji/supermarket-pos` directly and the response includes `"private": false` `[VERIFIED: gh api repos/zedfauji/supermarket-pos this session, field "private": false]` — the core repo is **public today**, even though the spike manifest's branching-decision language says "one private core repo." If the intent is for core and/or customer repos to become private (likely, given they'll contain a customer's real business identity/updater config and this is a commercial product), D-06/D-09/D-18's entire GitHub-Environments-based secrets plan needs the account/org to be on a paid GitHub tier first.
**How to avoid:** Confirm the GitHub account/org plan (Free/Pro/Team/Enterprise) before planning assumes Environments work on private customer repos. If staying on Free, either (a) keep customer repos public (acceptable if their contents — code + generic build config — aren't actually sensitive, since the codebase itself is already effectively public today), or (b) upgrade the plan, or (c) fall back to plain repo-level secrets (not Environment-scoped) with a naming convention like `<CUSTOMER>_SUPABASE_URL` — loses the clean per-customer isolation Spike 009 validated, but works on Free/private.
**Warning signs:** `gh api -X PUT /repos/<owner>/<repo>/environments/<name>` returning a 4xx/plan-related error when run against a private customer repo.

### Pitfall 2: Job-level `environment:` short-form string doesn't resolve matrix expressions
**What goes wrong:** `environment: ${{ matrix.customer.github_environment }}` (short/string form) can silently fail to resolve or error with `Unrecognized named-value` depending on context, per a documented `actions/runner` bug.
**Why it happens:** GitHub Actions only reliably supports expressions in the **long/object form** of the `environment:` key (`environment: { name: <expr> }`) `[CITED: github.com/actions/runner issue #998]`.
**How to avoid:** Always use the object form when the environment name is matrix- or output-driven (see Pattern 2 above).
**Warning signs:** A fan-out job that works for a hardcoded single customer but fails/misresolves secrets once converted to a matrix.

### Pitfall 3: `--mirror` push deletes anything on the customer repo not present in core
**What goes wrong:** Any manual branch, tag, or commit made directly on a customer's mirrored repo is silently destroyed by the next scheduled mirror push.
**Why it happens:** `--mirror` is defined as making the destination refs **exactly** match the source — it's a superset of `--force` that also deletes remote-only refs `[CITED: git-scm.com/docs/git-push, `--mirror` section]`.
**How to avoid:** Document (in the D-09 onboarding runbook) that customer repos are strictly read-only mirrors — no one should ever commit directly to a customer repo. If a customer repo needs its own Actions run (per the architecture diagram — that's the whole point of the full-mirror model), those workflow files come from core too, not hand-edited on the customer side.
**Warning signs:** A customer repo shows commits with no corresponding commit in core's history.

### Pitfall 4: `supabase db push` hangs/silently no-ops in non-interactive CI without `--yes`
**What goes wrong:** The confirmation prompt before applying migrations either hangs a CI job waiting for stdin, or (per a documented CLI bug specific to wrapper-script invocation, github.com/supabase/cli#2238) doesn't auto-detect the non-interactive shell and doesn't apply the migration despite exiting 0.
**Why it happens:** `db push` prompts "Do you want to push these migrations?" by default; auto-yes-in-non-interactive-shell detection has a known gap when invoked through certain wrapper scripts.
**How to avoid:** Always pass the global `--yes` flag explicitly in CI: `supabase db push --project-ref <ref> --yes` `[VERIFIED: supabase CLI 2.116.0 --help output, this session]`. Never rely on TTY auto-detection.
**Warning signs:** A CI job that appears green but the customer's remote schema is stale.

### Pitfall 5: `tauri-action`'s multi-`--config` support is CLI-version-dependent, not action-version-dependent
**What goes wrong:** Assuming `tauri-action@v0.6.2`'s support for `--config` is fixed by the action's own version, when it's actually determined by whatever `@tauri-apps/cli` version `npm ci` resolves for `^2` in this project's `package.json`.
**Why it happens:** `tauri-action` shells out to the project's own local `tauri build` — it doesn't bundle its own CLI. The "repeat `--config` to merge multiple values" feature is a Tauri **CLI** feature (landed 2.4.0), not a `tauri-action` feature.
**How to avoid:** Confirm the resolved `@tauri-apps/cli` version in CI (`npx tauri --version` or check `package-lock.json`) is ≥ 2.4.0 before relying on the two-`--config` pattern. Given `^2` and today's date, this is almost certainly satisfied, but a lockfile pin to something older than 2.4.0 would silently break the merge.
**Warning signs:** The build succeeds but the customer identity fields are wrong in the built artifact (only the last/first `--config` value applied instead of a merge).

## Code Examples

### `onboard-customer.ps1` skeleton, matching this repo's `scripts/` conventions

```powershell
# Source: pattern derived from generate-build-cert.ps1 / verify-installer-integrity.ps1 /
# deploy-remote-backend.ps1 (this repo, read in full this session) — fail-fast Fail() helper,
# $ErrorActionPreference = 'Stop', Write-Host colored progress, idempotent state checks before
# every mutating step (D-12).
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$CustomerName,
    [Parameter(Mandatory)] [string]$SupabaseProjectRef
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

# --- Idempotent check: does the customer repo already exist? -------------------
$repoName = "supermarket-pos-$CustomerName"
$existing = gh repo view "zedfauji/$repoName" --json name 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK: repo zedfauji/$repoName already exists, skipping creation." -ForegroundColor Green
} else {
    gh repo create "zedfauji/$repoName" --private --confirm
    if ($LASTEXITCODE -ne 0) { Fail "gh repo create failed for $repoName." }
    Write-Host "OK: created zedfauji/$repoName" -ForegroundColor Green
}

# --- Idempotent check: does the GitHub Environment already exist? --------------
$envCheck = gh api "repos/zedfauji/supermarket-pos/environments/$CustomerName" 2>$null
if ($LASTEXITCODE -ne 0) {
    gh api -X PUT "repos/zedfauji/supermarket-pos/environments/$CustomerName"
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create GitHub Environment '$CustomerName'." }
    Write-Host "OK: created GitHub Environment '$CustomerName'." -ForegroundColor Green
} else {
    Write-Host "OK: GitHub Environment '$CustomerName' already exists." -ForegroundColor Green
}

# ... secret-setting (gh secret set --env $CustomerName), override-file scaffolding,
#     customers.json entry upsert (Get-Content -Raw | ConvertFrom-Json, mutate, ConvertTo-Json,
#     Set-Content — same idiom as verify-installer-integrity.ps1's tauri.conf.json read) follow
#     the same "check state -> skip or create" idempotent pattern per D-12.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `--config` merge (cert thumbprint only) | Multiple sequential `--config` merges | `@tauri-apps/cli` 2.4.0 | Enables D-06's per-customer override to coexist with the existing cert-signing override without pre-merging JSON by hand |
| `.env.production` hand-placed on the build machine | GitHub Environment secrets, materialized at build time and deleted at job end | This phase + `migrate-env-production-to-github-environment.md` (D-18) | Removes the loose-plaintext-file credential-hygiene gap flagged in that todo |
| One repo-wide `/releases/latest` | One `/releases/latest` per customer repo (full mirror) | This phase (Spike 007 invalidated the single-repo-with-workaround-endpoints approach) | Each customer's Tauri updater only ever sees their own releases — no cross-customer version bleed |

**Deprecated/outdated:** The `yes | supabase db push` shell-pipe workaround (still referenced in some community discussions for github.com/supabase/cli#2238) — superseded by the CLI's own `--yes` global flag, confirmed present in the currently-installed 2.116.0.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tauri-action`'s `args:` input forwards a string containing two `--config ...` flags verbatim to the underlying `tauri build` call (not independently confirmed by reading the action's source this session) | Architecture Patterns, Pattern 3 | If wrong, the plan needs an explicit pre-merge-JSON-with-jq step instead of relying on two `--config` flags in one `args:` string. Low risk — existing single-`--config` usage already proves `args:` forwarding works; the open question is only whether *repeating* the flag survives whatever quoting/splitting `tauri-action` does internally. Mitigate with a `workflow_dispatch` smoke-test task early in the plan. |
| A2 | A fine-grained PAT (repo-scoped, `contents: write`) is the recommended auth mechanism for the mirror-push, over an SSH deploy key | Standard Stack, Alternatives Considered | If the team prefers deploy keys for security-posture reasons, `onboard-customer.ps1` needs an `ssh-keygen` + `gh repo deploy-key add` step instead of a PAT-creation step — moderate rework, contained to one script section. |
| A3 | GitHub Environments require Pro/Team/Enterprise specifically for **private** repos — confirmed by GitHub's own docs, but the exact plan tier of this project's GitHub account/org was not independently determined this session (the `gh api user` call did not return a usable `plan` field with this token's scopes) | Common Pitfalls, Pitfall 1 | If the account is already Pro/Team/Enterprise, this is a non-issue. If it's Free and customer repos are meant to be private, D-06/D-18's Environment-secrets plan is blocked until the plan is upgraded or an alternative (plain repo secrets, or public customer repos) is chosen. This is the single highest-impact unresolved item — flag for user confirmation before planning locks in the Environments-based secrets design. |

## Open Questions

1. **Is the core repo (and are customer repos) meant to be private?**
   - What we know: This session's `gh api` call shows the core repo (`zedfauji/supermarket-pos`) is currently **public** (`"private": false`), which contradicts the spike manifest's "one private core repo" framing.
   - What's unclear: Whether this is intentional (repo was made public for some other reason and should be made private before this phase ships) or whether "private" in the spike manifest was aspirational/inaccurate.
   - Recommendation: Surface this to the user explicitly before planning locks in a GitHub-Environments-based secrets design, since Environments on private repos require a paid plan (Pitfall 1). If the account is already Pro/Team/Enterprise this is moot; if not, this changes the secrets-storage design.

2. **PAT vs. deploy key for the mirror-push auth, and PAT expiry/rotation policy**
   - What we know: A PAT is simpler to script end-to-end in `onboard-customer.ps1` (Claude's Discretion per CONTEXT.md).
   - What's unclear: Whether the team wants a fine-grained PAT with an expiry date (requiring a rotation reminder/process) or a classic PAT (no expiry, broader blast radius if leaked).
   - Recommendation: Default to a fine-grained PAT scoped only to `contents: write` on the specific customer repo, and note the expiry-rotation gap as a follow-up todo rather than blocking this phase — matches the project's existing pattern of filing hygiene gaps as `.planning/todos/pending/*` rather than gold-plating every credential lifecycle in the first pass.

3. **Does `tauri-action@v0.6.2` reliably forward two `--config` flags?** (see Assumption A1) — resolve with an early smoke-test task in the plan (`workflow_dispatch` a throwaway build with two `--config` args, inspect the built `latest.json`/binary for both merged values) before wiring the fan-out into the real release path.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `git` | Mirror-push mechanism (D-01/D-02) | ✓ (dev machine, this session) | 2.52.0 | — (also present on the self-hosted CI runner today, since `actions/checkout@v4` already works there) |
| `gh` CLI | `onboard-customer.ps1` (D-09), repo/Environment/secret creation | ✓ (dev machine, this session) | 2.83.1 | — |
| `supabase` CLI | Migration fan-out (D-10), existing `deploy-remote-backend.ps1` | ✓ (dev machine, this session) | 2.116.0 | — |
| `@tauri-apps/cli` (`^2`) | Multi-`--config` merge (D-06) | ✓ (project dependency, `package.json`) | resolves ≥2.4.0 under `^2` at time of research | — |
| Self-hosted Windows runner tool availability (`git`/`gh`/`supabase` on the actual CI runner, not just this dev machine) | All CI-side steps | Not independently verified this session — `git`/PowerShell are confirmed present (existing `release.yml`/`ci.yml` steps use them), but `gh` and `supabase` CLI presence on the runner itself was not checked | — | If missing on the runner, add a `setup` step (`gh`/`supabase` both ship official install scripts / GitHub Actions `setup-*` actions) before the fan-out step |
| GitHub Environments support for private repos (org/account plan tier) | D-06/D-18 secrets isolation | **Unresolved — see Open Question 1** | — | Plain repo-level secrets with a `<CUSTOMER>_` naming prefix, if the plan tier blocks Environments |

**Missing dependencies with no fallback:** None identified as hard-blocking — the plan-tier question (Open Question 1) has a documented fallback (plain repo secrets) even if unresolved favorably.

**Missing dependencies with fallback:** `gh`/`supabase` CLI on the self-hosted runner (fallback: add setup steps); GitHub Environments on a Free-plan private repo (fallback: repo-level secrets).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None of this repo's existing frameworks (Vitest/Playwright) apply directly — this phase is CI/CD YAML + PowerShell, not application code. Per CLAUDE.md's mandatory-automation policy, "verification" here means **automated dry-runs and scripted assertions**, not a human clicking through GitHub's UI. |
| Config file | none — see Wave 0 |
| Quick run command | `pwsh -File scripts/onboard-customer.ps1 -CustomerName test-customer -SupabaseProjectRef <test-ref> -WhatIf` (a `-WhatIf`/dry-run switch is the automatable substitute for "click through the onboarding flow and see if it worked") |
| Full suite command | A `workflow_dispatch`-triggered run of the extended `release.yml` against a disposable test customer repo, asserting the built installer contains the test customer's identity strings (reusing `verify-installer-integrity.ps1`'s existing `Select-String`-against-`dist/assets` pattern, extended to also check the merged `identifier`/`publisher` in the build output) |

### Phase Requirements → Test Map

| D-# | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|---------------------|--------------|
| D-01/D-02 | Mirror-push reaches a customer repo, gated by manifest | integration (real `git push --mirror` against a disposable test repo) | new: a throwaway `gh repo create ... --private` target repo, run the sync step against it, assert via `gh api repos/<test-repo>/branches` that `main` matches core's HEAD SHA | ❌ Wave 0 |
| D-03/D-04 | `suspended` customer is skipped by the fan-out | unit-equivalent (script/logic test) | new: a Pester-style or plain PowerShell assertion script that feeds a fixture `customers.json` with one active + one suspended entry into the manifest-read logic and asserts only the active one appears in the matrix output | ❌ Wave 0 |
| D-06/D-08 | Missing override file fails the build loudly | integration | new: run the build step against a customer name with no `tauri.override.json` present, assert non-zero exit and a specific error string (not a silent fallback) | ❌ Wave 0 |
| D-12 | Onboarding script is idempotent (safe re-run) | integration | new: run `onboard-customer.ps1` twice in a row against the same disposable customer name, assert the second run exits 0 with "already exists"-style OK messages, not errors or duplicate resources | ❌ Wave 0 |
| D-16/D-17 | Taj's identifier/publisher/updater endpoint are preserved verbatim in the override file | unit-equivalent | new: a script assertion comparing `customers/taj-house-of-spices/tauri.override.json`'s three fields byte-for-byte against the values currently hardcoded in `src-tauri/tauri.conf.json` (`com.tajhouseofspices.supermarketpos`, `Taj House of Spice Supermarket POS`, the `github.com/zedfauji/supermarket-pos/releases/latest/...` endpoint) `[VERIFIED: src-tauri/tauri.conf.json:5,32,54 this session — identifier: "com.tajhouseofspices.supermarketpos", publisher: "Taj House of Spice Supermarket POS", endpoints: ["https://github.com/zedfauji/supermarket-pos/releases/latest/download/latest.json"]]` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the relevant script's fail-fast self-check (matching the existing `Fail()`-helper pattern already used by every `scripts/*.ps1` in this repo) against a disposable/test target, never against the real Taj production repo or a real customer.
- **Per wave merge:** A full `workflow_dispatch` dry-run of the extended `release.yml` against one disposable test customer end-to-end (mirror-push + build + `--config` merge verification), before touching the real Taj retrofit (D-17's parallel-run requirement).
- **Phase gate:** D-17's parallel-run verification (real signed installer + real update cycle through the new path, for the real Taj customer) must pass before the old direct-from-core `release.yml` path is retired.

### Wave 0 Gaps

- [ ] A disposable/throwaway "test customer" repo + GitHub Environment, created once and reused across every dry-run in this phase (never test against Taj's real repo until D-17's parallel-run stage)
- [ ] A small PowerShell assertion harness for the manifest-filtering logic (D-03/D-04) and the idempotency checks (D-12) — this repo has no `Pester` dependency today; a plain `$ErrorActionPreference = 'Stop'` + `Fail()`-helper script (matching every existing `scripts/*.ps1`) is sufficient, no need to introduce a PowerShell test framework for this
- [ ] Extend `verify-installer-integrity.ps1` (or a sibling script) with the identifier/publisher assertion described in the D-16/D-17 test-map row above

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | No user-facing auth surface in this phase |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | GitHub Environment scoping (one customer cannot resolve another's secrets — validated by Spike 009) is the access-control boundary for this phase; `gh api` calls in `onboard-customer.ps1` require the operator's own `repo`/`admin:org`-scoped token, not a new app-level RBAC concept |
| V5 Input Validation | Yes | `customers.json` fields (`status` enum, `repo` slug format) should be validated before being fed into `gh`/`git` commands run with shell interpolation — un-validated customer-controlled strings interpolated into a shell command is a real injection surface even in ops tooling |
| V6 Cryptography | Yes | The existing `TAURI_SIGNING_PRIVATE_KEY`/pubkey trust chain and self-signed cert mechanism (Phase 20) are unchanged by this phase — never hand-roll a new signing mechanism per customer; every customer's installer is still signed with the same build-time-generated cert per `generate-build-cert.ps1`'s existing pattern, and updater trust uses the same Tauri pubkey/private-key pair (per-customer `updater.endpoints` differ, but the signature keypair does not need to differ per customer since it verifies artifact integrity, not customer identity) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Command/shell injection via `customers.json` fields interpolated into `git`/`gh` shell commands | Tampering | Validate `name`/`repo` fields against a strict allow-list regex (e.g. `^[a-z0-9-]+$`) before using them to construct repo names, remote URLs, or shell commands; never pass raw manifest strings straight into `Invoke-Expression`/backtick-string shell commands |
| A leaked mirror-push PAT granting write access beyond the intended single customer repo | Elevation of Privilege | Fine-grained PAT scoped to exactly one repo's `contents: write` (see Assumption A2) — never a classic PAT with broad `repo` scope for this purpose, since a classic PAT leak would expose every repo the account can write to, not just one customer |
| Stale materialized secret files (`.env.production`, PAT-embedded git remote URL) left on the self-hosted runner's persistent workspace | Information Disclosure | Explicit cleanup step at job end (git remote removal, `Remove-Item` on any materialized secret file) — this exact risk class is already documented in this repo's own incident history (Spike 009 findings, `broker.exe`/locked-native-module precedent) |
| A wrong/missing per-customer override silently shipping the wrong updater endpoint to a customer | Tampering (of update integrity, at the operational level) | D-08's fail-loud-on-missing-override requirement is itself the mitigation — already locked as a decision, just confirming it maps to a real threat, not just a UX nicety |

## Sources

### Primary (HIGH confidence — tool-verified this session)
- `gh --version`, `supabase --version`, `git --version` (this session, local dev machine)
- `supabase db push --help` (this session — confirmed `--project-ref` and global `--yes` flags directly from the installed 2.116.0 CLI)
- `gh api repos/zedfauji/supermarket-pos` (this session — confirmed `"private": false`)
- `D:\Projects\Code\supermarket-pos\.github\workflows\release.yml`, `ci.yml`, `src-tauri\tauri.conf.json`, `windows\hooks.nsh`, `scripts\generate-build-cert.ps1`, `scripts\verify-installer-integrity.ps1`, `scripts\deploy-remote-backend.ps1`, `scripts\backup-db.sh` (all read in full this session)

### Secondary (MEDIUM confidence — official docs, WebFetch/WebSearch this session)
- `v2.tauri.app/reference/cli/` — `-c/--config` repeated-flag merge semantics
- `v2.tauri.app/reference/config/` — `identifier` field purpose (bundle ID, webview data dir path)
- `v2.tauri.app/plugin/updater/` — endpoint placeholders, pubkey trust chain, `latest.json` shape
- `git-scm.com/docs/git-push` — `--mirror` exact-match/deletion semantics
- `docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments` — Environments plan-tier requirement for private repos
- `github.com/tauri-apps/tauri/pull/12970` — multi-`--config` merge shipped in `@tauri-apps/cli` 2.4.0
- `cli.github.com/manual/gh_secret_set`, `gh_repo_create` — `gh secret set --env`, `gh repo create --source=. --push`

### Tertiary (LOW confidence — community discussions, flagged for validation)
- `github.com/actions/runner` issue #998 — short-form `environment:` + matrix expression bug (widely corroborated across multiple community threads, but not an official GitHub docs statement)
- `github.com/supabase/cli` issue #2238 — non-interactive `db push` prompt-detection gap (superseded by the confirmed `--yes` global flag, so low residual risk)
- Whether `tauri-action`'s `args:` forwards a repeated `--config` flag verbatim (Assumption A1 — recommend a smoke test rather than trusting this as fact)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every tool is already in this repo's dependency graph, versions tool-verified this session
- Architecture: MEDIUM — the fan-out/matrix/Environment pattern is standard GitHub Actions practice, but the specific two-`--config`-flags-in-one-args-string claim (Assumption A1) is unverified
- Pitfalls: HIGH for the plan-tier and `--mirror`/`environment:`-short-form findings (directly tool-verified or docs-cited this session); MEDIUM for the `tauri-action` args-forwarding pitfall

**Research date:** 2026-09-01
**Valid until:** 30 days (CI/CD tooling, GitHub platform features, and Tauri CLI behavior are relatively stable, but re-verify the GitHub plan-tier fact and the `@tauri-apps/cli` resolved version at plan time since both can change between now and execution)
