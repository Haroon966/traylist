import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BinnedTodo, Todo, Tombstone } from "./types";
import { isAndroidUa } from "./platform";
export { isAndroidUa, isMobilePreview, isWidgetPreview } from "./platform";

export type SyncStatus = {
  role: string;
  enabled: boolean;
  pairCode?: string | null;
  port?: number | null;
  lanIp?: string | null;
  connected: string[];
  peer?: string | null;
  error?: string | null;
};

export type SyncPatch = {
  todos: Todo[];
  tombstones: Tombstone[];
  bin?: BinnedTodo[];
  binClearedAt?: number;
};

export type DiscoveredHub = {
  name: string;
  host: string;
  port: number;
};

export type SyncPeerCreds = {
  host: string;
  port: number;
  token: string;
};

export async function fetchSyncStatus(): Promise<SyncStatus> {
  if (isAndroidUa()) {
    return invoke<SyncStatus>("sync_client_status");
  }
  return invoke<SyncStatus>("sync_status");
}

export async function enableWifiSync(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_enable");
}

export async function disableWifiSync(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_disable");
}

export async function forgetSyncDevices(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_forget_devices");
}

export type FirewallResult = {
  ok: boolean;
  detail: string;
};

/** Desktop: open LAN sync port in the OS firewall (may prompt for admin). */
export async function ensureSyncFirewall(): Promise<FirewallResult> {
  return invoke<FirewallResult>("sync_ensure_firewall");
}

export async function discoverHubs(): Promise<DiscoveredHub[]> {
  return invoke<DiscoveredHub[]>("sync_discover");
}

export async function pairWithHub(
  hub: DiscoveredHub,
  code: string,
  deviceName: string,
): Promise<{ token: string }> {
  return invoke("sync_client_pair", {
    args: {
      host: hub.host,
      port: hub.port,
      code,
      deviceName,
    },
  });
}

/** One-tap: request desktop approval, wait for Allow/Deny. */
export async function requestPairWithHub(
  hub: DiscoveredHub,
  deviceName: string,
): Promise<{ token: string }> {
  return invoke("sync_client_request_pair", {
    args: {
      host: hub.host,
      port: hub.port,
      deviceName,
    },
  });
}

export async function approvePairRequest(id: string): Promise<PairRequestStatus> {
  return invoke("sync_approve_pair", { id });
}

export async function denyPairRequest(id: string): Promise<PairRequestStatus> {
  return invoke("sync_deny_pair", { id });
}

export type PendingPairEvent = {
  id: string;
  deviceName: string;
};

export type PairRequestStatus = {
  id: string;
  deviceName: string;
  status: "pending" | "approved" | "denied" | "expired";
  token?: string | null;
};

export function onPairRequest(
  handler: (req: PendingPairEvent) => void,
): Promise<UnlistenFn> {
  return listen<PendingPairEvent>("sync://pair-request", (e) => handler(e.payload));
}

export function onPairResolved(
  handler: (status: PairRequestStatus) => void,
): Promise<UnlistenFn> {
  return listen<PairRequestStatus>("sync://pair-resolved", (e) => handler(e.payload));
}

export async function connectToHub(creds: SyncPeerCreds): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_client_connect", {
    args: {
      host: creds.host,
      port: creds.port,
      token: creds.token,
    },
  });
}

export async function disconnectHub(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_client_disconnect");
}

export async function broadcastPatch(patch: SyncPatch): Promise<void> {
  try {
    if (isAndroidUa()) {
      await invoke("sync_client_broadcast", { patch });
    } else {
      await invoke("sync_broadcast", { patch });
    }
  } catch {
    /* sync optional */
  }
}

export function onRemotePatch(handler: (patch: SyncPatch) => void): Promise<UnlistenFn> {
  return listen<SyncPatch>("sync://remote-patch", (e) => handler(e.payload));
}

export function onSyncStatus(handler: (status: SyncStatus) => void): Promise<UnlistenFn> {
  return listen<SyncStatus>("sync://status", (e) => handler(e.payload));
}
