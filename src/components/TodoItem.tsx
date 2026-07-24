import type { Todo } from "../lib/types";
import { pickIcon } from "../lib/todoDecorate";
import { RichText } from "./RichText";
import { DueChip } from "./DueChip";
import { TaskIcon } from "./TaskIcon";

function splitParts(text: string): { title: string; note: string | null } {
  const idx = text.indexOf(" — ");
  if (idx === -1) return { title: text, note: null };
  const title = text.slice(0, idx).trim();
  const note = text.slice(idx + 3).trim();
  return { title: title || text, note: note || null };
}

export function TodoItem({
  todo,
  onToggle,
  onDelete,
  onSnooze,
  dense = false,
}: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onSnooze: (kind: "10m" | "1h" | "tomorrow") => void;
  /** Tray popover row layout (mockup). */
  dense?: boolean;
}) {
  const icon = pickIcon(todo.text);
  const { title, note } = splitParts(todo.text);

  if (!dense) {
    return (
      <li className="todo-row group flex items-start gap-2.5 rounded-lg px-2.5 py-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={todo.done}
          aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
          onClick={onToggle}
          className="todo-check mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2"
          style={{
            borderColor: todo.done ? "var(--primary)" : "var(--line)",
            background: todo.done ? "var(--primary)" : "transparent",
            color: todo.done ? "var(--bg)" : "transparent",
          }}
        >
          {todo.done ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>
        <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: "var(--primary)" }}>
          <TaskIcon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[14px] font-medium leading-5"
            style={{
              color: todo.done ? "var(--ink-muted)" : "var(--ink)",
              textDecoration: todo.done ? "line-through" : "none",
            }}
          >
            <RichText text={todo.text} />
          </div>
          {todo.dueAt != null && !todo.done && (
            <div className="mt-1.5">
              <DueChip dueAt={todo.dueAt} onSnooze={onSnooze} />
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Delete task"
          onClick={onDelete}
          className="todo-delete mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
          style={{ color: "var(--danger)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </li>
    );
  }

  return (
    <li className={`tray-row group${todo.done ? " is-done" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
        onClick={onToggle}
        className="tray-check"
      >
        {todo.done ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>

      <div className="tray-row-body min-w-0 flex-1">
        <div className="tray-row-title">
          <RichText text={title} />
        </div>
        {note && (
          <p className="tray-row-note">
            <span className="tray-row-note-icon" aria-hidden>
              <TaskIcon name={icon} />
            </span>
            <span className="truncate">{note}</span>
          </p>
        )}
      </div>

      {todo.dueAt != null && (
        <div className="tray-row-due shrink-0">
          <DueChip dueAt={todo.dueAt} onSnooze={todo.done ? undefined : onSnooze} />
        </div>
      )}

      {!note && (
        <span className="tray-row-icon shrink-0" aria-hidden>
          <TaskIcon name={icon} />
        </span>
      )}

      <button
        type="button"
        aria-label="Delete task"
        onClick={onDelete}
        className="tray-row-delete"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}
