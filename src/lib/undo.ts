import type { Todo } from "./types";

export type UndoAction =
  | { type: "delete"; todo: Todo; index: number }
  | { type: "toggle"; id: string; prevDone: boolean }
  | { type: "replace"; prev: Todo[] };

const MAX = 20;

export class UndoStack {
  private stack: UndoAction[] = [];

  push(action: UndoAction) {
    this.stack.push(action);
    if (this.stack.length > MAX) this.stack.shift();
  }

  pop(): UndoAction | undefined {
    return this.stack.pop();
  }

  clear() {
    this.stack = [];
  }

  get length() {
    return this.stack.length;
  }
}

export function applyUndo(todos: Todo[], action: UndoAction): Todo[] {
  switch (action.type) {
    case "delete": {
      const next = [...todos];
      const idx = Math.min(action.index, next.length);
      next.splice(idx, 0, action.todo);
      return next;
    }
    case "toggle":
      return todos.map((t) =>
        t.id === action.id
          ? { ...t, done: action.prevDone, updatedAt: Date.now() }
          : t,
      );
    case "replace":
      return action.prev.map((t) => ({ ...t }));
  }
}
