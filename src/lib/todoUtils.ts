import type { Todo } from "./types";
import { isDueToday, isOverdue } from "./parseDue";

function rank(todo: Todo, now: number): number {
  if (todo.done) return 400;
  if (isOverdue(todo.dueAt, now)) return 0;
  if (isDueToday(todo.dueAt, now)) return 100;
  if (todo.dueAt != null) return 200;
  return 300;
}

export function sortTodos(todos: Todo[], now = Date.now()): Todo[] {
  return [...todos].sort((a, b) => {
    const ra = rank(a, now);
    const rb = rank(b, now);
    if (ra !== rb) return ra - rb;
    if (a.dueAt != null && b.dueAt != null && a.dueAt !== b.dueAt) {
      return a.dueAt - b.dueAt;
    }
    return b.createdAt - a.createdAt;
  });
}

export function openCount(todos: Todo[]): number {
  return todos.filter((t) => !t.done).length;
}

export function hasOverdue(todos: Todo[], now = Date.now()): boolean {
  return todos.some((t) => !t.done && isOverdue(t.dueAt, now));
}

export function todosToMarkdown(todos: Todo[]): string {
  const lines = ["# Traylist export", ""];
  for (const t of sortTodos(todos)) {
    const box = t.done ? "[x]" : "[ ]";
    const due = t.dueAt ? ` (due ${new Date(t.dueAt).toISOString()})` : "";
    lines.push(`- ${box} ${t.text}${due}`);
  }
  return lines.join("\n") + "\n";
}

export function todosToJson(todos: Todo[]): string {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), todos }, null, 2);
}

export function todosFromJson(raw: string): Todo[] {
  const data = JSON.parse(raw) as { todos?: Todo[] } | Todo[];
  const list = Array.isArray(data) ? data : data.todos;
  if (!Array.isArray(list)) throw new Error("Invalid backup file");
  return list.map((t) => ({
    id: String(t.id ?? crypto.randomUUID()),
    text: String(t.text ?? ""),
    done: Boolean(t.done),
    dueAt: typeof t.dueAt === "number" ? t.dueAt : null,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    notifiedAt: typeof t.notifiedAt === "number" ? t.notifiedAt : null,
  }));
}
