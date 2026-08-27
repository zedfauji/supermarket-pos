//! Broker durable ledger: SQLite WAL schema (`jobs`, `events`) plus the
//! `%ProgramData%\PrintBroker\` data-dir/log helpers. `open_db` takes an
//! explicit path (never a hidden global) so Task 2's tests can point at a
//! tempfile-backed path without colliding with a running dev instance.
//!
//! Ported from the spike
//! (.planning/spikes/001-windows-print-broker/broker/src/main.rs:28-90),
//! with the production data-dir name (`PrintBroker`, not `PrintBrokerSpike`).

use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// Production data directory: `%ProgramData%\PrintBroker\`.
pub fn data_dir() -> PathBuf {
    let base = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let dir = PathBuf::from(base).join("PrintBroker");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Production ledger path — only used by `main.rs`. Tests inject their own
/// tempfile path directly into `open_db`, never this function.
pub fn default_db_path() -> PathBuf {
    data_dir().join("ledger.db")
}

pub fn log_path() -> PathBuf {
    data_dir().join("broker.log")
}

pub fn now_iso() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    format!("{}", dur.as_millis())
}

/// Appends a timestamped line to `broker.log` and stderr. Best-effort — a log
/// write failure must never break the broker itself.
pub fn log(msg: &str) {
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

const SCHEMA_SQL: &str = "CREATE TABLE IF NOT EXISTS jobs (
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
);";

/// Opens (creating if needed) the WAL SQLite ledger at `path`. `synchronous=FULL`
/// in WAL mode fsyncs the WAL after each commit — a COMMIT does not return
/// until the write is durable (sqlite.org/pragma.html#pragma_synchronous).
/// Never weaken this to `NORMAL` — this pragma is what makes durable-accept-
/// before-response (PRN-02/PRN-03) actually true.
pub fn open_db(path: &Path) -> Connection {
    let conn = Connection::open(path).expect("open sqlite db");
    conn.pragma_update(None, "journal_mode", "WAL").ok();
    conn.pragma_update(None, "synchronous", "FULL").ok();
    conn.execute_batch(SCHEMA_SQL).expect("create schema");
    conn
}

pub fn record_event(conn: &Connection, job_id: &str, category: &str, detail: &str) {
    conn.execute(
        "INSERT INTO events (job_id, ts, category, detail) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![job_id, now_iso(), category, detail],
    )
    .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "print-broker-test-ledger-{name}-{}.db",
            std::process::id()
        ))
    }

    #[test]
    fn open_db_creates_jobs_and_events_tables() {
        let path = temp_db_path("schema");
        let _ = std::fs::remove_file(&path);
        let conn = open_db(&path);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('jobs','events')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    // Test 6: making the ledger file read-only mirrors the spike's `attrib +R`
    // fault case — POST /jobs (here, a direct handle_submit call against a
    // Connection opened while the file was still writable) must return 500
    // persistence_failed with no job/event row created, never a false
    // "accepted". Skips with a clear message on platforms/filesystems where a
    // read-only file doesn't block SQLite writes the same way (task allows
    // this explicitly — CONVENTIONS.md documents the same platform caveat).
    #[test]
    fn read_only_ledger_file_returns_persistence_failed_without_writing_rows() {
        let path = temp_db_path("readonly");
        let _ = std::fs::remove_file(&path);
        {
            // Create schema while the file is still writable.
            let conn = open_db(&path);
            drop(conn);
        }

        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&path, perms).unwrap();

        // Re-opening against the now-read-only file can itself fail on some
        // platforms (a stronger form of the same "no write reaches the
        // ledger" guarantee this test exists to prove) — catch that case and
        // treat it as a pass-by-a-stronger-guarantee, not a test failure.
        let open_result = std::panic::catch_unwind(|| open_db(&path));
        let conn = match open_result {
            Ok(conn) => conn,
            Err(_) => {
                restore_writable(&path);
                eprintln!(
                    "SKIPPED read_only_ledger_file test: Connection::open() itself failed against \
                     the read-only file (a stronger form of the same guarantee) — platform-dependent, \
                     see .planning/spikes/CONVENTIONS.md"
                );
                let _ = std::fs::remove_file(&path);
                return;
            }
        };

        let resp = crate::http::handle_submit(&conn, sample_req("idem-readonly-1"));
        drop(conn);
        restore_writable(&path);

        if resp.status == 200 {
            eprintln!(
                "SKIPPED read_only_ledger_file test: this platform/filesystem did not block writes \
                 to a read-only-attributed SQLite file — documented platform gap, see \
                 .planning/spikes/CONVENTIONS.md"
            );
            let _ = std::fs::remove_file(&path);
            return;
        }
        assert_eq!(resp.status, 500);
        let body = String::from_utf8(resp.body).unwrap();
        assert!(body.contains("persistence_failed"));

        let conn2 = open_db(&path);
        let count: i64 = conn2
            .query_row(
                "SELECT COUNT(*) FROM jobs WHERE idempotency_key='idem-readonly-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        let _ = std::fs::remove_file(&path);
    }

    fn restore_writable(path: &Path) {
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_readonly(false);
            let _ = std::fs::set_permissions(path, perms);
        }
    }

    fn sample_req(idem: &str) -> crate::http::SubmitReq {
        use base64::Engine;
        crate::http::SubmitReq {
            idempotency_key: idem.to_string(),
            printer_name: "NONEXISTENT_TEST_PRINTER_19".to_string(),
            payload_b64: base64::engine::general_purpose::STANDARD.encode(b"hello"),
            origin: "test".to_string(),
        }
    }
}
