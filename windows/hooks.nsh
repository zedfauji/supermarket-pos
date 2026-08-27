; windows/hooks.nsh — Tauri v2 NSIS post-install hook for the store print
; broker (Phase 19: Store-Local Durable Printing Service).
;
; Tauri v2 does NOT support !include for a second local .nsh file — the full
; macro body must live in this one file (19-RESEARCH.md Pattern 5).
;
; Idempotent across both fresh install AND upgrade (Pitfall 6 — Tauri's NSIS
; externalBin/resource handling doesn't guarantee a sidecar binary is always
; replaced on reinstall, so this hook is written to be safely re-runnable
; rather than assuming a one-shot fresh install):
;   - `broker.exe install` no-ops the per-store secret generation when
;     client-secret.txt already exists (broker/src/config.rs::load_or_init),
;     and no-ops SCM registration when the service already exists
;     (broker/install/mod.rs — ERROR_SERVICE_EXISTS is treated as success).
;   - `netsh advfirewall firewall add rule` with an identical rule name is
;     itself idempotent (netsh replaces/no-ops a duplicate named rule rather
;     than erroring).
;   - `sc.exe start` on an already-running service is a documented no-op exit
;     code, not a failure.
!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\broker\broker.exe" install'
  ExecWait 'netsh advfirewall firewall add rule name="Store Print Broker" dir=in action=allow program="$INSTDIR\broker\broker.exe" protocol=TCP localport=8973 profile=private'
  ExecWait 'sc.exe start PrintBrokerService'
!macroend
