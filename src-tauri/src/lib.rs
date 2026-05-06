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
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, State};

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
    /// .md paths the OS handed us before the webview was ready (first
    /// launch via file association). The frontend drains this list with
    /// `take_pending_open_files` once it's mounted.
    pending_opens: Vec<String>,
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
    /// Most-recently-opened project folders, newest first. Capped at
    /// `MAX_RECENT_PROJECTS` entries; entries that no longer exist on
    /// disk are pruned lazily when the frontend asks for the list.
    #[serde(rename = "recentProjects", default)]
    recent_projects: Vec<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { notes_dir: None, auto_save: true, recent_projects: Vec::new() }
    }
}

const MAX_RECENT_PROJECTS: usize = 10;
/// Hard cap on directory traversal so a misclick on `/` or a huge repo
/// can't lock the UI thread for minutes. Hit the cap → tree is truncated
/// and the frontend shows a soft warning.
const TREE_FILE_CAP: u32 = 5000;
/// Skip these directory names entirely — they're never useful to the
/// notepad and tend to be massive (`node_modules`) or platform churn
/// (`target`, `.git`, `dist`).
const SKIPPED_DIR_NAMES: &[&str] = &[
    ".git", ".svn", ".hg",
    "node_modules", "target", "dist", "build",
    ".next", ".cache", ".idea", ".vscode",
    "__pycache__", ".pytest_cache",
];

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

// ── Import / export commands (File menu) ────────────────────────────────────

/// Copy a foreign .md file into the active notes folder as a brand-new note.
/// The file's existing YAML frontmatter wins for the title; otherwise we
/// fall back to the first `# Heading` line, then to the source filename.
/// The original file is untouched — this is an import, not a move.
#[tauri::command]
fn import_md_file(state: State<'_, AppState>, source: String) -> Result<NoteSummary, String> {
    let raw = fs::read_to_string(&source).map_err(|e| format!("read {}: {}", source, e))?;
    let dir = state.inner.lock().unwrap().notes_dir.clone();
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;

    let (front, body_after_front) = split_frontmatter(&raw);
    let parsed_fm = if front.is_empty() { None } else { serde_yaml::from_str::<Frontmatter>(&front).ok() };
    let (title, body) = match parsed_fm {
        Some(fm) => (fm.title, body_after_front.to_string()),
        None => {
            let h1 = raw.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches('#').trim().to_string());
            let title = h1.unwrap_or_else(|| {
                PathBuf::from(&source)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Imported")
                    .to_string()
            });
            (title, raw.clone())
        }
    };

    let id = now_ms();
    let updated_at = id;
    let fm = Frontmatter { title: title.clone(), created_at: id, updated_at };
    let yaml = serde_yaml::to_string(&fm).map_err(|e| format!("yaml: {}", e))?;
    let payload = format!("---\n{}---\n\n{}", yaml, body);

    let path = dir.join(format!("{}-{}.md", id, slugify(&title)));
    let tmp_path = path.with_extension("md.tmp");
    {
        let mut f = fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(payload.as_bytes()).map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }
    fs::rename(&tmp_path, &path).map_err(|e| format!("rename: {}", e))?;

    Ok(NoteSummary { id, title, updated_at })
}

// ── Project mode ────────────────────────────────────────────────────────────
//
// The notepad has two top-level UI modes: "library" (the original flat
// `<id>-<slug>.md` notes folder owned by the app) and "project" (an
// arbitrary user-owned folder with subdirectories, .md files, and image
// assets). Project mode edits files in place — no copying, no slug
// rename, no YAML frontmatter — so a project folder stays usable in any
// other editor / git repo / static-site generator.

/// Classification of a project entry. The frontend uses this to pick the
/// right icon, decide whether the entry is editable (only `Md`), and
/// route image clicks to the preview modal.
#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum NodeKind {
    Dir,
    Md,
    Image,
    Other,
}

