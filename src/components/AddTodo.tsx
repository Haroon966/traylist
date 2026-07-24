import { forwardRef, useId, useState, type FormEvent, type KeyboardEvent } from "react";

export const AddTodo = forwardRef<
  HTMLInputElement,
  { onAdd: (text: string, dueAt?: number | null) => void }
>(function AddTodo({ onAdd }, ref) {
  const uid = useId();
  const inputId = `${uid}-task`;
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSubmit = value.trim().length > 0;

  return (
    <form onSubmit={onSubmit} className="tray-composer">
      <label htmlFor={inputId} className="sr-only">
        Add a task
      </label>
      <div className="tray-composer-row">
        <input
          id={inputId}
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a task..."
          enterKeyHint="done"
          className="tray-composer-input"
          autoComplete="off"
          spellCheck
        />
        <button
          type="submit"
          aria-label="Add task"
          className="tray-composer-add"
          disabled={!canSubmit}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </form>
  );
});
