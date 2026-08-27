//! Delivery worker: WinSpool submission (`win_print`), the immediate
//! post-submit poll, and periodic reconciliation. Ported verbatim from the
//! spike (.planning/spikes/001-windows-print-broker/broker/src/main.rs:284-507)
//! — including the "Ok(None) => mark 'unknown', never resubmit" branch, the
//! single most safety-critical line in this module (PRN-06/PRN-07).

use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection};

use crate::config::{self, BrokerConfig};
use crate::ledger::{now_iso, open_db, record_event};
use crate::retry::{self, RetryDecision};

pub const JOB_STATUS_PRINTED: u32 = 0x0000_0080;
pub const JOB_STATUS_ERROR: u32 = 0x0000_0002;
pub const JOB_STATUS_DELETED: u32 = 0x0000_0100;
pub const JOB_STATUS_PRINTING: u32 = 0x0000_0010;

#[cfg(target_os = "windows")]
pub mod win_print {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, DOC_INFO_1W, EndDocPrinter, GetJobW, JOB_INFO_1W, OpenPrinterW,
        PRINTER_HANDLE, StartDocPrinterW, WritePrinter,
    };

    /// Sends RAW bytes to an explicitly NAMED printer queue (never the
    /// default) and returns the Win32 spooler job id for later reconciliation.
    pub fn send_raw_named(printer_name: &str, bytes: &[u8]) -> Result<u32, String> {
        let name = HSTRING::from(printer_name);
        let mut handle = PRINTER_HANDLE::default();
        unsafe {
            OpenPrinterW(&name, &mut handle, None)
                .map_err(|e| format!("OpenPrinter('{printer_name}') failed: {}", e.message()))?;
        }
        let mut doc_name: Vec<u16> = "PrintBrokerJob\0".encode_utf16().collect();
        let mut datatype: Vec<u16> = "RAW\0".encode_utf16().collect();
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };
        let job = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
        if job == 0 {
            let _ = unsafe { ClosePrinter(handle) };
            return Err(
                "StartDocPrinter failed (job id 0) — spooler likely stopped or printer unreachable"
                    .to_string(),
            );
        }
        let mut written: u32 = 0;
        let ok = unsafe {
            WritePrinter(
                handle,
                bytes.as_ptr().cast(),
                bytes.len() as u32,
                std::ptr::addr_of_mut!(written),
            )
        };
        unsafe {
            let _ = EndDocPrinter(handle);
            let _ = ClosePrinter(handle);
        }
        if ok.0 == 0 || written != bytes.len() as u32 {
            return Err("WritePrinter failed or incomplete write".to_string());
        }
        Ok(job)
    }

    /// Queries the spooler for a job's current status bits. Returns None if
    /// the spooler no longer knows about the job (ambiguous: could mean
    /// long-completed-and-purged, or lost — caller must NOT treat that as
    /// success or blindly resubmit).
    pub fn query_job_status(printer_name: &str, win32_job_id: u32) -> Result<Option<u32>, String> {
        let name = HSTRING::from(printer_name);
        let mut handle = PRINTER_HANDLE::default();
        unsafe {
            OpenPrinterW(&name, &mut handle, None)
                .map_err(|e| format!("OpenPrinter('{printer_name}') failed: {}", e.message()))?;
        }
        let mut needed: u32 = 0;
        let mut buf: Vec<u8> = Vec::new();
        unsafe {
            let _ = GetJobW(handle, win32_job_id, 1, None, &mut needed);
            if needed > 0 {
                buf.resize(needed as usize, 0);
                let ok = GetJobW(handle, win32_job_id, 1, Some(&mut buf), &mut needed);
                let _ = ClosePrinter(handle);
                if ok.0 == 0 {
                    return Ok(None);
                }
                let info = &*(buf.as_ptr() as *const JOB_INFO_1W);
                return Ok(Some(info.Status));
            }
            let _ = ClosePrinter(handle);
        }
        Ok(None)
    }
}

/// Loads the current `BrokerConfig` (data-driven retry policy + retention
/// window, D-10/D-14) once for this tick and delegates. Kept separate from
/// `worker_tick_with_config` so tests can inject a fixture config directly
/// instead of racing against the real `%ProgramData%\PrintBroker\`
/// filesystem path.
pub fn worker_tick(conn: &Connection) {
    let cfg = config::load_or_init();
    worker_tick_with_config(conn, &cfg);
}

