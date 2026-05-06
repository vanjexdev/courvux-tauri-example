# courvux-tauri-notepad

Notepad demo app showing the [Courvux](https://github.com/vanjexdev/courvux) reactive UI framework running inside [Tauri 2](https://tauri.app/), styled with [Tailwind 4](https://tailwindcss.com/), and shipping with **strict CSP** (`script-src 'self'`, no `unsafe-eval`) thanks to the [`courvux-precompiler`](https://github.com/vanjexdev/courvux-precompiler) Rust → WASM build-time expression compiler.

![status: demo](https://img.shields.io/badge/status-demo-blue)
![courvux: 0.7.1](https://img.shields.io/badge/courvux-0.7.1-success)
![tauri: 2](https://img.shields.io/badge/tauri-2-orange)
![license: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

## What it shows

- **Courvux 0.7.1** mounted inside a Tauri WebView, with sidebar list, inline editing, and reactive computed (`wordCount`, `charCount`, `sortedNotes`, `renderedBody`).
- **`courvux-precompile` Vite plugin** active — every template expression is compiled to a JS arrow function at build time, so the runtime never calls `new Function`. The Tauri `tauri.conf.json` ships `script-src 'self'` and the `<meta http-equiv="Content-Security-Policy">` in `index.html` matches; no `unsafe-eval` anywhere.
- **Tailwind 4** via `@tailwindcss/vite`. Single `@import "tailwindcss"` in `src/style.css`, no config file.
- **Markdown editing + live preview** via [`marked`](https://marked.js.org/) → [`DOMPurify`](https://github.com/cure53/DOMPurify). Three view modes — Edit / Split / Preview — cycle with `Ctrl+P`. The preview pane is fully sanitized so a hostile paste can't execute scripts even with strict CSP.
- **One Markdown file per note** under `<app-data>/courvux-tauri-notepad/notes/<id>.md`. Files start with a YAML frontmatter block (`title`, `createdAt`, `updatedAt`) and end with the raw Markdown body. Open in any editor, sync with Dropbox / Syncthing / git, no proprietary store.
- **Save state machine.** New notes start `unsaved` and require `Ctrl+S` (or the Save button) for the first commit. After that, every keystroke promotes the note to `dirty` and auto-saves 600 ms later. Status bar shows `○ Unsaved` / `● Saving…` / `✓ Saved`.
- **Keyboard shortcuts:**
  - `Ctrl/Cmd + N` — new note
  - `Ctrl/Cmd + S` — save (force, ignores debounce)
  - `Ctrl/Cmd + P` — cycle Edit / Split / Preview
  - `Ctrl/Cmd + B` — toggle sidebar
  - `Ctrl/Cmd + ,` — open / close settings
- **Window-close guard.** `beforeunload` blocks accidental quit while the current note is `unsaved` or `dirty`.
- **Migration from v0.1.0.** If a `notes.json` file from the previous JSON-blob format exists in the app-data directory, the Rust side reads it once on startup, writes each entry as its own `.md` file, and removes the legacy file.
- **Syntax-highlighted code fences** via [Prism](https://prismjs.com/). Bundled languages: bash, css, diff, go, html/xml, java, javascript, json, markdown, python, rust, sql, toml, typescript, yaml. Tomorrow Night theme to match the dark UI.
- **Lucide icons** throughout the UI — toolbar, sidebar header, settings panel — instead of ASCII glyphs.
- **Settings panel** (gear icon, sidebar header, `Ctrl+,`) lets the user pick any folder on disk as the notes location via the native folder picker (`@tauri-apps/plugin-dialog`). Choice persists in `<app-data>/courvux-tauri-notepad/config.json`. "Reset to default" reverts.
- **Collapsible + resizable sidebar.** Drag the right edge to resize (180px – 480px); toggle visibility from the toolbar or `Ctrl+B`. Width and open state both persist in `localStorage`.

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

System packages (system → no userland workaround):

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
│   ├── style.css                 # @import "tailwindcss"
│   └── tauri.js                  # invoke wrapper (loadNotes / saveNotes / notesPath)
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json           # productName, window config, CSP, bundle targets
│   ├── icons/                    # generated via `cargo tauri icon`
│   └── src/
│       ├── main.rs               # `windows_subsystem` guard + delegates to lib
│       └── lib.rs                # tauri commands + atomic file IO + Builder::run
├── README.md
└── LICENSE
```

## How the precompiler works here

`vite.config.js` registers `courvux/plugin/precompile` ahead of any other transform. The plugin walks every `.js` module looking for `template:` properties whose value is a static string or template literal with no `${}` interpolations. For each one, it extracts every Courvux template expression — `{{ ... }}`, `:attr="..."`, `@event="..."`, `cv-X="..."` — and rewrites them through the [`courvux-precompiler`](https://github.com/vanjexdev/courvux-precompiler) WASM module into JS arrow functions. The compiled functions are inserted as a sibling `exprs:` property on the same component config; the runtime checks this map before falling back to `new Function`.

For this app, the build report reads:

```
[courvux-precompile] processed 1 file(s), 18 expression(s) precompiled, 0 template(s) fell back to runtime new Function.
```

Zero fallbacks → the runtime never has to call `new Function`, and the strict `script-src 'self'` CSP holds.

## Notes file location

The `Footer` of the sidebar shows the resolved storage path. On Linux it lands at:

```
$XDG_DATA_HOME/dev.vanjex.courvux-tauri-notepad/notes.json
# typically:
~/.local/share/dev.vanjex.courvux-tauri-notepad/notes.json
```

`app_data_dir()` respects the bundle identifier from `tauri.conf.json`, so two installs of different bundles never share state.

## License

MIT — see [LICENSE](./LICENSE).
