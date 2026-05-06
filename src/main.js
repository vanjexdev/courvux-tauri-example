import { createApp } from 'courvux';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';

import {
    listNotes, readNote, writeNote, deleteNote,
    notesDir, defaultNotesDir, setNotesDir, resetNotesDir,
    getAutoSave, setAutoSave,
    importMd, exportMd, takePendingOpenFiles,
    openProjectFolder, listProjectTree, readProjectFile, writeProjectFile,
    createProjectFile, createProjectDir, writeBinaryFile, getRecentProjects,
} from './tauri.js';
import { convertFileSrc } from '@tauri-apps/api/core';
// `pdf-export.js` is dynamically imported inside `exportProjectPdf` so
// jsPDF (~600 KB minified, plus html2canvas pulled by its bundle even
// though we never call it) ships in a separate Vite chunk that's only
// fetched when the user actually triggers a PDF export.
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
const APP_MODE_KEY      = 'courvux-notepad:app-mode';      // 'library' | 'project'
const LAST_PROJECT_KEY  = 'courvux-notepad:last-project';  // path to reopen on launch

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;

// Strip the last path segment, returning the parent directory. Returns
// the input unchanged if it's already a root-ish path (no separator
// after the leading slash). Used to track which folder the user is
// "in" — clicking a file selects its parent so consecutive creates
// stay next to it.
function parentDir(p) {
    if (!p) return p;
    const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    if (lastSep <= 0) return p;
    return p.slice(0, lastSep);
}

// Resolve `.` and `..` segments without touching the filesystem. Used
// by the PDF bundle's link resolver so `[X](../sub/other.md)` from a
// nested file maps onto the same absolute path the file walker
// recorded — otherwise the lookup misses and the link stays raw.
function normalizePath(p) {
    if (!p) return p;
    const sep = p.includes('\\') && !p.startsWith('/') ? '\\' : '/';
    const isAbs = p.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(p);
    const drive = /^[A-Za-z]:/.test(p) ? p.slice(0, 2) : '';
    const body = drive ? p.slice(2) : p;
    const parts = body.split(/[\/\\]+/);
    const stack = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') { stack.pop(); continue; }
        stack.push(part);
    }
    return drive + (isAbs ? sep : '') + stack.join(sep);
}

