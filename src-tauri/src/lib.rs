// Library entry — Tauri commands the JS frontend invokes, plus a tiny
// settings store (`config.json`) that persists the user-chosen notes
// folder so the next launch picks up where they left off.
//
// Storage model (v0.4.1+):
//
//   <notes_dir>/<id>-<slug>.md     — one Markdown file per note
//   <app-data>/courvux-tauri-notepad/config.json
//                                  — { "notesDir": "/path/the/user/picked" | null }
//
// The `<id>` prefix preserves the existing id-based addressing (read /
// delete know which file to touch without scanning the whole directory)
// while `<slug>` keeps the file human-recognizable when the user opens
// the notes folder in their own file manager. Pre-0.4.1 files used
// `<id>.md` and are auto-migrated to the new shape on first save.
//
// `notes_dir` defaults to `<app-data>/courvux-tauri-notepad/notes/` and can
// be overridden at runtime via the `set_notes_dir` command (which the UI
// triggers from a native folder-picker dialog). Each note file is
// human-editable Markdown with a YAML frontmatter block:
//
//   ---
//   title: My note
//   createdAt: 1730812345678
//   updatedAt: 1730812400000
//   ---
//
//   # Body in Markdown.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

// ── App state ───────────────────────────────────────────────────────────────

/// All paths resolved once on startup (and again whenever the user picks a
/// new notes folder). Wrapped in a Mutex so `set_notes_dir` can swap the
/// active path without restarting the app.
struct AppState {
    inner: Mutex<AppStateInner>,
}

struct AppStateInner {
    /// The folder where `<id>.md` files live. May be the default location
    /// or a user-picked one persisted in config.json.
    notes_dir: PathBuf,
    /// Default fallback used when the user clicks "Reset to default" or
    /// when the config doesn't override the location.
    default_notes_dir: PathBuf,
    /// `<app-data>/courvux-tauri-notepad/config.json` — never moves.
    config_path: PathBuf,
}

// ── Persisted config ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct AppConfig {
    /// `null` (or missing) means "use the default notes dir". An absolute
    /// path here overrides it.
    #[serde(rename = "notesDir", default)]
    notes_dir: Option<String>,
    /// User preference for the auto-save behavior. `true` (the default)
    /// means edits to an already-saved note auto-persist 600 ms after
    /// the last keystroke; `false` means every change requires an
    /// explicit Ctrl+S. New notes always start `unsaved` regardless.
    #[serde(rename = "autoSave", default = "default_auto_save")]
    auto_save: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { notes_dir: None, auto_save: true }
    }
}

fn default_auto_save() -> bool { true }

fn load_config(path: &Path) -> AppConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_config(path: &Path, cfg: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("encode: {}", e))?;
    fs::write(path, raw).map_err(|e| format!("write: {}", e))?;
    Ok(())
}

// ── Note records ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NoteSummary {
    id: u64,
    title: String,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Note {
    id: u64,
    title: String,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Frontmatter {
    title: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

// ── Note IO commands ────────────────────────────────────────────────────────

#[tauri::command]
fn list_notes(state: State<'_, AppState>) -> Result<Vec<NoteSummary>, String> {
    let dir = state.inner.lock().unwrap().notes_dir.clone();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()).and_then(parse_id_from_stem) {
            Some(id) => id,
            None => continue,
        };
        let raw = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("[notepad] skip unreadable note {}: {}", path.display(), err);
                continue;
            }
        };
        let (front, _body) = split_frontmatter(&raw);
        let fm: Frontmatter = match serde_yaml::from_str(&front) {
            Ok(fm) => fm,
            Err(err) => {
                eprintln!("[notepad] skip note {} with invalid frontmatter: {}", path.display(), err);
                continue;
            }
        };
        out.push(NoteSummary { id, title: fm.title, updated_at: fm.updated_at });
    }
    Ok(out)
}

