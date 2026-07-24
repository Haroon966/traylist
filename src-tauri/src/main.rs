// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // GNOME Wayland ignores set_position — tray flyout stuck at left.
    // Always use X11/XWayland on Linux so we can pin the panel top-right.
    #[cfg(target_os = "linux")]
    {
        // SAFETY: called before GTK/Tauri init; single-threaded startup.
        unsafe {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }
    traylist_lib::run()
}
