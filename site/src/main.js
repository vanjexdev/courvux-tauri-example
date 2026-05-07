import { createApp } from 'courvux';
import './style.css';
import { ICONS, ICONS_LG } from './icons.js';

// Per-OS brand glyphs come in from svgrepo as plain black SVGs at
// 800×800. Inline them so we can swap the hardcoded `#000000` to
// `currentColor` (the install card's text class controls tint) and
// shrink the intrinsic size to 20px so they sit alongside the H3
// without overflowing.
import linuxSvgRaw   from './assets/linux.svg?raw';
import macosSvgRaw   from './assets/macos.svg?raw';
import windowsSvgRaw from './assets/windows.svg?raw';

function tintSvg(svg) {
    return svg
        .replace(/fill="#000000"/g,   'fill="currentColor"')
        .replace(/stroke="#000000"/g, 'stroke="currentColor"')
        .replace(/width="[^"]+"/,  'width="20"')
        .replace(/height="[^"]+"/, 'height="20"');
}

const OS_ICONS = {
    linux:   tintSvg(linuxSvgRaw),
    macos:   tintSvg(macosSvgRaw),
    windows: tintSvg(windowsSvgRaw),
};
// Repo + release URLs centralized so renaming or moving the project
// is a one-spot update.
const REPO = 'https://github.com/vanjexdev/courvux-tauri-example';
const VERSION = '0.9.4';
const RELEASE = `${REPO}/releases/tag/v${VERSION}`;

