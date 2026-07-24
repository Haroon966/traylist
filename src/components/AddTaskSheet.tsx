import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Todo } from "../lib/types";
import { dueOnDay, duePreset, startOfDay } from "../lib/dates";

type DueKind = "today" | "tomorrow" | "weekend" | "none";

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function splitTaskText(text: string): { name: string; note: string; highPriority: boolean } {
  let raw = text.trim();
  let highPriority = false;
  const bold = raw.match(/^\*\*([\s\S]+)\*\*$/);
  if (bold) {
    highPriority = true;
    raw = bold[1].trim();
  }
  const sep = " — ";
  const i = raw.indexOf(sep);
  if (i >= 0) {
    return {
      name: raw.slice(0, i).trim(),
      note: raw.slice(i + sep.length).trim(),
      highPriority,
    };
  }
  return { name: raw, note: "", highPriority };
}

function dueKindFromDueAt(dueAt: number | null): DueKind {
  if (dueAt == null) return "none";
  if (dueOnDay(dueAt, startOfDay())) return "today";
  const tomorrow = startOfDay();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dueOnDay(dueAt, tomorrow)) return "tomorrow";
  if (dueOnDay(dueAt, new Date(duePreset("weekend")))) return "weekend";
  return "today";
}

export function AddTaskSheet({
  open,
  editing,
  onClose,
  onAdd,
  onSave,
}: {
  open: boolean;
  editing?: Todo | null;
  onClose: () => void;
  onAdd: (text: string, dueAt: number | null) => void;
  onSave?: (id: string, text: string, dueAt: number | null) => void;
}) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const noteId = `${uid}-note`;
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [dueKind, setDueKind] = useState<DueKind>("today");
  const [highPriority, setHighPriority] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLFormElement>(null);
  const isEdit = Boolean(editing);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const parts = splitTaskText(editing.text);
      setName(parts.name);
      setNote(parts.note);
      setHighPriority(parts.highPriority);
      setDueKind(dueKindFromDueAt(editing.dueAt));
    } else {
      setName("");
      setNote("");
      setDueKind("today");
      setHighPriority(false);
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** Lift sheet above the soft keyboard on Android. */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    function syncKb() {
      const inset = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
    }
    vv.addEventListener("resize", syncKb);
    vv.addEventListener("scroll", syncKb);
    syncKb();
    return () => {
      vv.removeEventListener("resize", syncKb);
      vv.removeEventListener("scroll", syncKb);
      document.documentElement.style.setProperty("--kb-inset", "0px");
    };
  }, [open]);

  if (!open) return null;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = [name.trim(), note.trim()].filter(Boolean).join(" — ");
    if (!text) return;
    const withPriority = highPriority ? `**${text}**` : text;
    const dueAt = dueKind === "none" ? null : duePreset(dueKind);
    if (editing && onSave) {
      onSave(editing.id, withPriority, dueAt);
    } else {
      onAdd(withPriority, dueAt);
    }
    onClose();
  }

  const canSubmit = name.trim().length > 0;

  return (
    <div className="add-sheet-root" role="dialog" aria-modal="true" aria-labelledby="add-sheet-title">
      <button type="button" className="add-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <form ref={sheetRef} className="add-sheet" onSubmit={submit}>
        <div className="add-sheet-head">
          <h2 id="add-sheet-title">{isEdit ? "Edit task" : "Add task"}</h2>
          <button type="button" className="add-sheet-close" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="add-sheet-field">
          <label className="sr-only" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            ref={inputRef}
            className="add-sheet-input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            enterKeyHint="next"
            autoComplete="off"
            required
          />
        </div>

        <div className="add-sheet-field">
          <label className="sr-only" htmlFor={noteId}>
            Description
          </label>
          <textarea
            id={noteId}
            className="add-sheet-textarea"
            placeholder="Task description…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <div className="add-sheet-pills" role="group" aria-label="Due date">
          {(
            [
              ["today", "Today"],
              ["tomorrow", "Tomorrow"],
              ["weekend", "This weekend"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`add-sheet-pill${dueKind === kind ? " is-active" : ""}`}
              aria-pressed={dueKind === kind}
              onClick={() => setDueKind(kind)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`add-sheet-pill add-sheet-pill-icon${dueKind === "none" ? " is-active" : ""}`}
            aria-label="No due date"
            aria-pressed={dueKind === "none"}
            title="No due date"
            onClick={() => setDueKind("none")}
          >
            <IconCalendar />
          </button>
        </div>
        {dueKind === "none" && (
          <p className="add-sheet-due-hint">No due date — shows on Today</p>
        )}

        <button
          type="button"
          className={`add-sheet-priority${highPriority ? " is-on" : ""}`}
          aria-pressed={highPriority}
          onClick={() => setHighPriority((v) => !v)}
        >
          <span>High priority</span>
          <span className="add-sheet-check" aria-hidden>
            {highPriority ? <IconCheck /> : null}
          </span>
        </button>

        <button type="submit" className="add-sheet-submit" disabled={!canSubmit}>
          {isEdit ? "Save changes" : "Add task"}
        </button>
      </form>
    </div>
  );
}
