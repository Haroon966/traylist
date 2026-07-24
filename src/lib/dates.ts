export type DayCell = {
  key: string;
  date: Date;
  dayNum: number;
  weekday: string;
  isToday: boolean;
};

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDayChip(d: Date): string {
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Today −7 … +14 for the horizontal date strip (covers recent overdue). */
export function buildDayStrip(center = new Date(), before = 7, after = 14): DayCell[] {
  const base = startOfDay(center);
  const today = startOfDay();
  const cells: DayCell[] = [];
  for (let i = -before; i <= after; i++) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    cells.push({
      key: dayKey(date),
      date,
      dayNum: date.getDate(),
      weekday: date.toLocaleDateString([], { weekday: "short" }),
      isToday: dayKey(date) === dayKey(today),
    });
  }
  return cells;
}

export function dueOnDay(dueAt: number | null, day: Date): boolean {
  if (dueAt == null) return false;
  const d = new Date(dueAt);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export function duePreset(kind: "today" | "tomorrow" | "weekend"): number {
  const d = startOfDay();
  if (kind === "today") {
    d.setHours(18, 0, 0, 0);
    return d.getTime();
  }
  if (kind === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  }
  // Next Saturday 09:00
  const day = d.getDay();
  const add = day === 6 ? 7 : (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export function isNewTodo(createdAt: number, now = Date.now()): boolean {
  return now - createdAt < 24 * 60 * 60 * 1000;
}

export type HeroPeriod = "morning" | "noon" | "evening" | "night";

/** Pick hero art from local clock. */
export function getHeroPeriod(now = new Date()): HeroPeriod {
  const h = now.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export const HERO_IMAGES: Record<HeroPeriod, string> = {
  morning: "/hero/hero-morning.png",
  noon: "/hero/hero-noon.png",
  evening: "/hero/hero-evening.png",
  night: "/hero/hero-night.png",
};

export function plainTodoText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function formatUntil(dueAt: number, now = Date.now()): string {
  const d = new Date(dueAt);
  const today = startOfDay(new Date(now));
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  if (dueAt < now) return "Overdue";
  if (d >= today && d < tomorrow) return "Today";
  if (d >= tomorrow && d < dayAfter) return "Tomorrow";
  return `Until ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}
