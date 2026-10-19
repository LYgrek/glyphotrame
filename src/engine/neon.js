/* Couleurs néon : palette ombres → milieux → lumières selon la luminosité,
   mélangée aux couleurs de l'image ravivées (saturation, éclat). */
import { clamp, hexToRgb } from './util.js';

// Couleurs par case / point : couleurs de l'image ou palette néon
export const perCell = (state) => state.mode === 'color' || state.mode === 'neon';

// Palette néon : dégradé ombres → milieux → lumières appliqué selon la luminosité
let neonCache = { key: '', lut: null };
export function neonLUT(state) {
  const key = state.neonA + state.neonB + state.neonC + state.neonMid;
  if (neonCache.key === key) return neonCache.lut;
  const A = hexToRgb(state.neonA), B = hexToRgb(state.neonB), C = hexToRgb(state.neonC), m = clamp(state.neonMid / 100, 0.05, 0.95);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = v / 255, [P, Q, f] = t < m ? [A, B, t / m] : [B, C, (t - m) / (1 - m)];
    for (let c = 0; c < 3; c++) lut[v * 3 + c] = P[c] + (Q[c] - P[c]) * f;
  }
  neonCache = { key, lut };
  return lut;
}

// h en sixièmes de tour (0 → 6), s et v entre 0 et 1
export function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

// Couleur néon d'un point : palette, couleurs de l'image ravivées, ou mélange des deux.
// Écrit r, g, b (0 → 255) dans out[o..o+2].
export function neonInto(out, o, r, g, b, L, lut, state) {
  const q = Math.round(L * 255) * 3;
  let pr = lut[q], pg = lut[q + 1], pb = lut[q + 2];
  const mix = state.neonMix / 100;
  if (mix > 0) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 0) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = Math.min(1, (mx ? d / mx : 0) * state.neonSat / 100);
    const v = mx + (1 - mx) * state.neonPop / 100;
    const [ir, ig, ib] = hsv2rgb(h, s, v);
    pr += (ir * 255 - pr) * mix; pg += (ig * 255 - pg) * mix; pb += (ib * 255 - pb) * mix;
  }
  out[o] = pr; out[o + 1] = pg; out[o + 2] = pb;
}
