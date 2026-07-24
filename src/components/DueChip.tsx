import { formatDueChip, isOverdue } from "../lib/parseDue";

export function DueChip({
  dueAt,
  onSnooze,
}: {
  dueAt: number;
  onSnooze?: (kind: "10m" | "1h" | "tomorrow") => void;
}) {
  const overdue = isOverdue(dueAt);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className="rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide"
        style={{
          background: overdue
            ? "color-mix(in srgb, var(--overdue) 18%, transparent)"
            : "var(--primary-soft)",
          color: overdue ? "var(--overdue)" : "var(--primary)",
        }}
        title={new Date(dueAt).toLocaleString()}
      >
        {formatDueChip(dueAt)}
      </span>
      {overdue && onSnooze && (
        <span className="snooze-actions inline-flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {(
            [
              ["10m", "10m"],
              ["1h", "1h"],
              ["tomorrow", "tmr"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="min-h-8 rounded-md px-2 text-[11px] font-semibold"
              style={{
                color: "var(--ink-muted)",
                background: "color-mix(in srgb, var(--ink-muted) 10%, transparent)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSnooze(kind);
              }}
              title={`Snooze ${kind}`}
            >
              {label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
