# Onboarding a New Customer

Phase 26 (Multi-Customer Deployment) runbook for bringing customer N+1 onto the
mirror-push + per-customer-override model. `scripts/onboard-customer.ps1`
handles every step that CAN be automated (D-09); this doc covers the steps
D-10 explicitly keeps manual, plus the exact order to run everything in.

`scripts/onboard-customer.ps1` never triggers the customer's first release and
never marks them `active` (D-11) - the last two steps below are the operator's
own explicit action, done only once every earlier step is verified correct.

## Prerequisites

- `gh` CLI installed and authenticated locally (`gh auth status`) with an
  account that has admin access to `zedfauji/supermarket-pos` (repo/Environment
  creation, secret setting).
- `supabase` CLI installed and authenticated locally (`supabase login`).

## Steps

### 1. Create the new customer's Supabase project (manual, D-10)

Create a new Supabase project for this customer, either via the
[Supabase dashboard](https://supabase.com/dashboard) or:

```bash
supabase projects create <project-name> --org-id <your-org-id>
```

Note the project's ref (e.g. `abcdefghijklmnop`) - you'll need it for every
step below.

### 2. Push the schema to the new project (manual, D-10)

```bash
supabase db push --project-ref <ref> --yes
```

Always pass `--yes` explicitly - never rely on TTY auto-detection to confirm
the migration prompt (see RESEARCH.md Pitfall 4: a non-interactive shell can
silently hang or no-op without it).

### 3. Mint a fine-grained PAT for the mirror-push (manual, D-09/D-10)

`gh` cannot mint a fine-grained PAT itself (26-COVERAGE.md: OPT-OUT, GitHub UI
only) - this step is done in the browser:

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Resource owner: `zedfauji`. Repository access: **Only select repositories**
   → select the new customer repo (`zedfauji/supermarket-pos-<name>` - the
   script creates this repo in step 4 below if it doesn't already exist, so
   you may need to run step 4 first and come back to mint the token, or create
   an empty placeholder repo manually before minting).
3. Repository permissions: **Contents: Read and write** (nothing else needed).
4. Generate and copy the token value - you will paste it once, as a
   `SecureString` prompt, in step 4. It is never stored in plaintext anywhere
   in this repo or your shell history.

### 4. Run the onboarding script

```powershell
pwsh -File scripts/onboard-customer.ps1 `
  -CustomerName <name> `
  -SupabaseProjectRef <ref> `
  -CustomerMirrorPat (Read-Host -AsSecureString "Paste the fine-grained PAT")
```

`<name>` must match `^[a-z0-9-]+$` (lowercase letters, digits, hyphens only).
This creates the customer's GitHub repo (skip if it already exists from step
3), a GitHub Environment on the core repo, stores the PAT as that
Environment's `CUSTOMER_MIRROR_PAT` secret, scaffolds
`customers/<name>/tauri.override.json` + a starting-point icon set, and adds
`customers/<name>` to `customers.json` with `"status": "suspended"`. Safe to
re-run (D-12) if any step fails partway through.

### 5. Replace the scaffolded identity with the customer's real values

Edit `customers/<name>/tauri.override.json`:
- `identifier` - replace the `com.example.<name>` placeholder with the
  customer's real bundle identifier.
- `bundle.publisher` - replace with the customer's real publisher name.
- `bundle.icon` - replace the 5 files copied into `customers/<name>/icons/`
  from `src-tauri/icons/` with the customer's real branded icon set (same 5
  filenames: `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
  `icon.ico`).

`plugins.updater.endpoints` is already correct - no edit needed.

### 6. Activate the customer

```bash
# In customers/customers.json, flip this entry's status:
#   "status": "suspended"  ->  "status": "active"
git add customers/customers.json customers/<name>/
git commit -m "feat: activate customer <name>"
git push
```

The first sync happens naturally on the **next tagged release** - there is no
separate "trigger first release" command, and none should be invented (D-11).
Every subsequent release follows the exact same path.
