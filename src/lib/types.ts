export type Todo = {
  id: string;
  text: string;
  done: boolean;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Prevent re-notifying the same due time */
  notifiedAt?: number | null;
};

export type Tombstone = {
  id: string;
  deletedAt: number;
};

/** Soft-deleted todo kept in Bin for 30 days. */
export type BinnedTodo = Todo & {
  deletedAt: number;
};

export const BIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AppSettings = {
  launchAtLogin: boolean;
  /** Desktop hub: advertise & accept LAN sync */
  wifiSyncEnabled: boolean;
  /** Mobile client: saved hub after one-time pair */
  syncPeer: {
    host: string;
    port: number;
    token: string;
  } | null;
};

export type PersistState = {
  todos: Todo[];
  settings: AppSettings;
  tombstones: Tombstone[];
  bin: BinnedTodo[];
  /** Items deleted before this time were emptied from Bin. */
  binClearedAt?: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  wifiSyncEnabled: false,
  syncPeer: null,
};
