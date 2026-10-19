/* Actions de l'interface : changements de réglages qui en entraînent d'autres (comme dans la référence),
   chargement d'image, pipette, exports. */
import * as E from '../engine/index.js';
import { settings, session, toast } from './index.js';
import * as R from './renderer.js';
import { chooseImage, saveFile } from '../platform/files.js';
import { gpuRenderBlob } from '../gpu/index.js';

const get = () => settings.get();
const set = (p) => settings.set(p);
const lightPaper = (st) => E.lum(E.hexToRgb(st.paper)) > 0.5;

/* ---------- Image ---------- */
// file = { blob, name, path? } ; maxDim : taille max (par défaut celle des réglages) ; rend true si l'image est chargée
export async function loadImage(file, { quiet = false, maxDim } = {}) {
  if (!file) return false;
  try {
    const img = await E.loadImage(file.blob);
    R.setSource(E.fitImage(img, maxDim || get().srcMax), file.name, img, file.path ? { path: file.path } : {});
    session.set({ dirty: true });
    if (!quiet) toast('Image chargée : ' + file.name);
    return true;
  } catch (e) { toast(e.message); return false; }
}
export async function openImage() {
  try { await loadImage(await chooseImage()); }
  catch (e) { toast('Impossible de lire ce fichier.'); }
}
export function loadSample() {
  R.setSource(E.makeSample(), 'exemple-sphere.png', null, { exemple: true });
  session.set({ dirty: true });
}

/* ---------- Effet et couleurs ---------- */
export function setMode(m) {
  const st = get(), p = { mode: m };
  // le néon a besoin d'un fond sombre pour ressortir
  const dark = m === 'neon' && st.mode !== 'neon' && lightPaper(st);
  if (dark) p.paper = E.NEON_PRESETS[0].paper;
  set(p);
  if (dark) toast('Fond passé en noir pour faire ressortir le néon.');
}
export function setEffect(e) {
  const p = { effect: e };
  if (e === 'chars' && get().mode === 'cmyk') p.mode = 'mono';
  set(p);
}
export const setHtType = (t) => set({ htType: t, ...E.HT_DEFAULTS[t] });
export const setColors = (ink, paper) => set({ ink, paper });

export function applyNeonPreset(pr) {
  set({ neonA: pr.a, neonB: pr.b, neonC: pr.c, ...(get().neonMix === 100 ? { neonMix: 0 } : {}), paper: pr.paper });
}
// tuile « Couleurs de l'image » : les vraies couleurs, ravivées façon néon
export function neonImageColors() {
  set({ neonMix: 100, ...(lightPaper(get()) ? { paper: '#050507' } : {}) });
}

// jeu de caractères ; rend true pour « Personnalisé » (l'interface place alors le curseur dans le champ)
export function setPreset(id) {
  const pr = E.PRESETS.find((x) => x.id === id);
  set({ preset: id, ...(pr.chars ? { custom: pr.chars } : {}) });
  return !pr.chars;
}
export function setCustom(v) {
  const match = E.PRESETS.find((p) => p.chars && p.chars === v);
  set({ custom: v, preset: match ? match.id : 'perso' });
}

/* ---------- Néon & écran ---------- */
const FX_KEYS = ['fxGlow', 'fxGrid', 'fxScan', 'fxChroma', 'fxGrain', 'fxVig'];
export function fxReset() {
  set(Object.fromEntries(FX_KEYS.map((k) => [k, 0])));
  toast("Effets d'écran retirés.");
}
export function fxPreset() {
  const st = get(), np = E.NEON_PRESETS[0];
  set({
    effect: 'halftone', htType: 'points', htShape: 'carre', htGrid: 'carree',
    htCell: 7, htAngle: 0, htMax: 100, htMin: 6, htJit: 0, contrast: 40, bright: -15,
    mode: 'neon', neonA: np.a, neonB: np.b, neonC: np.c, paper: np.paper,
    neonMix: st.neonMix === 100 ? 0 : st.neonMix, neonMid: 62,
    fxGlow: 60, fxGlowR: 6, fxGrid: 55, fxGridW: 22, fxGridSync: true,
    fxScan: 0, fxChroma: 1.5, fxGrain: 14, fxVig: 45
  });
  toast('Style « Néon numérique » appliqué.');
}

