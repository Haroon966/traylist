use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use mdns_sd::{ServiceDaemon, ServiceInfo};
use rand::RngCore;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::{broadcast, Mutex, RwLock};

use super::firewall::{self, FirewallResult};
use super::protocol::{
    PairRequest, PairRequestCreate, PairRequestCreated, PairRequestState, PairRequestStatus,
    PairResponse, PendingPairEvent, SyncPatch, SyncStatusDto, WsMsg, DEFAULT_PORT, SERVICE_TYPE,
};

type Tx = broadcast::Sender<String>;

pub struct SyncHubState {
    inner: Arc<HubInner>,
}

struct HubInner {
    enabled: RwLock<bool>,
    pair_code: RwLock<String>,
    port: RwLock<u16>,
    lan_ip: RwLock<Option<String>>,
    tokens: RwLock<HashMap<String, String>>,
    pending_pairs: RwLock<HashMap<String, PendingPair>>,
    connected: RwLock<HashMap<u64, String>>,
    next_client_id: Mutex<u64>,
    latest: RwLock<SyncPatch>,
    fanout: RwLock<Option<Tx>>,
    shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    mdns: Mutex<Option<ServiceDaemon>>,
}

#[derive(Clone)]
struct PendingPair {
    device_name: String,
    status: PairRequestState,
    token: Option<String>,
    created_at: std::time::Instant,
}

impl SyncHubState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(HubInner {
                enabled: RwLock::new(false),
                pair_code: RwLock::new(gen_pair_code()),
                port: RwLock::new(DEFAULT_PORT),
                lan_ip: RwLock::new(None),
                tokens: RwLock::new(HashMap::new()),
                pending_pairs: RwLock::new(HashMap::new()),
                connected: RwLock::new(HashMap::new()),
                next_client_id: Mutex::new(1),
                latest: RwLock::new(SyncPatch {
                    todos: json!([]),
                    tombstones: json!([]),
                    bin: json!([]),
                    bin_cleared_at: None,
                }),
                fanout: RwLock::new(None),
                shutdown: Mutex::new(None),
                mdns: Mutex::new(None),
            }),
        }
    }

    pub async fn status(&self) -> SyncStatusDto {
        let enabled = *self.inner.enabled.read().await;
        let connected: Vec<String> = self.inner.connected.read().await.values().cloned().collect();
        SyncStatusDto {
            role: "hub".into(),
            enabled,
            pair_code: if enabled {
                Some(self.inner.pair_code.read().await.clone())
            } else {
                None
            },
            port: if enabled {
                Some(*self.inner.port.read().await)
            } else {
                None
            },
            lan_ip: self.inner.lan_ip.read().await.clone(),
            connected,
            peer: None,
            error: None,
        }
    }
}

fn gen_pair_code() -> String {
    let n = (rand::thread_rng().next_u32() % 1_000_000) as u32;
    format!("{n:06}")
}

