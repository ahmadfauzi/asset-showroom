// Undo history for one room. Each commit stores a full copy of the state.
// The history is mutated in place.
export type History<T> = { past: T[]; committed: T; future: T[] };

export function createHistory<T>(initial: T): History<T> {
  return { past: [], committed: initial, future: [] };
}

// Pushes `next` unless its key matches the committed state. Clears redo steps.
// Returns true if it pushed.
export function commit<T>(history: History<T>, next: T, key: (state: T) => string): boolean {
  if (key(next) === key(history.committed)) return false;
  history.past.push(history.committed);
  history.committed = next;
  history.future = [];
  return true;
}

// Steps back one state. Returns the state to restore, or undefined if there is nothing to undo.
export function undo<T>(history: History<T>): T | undefined {
  const previous = history.past.pop();
  if (previous === undefined) return undefined;
  history.future.push(history.committed);
  history.committed = previous;
  return previous;
}

// Steps forward one state. Returns the state to restore, or undefined if there is nothing to redo.
export function redo<T>(history: History<T>): T | undefined {
  const next = history.future.pop();
  if (next === undefined) return undefined;
  history.past.push(history.committed);
  history.committed = next;
  return next;
}