#[derive(Debug, Serialize)]
struct TreeNode {
    name: String,
    /// Absolute path on disk. Frontend passes it back verbatim to the
    /// read / write commands; we don't try to resolve relative paths
    /// across calls.
    path: String,
    kind: NodeKind,
    /// Present only on `Dir` nodes. Sorted: dirs first, then files,
    /// each group alphabetic by lowercase name.
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
    /// True if `TREE_FILE_CAP` was hit while walking this subtree —
    /// the children list is incomplete. Set on whichever ancestor
    /// hit the cap; consumers can show a "..." marker.
    #[serde(skip_serializing_if = "std::ops::Not::not", default)]
    truncated: bool,
}

fn classify(path: &Path) -> NodeKind {
    if path.is_dir() { return NodeKind::Dir; }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" => NodeKind::Md,
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" | "avif" => NodeKind::Image,
        _ => NodeKind::Other,
    }
}

fn walk_tree(root: &Path, depth: u32, count: &mut u32) -> TreeNode {
    let name = root.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| root.display().to_string());
    let path = root.display().to_string();

    if !root.is_dir() {
        *count += 1;
        return TreeNode { name, path, kind: classify(root), children: None, truncated: false };
    }

    // Stop descending past depth cap; surface as truncated dir.
    if depth >= 10 {
        return TreeNode { name, path, kind: NodeKind::Dir, children: Some(Vec::new()), truncated: true };
    }

    let entries = match fs::read_dir(root) {
        Ok(it) => it,
        Err(_) => return TreeNode { name, path, kind: NodeKind::Dir, children: Some(Vec::new()), truncated: false },
    };

    let mut children: Vec<TreeNode> = Vec::new();
    let mut truncated = false;
    for entry in entries.flatten() {
        if *count >= TREE_FILE_CAP { truncated = true; break; }
        let entry_path = entry.path();
        let entry_name = match entry_path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Hide dotfiles + the noisy directory denylist.
        if entry_name.starts_with('.') { continue; }
        if entry_path.is_dir() && SKIPPED_DIR_NAMES.contains(&entry_name.as_str()) { continue; }

        let child = walk_tree(&entry_path, depth + 1, count);
        if child.truncated { truncated = true; }
        children.push(child);
    }

    // Dirs first, then files, alphabetical within each group.
    children.sort_by(|a, b| {
        let dir_a = matches!(a.kind, NodeKind::Dir);
        let dir_b = matches!(b.kind, NodeKind::Dir);
        match (dir_a, dir_b) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    TreeNode { name, path, kind: NodeKind::Dir, children: Some(children), truncated }
}

/// Validate a project root and remember it as the most-recently-opened
/// project. Returns the canonicalized absolute path (so the frontend
/// stores the same shape we put in `recent_projects`).
#[tauri::command]
fn open_project_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {}", path));
    }
    let abs = p.canonicalize().unwrap_or(p);
    let abs_str = abs.display().to_string();

    // Allow the asset:// protocol to serve files from this folder so the
    // markdown preview can render `![](images/foo.jpg)` style links.
    // `allow_directory(_, true)` is recursive.
    if let Err(err) = app.asset_protocol_scope().allow_directory(&abs, true) {
        eprintln!("[notepad] asset scope grant failed for {}: {}", abs_str, err);
    }

    let cfg_path = state.inner.lock().unwrap().config_path.clone();
    let mut cfg = load_config(&cfg_path);
    cfg.recent_projects.retain(|r| r != &abs_str);
    cfg.recent_projects.insert(0, abs_str.clone());
    cfg.recent_projects.truncate(MAX_RECENT_PROJECTS);
    save_config(&cfg_path, &cfg)?;

    Ok(abs_str)
}

/// Recursively walk the project root and return its tree. Hidden files,
/// the noisy denylist (`node_modules`, `target`, `.git`, …), and depth /
/// file-count caps keep this safe to call on arbitrary user folders.
#[tauri::command]
fn list_project_tree(path: String) -> Result<TreeNode, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {}", path));
    }
    let mut count: u32 = 0;
    Ok(walk_tree(&p, 0, &mut count))
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path, e))
}