fn gen_token() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn gen_request_id() -> String {
    let mut bytes = [0u8; 8];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn lan_ip() -> Option<String> {
    // Prefer default-route IP; skip obvious virtual bridges if that fails.
    if let Ok(ip) = local_ip_address::local_ip() {
        return Some(ip.to_string());
    }
    local_ip_address::list_afinet_netifas()
        .ok()?
        .into_iter()
        .find_map(|(name, ip)| {
            let n = name.to_lowercase();
            if n.starts_with("lo")
                || n.starts_with("docker")
                || n.starts_with("br-")
                || n.starts_with("veth")
                || n.starts_with("lxc")
            {
                return None;
            }
            match ip {
                std::net::IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
                _ => None,
            }
        })
}

#[tauri::command]
pub async fn sync_status(
    hub: tauri::State<'_, SyncHubState>,
) -> Result<SyncStatusDto, String> {
    Ok(hub.status().await)
}

#[tauri::command]
pub async fn sync_ensure_firewall() -> Result<FirewallResult, String> {
    Ok(tokio::task::spawn_blocking(|| firewall::ensure_lan_port(DEFAULT_PORT))
        .await
        .map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn sync_enable(
    app: AppHandle,
    hub: tauri::State<'_, SyncHubState>,
) -> Result<SyncStatusDto, String> {
    enable_hub(app, hub.inner.clone()).await?;
    // Do NOT call pkexec here — Ubuntu prompts on every start and breaks the tray app.
    // Firewall is a one-time Sync UI action (`sync_ensure_firewall`).
    Ok(hub.status().await)
}

#[tauri::command]
pub async fn sync_disable(
    hub: tauri::State<'_, SyncHubState>,
) -> Result<SyncStatusDto, String> {
    disable_hub(hub.inner.clone()).await;
    Ok(hub.status().await)
}

#[tauri::command]
pub async fn sync_forget_devices(
    hub: tauri::State<'_, SyncHubState>,
) -> Result<SyncStatusDto, String> {
    hub.inner.tokens.write().await.clear();
    hub.inner.pending_pairs.write().await.clear();
    *hub.inner.pair_code.write().await = gen_pair_code();
    Ok(hub.status().await)
}

#[tauri::command]
pub async fn sync_approve_pair(
    app: AppHandle,
    hub: tauri::State<'_, SyncHubState>,
    id: String,
) -> Result<PairRequestStatus, String> {
    let mut pending = hub.inner.pending_pairs.write().await;
    let Some(entry) = pending.get_mut(id.trim()) else {
        return Err("Pair request not found or expired".into());
    };
    if entry.status != PairRequestState::Pending {
        return Ok(PairRequestStatus {
            id: id.trim().to_string(),
            device_name: entry.device_name.clone(),
            status: entry.status.clone(),
            token: entry.token.clone(),
        });
    }
    if entry.created_at.elapsed() > std::time::Duration::from_secs(90) {
        entry.status = PairRequestState::Expired;
        return Err("Pair request expired".into());
    }
    let token = gen_token();
    hub.inner
        .tokens
        .write()
        .await
        .insert(token.clone(), entry.device_name.clone());
    entry.status = PairRequestState::Approved;
    entry.token = Some(token.clone());
    *hub.inner.pair_code.write().await = gen_pair_code();
    let status = PairRequestStatus {
        id: id.trim().to_string(),
        device_name: entry.device_name.clone(),
        status: PairRequestState::Approved,
        token: Some(token),
    };
    drop(pending);
    let _ = app.emit("sync://status", hub.status().await);
    let _ = app.emit("sync://pair-resolved", status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn sync_deny_pair(
    app: AppHandle,
    hub: tauri::State<'_, SyncHubState>,
    id: String,
) -> Result<PairRequestStatus, String> {
    let mut pending = hub.inner.pending_pairs.write().await;
    let Some(entry) = pending.get_mut(id.trim()) else {
        return Err("Pair request not found or expired".into());
    };
    entry.status = PairRequestState::Denied;
    let status = PairRequestStatus {
        id: id.trim().to_string(),
        device_name: entry.device_name.clone(),
        status: PairRequestState::Denied,
        token: None,
    };
    drop(pending);
    let _ = app.emit("sync://pair-resolved", status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn sync_broadcast(
    hub: tauri::State<'_, SyncHubState>,
    patch: SyncPatch,
) -> Result<(), String> {
    if !*hub.inner.enabled.read().await {
        return Ok(());
    }
    *hub.inner.latest.write().await = patch.clone();
    let msg = serde_json::to_string(&WsMsg::Patch { patch }).map_err(|e| e.to_string())?;
    if let Some(tx) = hub.inner.fanout.read().await.as_ref() {
        let _ = tx.send(msg);
    }
    Ok(())
}

async fn disable_hub(inner: Arc<HubInner>) {
    *inner.enabled.write().await = false;
    if let Some(tx) = inner.shutdown.lock().await.take() {
        let _ = tx.send(());
    }
    if let Some(daemon) = inner.mdns.lock().await.take() {
        let _ = daemon.shutdown();
    }
    *inner.fanout.write().await = None;
    inner.connected.write().await.clear();
    *inner.lan_ip.write().await = None;
}

async fn enable_hub(app: AppHandle, inner: Arc<HubInner>) -> Result<(), String> {
    if *inner.enabled.read().await {
        return Ok(());
    }

    disable_hub(inner.clone()).await;

    let port = DEFAULT_PORT;
    *inner.port.write().await = port;
    *inner.pair_code.write().await = gen_pair_code();
    let ip = lan_ip();
    *inner.lan_ip.write().await = ip.clone();

    let (tx, _) = broadcast::channel::<String>(64);
    *inner.fanout.write().await = Some(tx.clone());

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    *inner.shutdown.lock().await = Some(shutdown_tx);

    let state = HubAxum {
        inner: inner.clone(),
        app: app.clone(),
        fanout: tx,
    };

    let router = Router::new()
        .route("/pair", post(pair_handler))
        .route("/pair-request", post(create_pair_request))
        .route("/pair-request/{id}", get(get_pair_request))
        .route("/ws", get(ws_handler))
        .route("/health", get(|| async { "ok" }))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {addr}: {e}"))?;

    // mDNS advertise
    if let Some(ref host_ip) = ip {
        match ServiceDaemon::new() {
            Ok(daemon) => {
                let host_name = format!("{}.local.", host_ip.replace('.', "-"));
                let props = [("path", "/ws")];
                match ServiceInfo::new(
                    SERVICE_TYPE,
                    "Traylist",
                    &host_name,
                    host_ip.as_str(),
                    port,
                    &props[..],
                ) {
                    Ok(info) => {
                        if let Err(e) = daemon.register(info) {
                            eprintln!("mdns register: {e}");
                        } else {
                            *inner.mdns.lock().await = Some(daemon);
                        }
                    }
                    Err(e) => eprintln!("mdns ServiceInfo: {e}"),
                }
            }
            Err(e) => eprintln!("mdns daemon: {e}"),
        }
    }

    *inner.enabled.write().await = true;
    let _ = app.emit("sync://status", inner_status_json(&inner).await);

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
        *inner.enabled.write().await = false;
    });

    Ok(())
}

async fn inner_status_json(inner: &HubInner) -> SyncStatusDto {
    let enabled = *inner.enabled.read().await;
    SyncStatusDto {
        role: "hub".into(),
        enabled,
        pair_code: if enabled {
            Some(inner.pair_code.read().await.clone())
        } else {
            None
        },
        port: if enabled {
            Some(*inner.port.read().await)
        } else {
            None
        },
        lan_ip: inner.lan_ip.read().await.clone(),
        connected: inner.connected.read().await.values().cloned().collect(),
        peer: None,
        error: None,
    }
}

#[derive(Clone)]
struct HubAxum {
    inner: Arc<HubInner>,
    app: AppHandle,
    fanout: Tx,
}

async fn pair_handler(
    State(state): State<HubAxum>,
    Json(body): Json<PairRequest>,
) -> Result<Json<PairResponse>, (axum::http::StatusCode, String)> {
    let code = state.inner.pair_code.read().await.clone();
    if body.code.trim() != code {
        return Err((
            axum::http::StatusCode::UNAUTHORIZED,
            "invalid pair code".into(),
        ));
    }
    let token = gen_token();
    let name = if body.device_name.trim().is_empty() {
        "Phone".into()
    } else {
        body.device_name.trim().to_string()
    };
    state.inner.tokens.write().await.insert(token.clone(), name);
    // rotate code after successful pair (one-time feel; still can pair more with new code)
    *state.inner.pair_code.write().await = gen_pair_code();
    let _ = state
        .app
        .emit("sync://status", inner_status_json(&state.inner).await);
    Ok(Json(PairResponse { token }))
}

async fn create_pair_request(
    State(state): State<HubAxum>,
    Json(body): Json<PairRequestCreate>,
) -> Result<Json<PairRequestCreated>, (axum::http::StatusCode, String)> {
    if !*state.inner.enabled.read().await {
        return Err((
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "Wi‑Fi sync is off on the desktop".into(),
        ));
    }
    // Drop stale requests
    {
        let mut pending = state.inner.pending_pairs.write().await;
        pending.retain(|_, p| {
            let age = p.created_at.elapsed();
            if p.status == PairRequestState::Pending {
                age < std::time::Duration::from_secs(120)
            } else {
                age < std::time::Duration::from_secs(30)
            }
        });
    }
    let name = if body.device_name.trim().is_empty() {
        "Phone".into()
    } else {
        body.device_name.trim().to_string()
    };
    let id = gen_request_id();
    state.inner.pending_pairs.write().await.insert(
        id.clone(),
        PendingPair {
            device_name: name.clone(),
            status: PairRequestState::Pending,
            token: None,
            created_at: std::time::Instant::now(),
        },
    );
    let _ = state.app.emit(
        "sync://pair-request",
        PendingPairEvent {
            id: id.clone(),
            device_name: name,
        },
    );
    Ok(Json(PairRequestCreated { id }))
}

async fn get_pair_request(
    State(state): State<HubAxum>,
    Path(id): Path<String>,
) -> Result<Json<PairRequestStatus>, (axum::http::StatusCode, String)> {
    let mut pending = state.inner.pending_pairs.write().await;
    let Some(entry) = pending.get_mut(id.trim()) else {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            "pair request not found".into(),
        ));
    };
    if entry.status == PairRequestState::Pending
        && entry.created_at.elapsed() > std::time::Duration::from_secs(90)
    {
        entry.status = PairRequestState::Expired;
    }
    Ok(Json(PairRequestStatus {
        id: id.trim().to_string(),
        device_name: entry.device_name.clone(),
        status: entry.status.clone(),
        token: entry.token.clone(),
    }))
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<HubAxum>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: HubAxum) {
    let (mut sink, mut stream) = socket.split();
    let authed: Option<(u64, String)>;
    // First message must be hello
    let deadline = tokio::time::sleep(std::time::Duration::from_secs(10));
    tokio::pin!(deadline);

    let hello = tokio::select! {
        _ = &mut deadline => None,
        msg = stream.next() => msg,
    };

    let Some(Ok(Message::Text(text))) = hello else {
        let _ = sink
            .send(Message::Text(
                serde_json::to_string(&WsMsg::Error {
                    message: "expected hello".into(),
                })
                .unwrap_or_default()
                .into(),
            ))
            .await;
        return;
    };

    let parsed: Result<WsMsg, _> = serde_json::from_str(&text);
    match parsed {
        Ok(WsMsg::Hello { token }) => {
            let name = {
                let tokens = state.inner.tokens.read().await;
                tokens.get(&token).cloned()
            };
            let Some(name) = name else {
                let _ = sink
                    .send(Message::Text(
                        serde_json::to_string(&WsMsg::Error {
                            message: "unauthorized".into(),
                        })
                        .unwrap_or_default()
                        .into(),
                    ))
                    .await;
                return;
            };
            let mut id_guard = state.inner.next_client_id.lock().await;
            let id = *id_guard;
            *id_guard += 1;
            drop(id_guard);
            state.inner.connected.write().await.insert(id, name.clone());
            authed = Some((id, name));
            let _ = state
                .app
                .emit("sync://status", inner_status_json(&state.inner).await);

            let snap = state.inner.latest.read().await.clone();
            let _ = sink
                .send(Message::Text(
                    serde_json::to_string(&WsMsg::Snapshot { patch: snap })
                        .unwrap_or_default()
                        .into(),
                ))
                .await;
        }
        _ => {
            let _ = sink
                .send(Message::Text(
                    serde_json::to_string(&WsMsg::Error {
                        message: "expected hello".into(),
                    })
                    .unwrap_or_default()
                    .into(),
                ))
                .await;
            return;
        }
    }

    let mut rx = state.fanout.subscribe();

    loop {
        tokio::select! {
            fan = rx.recv() => {
                match fan {
                    Ok(msg) => {
                        if sink.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(WsMsg::Patch { patch }) = serde_json::from_str::<WsMsg>(&text) {
                            *state.inner.latest.write().await = patch.clone();
                            let _ = state.app.emit("sync://remote-patch", &patch);
                            // relay to others
                            let relay = serde_json::to_string(&WsMsg::Patch { patch }).unwrap_or_default();
                            let _ = state.fanout.send(relay);
                            let _ = sink.send(Message::Text(
                                serde_json::to_string(&WsMsg::Ack).unwrap_or_default().into()
                            )).await;
                        }
                    }
                    Some(Ok(Message::Ping(p))) => {
                        let _ = sink.send(Message::Pong(p)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    if let Some((id, _)) = authed {
        state.inner.connected.write().await.remove(&id);
        let _ = state
            .app
            .emit("sync://status", inner_status_json(&state.inner).await);
    }
}
