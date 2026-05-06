import { createApp } from 'courvux';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';

import {
    listNotes, readNote, writeNote, deleteNote,
    notesDir, defaultNotesDir, setNotesDir, resetNotesDir,
    getAutoSave, setAutoSave,
    importMd, exportMd,
} from './tauri.js';
import { renderMarkdown } from './markdown.js';
import { ICONS } from './icons.js';
// Vite bundles the asset and gives us a hashed URL; the bundled webview
// serves it from the same origin so the strict CSP `img-src 'self' data:`
// keeps holding.
import logoUrl from './assets/logo.png';
// Reading the version straight from package.json keeps the About dialog
// in sync with whatever `pnpm version` last bumped — no second source
// of truth to update on every release.
import { version as APP_VERSION } from '../package.json';

// Note: we used to lean on a generic `debounce()` helper for the auto-save
// schedule, but that hides the timer from the caller. The auto-save needs
// to be cancelable from outside (so a fast Save/select doesn't race the
// pending write), and the inline scheduler in onMount() exposes both
// `schedule` and `cancel` through closure.

// Sidebar width is a UI preference, not a per-note value — persist in
// localStorage so it survives across sessions on the same install.
const SIDEBAR_WIDTH_KEY = 'courvux-notepad:sidebar-width';
const SIDEBAR_OPEN_KEY  = 'courvux-notepad:sidebar-open';
const VIEW_MODE_KEY     = 'courvux-notepad:view-mode';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;