pub fn worker_tick_with_config(conn: &Connection, cfg: &BrokerConfig) {
    // Delivery pass: everything status='accepted'.
    let mut stmt = conn
        .prepare("SELECT id, printer_name, payload, attempts FROM jobs WHERE status = 'accepted'")
        .unwrap();
    let rows: Vec<(String, String, Vec<u8>, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    for (id, printer_name, payload, attempts) in rows {
        #[cfg(target_os = "windows")]
        let outcome = win_print::send_raw_named(&printer_name, &payload);
        #[cfg(not(target_os = "windows"))]
        let outcome: Result<u32, String> = Err("non-windows host".to_string());

        let ts = now_iso();
        match outcome {
            Ok(win32_job_id) => {
                conn.execute(
                    "UPDATE jobs SET status='submitted_to_os', win32_job_id=?1, attempts=attempts+1, updated_at=?2, last_checked_at=?2, last_error=NULL WHERE id=?3",
                    params![win32_job_id, ts, id],
                )
                .ok();
                record_event(conn, &id, "submitted_to_os", &format!("win32_job_id={win32_job_id}"));

                // Immediate follow-up check: some jobs complete and get purged
                // from the spooler faster than the periodic reconciliation
                // sweep can see them. Tight retry loop (0/10/20/40/80ms)
                // instead of one fixed delay — a single sleep either
                // overshoots (job already purged) or undershoots (not yet
                // terminal).
                let mut caught = false;
                for delay_ms in [0u64, 10, 20, 40, 80] {
                    if delay_ms > 0 {
                        std::thread::sleep(Duration::from_millis(delay_ms));
                    }
                    #[cfg(target_os = "windows")]
                    let quick_check = win_print::query_job_status(&printer_name, win32_job_id);
                    #[cfg(not(target_os = "windows"))]
                    let quick_check: Result<Option<u32>, String> = Ok(None);
                    if let Ok(Some(bits)) = quick_check {
                        if bits & JOB_STATUS_PRINTED != 0 || bits & JOB_STATUS_ERROR != 0 {
                            let ts2 = now_iso();
                            if bits & JOB_STATUS_PRINTED != 0 {
                                conn.execute("UPDATE jobs SET status='os_reported_printed', updated_at=?1, last_checked_at=?1 WHERE id=?2", params![ts2, id]).ok();
                                record_event(
                                    conn,
                                    &id,
                                    "os_reported_printed",
                                    &format!("caught by immediate post-submit check after {delay_ms}ms (JOB_STATUS_PRINTED)"),
                                );
                            } else {
                                conn.execute("UPDATE jobs SET status='failed', updated_at=?1, last_checked_at=?1, last_error='spooler reported JOB_STATUS_ERROR' WHERE id=?2", params![ts2, id]).ok();
                                record_event(
                                    conn,
                                    &id,
                                    "os_reported_failed",
                                    &format!("caught by immediate post-submit check after {delay_ms}ms (JOB_STATUS_ERROR)"),
                                );
                            }
                            caught = true;
                            break;
                        }
                        // still pending/printing — keep retrying within the tight loop.
                    } else {
                        // Job already gone from the spooler. If this happened
                        // at delay_ms == 0, it purged faster than this
                        // process can react at all — a real timing property
                        // of fast/local delivery, not a bug. Leave it for the
                        // periodic sweep to classify as 'unknown' rather than
                        // guessing here.
                        break;
                    }
                }
                let _ = caught;
            }
            Err(e) => {
                // D-10: classify then apply the config-driven per-failure-
                // class policy instead of the removed hardcoded MAX_ATTEMPTS.
                let decision = retry::decide(retry::classify_failure(&e), attempts, &cfg.retry);
                match decision {
                    RetryDecision::MarkFailed { attempts: final_attempts, event_category } => {
                        conn.execute(
                            "UPDATE jobs SET status='failed', attempts=?1, updated_at=?2, last_error=?3 WHERE id=?4",
                            params![final_attempts, ts, e, id],
                        )
                        .ok();
                        record_event(conn, &id, event_category, &e);
                    }
                    RetryDecision::WillRetry { attempts: new_attempts } => {
                        conn.execute(
                            "UPDATE jobs SET attempts=?1, updated_at=?2, last_error=?3 WHERE id=?4",
                            params![new_attempts, ts, e, id],
                        )
                        .ok();
                        record_event(
                            conn,
                            &id,
                            "submit_failed_will_retry",
                            &format!(
                                "attempt {new_attempts}/{}: {e}",
                                cfg.retry.max_attempts_transient
                            ),
                        );
                    }
                }
            }
        }
    }

    // Reconciliation pass: poll spooler for jobs we already submitted,
    // instead of trusting a single notification (notifications can
    // overflow/collapse per 19-RESEARCH.md).
    let mut stmt2 = conn
        .prepare(
            "SELECT id, printer_name, win32_job_id FROM jobs
             WHERE status = 'submitted_to_os' AND win32_job_id IS NOT NULL
             AND (last_checked_at IS NULL OR CAST(? AS INTEGER) - CAST(last_checked_at AS INTEGER) > ?)",
        )
        .unwrap();
    let now_ms: i64 = now_iso().parse().unwrap_or(0);
    let threshold_ms = (cfg.retry.reconcile_after_secs * 1000) as i64;
    let recon_rows: Vec<(String, String, i64)> = stmt2
        .query_map(params![now_ms, threshold_ms], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    for (id, printer_name, win32_job_id) in recon_rows {
        let ts = now_iso();
        #[cfg(target_os = "windows")]
        let status = win_print::query_job_status(&printer_name, win32_job_id as u32);
        #[cfg(not(target_os = "windows"))]
        let status: Result<Option<u32>, String> = Ok(None);

        match status {
            Ok(Some(bits)) => {
                if bits & JOB_STATUS_ERROR != 0 {
                    conn.execute("UPDATE jobs SET status='failed', updated_at=?1, last_checked_at=?1, last_error='spooler reported JOB_STATUS_ERROR' WHERE id=?2", params![ts, id]).ok();
                    record_event(conn, &id, "os_reported_failed", "JOB_STATUS_ERROR");
                } else if bits & JOB_STATUS_PRINTED != 0 {
                    conn.execute("UPDATE jobs SET status='os_reported_printed', updated_at=?1, last_checked_at=?1 WHERE id=?2", params![ts, id]).ok();
                    record_event(
                        conn,
                        &id,
                        "os_reported_printed",
                        "JOB_STATUS_PRINTED (submission acknowledgement only, not physical-output proof)",
                    );
                } else if bits & JOB_STATUS_DELETED != 0 {
                    conn.execute("UPDATE jobs SET status='failed', updated_at=?1, last_checked_at=?1, last_error='spooler job was deleted/cancelled' WHERE id=?2", params![ts, id]).ok();
                    record_event(conn, &id, "os_reported_deleted", "JOB_STATUS_DELETED");
                } else if bits & JOB_STATUS_PRINTING != 0 {
                    conn.execute("UPDATE jobs SET last_checked_at=?1 WHERE id=?2", params![ts, id]).ok();
                    record_event(conn, &id, "still_printing", &format!("status_bits={bits:#x}"));
                } else {
                    conn.execute("UPDATE jobs SET last_checked_at=?1 WHERE id=?2", params![ts, id]).ok();
                    record_event(conn, &id, "still_pending", &format!("status_bits={bits:#x}"));
                }
            }
            Ok(None) => {
                // Ambiguous handoff: spooler no longer has this job id. Do
                // NOT resubmit blindly — mark unknown for manual
                // reconciliation. This is the single most safety-critical
                // branch in the broker (PRN-06/PRN-07) — never change this to
                // auto-resubmit.
                conn.execute("UPDATE jobs SET status='unknown', updated_at=?1, last_checked_at=?1, last_error='spooler no longer reports this job id' WHERE id=?2", params![ts, id]).ok();
                record_event(
                    conn,
                    &id,
                    "ambiguous_handoff",
                    "GetJob returned no data for this win32_job_id; marked unknown, will not auto-resubmit",
                );
            }
            Err(e) => {
                conn.execute(
                    "UPDATE jobs SET last_checked_at=?1, last_error=?2 WHERE id=?3",
                    params![ts, e, id],
                )
                .ok();
                record_event(conn, &id, "reconcile_query_failed", &e);
            }
        }
    }
}

pub fn run_worker(shutdown: std::sync::Arc<std::sync::atomic::AtomicBool>, db_path: &Path) {
    crate::ledger::log("worker loop starting");
    while !shutdown.load(std::sync::atomic::Ordering::SeqCst) {
        let conn = open_db(db_path);
        worker_tick(&conn);
        std::thread::sleep(Duration::from_millis(500));
    }
    crate::ledger::log("worker loop stopped");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "print-broker-test-delivery-{name}-{}.db",
            std::process::id()
        ))
    }

    // Formerly "retries up to MAX_ATTEMPTS then marks failed" — under D-10's
    // per-failure-class classification (this plan), a nonexistent printer
    // name is the canonical Terminal case (classify_failure matches
    // "invalid" in the real OpenPrinterW error text), so it now fails after
    // exactly 1 attempt instead of retrying 5x. Deterministic — never
    // depends on real print hardware being attached.
    #[test]
    fn nonexistent_printer_is_terminal_and_marks_failed_after_one_attempt() {
        let path = temp_db_path("retry-then-fail");
        let _ = std::fs::remove_file(&path);
        let conn = open_db(&path);
        conn.execute(
            "INSERT INTO jobs (id, idempotency_key, printer_name, origin, payload, status, attempts, created_at, updated_at)
             VALUES ('job-retry', 'idem-retry', 'NONEXISTENT_TEST_PRINTER_19', 'test', X'00', 'accepted', 0, '1', '1')",
            [],
        )
        .unwrap();

        worker_tick(&conn);

        let (status, attempts, last_error): (String, i64, Option<String>) = conn
            .query_row(
                "SELECT status, attempts, last_error FROM jobs WHERE id='job-retry'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(status, "failed");
        assert_eq!(attempts, 1, "Terminal failures must not retry");
        assert!(last_error.is_some());
        let _ = std::fs::remove_file(&path);
    }

    // Test 5: restart-mid-flight recovery. A job durably accepted but never
    // delivered (attempts pre-seeded at 1, mirroring "the broker process was
    // killed right after a durable accept, a prior delivery attempt already
    // recorded in the ledger, before the worker tick could finish delivering
    // it") survives a fresh Connection against the same path (simulating a
    // process/service restart — the ledger, not any in-memory state, is
    // what survives per PRN-03), and a single worker_tick call after that
    // "restart" transitions it away from 'accepted' with zero new rows for
    // its idempotency_key (zero client resubmission). Uses the same
    // deterministic nonexistent-printer target as the test above so this
    // test does not depend on real print hardware.
    #[test]
    fn accepted_job_survives_restart_and_worker_tick_transitions_it_with_zero_new_rows() {
        let path = temp_db_path("restart-recovery");
        let _ = std::fs::remove_file(&path);
        {
            let conn = open_db(&path);
            conn.execute(
                "INSERT INTO jobs (id, idempotency_key, printer_name, origin, payload, status, attempts, created_at, updated_at)
                 VALUES ('job-restart', 'idem-restart', 'NONEXISTENT_TEST_PRINTER_19', 'test', X'00', 'accepted', 1, '1', '1')",
                [],
            )
            .unwrap();
            // conn dropped here — simulates the broker process being killed
            // after durable accept but before the worker tick could deliver it.
        }

        let conn2 = open_db(&path); // simulates relaunching the broker against the same ledger file.
        worker_tick(&conn2);

        let (status, count): (String, i64) = conn2
            .query_row(
                "SELECT status, (SELECT COUNT(*) FROM jobs WHERE idempotency_key='idem-restart') FROM jobs WHERE id='job-restart'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_ne!(
            status, "accepted",
            "status must transition away from 'accepted' after the ledger-recovered worker tick"
        );
        assert_eq!(
            count, 1,
            "zero new rows for the same idempotency_key across the simulated restart — no client resubmission"
        );
        let _ = std::fs::remove_file(&path);
    }
}

