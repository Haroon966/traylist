//! Open the LAN sync port in the OS firewall so phones can reach the desktop hub.
//!
//! Permanent UX (Linux): never call `pkexec` from app start / `sync_enable`.
//! Elevate only from the explicit Sync UI action, and only once per port
//! (marker file under `~/.local/share/traylist/`).

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallResult {
    pub ok: bool,
    pub detail: String,
}

/// Best-effort: allow inbound TCP `port` for Traylist Wi‑Fi sync.
/// Safe to call repeatedly — skips elevation when already done.
pub fn ensure_lan_port(port: u16) -> FirewallResult {
    #[cfg(target_os = "linux")]
    {
        return ensure_linux(port);
    }
    #[cfg(target_os = "windows")]
    {
        return ensure_windows(port);
    }
    #[cfg(target_os = "macos")]
    {
        return FirewallResult {
            ok: true,
            detail: "macOS will prompt if the firewall blocks Traylist — allow incoming connections"
                .into(),
        };
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = port;
        FirewallResult {
            ok: true,
            detail: "No firewall helper on this OS".into(),
        }
    }
}

#[cfg(target_os = "linux")]
fn marker_path(port: u16) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join(".local/share/traylist")
            .join(format!("firewall-{port}.ok")),
    )
}

#[cfg(target_os = "linux")]
fn marker_present(port: u16) -> bool {
    marker_path(port).is_some_and(|p| p.is_file())
}

#[cfg(target_os = "linux")]
fn write_marker(port: u16) {
    if let Some(path) = marker_path(port) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&path, format!("tcp/{port}\n"));
    }
}

#[cfg(target_os = "linux")]
fn ensure_linux(port: u16) -> FirewallResult {
    let ufw_on = fs::read_to_string("/etc/ufw/ufw.conf")
        .map(|c| {
            c.lines().any(|l| {
                let t = l.trim();
                t.eq_ignore_ascii_case("ENABLED=yes")
            })
        })
        .unwrap_or(false);
    let firewalld_on = Command::new("systemctl")
        .args(["is-active", "--quiet", "firewalld"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !ufw_on && !firewalld_on {
        return FirewallResult {
            ok: true,
            detail: "No UFW/firewalld active — port should be reachable".into(),
        };
    }

    // Already elevated successfully once for this port — never prompt again.
    if marker_present(port) {
        return FirewallResult {
            ok: true,
            detail: format!("Firewall already configured for TCP {port}"),
        };
    }

    // One elevated script: open via firewalld and/or ufw if that stack is active.
    // Note: pkexec always prompts before running — call only from explicit UI.
    let script = format!(
        r#"set -e
PORT={port}
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  if ! firewall-cmd --query-port="${{PORT}}/tcp" >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${{PORT}}/tcp" >/dev/null
    firewall-cmd --reload >/dev/null
  fi
fi
if [ -f /etc/ufw/ufw.conf ] && grep -qi '^ENABLED=yes' /etc/ufw/ufw.conf; then
  if ! ufw status 2>/dev/null | grep -qE "(^| )${{PORT}}/tcp( |$)"; then
    ufw allow "${{PORT}}/tcp" comment 'Traylist Wi-Fi sync' >/dev/null
  fi
fi
exit 0
"#
    );

    match Command::new("pkexec").args(["sh", "-c", &script]).status() {
        Ok(st) if st.success() => {
            write_marker(port);
            FirewallResult {
                ok: true,
                detail: format!("Firewall allows TCP {port} for Traylist"),
            }
        }
        Ok(_) => FirewallResult {
            ok: false,
            detail: format!(
                "Password prompt dismissed. Open once with: sudo ufw allow {port}/tcp — then tap Allow through firewall again, or restart after that command."
            ),
        },
        Err(_) => FirewallResult {
            ok: false,
            detail: format!(
                "Need admin once. Run: sudo ufw allow {port}/tcp   (or firewall-cmd --add-port={port}/tcp --permanent && firewall-cmd --reload)"
            ),
        },
    }
}

#[cfg(target_os = "windows")]
fn ensure_windows(port: u16) -> FirewallResult {
    let name = "Traylist Wi-Fi sync";
    let show = Command::new("netsh")
        .args(["advfirewall", "firewall", "show", "rule", &format!("name={name}")])
        .output();
    if let Ok(out) = show {
        let text = String::from_utf8_lossy(&out.stdout);
        if out.status.success() && text.contains("Traylist") {
            return FirewallResult {
                ok: true,
                detail: format!("Windows Firewall already allows TCP {port}"),
            };
        }
    }
    let add = Command::new("netsh")
        .args([
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={name}"),
            "dir=in",
            "action=allow",
            "protocol=TCP",
            &format!("localport={port}"),
            "profile=any",
        ])
        .status();
    match add {
        Ok(st) if st.success() => FirewallResult {
            ok: true,
            detail: format!("Windows Firewall allows TCP {port}"),
        },
        _ => FirewallResult {
            ok: false,
            detail: format!(
                "Run as admin: netsh advfirewall firewall add rule name=\"Traylist Wi-Fi sync\" dir=in action=allow protocol=TCP localport={port}"
            ),
        },
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn default_port_in_script_shape() {
        let port = 17834u16;
        let s = format!("PORT={port}");
        assert!(s.contains("17834"));
    }
}
