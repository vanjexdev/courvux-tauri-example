import { createApp } from 'courvux';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import {
    listNotes, readNote, writeNote, deleteNote,
    notesDir, defaultNotesDir, setNotesDir, resetNotesDir,
    getAutoSave, setAutoSave,
} from './tauri.js';
import { renderMarkdown } from './markdown.js';
import { ICONS } from './icons.js';

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
                    <h1 class="text-sm font-semibold tracking-wide text-zinc-300 truncate">Notepad</h1>
                    <div class="flex items-center gap-1">
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

                <ul class="flex-1 overflow-y-auto py-2">
                    <li cv-if="notes.length === 0" class="px-4 py-6 text-xs text-zinc-500 text-center">
                        No notes yet. Click <span class="text-emerald-400">+ New</span> to create one.
                    </li>
                    <li cv-for="note in sortedNotes"
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

        settingsOpen: false,
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
    },
    computed: {
        sortedNotes() {
            return [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
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

        window.addEventListener('keydown', (e) => {
            const meta = e.ctrlKey || e.metaKey;
            if (!meta) return;
            const k = e.key.toLowerCase();
            if (k === 'n') { e.preventDefault(); this.newNote(); }
            else if (k === 's') { e.preventDefault(); this.forceSave(); }
            else if (k === 'p') { e.preventDefault(); this.cycleView(); }
            else if (k === 'b') { e.preventDefault(); this.toggleSidebar(); }
            else if (k === ',') { e.preventDefault(); this.settingsOpen ? (this.settingsOpen = false) : this.openSettings(); }
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    },
}).mount('#app');
