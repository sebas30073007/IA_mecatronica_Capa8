// src/core/store.js
// Tiny store (redux-like) sin librerías. Mantiene estado, dispatch y subscribe.

export function createStore({ initialState, reducer }) {
  let state = initialState;
  /** @type {Array<(state:any, action:any)=>void>} */
  const listeners = [];

  function getState() {
    return state;
  }

  function dispatch(action) {
    const prev = state;
    state = reducer(state, action);

    // Notifica listeners
    for (const fn of listeners) fn(state, action, prev);
    return action;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  return { getState, dispatch, subscribe };
}