#[tauri::command]
fn read_note(state: State<'_, AppState>, id: u64) -> Result<Note, String> {
    let dir = state.inner.lock().unwrap().notes_dir.clone();
    let path = find_note_path(&dir, id)
        .ok_or_else(|| format!("note {} not found in {}", id, dir.display()))?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path.display(), e))?;
    let (front, body) = split_frontmatter(&raw);
    let fm: Frontmatter = serde_yaml::from_str(&front).map_err(|e| format!("frontmatter parse: {}", e))?;
    Ok(Note {
        id,
        title: fm.title,
        body: body.to_string(),
        created_at: fm.created_at,
        updated_at: fm.updated_at,
    })
}

#[tauri::command]
fn write_note(
    state: State<'_, AppState>,
    id: u64,
    title: String,
    body: String,
    created_at: u64,
) -> Result<u64, String> {
    let updated_at = now_ms();
    let dir = state.inner.lock().unwrap().notes_dir.clone();
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;

    // The desired path reflects the *current* title, so renaming a note
    // moves the underlying file. Locate the existing file (if any) so we
    // can clean it up after the new file is in place — covers both the
    // legacy `<id>.md` shape and stale `<id>-<old_slug>.md` variants.
    let new_path = dir.join(format!("{}-{}.md", id, slugify(&title)));
    let old_path = find_note_path(&dir, id);

    let fm = Frontmatter { title, created_at, updated_at };
    let yaml = serde_yaml::to_string(&fm).map_err(|e| format!("yaml: {}", e))?;
    let payload = format!("---\n{}---\n\n{}", yaml, body);

    let tmp_path = new_path.with_extension("md.tmp");
    {
        let mut f = fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(payload.as_bytes()).map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }
    fs::rename(&tmp_path, &new_path).map_err(|e| format!("rename: {}", e))?;

    // Drop the old file if the title changed (or if we just migrated from
    // the legacy `<id>.md` layout to `<id>-<slug>.md`). Same path = no-op.
    if let Some(old) = old_path {
        if old != new_path && old.exists() {
            if let Err(err) = fs::remove_file(&old) {
                eprintln!("[notepad] could not remove stale note file {}: {}", old.display(), err);
            }
        }
    }
    Ok(updated_at)
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, id: u64) -> Result<(), String> {
    let dir = state.inner.lock().unwrap().notes_dir.clone();
    if let Some(path) = find_note_path(&dir, id) {
        fs::remove_file(&path).map_err(|e| format!("remove {}: {}", path.display(), e))?;
    }
    Ok(())
}

// ── Storage location commands ───────────────────────────────────────────────

#[tauri::command]
fn get_notes_dir(state: State<'_, AppState>) -> String {
    state.inner.lock().unwrap().notes_dir.display().to_string()
}

#[tauri::command]
fn get_default_notes_dir(state: State<'_, AppState>) -> String {
    state.inner.lock().unwrap().default_notes_dir.display().to_string()
}

#[tauri::command]
fn set_notes_dir(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let new_dir = PathBuf::from(&path);
    if !new_dir.is_absolute() {
        return Err("path must be absolute".into());
    }
    fs::create_dir_all(&new_dir).map_err(|e| format!("create dir: {}", e))?;

    // Write-permission probe. `create_dir_all` succeeds in cases where a
    // directory exists but the calling user can list it without writing
    // (network mounts, NAS shares with read-only ACLs, macOS sandboxed
    // app-data dirs, …). Without this probe, the first save fires its own
    // alert from the JS side and leaves the user with a config pointing
    // at a non-functional folder. Touching a tiny tempfile and removing
    // it surfaces the failure here, while the UI still has a clean
    // recovery path.
    let probe = new_dir.join(".courvux-write-test");
    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
        }
        Err(err) => {
            return Err(format!("folder is not writable: {}", err));
        }
    }

    let config_path = {
        let inner = state.inner.lock().unwrap();
        inner.config_path.clone()
    };

    // Read-modify-write so the auto-save preference (and any other future
    // setting) doesn't get clobbered by a folder change.
    let mut cfg = load_config(&config_path);
    cfg.notes_dir = Some(new_dir.display().to_string());
    save_config(&config_path, &cfg)?;

    let mut inner = state.inner.lock().unwrap();
    inner.notes_dir = new_dir.clone();
    Ok(new_dir.display().to_string())
}

