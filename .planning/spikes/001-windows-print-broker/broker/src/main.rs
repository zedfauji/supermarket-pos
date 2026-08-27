//! Spike 001: store-local durable print broker.
//! Proves: authenticated LAN HTTP -> durable SQLite ledger commit BEFORE
//! acceptance is returned -> async delivery to a NAMED Windows printer queue
//! via WinSpool -> periodic reconciliation (never blind-resubmit ambiguous
//! jobs) -> everything survives this process/service being killed and
//! restarted, because the ledger lives on disk, not in memory.
//!
//! Intentionally hardcoded/minimal per spike conventions: no env files, no
//! config system, one shared-secret token, one SQLite file under ProgramData
//! so it survives regardless of the service's working directory.

use std::io::Read as _;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tiny_http::{Header, Method, Response, Server};
use uuid::Uuid;

const PORT: u16 = 8973;
const AUTH_TOKEN: &str = "spike-shared-secret-001";
const MAX_ATTEMPTS: i64 = 5;
const RECONCILE_AFTER_SECS: u64 = 3;

fn data_dir() -> std::path::PathBuf {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let dir = std::path::PathBuf::from(base).join("PrintBrokerSpike");
    std::fs::create_dir_all(&dir).expect("create data dir");
    dir
}

fn db_path() -> std::path::PathBuf {
    data_dir().join("ledger.db")
}

fn log_path() -> std::path::PathBuf {
    data_dir().join("broker.log")
}

fn log(msg: &str) {
    use std::io::Write as _;
    let line = format!("{} {}\n", now_iso(), msg);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = f.write_all(line.as_bytes());
    }
    eprint!("{line}");
}

fn now_iso() -> String {
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    format!("{}", dur.as_millis())
}

fn open_db() -> Connection {
    let conn = Connection::open(db_path()).expect("open sqlite db");
    conn.pragma_update(None, "journal_mode", "WAL").ok();
    conn.pragma_update(None, "synchronous", "FULL").ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            idempotency_key TEXT UNIQUE NOT NULL,
            printer_name TEXT NOT NULL,
            origin TEXT NOT NULL,
            payload BLOB NOT NULL,
            status TEXT NOT NULL,
            win32_job_id INTEGER,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_checked_at TEXT
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            category TEXT NOT NULL,
            detail TEXT
        );",
    )
    .expect("create schema");
    conn
}

#[derive(Deserialize)]
struct SubmitReq {
    idempotency_key: String,
    printer_name: String,
    payload_b64: String,
    origin: String,
}

#[derive(Serialize)]
struct SubmitResp {
    job_id: String,
    status: String,
}

#[derive(Serialize)]
struct ErrorResp {
    error: String,
    detail: String,
    job_id: Option<String>,
}

fn err_json(status_code: u16, error: &str, detail: &str, job_id: Option<String>) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::to_vec(&ErrorResp {
        error: error.to_string(),
        detail: detail.to_string(),
        job_id,
    })
    .unwrap();
    Response::from_data(body)
        .with_status_code(status_code)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn ok_json<T: Serialize>(body: &T) -> Response<std::io::Cursor<Vec<u8>>> {
    let bytes = serde_json::to_vec(body).unwrap();
    Response::from_data(bytes)
        .with_status_code(200)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
}

fn record_event(conn: &Connection, job_id: &str, category: &str, detail: &str) {
    conn.execute(
        "INSERT INTO events (job_id, ts, category, detail) VALUES (?1, ?2, ?3, ?4)",
        params![job_id, now_iso(), category, detail],
    )
    .ok();
}

