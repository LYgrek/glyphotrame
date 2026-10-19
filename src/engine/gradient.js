/* Dégradé : l'effet passe progressivement à l'image d'origine.
   Formes : droite (dégradé vectoriel linéaire ou radial), vague, courbe libre (tracé plume).
   w = poids de l'effet (1 = effet complet, 0 = image intacte), selon la position t (0 → 1) le long du dégradé. */
import { clamp, round2, round3, createCanvas } from './util.js';
import { pathValid, pathInside } from './penpath.js';

// masque « tout » (calque affiché sans masque)
export const ONE = 'one';

// Courbe de progression (state.gCurve = [x1, y1, x2, y2]), tabulée sur 257 valeurs
let profLUT = null, profKey = '';
function profileLUT(curve) {
  const key = curve.join(',');
  if (key !== profKey) {
    const [x1, y1, x2, y2] = curve;
    const bx = (s) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
    const by = (s) => (1 - s) ** 3 + 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2;
    profLUT = new Float32Array(257);
    for (let k = 0; k <= 256; k++) {
      const x = k / 256; let lo = 0, hi = 1;
      for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
      profLUT[k] = clamp(by((lo + hi) / 2), 0, 1);
    }
    profKey = key;
  }
  return profLUT;
}
function sampleLUT(lut, u) {
  if (u <= 0) return lut[0];
  if (u >= 1) return lut[256];
  const f = u * 256, i = f | 0;
  return lut[i] + (lut[i + 1] - lut[i]) * (f - i);
}
// intensité de l'effet à la position u de la transition (0 = début, côté effet ; 1 = fin, côté original)
export const profile = (curve, u) => sampleLUT(profileLUT(curve), u);

export const invW = (state, w) => state.gInvert ? 1 - w : w;

// u = position dans la zone de transition (0 = début, côté effet ; 1 = fin, côté original)
export function uFromT(state, t) {
  const p = state.gPos / 100, h = state.gSoft / 200;
  if (h < 0.001) return t < p ? 0 : 1;
  return (t - (p - h)) / (2 * h);
}

// points du dégradé pour la forme « droite » (dégradés vectoriels CSS / SVG / canvas)
export function gradPoints(state) {
  const p = state.gPos / 100, h = state.gSoft / 200, c = state.gCurve;
  if (h < 0.001) return [{ t: 0, w: invW(state, 1) }, { t: p, w: invW(state, 1) }, { t: p, w: invW(state, 0) }, { t: 1, w: invW(state, 0) }];
  const a = p - h, b = p + h;
  const pts = [{ t: 0, w: invW(state, profile(c, uFromT(state, 0))) }];
  for (let i = 0; i <= 48; i++) { const t = a + (b - a) * i / 48; if (t > 0 && t < 1) pts.push({ t, w: invW(state, profile(c, i / 48)) }); }
  pts.push({ t: 1, w: invW(state, profile(c, uFromT(state, 1))) });
  return pts;
}

export const isVector = (state) => state.gShape === 'droite';

// Champ d'intensité de l'effet (0 → 1) calculé pixel par pixel, pour les formes vague et libre
let fieldCache = { key: '', data: null };
export function weightField(state, W, H, maxDim) {
  const k = Math.min(1, maxDim / Math.max(W, H));
  const mw = Math.max(1, Math.round(W * k)), mh = Math.max(1, Math.round(H * k));
  const key = [mw, mh, W, H, state.gShape, state.gType, state.gAngle, state.gPos, state.gSoft, state.gInvert,
    state.gAmp, state.gFreq, state.gPhase, state.gCurve.join(','), JSON.stringify(state.gPath)].join('|');
  if (fieldCache.key === key) return fieldCache.data;
  const f = new Float32Array(mw * mh), sx = W / mw, sy = H / mh;
  const lut = profileLUT(state.gCurve), inv = state.gInvert;
  const w = (u) => { const v = sampleLUT(lut, u); return inv ? 1 - v : v; };
  if (state.gShape === 'libre') {
    if (!pathValid(state.gPath)) f.fill(invW(state, 1));
    else { const ins = pathInside(state.gPath, state.gSoft, mw, mh); for (let i = 0; i < f.length; i++) f[i] = w(1 - ins[i]); }
  } else {
    const amp = state.gAmp / 100 * 0.25, ph = state.gPhase * Math.PI / 180, wave = state.gShape === 'vague';
    if (state.gType === 'radial') {
      const R = Math.hypot(W, H) / 2, n = Math.max(1, Math.round(state.gFreq));
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const rx = (x + 0.5) * sx - W / 2, ry = (y + 0.5) * sy - H / 2;
        let t = Math.hypot(rx, ry) / R;
        if (wave) t += amp * Math.sin(n * Math.atan2(ry, rx) + ph);
        f[y * mw + x] = w(uFromT(state, t));
      }
    } else {
      const th = state.gAngle * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th);
      const L = (Math.abs(W * dx) + Math.abs(H * dy)) / 2 || 1, Lp = (Math.abs(W * dy) + Math.abs(H * dx)) / 2 || 1;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const rx = (x + 0.5) * sx - W / 2, ry = (y + 0.5) * sy - H / 2;
        let t = ((rx * dx + ry * dy) / L + 1) / 2;
        if (wave) t += amp * Math.sin(2 * Math.PI * state.gFreq * (((ry * dx - rx * dy) / Lp + 1) / 2) + ph);
        f[y * mw + x] = w(uFromT(state, t));
      }
    }
  }
  fieldCache = { key, data: { mw, mh, f } };
  return fieldCache.data;
}

// masque en image : blanc, opacité = fn(poids)
export function maskCanvas(field, fn) {
  const { mw, mh, f } = field;
  const c = createCanvas(mw, mh);
  const ctx = c.getContext('2d'), img = ctx.createImageData(mw, mh), d = img.data;
  for (let i = 0, j = 0; i < f.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = fn(f[i]) * 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}
export const maskDataURL = (state, fn, W, H) => maskCanvas(weightField(state, W, H, 1400), fn).toDataURL('image/png');

// masques des trois couches : photo d'origine, papier, caractères
export function gradMasks(state, solid) {
  const fondu = state.gStyle === 'fondu';
  return {
    photo: solid ? ONE : (fondu ? (w) => 1 - w : (w) => clamp(2 - 2 * w, 0, 1)),
    paper: solid ? (fondu ? (w) => w : (w) => clamp(2 * w - 1, 0, 1)) : null,
    glyph: fondu ? (w) => w : (w) => clamp(2 * w, 0, 1)
  };
}

export const maskStops = (state, fn) => gradPoints(state).map(p => ({ t: round3(clamp(p.t, 0, 1)), a: round3(fn(p.w)) }));

export function gradGeom(state, W, H) {
  if (state.gType === 'radial') return { type: 'radial', cx: W / 2, cy: H / 2, r: Math.hypot(W, H) / 2 };
  const th = state.gAngle * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th);
  const L = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  return { type: 'linear', x1: W / 2 - dx * L, y1: H / 2 - dy * L, x2: W / 2 + dx * L, y2: H / 2 + dy * L };
}

export function cssGradient(state, fn) {
  const stops = maskStops(state, fn).map(s => `rgba(0,0,0,${s.a}) ${round2(s.t * 100)}%`).join(',');
  return state.gType === 'radial'
    ? `radial-gradient(circle farthest-corner at 50% 50%,${stops})`
    : `linear-gradient(${(state.gAngle + 90) % 360}deg,${stops})`;
}