/// Drop the user override and revert to `<app-data>/.../notes/`. Returns
/// the new (default) notes directory so the UI can refresh its sidebar.
#[tauri::command]
fn reset_notes_dir(state: State<'_, AppState>) -> Result<String, String> {
    let (config_path, default_dir) = {
        let inner = state.inner.lock().unwrap();
        (inner.config_path.clone(), inner.default_notes_dir.clone())
    };
    // Preserve other prefs (e.g. autoSave) when only the folder is reset.
    let mut cfg = load_config(&config_path);
    cfg.notes_dir = None;
    save_config(&config_path, &cfg)?;
    fs::create_dir_all(&default_dir).map_err(|e| format!("create dir: {}", e))?;
    let mut inner = state.inner.lock().unwrap();
    inner.notes_dir = default_dir.clone();
    Ok(default_dir.display().to_string())
}

#[tauri::command]
fn get_auto_save(state: State<'_, AppState>) -> bool {
    let config_path = state.inner.lock().unwrap().config_path.clone();
    load_config(&config_path).auto_save
}

#[tauri::command]
fn set_auto_save(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let config_path = state.inner.lock().unwrap().config_path.clone();
    let mut cfg = load_config(&config_path);
    cfg.auto_save = enabled;
    save_config(&config_path, &cfg)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// ASCII-only slug from a note title. Lowercases letters/digits, replaces
/// every other char with a single `-`, collapses runs, trims, and caps at
/// 50 chars so the resulting filename stays well under the 255-byte limit
/// most filesystems impose. Empty result → `untitled`.
fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = true;
    for c in title.chars() {
        if c.is_ascii_alphanumeric() {
            for lc in c.to_lowercase() { out.push(lc); }
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') { out.pop(); }
    if out.len() > 50 {
        out.truncate(50);
        while out.ends_with('-') { out.pop(); }
    }
    if out.is_empty() { return "untitled".into(); }
    out
}

/// Pull the numeric id out of a note's filename stem. Accepts both the
/// legacy `<id>` shape (whole stem is the id) and the new `<id>-<slug>`
/// shape (id is everything before the first `-`).
fn parse_id_from_stem(stem: &str) -> Option<u64> {
    if let Ok(id) = stem.parse::<u64>() { return Some(id); }
    stem.split_once('-').and_then(|(prefix, _)| prefix.parse::<u64>().ok())
}

/// Locate the on-disk file for a given note id. Returns `Some(path)` for
/// either layout — legacy `<id>.md` or new `<id>-<slug>.md` — and falls
/// back to scanning the directory if the legacy filename is missing.
fn find_note_path(dir: &Path, id: u64) -> Option<PathBuf> {
    let legacy = dir.join(format!("{}.md", id));
    if legacy.exists() { return Some(legacy); }
    let prefix = format!("{}-", id);
    fs::read_dir(dir).ok()?.flatten().find_map(|entry| {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") { return None; }
        let stem = path.file_stem().and_then(|s| s.to_str())?;
        if stem.starts_with(&prefix) && stem[prefix.len()..].chars().next().is_some() {
            Some(path)
        } else {
            None
        }
    })
}

fn split_frontmatter(raw: &str) -> (String, &str) {
    let trimmed_start = raw.strip_prefix("---\n").or_else(|| raw.strip_prefix("---\r\n"));
    let after_open = match trimmed_start {
        Some(s) => s,
        None => return (String::new(), raw),
    };
    for (idx, line) in after_open.split_inclusive('\n').enumerate() {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "---" {
            let lines_so_far: Vec<&str> = after_open.split_inclusive('\n').take(idx).collect();
            let yaml_len: usize = lines_so_far.iter().map(|s| s.len()).sum();
            let yaml_text = &after_open[..yaml_len];
            let body_start = yaml_len + line.len();
            let body = after_open[body_start..].trim_start_matches('\n');
            return (yaml_text.to_string(), body);
        }
    }
    (String::new(), raw)
}

// ── Migration: legacy notes.json → per-note .md files ───────────────────────

#[derive(Debug, Deserialize)]
struct LegacyNote {
    id: u64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
    #[serde(rename = "updatedAt", default)]
    updated_at: u64,
}

fn migrate_legacy_json(legacy_json: &Path, notes_dir: &Path) {
    if !legacy_json.exists() {
        return;
    }
    let raw = match fs::read_to_string(legacy_json) {
        Ok(s) => s,
        Err(err) => {
            eprintln!("[notepad] migration: cannot read {}: {}", legacy_json.display(), err);
            return;
        }
    };
    if raw.trim().is_empty() {
        let _ = fs::remove_file(legacy_json);
        return;
    }
    let legacy: Vec<LegacyNote> = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(err) => {
            eprintln!("[notepad] migration: cannot parse legacy JSON: {}", err);
            return;
        }
    };
    if let Err(err) = fs::create_dir_all(notes_dir) {
        eprintln!("[notepad] migration: cannot create notes dir: {}", err);
        return;
    }
    for note in &legacy {
        let path = notes_dir.join(format!("{}.md", note.id));
        if path.exists() { continue; }
        let fm = Frontmatter {
            title: note.title.clone(),
            created_at: note.updated_at,
            updated_at: note.updated_at,
        };
        let yaml = match serde_yaml::to_string(&fm) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("[notepad] migration: yaml encode failed for note {}: {}", note.id, err);
                continue;
            }
        };
        let payload = format!("---\n{}---\n\n{}", yaml, note.body);
        if let Err(err) = fs::write(&path, payload) {
            eprintln!("[notepad] migration: write failed for note {}: {}", note.id, err);
            continue;
        }
    }
    if let Err(err) = fs::remove_file(legacy_json) {
        eprintln!("[notepad] migration: cannot remove legacy file: {}", err);
    } else {
        eprintln!("[notepad] migration: moved {} notes from notes.json into notes/*.md", legacy.len());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Persist window position / size / maximized / fullscreen state
        // across launches in `<app-data>/window-state.json`. Uses defaults
        // (all flags set, restore on startup) — no extra config needed.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Opens https URLs in the user's default browser. Tauri webview
        // sandboxes `<a target="_blank">` (no browser context), so the
        // About dialog calls `opener:open_url` via the plugin instead.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let default_notes_dir = data_dir.join("notes");
            let legacy_json = data_dir.join("notes.json");
            let config_path = data_dir.join("config.json");

            // Resolve the active notes dir from the config (if any) or
            // default to <app-data>/.../notes. Migration runs against the
            // DEFAULT location only — we never silently move files out of
            // a user-picked folder.
            migrate_legacy_json(&legacy_json, &default_notes_dir);

            let cfg = load_config(&config_path);
            let notes_dir = cfg
                .notes_dir
                .as_deref()
                .map(PathBuf::from)
                .filter(|p| p.is_absolute())
                .unwrap_or_else(|| default_notes_dir.clone());

            // Make sure the active dir exists; tolerate it failing (the UI
            // shows a meaningful error when list_notes returns the IO err).
            let _ = fs::create_dir_all(&notes_dir);

            app.manage(AppState {
                inner: Mutex::new(AppStateInner {
                    notes_dir,
                    default_notes_dir,
                    config_path,
                }),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            read_note,
            write_note,
            delete_note,
            get_notes_dir,
            get_default_notes_dir,
            set_notes_dir,
            reset_notes_dir,
            get_auto_save,
            set_auto_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
