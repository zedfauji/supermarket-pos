use tauri::State;

use crate::AppConfig;

/// Returns the number of indexed codebase chunks in pos_codebase_index.
/// Called from the renderer via invoke('agent_index_status').
#[tauri::command]
pub async fn agent_index_status(config: State<'_, AppConfig>) -> Result<u64, String> {
    if config.supabase_url.is_empty() {
        return Ok(0);
    }

    let url = format!(
        "{}/rest/v1/pos_codebase_index?select=id&limit=0",
        config.supabase_url.trim_end_matches('/')
    );

    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .header("apikey", &config.supabase_anon_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_anon_key),
        )
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    // PostgREST returns total count in Content-Range: */N (with limit=0)
    if let Some(range_val) = response.headers().get("content-range") {
        let range_str = range_val.to_str().unwrap_or("");
        // Format is either "*/N" or "0-N/N" — take the part after the last '/'
        if let Some(total_str) = range_str.split('/').next_back() {
            if let Ok(n) = total_str.trim().parse::<u64>() {
                return Ok(n);
            }
        }
    }

    Ok(0)
}
