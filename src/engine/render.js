/* Calcul et composition du rendu canvas 2D : grille de l'effet, puis fond, calque de l'effet,
   dégradé (photo / papier / effet masqués), lueur et effets d'écran.
   Sert à l'aperçu et aux exports PNG / JPEG. */
import { createCanvas } from './util.js';
import { photoSource } from './source.js';
import { getChars, ensureFont, measureDensity, buildLUT, computeGrid, drawGlyphs } from './chars.js';
import { computeHalftone, drawHalftone } from './halftone.js';
import { ONE, isVector, gradGeom, maskStops, maskCanvas, weightField, gradMasks } from './gradient.js';
import { paintGlow, postFX } from './postfx.js';

// Calcule la grille de l'effet. Rend { grid, ready } (ready = false si la police n'était pas
// encore chargée : il faudra recalculer), ou null si isStale() devient vrai pendant l'attente.
export async function compute(state, src, isStale = () => false) {
  if (state.effect === 'halftone') return { grid: computeHalftone(state, src), ready: true };
  const chars = getChars(state);
  const ready = await ensureFont(state, chars);
  if (isStale()) return null;
  const dens = measureDensity(state, chars, ready);
  const lut = buildLUT(state, chars, dens);
  return { grid: computeGrid(state, src, chars, lut), ready };
}

export const drawEffect = (ctx, g, state) => g.kind === 'halftone' ? drawHalftone(ctx, g, state) : drawGlyphs(ctx, g, state);

// calque peint dans un canvas de travail, masqué par le dégradé, puis posé sur ctx
let tmpCan = null;
function maskedLayer(ctx, state, W, H, fn, paint, maxDim, op) {
  if (!fn) return;
  if (!tmpCan) tmpCan = createCanvas();
  if (tmpCan.width !== W) tmpCan.width = W;
  if (tmpCan.height !== H) tmpCan.height = H;
  const lc = tmpCan.getContext('2d');
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, W, H);
  paint(lc);
  lc.setTransform(1, 0, 0, 1, 0, 0);
  if (fn !== ONE) {
    lc.globalCompositeOperation = 'destination-in';
    if (isVector(state)) {
      const G = gradGeom(state, W, H);
      const gr = G.type === 'radial' ? lc.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, G.r) : lc.createLinearGradient(G.x1, G.y1, G.x2, G.y2);
      for (const s of maskStops(state, fn)) gr.addColorStop(s.t, `rgba(0,0,0,${s.a})`);
      lc.fillStyle = gr; lc.fillRect(0, 0, W, H);
    } else {
      lc.imageSmoothingEnabled = true; lc.imageSmoothingQuality = 'high';
      lc.drawImage(maskCanvas(weightField(state, W, H, maxDim), fn), 0, 0, W, H);
    }
    lc.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = op || 'source-over'; ctx.drawImage(tmpCan, 0, 0); ctx.globalCompositeOperation = 'source-over';
}

// Dessine le rendu complet dans ctx (le canvas est redimensionné à la taille de la grille × s).
// opaque : fond plein même si le fond transparent est demandé (JPEG).
// maxDim : définition des masques de dégradé vague / libre (aperçu 760, 320 pendant un glissement ; export 1400).
let glyphCache = { g: null, c: null };
export function draw(ctx, g, state, src, s, opaque, maxDim = 1400) {
  const c = ctx.canvas;
  c.width = Math.max(1, Math.round(g.W * s)); c.height = Math.max(1, Math.round(g.H * s));
  const W = c.width, H = c.height;
  const solid = opaque || !state.transparent;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  if (solid) { ctx.fillStyle = state.paper; ctx.fillRect(0, 0, W, H); }
  // calque de l'effet ; à l'échelle 1 (aperçu) il est gardé en cache : bouger le dégradé ou les effets d'écran ne le redessine pas
  let eff;
  if (s === 1 && glyphCache.g === g && glyphCache.c.width === W) eff = glyphCache.c;
  else {
    eff = createCanvas(W, H);
    const ec = eff.getContext('2d'); ec.setTransform(s, 0, 0, s, 0, 0); drawEffect(ec, g, state);
    if (s === 1) glyphCache = { g, c: eff };
  }
  const glow = state.fxGlow > 0;
  if (!state.grad) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(eff, 0, 0);
    if (glow) { ctx.globalCompositeOperation = 'lighter'; paintGlow(ctx, eff, s, W, H, state); ctx.globalCompositeOperation = 'source-over'; }
  } else {
    const m = gradMasks(state, solid);
    maskedLayer(ctx, state, W, H, m.photo, (lc) => { lc.imageSmoothingQuality = 'high'; lc.drawImage(photoSource(state, src), 0, 0, W, H); }, maxDim);
    maskedLayer(ctx, state, W, H, m.paper, (lc) => { lc.fillStyle = state.paper; lc.fillRect(0, 0, W, H); }, maxDim);
    maskedLayer(ctx, state, W, H, m.glyph, (lc) => lc.drawImage(eff, 0, 0), maxDim);
    if (glow) maskedLayer(ctx, state, W, H, m.glyph, (lc) => paintGlow(lc, eff, s, W, H, state), maxDim, 'lighter');
  }
  postFX(ctx, g, state, s, W, H, solid);
}

// Image d'origine à la taille du résultat (vue avant / après) ; détourée si le détourage est actif
export function drawOrig(canvas, g, state, src) {
  if (canvas.width !== g.W) canvas.width = g.W;
  if (canvas.height !== g.H) canvas.height = g.H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, g.W, g.H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.cut ? src.image : src.raw, 0, 0, g.W, g.H);
}

// Export PNG / JPEG à la résolution state.scale ; rend un Blob, ou null si l'image est trop grande
export function renderBlob(g, state, src, type) {
  const c = createCanvas();
  draw(c.getContext('2d'), g, state, src, state.scale, type === 'jpeg');
  return new Promise((r) => c.toBlob(r, type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92));
}