createApp({
    template: `
        <div cv-cloak class="flex h-full">
            <!-- ── Sidebar ─────────────────────────────────────────────── -->
            <aside
                cv-show="sidebarOpen"
                :style="'width:' + sidebarWidth + 'px; min-width:' + sidebarWidth + 'px'"
                class="shrink-0 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur flex flex-col relative">

                <header class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
                    <h1 class="text-sm font-semibold tracking-wide text-zinc-300 truncate inline-flex items-center gap-2">
                        <img :src="logoUrl" alt="" width="20" height="20" class="shrink-0" aria-hidden="true" />
                        <span>Notepad</span>
                    </h1>
                    <div class="flex items-center gap-1">
                        <button
                            @click="aboutOpen = true"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="About this app"
                            title="About (Ctrl+I)">
                            <span cv-html.raw="icons.info" aria-hidden="true"></span>
                        </button>
                        <button
                            @click="openSettings()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="Open settings"
                            title="Settings (Ctrl+,)">
                            <span cv-html.raw="icons.settings" aria-hidden="true"></span>
                        </button>
                        <button
                            @click="newNote()"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                            title="New note (Ctrl+N)">
                            <span cv-html.raw="icons.plus"></span>
                            <span>New</span>
                        </button>
                    </div>
                </header>

                <!-- Title-only search. Body search would force loading
                     every .md from disk on each keystroke (against the
                     lazy-load pattern); leaving that for a future
                     "advanced search" command that can hit Rust directly. -->
                <div class="px-3 py-2 border-b border-zinc-800">
                    <div class="relative">
                        <span cv-html.raw="icons.search"
                              aria-hidden="true"
                              class="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"></span>
                        <input
                            type="search"
                            cv-model="searchQuery"
                            placeholder="Search notes…"
                            aria-label="Filter notes by title"
                            class="w-full pl-7 pr-7 py-1.5 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60" />
                        <button
                            cv-if="searchQuery"
                            @click="searchQuery = ''"
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-100"
                            aria-label="Clear search">
                            <span cv-html.raw="icons.x" aria-hidden="true"></span>
                        </button>
                    </div>
                </div>

                <ul class="flex-1 overflow-y-auto py-2">
                    <li cv-if="notes.length === 0" class="px-4 py-6 text-xs text-zinc-500 text-center">
                        No notes yet. Click <span class="text-emerald-400">+ New</span> to create one.
                    </li>
                    <li cv-else-if="filteredNotes.length === 0" class="px-4 py-6 text-xs text-zinc-500 text-center">
                        No notes match "<span class="text-zinc-300">{{ searchQuery }}</span>".
                    </li>
                    <li cv-for="note in filteredNotes"
                        :key="note.id"
                        @click="select(note.id)"
                        :class="note.id === selectedId
                            ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                            : 'border-l-2 border-transparent hover:bg-zinc-800/50'"
                        class="px-4 py-2 cursor-pointer">
                        <div class="text-sm font-medium truncate flex items-center gap-1.5">
                            <span cv-if="note.id === selectedId && saveStatus !== 'saved'"
                                  class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                  :class="saveStatus === 'unsaved' ? 'bg-amber-500' : 'bg-blue-400'"
                                  :title="saveStatus"></span>
                            <span class="truncate">{{ note.title.trim() || 'Untitled' }}</span>
                        </div>
                        <div class="text-xs text-zinc-500 truncate mt-0.5">
                            {{ formatDate(note.updatedAt) }}
                        </div>
                    </li>
                </ul>

                <footer class="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 truncate"
                        :title="storageDir">
                    {{ storageDir || 'Loading…' }}
                </footer>

                <!-- Drag handle on the right edge to resize the sidebar.
                     Hidden from the a11y tree because there's no keyboard
                     equivalent yet — Ctrl+B toggle is the screen-reader
                     story. Future: arrow-key resize when focused. -->
                <div
                    @mousedown="startResize($event)"
                    class="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-emerald-500/50"
                    :class="resizing ? 'bg-emerald-500/70' : ''"
                    aria-hidden="true"
                    title="Drag to resize"></div>
            </aside>

            <!-- ── Editor ──────────────────────────────────────────────── -->
            <main class="flex-1 flex flex-col bg-zinc-950 min-w-0">
                <!-- Toolbar with the sidebar toggle is always shown so the user can re-open the sidebar. -->
                <div cv-if="!selected" class="flex-1 flex flex-col">
                    <header class="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                        <button
                            @click="toggleSidebar()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            :aria-label="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
                            :aria-expanded="sidebarOpen ? 'true' : 'false'"
                            :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'">
                            <span cv-html.raw="sidebarOpen ? icons.sidebarClose : icons.sidebarOpen" aria-hidden="true"></span>
                        </button>
                    </header>
                    <div class="flex-1 flex items-center justify-center text-zinc-600">
                        <div class="text-center">
                            <div class="mb-4 inline-flex p-4 rounded-full bg-zinc-900 text-zinc-700">
                                <span cv-html.raw="iconsLg.file"></span>
                            </div>
                            <p class="text-sm">Select a note from the sidebar, or create a new one.</p>
                            <p class="text-xs mt-2 text-zinc-700">Ctrl+N · new · Ctrl+S · save · Ctrl+P · cycle view · Ctrl+B · toggle sidebar</p>
                        </div>
                    </div>
                </div>

                <div cv-else class="flex-1 flex flex-col min-h-0">
                    <header class="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                        <button
                            @click="toggleSidebar()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            :aria-label="sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'"
                            :aria-expanded="sidebarOpen ? 'true' : 'false'"
                            :title="sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'">
                            <span cv-html.raw="sidebarOpen ? icons.sidebarClose : icons.sidebarOpen" aria-hidden="true"></span>
                        </button>

                        <input
                            type="text"
                            cv-model="selected.title"
                            @input="onEdit()"
                            placeholder="Untitled"
                            class="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600" />

                        <button
                            @click="cycleView()"
                            class="px-2 py-1 text-xs rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 inline-flex items-center gap-1.5"
                            :title="'View: ' + viewMode + ' (Ctrl+P)'">
                            <span cv-html.raw="viewMode === 'edit' ? icons.edit : viewMode === 'split' ? icons.split : icons.eye"></span>
                            <span class="capitalize">{{ viewMode }}</span>
                        </button>

                        <button
                            @click="forceSave()"
                            :disabled="saveStatus === 'saved' || saveStatus === 'saving'"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1"
                            title="Save (Ctrl+S)">
                            <span cv-html.raw="saveStatus === 'saved' ? icons.check : icons.save"></span>
                            <span>{{ saveStatus === 'saved' ? 'Saved' : 'Save' }}</span>
                        </button>

                        <button
                            @click="confirmDelete(selected.id)"
                            class="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            aria-label="Delete this note"
                            title="Delete this note">
                            <span cv-html.raw="icons.trash" aria-hidden="true"></span>
                        </button>
                    </header>

                    <div class="flex-1 flex min-h-0">
                        <textarea
                            cv-show="viewMode === 'edit' || viewMode === 'split'"
                            cv-model="selected.body"
                            @input="onEdit()"
                            placeholder="Start writing in **Markdown**…"
                            :class="viewMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'flex-1'"
                            class="px-6 py-4 bg-transparent text-zinc-200 outline-none resize-none placeholder:text-zinc-600 leading-relaxed font-mono text-sm"></textarea>

                        <div
                            cv-show="viewMode === 'preview' || viewMode === 'split'"
                            :class="viewMode === 'split' ? 'w-1/2' : 'flex-1'"
                            class="px-6 py-4 overflow-y-auto markdown-body"
                            cv-html="renderedBody"></div>
                    </div>

                    <footer class="px-6 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
                        <span>{{ wordCount }} words · {{ charCount }} chars · id {{ selected.id }}</span>
                        <span :class="statusColor">{{ statusLabel }}</span>
                    </footer>
                </div>
            </main>

            <!-- ── Settings modal ──────────────────────────────────────── -->
            <div cv-if="settingsOpen"
                 @click.self="settingsOpen = false"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="settings-title"
                 class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
                    <header class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <h2 id="settings-title" class="text-sm font-semibold text-zinc-100 inline-flex items-center gap-2">
                            <span cv-html.raw="icons.settings" aria-hidden="true"></span>
                            <span>Settings</span>
                        </h2>
                        <button
                            @click="settingsOpen = false"
                            class="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="Close settings"
                            title="Close">
                            <span cv-html.raw="icons.x" aria-hidden="true"></span>
                        </button>
                    </header>

                    <div class="px-5 py-4 space-y-4">
                        <!-- Inline status banner. Shown when an action in
                             this panel finishes with success or failure;
                             dismiss with X. Replaces the previous
                             alert()-based path so failures (write-probe
                             rejected a folder, set_auto_save couldn't
                             reach config.json) don't yank focus. -->
                        <div cv-if="settingsError"
                             role="alert"
                             class="px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-300 flex items-start gap-2">
                            <span class="flex-1">{{ settingsError }}</span>
                            <button @click="clearSettingsBanner()"
                                    class="text-red-300/70 hover:text-red-200 shrink-0"
                                    aria-label="Dismiss error">
                                <span cv-html.raw="icons.x" aria-hidden="true"></span>
                            </button>
                        </div>
                        <div cv-if="settingsSuccess"
                             role="status"
                             class="px-3 py-2 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300 flex items-start gap-2">
                            <span class="flex-1">{{ settingsSuccess }}</span>
                            <button @click="clearSettingsBanner()"
                                    class="text-emerald-300/70 hover:text-emerald-200 shrink-0"
                                    aria-label="Dismiss">
                                <span cv-html.raw="icons.x" aria-hidden="true"></span>
                            </button>
                        </div>

                        <div>
                            <label class="block text-xs font-medium text-zinc-400 mb-1.5">Notes folder</label>
                            <div class="flex items-center gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 font-mono break-all">
                                <span cv-html.raw="icons.folder" class="text-zinc-500 shrink-0"></span>
                                <span class="flex-1">{{ storageDir || '—' }}</span>
                            </div>
                            <p cv-if="!isCustomDir" class="text-[11px] text-zinc-600 mt-1">
                                Default location for this app's data on this machine.
                            </p>
                            <p cv-else class="text-[11px] text-amber-500 mt-1">
                                Custom folder. Notes load from here instead of the default location.
                            </p>
                        </div>

                        <div class="flex gap-2">
                            <button
                                @click="pickFolder()"
                                class="flex-1 px-3 py-2 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center justify-center gap-1.5">
                                <span cv-html.raw="icons.folder"></span>
                                <span>Choose folder…</span>
                            </button>
                            <button
                                @click="resetFolder()"
                                :disabled="!isCustomDir"
                                class="px-3 py-2 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed">
                                Reset to default
                            </button>
                        </div>

                        <!-- Auto-save toggle. Persisted in config.json on
                             the Rust side, so the choice survives across
                             devices that share the notes folder. -->
                        <div class="pt-3 border-t border-zinc-800">
                            <label class="flex items-start gap-3 cursor-pointer select-none">
                                <button
                                    type="button"
                                    role="switch"
                                    @click="toggleAutoSave()"
                                    :aria-checked="autoSaveEnabled ? 'true' : 'false'"
                                    :class="autoSaveEnabled ? 'bg-emerald-600' : 'bg-zinc-700'"
                                    class="relative inline-flex shrink-0 h-5 w-9 items-center rounded-full transition-colors">
                                    <span :class="autoSaveEnabled ? 'translate-x-5' : 'translate-x-1'"
                                          class="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"></span>
                                </button>
                                <div class="flex-1 min-w-0" @click="toggleAutoSave()">
                                    <div class="text-xs font-medium text-zinc-200">Auto-save while editing</div>
                                    <p class="text-[11px] text-zinc-600 mt-0.5">
                                        When on, edits to a saved note persist 600&nbsp;ms after the last
                                        keystroke. Off keeps notes in <span class="text-blue-400">dirty</span>
                                        state until you press Ctrl+S explicitly. New notes always require
                                        an explicit first save regardless of this setting.
                                    </p>
                                </div>
                            </label>
                        </div>

                        <div class="text-[11px] text-zinc-600 pt-2 border-t border-zinc-800">
                            Pick a folder you sync (Dropbox, Syncthing, git) to keep your notes
                            available across devices. Each note is one <code class="text-zinc-400">.md</code> file —
                            you can edit them in any text editor while the app is closed.
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── About modal ─────────────────────────────────────────── -->
            <div cv-if="aboutOpen"
                 @click.self="aboutOpen = false"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="about-title"
                 class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
                    <header class="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <h2 id="about-title" class="text-sm font-semibold text-zinc-100 inline-flex items-center gap-2">
                            <span cv-html.raw="icons.info" aria-hidden="true"></span>
                            <span>About</span>
                        </h2>
                        <button
                            @click="aboutOpen = false"
                            class="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="Close about"
                            title="Close">
                            <span cv-html.raw="icons.x" aria-hidden="true"></span>
                        </button>
                    </header>

                    <div class="px-5 py-6 text-center">
                        <img :src="logoUrl" alt="Courvux Notepad" width="96" height="96"
                             class="mx-auto mb-4" />
                        <h3 class="text-base font-semibold text-zinc-100">Courvux Notepad</h3>
                        <p class="text-xs text-zinc-500 mt-1">Version {{ appVersion }}</p>
                        <p class="text-xs text-zinc-400 mt-4 leading-relaxed">
                            Notepad demo built with the
                            <a href="#"
                               @click.prevent="openExternal('https://github.com/vanjexdev/courvux')"
                               class="text-emerald-400 hover:text-emerald-300 cursor-pointer">Courvux</a>
                            reactive UI framework, running inside
                            <a href="#"
                               @click.prevent="openExternal('https://tauri.app/')"
                               class="text-emerald-400 hover:text-emerald-300 cursor-pointer">Tauri 2</a>
                            with strict CSP and no
                            <code class="text-zinc-500">unsafe-eval</code>.
                        </p>
                    </div>

                    <footer class="px-5 py-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                        <span>MIT · © {{ appYear }} Vanjex</span>
                        <a href="#"
                           @click.prevent="openExternal('https://github.com/vanjexdev/courvux-tauri-example')"
                           class="text-emerald-400 hover:text-emerald-300 cursor-pointer">View source ↗</a>
                    </footer>
                </div>
            </div>
        </div>
    `,
    data: {
        notes: [],
        selectedId: null,
        saveStatus: 'saved',
        viewMode: 'split',
        storageDir: '',
        defaultDir: '',

        // UI prefs persisted in localStorage.
        sidebarOpen: true,
        sidebarWidth: 256,
        resizing: false,

        // Sidebar search — title-only filter. Empty string = show all.
        searchQuery: '',

        settingsOpen: false,
        aboutOpen: false,
        // Inlined at build time from package.json so the About dialog
        // can't drift from the actual release version. The year is stamped
        // when the app starts — reasonable for a demo; fancier apps would
        // bake it in at build via a Vite define instead of recomputing.
        appVersion: APP_VERSION,
        appYear: new Date().getFullYear(),
        // Inline status banner inside the settings modal — replaces the
        // browser-style `alert()` calls so failures (write-probe rejected
        // a folder, set_auto_save couldn't reach the config, etc.) stay
        // contextual instead of yanking focus to a system dialog.
        settingsError:   '',
        settingsSuccess: '',
        // User preference (persisted in Rust config.json). When `false`,
        // edits never schedule the debounced autosave — every change
        // requires an explicit Ctrl+S / Save click.
        autoSaveEnabled: true,

        // Static SVG strings for the lucide icons used in the template.
        icons: ICONS,
        // Same icons but at 32px for the empty-state hero glyph.
        iconsLg: {},
        // Vite-resolved URL for the brand logo. Bundled into dist/ at
        // build time so the webview serves it from `self` and the strict
        // CSP `img-src 'self' data:` keeps holding.
        logoUrl,
    },
    computed: {
        sortedNotes() {
            return [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
        },
        // Title-only filter applied on top of the recency-sorted list.
        // Match is case-insensitive substring against the trimmed title;
        // an empty title falls back to "Untitled" so a search like
        // `untit` finds notes the user hasn't named yet. Body search is
        // intentionally NOT implemented here — that would require lazy-
        // loading every .md from disk on each keystroke and goes against
        // the current schema. A future "advanced search" command can hit
        // the Rust side directly when the user opts into a deeper scan.
        filteredNotes() {
            const q = this.searchQuery.trim().toLowerCase();
            if (!q) return this.sortedNotes;
            return this.sortedNotes.filter(n => {
                const title = (n.title.trim() || 'Untitled').toLowerCase();
                return title.includes(q);
            });
        },
        selected() {
            return this.notes.find(n => n.id === this.selectedId) ?? null;
        },
        renderedBody() {
            return renderMarkdown(this.selected?.body ?? '');
        },
        wordCount() {
            const body = this.selected?.body ?? '';
            return body.trim() ? body.trim().split(/\s+/).length : 0;
        },
        charCount() {
            return this.selected?.body?.length ?? 0;
        },
        statusLabel() {
            switch (this.saveStatus) {
                case 'unsaved': return '○ Unsaved (Ctrl+S)';
                case 'dirty':   return '● Auto-saving…';
                case 'saving':  return '● Saving…';
                case 'saved':   return '✓ Saved';
                default:        return '';
            }
        },
        statusColor() {
            switch (this.saveStatus) {
                case 'unsaved': return 'text-amber-400';
                case 'dirty':   return 'text-blue-400';
                case 'saving':  return 'text-blue-400';
                case 'saved':   return 'text-emerald-500';
                default:        return 'text-zinc-500';
            }
        },
        isCustomDir() {
            return !!this.storageDir
                && !!this.defaultDir
                && this.storageDir !== this.defaultDir;
        },
    },
    methods: {
        async newNote() {
            const id = Date.now();
            this.notes.push({
                id, title: '', body: '',
                createdAt: id, updatedAt: id, _loaded: true,
            });
            this.selectedId = id;
            this.saveStatus = 'unsaved';
        },

        async select(id) {
            if (id === this.selectedId) return;
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                if (!confirm('You have unsaved changes. Switch anyway?')) return;
            }
            // Drop any pending autosave for the note we're leaving so it
            // can't fire later against `this.selected` after we've
            // switched. The id-snapshot inside scheduleAutoSave catches it
            // too, but cancelling explicitly avoids the wasted timer + the
            // confused state-status flicker.
            this.cancelAutoSave?.();
            const note = this.notes.find(n => n.id === id);
            if (!note) return;
            this.selectedId = id;
            if (!note._loaded) {
                try {
                    const full = await readNote(id);
                    note.body = full.body;
                    note.createdAt = full.createdAt;
                    note._loaded = true;
                } catch (err) {
                    console.warn('[notepad] read_note failed for', id, err);
                    note.body = '';
                    note.createdAt = id;
                    note._loaded = true;
                    this.saveStatus = 'unsaved';
                    return;
                }
            }
            this.saveStatus = 'saved';
        },

        async confirmDelete(id) {
            if (!confirm('Delete this note? This cannot be undone.')) return;
            try {
                await deleteNote(id);
            } catch (err) {
                console.error('[notepad] delete failed:', err);
                return;
            }
            const idx = this.notes.findIndex(n => n.id === id);
            if (idx >= 0) this.notes.splice(idx, 1);
            if (this.selectedId === id) {
                this.selectedId = null;
                this.saveStatus = 'saved';
            }
        },

        onEdit() {
            if (this.saveStatus === 'unsaved') return;
            this.saveStatus = 'dirty';
            // Skip the debounce when the user has disabled auto-save —
            // they get to keep `dirty` until they hit Ctrl+S explicitly.
            if (this.autoSaveEnabled) this.scheduleAutoSave();
        },
        // scheduleAutoSave / cancelAutoSave are wired in onMount() so the
        // closure-captured timer is per-component and can be canceled from
        // select() (preventing a stale autosave from firing against the
        // wrong note after the user switches selection).
        scheduleAutoSave: null,
        cancelAutoSave: null,

        async forceSave() {
            // The user explicitly asked to save; cancel any pending debounce
            // so the timeout doesn't fire a redundant second write right
            // after this completes.
            this.cancelAutoSave?.();
            await this.persist();
        },

        async persist() {
            const note = this.selected;
            if (!note) return;
            this.saveStatus = 'saving';
            try {
                const updatedAt = await writeNote({
                    id: note.id,
                    title: note.title,
                    body: note.body,
                    createdAt: note.createdAt,
                });
                note.updatedAt = updatedAt;
                this.saveStatus = 'saved';
            } catch (err) {
                console.error('[notepad] save failed:', err);
                this.saveStatus = 'dirty';
                alert('Save failed: ' + err);
            }
        },

        cycleView() {
            const order = ['edit', 'split', 'preview'];
            const i = order.indexOf(this.viewMode);
            this.viewMode = order[(i + 1) % order.length];
            try { localStorage.setItem(VIEW_MODE_KEY, this.viewMode); } catch {}
        },

        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
            try { localStorage.setItem(SIDEBAR_OPEN_KEY, this.sidebarOpen ? '1' : '0'); } catch {}
        },

        // Drag-to-resize handler. Adds the move/up listeners on the
        // window so the drag continues even when the cursor leaves the
        // tiny 4px handle area.
        startResize(ev) {
            ev.preventDefault();
            this.resizing = true;
            const startX = ev.clientX;
            const startW = this.sidebarWidth;
            const onMove = (e) => {
                const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (e.clientX - startX)));
                this.sidebarWidth = next;
            };
            const onUp = () => {
                this.resizing = false;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.sidebarWidth)); } catch {}
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        },

        openSettings() {
            // Reset the banner so a stale error from a previous session
            // doesn't reappear.
            this.clearSettingsBanner();
            this.settingsOpen = true;
        },

        clearSettingsBanner() {
            this.settingsError = '';
            this.settingsSuccess = '';
        },

        async pickFolder() {
            this.clearSettingsBanner();
            // Native folder picker via @tauri-apps/plugin-dialog. Returns
            // the selected absolute path, or null when the user cancels.
            const picked = await openDialog({
                directory: true,
                multiple: false,
                defaultPath: this.storageDir || undefined,
                title: 'Choose notes folder',
            });
            if (!picked) return;
            try {
                const resolved = await setNotesDir(picked);
                this.storageDir = resolved;
                await this.refreshNotes();
                // Stay in the modal so the user can see the new path
                // confirmed; success message gives the visual feedback.
                this.settingsSuccess = 'Notes folder updated.';
            } catch (err) {
                // Common cause: write-probe rejected the folder (read-only
                // mount, sandbox, etc.). The Rust side returns a clean
                // "folder is not writable: …" message we surface verbatim.
                console.error('[notepad] set_notes_dir failed:', err);
                this.settingsError = String(err);
            }
        },

        async resetFolder() {
            this.clearSettingsBanner();
            try {
                const resolved = await resetNotesDir();
                this.storageDir = resolved;
                await this.refreshNotes();
                this.settingsSuccess = 'Reverted to default folder.';
            } catch (err) {
                console.error('[notepad] reset_notes_dir failed:', err);
                this.settingsError = String(err);
            }
        },

        async toggleAutoSave() {
            const next = !this.autoSaveEnabled;
            this.autoSaveEnabled = next;       // optimistic
            this.clearSettingsBanner();
            try {
                await setAutoSave(next);
                // If the user just disabled auto-save, kill any pending
                // timer that was already mid-flight. The next edit stays
                // 'dirty' until manual save.
                if (!next) this.cancelAutoSave?.();
            } catch (err) {
                console.error('[notepad] set_auto_save failed:', err);
                this.autoSaveEnabled = !next;  // revert
                this.settingsError = 'Could not save preference: ' + err;
            }
        },

        async refreshNotes() {
            this.selectedId = null;
            this.saveStatus = 'saved';
            try {
                const summaries = await listNotes();
                this.notes = summaries.map(s => ({
                    id: s.id, title: s.title, body: '',
                    createdAt: 0, updatedAt: s.updatedAt, _loaded: false,
                }));
                if (this.notes.length > 0) {
                    await this.select(this.sortedNotes[0].id);
                }
            } catch (err) {
                console.error('[notepad] refresh failed:', err);
            }
        },

        // ── File-menu handlers ────────────────────────────────────────────
        // The native menu (built in src-tauri/src/lib.rs `setup`) emits
        // `menu` events with the item id; we route each one to the matching
        // handler here. Edit-menu items (cut/copy/paste/undo/redo/select_all)
        // are predefined so they fire native webview commands without ever
        // bouncing through here.

        async openMd() {
            const picked = await openDialog({
                multiple: false,
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                title: 'Open Markdown file',
            });
            if (!picked) return;
            try {
                const summary = await importMd(picked);
                // Insert into the sidebar list. Body stays unloaded — select()
                // pulls it from disk on demand to keep the import path fast
                // for big files.
                this.notes.push({
                    id: summary.id,
                    title: summary.title,
                    body: '',
                    createdAt: 0,
                    updatedAt: summary.updatedAt,
                    _loaded: false,
                });
                await this.select(summary.id);
            } catch (err) {
                console.error('[notepad] import failed:', err);
                alert('Open failed: ' + err);
            }
        },

        async saveAs() {
            if (!this.selected) return;
            // Always make sure the in-memory edits are flushed to disk first
            // — `Save As` should export *what the user is currently looking
            // at*, including unsaved changes.
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                await this.forceSave();
            }
            const defaultName = (this.selected.title.trim() || 'Untitled') + '.md';
            const dest = await saveDialog({
                defaultPath: defaultName,
                filters: [{ name: 'Markdown', extensions: ['md'] }],
                title: 'Save note as Markdown',
            });
            if (!dest) return;
            try {
                await exportMd(dest, this.selected.title, this.selected.body);
            } catch (err) {
                console.error('[notepad] export failed:', err);
                alert('Save As failed: ' + err);
            }
        },

        async exportPdf() {
            if (!this.selected) return;
            // Force the rendered preview into the DOM — `window.print()` only
            // captures what's currently on screen. We snapshot the previous
            // mode and restore it once the print dialog is dismissed.
            const prev = this.viewMode;
            this.viewMode = 'preview';
            document.body.classList.add('printing');
            // Two ticks: one for the cv-show toggle to drop the textarea out,
            // one for layout to settle before the browser captures.
            await this.$nextTick();
            await this.$nextTick();
            try {
                window.print();
            } finally {
                document.body.classList.remove('printing');
                this.viewMode = prev;
            }
        },

        // Tauri webview sandboxes `<a target="_blank">` (no browser context),
        // so the About-dialog links go through `tauri-plugin-opener` which
        // hands the URL to the OS default browser. The capability scope in
        // src-tauri/capabilities/default.json restricts which hosts can be
        // reached, so callers can't pass arbitrary URLs from user input.
        async openExternal(url) {
            try {
                await openUrl(url);
            } catch (err) {
                console.error('[notepad] open_url failed:', err);
            }
        },

        formatDate(ts) {
            const d = new Date(ts);
            const today = new Date();
            const same = d.toDateString() === today.toDateString();
            return same
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        },
    },
    async onMount() {
        // Bigger version of every icon for the empty-state hero. Mutating
        // width/height on the existing SVG string preserves the viewBox so
        // the strokes scale cleanly without re-running lucide for a 2x set.
        this.iconsLg = Object.fromEntries(
            Object.entries(this.icons).map(([k, svg]) =>
                [k, svg.replace(/width="\d+"/, 'width="48"').replace(/height="\d+"/, 'height="48"')],
            ),
        );

        // Restore UI prefs.
        try {
            const w = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
            if (!isNaN(w)) this.sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));
            this.sidebarOpen = localStorage.getItem(SIDEBAR_OPEN_KEY) !== '0';
            const vm = localStorage.getItem(VIEW_MODE_KEY);
            if (vm === 'edit' || vm === 'split' || vm === 'preview') this.viewMode = vm;
        } catch {}

        // Load storage dir + notes + auto-save preference from Rust.
        try {
            this.defaultDir      = await defaultNotesDir();
            this.storageDir      = await notesDir();
            this.autoSaveEnabled = await getAutoSave();
            await this.refreshNotes();
        } catch (err) {
            console.error('[notepad] startup load failed:', err);
        }

        // Cancelable debounced autosave. The closure-captured `timer` lets
        // both onEdit() (resets) and select() (cancels on note switch) reach
        // it without it leaking into reactive state. We also snapshot
        // `selectedId` at schedule time and verify it again when the timer
        // fires — defense-in-depth against the user switching notes during
        // the 600 ms window. Without that check, a pending autosave for
        // note A could run against `this.selected` (now note B) and write
        // A's title/body into B's file.
        let autoSaveTimer = null;
        this.scheduleAutoSave = () => {
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            const scheduledFor = this.selectedId;
            autoSaveTimer = setTimeout(() => {
                autoSaveTimer = null;
                if (this.selectedId !== scheduledFor) return;
                if (this.saveStatus === 'dirty') this.persist();
            }, 600);
        };
        this.cancelAutoSave = () => {
            if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        };

        // Listen for native-menu events emitted from src-tauri/src/lib.rs.
        // The handler returns an unlisten function — we don't store it
        // because the listener should live for the entire app session
        // (window close tears it down).
        listen('menu', async (e) => {
            switch (e.payload) {
                case 'new':        this.newNote();        break;
                case 'open':       await this.openMd();   break;
                case 'save':       await this.forceSave(); break;
                case 'save_as':    await this.saveAs();    break;
                case 'export_pdf': await this.exportPdf(); break;
            }
        }).catch(err => console.error('[notepad] menu listener failed:', err));

        window.addEventListener('keydown', (e) => {
            // Esc closes whichever modal is open. Cheap escape hatch when
            // the user reaches for the X with the keyboard.
            if (e.key === 'Escape') {
                if (this.settingsOpen) { this.settingsOpen = false; return; }
                if (this.aboutOpen)    { this.aboutOpen = false;    return; }
            }
            const meta = e.ctrlKey || e.metaKey;
            if (!meta) return;
            const k = e.key.toLowerCase();
            if (k === 'n') { e.preventDefault(); this.newNote(); }
            else if (k === 's') { e.preventDefault(); this.forceSave(); }
            else if (k === 'p') { e.preventDefault(); this.cycleView(); }
            else if (k === 'b') { e.preventDefault(); this.toggleSidebar(); }
            else if (k === ',') { e.preventDefault(); this.settingsOpen ? (this.settingsOpen = false) : this.openSettings(); }
            else if (k === 'i') { e.preventDefault(); this.aboutOpen = !this.aboutOpen; }
            else if (k === 'f') {
                // Focus the sidebar search input. Open the sidebar if it's
                // collapsed so the input actually exists in the DOM first.
                e.preventDefault();
                if (!this.sidebarOpen) this.toggleSidebar();
                this.$nextTick(() => {
                    const input = this.$el.querySelector('aside input[type="search"]');
                    input?.focus();
                });
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    },
}).mount('#app');
