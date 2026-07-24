import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { AddTodo } from "./components/AddTodo";
import { BinScreen } from "./components/BinScreen";
import { MobileHome } from "./components/MobileHome";
import { OverflowMenu } from "./components/OverflowMenu";
import { SyncPanel } from "./components/SyncPanel";
import { PairConfirmDialog } from "./components/PairConfirmDialog";
import { TodoItem } from "./components/TodoItem";
import { createTodo, loadState, saveState } from "./lib/store";
import { addTombstone, clearTombstone, mergeState } from "./lib/merge";
import {
  purgeExpiredBin,
  removeFromBin,
  toBinned,
  upsertBin,
} from "./lib/bin";
import { parseDue, snoozeDue } from "./lib/parseDue";
import {
  broadcastPatch,
  connectToHub,
  enableWifiSync,
  isAndroidUa,
  isMobilePreview,
  isWidgetPreview,
  onRemotePatch,
  type SyncPatch,
} from "./lib/sync";
import { WidgetPreviewScreen } from "./components/WidgetPreviewScreen";
import { UndoStack, applyUndo } from "./lib/undo";
import {
  hasOverdue,
  openCount,
  sortTodos,
} from "./lib/todoUtils";
import type { AppSettings, BinnedTodo, Todo, Tombstone } from "./lib/types";
import { DEFAULT_SETTINGS } from "./lib/types";
import { plainTodoText } from "./lib/dates";
import { listenWidgetToggle, syncHomeWidget } from "./lib/widget";

export default function App() {
  if (isWidgetPreview()) {
    return <WidgetPreviewScreen />;
  }
  return <AppMain />;
}

