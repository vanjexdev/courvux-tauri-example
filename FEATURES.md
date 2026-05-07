# Features

Detailed inventory of what Courvux Notepad ships with. The README has a short overview; everything below is the full picture.

## Foundation

- **Courvux 0.7.1** mounted inside a Tauri WebView, with reactive computed properties, `cv-if`/`cv-else-if`/`cv-for`, two-way `cv-model`, and `@event` handlers — all the reactivity an editor UI needs without an external state manager.
- **`courvux-precompile` Vite plugin** active — every template expression is compiled to a JS arrow function at build time, so the runtime never calls `new Function`. The Tauri `tauri.conf.json` ships `script-src 'self'` and the `<meta http-equiv="Content-Security-Policy">` in `index.html` matches; no `unsafe-eval` anywhere.
- **Tailwind 4** via `@tailwindcss/vite`. Single `@import "tailwindcss"` in `src/style.css`, no config file.
- **Lucide icons** throughout the UI — toolbar, sidebar header, settings panel, file tree — bundled as static SVG strings via a tiny `lucideToSvg()` helper so re-renders are free.

## Two top-level modes

The app boots into one of two modes, switchable from the **File** menu:

- **Library mode** — the original flat notes folder owned by the app. Notes live as `<id>-<slug>.md` files with a YAML frontmatter block (`title`, `createdAt`, `updatedAt`); the slug suffix keeps filenames recognizable when you open the folder in your own file manager.
- **Project mode** — open an arbitrary folder anywhere on disk and edit its `.md` files **in place**. No slug rename, no frontmatter wrapping — the project stays usable in any other editor, in git, in static-site generators.

The chosen mode + last opened project are persisted across launches.

## Library mode

