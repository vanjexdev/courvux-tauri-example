import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import courvuxPrecompile from 'courvux/plugin/precompile';

// Tauri exposes env vars `TAURI_PLATFORM`, `TAURI_ARCH`, etc. during dev/build.
// We read TAURI_DEV_HOST so the Vite dev server binds correctly when running
// on a remote / mobile dev target.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    plugins: [
        tailwindcss(),
        courvuxPrecompile(),
    ],

    // Tauri expects assets at the root of the bundled webview.
    // Vite default is `/` which matches; setting it explicitly so this is
    // documented when someone reads the config.
    base: './',

    // Vite dev server config — Tauri injects window into a webview, so the
    // dev server runs locally and the webview points at it.
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? { protocol: 'ws', host, port: 1421 }
            : undefined,
        watch: {
            // Don't watch src-tauri — Tauri CLI handles Rust rebuilds itself.
            ignored: ['**/src-tauri/**'],
        },
    },

    // Tauri sets TAURI_ENV_PLATFORM during build; use it for any future
    // platform-specific bundling tweaks.
    envPrefix: ['VITE_', 'TAURI_'],

    build: {
        // Tauri bundles the assets into the binary; the output goes to
        // src-tauri/dist by convention (matched in tauri.conf.json).
        outDir: 'dist',
        emptyOutDir: true,
        // Tauri webviews ship modern engines on every platform, so we can
        // target a recent baseline and skip legacy transpiles.
        target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
});
