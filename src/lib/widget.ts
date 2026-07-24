import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onWidgetAction,
  reloadAllTimelines,
  setWidgetConfig,
  type ListItem,
  type WidgetConfig,
  type WidgetElement,
} from "tauri-plugin-widgets-api";
import { openCount, sortTodos } from "./todoUtils";
import type { Todo } from "./types";

/**
 * Must match the Android plugin fallback group (`group.<packageName>`).
 * Writing to a different prefs name leaves Glance on stale stateConfig.
 */
export const WIDGET_GROUP = "group.com.traylist.app";

/** Deep link handled by MainActivity — opens / focuses the app. */
export const WIDGET_OPEN_URL = "traylist://open";

const MAX_SMALL = 4;
const MAX_MEDIUM = 7;
const MAX_LARGE = 12;

const ink = { light: "#134e4a", dark: "#ecfdf5" } as const;
const muted = { light: "#5f7a76", dark: "#94b8b2" } as const;
const teal = { light: "#0d9488", dark: "#2dd4bf" } as const;
const surface = { light: "#ffffff", dark: "#163532" } as const;
const canvas = { light: "#f0fdfa", dark: "#0f1f1d" } as const;
const line = { light: "#99f6e4", dark: "#1f4a44" } as const;

let syncChain: Promise<void> = Promise.resolve();
let lastSyncedJson = "";

function plainText(text: string, max = 64): string {
  const plain = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
  if (plain.length <= max) return plain || "Untitled";
  return `${[...plain].slice(0, max - 1).join("")}…`;
}

/** Open tasks first, then done — so rows can toggle both ways. */
function todoItems(todos: Todo[], limit: number): ListItem[] {
  const sorted = sortTodos(todos);
  const open = sorted.filter((t) => !t.done);
  const done = sorted.filter((t) => t.done);
  return [...open, ...done].slice(0, limit).map((t) => ({
    text: plainText(t.text),
    checked: t.done,
    action: "toggle",
    payload: t.id,
  }));
}

function completionRatio(todos: Todo[]): number {
  if (todos.length === 0) return 1;
  const done = todos.filter((t) => t.done).length;
  return done / todos.length;
}

function brandOpenLink(): WidgetElement {
  return {
    type: "link",
    // URL-only (no action) — Glance opens the deep link and launches the app.
    url: WIDGET_OPEN_URL,
    children: [
      {
        type: "hstack",
        spacing: 8,
        alignment: "center",
        children: [
          {
            type: "shape",
            shapeType: "circle",
            size: 10,
            fill: teal,
          },
          {
            type: "text",
            content: "Traylist",
            textStyle: "headline",
            fontWeight: "bold",
            color: ink,
          },
        ],
      },
    ],
  };
}

function headerRow(open: number, ratio: number): WidgetElement {
  return {
    type: "vstack",
    spacing: 6,
    alignment: "leading",
    children: [
      {
        type: "hstack",
        spacing: 8,
        alignment: "center",
        children: [
          brandOpenLink(),
          { type: "spacer" },
          {
            type: "text",
            content: open === 0 ? "All clear" : `${open} open`,
            textStyle: "caption",
            fontWeight: "semibold",
            color: muted,
          },
        ],
      },
      {
        type: "progress",
        value: ratio,
        total: 1,
        tint: teal,
        barStyle: "linear",
        frame: { maxHeight: 6 },
        cornerRadius: 999,
      },
    ],
  };
}

function emptyHint(): WidgetElement {
  return {
    type: "link",
    url: WIDGET_OPEN_URL,
    children: [
      {
        type: "vstack",
        spacing: 4,
        alignment: "leading",
        padding: { top: 4, bottom: 2, leading: 2, trailing: 2 },
        children: [
          {
            type: "text",
            content: "Nothing open",
            textStyle: "body",
            fontWeight: "semibold",
            color: ink,
          },
          {
            type: "text",
            content: "Tap to open Traylist",
            textStyle: "footnote",
            color: muted,
          },
        ],
      },
    ],
  };
}

