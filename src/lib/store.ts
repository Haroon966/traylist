import { load } from "@tauri-apps/plugin-store";
import type { AppSettings, PersistState, Todo } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { purgeExpiredBin } from "./bin";
import { isMobilePreview } from "./platform";

const STORE_FILE = "traylist.json";
const LEGACY_STORE = "tray-todo.json";
const KEY = "state";

let storePromise: ReturnType<typeof load> | null = null;

async function getStore() {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: false, defaults: {} });
  }
  return storePromise;
}

function emptyState(): PersistState {
  return { todos: [], settings: { ...DEFAULT_SETTINGS }, tombstones: [], bin: [] };
}

function normalize(raw: PersistState): PersistState {
  const binClearedAt = typeof raw.binClearedAt === "number" ? raw.binClearedAt : 0;
  const bin = purgeExpiredBin(Array.isArray(raw.bin) ? raw.bin : []).filter(
    (b) => b.deletedAt >= binClearedAt,
  );
  return {
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    tombstones: Array.isArray(raw.tombstones) ? raw.tombstones : [],
    bin,
    binClearedAt: binClearedAt || undefined,
  };
}

function loadBrowserFallback(): PersistState | null {
  try {
    const raw = localStorage.getItem(STORE_FILE);
    if (!raw) return null;
    return normalize(JSON.parse(raw) as PersistState);
  } catch {
    return null;
  }
}

function seedPreviewTodos(): PersistState {
  const now = Date.now();
  const todayEvening = new Date();
  todayEvening.setHours(18, 0, 0, 0);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const todos: Todo[] = [
    {
      id: "preview-1",
      text: "Review **mobile** layout",
      done: false,
      dueAt: todayEvening.getTime(),
      createdAt: now - 3_600_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
    {
      id: "preview-2",
      text: "Tighten touch targets",
      done: false,
      dueAt: tomorrow.getTime(),
      createdAt: now - 43_200_000,
      updatedAt: now - 43_200_000,
      notifiedAt: null,
    },
    {
      id: "preview-3",
      text: "Polish composer spacing",
      done: true,
      dueAt: todayEvening.getTime() - 86_400_000,
      createdAt: now - 172_800_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
  ];
  return { todos, settings: { ...DEFAULT_SETTINGS }, tombstones: [], bin: [] };
}

export async function loadState(): Promise<PersistState> {
  try {
    const store = await getStore();
    let raw = await store.get<PersistState>(KEY);
    if (!raw) {
      try {
        const legacy = await load(LEGACY_STORE, { autoSave: false, defaults: {} });
        raw = await legacy.get<PersistState>(KEY);
        if (raw) {
          await store.set(KEY, raw);
          await store.save();
        }
      } catch {
        /* no legacy store */
      }
    }
    if (!raw) return emptyState();
    return normalize(raw);
  } catch {
    const fromLs = loadBrowserFallback();
    if (fromLs && fromLs.todos.length > 0) return fromLs;
    return isMobilePreview() ? seedPreviewTodos() : emptyState();
  }
}

export async function saveState(state: PersistState): Promise<void> {
  try {
    const store = await getStore();
    await store.set(KEY, state);
    await store.save();
  } catch {
    /* browser preview / no Tauri store */
    try {
      localStorage.setItem(STORE_FILE, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
}

export function createTodo(text: string, dueAt: number | null): Todo {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    dueAt,
    createdAt: now,
    updatedAt: now,
    notifiedAt: null,
  };
}

export async function saveSettings(settings: AppSettings, state: PersistState): Promise<void> {
  await saveState({ ...state, settings });
}
