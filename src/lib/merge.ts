import type { BinnedTodo, PersistState, Todo, Tombstone } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { purgeExpiredBin } from "./bin";

function tombstoneMap(list: Tombstone[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) {
    const prev = m.get(t.id);
    if (prev == null || t.deletedAt > prev) m.set(t.id, t.deletedAt);
  }
  return m;
}

function mergeBin(local: BinnedTodo[], remote: BinnedTodo[]): BinnedTodo[] {
  const byId = new Map<string, BinnedTodo>();
  for (const item of [...local, ...remote]) {
    const prev = byId.get(item.id);
    if (!prev || item.deletedAt >= prev.deletedAt) byId.set(item.id, item);
  }
  return purgeExpiredBin([...byId.values()]);
}

/** Merge two PersistStates: LWW on updatedAt, tombstones win when deletedAt > updatedAt. */
export function mergeState(local: PersistState, remote: PersistState): PersistState {
  const stones = tombstoneMap([
    ...(local.tombstones ?? []),
    ...(remote.tombstones ?? []),
  ]);

  const byId = new Map<string, Todo>();
  for (const t of [...local.todos, ...remote.todos]) {
    const deletedAt = stones.get(t.id);
    if (deletedAt != null && deletedAt >= t.updatedAt) continue;
    const existing = byId.get(t.id);
    if (!existing || t.updatedAt > existing.updatedAt) {
      byId.set(t.id, t);
    }
  }

  // Drop tombstones for ids that have a newer live todo (undo / restore)
  const tombstones: Tombstone[] = [];
  for (const [id, deletedAt] of stones) {
    const live = byId.get(id);
    if (live && live.updatedAt > deletedAt) continue;
    tombstones.push({ id, deletedAt });
  }

  // Bin entries for live todos (restored) are dropped; emptied bin wins via clearedAt
  const liveIds = new Set(byId.keys());
  const binClearedAt = Math.max(local.binClearedAt ?? 0, remote.binClearedAt ?? 0);
  const bin = mergeBin(local.bin ?? [], remote.bin ?? []).filter(
    (b) => !liveIds.has(b.id) && b.deletedAt >= binClearedAt,
  );

  return {
    todos: [...byId.values()],
    tombstones,
    bin,
    binClearedAt: binClearedAt || undefined,
    settings: {
      ...DEFAULT_SETTINGS,
      ...local.settings,
      // Hub setting stays local; don't overwrite from phone
      wifiSyncEnabled: local.settings?.wifiSyncEnabled ?? false,
      launchAtLogin: local.settings?.launchAtLogin ?? false,
    },
  };
}

export function addTombstone(
  tombstones: Tombstone[],
  id: string,
  deletedAt = Date.now(),
): Tombstone[] {
  const next = tombstones.filter((t) => t.id !== id);
  next.push({ id, deletedAt });
  return next;
}

export function clearTombstone(tombstones: Tombstone[], id: string): Tombstone[] {
  return tombstones.filter((t) => t.id !== id);
}
