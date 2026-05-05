// Library entry — exports the Tauri commands that the JS frontend invokes
// and registers them on the builder. `main.rs` is just a thin wrapper that
// calls `run()` so the library form can also be reused for mobile targets.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{Manager, State};

/// One persisted note. The JS side uses the same shape verbatim.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Note {
    id: u64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
    #[serde(rename = "updatedAt", default)]
    updated_at: u64,
}

/// Resolved on startup once and stashed in app state so each command doesn't
/// re-resolve the platform's data dir.
struct StoragePath(PathBuf);

#[tauri::command]
fn load_notes(state: State<'_, StoragePath>) -> Result<Vec<Note>, String> {
    let path = &state.0;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read failed: {}", e))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    // Corrupt/legacy file → drop silently and start fresh on next save. We
    // log via stderr instead of bubbling so a broken file never traps the
    // user inside an app that won't open.
    serde_json::from_str(&raw).or_else(|err| {
        eprintln!("[notepad] notes file is unparseable, starting fresh: {}", err);
        Ok(Vec::new())
    })
}

#[tauri::command]
fn save_notes(state: State<'_, StoragePath>, notes: Vec<Note>) -> Result<(), String> {
    let path = &state.0;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {}", e))?;
    }

    // Atomic write: serialize → temp file in the same directory → rename.
    // Same-directory rename is atomic on every supported filesystem; this
    // guarantees the user never observes a half-written notes file.
    let tmp_path = path.with_extension("json.tmp");
    let payload = serde_json::to_vec_pretty(&notes).map_err(|e| format!("encode: {}", e))?;
    {
        let mut f = fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(&payload).map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }
    fs::rename(&tmp_path, path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

#[tauri::command]
fn notes_path(state: State<'_, StoragePath>) -> String {
    state.0.display().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve once: <platform-data-dir>/courvux-tauri-notepad/notes.json
            // app_data_dir() respects the bundle identifier from tauri.conf.json,
            // so two installs of different bundles never share state.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let path = data_dir.join("notes.json");
            app.manage(StoragePath(path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_notes, save_notes, notes_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
