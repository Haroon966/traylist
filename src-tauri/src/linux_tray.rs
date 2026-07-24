//! Linux tray via StatusNotifierItem (ksni).
//!
//! Ubuntu GNOME AppIndicator **always shows the DBus menu on click** (Activate is
//! double-click only). So we open the tray panel from `menu_about_to_show` and keep
//! the native menu empty — todos + inline add live in the panel, not Open/Quit.

use std::sync::Mutex;

use ksni::blocking::TrayMethods;
use ksni::{Icon, MenuItem, ToolTip, Tray};
use tauri::AppHandle;

use crate::{
    default_tray_corner_spot, open_tray_panel, remember_tray_spot, toggle_popup, TrayIconSpot,
};

struct TraylistTray {
    app: AppHandle,
    icon: Icon,
    tooltip: String,
    label: String,
}

impl Tray for TraylistTray {
    // Prefer Activate when the host honors it (KDE, etc.).
    const MENU_ON_ACTIVATE: bool = false;

    fn id(&self) -> String {
        "traylist".into()
    }

    fn title(&self) -> String {
        if self.label.is_empty() {
            "Traylist".into()
        } else {
            format!("Traylist {}", self.label)
        }
    }

    fn icon_pixmap(&self) -> Vec<Icon> {
        vec![self.icon.clone()]
    }

    fn tool_tip(&self) -> ToolTip {
        ToolTip {
            title: self.tooltip.clone(),
            ..Default::default()
        }
    }

    fn activate(&mut self, x: i32, y: i32) {
        remember_tray_spot(
            &self.app,
            TrayIconSpot {
                x: f64::from(x) - 14.0,
                y: f64::from(y) - 14.0,
                w: 28.0,
                h: 28.0,
            },
        );
        toggle_popup(&self.app);
    }

    fn secondary_activate(&mut self, x: i32, y: i32) {
        self.activate(x, y);
    }

    /// GNOME shows the menu on every click — open our panel instead of Open/Quit.
    /// Always show (don't toggle): hosts may call this more than once per click.
    fn menu_about_to_show(&mut self) {
        open_tray_panel(&self.app);
    }

    /// Empty on purpose: no native Open/Quit menu. Quit lives in the panel ⋯ menu.
    fn menu(&self) -> Vec<MenuItem<Self>> {
        Vec::new()
    }
}

static TRAY_HANDLE: Mutex<Option<ksni::blocking::Handle<TraylistTray>>> = Mutex::new(None);

fn rgba_to_argb_icon(rgba: &[u8], width: u32, height: u32) -> Icon {
    let mut data = rgba.to_vec();
    for pixel in data.chunks_exact_mut(4) {
        pixel.rotate_right(1); // RGBA → ARGB
    }
    Icon {
        width: width as i32,
        height: height as i32,
        data,
    }
}

pub fn setup_linux_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    let icon = match app.default_window_icon() {
        Some(img) => rgba_to_argb_icon(img.rgba(), img.width(), img.height()),
        None => return Err("missing window icon".into()),
    };

    remember_tray_spot(app.handle(), default_tray_corner_spot(app.handle()));

    let tray = TraylistTray {
        app: handle,
        icon,
        tooltip: "Traylist".into(),
        label: String::new(),
    };

    let tray_handle = tray.spawn()?;
    *TRAY_HANDLE.lock().unwrap_or_else(|e| e.into_inner()) = Some(tray_handle);

    Ok(())
}

pub fn sync_menu(open_count: u32, has_overdue: bool) -> Result<(), String> {
    update_badge_inner(open_count, has_overdue)
}

pub fn update_badge(_app: &AppHandle, open_count: u32, has_overdue: bool) -> Result<(), String> {
    update_badge_inner(open_count, has_overdue)
}

fn update_badge_inner(open_count: u32, has_overdue: bool) -> Result<(), String> {
    let tooltip = if has_overdue {
        format!("Traylist — {open_count} open, overdue!")
    } else if open_count == 0 {
        "Traylist — all clear".to_string()
    } else {
        format!("Traylist — {open_count} open")
    };
    let label = if has_overdue {
        "!".to_string()
    } else if open_count > 0 {
        open_count.to_string()
    } else {
        String::new()
    };

    let guard = TRAY_HANDLE.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = guard.as_ref() {
        handle.update(|tray| {
            tray.tooltip = tooltip;
            tray.label = label;
        });
    }
    Ok(())
}
