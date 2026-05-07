<p align="center">
  <img alt="Courvux Notepad" src="./logo.png" width="140" height="140">
</p>

<h1 align="center">courvux-tauri-notepad</h1>

<p align="center">
  Notepad demo app showing the <a href="https://github.com/vanjexdev/courvux">Courvux</a> reactive UI framework running inside <a href="https://tauri.app/">Tauri 2</a>, styled with <a href="https://tailwindcss.com/">Tailwind 4</a>, and shipping with <strong>strict CSP</strong> (<code>script-src 'self'</code>, no <code>unsafe-eval</code>) thanks to the <a href="https://github.com/vanjexdev/courvux-precompiler"><code>courvux-precompiler</code></a> Rust → WASM build-time expression compiler.
</p>

<p align="center">
  <img alt="version: 0.9.3"      src="https://img.shields.io/badge/version-0.9.3-blue">
  <img alt="courvux: 0.7.1"      src="https://img.shields.io/badge/courvux-0.7.1-success">
  <img alt="tauri: 2"            src="https://img.shields.io/badge/tauri-2-orange">
  <img alt="license: MIT"        src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

## What it shows

A complete Markdown notepad with two top-level modes:

- **Library mode** — flat notes folder owned by the app, one `.md` per note with YAML frontmatter.
- **Project mode** — open any folder anywhere on disk and edit `.md` files in place. Native folder picker, file tree, image preview, inline image rendering via `asset://`.

Plus: native menu bar (File / Edit), `.md` file associations, single-instance handling, PDF export with real link annotations, sidebar search, save state machine, atomic writes.

**Strict CSP** (`script-src 'self'`, no `unsafe-eval`) thanks to the `courvux-precompile` Vite plugin.

**See [`FEATURES.md`](./FEATURES.md) for the complete feature list.**

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
[courvux-precompile] processed 1 file(s), 134 expression(s) precompiled, 0 template(s) fell back to runtime new Function.
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
