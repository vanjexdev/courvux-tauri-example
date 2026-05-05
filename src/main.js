import { createApp } from 'courvux';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { listNotes, readNote, writeNote, deleteNote, notesDir } from './tauri.js';

// GFM tables/strikethrough, line breaks without two trailing spaces, no
// header IDs (we don't render anchors so they're noise), no email mangling.
marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
});

const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

createApp({
    template: `
        <div cv-cloak class="flex h-full">
            <!-- ── Sidebar ─────────────────────────────────────────────── -->
            <aside class="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur flex flex-col">
                <header class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                    <h1 class="text-sm font-semibold tracking-wide text-zinc-300">Notepad</h1>
                    <button
                        @click="newNote()"
                        class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                        title="New note (Ctrl+N)">
                        + New
                    </button>
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
            </aside>

            <!-- ── Editor ──────────────────────────────────────────────── -->
            <main class="flex-1 flex flex-col bg-zinc-950 min-w-0">
                <div cv-if="!selected" class="flex-1 flex items-center justify-center text-zinc-600">
                    <div class="text-center">
                        <div class="text-6xl mb-4">📝</div>
                        <p class="text-sm">Select a note from the left, or create a new one.</p>
                        <p class="text-xs mt-2 text-zinc-700">Ctrl+N · new · Ctrl+S · save · Ctrl+P · cycle view</p>
                    </div>
                </div>

                <div cv-else class="flex-1 flex flex-col min-h-0">
                    <header class="px-6 py-3 border-b border-zinc-800 flex items-center gap-3">
                        <input
                            type="text"
                            cv-model="selected.title"
                            @input="onEdit()"
                            placeholder="Untitled"
                            class="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600" />

                        <button
                            @click="cycleView()"
                            class="px-2 py-1 text-xs rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800"
                            :title="'View: ' + viewMode + ' (Ctrl+P)'">
                            {{ viewMode === 'edit' ? '✎ Edit' : viewMode === 'split' ? '⊟ Split' : '👁 Preview' }}
                        </button>

                        <button
                            @click="forceSave()"
                            :disabled="saveStatus === 'saved' || saveStatus === 'saving'"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Save (Ctrl+S)">
                            {{ saveStatus === 'saved' ? '✓' : 'Save' }}
                        </button>

                        <button
                            @click="confirmDelete(selected.id)"
                            class="px-2 py-1 text-xs rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            title="Delete this note">
                            Delete
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
        </div>
    `,
    data: {
        // Each note: { id, title, body, createdAt, updatedAt, _loaded }.
        // `_loaded` flips to true once read_note has populated body+createdAt.
        // Sidebar entries from list_notes() start with empty body + _loaded:false;
        // body fills in on first selection.
        notes: [],
        selectedId: null,
        saveStatus: 'saved',  // 'unsaved' | 'dirty' | 'saving' | 'saved'
        viewMode: 'split',    // 'edit' | 'split' | 'preview'
        storageDir: '',
    },
    computed: {
        sortedNotes() {
            return [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
        },
        selected() {
            return this.notes.find(n => n.id === this.selectedId) ?? null;
        },
        renderedBody() {
            const md = this.selected?.body ?? '';
            // marked → DOMPurify so any pasted `<script>` / `on*=` /
            // `javascript:` URL never executes. Strict CSP holds even
            // with hostile Markdown input.
            return DOMPurify.sanitize(marked.parse(md));
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
    },
    methods: {
        async newNote() {
            // Optimistic local insert. The file does not exist on disk yet,
            // so saveStatus stays 'unsaved' and the user must hit Ctrl+S
            // (or click Save) to commit. Only after the first manual save
            // does auto-save take over for subsequent edits.
            const id = Date.now();
            this.notes.push({
                id,
                title: '',
                body: '',
                createdAt: id,
                updatedAt: id,
                _loaded: true,    // already in memory
            });
            this.selectedId = id;
            this.saveStatus = 'unsaved';
        },

        async select(id) {
            if (id === this.selectedId) return;
            // Refuse to lose unsaved data silently.
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                if (!confirm('You have unsaved changes. Switch anyway?')) return;
            }
            const note = this.notes.find(n => n.id === id);
            if (!note) return;
            this.selectedId = id;
            // Lazy-load body the first time this note is selected.
            if (!note._loaded) {
                try {
                    const full = await readNote(id);
                    note.body = full.body;
                    note.createdAt = full.createdAt;
                    note._loaded = true;
                } catch (err) {
                    console.warn('[notepad] read_note failed for', id, err);
                    // Treat as ghost entry: keep it in the sidebar but
                    // start the user fresh. Forces a manual save.
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

        // Listener for both title input and body textarea. Promotes the
        // save state and schedules an auto-save *only* when the note is
        // already on disk. Brand-new notes stay 'unsaved' until the user
        // hits Ctrl+S — that's the explicit user-confirmed first commit.
        onEdit() {
            if (this.saveStatus === 'unsaved') return;
            this.saveStatus = 'dirty';
            this.scheduleAutoSave();
        },

        // Wired in onMount so `this` binds correctly.
        scheduleAutoSave: null,

        async forceSave() {
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
        try {
            this.storageDir = await notesDir();
            const summaries = await listNotes();
            // Hydrate as un-loaded entries; bodies fill in on selection.
            this.notes = summaries.map(s => ({
                id: s.id,
                title: s.title,
                body: '',
                createdAt: 0,
                updatedAt: s.updatedAt,
                _loaded: false,
            }));
        } catch (err) {
            console.error('[notepad] startup load failed:', err);
        }

        if (this.notes.length > 0) {
            await this.select(this.sortedNotes[0].id);
        }

        this.scheduleAutoSave = debounce(() => {
            if (this.saveStatus === 'dirty') this.persist();
        }, 600);

        window.addEventListener('keydown', (e) => {
            const meta = e.ctrlKey || e.metaKey;
            if (!meta) return;
            const k = e.key.toLowerCase();
            if (k === 'n') { e.preventDefault(); this.newNote(); }
            else if (k === 's') { e.preventDefault(); this.forceSave(); }
            else if (k === 'p') { e.preventDefault(); this.cycleView(); }
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.saveStatus === 'unsaved' || this.saveStatus === 'dirty') {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    },
}).mount('#app');