- **Markdown editing + live preview** via [`marked`](https://marked.js.org/) → [`DOMPurify`](https://github.com/cure53/DOMPurify). Three view modes — **Edit / Split / Preview** — cycle with `Ctrl+P`. The preview pane is fully sanitized so a hostile paste can't execute scripts even with strict CSP.
- **One Markdown file per note** at `<notes-dir>/<id>-<slug>.md`. Frontmatter on top, raw Markdown body below. Open in any editor, sync with Dropbox / Syncthing / git, no proprietary store.
- **Save state machine.** New notes start `unsaved` and require `Ctrl+S` (or the Save button) for the first commit. After that, every keystroke promotes the note to `dirty` and auto-saves 600 ms later. Status bar shows `○ Unsaved` / `● Saving…` / `✓ Saved`.
- **Sidebar search** (`Ctrl+F`) — case-insensitive, title-only filter against the recency-sorted list. Body search is intentionally *not* implemented — that would force loading every `.md` from disk on every keystroke. A future Rust-side advanced search can do that on demand.
- **Custom notes folder.** Settings panel (gear icon, `Ctrl+,`) lets the user pick any folder on disk as the notes location via the native folder picker. Choice persists in `<app-data>/courvux-tauri-notepad/config.json` along with the auto-save preference. "Reset to default" reverts.

## Project mode

- **Native folder picker** opens any directory as a project. Project root + recents are persisted in `config.json`; the welcome screen lists recents so re-opening is one click.
- **Tree sidebar** with chevron expand/collapse per directory and per-kind icons (folder / `.md` / image / other). Hidden files and a denylist of noisy directories (`node_modules`, `target`, `.git`, `dist`, `.venv`, …) are skipped; recursion is capped at depth 10 / 5000 entries to keep huge repos safe to open.
- **Edit `.md` in place** with the same Markdown editor as library mode. Atomic tmp + fsync + rename writes. The auto-save scheduler snapshots the active mode + key (note id or file path) so a switch never lets a stale write fire against the wrong target.
- **Image preview modal.** Click any image entry in the tree to view it inline in a backdrop modal — Esc / click-outside dismisses.
- **Inline image rendering** in the Markdown preview. `![alt](images/foo.jpg)` resolves relative to each file's parent directory and serves through Tauri's `asset://` protocol; the project root is granted to the asset scope on open.
- **Create files / folders.** "+ New" opens an in-app modal asking for a name; `notes/2026/draft.md` creates the chain then the file, a trailing `/` makes the entry folder-only. "+ Folder" runs the same flow, folder-only. Each `/`-segment is sanitized individually so a name like `docs:bad/intro.md` becomes `docsbad/intro.md` instead of losing the slash. The modal replaces `window.prompt()` because WKWebView (macOS) deliberately strips it for security and would silently return null.
- **Select a folder as the "+ New" target.** Click any folder in the tree to mark it as the create target — the next `+ New File` / `+ Folder` lands inside that folder instead of the project root. Click the same folder again, or click the project name in the sidebar header, to deselect and fall back to root. Clicking a file (md or image) auto-selects its parent so consecutive creates stay next to whatever you're currently working on. The modal hint always tells you where the entry will land.

## Native menu bar

Tauri's platform-native menu, wired in `src-tauri/src/lib.rs` setup:

- **File** — New Note (`Ctrl+N`) · Open File… (`Ctrl+O`) · Open Folder… (`Ctrl+Shift+O`) · Close Project (`Ctrl+Shift+W`) · Save (`Ctrl+S`) · Save As… (`Ctrl+Shift+S`) · Export PDF… (`Ctrl+Shift+P`) · Export Project as PDF… (`Ctrl+Shift+E`) · Quit
- **Edit** — Undo · Redo · Cut · Copy · Paste · Select All

Edit-menu items use Tauri's `PredefinedMenuItem` so they trigger the focused element's native handler without an IPC bounce — `<textarea>` and `<input>` get working keyboard menus on every OS for free.

## `.md` file association

`bundle.fileAssociations` in `tauri.conf.json` registers `.md` and `.markdown` (mime: `text/markdown`) so the installed app shows up as a handler in the file manager. Linux builds (`.deb` / `.rpm` / `.appimage`) pick this up via the generated `.desktop` MimeType entry.

`tauri-plugin-single-instance` (registered first, per its docs) forwards every double-click of a `.md` file to the running notepad instead of launching a fresh window. The handler raises + focuses the existing main window, then imports the path into the active notes folder via the same code path as `File → Open File`.

## PDF export

Two flows:

- **Export PDF** (single file, `Ctrl+Shift+P`) — flips to preview view and calls `window.print()`. Print CSS hides every chrome surface and reflows the rendered Markdown to a clean black-on-white page. **Caveat**: WebKit2GTK's print pipeline does not preserve `<a href>` link annotations on Linux, so links in the resulting PDF are visible but not clickable.
- **Export Project as PDF** (`Ctrl+Shift+E`) — bundles every `.md` in the project into a single PDF generated with [`jsPDF`](https://github.com/parallax/jsPDF). A hand-walked DOM walker emits headings, paragraphs, lists, code blocks, blockquotes, and images one element at a time, **with real PDF link annotations**:
  - `https://…` → URI annotation (clickable in any reader)
  - `[other](other.md)` → resolved against the project's path map and emitted as a PageJump annotation pointing at that file's first page
  - Each section starts on its own page, prefixed by its path-from-root as a colored title
  - jsPDF chunk (~600 KB with html2canvas pulled in by its bundle) is dynamically imported on first export, so the main app payload stays at ~250 KB

## UI polish

- **Window state persistence** via `tauri-plugin-window-state` — size, position, maximized, fullscreen all restored across launches.
- **Collapsible + resizable sidebar.** Drag the right edge to resize (180 px – 480 px); toggle visibility from the toolbar or `Ctrl+B`. Width and open state both persist in `localStorage`.
- **About dialog** (`Ctrl+I`) — version (read from `package.json` at build time so it can't drift), license, source link. External links go through `tauri-plugin-opener` so they open in the OS default browser instead of no-oping inside the sandboxed webview.
- **Window-close guard.** `beforeunload` blocks accidental quit while the current note is `unsaved` or `dirty`.
- **Migration from v0.1.0.** A legacy `notes.json` blob in the app-data directory is read once on startup, written out as one `.md` file per entry, and the old file is removed.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + N` | New note (library) / New file in project |
| `Ctrl/Cmd + O` | Open file (import .md into notes folder) |
| `Ctrl/Cmd + Shift + O` | Open folder (project mode) |
| `Ctrl/Cmd + Shift + W` | Close project |
| `Ctrl/Cmd + S` | Save (force, ignores debounce) |
| `Ctrl/Cmd + Shift + S` | Save As… (export current note as standalone .md) |
| `Ctrl/Cmd + Shift + P` | Export current view as PDF |
| `Ctrl/Cmd + Shift + E` | Export project as PDF |
| `Ctrl/Cmd + P` | Cycle Edit / Split / Preview |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + F` | Focus sidebar search (library mode) |
| `Ctrl/Cmd + I` | About dialog |
| `Ctrl/Cmd + ,` | Settings |
| `Esc` | Close any open modal |
