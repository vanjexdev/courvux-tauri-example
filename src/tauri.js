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

/** Path of the `notes/` directory (shown in the UI footer for debugging). */
export const notesDir = () => invoke('notes_dir');
