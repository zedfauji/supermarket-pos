# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the
question requires otherwise.

## Stack

- **Windows service/broker spikes**: Rust, matching `src-tauri`'s existing stack. Reuse the
  project's `windows` crate (`Win32_Foundation`, `Win32_Graphics_Printing`, `Win32_Graphics_Gdi`)
  and its `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` pattern from
  `src-tauri/src/commands/printer.rs` rather than re-deriving raw-print logic.
- HTTP: `tiny_http` (blocking, single dependency, fast to compile) — not `axum`/`tokio`, for spike
  speed. Not necessarily the production choice.
- Durable local ledger: `rusqlite` with the `bundled` feature (no system SQLite dependency),
  `journal_mode=WAL`, `synchronous=FULL`.

## Structure

- Spike Windows-service binaries live in `.planning/spikes/NNN-name/broker/` as their own Cargo
  workspace (own `Cargo.toml`), never added to the main `src-tauri` workspace — keeps spike code
  fully isolated from the shipped app.
- Runtime data (SQLite ledger, logs) goes under `%ProgramData%\<ServiceName>\`, never the exe's own
  directory — a real Windows Service's working directory is not guaranteed stable/writable.

## Patterns

- **Real Windows Service install for a spike**: use `nssm install <name> <exe-path>` +
  `nssm set <name> Start SERVICE_AUTO_START` + `nssm start <name>` rather than hand-writing a
  `windows-service`-crate SCM handler — faster to stand up, and still produces a genuine SCM-managed
  process (`SessionId = 0`, survives logoff, auto-restarts). Verify it's actually the service (not
  a leftover manually-started process squatting the same port) via
  `Get-CimInstance Win32_Process -Filter "Name='<exe>'"` and checking `SessionId`/`ParentProcessId`
  — session 0 + a services-tree parent means real service; session 1 + a shell parent means a
  stray manual process.
- **Elevation boundary**: this agent's shell tools are not elevated. Any step needing admin
  (service install/start/stop, `Stop-Service`/`Start-Service` on system services like `Spooler`,
  removing SYSTEM-owned files) must be handed to the user as an explicit copy-paste block for
  their own elevated terminal, with a clear "tell me when done" checkpoint before continuing.
- **Printer test targets**: prefer a locally-owned printer object pointing at a file-backed local
  port (`Add-PrinterPort -Name <writable-path>`; `Add-Printer -DriverName "Generic / Text Only"`)
  for controlled, byte-verifiable success-path tests. Use it alongside — not instead of — a real
  physical printer for at least one end-to-end real-hardware confirmation; file-backed ports can
  complete/purge from the spooler faster than real hardware, which is itself a useful timing
  finding but not representative of every fault mode.
- **Fault injection via real system state**: stop/start the real `Spooler` service (not a mock) to
  prove OpenPrinter-failure handling; make the SQLite file read-only (`attrib +R`) to prove
  persistence-failure handling; kill the broker process (`taskkill /F`) mid-flight, read the SQLite
  ledger directly to confirm durable state, then relaunch to prove restart recovery — all real,
  not simulated.

## Structure (Node/logic spikes)

- Standalone Node scripts in a spike folder must use `.cjs`, not `.js` — the project root
  `package.json` sets `"type": "module"`, so a plain `.js` file run with `node` fails with
  `ReferenceError: module is not defined in ES module scope`.
- A spike that needs a runnable self-check uses a `require.main === module` guarded `demo()`
  block with `assert` — no test framework — printing a pass/fail summary plus key metrics (e.g.
  catch-rate percentages), not just "it works."

## Structure (Web/UI spikes)

- A single static `.html` file with inline `<style>`/`<script>`, no bundler — matches
  CONVENTIONS' "hardcode everything" rule. Cross-spike logic (e.g. a validation algorithm) is
  ported inline into the HTML rather than shared via a `<script src>`, since spikes are meant to
  stand alone.
- `file://` URLs are blocked by the Chrome automation extension's permission model. To verify a
  static-HTML spike via browser automation, serve it first: `python -m http.server <port>` from
  the spike's directory, then navigate to `http://127.0.0.1:<port>/<file>.html`.
- Never use native `alert()`/`confirm()`/`prompt()` in a spike's UI — they freeze the Chrome
  automation session (hard rule) and don't match this app's `ConfirmDialog`-style modal pattern
  anyway. Use a custom `<dialog>` element instead, even in a throwaway spike.
- Per CLAUDE.md's UAT policy, drive interactive UI spikes yourself via the Chrome automation
  extension (click through every state, verify with screenshots/console) rather than asking the
  user to click through and report back — this applies to spike verification, not just the
  shipped app.

## Structure (GitHub Actions/API infra spikes)

- For a spike question that's really "what does GitHub's platform actually do" (Releases scoping,
  Environments/secrets isolation, Actions behavior), prefer a real throwaway private scratch repo
  under the user's own `gh` account over docs-only reasoning when the behavior is easy to trigger
  live (`gh repo create ... --private`, tag a few releases, dispatch a workflow) — confirm with the
  user first since it's a visible action on their account, and delete it at the end. Requires the
  `delete_repo` token scope to clean up automatically; if missing, tell the user the repo is still
  there and give them the URL rather than silently leaving it undisclosed.
- Never make a workflow step try to reveal a real secret's value, even in a throwaway repo — GitHub
  masks it anyway. Prove isolation/behavior by comparing the secret against a known expected value
  and emitting only `MATCH`/`MISMATCH` (or similar non-secret derived output).
- For a Tauri config-merge question, don't run a full `tauri build --config <file>` if the thing
  being tested is Rust-side only — `beforeBuildCommand` (a full `npm run build`) re-runs every time
  and dominates the wall-clock. Use `TAURI_CONFIG='<json>' cargo build` inside `src-tauri/` instead
  (same merge code path, skips the frontend entirely), and read the result off the compiled binary's
  real Windows version resource (`(Get-Item exe).VersionInfo`), not a simulated/re-implemented merge.
- Confirm any resource the build script hard-requires (e.g. this project's bundled `broker.exe`)
  already exists locally before attempting a build for spike purposes — a missing one fails with an
  unrelated error that looks like the thing being spiked is broken.

## Tools & Libraries

- `nssm` (via `winget`) — Windows Service wrapper for spike-speed service installs. Not a
  production dependency decision; the real build should evaluate the `windows-service` crate or
  an installer-driven SCM registration instead of carrying an nssm dependency.
- `rusqlite = { version = "0.31", features = ["bundled"] }` — worked cleanly, no system SQLite
  needed.
- `tiny_http = "0.12"` — sufficient for spike-scale single-threaded request handling.
