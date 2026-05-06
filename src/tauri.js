// Thin wrapper around `@tauri-apps/api` so the Courvux app calls plain
// async functions and never touches the IPC plumbing directly. v0.2.0:
// each note is now its own Markdown file with YAML frontmatter rather
// than a single notes.json blob.

import { invoke } from '@tauri-apps/api/core';

/**
 * Sidebar payload — id, title, updatedAt for every persisted note.
 * Body is loaded on demand via `readNote(id)` to keep the list fast
 * even with hundreds of long notes.
 *
 * @returns {Promise<Array<{ id: number, title: string, updatedAt: number }>>}
 */
export const listNotes = () => invoke('list_notes');

/**
 * Fetch the full body for a single note. Returns the parsed
 * frontmatter fields plus the markdown body.
 *
 * @param {number} id
 * @returns {Promise<{ id: number, title: string, body: string, createdAt: number, updatedAt: number }>}
 */
export const readNote = (id) => invoke('read_note', { id });

/**
 * Persist a note. Returns the new `updatedAt` timestamp the Rust side
 * stamped on the file so the JS state can sync without a re-read.
 *
 * @param {{ id: number, title: string, body: string, createdAt: number }} note
 * @returns {Promise<number>}
 */
export const writeNote = (note) => invoke('write_note', {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt,
});

/**
 * Delete a note's `.md` file. No-op if the file is already gone.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const deleteNote = (id) => invoke('delete_note', { id });

/** Currently active notes directory (custom-picked or default). */
export const notesDir = () => invoke('get_notes_dir');

/** Default notes directory (<app-data>/courvux-tauri-notepad/notes). */
export const defaultNotesDir = () => invoke('get_default_notes_dir');

/**
 * Override the notes directory. Returns the resolved absolute path on
 * success. Tauri creates the directory if it doesn't exist.
 */
export const setNotesDir = (path) => invoke('set_notes_dir', { path });

/** Drop the user override; returns the path of the default location. */
export const resetNotesDir = () => invoke('reset_notes_dir');

/** Whether auto-save (debounced 600 ms after a keystroke) is enabled. */
export const getAutoSave = () => invoke('get_auto_save');

/** Persist the user's auto-save preference. */
export const setAutoSave = (enabled) => invoke('set_auto_save', { enabled });

/**
 * Copy a foreign .md file from `source` (absolute path) into the active
 * notes folder as a brand-new note. Returns the new sidebar summary.
 *
 * @param {string} source
 * @returns {Promise<{ id: number, title: string, updatedAt: number }>}
 */
export const importMd = (source) => invoke('import_md_file', { source });

/**
 * Write the given title + body to `dest` as a portable Markdown file
 * (no YAML frontmatter — title becomes the first H1 heading).
 *
 * @param {string} dest
 * @param {string} title
 * @param {string} body
 * @returns {Promise<void>}
 */
export const exportMd = (dest, title, body) => invoke('export_md_file', { dest, title, body });

/**
 * Drain any .md paths the OS handed us at launch through the file
 * association (queued in Rust during `setup` because the webview wasn't
 * ready yet). Subsequent launches are delivered live via the `open-files`
 * event from the single-instance plugin.
 *
 * @returns {Promise<string[]>}
 */
export const takePendingOpenFiles = () => invoke('take_pending_open_files');