/* ---------- Détourage ---------- */
export function setPicking(on) {
  session.set({ picking: on });
  if (on) toast("Clique sur le fond dans l'aperçu pour choisir sa couleur.");
}
export function setCut(on) {
  const st = get(), p = { cut: on };
  if (!on) setPicking(false);
  const autoTransparent = on && !st.transparent;
  if (autoTransparent) p.transparent = true;
  set(p);
  if (autoTransparent) toast('Fond transparent activé pour les exports PNG, SVG et code.');
}
export function cutAutoDetect() { set({ cutAuto: true }); setPicking(false); }
export const setCutColor = (c) => set({ cutAuto: false, cutColor: c });
// clic sur l'aperçu avec la pipette (position relative 0 → 1)
export function pickAt(fx, fy) {
  const src = R.getSource();
  if (!session.get().picking || !src) return;
  const c = E.colorAt(src, fx, fy);
  set({ cutAuto: false, cutColor: c });
  setPicking(false);
  toast('Couleur du fond : ' + c);
}

/* ---------- Exports ---------- */
function reportSave(r) {
  if (r.status === 'saved') toast('Fichier enregistré : ' + r.name);
  else if (r.status === 'downloaded') toast('Téléchargement lancé : ' + r.name);
  else if (r.status === 'cancelled') toast('Export annulé.');
  else { console.error(r.error); toast("L'export n'a pas abouti : " + (r.error && r.error.message || r.error)); }
}
export async function exportRaster(type) {
  const g = R.getGrid(), src = R.getSource();
  if (!g) return;
  // carte graphique (par tuiles, rapide en grand format), sinon canvas 2D comme la référence
  let blob = null;
  if (session.get().rendu === 'gpu') {
    try { blob = await gpuRenderBlob(g, get(), src, type); } catch (e) { console.warn('Export GPU impossible :', e); }
  }
  if (!blob) blob = await E.renderBlob(g, get(), src, type);
  if (!blob) { toast("L'image est trop grande. Baisse la résolution d'export."); return; }
  const ext = type === 'jpeg' ? 'jpg' : 'png';
  reportSave(await saveFile(E.exportFileName(src.slug, ext), blob, ext));
}
export async function exportSVG() {
  const g = R.getGrid(), src = R.getSource();
  if (!g) return;
  reportSave(await saveFile(E.exportFileName(src.slug, 'svg'), E.buildSVG(g, get(), src), 'svg'));
}

/* ---------- Fenêtre Code ---------- */
const TABS = {
  html: { ext: 'html', build: (g, st, src) => E.buildHTML(g, st, src), hint: "Colle ce bloc dans ta page. Il charge la police Google et place chaque caractère sur une grille exacte." },
  svg: { ext: 'svg', build: (g, st, src) => E.buildSVG(g, st, src), hint: "SVG vectoriel à coller directement dans le HTML ou à enregistrer en .svg. Le texte reste éditable." },
  txt: { ext: 'txt', build: (g) => E.buildTXT(g), hint: "Texte seul, sans couleurs ni dégradé. Affiche-le dans une police à chasse fixe (<pre>) pour garder l'alignement." }
};
export function openSheet() { if (R.getGrid()) session.set({ sheetOpen: true }); }
export function closeSheet() { session.set({ sheetOpen: false }); }

// code de l'onglet demandé → { tab, code, size, hint, ht } (le texte brut n'existe pas en halftone)
export function buildCode(tab) {
  const g = R.getGrid();
  if (!g) return null;
  const ht = g.kind === 'halftone';
  if (ht && tab === 'txt') tab = 'html';
  const code = TABS[tab].build(g, get(), R.getSource());
  const kb = new Blob([code]).size / 1024;
  const what = ht ? `${E.fmt(g.count)} éléments halftone` : `${E.fmt(g.cols)} × ${E.fmt(g.rows)} caractères`;
  const size = `${what} · ${kb < 1024 ? Math.round(kb) + ' Ko' : (kb / 1024).toFixed(1).replace('.', ',') + ' Mo'}`;
  const hint = ht
    ? (tab === 'html' ? "Bloc HTML avec un SVG responsive : il prend la largeur de son conteneur et reste net à toutes les tailles." : "SVG vectoriel à coller dans le HTML ou à ouvrir dans Illustrator ou Figma : chaque point est une forme modifiable.")
    : TABS[tab].hint;
  return { tab, code, size, hint, ht };
}
export async function saveCode(tab, code) {
  const slug = R.getSource().slug;
  const data = tab === 'html' ? E.htmlPage(code, slug) : code;
  reportSave(await saveFile(E.exportFileName(slug, TABS[tab].ext), data, TABS[tab].ext));
}