fn handle_submit(conn: &Connection, req: SubmitReq) -> Response<std::io::Cursor<Vec<u8>>> {
    let payload = match base64::engine::general_purpose::STANDARD.decode(&req.payload_b64) {
        Ok(p) if !p.is_empty() => p,
        Ok(_) => return err_json(400, "invalid_payload", "payload_b64 decodes to empty bytes", None),
        Err(e) => return err_json(400, "invalid_payload", &format!("payload_b64 is not valid base64: {e}"), None),
    };
    if req.idempotency_key.trim().is_empty() || req.printer_name.trim().is_empty() {
        return err_json(400, "invalid_payload", "idempotency_key and printer_name are required", None);
    }

    // Idempotency: a repeat submission returns the existing durable job, never a second row.
    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT id, status FROM jobs WHERE idempotency_key = ?1",
            params![req.idempotency_key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .unwrap_or(None);
    if let Some((id, status)) = existing {
        record_event(conn, &id, "duplicate_submit", "idempotency_key already accepted; no new job created");
        return ok_json(&SubmitResp { job_id: id, status });
    }

    let job_id = Uuid::new_v4().to_string();
    let ts = now_iso();
    // Durable commit BEFORE acceptance is returned to the caller.
    let result = conn.execute(
        "INSERT INTO jobs (id, idempotency_key, printer_name, origin, payload, status, attempts, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'accepted', 0, ?6, ?6)",
        params![job_id, req.idempotency_key, req.printer_name, req.origin, payload, ts],
    );
    match result {
        Ok(_) => {
            record_event(conn, &job_id, "accepted", &format!("origin={} printer={}", req.origin, req.printer_name));
            ok_json(&SubmitResp { job_id, status: "accepted".to_string() })
        }
        Err(e) => err_json(500, "persistence_failed", &format!("{e}"), None),
    }
}

fn handle_get_job(conn: &Connection, job_id: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let job: Option<(String, i64, Option<i64>, Option<String>)> = conn
        .query_row(
            "SELECT status, attempts, win32_job_id, last_error FROM jobs WHERE id = ?1",
            params![job_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .unwrap_or(None);
    let Some((status, attempts, win32_job_id, last_error)) = job else {
        return err_json(404, "not_found", "no job with that id", None);
    };
    let mut stmt = conn
        .prepare("SELECT ts, category, detail FROM events WHERE job_id = ?1 ORDER BY id ASC")
        .unwrap();
    let events: Vec<serde_json::Value> = stmt
        .query_map(params![job_id], |r| {
            Ok(serde_json::json!({
                "ts": r.get::<_, String>(0)?,
                "category": r.get::<_, String>(1)?,
                "detail": r.get::<_, Option<String>>(2)?,
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    ok_json(&serde_json::json!({
        "job_id": job_id,
        "status": status,
        "attempts": attempts,
        "win32_job_id": win32_job_id,
        "last_error": last_error,
        "events": events,
    }))
}

fn handle_audit(conn: &Connection) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut stmt = conn
        .prepare("SELECT status, COUNT(*) FROM jobs GROUP BY status")
        .unwrap();
    let counts: Vec<serde_json::Value> = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({ "status": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)? }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    ok_json(&serde_json::json!({ "counts_by_status": counts }))
}

fn run_http_server(shutdown: Arc<AtomicBool>) {
    let server = Server::http(("0.0.0.0", PORT)).expect("bind http server");
    log(&format!("http server listening on 127.0.0.1:{PORT} (LAN-bindable, spike uses loopback+LAN interface)"));
    for mut request in server.incoming_requests() {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        let auth_ok = request
            .headers()
            .iter()
            .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("Authorization"))
            .map(|h| h.value.as_str() == format!("Bearer {AUTH_TOKEN}"))
            .unwrap_or(false);

        let url = request.url().to_string();
        let method = request.method().clone();

        if !auth_ok {
            let _ = request.respond(err_json(401, "unauthorized", "missing or invalid Authorization bearer token", None));
            continue;
        }

        let conn = open_db();

        if method == Method::Post && url == "/jobs" {
            let mut body = String::new();
            if request.as_reader().read_to_string(&mut body).is_err() {
                let _ = request.respond(err_json(400, "invalid_payload", "could not read request body", None));
                continue;
            }
            let parsed: Result<SubmitReq, _> = serde_json::from_str(&body);
            match parsed {
                Ok(req) => {
                    let resp = handle_submit(&conn, req);
                    let _ = request.respond(resp);
                }
                Err(e) => {
                    let _ = request.respond(err_json(400, "invalid_payload", &format!("malformed JSON body: {e}"), None));
                }
            }
        } else if method == Method::Get && url.starts_with("/jobs/") {
            let id = url.trim_start_matches("/jobs/");
            let _ = request.respond(handle_get_job(&conn, id));
        } else if method == Method::Get && url == "/audit" {
            let _ = request.respond(handle_audit(&conn));
        } else if method == Method::Get && url == "/health" {
            let _ = request.respond(ok_json(&serde_json::json!({ "ok": true })));
        } else {
            let _ = request.respond(err_json(404, "not_found", "no such route", None));
        }
    }
}

#[cfg(target_os = "windows")]
mod win_print {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, GetJobW, DOC_INFO_1W, EndDocPrinter, JOB_INFO_1W, OpenPrinterW, PRINTER_HANDLE,
        StartDocPrinterW, WritePrinter,
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
        let mut doc_name: Vec<u16> = "PrintBrokerSpikeJob\0".encode_utf16().collect();
        let mut datatype: Vec<u16> = "RAW\0".encode_utf16().collect();
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };
        let job = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
        if job == 0 {
            let _ = unsafe { ClosePrinter(handle) };
            return Err("StartDocPrinter failed (job id 0) — spooler likely stopped or printer unreachable".to_string());
        }
        let mut written: u32 = 0;
        let ok = unsafe {
            WritePrinter(handle, bytes.as_ptr().cast(), bytes.len() as u32, std::ptr::addr_of_mut!(written))
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

const JOB_STATUS_PRINTED: u32 = 0x00000080;
const JOB_STATUS_ERROR: u32 = 0x00000002;
const JOB_STATUS_DELETED: u32 = 0x00000100;
const JOB_STATUS_PRINTING: u32 = 0x00000010;

fn worker_tick(conn: &Connection) {
    // Delivery pass: everything status='accepted' or transient-retry-eligible.
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

                // Immediate follow-up check: some jobs (esp. FILE: ports, or
                // tiny payloads) complete and get purged from the spooler
                // faster than the periodic reconciliation sweep can see them.
                // Tight retry loop (0/10/20/40/80ms) instead of one fixed
                // delay — a single sleep either overshoots (job already
                // purged) or undershoots (job not yet terminal).
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
                                record_event(&conn, &id, "os_reported_printed", &format!("caught by immediate post-submit check after {delay_ms}ms (JOB_STATUS_PRINTED)"));
                            } else {
                                conn.execute("UPDATE jobs SET status='failed', updated_at=?1, last_checked_at=?1, last_error='spooler reported JOB_STATUS_ERROR' WHERE id=?2", params![ts2, id]).ok();
                                record_event(&conn, &id, "os_reported_failed", &format!("caught by immediate post-submit check after {delay_ms}ms (JOB_STATUS_ERROR)"));
                            }
                            caught = true;
                            break;
                        }
                        // still pending/printing — keep retrying within the tight loop.
                    } else {
                        // Job already gone from the spooler. If this happened at
                        // delay_ms == 0 (i.e. before we ever observed a terminal
                        // status), it purged faster than this process can react at
                        // all — a real timing property of fast/local delivery
                        // targets, not a bug. Leave it for the periodic sweep to
                        // classify as 'unknown' rather than guessing here.
                        break;
                    }
                }
                let _ = caught;
            }
            Err(e) => {
                let new_attempts = attempts + 1;
                if new_attempts >= MAX_ATTEMPTS {
                    conn.execute(
                        "UPDATE jobs SET status='failed', attempts=?1, updated_at=?2, last_error=?3 WHERE id=?4",
                        params![new_attempts, ts, e, id],
                    )
                    .ok();
                    record_event(conn, &id, "retry_exhausted", &e);
                } else {
                    conn.execute(
                        "UPDATE jobs SET attempts=?1, updated_at=?2, last_error=?3 WHERE id=?4",
                        params![new_attempts, ts, e, id],
                    )
                    .ok();
                    record_event(conn, &id, "submit_failed_will_retry", &format!("attempt {new_attempts}/{MAX_ATTEMPTS}: {e}"));
                }
            }
        }
    }

    // Reconciliation pass: poll spooler for jobs we already submitted, instead
    // of trusting a single notification (research: notifications can overflow/collapse).
    let mut stmt2 = conn
        .prepare(
            "SELECT id, printer_name, win32_job_id FROM jobs
             WHERE status = 'submitted_to_os' AND win32_job_id IS NOT NULL
             AND (last_checked_at IS NULL OR CAST(? AS INTEGER) - CAST(last_checked_at AS INTEGER) > ?)",
        )
        .unwrap();
    let now_ms: i64 = now_iso().parse().unwrap_or(0);
    let threshold_ms = (RECONCILE_AFTER_SECS * 1000) as i64;
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
                    record_event(conn, &id, "os_reported_printed", "JOB_STATUS_PRINTED (submission acknowledgement only, not physical-output proof)");
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
                // Ambiguous handoff: spooler no longer has this job id. Do NOT
                // resubmit blindly — mark unknown for manual reconciliation.
                conn.execute("UPDATE jobs SET status='unknown', updated_at=?1, last_checked_at=?1, last_error='spooler no longer reports this job id' WHERE id=?2", params![ts, id]).ok();
                record_event(conn, &id, "ambiguous_handoff", "GetJob returned no data for this win32_job_id; marked unknown, will not auto-resubmit");
            }
            Err(e) => {
                conn.execute("UPDATE jobs SET last_checked_at=?1, last_error=?2 WHERE id=?3", params![ts, e, id]).ok();
                record_event(conn, &id, "reconcile_query_failed", &e);
            }
        }
    }
}

fn run_worker(shutdown: Arc<AtomicBool>) {
    log("worker loop starting");
    while !shutdown.load(Ordering::SeqCst) {
        let conn = open_db();
        worker_tick(&conn);
        std::thread::sleep(Duration::from_millis(500));
    }
    log("worker loop stopped");
}

fn main() {
    log("=== print-broker-spike starting ===");
    let _ = open_db(); // ensure schema exists before either loop starts
    let shutdown = Arc::new(AtomicBool::new(false));

    let worker_shutdown = shutdown.clone();
    let worker_handle = std::thread::spawn(move || run_worker(worker_shutdown));

    run_http_server(shutdown.clone());
    shutdown.store(true, Ordering::SeqCst);
    let _ = worker_handle.join();
    log("=== print-broker-spike exiting ===");
}
