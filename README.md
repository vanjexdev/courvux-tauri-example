<p align="center">
  <img alt="Courvux Notepad" src="./logo.png" width="140" height="140">
</p>

<h1 align="center">courvux-tauri-notepad</h1>

<p align="center">
  Notepad demo app showing the <a href="https://github.com/vanjexdev/courvux">Courvux</a> reactive UI framework running inside <a href="https://tauri.app/">Tauri 2</a>, styled with <a href="https://tailwindcss.com/">Tailwind 4</a>, and shipping with <strong>strict CSP</strong> (<code>script-src 'self'</code>, no <code>unsafe-eval</code>) thanks to the <a href="https://github.com/vanjexdev/courvux-precompiler"><code>courvux-precompiler</code></a> Rust → WASM build-time expression compiler.
</p>

<p align="center">
  <img alt="version: 0.9.0"      src="https://img.shields.io/badge/version-0.9.0-blue">
  <img alt="courvux: 0.7.1"      src="https://img.shields.io/badge/courvux-0.7.1-success">
  <img alt="tauri: 2"            src="https://img.shields.io/badge/tauri-2-orange">
  <img alt="license: MIT"        src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

## What it shows

### Foundation

- **Courvux 0.7.1** mounted inside a Tauri WebView, with reactive computed properties, `cv-if`/`cv-else-if`/`cv-for`, two-way `cv-model`, and `@event` handlers — all the reactivity an editor UI needs without an external state manager.
- **`courvux-precompile` Vite plugin** active — every template expression is compiled to a JS arrow function at build time, so the runtime never calls `new Function`. The Tauri `tauri.conf.json` ships `script-src 'self'` and the `<meta http-equiv="Content-Security-Policy">` in `index.html` matches; no `unsafe-eval` anywhere.
- **Tailwind 4** via `@tailwindcss/vite`. Single `@import "tailwindcss"` in `src/style.css`, no config file.
- **Lucide icons** throughout the UI — toolbar, sidebar header, settings panel, file tree — bundled as static SVG strings via a tiny `lucideToSvg()` helper so re-renders are free.

### Two top-level modes

The app boots into one of two modes, switchable from the **File** menu:

- **Library mode** — the original flat notes folder owned by the app. Notes live as `<id>-<slug>.md` files with a YAML frontmatter block (`title`, `createdAt`, `updatedAt`); the slug suffix keeps filenames recognizable when you open the folder in your own file manager.
- **Project mode** — open an arbitrary folder anywhere on disk and edit its `.md` files **in place**. No slug rename, no frontmatter wrapping — the project stays usable in any other editor, in git, in static-site generators.

The chosen mode + last opened project are persisted across launches.

### Library mode

