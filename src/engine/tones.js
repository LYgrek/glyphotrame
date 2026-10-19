/* Tons : luminosité, contraste, inversion, et échantillonnage de l'image
   (grille de caractères, carte des tons du halftone). */
import { clamp, hexToRgb, lum, createCanvas } from './util.js';
import { neonLUT, neonInto } from './neon.js';

// Réglages de tons communs aux deux effets
export function toneParams(state) {
  const paper = hexToRgb(state.paper), ink = hexToRgb(state.ink);
  const autoInv = state.mode === 'mono' ? lum(ink) > lum(paper) : lum(paper) < 0.5;
  const inv = state.mode === 'cmyk' ? state.invert : autoInv !== state.invert;
  const fct = Math.tan((clamp(state.contrast, -95, 95) / 100 + 1) * Math.PI / 4);
  const b = state.bright / 200;
  return { inv, adj: (x) => clamp((x - 0.5) * fct + 0.5 + b, 0, 1) };
}

// canvas de travail partagé (créé au premier usage)
let scan = null, sctx = null;
function scratch() {
  if (!scan) { scan = createCanvas(); sctx = scan.getContext('2d', { willReadFrequently: true }); }
  return sctx;
}

// Moyenne pondérée par l'opacité de chaque case de la grille (3 × 3 échantillons par case)
let sampleCache = { key: '', data: null };
export function sampleSource(src, cols, rows) {
  const key = src.id + ':' + cols + 'x' + rows;
  if (sampleCache.key === key) return sampleCache.data;
  const sctx = scratch();
  const k = 3, sw = cols * k, sh = rows * k;
  scan.width = sw; scan.height = sh;
  sctx.clearRect(0, 0, sw, sh);
  sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src.image, 0, 0, sw, sh);
  const px = sctx.getImageData(0, 0, sw, sh).data;
  const n = cols * rows;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), A = new Float32Array(n);
  for (let y = 0; y < sh; y++) {
    const base = ((y / k) | 0) * cols;
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4, c = base + ((x / k) | 0), a = px[i + 3] / 255;
      R[c] += px[i] * a; G[c] += px[i + 1] * a; B[c] += px[i + 2] * a; A[c] += a;
    }
  }
  const inv = 1 / (k * k);
  for (let c = 0; c < n; c++) { R[c] *= inv; G[c] *= inv; B[c] *= inv; A[c] *= inv; }
  sampleCache = { key, data: { R, G, B, A } };
  return sampleCache.data;
}

// carte des tons : l'image réduite (moyenne propre) à environ un échantillon par demi-cellule
let toneCache = { key: '', px: null };
export function toneMap(state, src, W, H, step) {
  const tw = Math.max(2, Math.round(W / step)), th = Math.max(2, Math.round(H / step));
  const key = src.id + ':' + tw + 'x' + th;
  if (toneCache.key !== key) {
    let cur = src.image, cw = cur.width, ch = cur.height;
    while (cw / 2 > tw * 1.5 && ch / 2 > th * 1.5) {
      const c = createCanvas(Math.max(1, Math.round(cw / 2)), Math.max(1, Math.round(ch / 2)));
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height);
      cur = c; cw = c.width; ch = c.height;
    }
    const sctx = scratch();
    scan.width = tw; scan.height = th; sctx.clearRect(0, 0, tw, th);
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high'; sctx.drawImage(cur, 0, 0, tw, th);
    toneCache = { key, px: sctx.getImageData(0, 0, tw, th).data };
    sampleCache = { key: '', data: null };
  }
  const px = toneCache.px, n = tw * th;
  const D = new Float32Array(n), C = new Uint8ClampedArray(n * 3), A = new Float32Array(n);
  const { adj, inv } = toneParams(state);
  const neon = state.mode === 'neon' ? neonLUT(state) : null;
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255; A[i] = a;
    if (a < 0.03) continue;
    const r = adj(px[i * 4] / 255), g = adj(px[i * 4 + 1] / 255), b = adj(px[i * 4 + 2] / 255);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    D[i] = (inv ? L : 1 - L) * a;
    if (neon) neonInto(C, i * 3, r, g, b, L, neon, state);
    else { C[i * 3] = r * 255; C[i * 3 + 1] = g * 255; C[i * 3 + 2] = b * 255; }
  }
  const idx = (x, y) => clamp(Math.floor(x / W * tw), 0, tw - 1) + clamp(Math.floor(y / H * th), 0, th - 1) * tw;
  return { D, C, A, idx };
}
