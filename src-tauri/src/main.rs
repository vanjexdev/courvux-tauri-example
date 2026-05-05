// Prevent the console window from appearing on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    courvux_tauri_notepad_lib::run()
}
