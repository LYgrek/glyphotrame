/* Effet caractères sur la carte graphique : atlas des glyphes dessinés par le canvas 2D, puis une
   instance par glyphe. Pour obtenir les mêmes pixels que le rendu canvas, l'atlas reproduit deux
   particularités du rendu de texte du navigateur, mesurées à l'exécution :
   - le placement : au quart de pixel horizontalement (seuils propres à chaque glyphe), au pixel
     entier verticalement (seuil commun) ;
   - le contraste de l'anticrénelage, qui dépend de la couleur du texte : la couleur, arrondie à
     3 bits par composante, tombe dans l'un de 8 niveaux, chacun avec ses propres masques. */
import { createCanvas, fontStr } from '../engine/index.js';

const PHASES = 4;    // positions horizontales au quart de pixel
const SAMPLES = 32;  // positions testées par passe de mesure

// empreinte du canal alpha d'une case d'une image
function cellHash(data, width, x0, y0, w, h) {
  let hh = 2166136261;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { hh ^= data[(y * width + x) * 4 + 3]; hh = Math.imul(hh, 16777619); }
  return hh >>> 0;
}

// dessine des glyphes dans une grille de cases et rend l'empreinte de chaque case
function renderCells(cells, cols, cw, ch, font, s) {
  const rows = Math.ceil(cells.length / cols);
  const c = createCanvas(cols * cw, rows * ch), x = c.getContext('2d', { willReadFrequently: true });
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  cells.forEach(([text, dx, dy, color], i) => {
    x.fillStyle = color || '#000';
    x.setTransform(s, 0, 0, s, (i % cols) * cw + dx, Math.floor(i / cols) * ch + dy);
    x.fillText(text, 0, 0);
  });
  const d = x.getImageData(0, 0, c.width, c.height).data;
  return cells.map((_, i) => cellHash(d, c.width, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));
}

// premier changement de rendu quand la position fractionnaire augmente (en deux passes), ou null
function boundary(texts, axis, m, font, s) {
  const at = (f) => (axis === 'x' ? [m.padL + f, m.padT] : [m.padL, m.padT + f]);
  const cells = [];
  for (const t of texts) for (let j = 0; j <= SAMPLES; j++) cells.push([t, ...at(j / SAMPLES)]);
  const h1 = renderCells(cells, SAMPLES + 1, m.cellW, m.cellH, font, s);
  const first = texts.map((_, i) => { for (let j = 1; j <= SAMPLES; j++) if (h1[i * (SAMPLES + 1) + j] !== h1[i * (SAMPLES + 1) + j - 1]) return j; return null; });
  // affinage : SAMPLES positions dans l'intervalle trouvé
  const fine = [];
  texts.forEach((t, i) => { const j = first[i] || 1; for (let k = 0; k <= SAMPLES; k++) fine.push([t, ...at((j - 1 + k / SAMPLES) / SAMPLES)]); });
  const h2 = renderCells(fine, SAMPLES + 1, m.cellW, m.cellH, font, s);
  return texts.map((_, i) => {
    if (first[i] === null) return null;
    for (let k = 1; k <= SAMPLES; k++) if (h2[i * (SAMPLES + 1) + k] !== h2[i * (SAMPLES + 1) + k - 1]) return (first[i] - 1 + (k - 0.5) / SAMPLES) / SAMPLES;
    return (first[i] - 0.5) / SAMPLES;
  });
}

// niveau de contraste (0 → 7) de chaque couleur arrondie, par comparaison avec les 8 gris
function contrastLevels(keys) {
  const gray = (l) => { const v = (l * 32).toString(16).padStart(2, '0'); return '#' + v + v + v; };
  const hex = (k) => '#' + k.toString(16).padStart(6, '0');
  const cells = [];
  for (let l = 0; l < 8; l++) cells.push(['@', 20, 20, gray(l)]);
  for (const k of keys) cells.push(['@', 20, 20, hex(k)]);
  const h = renderCells(cells, 32, 40, 40, '500 24px "Archivo", Arial, sans-serif', 1);
  const map = new Map();
  keys.forEach((k, i) => {
    let l = h.slice(0, 8).indexOf(h[8 + i]);
    if (l < 0) { const r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255; l = Math.min(7, Math.floor((0.2126 * r + 0.7152 * g + 0.0722 * b) / 32)); }
    map.set(k, l);
  });
  return map;
}

