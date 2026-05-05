// Thin wrapper around `@tauri-apps/api` so the Courvux app calls plain
// async functions and never touches the IPC plumbing directly. Keeps the
// surface area small and easy to mock for browser-only previews.

import { invoke } from '@tauri-apps/api/core';

/**
 * Read the persisted notes from disk.
 * Calls Rust `load_notes` command — returns an empty array on first run
 * (no file yet) and on JSON parse errors (corrupted file is rebuilt
 * silently on the next save).
 *
 * @returns {Promise<Array<{ id: number, title: string, body: string, updatedAt: number }>>}
 */
export const loadNotes = () => invoke('load_notes');

/**
 * Persist the full notes array to disk. The Rust side writes atomically
 * via tempfile + rename so a crash mid-write doesn't corrupt the store.
 *
 * @param {Array<{ id: number, title: string, body: string, updatedAt: number }>} notes
 * @returns {Promise<void>}
 */
export const saveNotes = (notes) => invoke('save_notes', { notes });

/** Convenience: resolve the data file path so it can be shown in the UI. */
export const notesPath = () => invoke('notes_path');
