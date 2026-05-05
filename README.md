# courvux-tauri-notepad

Notepad demo app showing the [Courvux](https://github.com/vanjexdev/courvux) reactive UI framework running inside [Tauri 2](https://tauri.app/), styled with [Tailwind 4](https://tailwindcss.com/), and shipping with **strict CSP** (`script-src 'self'`, no `unsafe-eval`) thanks to the [`courvux-precompiler`](https://github.com/vanjexdev/courvux-precompiler) Rust → WASM build-time expression compiler.

![status: demo](https://img.shields.io/badge/status-demo-blue)
![courvux: 0.7.0](https://img.shields.io/badge/courvux-0.7.1-success)
![tauri: 2](https://img.shields.io/badge/tauri-2-orange)
![license: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

## What it shows

- **Courvux 0.7.1** mounted inside a Tauri WebView, with sidebar list, inline editing, and reactive computed (`wordCount`, `charCount`, `sortedNotes`).
- **`courvux-precompile` Vite plugin** active — every template expression is compiled to a JS arrow function at build time, so the runtime never calls `new Function`. The Tauri `tauri.conf.json` ships `script-src 'self'` and the `<meta http-equiv="Content-Security-Policy">` in `index.html` matches; no `unsafe-eval` anywhere.
- **Tailwind 4** via `@tailwindcss/vite`. Single `@import "tailwindcss"` in `src/style.css`, no config file.
- **Disk persistence via Tauri commands.** Rust side reads/writes `notes.json` atomically (tempfile + rename) inside the platform's app-data directory. JS side calls `invoke('load_notes')` / `invoke('save_notes', { notes })` through a thin wrapper in `src/tauri.js`.
- **Keyboard shortcut** `Ctrl/Cmd + N` for new note.
- **Auto-save** debounced to 400ms after the last keystroke; the editor footer shows `● Saving…` / `✓ Saved` state.

## Dev

Prereqs:
- Node 18+
- Rust toolchain (`rustup install stable`)
- Linux: `webkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsoup-3.0-dev`, `xdg-utils` (most distros bundle these as a `tauri` group)
- macOS: Xcode CLI tools
- Windows: WebView2 (preinstalled on recent Windows 11)

```bash
pnpm install
pnpm tauri:dev
```

The first build compiles all of Tauri + WebKit GTK and takes a few minutes; subsequent runs are seconds.

## Build a release binary

```bash
pnpm tauri:build
```

Outputs land in `src-tauri/target/release/bundle/`:
- `appimage/` — Linux portable (.AppImage)
- `deb/`      — Debian package (.deb)
- `msi/`      — Windows installer (Windows host only)
- `dmg/`      — macOS disk image (macOS host only)

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
