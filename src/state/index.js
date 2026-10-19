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
  canUndo: false, canRedo: false,
  // rendu de l'aperçu et des exports PNG / JPEG : carte graphique (WebGL2) ou canvas 2D
  // (?rendu=canvas dans l'adresse force le canvas 2D, utilisé par le banc compare:ui)
  rendu: typeof location !== 'undefined' && new URLSearchParams(location.search).get('rendu') === 'canvas' ? 'canvas' : 'gpu',
  gpuOk: null           // null : pas encore essayé ; false : WebGL2 indisponible
});

export const useSetting = (k) => useStore(settings, (s) => s[k]);
export const useSession = (k) => useStore(session, (s) => s[k]);
export const setSettings = (patch) => settings.set(patch);

export function toast(msg) { session.set({ toast: { msg, id: Math.random() } }); }
