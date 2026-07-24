mod sync;

#[cfg(all(desktop, target_os = "linux"))]
mod linux_tray;

#[cfg(desktop)]
use std::sync::Mutex;
use sync::{
    sync_approve_pair, sync_broadcast, sync_client_broadcast, sync_client_connect,
    sync_client_disconnect, sync_client_pair, sync_client_request_pair, sync_client_status,
    sync_deny_pair, sync_discover, sync_disable, sync_enable, sync_ensure_firewall,
    sync_forget_devices, sync_status, SyncClientState, SyncHubState,
};

#[cfg(desktop)]
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime};

#[cfg(mobile)]
use tauri::Manager;

#[cfg(all(desktop, not(target_os = "linux")))]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Last known tray-icon rectangle (physical pixels) so the panel opens on the icon.
#[cfg(desktop)]
#[derive(Clone, Copy, Debug)]
pub(crate) struct TrayIconSpot {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[cfg(desktop)]
pub(crate) struct LastTraySpot(pub(crate) Mutex<Option<TrayIconSpot>>);

#[cfg(desktop)]
pub(crate) fn remember_tray_spot<R: Runtime>(app: &tauri::AppHandle<R>, spot: TrayIconSpot) {
    if spot.w <= 0.0 && spot.h <= 0.0 && spot.x == 0.0 && spot.y == 0.0 {
        return;
    }
    if let Some(state) = app.try_state::<LastTraySpot>() {
        if let Ok(mut g) = state.0.lock() {
            *g = Some(spot);
        }
    }
}

#[cfg(desktop)]
#[cfg(all(desktop, not(target_os = "linux")))]
fn spot_from_event(position: PhysicalPosition<f64>, rect: tauri::Rect) -> TrayIconSpot {
    let scale = 1.0;
    let (rx, ry, rw, rh) = match (&rect.position, &rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        }
        (tauri::Position::Logical(p), tauri::Size::Logical(s)) => {
            (p.x * scale, p.y * scale, s.width * scale, s.height * scale)
        }
        (tauri::Position::Physical(p), tauri::Size::Logical(s)) => {
            (p.x as f64, p.y as f64, s.width, s.height)
        }
        (tauri::Position::Logical(p), tauri::Size::Physical(s)) => {
            (p.x, p.y, s.width as f64, s.height as f64)
        }
    };

    // Prefer icon rect when valid; otherwise fall back to cursor position as a 24×24 hit target
    if rw > 1.0 && rh > 1.0 {
        TrayIconSpot {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
        }
    } else {
        TrayIconSpot {
            x: position.x - 12.0,
            y: position.y - 12.0,
            w: 24.0,
            h: 24.0,
        }
    }
}

/// Place the panel in the top-right of the primary monitor (under the system bar).
#[cfg(desktop)]
pub(crate) fn show_popup_at_tray<R: Runtime>(app: &tauri::AppHandle<R>, _spot: TrayIconSpot) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let size = window.outer_size().unwrap_or(PhysicalSize::new(360, 480));
    let win_w = size.width as f64;

    let monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten());

    let (screen_x, screen_y, screen_w, scale) = if let Some(m) = monitor {
        let pos = m.position();
        let sz = m.size();
        (
            pos.x as f64,
            pos.y as f64,
            sz.width as f64,
            m.scale_factor(),
        )
    } else {
        (0.0, 0.0, 1920.0, 1.0)
    };

    let margin = 12.0 * scale;
    let top_bar = 36.0 * scale;
    let pos_x = (screen_x + screen_w - win_w - margin).round() as i32;
    let pos_y = (screen_y + top_bar + margin).round() as i32;

    // Tell UI to ignore blur-hide while GNOME dismisses its empty menu popup.
    let _ = window.emit("traylist://panel-open", ());
    let _ = window.show();
    // Position after show — needed under XWayland; no-op on pure Wayland.
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
        x: pos_x,
        y: pos_y,
    }));
    let _ = window.set_focus();
    // Re-assert after map (some compositors apply first move late).
    let win = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(32));
        let _ = win.set_position(tauri::Position::Physical(PhysicalPosition {
            x: pos_x,
            y: pos_y,
        }));
        let _ = win.set_focus();
    });
    let _ = window.emit("traylist://focus-input", ());
}

/// Fallback when we have never seen the tray icon rect: dock to the tray corner of the screen.
#[cfg(desktop)]
pub(crate) fn default_tray_corner_spot<R: Runtime>(app: &tauri::AppHandle<R>) -> TrayIconSpot {
    let window = app.get_webview_window("main");
    let monitor = window
        .as_ref()
        .and_then(|w| w.primary_monitor().ok().flatten());

    if let Some(m) = monitor {
        let pos = m.position();
        let sz = m.size();
        let screen_x = pos.x as f64;
        let screen_y = pos.y as f64;
        let screen_w = sz.width as f64;
        // Ubuntu / GNOME: top panel; Windows: bottom. Use top-right on Linux, bottom-right elsewhere.
        #[cfg(target_os = "linux")]
        {
            return TrayIconSpot {
                x: screen_x + screen_w - 40.0,
                y: screen_y + 4.0,
                w: 28.0,
                h: 28.0,
            };
        }
        #[cfg(not(target_os = "linux"))]
        {
            let screen_h = sz.height as f64;
            return TrayIconSpot {
                x: screen_x + screen_w - 40.0,
                y: screen_y + screen_h - 40.0,
                w: 28.0,
                h: 28.0,
            };
        }
    }

    TrayIconSpot {
        x: 1800.0,
        y: 8.0,
        w: 28.0,
        h: 28.0,
    }
}