/// Create a brand-new project file. Errors if the path already exists
/// so the UI flow can prompt before clobbering — `write_project_file`
/// is the unconditional overwrite path used by the auto-save loop.
#[tauri::command]
fn create_project_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err(format!("already exists: {}", path));
    }
    let parent = p.parent().ok_or_else(|| format!("no parent dir: {}", path))?;
    fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    fs::write(&p, content).map_err(|e| format!("write {}: {}", path, e))?;
    Ok(())
}

/// Atomic in-place write — same tmp + fsync + rename pattern used for
/// library notes, but no frontmatter wrapping. Project files keep
/// whatever shape the user put on disk.
#[tauri::command]
fn write_project_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let parent = p.parent().ok_or_else(|| format!("no parent dir: {}", path))?;
    fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    let tmp = p.with_file_name(format!(
        ".{}.tmp",
        p.file_name().and_then(|s| s.to_str()).unwrap_or("file"),
    ));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(content.as_bytes()).map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().map_err(|e| format!("fsync: {}", e))?;
    }
    fs::rename(&tmp, &p).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

/// Return the cached recent-projects list, lazily pruning entries whose
/// folders have been deleted / renamed since they were last opened.
#[tauri::command]
fn get_recent_projects(state: State<'_, AppState>) -> Vec<String> {
    let cfg_path = state.inner.lock().unwrap().config_path.clone();
    let mut cfg = load_config(&cfg_path);
    let before = cfg.recent_projects.len();
    cfg.recent_projects.retain(|p| PathBuf::from(p).is_dir());
    if cfg.recent_projects.len() != before {
        let _ = save_config(&cfg_path, &cfg);
    }
    cfg.recent_projects
}

/// Drain and return the .md paths the OS asked us to open at launch
/// (file-association handler in `setup` collected them from argv). The
/// frontend calls this once on mount and pushes each through the same
/// import path used by the File → Open menu item.
#[tauri::command]
fn take_pending_open_files(state: State<'_, AppState>) -> Vec<String> {
    let mut inner = state.inner.lock().unwrap();
    std::mem::take(&mut inner.pending_opens)
}