function AppMain() {
  const mobile = isAndroidUa();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tombstones, setTombstones] = useState<Tombstone[]>([]);
  const [bin, setBin] = useState<BinnedTodo[]>([]);
  const [binClearedAt, setBinClearedAt] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [traySearchOpen, setTraySearchOpen] = useState(false);
  const [trayQuery, setTrayQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const undoRef = useRef(new UndoStack());
  const todosRef = useRef(todos);
  const tombstonesRef = useRef(tombstones);
  const binRef = useRef(bin);
  const binClearedAtRef = useRef(binClearedAt);
  const settingsRef = useRef(settings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHideRef = useRef(false);
  const applyingRemoteRef = useRef(false);

  todosRef.current = todos;
  tombstonesRef.current = tombstones;
  binRef.current = bin;
  binClearedAtRef.current = binClearedAt;
  settingsRef.current = settings;

  useEffect(() => {
    document.documentElement.classList.toggle("is-mobile", mobile);
    document.documentElement.classList.toggle("is-mobile-preview", isMobilePreview());
    return () => {
      document.documentElement.classList.remove("is-mobile");
      document.documentElement.classList.remove("is-mobile-preview");
    };
  }, [mobile]);

  const persist = useCallback(
    (
      nextTodos: Todo[],
      nextTombstones: Tombstone[],
      nextSettings: AppSettings,
      nextBin: BinnedTodo[] = binRef.current,
      nextClearedAt: number = binClearedAtRef.current,
      immediate = false,
    ) => {
      const flush = () => {
        saveTimer.current = null;
        const state = {
          todos: nextTodos,
          tombstones: nextTombstones,
          bin: nextBin,
          binClearedAt: nextClearedAt || undefined,
          settings: nextSettings,
        };
        void saveState(state);
        if (mobile) void syncHomeWidget(nextTodos);
        if (applyingRemoteRef.current) {
          applyingRemoteRef.current = false;
        } else {
          void broadcastPatch({
            todos: nextTodos,
            tombstones: nextTombstones,
            bin: nextBin,
            binClearedAt: nextClearedAt || undefined,
          });
        }
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) {
        flush();
        return;
      }
      saveTimer.current = setTimeout(flush, 150);
    },
    [mobile],
  );

  /** Flush pending writes when the app backgrounds (Android may kill soon). */
  useEffect(() => {
    function flushNow() {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void saveState({
        todos: todosRef.current,
        tombstones: tombstonesRef.current,
        bin: binRef.current,
        binClearedAt: binClearedAtRef.current || undefined,
        settings: settingsRef.current,
      });
      if (mobile) void syncHomeWidget(todosRef.current);
    }
    function onHide() {
      if (document.visibilityState === "hidden") flushNow();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [mobile]);

  const updateTodos = useCallback(
    (
      updater: (prev: Todo[]) => Todo[],
      nextTombstones?: Tombstone[],
      nextBin?: BinnedTodo[],
      nextClearedAt?: number,
    ) => {
      const stones = nextTombstones ?? tombstonesRef.current;
      const binNext = nextBin ?? binRef.current;
      const cleared = nextClearedAt ?? binClearedAtRef.current;
      if (nextTombstones) {
        tombstonesRef.current = nextTombstones;
        setTombstones(nextTombstones);
      }
      if (nextBin !== undefined) {
        binRef.current = nextBin;
        setBin(nextBin);
      }
      if (nextClearedAt != null) {
        binClearedAtRef.current = nextClearedAt;
        setBinClearedAt(nextClearedAt);
      }
      setTodos((prev) => {
        const next = updater(prev);
        persist(next, stones, settingsRef.current, binNext, cleared);
        return next;
      });
    },
    [persist],
  );

  const applyRemote = useCallback(
    (patch: SyncPatch) => {
      applyingRemoteRef.current = true;
      const local = {
        todos: todosRef.current,
        tombstones: tombstonesRef.current,
        bin: binRef.current,
        binClearedAt: binClearedAtRef.current || undefined,
        settings: settingsRef.current,
      };
      const remote = {
        todos: Array.isArray(patch.todos) ? patch.todos : [],
        tombstones: Array.isArray(patch.tombstones) ? patch.tombstones : [],
        bin: Array.isArray(patch.bin) ? patch.bin : [],
        binClearedAt: patch.binClearedAt,
        settings: settingsRef.current,
      };
      const merged = mergeState(local, remote);
      todosRef.current = merged.todos;
      tombstonesRef.current = merged.tombstones;
      binRef.current = merged.bin;
      binClearedAtRef.current = merged.binClearedAt ?? 0;
      setTodos(merged.todos);
      setTombstones(merged.tombstones);
      setBin(merged.bin);
      setBinClearedAt(merged.binClearedAt ?? 0);
      persist(
        merged.todos,
        merged.tombstones,
        settingsRef.current,
        merged.bin,
        merged.binClearedAt ?? 0,
      );
      undoRef.current.clear();
    },
    [persist],
  );

  useEffect(() => {
    void (async () => {
      const state = await loadState();
      setTodos(state.todos);
      setTombstones(state.tombstones);
      setBin(state.bin);
      setBinClearedAt(state.binClearedAt ?? 0);
      binRef.current = state.bin;
      binClearedAtRef.current = state.binClearedAt ?? 0;
      let nextSettings = state.settings;
      if (!mobile) {
        try {
          const autostartOn = await isEnabled();
          nextSettings = { ...state.settings, launchAtLogin: autostartOn };
        } catch {
          /* ignore */
        }
        if (nextSettings.wifiSyncEnabled) {
          try {
            await enableWifiSync();
            void broadcastPatch({
              todos: state.todos,
              tombstones: state.tombstones,
              bin: state.bin,
              binClearedAt: state.binClearedAt,
            });
          } catch {
            /* ignore */
          }
        }
      } else if (nextSettings.syncPeer) {
        try {
          await connectToHub(nextSettings.syncPeer);
        } catch {
          /* reconnect later from Sync panel */
        }
      }
      setSettings(nextSettings);
      setReady(true);
      if (mobile) void syncHomeWidget(state.todos);
    })();
  }, [mobile]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    void onRemotePatch(applyRemote).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [applyRemote]);

  /** Drop bin items older than 30 days. */
  useEffect(() => {
    if (!ready) return;
    function purge() {
      const next = purgeExpiredBin(binRef.current);
      if (next.length === binRef.current.length) return;
      binRef.current = next;
      setBin(next);
      persist(
        todosRef.current,
        tombstonesRef.current,
        settingsRef.current,
        next,
        binClearedAtRef.current,
      );
    }
    purge();
    const id = setInterval(purge, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [ready, persist]);

  const syncBadge = useCallback(async (list: Todo[]) => {
    if (mobile) return;
    try {
      await invoke("sync_tray_menu", {
        openCount: openCount(list),
        hasOverdue: hasOverdue(list),
      });
    } catch {
      try {
        await invoke("update_tray_badge", {
          openCount: openCount(list),
          hasOverdue: hasOverdue(list),
        });
      } catch {
        /* ignore when not in tauri */
      }
    }
  }, [mobile]);

  useEffect(() => {
    if (!ready) return;
    void syncBadge(todos);
  }, [todos, ready, syncBadge]);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const toggleTodo = useCallback(
    (id: string) => {
      const current = todosRef.current.find((t) => t.id === id);
      if (!current) return;
      undoRef.current.push({ type: "toggle", id, prevDone: current.done });
      updateTodos(
        (prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t,
          ),
        tombstonesRef.current,
      );
    },
    [updateTodos],
  );

  useEffect(() => {
    if (!mobile || !ready) return;
    void syncHomeWidget(todos);
  }, [mobile, ready, todos]);

  useEffect(() => {
    if (!mobile) return;
    let unlisten: (() => void) | null = null;
    void listenWidgetToggle((id) => toggleTodo(id)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [mobile, toggleTodo]);

  useEffect(() => {
    if (mobile) return;
    const unsubs: Array<() => void> = [];

    void listen("traylist://panel-open", () => {
      // GNOME may flash an empty tray menu and steal focus briefly.
      suppressHideRef.current = true;
      window.setTimeout(() => {
        suppressHideRef.current = false;
      }, 600);
      focusInput();
    }).then((u) => unsubs.push(u));
    void listen("traylist://focus-input", () => focusInput()).then((u) => unsubs.push(u));
    void listen<string>("traylist://toggle", (e) => {
      toggleTodo(e.payload);
    }).then((u) => unsubs.push(u));
    void listen("traylist://toggle-autostart", () => {
      void toggleAutostart();
    }).then((u) => unsubs.push(u));
    void listen<boolean>("traylist://autostart-state", (e) => {
      setSettings((s) => {
        const next = { ...s, launchAtLogin: e.payload };
        persist(todosRef.current, tombstonesRef.current, next);
        return next;
      });
    }).then((u) => unsubs.push(u));

    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusInput, persist, mobile, toggleTodo]);

  useEffect(() => {
    if (mobile) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    void win
      .onFocusChanged(({ payload: focused }) => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (focused) return;
        // Delay: tray menu dismiss / open race must not instantly hide the panel.
        hideTimer = setTimeout(() => {
          hideTimer = null;
          if (suppressHideRef.current) return;
          void win.isFocused().then((still) => {
            if (!still && !suppressHideRef.current) void win.hide();
          });
        }, 220);
      })
      .then((u) => {
        unlisten = u;
      });
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      unlisten?.();
    };
  }, [mobile]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !mobile) {
        void getCurrentWindow().hide();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  useEffect(() => {
    let cancelled = false;

    async function ensurePerm(): Promise<boolean> {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      return granted;
    }

    async function tick() {
      if (cancelled) return;
      const now = Date.now();
      const list = todosRef.current;
      const due = list.filter(
        (t) =>
          !t.done &&
          t.dueAt != null &&
          t.dueAt <= now &&
          (t.notifiedAt == null || t.notifiedAt < t.dueAt),
      );
      if (!due.length) return;

      const ok = await ensurePerm();
      if (!ok || cancelled) return;

      for (const t of due) {
        try {
          sendNotification({
            title: "Traylist",
            body: plainTodoText(t.text) || "Task due",
          });
        } catch {
          /* ignore */
        }
      }

      updateTodos((prev) =>
        prev.map((t) =>
          due.some((d) => d.id === t.id)
            ? { ...t, notifiedAt: now, updatedAt: now }
            : t,
        ),
      );
    }

    void tick();
    const id = setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [updateTodos]);

  function showToast(
    msg: string,
    opts?: { actionLabel?: string; onAction?: () => void; duration?: number },
  ) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({
      message: msg,
      actionLabel: opts?.actionLabel,
      onAction: opts?.onAction,
    });
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, opts?.duration ?? (opts?.actionLabel ? 5600 : 2200));
  }

  function addTodo(text: string, dueOverride?: number | null) {
    const parsed = parseDue(text);
    const dueAt = dueOverride !== undefined ? dueOverride : parsed.dueAt;
    const todo = createTodo(text, dueAt);
    updateTodos((prev) => [todo, ...prev]);
  }

  function editTodo(id: string, text: string, dueAt: number | null) {
    updateTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const dueChanged = t.dueAt !== dueAt;
        return {
          ...t,
          text: text.trim(),
          dueAt,
          notifiedAt: dueChanged ? null : t.notifiedAt,
          updatedAt: Date.now(),
        };
      }),
    );
    showToast("Updated");
  }

  function deleteTodo(id: string) {
    const index = todosRef.current.findIndex((t) => t.id === id);
    const todo = todosRef.current[index];
    if (!todo || index < 0) return;
    const deletedAt = Date.now();
    undoRef.current.push({ type: "delete", todo, index });
    const stones = addTombstone(tombstonesRef.current, id, deletedAt);
    const nextBin = upsertBin(binRef.current, toBinned(todo, deletedAt));
    updateTodos((prev) => prev.filter((t) => t.id !== id), stones, nextBin);
    if (mobile) {
      showToast("Moved to Bin", {
        actionLabel: "Undo",
        duration: 6000,
        onAction: () => {
          setToast(null);
          if (toastTimer.current) {
            clearTimeout(toastTimer.current);
            toastTimer.current = null;
          }
          undo();
        },
      });
    } else {
      showToast("Moved to Bin — Ctrl+Z to undo");
    }
  }

  function restoreFromBin(id: string) {
    const item = binRef.current.find((b) => b.id === id);
    if (!item) return;
    const { deletedAt: _deletedAt, ...rest } = item;
    const restored: Todo = { ...rest, updatedAt: Date.now() };
    const stones = clearTombstone(tombstonesRef.current, id);
    const nextBin = removeFromBin(binRef.current, id);
    updateTodos((prev) => [restored, ...prev], stones, nextBin);
    showToast("Restored");
  }

  function emptyBinNow() {
    if (binRef.current.length === 0) return;
    const clearedAt = Date.now();
    updateTodos((prev) => prev, tombstonesRef.current, [], clearedAt);
    showToast("Bin emptied");
  }

  function snoozeTodo(id: string, kind: "10m" | "1h" | "tomorrow") {
    updateTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextDue = snoozeDue(t.dueAt ?? Date.now(), kind);
        return { ...t, dueAt: nextDue, notifiedAt: null, updatedAt: Date.now() };
      }),
    );
    showToast(`Snoozed ${kind}`);
  }

  function undo() {
    const action = undoRef.current.pop();
    if (!action) {
      showToast("Nothing to undo");
      return;
    }
    if (action.type === "delete") {
      const stones = clearTombstone(tombstonesRef.current, action.todo.id);
      const restored = { ...action.todo, updatedAt: Date.now() };
      const nextBin = removeFromBin(binRef.current, action.todo.id);
      updateTodos((prev) => {
        const next = [...prev];
        const idx = Math.min(action.index, next.length);
        next.splice(idx, 0, restored);
        return next;
      }, stones, nextBin);
    } else {
      updateTodos((prev) => applyUndo(prev, action));
    }
    showToast("Undone");
  }

  async function toggleAutostart() {
    try {
      const currently = await isEnabled();
      if (currently) await disable();
      else await enable();
      const nextOn = !currently;
      setSettings((s) => {
        const next = { ...s, launchAtLogin: nextOn };
        persist(todosRef.current, tombstonesRef.current, next);
        return next;
      });
      showToast(nextOn ? "Will launch at login" : "Autostart off");
    } catch {
      showToast("Autostart unavailable");
    }
  }

  const sorted = useMemo(() => sortTodos(todos), [todos]);
  const openItems = openCount(todos);
  const query = trayQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return sorted;
    return sorted.filter((t) => t.text.toLowerCase().includes(query));
  }, [sorted, query]);
  const active = filtered.filter((t) => !t.done);
  const done = filtered.filter((t) => t.done);

  if (!ready) {
    return (
      <div
        className={`app-shell flex items-center justify-center text-sm${mobile ? " is-mobile" : ""}`}
        style={{ color: "var(--ink-muted)" }}
      >
        Loading…
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="app-shell relative is-mobile">
        <MobileHome
          todos={todos}
          openCount={openItems}
          launchAtLogin={settings.launchAtLogin}
          onAdd={addTodo}
          onEdit={editTodo}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
          onToggleAutostart={() => void toggleAutostart()}
          onOpenSync={() => setSyncOpen(true)}
          onOpenBin={() => setBinOpen(true)}
          onToast={showToast}
        />
        {toast && (
          <div
            className={`app-toast absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-lg${toast.actionLabel ? "" : " pointer-events-none"}`}
            style={{
              background: "#134e4a",
              bottom: "calc(5.5rem + var(--safe-bottom))",
              minWidth: "min(280px, calc(100% - 2rem))",
            }}
            role="status"
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-bold uppercase tracking-wide"
                style={{ background: "rgb(255 255 255 / 18%)", color: "#fff" }}
                onClick={() => toast.onAction?.()}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
        {binOpen && (
          <BinScreen
            bin={bin}
            onRestore={restoreFromBin}
            onEmpty={emptyBinNow}
            onClose={() => setBinOpen(false)}
          />
        )}
        {syncOpen && (
          <SyncPanel
            wifiSyncEnabled={settings.wifiSyncEnabled}
            peerCreds={settings.syncPeer}
            onWifiSyncEnabled={(on) => {
              setSettings((s) => {
                const next = { ...s, wifiSyncEnabled: on };
                persist(todosRef.current, tombstonesRef.current, next);
                if (on) {
                  void broadcastPatch({
                    todos: todosRef.current,
                    tombstones: tombstonesRef.current,
                    bin: binRef.current,
                    binClearedAt: binClearedAtRef.current || undefined,
                  });
                }
                return next;
              });
            }}
            onPeerCreds={(creds) => {
              setSettings((s) => {
                const next = { ...s, syncPeer: creds };
                persist(todosRef.current, tombstonesRef.current, next);
                return next;
              });
            }}
            onClose={() => setSyncOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell tray-panel relative">
      {!mobile && <PairConfirmDialog />}
      <div className="tray-caret" aria-hidden />
      <header className="tray-header" data-tauri-drag-region>
        <h1 className="tray-brand" data-tauri-drag-region>
          Traylist
        </h1>
        <div className="tray-header-actions">
          <button
            type="button"
            className={`tray-icon-btn${traySearchOpen ? " is-on" : ""}`}
            aria-label={traySearchOpen ? "Close search" : "Search tasks"}
            aria-pressed={traySearchOpen}
            onClick={() => {
              setTraySearchOpen((v) => {
                if (v) setTrayQuery("");
                return !v;
              });
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16.5 16.5 21 21" strokeLinecap="round" />
            </svg>
          </button>
          <OverflowMenu
            isMobile={false}
            launchAtLogin={settings.launchAtLogin}
            onToggleAutostart={() => void toggleAutostart()}
            onOpenSync={() => setSyncOpen(true)}
            onOpenBin={() => setBinOpen(true)}
            onQuit={() => {
              void invoke("app_quit");
            }}
          />
        </div>
      </header>

      {traySearchOpen && (
        <div className="tray-search">
          <label htmlFor="tray-search" className="sr-only">
            Search tasks
          </label>
          <input
            id="tray-search"
            value={trayQuery}
            onChange={(e) => setTrayQuery(e.target.value)}
            placeholder="Search tasks..."
            className="tray-search-input"
            autoFocus
          />
        </div>
      )}

      <AddTodo ref={inputRef} onAdd={addTodo} />

      <div className="tray-list">
        {todos.length === 0 ? (
          <div className="tray-empty">
            <img
              src="/empty-happy.png"
              alt=""
              width={100}
              height={100}
              className="tray-empty-art"
              draggable={false}
            />
            <p className="tray-empty-title">Nothing yet</p>
            <p className="tray-empty-hint">Type above and press Enter</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="tray-empty tray-empty-sm">
            <p className="tray-empty-title">No matches</p>
            <p className="tray-empty-hint">Try another search</p>
          </div>
        ) : (
          <ul className="tray-rows">
            {active.map((todo) => (
              <TodoItem
                key={todo.id}
                dense
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
                onSnooze={(kind) => snoozeTodo(todo.id, kind)}
              />
            ))}
            {done.map((todo) => (
              <TodoItem
                key={todo.id}
                dense
                todo={todo}
                onToggle={() => toggleTodo(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
                onSnooze={(kind) => snoozeTodo(todo.id, kind)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="tray-footer">
        <span className="tray-footer-filter">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 7H4M17 12H7M14 17H10" strokeLinecap="round" />
          </svg>
          All tasks
        </span>
        <span className="tray-footer-count">
          {openItems === 0 ? "All clear" : `${openItems} task${openItems === 1 ? "" : "s"} left`}
        </span>
      </footer>

      {toast && (
        <div className="app-toast tray-toast" role="status">
          {toast.message}
        </div>
      )}

      {binOpen && (
        <BinScreen
          bin={bin}
          onRestore={restoreFromBin}
          onEmpty={emptyBinNow}
          onClose={() => setBinOpen(false)}
        />
      )}

      {syncOpen && (
        <SyncPanel
          wifiSyncEnabled={settings.wifiSyncEnabled}
          peerCreds={settings.syncPeer}
          onWifiSyncEnabled={(on) => {
            setSettings((s) => {
              const next = { ...s, wifiSyncEnabled: on };
              persist(todosRef.current, tombstonesRef.current, next);
              if (on) {
                void broadcastPatch({
                  todos: todosRef.current,
                  tombstones: tombstonesRef.current,
                  bin: binRef.current,
                  binClearedAt: binClearedAtRef.current || undefined,
                });
              }
              return next;
            });
          }}
          onPeerCreds={(creds) => {
            setSettings((s) => {
              const next = { ...s, syncPeer: creds };
              persist(todosRef.current, tombstonesRef.current, next);
              return next;
            });
          }}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </div>
  );
}
