/* Deux stores :
   - settings : les réglages (même forme que `state` dans la référence) — ce qui sera enregistré dans un projet ;
   - session  : l'état de l'interface (vue, pipette, outil plume, fenêtre Code, statistiques, message). */
import { createStore, useStore } from './store.js';
import { defaultSettings } from './defaults.js';

export const settings = createStore(defaultSettings());
export const session = createStore({
  sourceName: 'exemple-sphere.png',
  stats: null,          // résumé de la dernière grille calculée
  view: 'result',       // result | side | wipe
  picking: false,       // pipette du détourage
  dragOver: false,      // fichier glissé au-dessus de la fenêtre
  sheetOpen: false,     // fenêtre Code
  toast: null,          // { msg, id }
  penTool: 'pen',       // pen | select | add | del | convert
  selNode: -1,
  penHover: null,       // position du pointeur (relative) pour l'élastique
  penBusy: false,       // glissement en cours avec l'outil plume
  nearFirst: false,     // survol du premier point (fermer le tracé)
  canUndo: false, canRedo: false
});

export const useSetting = (k) => useStore(settings, (s) => s[k]);
export const useSession = (k) => useStore(session, (s) => s[k]);
export const setSettings = (patch) => settings.set(patch);

export function toast(msg) { session.set({ toast: { msg, id: Math.random() } }); }
