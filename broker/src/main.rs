//! `broker` — store-local durable print broker (Plan 19-01 tracer scope: one
//! job type, `test_print`, proved end-to-end). Foreground process only for
//! this plan — no Windows Service registration yet (that is Plan 19-02).
//!
//! Proves: authenticated HTTP -> durable SQLite ledger commit BEFORE
//! acceptance is returned -> async delivery to a NAMED Windows printer queue
//! via WinSpool -> periodic reconciliation (never blind-resubmit ambiguous
//! jobs) -> everything survives this process being killed and restarted,
//! because the ledger lives on disk, not in memory.

mod delivery;
mod http;
mod ledger;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn main() {
    let db_path = ledger::default_db_path();
    ledger::log(&format!(
        "=== print-broker starting, db={} ===",
        db_path.display()
    ));
    let _ = ledger::open_db(&db_path); // ensure schema exists before either loop starts

    let shutdown = Arc::new(AtomicBool::new(false));

    let worker_db_path = db_path.clone();
    let worker_shutdown = shutdown.clone();
    let worker_handle =
        std::thread::spawn(move || delivery::run_worker(worker_shutdown, &worker_db_path));

    http::run_http_server(shutdown.clone(), &db_path, &format!("0.0.0.0:{}", http::PORT));
    shutdown.store(true, Ordering::SeqCst);
    let _ = worker_handle.join();
    ledger::log("=== print-broker exiting ===");
}