/// Export the currently selected note as a portable Markdown file: title
/// becomes the first H1 heading, then a blank line, then the body. No
/// YAML frontmatter — the goal is something other Markdown tools can
/// open without parsing our private metadata format.
#[tauri::command]
fn export_md_file(dest: String, title: String, body: String) -> Result<(), String> {
    let trimmed = title.trim();
    let payload = if trimmed.is_empty() {
        body
    } else {
        format!("# {}\n\n{}", trimmed, body)
    };
    fs::write(&dest, payload).map_err(|e| format!("write {}: {}", dest, e))
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

/// Filter a process arg list down to absolute .md / .markdown paths that
/// actually exist on disk. Used both for the first-instance launch (own
/// argv) and the single-instance callback (a second launch's argv).
/// Skips the executable path so we don't try to open ourselves.
fn collect_md_paths<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let cwd = std::env::current_dir().ok();
    args.into_iter()
        .skip(1)
        .filter_map(|s| {
            let raw = s.as_ref();
            if raw.starts_with('-') { return None; }
            let p = PathBuf::from(raw);
            let abs = if p.is_absolute() {
                p
            } else {
                cwd.as_ref()?.join(p)
            };
            let is_md = abs.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
                .unwrap_or(false);
            if is_md && abs.is_file() {
                Some(abs.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect()
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
        // Single-instance MUST be registered first, per its own docs — it
        // hooks the OS-level launch path so subsequent invocations of the
        // app's binary forward their argv to the running instance instead
        // of spawning a duplicate. Without it, double-clicking a second
        // .md file from the file manager would launch a fresh notepad
        // window every time.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths = collect_md_paths(args);
            // Bring the existing main window to the foreground so the user
            // sees the file they just double-clicked. `show()` is a no-op
            // when the window is already visible; `set_focus()` raises it.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            if !paths.is_empty() {
                if let Err(err) = app.emit("open-files", paths) {
                    eprintln!("[notepad] emit open-files failed: {}", err);
                }
            }
        }))
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

            // First-instance argv: anything matching `*.md` / `*.markdown`
            // is queued for the frontend to import once it's mounted. The
            // single-instance plugin handles every *subsequent* launch via
            // its callback above (which can emit directly because the
            // webview is alive at that point).
            let pending_opens = collect_md_paths(std::env::args());

            app.manage(AppState {
                inner: Mutex::new(AppStateInner {
                    notes_dir,
                    default_notes_dir,
                    config_path,
                    pending_opens,
                }),
            });

            // ── Native menu ────────────────────────────────────────────────
            //
            // File submenu wires custom items that emit `menu` events to the
            // webview (handled in main.js → openMd / forceSave / saveAs /
            // exportPdf / newNote). Edit submenu uses Tauri's predefined
            // platform-native items (cut/copy/paste/undo/redo/select_all)
            // which trigger the focused element's native handlers without an
            // IPC roundtrip — this is what lets <textarea> / <input> get
            // working keyboard menus on every OS.
            //
            // Accelerators chosen to NOT collide with the existing JS keydown
            // handler in main.js: Ctrl+P stays mapped to cycleView (no menu
            // accel), Export PDF uses Ctrl+Shift+P instead.
            let new_item = MenuItemBuilder::with_id("new", "New Note")
                .accelerator("CmdOrCtrl+N").build(app)?;
            let open_item = MenuItemBuilder::with_id("open", "Open File\u{2026}")
                .accelerator("CmdOrCtrl+O").build(app)?;
            let open_folder_item = MenuItemBuilder::with_id("open_folder", "Open Folder\u{2026}")
                .accelerator("CmdOrCtrl+Shift+O").build(app)?;
            let close_project_item = MenuItemBuilder::with_id("close_project", "Close Project")
                .accelerator("CmdOrCtrl+Shift+W").build(app)?;
            let save_item = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S").build(app)?;
            let save_as_item = MenuItemBuilder::with_id("save_as", "Save As\u{2026}")
                .accelerator("CmdOrCtrl+Shift+S").build(app)?;
            let export_pdf_item = MenuItemBuilder::with_id("export_pdf", "Export PDF\u{2026}")
                .accelerator("CmdOrCtrl+Shift+P").build(app)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_item)
                .item(&open_item)
                .item(&open_folder_item)
                .item(&close_project_item)
                .separator()
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&export_pdf_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let undo  = PredefinedMenuItem::undo(app, Some("Undo"))?;
            let redo  = PredefinedMenuItem::redo(app, Some("Redo"))?;
            let cut   = PredefinedMenuItem::cut(app, Some("Cut"))?;
            let copy  = PredefinedMenuItem::copy(app, Some("Copy"))?;
            let paste = PredefinedMenuItem::paste(app, Some("Paste"))?;
            let select_all = PredefinedMenuItem::select_all(app, Some("Select All"))?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&undo).item(&redo).separator()
                .item(&cut).item(&copy).item(&paste).separator()
                .item(&select_all)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &edit_menu])
                .build()?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                if matches!(
                    id,
                    "new" | "open" | "open_folder" | "close_project"
                        | "save" | "save_as" | "export_pdf"
                ) {
                    if let Err(err) = app.emit("menu", id) {
                        eprintln!("[notepad] emit menu event failed: {}", err);
                    }
                }
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
            import_md_file,
            export_md_file,
            take_pending_open_files,
            open_project_folder,
            list_project_tree,
            read_project_file,
            write_project_file,
            create_project_file,
            get_recent_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