function todoRow(item: ListItem): WidgetElement {
  const done = Boolean(item.checked);
  return {
    type: "link",
    // Link has no payload field — encode id in the action name.
    action: `toggle:${item.payload ?? ""}`,
    children: [
      {
        type: "hstack",
        spacing: 10,
        alignment: "center",
        padding: { top: 7, bottom: 7, leading: 8, trailing: 8 },
        background: surface,
        cornerRadius: 12,
        opacity: done ? 0.72 : 1,
        children: [
          done
            ? {
                type: "shape" as const,
                shapeType: "circle" as const,
                size: 16,
                fill: teal,
              }
            : {
                type: "shape" as const,
                shapeType: "circle" as const,
                size: 16,
                stroke: teal,
                strokeWidth: 2,
                fill: canvas,
              },
          {
            type: "text" as const,
            content: done ? `✓ ${item.text}` : item.text,
            textStyle: "body" as const,
            fontWeight: "medium" as const,
            color: done ? muted : ink,
            lineLimit: 1,
            flex: 1,
          },
        ],
      },
    ],
  };
}

/** Prefer plain rows over Glance LazyColumn — updates more reliably. */
function todoRows(items: ListItem[]): WidgetElement {
  return {
    type: "vstack",
    spacing: 6,
    alignment: "leading",
    children: items.map(todoRow),
  };
}

function layout(
  open: number,
  items: ListItem[],
  ratio: number,
  padding: number,
): WidgetElement {
  return {
    type: "vstack",
    spacing: 10,
    padding,
    alignment: "leading",
    background: canvas,
    cornerRadius: 20,
    border: { color: "#99f6e4", width: 1 },
    children: [
      headerRow(open, ratio),
      { type: "divider", color: line, thickness: 1 },
      items.length > 0 ? todoRows(items) : emptyHint(),
    ],
  };
}

export function buildTodoWidgetConfig(todos: Todo[]): WidgetConfig {
  const open = openCount(todos);
  const ratio = completionRatio(todos);
  return {
    version: 1,
    small: layout(open, todoItems(todos, MAX_SMALL), ratio, 12),
    medium: layout(open, todoItems(todos, MAX_MEDIUM), ratio, 14),
    large: layout(open, todoItems(todos, MAX_LARGE), ratio, 16),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Push the current todo list to the home-screen widget and force a Glance refresh.
 *
 * The plugin's mobile path writes SharedPreferences with apply() then reloads.
 * We wait briefly for the write to flush, then call reloadAllTimelines() again
 * (bypasses the 15‑min release throttle on setWidgetConfig).
 */
export async function syncHomeWidget(todos: Todo[]): Promise<void> {
  const config = buildTodoWidgetConfig(todos);
  const serialized = JSON.stringify(config);
  if (serialized === lastSyncedJson) return;

  syncChain = syncChain
    .catch(() => {})
    .then(async () => {
      // Re-check after queue wait — a newer sync may have superseded this one.
      if (serialized === lastSyncedJson) return;
      try {
        await setWidgetConfig(config, WIDGET_GROUP);
        // Let SharedPreferences.apply() flush before Glance re-reads prefs.
        await sleep(120);
        await reloadAllTimelines();
        lastSyncedJson = serialized;
      } catch (err) {
        console.warn("[widget] sync failed", err);
      }
    });

  await syncChain;
}

export async function listenWidgetToggle(
  onToggle: (id: string) => void,
): Promise<UnlistenFn | null> {
  try {
    return await onWidgetAction((data) => {
      if (data.action === "toggle" && data.payload) {
        onToggle(data.payload);
        return;
      }
      if (data.action.startsWith("toggle:")) {
        const id = data.action.slice("toggle:".length);
        if (id) onToggle(id);
      }
    });
  } catch {
    return null;
  }
}