createApp({
    template: `
        <div cv-cloak class="min-h-screen flex flex-col">

            <!-- ── Header ────────────────────────────────────────────── -->
            <header class="sticky top-0 z-30 bg-zinc-950/85 backdrop-blur border-b border-zinc-800/80">
                <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    <a href="#main"
                       class="flex items-center gap-2.5 shrink-0"
                       aria-label="Courvux Notepad — home">
                        <img src="./logo.png" alt="" width="28" height="28" class="shrink-0" aria-hidden="true" />
                        <span class="font-semibold text-sm text-zinc-100 hidden xs:inline">Courvux Notepad</span>
                    </a>

                    <nav aria-label="Primary"
                         class="hidden md:flex items-center gap-1 text-xs text-zinc-400">
                        <a href="#features" class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Features</a>
                        <a href="#stack"    class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Stack</a>
                        <a href="#install"  class="px-3 py-2 rounded hover:text-zinc-100 hover:bg-zinc-900">Install</a>
                    </nav>

                    <div class="flex items-center gap-2">
                        <a :href="repo"
                           target="_blank" rel="noopener"
                           class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900"
                           aria-label="View source on GitHub">
                            <span cv-html.raw="icons.github" aria-hidden="true"></span>
                            <span>GitHub</span>
                        </a>
                        <button
                            @click="mobileNavOpen = !mobileNavOpen"
                            :aria-expanded="mobileNavOpen ? 'true' : 'false'"
                            aria-controls="mobile-nav"
                            aria-label="Toggle navigation"
                            class="md:hidden p-2 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900">
                            <span cv-html.raw="icons.menu" aria-hidden="true"></span>
                        </button>
                    </div>
                </div>

                <nav id="mobile-nav"
                     cv-show="mobileNavOpen"
                     aria-label="Mobile"
                     class="md:hidden border-t border-zinc-800/80 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 py-2 flex flex-col text-sm">
                        <a href="#features" @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Features</a>
                        <a href="#stack"    @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Stack</a>
                        <a href="#install"  @click="mobileNavOpen = false" class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300">Install</a>
                        <a :href="repo" target="_blank" rel="noopener"
                           class="px-2 py-2 rounded hover:bg-zinc-900 text-zinc-300 inline-flex items-center gap-1.5">
                            <span cv-html.raw="icons.github" aria-hidden="true"></span>
                            <span>GitHub</span>
                        </a>
                    </div>
                </nav>
            </header>

            <main id="main" class="flex-1">

                <!-- ── Hero ──────────────────────────────────────────── -->
                <section class="hero-glow relative">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-12 items-center">

                        <div class="space-y-6">
                            <div class="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider">
                                <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">v{{ version }}</span>
                                <span class="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">MIT</span>
                                <span class="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">Linux · macOS · Windows</span>
                            </div>

                            <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-zinc-100 leading-tight tracking-tight">
                                A native Markdown notepad,<br/>
                                <span class="text-emerald-400">strict CSP</span> by default.
                            </h1>

                            <p class="text-base md:text-lg text-zinc-400 leading-relaxed max-w-xl">
                                Built on <a :href="links.courvux" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Courvux</a> + <a :href="links.tauri" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Tauri 2</a>. Edit a flat library or open any folder as a project — your files stay in plain Markdown, on your disk, in your git.
                            </p>

                            <div class="flex flex-wrap items-center gap-3">
                                <a :href="release"
                                   target="_blank" rel="noopener"
                                   class="inline-flex items-center gap-2 px-5 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm">
                                    <span cv-html.raw="iconsLg.download" aria-hidden="true"></span>
                                    <span>Download v{{ version }}</span>
                                </a>
                                <a :href="repo"
                                   target="_blank" rel="noopener"
                                   class="inline-flex items-center gap-2 px-5 py-3 rounded border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white font-semibold text-sm">
                                    <span cv-html.raw="iconsLg.github" aria-hidden="true"></span>
                                    <span>View on GitHub</span>
                                </a>
                            </div>

                            <p class="text-xs text-zinc-500 pt-2">
                                One Markdown file per note, atomic writes, no proprietary store. Sync with Dropbox / Syncthing / git.
                            </p>
                        </div>

                        <!-- Hero mockup — HTML/CSS recreation of the live UI. -->
                        <div class="mockup-window rounded-lg overflow-hidden bg-zinc-950 text-xs select-none"
                             role="img"
                             aria-label="Screenshot of the Courvux Notepad UI showing a project sidebar, a Markdown editor with a code block, and a rendered preview pane.">
                            <!-- Title bar -->
                            <div class="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/80">
                                <span class="w-2.5 h-2.5 rounded-full bg-red-500/70" aria-hidden="true"></span>
                                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/70" aria-hidden="true"></span>
                                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/70" aria-hidden="true"></span>
                                <span class="ml-2 text-[10px] text-zinc-500">Courvux Notepad</span>
                            </div>

                            <div class="grid grid-cols-[34%_1fr] min-h-[320px]">
                                <!-- Sidebar -->
                                <aside class="border-r border-zinc-800 p-2 space-y-0.5 bg-zinc-900/40">
                                    <div class="flex items-center justify-between mb-2 px-1">
                                        <span class="font-semibold text-[11px] text-zinc-300 truncate">notes-project</span>
                                        <span cv-html.raw="icons.plus" class="text-emerald-400" aria-hidden="true"></span>
                                    </div>
                                    <div cv-for="entry in mockTree"
                                         :key="entry.name"
                                         :style="'padding-left:' + (entry.depth * 12 + 8) + 'px'"
                                         :class="entry.active ? 'bg-emerald-500/10 border-l-2 border-emerald-500 -ml-px' : ''"
                                         class="py-1 pr-2 flex items-center gap-1.5 text-[11px] text-zinc-300 rounded">
                                        <span cv-html.raw="iconForKind(entry.kind)"
                                              :class="entry.kind === 'dir' ? 'text-amber-500/80' : entry.kind === 'image' ? 'text-blue-400' : 'text-zinc-400'"
                                              aria-hidden="true"></span>
                                        <span class="truncate">{{ entry.name }}</span>
                                    </div>
                                </aside>

                                <!-- Main: editor + preview -->
                                <div class="grid grid-rows-[auto_1fr] min-w-0">
                                    <div class="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2 bg-zinc-900/40">
                                        <span class="text-zinc-100 text-xs font-semibold truncate">intro.md</span>
                                        <div class="flex items-center gap-1.5 shrink-0">
                                            <span class="px-1.5 py-0.5 rounded text-[9px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 inline-flex items-center gap-0.5">
                                                <span cv-html.raw="icons.check" aria-hidden="true"></span>
                                                <span>Saved</span>
                                            </span>
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 min-h-0">
                                        <pre class="px-3 py-2 text-[10px] text-zinc-300 leading-relaxed border-r border-zinc-800 overflow-hidden whitespace-pre-wrap font-mono"># Hello, project mode

Drop a folder, edit in place.
Images render via &lt;code&gt;asset://&lt;/code&gt;.

\`\`\`js
import { createApp } from 'courvux';
createApp({ ... }).mount('#app');
\`\`\`</pre>
                                        <div class="px-3 py-2 text-[10px] leading-relaxed overflow-hidden">
                                            <h1 class="text-zinc-100 font-bold text-sm mb-1">Hello, project mode</h1>
                                            <p class="text-zinc-300 mb-1.5">Drop a folder, edit in place. Images render via <code class="bg-zinc-900 px-1 rounded text-fuchsia-300 text-[9px]">asset://</code>.</p>
                                            <pre class="bg-zinc-900 border border-zinc-800 rounded p-1.5 text-[9px] text-zinc-200 leading-tight overflow-hidden"><span class="text-purple-400">import</span> { createApp } <span class="text-purple-400">from</span> <span class="text-emerald-300">'courvux'</span>;
createApp({ ... }).mount(<span class="text-emerald-300">'#app'</span>);</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── Features ──────────────────────────────────────── -->
                <section id="features" class="border-t border-zinc-900 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
                        <header class="mb-10 md:mb-14 max-w-2xl">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Features</p>
                            <h2 class="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">Everything a writing app needs, nothing it doesn't.</h2>
                            <p class="text-zinc-400 text-sm md:text-base leading-relaxed">
                                A flat notes library for quick capture. A project mode for serious work. Native menus, file associations, and a real PDF export with clickable links.
                            </p>
                        </header>

                        <ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            <li cv-for="f in features" :key="f.title"
                                class="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition-colors">
                                <div class="w-9 h-9 rounded-md bg-emerald-500/10 text-emerald-300 inline-flex items-center justify-center mb-3"
                                     :aria-hidden="true">
                                    <span cv-html.raw="iconsLg[f.icon]"></span>
                                </div>
                                <h3 class="text-zinc-100 font-semibold mb-1.5">{{ f.title }}</h3>
                                <p class="text-zinc-400 text-sm leading-relaxed">{{ f.body }}</p>
                            </li>
                        </ul>
                    </div>
                </section>

                <!-- ── Stack strip ───────────────────────────────────── -->
                <section id="stack" class="border-t border-zinc-900 bg-zinc-900/30">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
                        <header class="text-center mb-8">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Stack</p>
                            <h2 class="text-xl md:text-2xl font-bold text-zinc-100">Composed of small, sharp pieces.</h2>
                        </header>
                        <ul class="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-xs">
                            <li cv-for="s in stack" :key="s.name"
                                class="px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300">
                                <a :href="s.url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 hover:text-zinc-100">
                                    <span class="text-emerald-400">{{ s.name }}</span>
                                    <span class="text-zinc-500">{{ s.version }}</span>
                                </a>
                            </li>
                        </ul>
                    </div>
                </section>

                <!-- ── Install ───────────────────────────────────────── -->
                <section id="install" class="border-t border-zinc-900 bg-zinc-950">
                    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
                        <header class="mb-10 md:mb-14 max-w-2xl">
                            <p class="text-xs uppercase tracking-wider text-emerald-400 mb-2">Install</p>
                            <h2 class="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">Grab a build, or compile from source.</h2>
                            <p class="text-zinc-400 text-sm md:text-base leading-relaxed">
                                Each release ships native bundles for the major desktops. Tauri can't cross-compile the bundled webview, so each platform's artifact is built on its own host.
                            </p>
                        </header>

                        <div class="grid gap-5 md:grid-cols-3">
                            <article cv-for="p in platforms" :key="p.name"
                                     class="p-5 rounded-lg bg-zinc-900/40 border border-zinc-800 flex flex-col">
                                <header class="flex items-center justify-between gap-2 mb-4">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span cv-html.raw="p.iconSvg"
                                              class="text-zinc-200 inline-flex shrink-0"
                                              aria-hidden="true"></span>
                                        <h3 class="text-zinc-100 font-semibold truncate">{{ p.name }}</h3>
                                    </div>
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0">{{ p.formats }}</span>
                                </header>
                                <pre class="text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded p-3 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all flex-1">{{ p.cmd }}</pre>
                                <footer class="mt-4 flex items-start justify-between gap-3 text-xs">
                                    <a :href="release" target="_blank" rel="noopener"
                                       class="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 shrink-0">
                                        <span>Download</span>
                                        <span cv-html.raw="icons.externalLink" aria-hidden="true"></span>
                                    </a>
                                    <span class="text-zinc-500 text-right">{{ p.note }}</span>
                                </footer>
                            </article>
                        </div>

                        <p class="mt-8 text-xs text-zinc-500 max-w-3xl">
                            Or build from source — clone the repo, install your platform's Tauri prerequisites, then run <code class="px-1 rounded bg-zinc-900 text-zinc-300">pnpm tauri build</code>. See the <a :href="readme" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">README</a> for the per-OS dependency list.
                        </p>
                    </div>
                </section>
            </main>

            <!-- ── Footer ────────────────────────────────────────────── -->
            <footer class="border-t border-zinc-900 bg-zinc-950">
                <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 justify-between text-xs text-zinc-500">
                    <div class="flex items-center gap-2">
                        <img src="./logo.png" alt="" width="20" height="20" aria-hidden="true" />
                        <span>© {{ year }} Vanjex · MIT</span>
                    </div>
                    <nav aria-label="Footer" class="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <a :href="repo" target="_blank" rel="noopener" class="hover:text-zinc-300">Repository</a>
                        <a :href="readme" target="_blank" rel="noopener" class="hover:text-zinc-300">README</a>
                        <a :href="release" target="_blank" rel="noopener" class="hover:text-zinc-300">Releases</a>
                        <a :href="links.courvux" target="_blank" rel="noopener" class="hover:text-zinc-300">Courvux</a>
                    </nav>
                </div>
                <p class="max-w-6xl mx-auto px-4 sm:px-6 pb-6 text-xs text-zinc-500 text-center">
                    This landing is built with
                    <a :href="links.courvux" target="_blank" rel="noopener" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4">Courvux</a>
                    itself — 382 lines of <code class="text-zinc-400">main.js</code>, no extra frameworks.
                </p>
            </footer>
        </div>
    `,
    data: {
        version: VERSION,
        repo: REPO,
        release: RELEASE,
        readme: `${REPO}/blob/main/README.md`,
        year: new Date().getFullYear(),
        mobileNavOpen: false,

        icons: ICONS,
        iconsLg: ICONS_LG,

        // External links surfaced from the hero / footer.
        links: {
            courvux: 'https://github.com/vanjexdev/courvux',
            tauri:   'https://tauri.app/',
        },

        // Mock project tree shown inside the hero mockup. Kept short
        // so it reads at a glance instead of requiring the visitor to
        // parse a deeply-nested directory.
        mockTree: [
            { name: 'docs',       kind: 'dir',   depth: 0, active: false },
            { name: 'intro.md',   kind: 'md',    depth: 1, active: true  },
            { name: 'setup.md',   kind: 'md',    depth: 1, active: false },
            { name: 'images',     kind: 'dir',   depth: 0, active: false },
            { name: 'logo.png',   kind: 'image', depth: 1, active: false },
            { name: 'README.md',  kind: 'md',    depth: 0, active: false },
            { name: 'CHANGELOG.md', kind: 'md',  depth: 0, active: false },
        ],

        features: [
            {
                icon: 'layers',
                title: 'Library + Project modes',
                body: 'Quick-capture flat notes folder owned by the app, or open any directory as a project and edit its files in place — no copy, no slug rename, no frontmatter.',
            },
            {
                icon: 'menu',
                title: 'Native menu bar',
                body: 'Real File / Edit submenus with platform-native cut / copy / paste / undo / redo. Accelerators for new note, save as, open folder, export PDF.',
            },
            {
                icon: 'file',
                title: '.md file association',
                body: 'Double-click any Markdown file in the file manager — the running notepad imports it. Single-instance plugin keeps everything in one window.',
            },
            {
                icon: 'link',
                title: 'Live PDF link export',
                body: 'Bundle every .md in the project into a single PDF with real link annotations. Cross-doc references jump to the right page; URLs stay clickable.',
            },
            {
                icon: 'lock',
                title: 'Strict CSP',
                body: "script-src 'self', no unsafe-eval. Build-time precompiler turns every Courvux template expression into a JS function — runtime never calls new Function.",
            },
            {
                icon: 'image',
                title: 'Inline images + preview',
                body: "Markdown image links resolve via Tauri's asset:// protocol from each file's parent directory. Click any image in the tree for a full-screen preview.",
            },
        ],

        stack: [
            { name: 'Tauri',     version: '2',     url: 'https://tauri.app/' },
            { name: 'Courvux',   version: '0.7.1', url: 'https://github.com/vanjexdev/courvux' },
            { name: 'Tailwind',  version: '4',     url: 'https://tailwindcss.com/' },
            { name: 'jsPDF',     version: '4',     url: 'https://github.com/parallax/jsPDF' },
            { name: 'marked',    version: '18',    url: 'https://marked.js.org/' },
            { name: 'Prism',     version: '1',     url: 'https://prismjs.com/' },
            { name: 'Lucide',    version: '1',     url: 'https://lucide.dev/' },
        ],

        platforms: [
            {
                name: 'Linux',
                iconSvg: OS_ICONS.linux,
                formats: 'rpm · deb · AppImage',
                cmd: `sudo dnf install ./Courvux\\ Notepad-${VERSION}-1.x86_64.rpm`,
                note: 'Fedora 40+',
            },
            {
                name: 'macOS',
                iconSvg: OS_ICONS.macos,
                formats: 'dmg · app',
                cmd: `# Mount the .dmg, drag Courvux Notepad.app to Applications.\n# First launch: right-click → Open (unsigned).`,
                note: 'Universal (Apple Silicon + Intel)',
            },
            {
                name: 'Windows',
                iconSvg: OS_ICONS.windows,
                formats: 'msi · exe',
                cmd: `# Double-click the .msi installer (recommended), or:\nmsiexec /i "Courvux Notepad_${VERSION}_x64_en-US.msi"`,
                note: 'WebView2 — SmartScreen warns on first run',
            },
        ],
    },
    methods: {
        // Map a tree-entry kind to the matching lucide icon. Kept as a
        // method so the template stays declarative — Courvux re-runs
        // it on each render but the inputs are tiny.
        iconForKind(kind) {
            if (kind === 'dir')   return this.icons.folderTree;
            if (kind === 'image') return this.icons.image;
            return this.icons.file;
        },
    },
}).mount('#app');
