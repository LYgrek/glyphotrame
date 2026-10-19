/* Outil plume : outil actif, historique du tracé (annuler / rétablir), actions des boutons.
   Les gestes à la souris sont dans ui/stage/usePenTool.js. */
import { clonePath, defaultPath } from '../engine/index.js';
import { settings, session, toast } from './index.js';

const hist = [], redoStack = [];
const snap = () => JSON.stringify(settings.get().gPath);
const sync = () => session.set({ canUndo: hist.length > 0, canRedo: redoStack.length > 0 });

export const getPath = () => settings.get().gPath;
export const setPath = (path) => settings.set({ gPath: path });
// le tracé est éditable sur l'aperçu (vue Curseur exclue)
export const penVisible = () => { const s = settings.get(); return s.grad && s.gShape === 'libre' && s.gShowCurve; };
export const penActive = () => penVisible() && session.get().view !== 'wipe';

// à appeler juste avant une modification du tracé
export function pushHist() { hist.push(snap()); if (hist.length > 100) hist.shift(); redoStack.length = 0; sync(); }
export function undoPath() {
  if (!hist.length) return;
  redoStack.push(snap()); setPath(JSON.parse(hist.pop())); session.set({ selNode: -1 }); sync();
}
export function redoPath() {
  if (!redoStack.length) return;
  hist.push(snap()); setPath(JSON.parse(redoStack.pop())); session.set({ selNode: -1 }); sync();
}

export function setPenTool(t) {
  session.set({ penTool: t, ...(t !== 'pen' ? { penHover: null } : {}) });
}
export function newPath() {
  pushHist(); setPath({ closed: false, nodes: [] }); session.set({ selNode: -1 }); setPenTool('pen');
  toast('Clique sur l\'image pour poser les points. Clique sur le premier point pour fermer le tracé.');
}
export function toggleClosed() {
  const p = getPath();
  if (!p.closed && p.nodes.length < 2) { toast('Pose au moins 2 points avant de fermer le tracé.'); return; }
  pushHist(); const q = clonePath(p); q.closed = !q.closed; setPath(q);
}
export function resetPath() { pushHist(); setPath(defaultPath()); session.set({ selNode: -1 }); }

export const PEN_HINTS = {
  pen: (p) => p.closed
    ? 'Tracé fermé. Clic sur le tracé : ajouter un point · clic sur un point : le supprimer.'
    : p.nodes.length ? 'Clic : point d\'angle · Cliquer-glisser : point courbe · Clic sur le 1er point : fermer · Échap : terminer'
      : 'Clique sur l\'image pour poser le premier point (cliquer-glisser pour une courbe).',
  select: () => 'Glisse un point ou une poignée · Alt : casse la symétrie · Double-clic : angle ↔ courbe · Flèches : décaler',
  add: () => 'Clique sur le tracé pour ajouter un point sans changer sa forme.',
  del: () => 'Clique sur un point pour le supprimer.',
  convert: () => 'Clic sur un point : le rend anguleux. Glisser depuis un point : tire de nouvelles poignées de courbe.'
};
