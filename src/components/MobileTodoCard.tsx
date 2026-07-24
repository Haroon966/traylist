import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Todo } from "../lib/types";
import { formatUntil, isNewTodo, plainTodoText } from "../lib/dates";
import { isOverdue } from "../lib/parseDue";
import { RichText } from "./RichText";

const SWIPE_COMMIT = 88;
const LONG_PRESS_MS = 480;

export function MobileTodoCard({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onToast,
  style,
}: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onToast?: (msg: string) => void;
  style?: CSSProperties;
}) {
  const overdue = !todo.done && isOverdue(todo.dueAt);
  const showNew = !todo.done && isNewTodo(todo.createdAt);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const ignoreClick = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLLIElement>(null);

  const setOx = useCallback((x: number) => {
    offsetRef.current = x;
    setOffset(x);
  }, []);

  const clearLong = useCallback(() => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearLong();
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [clearLong],
  );

  const commitDelete = useCallback(() => {
    if (exiting) return;
    setMenuOpen(false);
    setDragging(false);
    setExiting(true);
    const width = wrapRef.current?.offsetWidth ?? window.innerWidth ?? 360;
    setOx(-(width + 24));
    exitTimer.current = setTimeout(() => {
      onDelete();
    }, 240);
  }, [exiting, onDelete, setOx]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: Event) {
      const t = e.target as Node;
      if (!(t instanceof Element) || !t.closest(`[data-card-menu="${todo.id}"]`)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [menuOpen, todo.id]);

  async function copyText() {
    const text = plainTodoText(todo.text);
    try {
      await navigator.clipboard.writeText(text);
      onToast?.("Copied");
    } catch {
      onToast?.("Copy failed");
    }
    setMenuOpen(false);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (menuOpen) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = "none";
    longFired.current = false;
    ignoreClick.current = false;
    setDragging(true);
    clearLong();
    longTimer.current = setTimeout(() => {
      longFired.current = true;
      ignoreClick.current = true;
      setDragging(false);
      setOx(0);
      setMenuOpen(true);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || longFired.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (axis.current === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis.current === "v") {
        clearLong();
        setDragging(false);
        setOx(0);
        return;
      }
      clearLong();
    }

    if (axis.current !== "h") return;
    e.preventDefault();
    // Soft rubber-band past commit threshold
    const capped = Math.max(-140, Math.min(140, dx));
    setOx(capped);
  }

  function onPointerUp() {
    clearLong();
    if (longFired.current) {
      setDragging(false);
      return;
    }
    const x = offsetRef.current;
    setDragging(false);
    if (axis.current === "h") {
      ignoreClick.current = true;
      if (x >= SWIPE_COMMIT) {
        setOx(0);
        onToggle();
        onToast?.(todo.done ? "Marked active" : "Done");
      } else if (x <= -SWIPE_COMMIT) {
        commitDelete();
      } else {
        setOx(0);
      }
    } else {
      setOx(0);
    }
    axis.current = "none";
  }

  const revealDone = offset > 12;
  const revealDelete = offset < -12;
  const doneProgress = Math.min(1, Math.max(0, offset / SWIPE_COMMIT));
  const deleteProgress = Math.min(1, Math.max(0, -offset / SWIPE_COMMIT));

  return (
    <li
      ref={wrapRef}
      className={`mobile-card-wrap${menuOpen ? " is-menu-open" : ""}${exiting ? " is-exiting" : ""}${overdue ? " is-overdue" : ""}${todo.done ? " is-done" : ""}`}
      data-card-menu={todo.id}
      style={style}
    >
      <div
        className={`mobile-card-reveal mobile-card-reveal-done ${revealDone ? "is-visible" : ""}`}
        style={{ opacity: 0.35 + doneProgress * 0.65 }}
        aria-hidden
      >
        <span className="mobile-card-reveal-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {todo.done ? "Undo" : "Done"}
        </span>
      </div>
      <div
        className={`mobile-card-reveal mobile-card-reveal-delete ${revealDelete ? "is-visible" : ""}`}
        style={{ opacity: 0.35 + deleteProgress * 0.65 }}
        aria-hidden
      >
        <span>Delete</span>
      </div>

      <div
        className={`mobile-card ${dragging ? "is-dragging" : ""}`}
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging ? "none" : "transform 240ms ease",
          opacity: exiting ? 0.35 : 1,
        }}
        onPointerDown={exiting ? undefined : onPointerDown}
        onPointerMove={exiting ? undefined : onPointerMove}
        onPointerUp={exiting ? undefined : onPointerUp}
        onPointerCancel={exiting ? undefined : onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          clearLong();
          setMenuOpen(true);
        }}
      >
        <div className="mobile-card-body">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`mobile-card-title ${todo.done ? "is-done" : ""}`}>
                <RichText text={todo.text} />
              </span>
              {showNew && <span className="mobile-new-tag">new</span>}
              {overdue && <span className="mobile-dot" aria-hidden />}
            </div>
            {todo.dueAt != null && (
              <p className={`mobile-card-meta ${overdue ? "is-overdue" : ""}`}>
                {formatUntil(todo.dueAt)}
              </p>
            )}
          </div>

          <button
            type="button"
            role="checkbox"
            aria-checked={todo.done}
            aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
            className={`mobile-check ${todo.done ? "is-checked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (ignoreClick.current) {
                ignoreClick.current = false;
                return;
              }
              try {
                navigator.vibrate?.(8);
              } catch {
                /* ignore */
              }
              onToggle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {todo.done ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-card-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onEdit?.();
            }}
          >
            Edit
          </button>
          <button type="button" role="menuitem" onClick={() => void copyText()}>
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onToggle();
            }}
          >
            {todo.done ? "Mark active" : "Mark done"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => commitDelete()}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
