import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import courvuxPrecompile from 'courvux/plugin/precompile';

// Landing page for the Notepad project. Builds into the repo's
// top-level `docs/` folder so GitHub Pages can serve it directly
// without a deploy workflow (Settings → Pages → branch: main, folder
// `/docs`).
//
// `base` is set to the repo name so asset URLs resolve under
// `https://vanjexdev.github.io/courvux-tauri-example/...`. If the
// repo or org slug ever changes, update this.
export default defineConfig({
    base: '/courvux-tauri-example/',
    plugins: [
        tailwindcss(),
        courvuxPrecompile(),
    ],
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: '../docs',
        emptyOutDir: true,
        // Modern target — anyone visiting from a current browser; we
        // don't need IE / old Safari support for a docs site.
        target: 'es2020',
    },
});
