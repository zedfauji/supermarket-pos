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

## Tools & Libraries

- `nssm` (via `winget`) — Windows Service wrapper for spike-speed service installs. Not a
  production dependency decision; the real build should evaluate the `windows-service` crate or
  an installer-driven SCM registration instead of carrying an nssm dependency.
- `rusqlite = { version = "0.31", features = ["bundled"] }` — worked cleanly, no system SQLite
  needed.
- `tiny_http = "0.12"` — sufficient for spike-scale single-threaded request handling.
