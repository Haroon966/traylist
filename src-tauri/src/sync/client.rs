use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::protocol::{
    DiscoveredHub, PairRequest, PairRequestCreate, PairRequestCreated, PairRequestState,
    PairRequestStatus, PairResponse, SyncPatch, SyncStatusDto, WsMsg, SERVICE_TYPE,
};

fn short_mdns_name(raw: &str) -> String {
    // "Traylist._traylist._tcp.local." → "Traylist"
    raw.split('.')
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(raw)
        .to_string()
}

pub struct SyncClientState {
    inner: Arc<ClientInner>,
}

struct ClientInner {
    peer: RwLock<Option<String>>,
    token: RwLock<Option<String>>,
    connected: RwLock<bool>,
    error: RwLock<Option<String>>,
    outbound: Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>,
    generation: AtomicU64,
}

impl SyncClientState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(ClientInner {
                peer: RwLock::new(None),
                token: RwLock::new(None),
                connected: RwLock::new(false),
                error: RwLock::new(None),
                outbound: Mutex::new(None),
                generation: AtomicU64::new(0),
            }),
        }
    }

    async fn status(&self) -> SyncStatusDto {
        SyncStatusDto {
            role: "client".into(),
            enabled: *self.inner.connected.read().await,
            pair_code: None,
            port: None,
            lan_ip: None,
            connected: vec![],
            peer: self.inner.peer.read().await.clone(),
            error: self.inner.error.read().await.clone(),
        }
    }
}

#[tauri::command]
pub async fn sync_client_status(
    client: tauri::State<'_, SyncClientState>,
) -> Result<SyncStatusDto, String> {
    Ok(client.status().await)
}

#[tauri::command]
pub async fn sync_discover() -> Result<Vec<DiscoveredHub>, String> {
    tokio::task::spawn_blocking(|| {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let receiver = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;
        let mut found: Vec<DiscoveredHub> = Vec::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while std::time::Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let host = info
                        .get_addresses()
                        .iter()
                        .find_map(|a| match a {
                            std::net::IpAddr::V4(v4) => Some(v4.to_string()),
                            _ => None,
                        })
                        .unwrap_or_else(|| {
                            info.get_hostname().trim_end_matches('.').to_string()
                        });
                    if host.is_empty() {
                        continue;
                    }
                    let hub = DiscoveredHub {
                        name: short_mdns_name(info.get_fullname()),
                        host,
                        port: info.get_port(),
                    };
                    if !found
                        .iter()
                        .any(|h| h.host == hub.host && h.port == hub.port)
                    {
                        found.push(hub);
                    }
                }
                Ok(ServiceEvent::SearchStopped(_)) => break,
                Ok(_) => {}
                Err(_) => {}
            }
        }
        let _ = daemon.shutdown();
        Ok(found)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairArgs {
    pub host: String,
    pub port: u16,
    pub code: String,
    pub device_name: String,
}

#[tauri::command]
pub async fn sync_client_pair(args: PairArgs) -> Result<PairResponse, String> {
    let url = format!("http://{}:{}/pair", args.host.trim(), args.port);
    let body = PairRequest {
        code: args.code,
        device_name: args.device_name,
    };
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| reach_err(&args.host, args.port, &e.to_string()))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if status.as_u16() == 401 {
            return Err("Wrong or expired pair code — refresh the QR on your PC".into());
        }
        return Err(format!("pair failed ({status}): {text}"));
    }
    res.json::<PairResponse>().await.map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestPairArgs {
    pub host: String,
    pub port: u16,
    pub device_name: String,
}

/// One-tap connect: ask desktop to approve, then poll until token or denial.
#[tauri::command]
pub async fn sync_client_request_pair(args: RequestPairArgs) -> Result<PairResponse, String> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let create_url = format!("http://{}:{}/pair-request", args.host.trim(), args.port);
    let body = PairRequestCreate {
        device_name: args.device_name,
    };
    let created = http
        .post(&create_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| reach_err(&args.host, args.port, &e.to_string()))?;
    if !created.status().is_success() {
        let status = created.status();
        let text = created.text().await.unwrap_or_default();
        return Err(format!("Could not ask desktop ({status}): {text}"));
    }
    let PairRequestCreated { id } = created
        .json::<PairRequestCreated>()
        .await
        .map_err(|e| e.to_string())?;

    let status_url = format!(
        "http://{}:{}/pair-request/{}",
        args.host.trim(),
        args.port,
        id
    );
    let deadline = tokio::time::Instant::now() + Duration::from_secs(75);
    loop {
        if tokio::time::Instant::now() > deadline {
            return Err("Desktop did not approve in time".into());
        }
        tokio::time::sleep(Duration::from_millis(700)).await;
        let res = http
            .get(&status_url)
            .send()
            .await
            .map_err(|e| reach_err(&args.host, args.port, &e.to_string()))?;
        if res.status().as_u16() == 404 {
            return Err("Pair request expired on desktop".into());
        }
        if !res.status().is_success() {
            continue;
        }
        let st = res
            .json::<PairRequestStatus>()
            .await
            .map_err(|e| e.to_string())?;
        match st.status {
            PairRequestState::Approved => {
                let Some(token) = st.token else {
                    return Err("Desktop approved but sent no token".into());
                };
                return Ok(PairResponse { token });
            }
            PairRequestState::Denied => {
                return Err("Desktop denied this connection".into());
            }
            PairRequestState::Expired => {
                return Err("Pair request expired — try again".into());
            }
            PairRequestState::Pending => {}
        }
    }
}

