/**
 * Runnable: npx --yes tsx src/lib/merge.selfcheck.ts
 * Fails hard if LWW / tombstone merge regresses.
 */
import { mergeState } from "./merge";
import type { PersistState, Todo } from "./types";
import { DEFAULT_SETTINGS } from "./types";

function todo(partial: Partial<Todo> & Pick<Todo, "id" | "text" | "updatedAt">): Todo {
  return {
    done: false,
    dueAt: null,
    createdAt: partial.updatedAt,
    notifiedAt: null,
    ...partial,
  };
}

function base(over: Partial<PersistState> = {}): PersistState {
  return {
    todos: [],
    tombstones: [],
    bin: [],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const a = todo({ id: "1", text: "old", updatedAt: 100 });
const b = todo({ id: "1", text: "new", updatedAt: 200 });

{
  const m = mergeState(base({ todos: [a] }), base({ todos: [b] }));
  assert(m.todos.length === 1 && m.todos[0].text === "new", "LWW prefers higher updatedAt");
}

{
  const m = mergeState(
    base({ todos: [b], tombstones: [] }),
    base({ todos: [a], tombstones: [{ id: "1", deletedAt: 250 }] }),
  );
  assert(m.todos.length === 0, "tombstone newer than todo removes it");
  assert(m.tombstones.some((t) => t.id === "1"), "tombstone retained");
}

{
  const resurrected = todo({ id: "1", text: "back", updatedAt: 300 });
  const m = mergeState(
    base({ todos: [resurrected], tombstones: [] }),
    base({ todos: [], tombstones: [{ id: "1", deletedAt: 250 }] }),
  );
  assert(m.todos.length === 1 && m.todos[0].text === "back", "newer todo beats older tombstone");
  assert(m.tombstones.length === 0, "stale tombstone dropped");
}

{
  const x = todo({ id: "x", text: "x", updatedAt: 1 });
  const y = todo({ id: "y", text: "y", updatedAt: 1 });
  const m = mergeState(base({ todos: [x] }), base({ todos: [y] }));
  assert(m.todos.length === 2, "distinct ids both kept");
}

console.log("merge.selfcheck: ok");
