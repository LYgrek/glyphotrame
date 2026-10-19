/* Contrôleur du rendu : relie les réglages au moteur et dessine dans les canvas de l'aperçu.
   Comme dans la référence :
   - un changement de réglage relance le calcul complet (schedule), une seule fois par image affichée ;
   - le dégradé (g…) et les effets d'écran (fx…) ne font que recomposer l'image (scheduleGrad) ;
   - pendant un glissement (courbe, plume), les masques sont calculés en basse définition.
   L'aperçu est dessiné par la carte graphique (WebGL2) ou, en secours, par le canvas 2D du moteur. */
import * as E from '../engine/index.js';
import { createGpuRenderer } from '../gpu/index.js';
import { settings, session, toast } from './index.js';

let src = null, grid = null, gpu = null;
let cutDirty = true, pending = false, gradPending = false, dragging = false;
let renderId = 0, fontRetries = 0, silent = false, started = false, pendingMax = 0;
const canvases = { out: null, orig: null, cutPreview: null };

// carte graphique perdue ou indisponible : retour au canvas 2D (le canvas de l'aperçu est recréé)
function fallBack(msg) {
  gpu = null;
  session.set({ rendu: 'canvas', gpuOk: false });
  toast(msg);
}

// références React des canvas (stables). Le canvas du résultat change quand on change de rendu.
export const canvasRef = {
  out: (el) => {
    if (gpu) { gpu.dispose(); gpu = null; }
    canvases.out = el;
    if (!el) return;
    if (session.get().rendu === 'gpu') {
      gpu = createGpuRenderer(el);
      if (!gpu) { fallBack("WebGL2 n'est pas disponible : l'aperçu passe en canvas 2D."); return; }
      if (session.get().gpuOk !== true) session.set({ gpuOk: true });
      el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fallBack('La carte graphique ne répond plus : l\'aperçu repasse en canvas 2D.'); }, { once: true });
    }
    if (grid) scheduleGrad();
  },
  orig: (el) => { canvases.orig = el; },
  cutPreview: (el) => { canvases.cutPreview = el; }
};

export const getGrid = () => grid;
export const getSource = () => src;

const previewDim = () => dragging ? 320 : 760;

// dessine la grille courante dans le canvas du résultat
function drawOut(st) {
  const el = canvases.out;
  if (!el || !grid) return;
  if (gpu) gpu.draw(grid, st, src, 1, false, previewDim());
  else if (session.get().rendu === 'canvas') E.draw(el.getContext('2d'), grid, st, src, 1, false, previewDim());
}

export function schedule() {
  if (pending) return; pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}
// changement du dégradé seul : on recompose sans recalculer la grille
export function scheduleGrad() {
  if (pending || gradPending) return; gradPending = true;
  requestAnimationFrame(() => {
    gradPending = false;
    if (!grid || pending) { schedule(); return; }
    drawOut(settings.get());
  });
}
export function setDragging(on) { dragging = on; }
export function endDrag() { if (!dragging) return; dragging = false; scheduleGrad(); }

async function render() {
  if (!src) return;
  // taille max changée : une seule nouvelle réduction par image affichée, même si le curseur bouge vite
  if (pendingMax) { refit(pendingMax); pendingMax = 0; }
  if (cutDirty) {
    cutDirty = false;
    const st = settings.get();
    const r = E.applyCutout(st, src);
    src = r.src;
    // couleur détectée : affichée dans le champ, sans relancer le détourage
    if (st.cut && r.cutColor !== st.cutColor) { silent = true; settings.set({ cutColor: r.cutColor }); silent = false; }
    if (canvases.cutPreview) E.drawCutPreview(canvases.cutPreview, src.image);
  }
  const id = ++renderId;
  const res = await E.compute(settings.get(), src, () => id !== renderId);
  if (!res) return;
  grid = res.grid;
  const st = settings.get();
  drawOut(st);
  if (canvases.orig) E.drawOrig(canvases.orig, grid, st, src);
  const video = src.kind === 'video' ? { ...src.meta, time: src.time } : null;
  session.set({ stats: { kind: grid.kind, cols: grid.cols, rows: grid.rows, count: grid.count, W: grid.W, H: grid.H, type: grid.type, cmyk: grid.cmyk, htCell: st.htCell, video } });
  if (!res.ready && fontRetries < 4) { fontRetries++; setTimeout(schedule, 500); }
}

// réglages sans effet sur l'image
const QUIET = new Set(['zoom', 'scale', 'gShowCurve']);
const CUT_KEYS = new Set(['cut', 'cutAuto', 'cutColor', 'tol', 'soft', 'flood']);
function onSettings(next, prev) {
  if (silent) return;
  let full = false, comp = false;
  for (const k in next) {
    if (next[k] === prev[k] || QUIET.has(k)) continue;
    if (k === 'srcMax') { pendingMax = next.srcMax; full = true; }
    else if (CUT_KEYS.has(k)) { cutDirty = true; full = true; }
    else if (k === 'grad' || /^g[A-Z]/.test(k) || /^fx/.test(k)) comp = true;
    else { full = true; if (k === 'font') fontRetries = 0; }
  }
  if (full) schedule(); else if (comp) scheduleGrad();
}

// taille max changée : on réduit à nouveau l'image d'origine
function refit(maxDim) {
  if (!src || !src.original) return;
  src = E.createSource(E.fitImage(src.original, maxDim), src.name, src.original, { path: src.path, exemple: src.exemple });
  cutDirty = true;
}

// nouvelle image source (canvas déjà réduit) ; original = image décodée, pour la taille max ;
// extra = { path } ou { exemple: true } (enregistrés dans les projets)
export function setSource(canvas, name, original = null, extra = {}) {
  src = E.createSource(canvas, name, original, extra);
  cutDirty = true;
  if (!settings.get().cutAuto) { silent = true; settings.set({ cutAuto: true }); silent = false; }
  session.set({ sourceName: name });
  schedule();
}

// vidéo : nouvelle image (autre instant, autre taille max) pour la même source ; garde le nom,
// les informations et le réglage du détourage (contrairement à une nouvelle image)
export function replaceImage(canvas, extra = {}) {
  if (!src) return;
  src = E.createSource(canvas, src.name, src.original, { kind: src.kind, path: src.path, meta: src.meta, time: src.time, exemple: src.exemple, ...extra });
  cutDirty = true;
  schedule();
}

// démarrage (une seule fois) : image d'exemple, abonnement aux réglages, polices
export function start() {
  if (started) return;
  started = true;
  settings.subscribe(onSettings);
  setSource(E.makeSample(), 'exemple-sphere.png', null, { exemple: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { E.clearDensityCache(); schedule(); });
}
