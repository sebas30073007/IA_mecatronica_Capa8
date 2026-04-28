// src/core/history.js
// Undo/Redo basado en snapshots del grafo.
// Para MVP didáctico: guardamos SOLO graph (sin runtime), y re-aplicamos en el store.

export function createHistory({ limit = 50 } = {}) {
  const past = [];
  const future = [];

  function push(snapshot) {
    past.push(snapshot);
    while (past.length > limit) past.shift();
    future.length = 0;
  }

  function canUndo() { return past.length > 0; }
  function canRedo() { return future.length > 0; }

  function undo(currentSnapshot) {
    if (!canUndo()) return null;
    const prev = past.pop();
    future.push(currentSnapshot);
    return prev;
  }

  function redo(currentSnapshot) {
    if (!canRedo()) return null;
    const next = future.pop();
    past.push(currentSnapshot);
    return next;
  }

  function clear() {
    past.length = 0;
    future.length = 0;
  }

  function undoCount() { return past.length; }
  function redoCount() { return future.length; }

  return { push, undo, redo, canUndo, canRedo, clear, undoCount, redoCount };
}
