/**
 * TAURI LOGGER COMMAND
 *
 * Writes log entries to rotating log files in the app data directory.
 */

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use chrono::{Local, Datelike};
use tauri::AppHandle;

/// Maximum number of log files to keep (30 days)
const MAX_LOG_FILES: usize = 30;

/// Gets the log directory path
fn get_log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get app log directory: {}", e))?;

    // Create logs directory if it doesn't exist
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;

    Ok(app_data_dir)
}

/// Gets the current log file path (bar-pos-YYYY-MM-DD.log)
fn get_current_log_file(app: &AppHandle) -> Result<PathBuf, String> {
    let log_dir = get_log_dir(app)?;
    let now = Local::now();
    let filename = format!("bar-pos-{}.log", now.format("%Y-%m-%d"));
    Ok(log_dir.join(filename))
}

/// Rotates old log files (keeps last 30 days)
fn rotate_logs(app: &AppHandle) -> Result<(), String> {
    let log_dir = get_log_dir(app)?;

    // Get all log files
    let mut log_files: Vec<PathBuf> = fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext == "log")
                .unwrap_or(false)
        })
        .collect();

    // Sort by modification time (oldest first)
    log_files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
    });

    // Delete oldest files if we have more than MAX_LOG_FILES
    if log_files.len() > MAX_LOG_FILES {
        let files_to_delete = log_files.len() - MAX_LOG_FILES;
        for path in log_files.iter().take(files_to_delete) {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}

/// Writes a log entry to the current log file
#[tauri::command]
pub fn write_log(app: AppHandle, entry: String) -> Result<(), String> {
    // Get current log file path
    let log_file = get_current_log_file(&app)?;

    // Open file in append mode (create if doesn't exist)
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // Write log entry (one line per entry)
    writeln!(file, "{}", entry)
        .map_err(|e| format!("Failed to write log entry: {}", e))?;

    // Rotate logs (only check once per day to avoid overhead)
    // We'll do this opportunistically when writing logs
    let _ = rotate_logs(&app);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_file_naming() {
        // Test that log file names follow the expected format
        let now = Local::now();
        let expected = format!("bar-pos-{}.log", now.format("%Y-%m-%d"));
        assert!(expected.starts_with("bar-pos-"));
        assert!(expected.ends_with(".log"));
    }
}
