/* Détourage : retire le fond d'une couleur donnée (tolérance, bords adoucis),
   éventuellement seulement la partie reliée aux bords de l'image. */
import { clamp, hexToRgb, toHex, createCanvas } from './util.js';
import { getRawData, withImage } from './source.js';

// Couleur la plus fréquente sur le pourtour de l'image
export function detectBg(src) {
  const { data, width: w, height: h } = getRawData(src);
  const buckets = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128) return;
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    let b = buckets.get(k); if (!b) { b = [0, 0, 0, 0]; buckets.set(k, b); }
    b[0]++; b[1] += data[i]; b[2] += data[i + 1]; b[3] += data[i + 2];
  };
  const step = Math.max(1, Math.floor(Math.max(w, h) / 600));
  for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }
  let best = null;
  for (const b of buckets.values()) if (!best || b[0] > best[0]) best = b;
  if (!best) return '#ffffff';
  return toHex(Math.round(best[1] / best[0]), Math.round(best[2] / best[0]), Math.round(best[3] / best[0]));
}

// Rend { src, cutColor } : la source avec sa nouvelle image (détourée, ou brute si le détourage est coupé)
// et la couleur de fond utilisée (détectée si state.cutAuto). L'état n'est pas modifié.
export function applyCutout(state, src) {
  if (!state.cut) return { src: withImage(src, src.raw), cutColor: state.cutColor };
  const cutColor = state.cutAuto ? detectBg(src) : state.cutColor;
  const raw = getRawData(src);
  const w = raw.width, h = raw.height, n = w * h, d = raw.data;
  const [br, bg, bb] = hexToRgb(cutColor);
  const T = state.tol * 2.2, S = Math.max(0.001, state.soft * 2.2);
  // facteur d'opacité : 0 = fond, 1 = sujet
  const keep = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    keep[p] = dist <= T ? 0 : dist >= T + S ? 1 : (dist - T) / S;
  }
  if (state.flood) {
    // on ne retire que le fond connecté aux bords
    const seen = new Uint8Array(n), stack = new Int32Array(n);
    let sp = 0;
    const push = (p) => { if (!seen[p] && keep[p] < 1) { seen[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp], x = p % w;
      if (keep[p] > 0) continue; // bord adouci : atteint mais on ne propage pas au-delà
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < n - w) push(p + w);
    }
    for (let p = 0; p < n; p++) if (!seen[p]) keep[p] = 1;
  }
  const outData = new ImageData(w, h);
  const o = outData.data;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    o[i] = d[i]; o[i + 1] = d[i + 1]; o[i + 2] = d[i + 2]; o[i + 3] = d[i + 3] * keep[p];
  }
  const c = createCanvas(w, h);
  c.getContext('2d').putImageData(outData, 0, 0);
  return { src: withImage(src, c), cutColor };
}

// Vignette du détourage (300 px max) dans le canvas fourni
export function drawCutPreview(pv, image) {
  const k = Math.min(1, 300 / Math.max(image.width, image.height));
  pv.width = Math.max(1, Math.round(image.width * k)); pv.height = Math.max(1, Math.round(image.height * k));
  const ctx = pv.getContext('2d'); ctx.clearRect(0, 0, pv.width, pv.height);
  ctx.drawImage(image, 0, 0, pv.width, pv.height);
}

// Pipette : couleur de l'image brute à la position relative (fx, fy) entre 0 et 1
export function colorAt(src, fx, fy) {
  fx = clamp(fx, 0, 0.9999); fy = clamp(fy, 0, 0.9999);
  const { data, width: w, height: h } = getRawData(src);
  const i = ((Math.floor(fy * h) * w) + Math.floor(fx * w)) * 4;
  return toHex(data[i], data[i + 1], data[i + 2]);
}
