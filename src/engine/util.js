/* Outils communs du moteur, repris tels quels de la référence. */

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export const toHex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
export const esc = (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;
export const fmt = (n) => n.toLocaleString('fr-FR');
export const round2 = (n) => Math.round(n * 100) / 100;
export const round3 = (n) => Math.round(n * 1000) / 1000;
export const r1 = (n) => Math.round(n * 10) / 10;

// bruit pseudo-aléatoire déterministe : mêmes (i, j, k) → même valeur entre 0 et 1
export const rnd = (i, j, k) => { const t = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return t - Math.floor(t); };

// Tous les canvas du moteur passent par ici (phase 3 : OffscreenCanvas dans un Web Worker).
// Sans dimensions, le canvas garde la taille par défaut (300 × 150), comme dans la référence.
export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  if (w !== undefined) c.width = w;
  if (h !== undefined) c.height = h;
  return c;
}
