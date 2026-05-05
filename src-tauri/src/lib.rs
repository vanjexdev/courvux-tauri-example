// Library entry — exports the Tauri commands that the JS frontend invokes
// and registers them on the builder. `main.rs` is just a thin wrapper that
// calls `run()` so the library form can also be reused for mobile targets.
//
// Storage model (v0.2.0+):
//   <app-data>/courvux-tauri-notepad/notes/<id>.md
//
// Each note file is plain Markdown with a YAML frontmatter block:
//
//   ---
//   title: My note
//   createdAt: 1730812345678
//   updatedAt: 1730812400000
//   ---
//
//   # Body in Markdown.
//
// One file per note keeps the storage human-editable (open `.md` in any
// text editor) and trivially syncable (Dropbox, Syncthing, git). The id
// is a millisecond timestamp set at creation time and never changes,
// even if the title is renamed.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};

/// Resolved on startup once and stashed in app state so each command
/// doesn't re-resolve the platform's data dir. Only `notes_dir` is
/// queried at runtime; `legacy_json` is consumed by the migration
/// step before this struct is built, so it doesn't live here.
struct StoragePath {
    /// `<app-data>/courvux-tauri-notepad/notes/`
    notes_dir: PathBuf,
}

/// What the sidebar shows: id, title, last-modified.
/// Body is loaded on demand via `read_note`.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct NoteSummary {
    id: u64,
    title: String,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

/// Full note as the editor consumes it.
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

/// YAML frontmatter shape. Body lives outside the frontmatter so it
/// stays unparsed and round-trippable.
#[derive(Debug, Serialize, Deserialize)]
struct Frontmatter {
    title: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_notes(state: State<'_, StoragePath>) -> Result<Vec<NoteSummary>, String> {
    let dir = &state.notes_dir;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("read dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u64>().ok()) {
            Some(id) => id,
            // Skip files whose stem isn't a numeric id — they're outside
            // our schema and probably user-managed.
            None => continue,
        };
        // Read enough to extract the frontmatter; for short files this is
        // the whole file anyway.
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
fn read_note(state: State<'_, StoragePath>, id: u64) -> Result<Note, String> {
    let path = note_path(&state.notes_dir, id);
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
    state: State<'_, StoragePath>,
    id: u64,
    title: String,
    body: String,
    created_at: u64,
) -> Result<u64, String> {
    let updated_at = now_ms();
    let path = note_path(&state.notes_dir, id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }

    let fm = Frontmatter { title, created_at, updated_at };
    let yaml = serde_yaml::to_string(&fm).map_err(|e| format!("yaml: {}", e))?;
    let payload = format!("---\n{}---\n\n{}", yaml, body);

    // Atomic write: tempfile in same dir + rename → never observe a
    // partial file mid-write.
    let tmp_path = path.with_extension("md.tmp");
    {
        let mut f = fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(payload.as_bytes()).map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }
    fs::rename(&tmp_path, &path).map_err(|e| format!("rename: {}", e))?;
    Ok(updated_at)
}

#[tauri::command]
fn delete_note(state: State<'_, StoragePath>, id: u64) -> Result<(), String> {
    let path = note_path(&state.notes_dir, id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("remove {}: {}", path.display(), e))?;
    }
    Ok(())
}

#[tauri::command]
fn notes_dir(state: State<'_, StoragePath>) -> String {
    state.notes_dir.display().to_string()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn note_path(dir: &Path, id: u64) -> PathBuf {
    dir.join(format!("{}.md", id))
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Split a Markdown file with YAML frontmatter into `(yaml_text, body_text)`.
/// If no frontmatter is found, returns an empty YAML chunk and the whole
/// file as body — caller decides how to react.
fn split_frontmatter(raw: &str) -> (String, &str) {
    // Frontmatter block: starts with "---\n" at offset 0, ends at the
    // next line that is exactly "---" (with optional trailing whitespace).
    let trimmed_start = raw.strip_prefix("---\n").or_else(|| raw.strip_prefix("---\r\n"));
    let after_open = match trimmed_start {
        Some(s) => s,
        None => return (String::new(), raw),
    };
    // Find the closing "---" line.
    for (idx, line) in after_open.split_inclusive('\n').enumerate() {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed == "---" {
            // Compute byte offsets:
            //   yaml = after_open[..start_of_this_line]
            //   rest after this line
            let lines_so_far: Vec<&str> = after_open.split_inclusive('\n').take(idx).collect();
            let yaml_len: usize = lines_so_far.iter().map(|s| s.len()).sum();
            let yaml_text = &after_open[..yaml_len];
            // Skip the closing line + one optional newline so the body
            // starts cleanly.
            let body_start = yaml_len + line.len();
            let body = after_open[body_start..].trim_start_matches('\n');
            return (yaml_text.to_string(), body);
        }
    }
    // Open marker found but no close — treat as no frontmatter.
    (String::new(), raw)
}

// ── Migration: legacy notes.json → per-note .md files ───────────────────────

/// Old (v0.1.0) record shape from notes.json.
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

/// Read notes.json (if present), write each entry as `<id>.md`, delete
/// the JSON file. Idempotent: if notes.json doesn't exist, no-op.
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
        let path = note_path(notes_dir, note.id);
        if path.exists() {
            // Don't clobber a note already migrated by a previous run.
            continue;
        }
        let fm = Frontmatter {
            title: note.title.clone(),
            // Best-effort: use updatedAt as createdAt when the legacy
            // record didn't track creation time separately.
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
    // Whole batch succeeded (or each failure was logged) — remove the
    // legacy file so we don't re-migrate next time.
    if let Err(err) = fs::remove_file(legacy_json) {
        eprintln!("[notepad] migration: cannot remove legacy file: {}", err);
    } else {
        eprintln!("[notepad] migration: moved {} notes from notes.json into notes/*.md", legacy.len());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let notes_dir = data_dir.join("notes");
            let legacy_json = data_dir.join("notes.json");

            // Run migration synchronously before the frontend gets a chance
            // to call list_notes.
            migrate_legacy_json(&legacy_json, &notes_dir);

            let _ = legacy_json; // already consumed by migration above
            app.manage(StoragePath { notes_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            read_note,
            write_note,
            delete_note,
            notes_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