- **Markdown editing + live preview** via [`marked`](https://marked.js.org/) → [`DOMPurify`](https://github.com/cure53/DOMPurify). Three view modes — **Edit / Split / Preview** — cycle with `Ctrl+P`. The preview pane is fully sanitized so a hostile paste can't execute scripts even with strict CSP.
- **One Markdown file per note** at `<notes-dir>/<id>-<slug>.md`. Frontmatter on top, raw Markdown body below. Open in any editor, sync with Dropbox / Syncthing / git, no proprietary store.
- **Save state machine.** New notes start `unsaved` and require `Ctrl+S` (or the Save button) for the first commit. After that, every keystroke promotes the note to `dirty` and auto-saves 600 ms later. Status bar shows `○ Unsaved` / `● Saving…` / `✓ Saved`.
- **Sidebar search** (`Ctrl+F`) — case-insensitive, title-only filter against the recency-sorted list. Body search is intentionally *not* implemented — that would force loading every `.md` from disk on every keystroke. A future Rust-side advanced search can do that on demand.
- **Custom notes folder.** Settings panel (gear icon, `Ctrl+,`) lets the user pick any folder on disk as the notes location via the native folder picker. Choice persists in `<app-data>/courvux-tauri-notepad/config.json` along with the auto-save preference. "Reset to default" reverts.

### Project mode

- **Native folder picker** opens any directory as a project. Project root + recents are persisted in `config.json`; the welcome screen lists recents so re-opening is one click.
- **Tree sidebar** with chevron expand/collapse per directory and per-kind icons (folder / `.md` / image / other). Hidden files and a denylist of noisy directories (`node_modules`, `target`, `.git`, `dist`, `.venv`, …) are skipped; recursion is capped at depth 10 / 5000 entries to keep huge repos safe to open.
- **Edit `.md` in place** with the same Markdown editor as library mode. Atomic tmp + fsync + rename writes. The auto-save scheduler snapshots the active mode + key (note id or file path) so a switch never lets a stale write fire against the wrong target.
- **Image preview modal.** Click any image entry in the tree to view it inline in a backdrop modal — Esc / click-outside dismisses.
- **Inline image rendering** in the Markdown preview. `![alt](images/foo.jpg)` resolves relative to each file's parent directory and serves through Tauri's `asset://` protocol; the project root is granted to the asset scope on open.
- **Create files / folders.** "+ New" prompts for a name; `notes/2026/draft.md` creates the chain then the file, a trailing `/` makes the entry folder-only. "+ Folder" runs the same flow, folder-only. Each `/`-segment is sanitized individually so a name like `docs:bad/intro.md` becomes `docsbad/intro.md` instead of losing the slash.

### Native menu bar

Tauri's platform-native menu, wired in `src-tauri/src/lib.rs` setup:

- **File** — New Note (`Ctrl+N`) · Open File… (`Ctrl+O`) · Open Folder… (`Ctrl+Shift+O`) · Close Project (`Ctrl+Shift+W`) · Save (`Ctrl+S`) · Save As… (`Ctrl+Shift+S`) · Export PDF… (`Ctrl+Shift+P`) · Export Project as PDF… (`Ctrl+Shift+E`) · Quit
- **Edit** — Undo · Redo · Cut · Copy · Paste · Select All

Edit-menu items use Tauri's `PredefinedMenuItem` so they trigger the focused element's native handler without an IPC bounce — `<textarea>` and `<input>` get working keyboard menus on every OS for free.

### `.md` file association

`bundle.fileAssociations` in `tauri.conf.json` registers `.md` and `.markdown` (mime: `text/markdown`) so the installed app shows up as a handler in the file manager. Linux builds (`.deb` / `.rpm` / `.appimage`) pick this up via the generated `.desktop` MimeType entry.

`tauri-plugin-single-instance` (registered first, per its docs) forwards every double-click of a `.md` file to the running notepad instead of launching a fresh window. The handler raises + focuses the existing main window, then imports the path into the active notes folder via the same code path as `File → Open File`.

### PDF export

Two flows:

- **Export PDF** (single file, `Ctrl+Shift+P`) — flips to preview view and calls `window.print()`. Print CSS hides every chrome surface and reflows the rendered Markdown to a clean black-on-white page. **Caveat**: WebKit2GTK's print pipeline does not preserve `<a href>` link annotations on Linux, so links in the resulting PDF are visible but not clickable.
- **Export Project as PDF** (`Ctrl+Shift+E`) — bundles every `.md` in the project into a single PDF generated with [`jsPDF`](https://github.com/parallax/jsPDF). A hand-walked DOM walker emits headings, paragraphs, lists, code blocks, blockquotes, and images one element at a time, **with real PDF link annotations**:
  - `https://…` → URI annotation (clickable in any reader)
  - `[other](other.md)` → resolved against the project's path map and emitted as a PageJump annotation pointing at that file's first page
  - Each section starts on its own page, prefixed by its path-from-root as a colored title
  - jsPDF chunk (~600 KB with html2canvas pulled in by its bundle) is dynamically imported on first export, so the main app payload stays at ~250 KB

### UI polish

- **Window state persistence** via `tauri-plugin-window-state` — size, position, maximized, fullscreen all restored across launches.
- **Collapsible + resizable sidebar.** Drag the right edge to resize (180 px – 480 px); toggle visibility from the toolbar or `Ctrl+B`. Width and open state both persist in `localStorage`.
- **About dialog** (`Ctrl+I`) — version (read from `package.json` at build time so it can't drift), license, source link. External links go through `tauri-plugin-opener` so they open in the OS default browser instead of no-oping inside the sandboxed webview.
- **Window-close guard.** `beforeunload` blocks accidental quit while the current note is `unsaved` or `dirty`.
- **Migration from v0.1.0.** A legacy `notes.json` blob in the app-data directory is read once on startup, written out as one `.md` file per entry, and the old file is removed.

### Keyboard shortcuts

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

## Dev

```bash
pnpm install
pnpm tauri:dev
```

The first build compiles all of Tauri + the platform's webview bindings (WebKit GTK on Linux, WebView2 on Windows, WKWebView on macOS) and takes a few minutes; subsequent runs are seconds. Hot module reload works for both `src/main.js` and `src/style.css`; Rust changes inside `src-tauri/` trigger a re-link, not a full rebuild.

## Prerequisites

Common to every platform:

- **Node 18+** (`node --version`)
- **pnpm** (`pnpm --version`) — `npm install -g pnpm` if missing
- **Rust toolchain** — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Linux (Fedora 40+)

```bash
sudo dnf install -y \
    webkit2gtk4.1-devel \
    openssl-devel \
    curl wget file \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    patchelf \
    rpm-build
```

### Linux (Debian / Ubuntu)

```bash
sudo apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev \
    librsvg2-dev patchelf
```

### macOS

```bash
xcode-select --install
```

That ships everything Tauri needs (Clang, the macOS SDK, `codesign` for ad-hoc signatures during local builds).

### Windows

1. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — pick the "Desktop development with C++" workload.
2. **WebView2** is preinstalled on Windows 11 and recent Windows 10 updates. If your build target is older, install the [Evergreen runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
3. Optional bundling tools (only needed for installer artifacts): the build downloads NSIS / WiX automatically on first run.

## Build a release binary

```bash
pnpm tauri:build
```

Outputs land in `src-tauri/target/release/bundle/`:

| Platform | Bundle types Tauri produces |
|---|---|
| Linux   | `appimage/*.AppImage`, `deb/*.deb`, `rpm/*.rpm` |
| macOS   | `dmg/*.dmg`, `macos/*.app` |
| Windows | `msi/*.msi`, `nsis/*-setup.exe` |

The `bundle.targets` array in `src-tauri/tauri.conf.json` controls which formats to build. Currently set to `["appimage", "rpm", "deb"]` for the Linux Fedora-targeted host that produced this repo's first release; on macOS / Windows the CLI ignores Linux-only targets and emits the platform-native ones automatically.

To register the `.md` file association on Linux, install the produced package:

```bash
sudo dnf upgrade src-tauri/target/release/bundle/rpm/*.rpm
xdg-mime default dev.vanjex.courvux-tauri-notepad.desktop text/markdown
```

### Fedora 40+ AppImage gotcha

`linuxdeploy` ships an old `strip` binary inside its AppImage that doesn't recognize the `.relr.dyn` section type emitted by glibc on Fedora 40+. The build crashes mid-bundle with `unknown type [0x13] section .relr.dyn`. Skip the strip step (the system libraries are already stripped):

```bash
NO_STRIP=true pnpm tauri:build
```

Same workaround applies to other rolling-release distros that ship a recent glibc (Arch, openSUSE Tumbleweed). Debian / Ubuntu typically ship an older glibc and don't hit this.

### Cross-platform note

A Tauri build always produces artifacts for the **host** platform. To ship for Linux + macOS + Windows you need three machines (or three GitHub Actions runners) — there's no cross-compile story for the webview side. The Rust side cross-compiles fine, but the bundled webview can't.

If you want releases for all three from a single push, the standard pattern is a `release.yml` workflow with three matrix jobs (`ubuntu-latest`, `macos-latest`, `windows-latest`), each running `pnpm tauri:build` and uploading its artifact.

## Layout

```
courvux-tauri-example/
├── package.json                  # Vite + frontend deps; Tauri CLI as devDep
├── vite.config.js                # tailwindcss + courvuxPrecompile plugins
├── index.html                    # CSP meta + #app mount point
├── src/
│   ├── main.js                   # Courvux app — entire UI lives here
│   ├── pdf-export.js             # jsPDF DOM walker + PdfBuilder
│   ├── markdown.js               # marked + Prism + DOMPurify pipeline
│   ├── icons.js                  # Lucide → static SVG strings
│   ├── style.css                 # @import "tailwindcss" + print + markdown body
│   ├── tauri.js                  # invoke wrappers for every Rust command
│   └── assets/                   # logo, etc.
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json           # productName, window, CSP, fileAssociations, bundle
│   ├── capabilities/default.json # core + dialog + opener scope
│   ├── icons/                    # generated via `cargo tauri icon`
│   └── src/
│       ├── main.rs               # `windows_subsystem` guard + delegates to lib
│       └── lib.rs                # tauri commands + atomic file IO + menu + Builder::run
├── README.md
└── LICENSE
```

## How the precompiler works here

`vite.config.js` registers `courvux/plugin/precompile` ahead of any other transform. The plugin walks every `.js` module looking for `template:` properties whose value is a static string or template literal with no `${}` interpolations. For each one, it extracts every Courvux template expression — `{{ ... }}`, `:attr="..."`, `@event="..."`, `cv-X="..."` — and rewrites them through the [`courvux-precompiler`](https://github.com/vanjexdev/courvux-precompiler) WASM module into JS arrow functions. The compiled functions are inserted as a sibling `exprs:` property on the same component config; the runtime checks this map before falling back to `new Function`.

For this app, the build report reads:

```
[courvux-precompile] processed 1 file(s), 125 expression(s) precompiled, 0 template(s) fell back to runtime new Function.
```

Zero fallbacks → the runtime never has to call `new Function`, and the strict `script-src 'self'` CSP holds.

## Storage locations

**Library notes** (`<app-data>/courvux-tauri-notepad/notes/<id>-<slug>.md`):

```
$XDG_DATA_HOME/dev.vanjex.courvux-tauri-notepad/notes/
# typically:
~/.local/share/dev.vanjex.courvux-tauri-notepad/notes/
```

The footer of the sidebar shows the resolved storage path. Each note is one Markdown file; the slug suffix is derived from the title for human readability when you open the folder in another editor.

**App config** — same parent directory, `config.json`:

```json
{ "notesDir": null, "autoSave": true, "recentProjects": [...] }
```

`notesDir` overrides the default notes location; `recentProjects` is the most-recently-opened-folders list shown on the welcome screen.

**Window state** — `<app-data>/courvux-tauri-notepad/window-state.json`, managed by `tauri-plugin-window-state`.

**Project mode files** — wherever the user opened them. The app never copies project files to its own data dir; they stay in their original location.

`app_data_dir()` respects the bundle identifier from `tauri.conf.json`, so two installs of different bundles never share state.

## License

MIT — see [LICENSE](./LICENSE).