fn reach_err(host: &str, port: u16, s: &str) -> String {
    if s.contains("Connection refused")
        || s.contains("error trying to connect")
        || s.contains("error sending request")
        || s.contains("Network is unreachable")
        || s.contains("No route to host")
    {
        format!(
            "Can't reach desktop at {host}:{port} — same Wi‑Fi? Firewall allowing port {port}?"
        )
    } else if s.contains("timed out") || s.contains("timeout") {
        format!("Desktop at {host}:{port} timed out — check Wi‑Fi / firewall (port {port})")
    } else {
        s.to_string()
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectArgs {
    pub host: String,
    pub port: u16,
    pub token: String,
}

#[tauri::command]
pub async fn sync_client_connect(
    app: AppHandle,
    client: tauri::State<'_, SyncClientState>,
    args: ConnectArgs,
) -> Result<SyncStatusDto, String> {
    let my_gen = client.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *client.inner.outbound.lock().await = None;
    *client.inner.connected.write().await = false;

    let peer = format!("{}:{}", args.host.trim(), args.port);
    *client.inner.peer.write().await = Some(peer.clone());
    *client.inner.token.write().await = Some(args.token.clone());
    *client.inner.error.write().await = None;

    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    *client.inner.outbound.lock().await = Some(out_tx);

    let inner = client.inner.clone();
    let token = args.token.clone();
    let ws_url = format!("ws://{}:{}/ws", args.host.trim(), args.port);

    tokio::spawn(async move {
        while inner.generation.load(Ordering::SeqCst) == my_gen {
            match connect_async(&ws_url).await {
                Ok((ws, _)) => {
                    if inner.generation.load(Ordering::SeqCst) != my_gen {
                        break;
                    }
                    *inner.connected.write().await = true;
                    *inner.error.write().await = None;
                    let _ = app.emit("sync://status", client_status(&inner).await);

                    let (mut sink, mut stream) = ws.split();
                    let hello = serde_json::to_string(&WsMsg::Hello {
                        token: token.clone(),
                    })
                    .unwrap_or_default();
                    if sink.send(Message::Text(hello.into())).await.is_err() {
                        *inner.connected.write().await = false;
                    } else {
                        loop {
                            if inner.generation.load(Ordering::SeqCst) != my_gen {
                                let _ = sink.close().await;
                                break;
                            }
                            tokio::select! {
                                out = out_rx.recv() => {
                                    match out {
                                        Some(msg) => {
                                            if sink.send(Message::Text(msg.into())).await.is_err() {
                                                break;
                                            }
                                        }
                                        None => break,
                                    }
                                }
                                incoming = stream.next() => {
                                    match incoming {
                                        Some(Ok(Message::Text(text))) => {
                                            if let Ok(msg) = serde_json::from_str::<WsMsg>(&text) {
                                                match msg {
                                                    WsMsg::Snapshot { patch }
                                                    | WsMsg::Patch { patch } => {
                                                        let _ = app.emit("sync://remote-patch", &patch);
                                                    }
                                                    WsMsg::Error { message } => {
                                                        *inner.error.write().await = Some(message);
                                                        let _ = app.emit(
                                                            "sync://status",
                                                            client_status(&inner).await,
                                                        );
                                                    }
                                                    _ => {}
                                                }
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
                    }
                    *inner.connected.write().await = false;
                    let _ = app.emit("sync://status", client_status(&inner).await);
                }
                Err(e) => {
                    *inner.connected.write().await = false;
                    *inner.error.write().await = Some(e.to_string());
                    let _ = app.emit("sync://status", client_status(&inner).await);
                }
            }
            if inner.generation.load(Ordering::SeqCst) != my_gen {
                break;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        if inner.generation.load(Ordering::SeqCst) == my_gen {
            *inner.connected.write().await = false;
            *inner.outbound.lock().await = None;
        }
    });

    tokio::time::sleep(Duration::from_millis(200)).await;
    Ok(client.status().await)
}

#[tauri::command]
pub async fn sync_client_disconnect(
    client: tauri::State<'_, SyncClientState>,
) -> Result<SyncStatusDto, String> {
    disconnect(client.inner.clone()).await;
    Ok(client.status().await)
}

#[tauri::command]
pub async fn sync_client_broadcast(
    client: tauri::State<'_, SyncClientState>,
    patch: SyncPatch,
) -> Result<(), String> {
    let msg = serde_json::to_string(&WsMsg::Patch { patch }).map_err(|e| e.to_string())?;
    if let Some(tx) = client.inner.outbound.lock().await.as_ref() {
        let _ = tx.send(msg);
    }
    Ok(())
}

async fn disconnect(inner: Arc<ClientInner>) {
    inner.generation.fetch_add(1, Ordering::SeqCst);
    *inner.outbound.lock().await = None;
    *inner.connected.write().await = false;
}

async fn client_status(inner: &ClientInner) -> SyncStatusDto {
    SyncStatusDto {
        role: "client".into(),
        enabled: *inner.connected.read().await,
        pair_code: None,
        port: None,
        lan_ip: None,
        connected: vec![],
        peer: inner.peer.read().await.clone(),
        error: inner.error.read().await.clone(),
    }
}
