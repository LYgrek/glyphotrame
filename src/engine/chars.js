/* Effet caractères : jeu de caractères, densité d'encre des glyphes,
   table ton → caractère, grille de caractères et dessin. */
import { toHex, createCanvas } from './util.js';
import { FONTS } from './constants.js';
import { toneParams, sampleSource } from './tones.js';
import { neonLUT, neonInto, perCell } from './neon.js';

// Caractères uniques du jeu ; au moins 2 (l'espace sert aux zones vides)
export function getChars(state) {
  const s = state.custom;
  const arr = [];
  for (const ch of s) { if (ch !== ' ' && /\s/.test(ch)) continue; if (!arr.includes(ch)) arr.push(ch); }
  if (arr.length < 2) { if (!arr.includes(' ')) arr.unshift(' '); else arr.push('#'); }
  return arr;
}

export const fontStr = (state, size, weight) => { const f = FONTS[state.font]; return `${weight} ${size}px "${f.family}", ${f.fallback}`; };

// Charge la police pour ces caractères ; rend false si elle n'est pas prête (police de secours)
export async function ensureFont(state, chars) {
  const f = FONTS[state.font];
  const spec = `${state.weight} 40px "${f.family}"`;
  try { await document.fonts.load(spec, chars.join('')); } catch (e) { /* police de secours */ }
  try { return document.fonts.check(spec, chars.join('')); } catch (e) { return false; }
}

// canvas de mesure partagé (créé au premier usage)
let mcan = null, mctx = null;
function measureCtx() {
  if (!mcan) { mcan = createCanvas(); mctx = mcan.getContext('2d', { willReadFrequently: true }); }
  return mctx;
}

// Densité d'encre de chaque caractère : part de pixels couverts dans une case de 56 px
const densCache = new Map();
export const clearDensityCache = () => densCache.clear();
export function measureDensity(state, chars, cacheable) {
  const key = state.font + '|' + state.weight + '|' + chars.join('');
  if (densCache.has(key)) return densCache.get(key);
  const mctx = measureCtx();
  const S = 56; mcan.width = S; mcan.height = S;
  mctx.font = fontStr(state, 44, state.weight); mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillStyle = '#000';
  const d = chars.map((ch) => {
    if (ch === ' ') return 0;
    mctx.clearRect(0, 0, S, S); mctx.fillText(ch, S / 2, S / 2);
    const px = mctx.getImageData(0, 0, S, S).data; let sum = 0;
    for (let i = 3; i < px.length; i += 4) sum += px[i];
    return sum / (255 * S * S);
  });
  if (cacheable) densCache.set(key, d);
  return d;
}

// Table des 256 tons → caractère
export function buildLUT(state, chars, dens) {
  const n = chars.length, lut = new Array(256);
  if (state.sort) {
    const items = chars.map((c, i) => ({ c, d: dens[i] })).sort((a, b) => a.d - b.d);
    const min = items[0].d, span = (items[n - 1].d - min) || 1;
    // mélange densité mesurée + rang : fidèle aux tons tout en utilisant tout le jeu
    const keys = items.map((it, i) => 0.5 * ((it.d - min) / span) + 0.5 * (i / (n - 1)));
    let j = 0;
    for (let v = 0; v < 256; v++) {
      const t = v / 255;
      while (j < n - 1 && Math.abs(keys[j + 1] - t) <= Math.abs(keys[j] - t)) j++;
      lut[v] = items[j].c;
    }
  } else {
    for (let v = 0; v < 256; v++) lut[v] = chars[Math.min(n - 1, Math.floor(v * n / 256))];
  }
  return lut;
}

// Grille de caractères : un glyphe et une couleur par case
export function computeGrid(state, src, chars, lut) {
  const mctx = measureCtx();
  mctx.font = fontStr(state, state.size, state.weight);
  const vis = chars.filter(c => c !== ' ');
  let adv = 0; for (const c of vis) adv += mctx.measureText(c).width; adv /= (vis.length || 1);
  const cw = Math.max(1, adv + state.spacing);
  const lh = Math.max(1, state.size * state.leading / 100);
  const sw = src.image.width, sh = src.image.height;
  const cols = Math.max(2, Math.round(state.width / cw));
  const rows = Math.max(1, Math.round(cols * cw * (sh / sw) / lh));
  const { R, G, B, A } = sampleSource(src, cols, rows);
  const { adj, inv } = toneParams(state);
  const neon = state.mode === 'neon' ? neonLUT(state) : null;
  const n = cols * rows;
  const glyph = new Array(n), col = new Uint8ClampedArray(n * 3);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = A[i];
    // zones transparentes (fond détouré ou PNG transparent) : aucun caractère
    if (a < 0.03) { glyph[i] = ' '; continue; }
    const r = adj(R[i] / 255 / a), g = adj(G[i] / 255 / a), bl = adj(B[i] / 255 / a);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const ch = lut[Math.round((inv ? L : 1 - L) * Math.min(1, a) * 255)];
    glyph[i] = ch; if (ch !== ' ') count++;
    if (neon) neonInto(col, i * 3, r, g, bl, L, neon, state);
    else { col[i * 3] = r * 255; col[i * 3 + 1] = g * 255; col[i * 3 + 2] = bl * 255; }
  }
  return { kind: 'chars', cols, rows, cw, lh, glyph, col, count, W: Math.round(cols * cw), H: Math.round(rows * lh) };
}

export function drawGlyphs(ctx, g, state) {
  ctx.font = fontStr(state, state.size, state.weight); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const color = perCell(state);
  if (!color) ctx.fillStyle = state.ink;
  let last = -1;
  for (let r = 0; r < g.rows; r++) {
    const y = (r + 0.5) * g.lh;
    for (let x = 0; x < g.cols; x++) {
      const i = r * g.cols + x, ch = g.glyph[i];
      if (ch === ' ') continue;
      if (color) {
        const k = i * 3, key = (g.col[k] << 16) | (g.col[k + 1] << 8) | g.col[k + 2];
        if (key !== last) { ctx.fillStyle = toHex(g.col[k], g.col[k + 1], g.col[k + 2]); last = key; }
      }
      ctx.fillText(ch, (x + 0.5) * g.cw, y);
    }
  }
}
