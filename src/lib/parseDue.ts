import * as chrono from "chrono-node";

export type DueParse = {
  dueAt: number | null;
  /** Original text unchanged — chip shows the due; title stays as typed */
  text: string;
};

export function parseDue(input: string, reference = new Date()): DueParse {
  const text = input.trim();
  if (!text) return { dueAt: null, text: "" };

  const results = chrono.parse(text, reference, { forwardDate: true });
  if (!results.length) {
    return { dueAt: null, text };
  }

  const best = results[0];
  const date = best.start.date();
  return { dueAt: date.getTime(), text };
}

export function formatDueChip(dueAt: number, now = Date.now()): string {
  const d = new Date(dueAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  const time = hasTime
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  if (dueAt < now) {
    return time ? `Overdue · ${time}` : "Overdue";
  }
  if (d >= startOfToday && d < startOfTomorrow) {
    return time ? `Today · ${time}` : "Today";
  }
  if (d >= startOfTomorrow && d < endOfTomorrow) {
    return time ? `Tomorrow · ${time}` : "Tomorrow";
  }
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return time ? `${day} · ${time}` : day;
}

export function isOverdue(dueAt: number | null, now = Date.now()): boolean {
  return dueAt != null && dueAt < now;
}

export function isDueToday(dueAt: number | null, now = Date.now()): boolean {
  if (dueAt == null) return false;
  const d = new Date(dueAt);
  const n = new Date(now);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

export function snoozeDue(from: number, kind: "10m" | "1h" | "tomorrow"): number {
  const base = Math.max(from, Date.now());
  if (kind === "10m") return base + 10 * 60 * 1000;
  if (kind === "1h") return base + 60 * 60 * 1000;
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}