createApp({
    template: `
        <div cv-cloak class="flex h-full">
            <!-- ── Sidebar ─────────────────────────────────────────────── -->
            <aside
                cv-show="sidebarOpen"
                :style="'width:' + sidebarWidth + 'px; min-width:' + sidebarWidth + 'px'"
                class="shrink-0 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur flex flex-col relative">

                <header class="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
                    <h1 class="text-sm font-semibold tracking-wide text-zinc-300 truncate inline-flex items-center gap-2 min-w-0">
                        <img :src="logoUrl" alt="" width="20" height="20" class="shrink-0" aria-hidden="true" />
                        <span cv-if="mode === 'library'">Notepad</span>
                        <span cv-else
                              @click="selectedDir = null"
                              :title="(selectedDir ? 'Click to target project root for + New\n' : '') + (project?.path || '')"
                              :class="selectedDir ? 'cursor-pointer hover:text-zinc-100' : ''"
                              class="truncate">{{ project?.name || 'Project' }}</span>
                    </h1>
                    <div class="flex items-center gap-1 shrink-0">
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
                            cv-if="mode === 'project'"
                            @click="refreshTree()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="Refresh project tree"
                            title="Refresh tree">
                            <span cv-html.raw="icons.folderTree" aria-hidden="true"></span>
                        </button>
                        <button
                            cv-if="mode === 'library'"
                            @click="newNote()"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                            title="New note (Ctrl+N)">
                            <span cv-html.raw="icons.plus"></span>
                            <span>New</span>
                        </button>
                        <button
                            cv-if="mode === 'project'"
                            @click="newProjectFolder()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            aria-label="New folder"
                            title="New folder">
                            <span cv-html.raw="icons.folderPlus" aria-hidden="true"></span>
                        </button>
                        <button
                            cv-if="mode === 'project'"
                            @click="newProjectFile()"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1"
                            title="New file in project (Ctrl+N)">
                            <span cv-html.raw="icons.plus"></span>
                            <span>New</span>
                        </button>
                    </div>
                </header>

                <div cv-if="mode === 'library'" class="flex-1 flex flex-col min-h-0">
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
                </div>
                <div cv-else class="flex-1 flex flex-col min-h-0">
                    <ul class="flex-1 overflow-y-auto py-2">
                        <li cv-if="flatTree.length === 0" class="px-4 py-6 text-xs text-zinc-500 text-center">
                            Empty folder.
                        </li>
                        <li cv-for="node in flatTree"
                            :key="node.path"
                            @click="onTreeClick(node)"
                            :class="(openFile && openFile.path === node.path)
                                ? 'bg-emerald-500/10 border-l-2 border-emerald-500'
                                : (node.isDir && selectedDir === node.path)
                                    ? 'bg-amber-500/10 border-l-2 border-amber-500/60'
                                    : 'border-l-2 border-transparent hover:bg-zinc-800/50'"
                            :style="'padding-left:' + (node.depth * 12 + 12) + 'px'"
                            class="pr-3 py-1 cursor-pointer text-xs flex items-center gap-1.5 select-none">
                            <span cv-if="node.isDir"
                                  cv-html.raw="node.isExpanded ? icons.chevronDown : icons.chevronRight"
                                  class="shrink-0 text-zinc-500"></span>
                            <span cv-else class="w-3 shrink-0" aria-hidden="true"></span>
                            <span cv-if="node.isDir && node.isExpanded" cv-html.raw="icons.folderOpen" class="shrink-0 text-amber-500/80"></span>
                            <span cv-else-if="node.isDir" cv-html.raw="icons.folder" class="shrink-0 text-amber-500/80"></span>
                            <span cv-else-if="node.kind === 'md'" cv-html.raw="icons.file" class="shrink-0 text-zinc-400"></span>
                            <span cv-else-if="node.kind === 'image'" cv-html.raw="icons.image" class="shrink-0 text-blue-400"></span>
                            <span cv-else cv-html.raw="icons.file" class="shrink-0 text-zinc-600"></span>
                            <span :class="node.kind === 'other' ? 'text-zinc-500' : 'text-zinc-200'" class="truncate">{{ node.name }}</span>
                            <span cv-if="node.truncated" class="text-[10px] text-amber-500" title="Truncated (depth or file cap)">…</span>
                        </li>
                    </ul>

                    <footer class="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600 truncate"
                            :title="project?.path">
                        {{ project?.path || '' }}
                    </footer>
                </div>

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

            <main class="flex-1 flex flex-col bg-zinc-950 min-w-0">
                <div cv-if="mode === 'library' && !selected" class="flex-1 flex flex-col">
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
                    <div class="flex-1 flex items-center justify-center text-zinc-600 px-6 py-8 overflow-y-auto">
                        <div class="text-center max-w-md">
                            <div class="mb-4 inline-flex p-4 rounded-full bg-zinc-900 text-zinc-700">
                                <span cv-html.raw="iconsLg.file"></span>
                            </div>
                            <p class="text-sm">Select a note from the sidebar, or create a new one.</p>
                            <p class="text-xs mt-2 text-zinc-700">Ctrl+N · new · Ctrl+S · save · Ctrl+P · cycle view · Ctrl+B · toggle sidebar</p>

                            <div cv-if="recentProjects.length > 0" class="mt-8 text-left">
                                <div class="flex items-center gap-2 mb-2">
                                    <span cv-html.raw="icons.folderTree" class="text-zinc-600"></span>
                                    <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recent projects</h3>
                                </div>
                                <ul class="space-y-1">
                                    <li cv-for="path in recentProjects"
                                        :key="path"
                                        @click="openRecentProject(path)"
                                        class="px-3 py-2 rounded bg-zinc-900/60 hover:bg-zinc-800 cursor-pointer text-xs text-zinc-300 truncate"
                                        :title="path">
                                        {{ path }}
                                    </li>
                                </ul>
                            </div>

                            <div class="mt-6">
                                <button
                                    @click="openFolder()"
                                    class="px-3 py-2 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 inline-flex items-center gap-1.5">
                                    <span cv-html.raw="icons.folderOpen"></span>
                                    <span>Open folder…</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div cv-else-if="mode === 'library' && selected" class="flex-1 flex flex-col min-h-0">
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
                <div cv-else-if="mode === 'project' && !openFile" class="flex-1 flex flex-col">
                    <header class="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                        <button
                            @click="toggleSidebar()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'">
                            <span cv-html.raw="sidebarOpen ? icons.sidebarClose : icons.sidebarOpen" aria-hidden="true"></span>
                        </button>
                    </header>
                    <div class="flex-1 flex items-center justify-center text-zinc-600">
                        <div class="text-center">
                            <div class="mb-4 inline-flex p-4 rounded-full bg-zinc-900 text-zinc-700">
                                <span cv-html.raw="iconsLg.folderTree"></span>
                            </div>
                            <p class="text-sm">Pick a Markdown or image file from the tree.</p>
                            <p class="text-xs mt-2 text-zinc-700">Ctrl+Shift+O · open folder · Ctrl+Shift+W · close project</p>
                        </div>
                    </div>
                </div>
                <div cv-else-if="mode === 'project' && openFile && openFile.kind === 'md'"
                     class="flex-1 flex flex-col min-h-0">
                    <header class="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                        <button
                            @click="toggleSidebar()"
                            class="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'">
                            <span cv-html.raw="sidebarOpen ? icons.sidebarClose : icons.sidebarOpen" aria-hidden="true"></span>
                        </button>

                        <div class="flex-1 min-w-0">
                            <div class="text-lg font-semibold text-zinc-100 truncate">{{ openFile.name }}</div>
                            <div class="text-[10px] text-zinc-600 truncate" :title="openFile.path">{{ openFile.path }}</div>
                        </div>

                        <button
                            @click="cycleView()"
                            class="px-2 py-1 text-xs rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800 inline-flex items-center gap-1.5"
                            :title="'View: ' + viewMode + ' (Ctrl+P)'">
                            <span cv-html.raw="viewMode === 'edit' ? icons.edit : viewMode === 'split' ? icons.split : icons.eye"></span>
                            <span class="capitalize">{{ viewMode }}</span>
                        </button>

                        <button
                            @click="forceSave()"
                            :disabled="projectSaveStatus === 'saved' || projectSaveStatus === 'saving'"
                            class="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-1"
                            title="Save (Ctrl+S)">
                            <span cv-html.raw="projectSaveStatus === 'saved' ? icons.check : icons.save"></span>
                            <span>{{ projectSaveStatus === 'saved' ? 'Saved' : 'Save' }}</span>
                        </button>
                    </header>

                    <div class="flex-1 flex min-h-0">
                        <textarea
                            cv-show="viewMode === 'edit' || viewMode === 'split'"
                            cv-model="openFile.content"
                            @input="onEdit()"
                            :class="viewMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'flex-1'"
                            class="px-6 py-4 bg-transparent text-zinc-200 outline-none resize-none placeholder:text-zinc-600 leading-relaxed font-mono text-sm"></textarea>

                        <div
                            cv-show="viewMode === 'preview' || viewMode === 'split'"
                            :class="viewMode === 'split' ? 'w-1/2' : 'flex-1'"
                            class="px-6 py-4 overflow-y-auto markdown-body"
                            cv-html="renderedBody"></div>
                    </div>

                    <footer class="px-6 py-2 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
                        <span>{{ wordCount }} words · {{ charCount }} chars</span>
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

            <!-- ── Name input modal (replaces window.prompt) ───────────── -->
            <div cv-if="nameInput"
                 @click.self="cancelNameInput()"
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby="name-input-title"
                 class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
                    <header class="px-5 py-3 border-b border-zinc-800">
                        <h2 id="name-input-title" class="text-sm font-semibold text-zinc-100">{{ nameInput.title }}</h2>
                        <p cv-if="nameInput.hint" class="text-[11px] text-zinc-500 mt-0.5">{{ nameInput.hint }}</p>
                    </header>
                    <div class="px-5 py-4">
                        <input
                            type="text"
                            cv-model="nameInput.value"
                            @keydown.enter="confirmNameInput()"
                            @keydown.escape="cancelNameInput()"
                            data-name-input
                            class="w-full px-3 py-2 text-sm rounded bg-zinc-950 border border-zinc-800 text-zinc-100 outline-none focus:border-emerald-500/60 font-mono" />
                    </div>
                    <footer class="px-5 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                        <button
                            @click="cancelNameInput()"
                            class="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                            Cancel
                        </button>
                        <button
                            @click="confirmNameInput()"
                            class="px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white">
                            OK
                        </button>
                    </footer>
                </div>
            </div>

            <!-- ── Image preview modal ─────────────────────────────────── -->
            <div cv-if="imagePreview"
                 @click.self="imagePreview = null"
                 role="dialog"
                 aria-modal="true"
                 aria-label="Image preview"
                 class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
                <div class="relative max-w-full max-h-full">
                    <button
                        @click="imagePreview = null"
                        class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 inline-flex items-center justify-center"
                        aria-label="Close preview">
                        <span cv-html.raw="icons.x" aria-hidden="true"></span>
                    </button>
                    <img :src="imagePreview.src" :alt="imagePreview.alt"
                         class="max-w-[90vw] max-h-[85vh] rounded shadow-xl object-contain bg-zinc-900" />
                    <div class="mt-2 text-center text-xs text-zinc-500 truncate" :title="imagePreview.alt">{{ imagePreview.alt }}</div>
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
        // ── Top-level mode ────────────────────────────────────────────────
        // 'library' = the original flat notes folder (frontmatter, slug
        //             filenames, owned by the app).
        // 'project' = an arbitrary user folder edited in place.
        // Switched via the File menu (Open Folder / Close Project) and
        // by the recent-projects pane on the welcome screen.
        mode: 'library',

        // Project mode state. `tree` is the recursive directory layout
        // returned by `list_project_tree`; `expanded` records which dirs
        // the user opened so the sidebar tree can render lazily flat.
        // `openFile` is the current editor target (md or image preview).
        project: null,           // { path, name, tree }
        expanded: {},            // { [absolutePath]: true } per dir node
        // Currently-selected folder in the tree. `+ New File` and
        // `+ Folder` create their entries inside this folder; null
        // falls back to the project root. Set when the user clicks a
        // folder in the tree (also when they open a file — its parent
        // dir becomes the target so consecutive `+ New` calls stay
        // in the same folder).
        selectedDir: null,       // absolute path or null = project root
        openFile: null,          // { path, name, content, kind: 'md'|'image' }
        projectSaveStatus: 'saved',
        recentProjects: [],
        // Image preview modal. Set when the user clicks an image entry
        // in the project tree (or an inline image inside the preview).
        imagePreview: null,      // { src, alt }
        // Name-input modal — replaces `window.prompt()` because WKWebView
        // on macOS strips the prompt() implementation for security and
        // returns null silently with no UI. Holds the in-flight resolver
        // until the user submits or cancels.
        nameInput: null,         // { title, hint, value, resolve }

        // ── Library mode state (unchanged) ────────────────────────────────
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
        // Depth-first flatten of the project tree, only descending into
        // dirs that are currently expanded. Each entry carries its visual
        // depth so the template can render a flat <ul> with padding-left
        // proportional to nesting — keeps the template free of recursion.
        flatTree() {
            const root = this.project?.tree;
            if (!root || root.kind !== 'dir' || !root.children) return [];
            const out = [];
            const expanded = this.expanded;
            const walk = (node, depth) => {
                const isDir = node.kind === 'dir';
                const isExpanded = isDir && !!expanded[node.path];
                out.push({
                    name: node.name,
                    path: node.path,
                    kind: node.kind,
                    depth,
                    isDir,
                    isExpanded,
                    truncated: !!node.truncated,
                });
                if (isDir && isExpanded && node.children) {
                    for (const c of node.children) walk(c, depth + 1);
                }
            };
            for (const c of root.children) walk(c, 0);
            return out;
        },
        // Path of `selectedDir` relative to the project root, for the
        // hint shown in the New File / New Folder modals. Empty string
        // when no folder is selected (i.e. creates land at root).
        selectedDirRel() {
            if (!this.selectedDir || !this.project) return '';
            const root = this.project.path.replace(/[\/\\]+$/, '');
            if (this.selectedDir === root) return '';
            return this.selectedDir.startsWith(root)
                ? this.selectedDir.slice(root.length).replace(/^[\/\\]+/, '')
                : this.selectedDir;
        },
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
            // Library notes have no associated folder for relative image
            // paths. Project files render with the project root as the
            // base so `![alt](images/foo.jpg)` resolves to an
            // `asset://` URL pointing into the project.
            if (this.mode === 'project' && this.openFile?.kind === 'md') {
                return renderMarkdown(this.openFile.content ?? '', this.project?.path ?? null);
            }
            return renderMarkdown(this.selected?.body ?? '', null);
        },
        // Save status the editor footer / Save button bind to. Lets one
        // header chrome serve both modes without duplicating bindings.
        currentSaveStatus() {
            return this.mode === 'project' ? this.projectSaveStatus : this.saveStatus;
        },
        // Word + char counts — switch source based on mode.
        currentBody() {
            if (this.mode === 'project') return this.openFile?.content ?? '';
            return this.selected?.body ?? '';
        },
        wordCount() {
            const body = this.currentBody;
            return body.trim() ? body.trim().split(/\s+/).length : 0;
        },
        charCount() {
            return this.currentBody.length;
        },
        statusLabel() {
            switch (this.currentSaveStatus) {
                case 'unsaved': return '○ Unsaved (Ctrl+S)';
                case 'dirty':   return '● Auto-saving…';
                case 'saving':  return '● Saving…';
                case 'saved':   return '✓ Saved';
                default:        return '';
            }
        },
        statusColor() {
            switch (this.currentSaveStatus) {
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
            if (this.mode === 'project') {
                if (this.projectSaveStatus === 'unsaved') return;
                this.projectSaveStatus = 'dirty';
                if (this.autoSaveEnabled) this.scheduleAutoSave();
                return;
            }
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
            if (this.mode === 'project') {
                const f = this.openFile;
                if (!f || f.kind !== 'md') return;
                this.projectSaveStatus = 'saving';
                try {
                    await writeProjectFile(f.path, f.content);
                    this.projectSaveStatus = 'saved';
                } catch (err) {
                    console.error('[notepad] project save failed:', err);
                    this.projectSaveStatus = 'dirty';
                    alert('Save failed: ' + err);
                }
                return;
            }
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

        // ── Project mode ──────────────────────────────────────────────────
        // Opens an arbitrary folder and edits its `.md` files in place
        // (no slug rename, no YAML frontmatter). Image files surface in
        // the tree and render via the asset:// protocol.

        async openFolder() {
            const picked = await openDialog({
                directory: true,
                multiple: false,
                title: 'Open project folder',
            });
            if (!picked) return;
            await this.activateProject(picked);
        },

        async openRecentProject(path) {
            await this.activateProject(path);
        },

        // Single entry point for switching into project mode. Validates
        // the path on the Rust side, asks the asset protocol scope to
        // serve files from it, walks the tree, and resets the editor.
        async activateProject(path) {
            try {
                const resolved = await openProjectFolder(path);
                const tree = await listProjectTree(resolved);
                this.project = {
                    path: resolved,
                    name: tree.name,
                    tree,
                };
                this.mode = 'project';
                this.expanded = {};
                this.openFile = null;
                this.selectedDir = null;
                this.projectSaveStatus = 'saved';
                this.recentProjects = await getRecentProjects();
                try {
                    localStorage.setItem(APP_MODE_KEY, 'project');
                    localStorage.setItem(LAST_PROJECT_KEY, resolved);
                } catch {}
                // Cancel any pending library autosave so it can't fire
                // against the now-irrelevant `selected` note.
                this.cancelAutoSave?.();
            } catch (err) {
                console.error('[notepad] open project failed:', err);
                alert('Could not open project: ' + err);
            }
        },

        async closeProject() {
            if (this.projectSaveStatus === 'unsaved' || this.projectSaveStatus === 'dirty') {
                if (!confirm('You have unsaved changes in this project. Close anyway?')) return;
            }
            this.cancelAutoSave?.();
            this.project = null;
            this.openFile = null;
            this.expanded = {};
            this.selectedDir = null;
            this.projectSaveStatus = 'saved';
            this.mode = 'library';
            try {
                localStorage.setItem(APP_MODE_KEY, 'library');
                localStorage.removeItem(LAST_PROJECT_KEY);
            } catch {}
        },

        async refreshTree() {
            if (!this.project) return;
            try {
                const tree = await listProjectTree(this.project.path);
                this.project = { ...this.project, tree };
            } catch (err) {
                console.error('[notepad] refresh tree failed:', err);
            }
        },

        // Promise-based name prompt backed by an in-app modal. Replaces
        // `window.prompt()` because WKWebView (macOS) strips the prompt()
        // implementation for security and returns null silently with no
        // UI — buttons that depended on it appeared dead on Mac with no
        // error in the console.
        askName(title, defaultValue, hint) {
            return new Promise(resolve => {
                this.nameInput = { title, hint: hint || '', value: defaultValue || '', resolve };
                // Focus the input on next tick (after cv-if mounts the
                // modal) and select-all so the user can immediately type
                // over the suggested default.
                this.$nextTick(() => {
                    const input = this.$el.querySelector('[data-name-input]');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                });
            });
        },

        confirmNameInput() {
            if (!this.nameInput) return;
            const { value, resolve } = this.nameInput;
            this.nameInput = null;
            resolve(value);
        },

        cancelNameInput() {
            if (!this.nameInput) return;
            const { resolve } = this.nameInput;
            this.nameInput = null;
            resolve(null);
        },

        // Create a new file or folder at the project root.
        //
        // Slash semantics:
        //   `notes/2026/draft.md`  → mkdir -p `notes/2026` then create file
        //   `notes/2026/`          → mkdir -p `notes/2026` (folder only)
        //   `draft`                → `draft.md` (auto-extension)
        //
        // Each `/`-segment is sanitized individually so a name like
        // `docs:bad/intro.md` becomes `docsbad/intro.md` rather than
        // having the slash itself stripped.
        async newProjectFile() {
            if (!this.project) return;
            const target = this.selectedDirRel || 'project root';
            const raw = await this.askName(
                'New file',
                'untitled.md',
                `Will be created in: ${target}. Use "/" for subfolders, trailing "/" for folder only.`,
            );
            if (!raw) return;
            await this.createProjectEntry(raw);
        },

        async newProjectFolder() {
            if (!this.project) return;
            const target = this.selectedDirRel || 'project root';
            const raw = await this.askName(
                'New folder',
                'subfolder',
                `Will be created in: ${target}. Use "/" for nested folders.`,
            );
            if (!raw) return;
            // Force folder semantics with a trailing slash so the shared
            // helper takes the mkdir-p branch even when the user typed a
            // name that looks file-like (e.g. `docs.v2`).
            const normalized = raw.endsWith('/') ? raw : raw + '/';
            await this.createProjectEntry(normalized);
        },

        async createProjectEntry(rawInput) {
            const sep = this.project.path.includes('\\') ? '\\' : '/';
            const rootAbs = this.project.path.replace(/[\/\\]+$/, '');
            // The "+ New" target — folder the user clicked in the tree,
            // or the project root if no folder is selected. Selected
            // folder takes precedence so users can build out a tree by
            // clicking around without typing the full path each time.
            const baseAbs = (this.selectedDir && this.selectedDir.startsWith(rootAbs))
                ? this.selectedDir.replace(/[\/\\]+$/, '')
                : rootAbs;

            // Trailing slash signals "create the folder, no file".
            const isFolderOnly = /[\/\\]\s*$/.test(rawInput);
            // Split on either separator so users on either OS can type
            // forward slashes (the canonical markdown convention).
            const segments = rawInput
                .replace(/^[\/\\]+|[\/\\]+$/g, '')
                .split(/[\/\\]+/)
                .map(s => s.trim().replace(/[:*?"<>|]/g, ''))  // shell metachars
                .filter(Boolean);
            if (segments.length === 0) return;

            const fileSegment = isFolderOnly ? null : segments.pop();
            const dirSegments = segments;

            const dirPath = dirSegments.length === 0
                ? baseAbs
                : baseAbs + sep + dirSegments.join(sep);

            // Create the parent chain first (idempotent).
            if (dirSegments.length > 0 || isFolderOnly) {
                try {
                    await createProjectDir(dirPath);
                } catch (err) {
                    console.error('[notepad] create dir failed:', err);
                    alert('Could not create folder: ' + err);
                    return;
                }
            }

            if (!fileSegment) {
                await this.refreshTree();
                // Auto-expand the chain so the user sees their new folder.
                this.expandPath(dirPath);
                return;
            }

            // Default `.md` only when there's no extension at all — keeps
            // `notes.txt` or `image.png` paths intact for users who want
            // to drop arbitrary files into the project.
            const fileName = /\.[a-z0-9]+$/i.test(fileSegment) ? fileSegment : `${fileSegment}.md`;
            const fullPath = `${dirPath}${sep}${fileName}`;

            try {
                await createProjectFile(fullPath, '');
            } catch (err) {
                console.error('[notepad] create file failed:', err);
                alert('Could not create file: ' + err);
                return;
            }
            await this.refreshTree();
            this.expandPath(dirPath);
            // Reuse the tree-click flow so dirty-prompt + autosave
            // bookkeeping stays in one place.
            const node = this.findNodeByPath(this.project.tree, fullPath);
            if (node) await this.onTreeClick({ ...node, isDir: false });
        },

        // Expand every ancestor of `path` so the new entry is visible in
        // the flat-tree render.
        expandPath(path) {
            if (!this.project) return;
            const root = this.project.path.replace(/[\/\\]+$/, '');
            if (!path.startsWith(root)) return;
            const next = { ...this.expanded };
            const sep = root.includes('\\') ? '\\' : '/';
            const rel = path.slice(root.length).replace(/^[\/\\]+/, '');
            const segs = rel.split(/[\/\\]+/).filter(Boolean);
            let cursor = root;
            for (const s of segs) {
                cursor = `${cursor}${sep}${s}`;
                next[cursor] = true;
            }
            this.expanded = next;
        },

        findNodeByPath(node, path) {
            if (!node) return null;
            if (node.path === path) return node;
            if (!node.children) return null;
            for (const c of node.children) {
                const found = this.findNodeByPath(c, path);
                if (found) return found;
            }
            return null;
        },

        async onTreeClick(node) {
            if (node.isDir) {
                // Toggle expand. Use object spread to keep the reactivity
                // notification (Courvux watches assignment, not deep keys).
                const next = { ...this.expanded };
                if (next[node.path]) delete next[node.path];
                else next[node.path] = true;
                this.expanded = next;
                // Toggle the "+ New" target: clicking the already-selected
                // folder a second time deselects it (next create lands at
                // project root); clicking a different folder switches the
                // target to that one.
                this.selectedDir = (this.selectedDir === node.path) ? null : node.path;
                return;
            }
            if (node.kind === 'image') {
                this.imagePreview = {
                    src: convertFileSrc(node.path),
                    alt: node.name,
                };
                // Set the file's parent dir as the target — keeps
                // consecutive `+ New` operations next to whatever the
                // user is currently working with.
                this.selectedDir = parentDir(node.path);
                return;
            }
            if (node.kind === 'md') {
                if (this.projectSaveStatus === 'unsaved' || this.projectSaveStatus === 'dirty') {
                    if (!confirm('You have unsaved changes. Switch anyway?')) return;
                }
                this.cancelAutoSave?.();
                try {
                    const content = await readProjectFile(node.path);
                    this.openFile = {
                        path: node.path,
                        name: node.name,
                        content,
                        kind: 'md',
                    };
                    this.projectSaveStatus = 'saved';
                    this.selectedDir = parentDir(node.path);
                } catch (err) {
                    console.error('[notepad] read project file failed:', err);
                    alert('Could not open file: ' + err);
                }
                return;
            }
            // 'other' kind — non-editable. Surface a soft hint instead
            // of silently swallowing the click.
            alert(`"${node.name}" is not a Markdown or image file. Open it in your preferred editor.`);
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
            await this.importExternalMd(picked);
        },

        // Shared import path used by File → Open, the OS file-association
        // launch (Rust pre-mount queue), and live `open-files` events from
        // the single-instance plugin. Inserts the new note into the sidebar
        // and selects it so the user sees the imported content immediately.
        async importExternalMd(path) {
            try {
                const summary = await importMd(path);
                // Body stays unloaded — select() pulls it from disk on
                // demand, which keeps the import path fast for big files.
                this.notes.push({
                    id: summary.id,
                    title: summary.title,
                    body: '',
                    createdAt: 0,
                    updatedAt: summary.updatedAt,
                    _loaded: false,
                });
                await this.select(summary.id);
                return summary;
            } catch (err) {
                console.error('[notepad] import failed:', path, err);
                alert('Open failed: ' + err);
                return null;
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

        // Bundle every `.md` in the project into a single PDF generated
        // with jsPDF. We render each file's markdown to HTML, hand the
        // HTML to a hand-written DOM walker in `pdf-export.js`, and
        // emit real PDF link annotations for both URLs and intra-doc
        // jumps (`[other](other.md)` → click jumps to that section's
        // first page). The webkit print pipeline can't preserve link
        // annotations on Linux, which is why we don't use window.print().
        async exportProjectPdf() {
            if (!this.project) {
                alert('Open a project first.');
                return;
            }
            // Flush any pending edits so the bundled PDF reflects disk.
            if (this.projectSaveStatus === 'unsaved' || this.projectSaveStatus === 'dirty') {
                await this.forceSave();
            }

            const mdFiles = [];
            const collect = (node) => {
                if (!node) return;
                if (node.kind === 'md') { mdFiles.push(node); return; }
                if (node.kind === 'dir' && node.children) {
                    for (const c of node.children) collect(c);
                }
            };
            collect(this.project.tree);

            if (mdFiles.length === 0) {
                alert('No Markdown files in this project.');
                return;
            }

            const rootAbs = this.project.path.replace(/[\/\\]+$/, '');

            // Absolute-path → section-index map. The link resolver hands
            // back `#pdf-N` strings; the PDF builder reads that anchor
            // and emits a PageJump annotation pointing at section N's
            // first page (resolved at finalize, since we don't know the
            // page numbers until the layout completes).
            const fileToIndex = new Map();
            mdFiles.forEach((node, i) => fileToIndex.set(node.path.toLowerCase(), i));

            // Render each section's HTML up front so the PDF builder
            // gets a clean payload to walk. Image hrefs resolve against
            // the file's own directory (markdown convention), not the
            // project root.
            const sections = [];
            for (let i = 0; i < mdFiles.length; i++) {
                const node = mdFiles[i];
                let content = '';
                try {
                    content = await readProjectFile(node.path);
                } catch (err) {
                    console.warn('[notepad] export bundle skip unreadable:', node.path, err);
                    continue;
                }
                const lastSep = Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'));
                const baseDir = lastSep > 0 ? node.path.slice(0, lastSep) : rootAbs;
                const relPath = node.path.startsWith(rootAbs)
                    ? node.path.slice(rootAbs.length).replace(/^[\/\\]+/, '')
                    : node.name;

                const linkResolver = (href, refBaseDir) => {
                    if (!href) return null;
                    if (/^[a-z][a-z0-9+.\-]*:/i.test(href)
                        || href.startsWith('//')
                        || href.startsWith('#')) {
                        return null;
                    }
                    let candidate = href;
                    if (!candidate.startsWith('/') && !/^[A-Za-z]:[\\\/]/.test(candidate)) {
                        const dirSep = refBaseDir.includes('\\') ? '\\' : '/';
                        const trimmed = refBaseDir.replace(/[\/\\]+$/, '');
                        candidate = `${trimmed}${dirSep}${href.replace(/^[\/\\]+/, '')}`;
                    }
                    const normalized = normalizePath(candidate);
                    const target = fileToIndex.get(normalized.toLowerCase());
                    return target != null ? `#pdf-${target}` : null;
                };

                const html = renderMarkdown(content, baseDir, linkResolver);
                sections.push({ index: i, title: relPath, html });
            }

            const dest = await saveDialog({
                defaultPath: (this.project.name || 'project') + '.pdf',
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
                title: 'Export project as PDF',
            });
            if (!dest) return;

            let base64;
            try {
                const { buildProjectPdf } = await import('./pdf-export.js');
                base64 = await buildProjectPdf({ sections });
            } catch (err) {
                console.error('[notepad] pdf build failed:', err);
                alert('PDF generation failed: ' + err);
                return;
            }

            try {
                await writeBinaryFile(dest, base64);
            } catch (err) {
                console.error('[notepad] pdf write failed:', err);
                alert('Save failed: ' + err);
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

        // Recent projects + last-project resumption. We always load the
        // recent list (the welcome screen displays it), but only auto-
        // reopen when the user was last in project mode AND the path is
        // still in the recent list (Rust prunes deleted dirs lazily).
        try {
            this.recentProjects = await getRecentProjects();
            const wasProject = (() => { try { return localStorage.getItem(APP_MODE_KEY) === 'project'; } catch { return false; } })();
            const lastPath   = (() => { try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; } })();
            if (wasProject && lastPath && this.recentProjects.includes(lastPath)) {
                await this.activateProject(lastPath);
            }
        } catch (err) {
            console.error('[notepad] recent projects load failed:', err);
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
            // Snapshot whichever identity matters for the current mode so
            // a switch (note → note in library, file → file in project,
            // or library ↔ project) cancels the pending write.
            const scheduledMode = this.mode;
            const scheduledKey = scheduledMode === 'project'
                ? this.openFile?.path ?? null
                : this.selectedId;
            autoSaveTimer = setTimeout(() => {
                autoSaveTimer = null;
                if (this.mode !== scheduledMode) return;
                const currentKey = scheduledMode === 'project'
                    ? this.openFile?.path ?? null
                    : this.selectedId;
                if (currentKey !== scheduledKey) return;
                const status = scheduledMode === 'project' ? this.projectSaveStatus : this.saveStatus;
                if (status === 'dirty') this.persist();
            }, 600);
        };
        this.cancelAutoSave = () => {
            if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        };

        // OS file-association entry points. Two paths converge here:
        //  1. First launch (`<app> note.md` from a file manager double-
        //     click). The webview isn't ready when Rust's `setup` runs,
        //     so paths are queued in AppState and we drain the queue here.
        //  2. Every subsequent launch is intercepted by tauri-plugin-
        //     single-instance, which emits `open-files` to the running
        //     window. We import each path and select the last one so the
        //     user lands on the file they just clicked.
        try {
            const pending = await takePendingOpenFiles();
            for (const path of pending) {
                await this.importExternalMd(path);
            }
        } catch (err) {
            console.error('[notepad] pending opens drain failed:', err);
        }
        listen('open-files', async (e) => {
            const paths = Array.isArray(e.payload) ? e.payload : [];
            for (const path of paths) {
                await this.importExternalMd(path);
            }
        }).catch(err => console.error('[notepad] open-files listener failed:', err));

        // Listen for native-menu events emitted from src-tauri/src/lib.rs.
        // The handler returns an unlisten function — we don't store it
        // because the listener should live for the entire app session
        // (window close tears it down).
        listen('menu', async (e) => {
            switch (e.payload) {
                case 'new':
                    if (this.mode === 'project') await this.newProjectFile();
                    else this.newNote();
                    break;
                case 'open':          await this.openMd();        break;
                case 'open_folder':   await this.openFolder();    break;
                case 'close_project': await this.closeProject();  break;
                case 'save':          await this.forceSave();     break;
                case 'save_as':       await this.saveAs();        break;
                case 'export_pdf':         await this.exportPdf();        break;
                case 'export_project_pdf': await this.exportProjectPdf(); break;
            }
        }).catch(err => console.error('[notepad] menu listener failed:', err));

        window.addEventListener('keydown', (e) => {
            // Esc closes whichever modal is open. Cheap escape hatch when
            // the user reaches for the X with the keyboard.
            if (e.key === 'Escape') {
                if (this.nameInput)    { this.cancelNameInput();    return; }
                if (this.imagePreview) { this.imagePreview = null;  return; }
                if (this.settingsOpen) { this.settingsOpen = false; return; }
                if (this.aboutOpen)    { this.aboutOpen = false;    return; }
            }
            const meta = e.ctrlKey || e.metaKey;
            if (!meta) return;
            const k = e.key.toLowerCase();
            if (k === 'n') {
                e.preventDefault();
                if (this.mode === 'project') this.newProjectFile();
                else this.newNote();
            }
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