#[cfg(desktop)]
pub(crate) fn open_tray_panel<R: Runtime>(app: &tauri::AppHandle<R>) {
    // Always dock top-right (ignore stale / wrong tray click coords on Wayland).
    let spot = default_tray_corner_spot(app);
    show_popup_at_tray(app, spot);
}

#[cfg(desktop)]
pub(crate) fn toggle_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            open_tray_panel(app);
        }
    }
}

#[cfg(all(desktop, not(target_os = "linux")))]
fn handle_tray_click<R: Runtime>(app: &tauri::AppHandle<R>, spot: TrayIconSpot) {
    remember_tray_spot(app, spot);
    toggle_popup(app);
}

#[cfg(all(desktop, not(target_os = "linux")))]
fn set_tray_badge(
    app: &tauri::AppHandle,
    open_count: u32,
    has_overdue: bool,
) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;
    let tooltip = if has_overdue {
        format!("Traylist — {open_count} open, overdue!")
    } else if open_count == 0 {
        "Traylist — all clear".to_string()
    } else {
        format!("Traylist — {open_count} open")
    };
    tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())?;
    let title = if has_overdue {
        Some("!".to_string())
    } else if open_count > 0 {
        Some(open_count.to_string())
    } else {
        None
    };
    let _ = tray.set_title(title.as_deref());
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn sync_tray_menu(
    app: tauri::AppHandle,
    open_count: u32,
    has_overdue: bool,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        return linux_tray::sync_menu(open_count, has_overdue);
    }

    #[cfg(not(target_os = "linux"))]
    {
        set_tray_badge(&app, open_count, has_overdue)
    }
}

#[cfg(desktop)]
#[tauri::command]
fn update_tray_badge(app: tauri::AppHandle, open_count: u32, has_overdue: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        return linux_tray::update_badge(&app, open_count, has_overdue);
    }

    #[cfg(not(target_os = "linux"))]
    {
        set_tray_badge(&app, open_count, has_overdue)
    }
}

#[cfg(desktop)]
#[tauri::command]
fn app_quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(mobile)]
#[tauri::command]
fn update_tray_badge(_open_count: u32, _has_overdue: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
fn sync_tray_menu(_open_count: u32, _has_overdue: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(mobile)]
#[tauri::command]
fn app_quit() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SyncHubState::new())
        .manage(SyncClientState::new())
        .invoke_handler(tauri::generate_handler![
            update_tray_badge,
            sync_tray_menu,
            app_quit,
            sync_status,
            sync_enable,
            sync_disable,
            sync_forget_devices,
            sync_broadcast,
            sync_ensure_firewall,
            sync_approve_pair,
            sync_deny_pair,
            sync_discover,
            sync_client_pair,
            sync_client_request_pair,
            sync_client_connect,
            sync_client_disconnect,
            sync_client_status,
            sync_client_broadcast,
        ]);

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_widgets::init());
    }

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                Some(vec!["--autostart"]),
            ))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        let target =
                            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                        let mac =
                            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
                        if (shortcut == &target || shortcut == &mac)
                            && event.state == ShortcutState::Pressed
                        {
                            toggle_popup(app);
                        }
                    })
                    .build(),
            )
            .manage(LastTraySpot(Mutex::new(None)))
            .setup(|app| {
                let handle = app.handle().clone();

                #[cfg(target_os = "linux")]
                {
                    linux_tray::setup_linux_tray(app)
                        .map_err(|e| std::io::Error::other(e.to_string()))?;
                }

                #[cfg(not(target_os = "linux"))]
                {
                    // Right-click only: Quit. Left-click opens the panel (list + add).
                    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                    let menu = Menu::with_items(app, &[&quit])?;

                    let _tray = TrayIconBuilder::with_id("main")
                        .icon(app.default_window_icon().unwrap().clone())
                        .tooltip("Traylist")
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .on_menu_event(|app, event| {
                            if event.id.as_ref() == "quit" {
                                app.exit(0);
                            }
                        })
                        .on_tray_icon_event(|tray, event| {
                            let app = tray.app_handle();
                            match &event {
                                TrayIconEvent::Click {
                                    position,
                                    rect,
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                }
                                | TrayIconEvent::DoubleClick {
                                    position,
                                    rect,
                                    button: MouseButton::Left,
                                    ..
                                } => {
                                    let spot = spot_from_event(*position, *rect);
                                    handle_tray_click(app, spot);
                                }
                                TrayIconEvent::Enter { position, rect, .. }
                                | TrayIconEvent::Move { position, rect, .. }
                                | TrayIconEvent::Leave { position, rect, .. } => {
                                    let spot = spot_from_event(*position, *rect);
                                    remember_tray_spot(app, spot);
                                }
                                _ => {}
                            }
                        })
                        .build(app)?;
                }

                let ctrl = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                let cmd = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
                let _ = handle.global_shortcut().register(ctrl);
                let _ = handle.global_shortcut().register(cmd);

                if let Some(window) = app.get_webview_window("main") {
                    let win = window.clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win.hide();
                        }
                    });
                }

                Ok(())
            });
    }

    #[cfg(mobile)]
    {
        builder = builder.setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
