//! LAN Wi‑Fi sync: desktop hub + mobile client.

mod client;
mod firewall;
mod hub;
mod protocol;

pub use client::{
    sync_client_broadcast, sync_client_connect, sync_client_disconnect, sync_client_pair,
    sync_client_request_pair, sync_client_status, sync_discover, SyncClientState,
};
pub use hub::{
    sync_approve_pair, sync_broadcast, sync_deny_pair, sync_disable, sync_enable,
    sync_ensure_firewall, sync_forget_devices, sync_status, SyncHubState,
};