// Prépare l'atlas et les instances : { atlas, inst (ancrage x, y, case, seuil x, r, g, b), count }
export function prepareGlyphs(state, g, s, color, ink, maxTex) {
  const font = fontStr(state, state.size, state.weight);
  // glyphes et couleurs présents
  const index = new Map(), glyphs = [];
  const keyOf = (r, gg, b) => ((r & 0xE0) << 16) | ((gg & 0xE0) << 8) | (b & 0xE0);
  const inkRGB = ink.map((v) => Math.round(v * 255)), inkKey = keyOf(...inkRGB);
  const keys = new Set(color ? [] : [inkKey]);
  let count = 0;
  for (let i = 0; i < g.glyph.length; i++) {
    const ch = g.glyph[i];
    if (ch === ' ') continue;
    count++;
    if (!index.has(ch)) { index.set(ch, glyphs.length); glyphs.push(ch); }
    if (color) keys.add(keyOf(g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]));
  }
  const levelOf = contrastLevels([...keys]);
  const used = [...new Set(levelOf.values())].sort((a, b) => a - b), slotOf = new Map(used.map((l, i) => [l, i]));

  // taille des cases
  const m0 = createCanvas(4, 4).getContext('2d');
  m0.font = font; m0.textAlign = 'center'; m0.textBaseline = 'middle';
  let L = 0, R = 0, A = 0, D = 0;
  for (const ch of glyphs) {
    const t = m0.measureText(ch);
    L = Math.max(L, t.actualBoundingBoxLeft); R = Math.max(R, t.actualBoundingBoxRight);
    A = Math.max(A, t.actualBoundingBoxAscent); D = Math.max(D, t.actualBoundingBoxDescent);
  }
  const padL = Math.ceil(L * s) + 3, padT = Math.ceil(A * s) + 3;
  const cellW = padL + Math.ceil(R * s) + 3, cellH = padT + Math.ceil(D * s) + 3;
  const m = { padL, padT, cellW, cellH };
  let P = cellW <= 64 && cellH <= 64 ? PHASES : 1;

  // seuils de placement (petites tailles seulement)
  let ox = glyphs.map(() => 0), oy = 0;
  if (P > 1 && glyphs.length) {
    ox = boundary(glyphs, 'x', m, font, s).map((b) => (b === null ? 0 : b % (1 / PHASES)));
    const by = boundary([glyphs[0]], 'y', m, font, s)[0];
    oy = by === null ? 0 : by;
  }

  // atlas : glyphe × niveau de contraste × position horizontale
  const n = Math.max(1, glyphs.length * used.length * P);
  const cols = Math.max(1, Math.min(n, Math.floor(maxTex / cellW), Math.ceil(Math.sqrt(n * cellH / cellW))));
  const rows = Math.ceil(n / cols);
  const c = createCanvas(cols * cellW, Math.min(maxTex, rows * cellH)), x = c.getContext('2d');
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fy = P > 1 ? (oy + 0.5) % 1 : 0;
  glyphs.forEach((ch, gi) => used.forEach((l, li) => {
    const v = (l * 32).toString(16).padStart(2, '0');
    x.fillStyle = '#' + v + v + v;
    for (let k = 0; k < P; k++) {
      const cell = (gi * used.length + li) * P + k;
      const fx = P > 1 ? (ox[gi] + (k + 0.5) / PHASES) % 1 : 0;
      x.setTransform(s, 0, 0, s, (cell % cols) * cellW + padL + fx, Math.floor(cell / cols) * cellH + padT + fy);
      x.fillText(ch, 0, 0);
    }
  }));

  // instances
  const inst = new Float32Array(count * 7);
  let o = 0;
  for (let r = 0; r < g.rows; r++) {
    const y = (r + 0.5) * g.lh;
    for (let col = 0; col < g.cols; col++) {
      const i = r * g.cols + col, ch = g.glyph[i];
      if (ch === ' ') continue;
      const gi = index.get(ch);
      const rgb = color ? [g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]] : inkRGB;
      inst[o] = (col + 0.5) * g.cw; inst[o + 1] = y;
      inst[o + 2] = gi * used.length + slotOf.get(levelOf.get(keyOf(...rgb)));
      inst[o + 3] = ox[gi];
      inst[o + 4] = rgb[0] / 255; inst[o + 5] = rgb[1] / 255; inst[o + 6] = rgb[2] / 255;
      o += 7;
    }
  }
  return { atlas: { canvas: c, cellW, cellH, padL, padT, P, cols, oy }, inst, count };
}
