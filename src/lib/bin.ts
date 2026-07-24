import type { BinnedTodo, Todo } from "./types";
import { BIN_RETENTION_MS } from "./types";

export function toBinned(todo: Todo, deletedAt = Date.now()): BinnedTodo {
  return { ...todo, deletedAt };
}

export function purgeExpiredBin(bin: BinnedTodo[], now = Date.now()): BinnedTodo[] {
  return bin.filter((item) => now - item.deletedAt < BIN_RETENTION_MS);
}

/** Newest deletions first. */
export function sortBin(bin: BinnedTodo[]): BinnedTodo[] {
  return [...bin].sort((a, b) => b.deletedAt - a.deletedAt);
}

export function removeFromBin(bin: BinnedTodo[], id: string): BinnedTodo[] {
  return bin.filter((item) => item.id !== id);
}

export function upsertBin(bin: BinnedTodo[], item: BinnedTodo): BinnedTodo[] {
  return [item, ...bin.filter((b) => b.id !== item.id)];
}

export function formatBinDay(deletedAt: number, now = Date.now()): string {
  const d = new Date(deletedAt);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function daysLeftInBin(deletedAt: number, now = Date.now()): number {
  const left = BIN_RETENTION_MS - (now - deletedAt);
  return Math.max(0, Math.ceil(left / 86_400_000));
}
