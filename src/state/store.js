/* Petit store sans dépendance : état immuable, abonnements, hook React.
   set() fusionne un objet de changements ; rien ne se passe si aucune valeur ne change. */
import { useSyncExternalStore } from 'react';

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k in p) if (!Object.is(state[k], p[k])) { changed = true; break; }
      if (!changed) return;
      const prev = state;
      state = { ...state, ...p };
      subs.forEach((f) => f(state, prev));
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); }
  };
}

// le sélecteur doit rendre une valeur stable (une clé de l'état, pas un nouvel objet)
export const useStore = (store, selector) => useSyncExternalStore(store.subscribe, () => selector(store.get()));
