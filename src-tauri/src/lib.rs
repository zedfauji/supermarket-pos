mod commands;

use commands::agent::agent_index_status;
use commands::printer::{open_cash_drawer, print_receipt, test_print};
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub supabase_url: String,
    pub supabase_anon_key: String,
}

fn read_env_config() -> AppConfig {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let env_path = exe_dir.join(".env");

    let mut config = AppConfig::default();
    if let Ok(content) = std::fs::read_to_string(&env_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                match key.trim() {
                    "VITE_SUPABASE_URL" => config.supabase_url = value.trim().to_string(),
                    "VITE_SUPABASE_ANON_KEY" => {
                        config.supabase_anon_key = value.trim().to_string()
                    }
                    _ => {}
                }
            }
        }
    }
    config
}

#[tauri::command]
fn get_runtime_config(state: tauri::State<AppConfig>) -> AppConfig {
    state.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = read_env_config();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.manage(config);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            print_receipt,
            open_cash_drawer,
            test_print,
            get_runtime_config,
            agent_index_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
