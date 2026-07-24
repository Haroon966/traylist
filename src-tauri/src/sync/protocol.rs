use serde::{Deserialize, Serialize};

pub const DEFAULT_PORT: u16 = 17834;
pub const SERVICE_TYPE: &str = "_traylist._tcp.local.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WsMsg {
    Hello { token: String },
    Snapshot { patch: SyncPatch },
    Patch { patch: SyncPatch },
    Error { message: String },
    Ack,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncPatch {
    pub todos: serde_json::Value,
    pub tombstones: serde_json::Value,
    #[serde(default)]
    pub bin: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bin_cleared_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusDto {
    pub role: String,
    pub enabled: bool,
    pub pair_code: Option<String>,
    pub port: Option<u16>,
    pub lan_ip: Option<String>,
    pub connected: Vec<String>,
    pub peer: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredHub {
    pub name: String,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub code: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestCreate {
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestCreated {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PairRequestState {
    Pending,
    Approved,
    Denied,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestStatus {
    pub id: String,
    pub device_name: String,
    pub status: PairRequestState,
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPairEvent {
    pub id: String,
    pub device_name: String,
}
