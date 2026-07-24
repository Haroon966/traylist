import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  BackgroundValue,
  ColorValue,
  WidgetElement,
} from "tauri-plugin-widgets-api";
import { buildTodoWidgetConfig, WIDGET_OPEN_URL } from "../lib/widget";
import type { Todo } from "../lib/types";

type SizeKey = "small" | "medium" | "large";

const SIZE_META: Record<
  SizeKey,
  { label: string; hint: string; width: number; height: number }
> = {
  small: { label: "Small", hint: "2×2 · up to 4", width: 158, height: 158 },
  medium: { label: "Medium", hint: "4×2 · up to 7", width: 320, height: 158 },
  large: { label: "Large", hint: "4×4 · up to 12", width: 320, height: 320 },
};

function sampleTodos(mode: "filled" | "empty"): Todo[] {
  const now = Date.now();
  if (mode === "empty") {
    return [
      {
        id: "done-1",
        text: "All done",
        done: true,
        dueAt: null,
        createdAt: now - 86_400_000,
        updatedAt: now - 3_600_000,
        notifiedAt: null,
      },
    ];
  }
  return [
    {
      id: "w1",
      text: "Review **mobile** layout",
      done: false,
      dueAt: now + 3_600_000,
      createdAt: now - 3_600_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
    {
      id: "w2",
      text: "Tighten touch targets",
      done: false,
      dueAt: now + 86_400_000,
      createdAt: now - 43_200_000,
      updatedAt: now - 43_200_000,
      notifiedAt: null,
    },
    {
      id: "w3",
      text: "Ship Android build",
      done: false,
      dueAt: null,
      createdAt: now - 7_200_000,
      updatedAt: now - 7_200_000,
      notifiedAt: null,
    },
    {
      id: "w4",
      text: "Reply to Alex",
      done: false,
      dueAt: now + 172_800_000,
      createdAt: now - 14_400_000,
      updatedAt: now - 14_400_000,
      notifiedAt: null,
    },
    {
      id: "w5",
      text: "Water plants",
      done: false,
      dueAt: null,
      createdAt: now - 21_600_000,
      updatedAt: now - 21_600_000,
      notifiedAt: null,
    },
    {
      id: "w6",
      text: "Pack gym bag",
      done: false,
      dueAt: now + 259_200_000,
      createdAt: now - 28_800_000,
      updatedAt: now - 28_800_000,
      notifiedAt: null,
    },
    {
      id: "w7",
      text: "Call dentist",
      done: false,
      dueAt: null,
      createdAt: now - 36_000_000,
      updatedAt: now - 36_000_000,
      notifiedAt: null,
    },
    {
      id: "w8",
      text: "Done earlier",
      done: true,
      dueAt: null,
      createdAt: now - 172_800_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
    {
      id: "w9",
      text: "Also finished",
      done: true,
      dueAt: null,
      createdAt: now - 259_200_000,
      updatedAt: now - 7_200_000,
      notifiedAt: null,
    },
  ];
}

function resolveColor(value: ColorValue | undefined, dark: boolean, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  return dark ? value.dark : value.light;
}

function resolveBg(value: BackgroundValue | undefined, dark: boolean, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if ("light" in value && "dark" in value) {
    return dark ? value.dark : value.light;
  }
  // GradientConfig — approximate with first stop
  if ("colors" in value && Array.isArray(value.colors) && value.colors[0]) {
    return value.colors[0];
  }
  return fallback;
}

import type { PaddingValue } from "tauri-plugin-widgets-api";

function padStyle(padding: PaddingValue | undefined): CSSProperties {
  if (padding == null) return {};
  if (typeof padding === "number") return { padding };
  return {
    paddingTop: padding.top ?? 0,
    paddingBottom: padding.bottom ?? 0,
    paddingLeft: padding.leading ?? 0,
    paddingRight: padding.trailing ?? 0,
  };
}

function WidgetNode({
  el,
  dark,
  onAction,
  onOpenApp,
}: {
  el: WidgetElement;
  dark: boolean;
  onAction?: (action: string) => void;
  onOpenApp?: () => void;
}) {
  const ink = dark ? "#ecfdf5" : "#134e4a";
  const muted = dark ? "#94b8b2" : "#5f7a76";

  const baseStyle = (): CSSProperties => {
    const style: CSSProperties = {
      ...padStyle("padding" in el ? el.padding : undefined),
      borderRadius: "cornerRadius" in el && el.cornerRadius != null ? el.cornerRadius : undefined,
      opacity: "opacity" in el && el.opacity != null ? el.opacity : undefined,
      boxSizing: "border-box",
    };
    if ("background" in el && el.background != null) {
      style.background = resolveBg(el.background, dark, "transparent");
    }
    if ("border" in el && el.border != null) {
      style.border = `${el.border.width ?? 1}px solid ${el.border.color}`;
    }
    if ("frame" in el && el.frame) {
      const f = el.frame;
      if (f.width != null) style.width = f.width;
      if (f.height != null) style.height = f.height;
      if (f.maxWidth != null) style.maxWidth = f.maxWidth === "infinity" ? "100%" : f.maxWidth;
      if (f.maxHeight != null) style.maxHeight = f.maxHeight === "infinity" ? "100%" : f.maxHeight;
    }
    if ("flex" in el && el.flex != null && el.flex > 0) {
      style.flex = el.flex;
      style.minWidth = 0;
    }
    return style;
  };

  switch (el.type) {
    case "vstack":
      return (
        <div
          style={{
            ...baseStyle(),
            display: "flex",
            flexDirection: "column",
            alignItems:
              el.alignment === "center"
                ? "center"
                : el.alignment === "trailing"
                  ? "flex-end"
                  : "stretch",
            gap: el.spacing ?? 0,
            width: "100%",
            height: "100%",
          }}
        >
          {el.children.map((child, i) => (
            <WidgetNode key={i} el={child} dark={dark} onAction={onAction} onOpenApp={onOpenApp} />
          ))}
        </div>
      );
    case "hstack":
      return (
        <div
          style={{
            ...baseStyle(),
            display: "flex",
            flexDirection: "row",
            alignItems:
              el.alignment === "top"
                ? "flex-start"
                : el.alignment === "bottom"
                  ? "flex-end"
                  : "center",
            gap: el.spacing ?? 0,
            width: "100%",
          }}
        >
          {el.children.map((child, i) => (
            <WidgetNode key={i} el={child} dark={dark} onAction={onAction} onOpenApp={onOpenApp} />
          ))}
        </div>
      );
    case "spacer":
      return <div style={{ flex: 1, minWidth: el.minLength ?? 0, minHeight: el.minLength ?? 0 }} />;
    case "divider":
      return (
        <div
          style={{
            height: el.thickness ?? 1,
            width: "100%",
            background: resolveColor(el.color, dark, muted),
            flexShrink: 0,
          }}
        />
      );
    case "text":
      return (
        <span
          style={{
            ...baseStyle(),
            color: resolveColor(el.color, dark, ink),
            fontWeight:
              el.fontWeight === "bold" || el.fontWeight === "semibold"
                ? 700
                : el.fontWeight === "medium"
                  ? 600
                  : 500,
            fontSize:
              el.textStyle === "headline"
                ? 16
                : el.textStyle === "caption" || el.textStyle === "footnote"
                  ? 11
                  : el.fontSize ?? 13,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: el.lineLimit === 1 ? "nowrap" : "normal",
            display: "block",
          }}
        >
          {el.content}
        </span>
      );
    case "progress": {
      const total = el.total ?? 1;
      const pct = Math.min(1, Math.max(0, el.value / total));
      return (
        <div
          style={{
            ...baseStyle(),
            width: "100%",
            height: 6,
            borderRadius: 999,
            background: dark ? "#1f4a44" : "#ccfbf1",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: "100%",
              borderRadius: 999,
              background: resolveColor(el.tint, dark, dark ? "#2dd4bf" : "#0d9488"),
            }}
          />
        </div>
      );
    }
    case "shape":
      return (
        <div
          style={{
            ...baseStyle(),
            width: el.size ?? 12,
            height: el.size ?? 12,
            flexShrink: 0,
            borderRadius: el.shapeType === "circle" ? 999 : el.shapeType === "capsule" ? 999 : 6,
            background: resolveColor(el.fill, dark, "transparent"),
            border: el.stroke
              ? `${el.strokeWidth ?? 1}px solid ${resolveColor(el.stroke, dark, ink)}`
              : undefined,
            boxSizing: "border-box",
          }}
        />
      );
    case "link":
      return (
        <button
          type="button"
          className="widget-preview-link"
          onClick={() => {
            // Mirror Glance: action wins; otherwise open deep link.
            if (el.action) {
              onAction?.(el.action);
              return;
            }
            if (el.url === WIDGET_OPEN_URL || el.url?.startsWith("traylist://")) {
              onOpenApp?.();
            }
          }}
          style={{
            ...baseStyle(),
            display: "block",
            width: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          {el.children.map((child, i) => (
            <WidgetNode key={i} el={child} dark={dark} onAction={onAction} onOpenApp={onOpenApp} />
          ))}
        </button>
      );
    default:
      return null;
  }
}

function WidgetCard({
  size,
  root,
  dark,
  onToggle,
  onOpenApp,
}: {
  size: SizeKey;
  root: WidgetElement;
  dark: boolean;
  onToggle: (id: string) => void;
  onOpenApp: () => void;
}) {
  const meta = SIZE_META[size];
  return (
    <div className="widget-preview-slot">
      <div className="widget-preview-slot-meta">
        <span className="widget-preview-slot-title">{meta.label}</span>
        <span className="widget-preview-slot-hint">{meta.hint}</span>
      </div>
      <div
        className="widget-preview-frame"
        style={{ width: meta.width, height: meta.height }}
      >
        <WidgetNode
          el={root}
          dark={dark}
          onOpenApp={onOpenApp}
          onAction={(action) => {
            if (action.startsWith("toggle:")) onToggle(action.slice(7));
          }}
        />
      </div>
    </div>
  );
}

export function WidgetPreviewScreen() {
  const [mode, setMode] = useState<"filled" | "empty">("filled");
  const [dark, setDark] = useState(false);
  const [todos, setTodos] = useState(() => sampleTodos("filled"));
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("is-widget-preview");
    return () => document.documentElement.classList.remove("is-widget-preview");
  }, []);

  const config = useMemo(() => buildTodoWidgetConfig(todos), [todos]);

  function applyMode(next: "filled" | "empty") {
    setMode(next);
    setTodos(sampleTodos(next));
  }

  function onToggle(id: string) {
    setTodos((list) =>
      list.map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: Date.now() } : t)),
    );
    setToast("Toggled done / undone");
    window.setTimeout(() => setToast(null), 1600);
  }

  function onOpenApp() {
    setToast("Opening Traylist…");
    window.setTimeout(() => {
      window.location.href = "?mobile=1";
    }, 280);
  }

  return (
    <div className={`widget-preview-home${dark ? " is-dark" : ""}`}>
      <header className="widget-preview-bar">
        <div className="widget-preview-brand">
          <p className="widget-preview-eyebrow">Home screen</p>
          <h1 className="widget-preview-title">Traylist widget</h1>
        </div>
        <div className="widget-preview-toggles" role="group" aria-label="Preview options">
          <button
            type="button"
            className={mode === "filled" ? "is-active" : ""}
            onClick={() => applyMode("filled")}
          >
            Tasks
          </button>
          <button
            type="button"
            className={mode === "empty" ? "is-active" : ""}
            onClick={() => applyMode("empty")}
          >
            Empty
          </button>
          <button
            type="button"
            className={dark ? "is-active" : ""}
            aria-pressed={dark}
            onClick={() => setDark((v) => !v)}
          >
            {dark ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <div className="widget-preview-wallpaper" aria-hidden />

      <main className="widget-preview-board">
        <WidgetCard
          size="small"
          root={config.small!}
          dark={dark}
          onToggle={onToggle}
          onOpenApp={onOpenApp}
        />
        <WidgetCard
          size="medium"
          root={config.medium!}
          dark={dark}
          onToggle={onToggle}
          onOpenApp={onOpenApp}
        />
        <WidgetCard
          size="large"
          root={config.large!}
          dark={dark}
          onToggle={onToggle}
          onOpenApp={onOpenApp}
        />
      </main>

      <footer className="widget-preview-foot">
        <p>
          Tap <strong>Traylist</strong> → open app. Tap a row → done / undone.
        </p>
        <a className="widget-preview-link-out" href="?mobile=1">
          Open mobile app preview
        </a>
      </footer>

      {toast && (
        <div className="widget-preview-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
