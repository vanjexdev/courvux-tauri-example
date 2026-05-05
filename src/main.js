import { createApp } from 'courvux';
import { loadNotes, saveNotes, notesPath } from './tauri.js';

// Debounce utility — coalesce rapid edits into one disk write.
const debounce = (fn, ms) => {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
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
                        <div class="text-sm font-medium truncate">
                            {{ note.title.trim() || 'Untitled' }}
                        </div>
                        <div class="text-xs text-zinc-500 truncate mt-0.5">
                            {{ formatDate(note.updatedAt) }}
                        </div>
                    </li>
                </ul>

                <footer class="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 truncate">
                    {{ savePath || 'Loading…' }}
                </footer>
            </aside>

            <!-- ── Editor ──────────────────────────────────────────────── -->
            <main class="flex-1 flex flex-col bg-zinc-950">
                <div cv-if="!selected" class="flex-1 flex items-center justify-center text-zinc-600">
                    <div class="text-center">
                        <div class="text-6xl mb-4">📝</div>
                        <p class="text-sm">Select a note from the left, or create a new one.</p>
                    </div>
                </div>

                <div cv-else class="flex-1 flex flex-col">
                    <header class="px-6 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <input
                            type="text"
                            cv-model="selected.title"
                            @input="onEdit()"
                            placeholder="Untitled"
                            class="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder:text-zinc-600" />
                        <button
                            @click="deleteNote(selected.id)"
                            class="ml-3 px-2 py-1 text-xs rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            title="Delete this note">
                            Delete
                        </button>
                    </header>

                    <textarea
                        cv-model="selected.body"
                        @input="onEdit()"
                        placeholder="Start writing…"
                        class="flex-1 px-6 py-4 bg-transparent text-zinc-200 outline-none resize-none placeholder:text-zinc-600 leading-relaxed"></textarea>

                    <footer class="px-6 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
                        <span>{{ wordCount }} words · {{ charCount }} chars</span>
                        <span :class="saveStatus === 'saved' ? 'text-emerald-500' : 'text-amber-400'">
                            {{ saveStatus === 'saved' ? '✓ Saved' : '● Saving…' }}
                        </span>
                    </footer>
                </div>
            </main>
        </div>
    `,
    data: {
        notes: [],
        selectedId: null,
        savePath: '',
        saveStatus: 'saved',
    },
    computed: {
        sortedNotes() {
            return [...this.notes].sort((a, b) => b.updatedAt - a.updatedAt);
        },
        selected() {
            return this.notes.find(n => n.id === this.selectedId) ?? null;
        },
        wordCount() {
            const body = this.selected?.body ?? '';
            return body.trim() ? body.trim().split(/\s+/).length : 0;
        },
        charCount() {
            return this.selected?.body?.length ?? 0;
        },
    },
    methods: {
        async newNote() {
            const id = Date.now();
            this.notes.push({ id, title: '', body: '', updatedAt: id });
            this.selectedId = id;
            await this.persist();
        },
        select(id) {
            this.selectedId = id;
        },
        async deleteNote(id) {
            const idx = this.notes.findIndex(n => n.id === id);
            if (idx < 0) return;
            this.notes.splice(idx, 1);
            if (this.selectedId === id) this.selectedId = null;
            await this.persist();
        },
        onEdit() {
            // Mark dirty immediately so the footer shows the spinner.
            this.saveStatus = 'saving';
            // Bump the timestamp on every keystroke so the sidebar reorders
            // live; persistence still debounces.
            if (this.selected) this.selected.updatedAt = Date.now();
            this.scheduleSave();
        },
        // The actual disk write is debounced to keep typing snappy.
        scheduleSave: null,  // assigned in onMount
        async persist() {
            this.saveStatus = 'saving';
            try {
                await saveNotes([...this.notes]);
                this.saveStatus = 'saved';
            } catch (err) {
                console.error('[notepad] save failed:', err);
                this.saveStatus = 'error';
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
        // Hydrate from disk + resolve the storage path for the footer.
        try {
            this.notes = await loadNotes();
            this.savePath = await notesPath();
        } catch (err) {
            console.error('[notepad] load failed:', err);
        }
        // Auto-select the most recently edited note, if any.
        if (this.notes.length > 0) {
            this.selectedId = this.sortedNotes[0].id;
        }
        // Wire up the debounced save now that `this` is bound.
        this.scheduleSave = debounce(() => this.persist(), 400);

        // Keyboard shortcut: Ctrl/Cmd+N → new note.
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.newNote();
            }
        });
    },
}).mount('#app');
