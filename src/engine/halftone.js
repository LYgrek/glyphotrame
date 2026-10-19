/* Effet halftone : points (9 formes, grille carrée ou hexagonale), lignes,
   pointillisme, et CMJN (une trame par encre). */
import { rnd, toHex } from './util.js';
import { PLATES } from './constants.js';
import { toneMap } from './tones.js';
import { perCell } from './neon.js';

export function computeHalftone(state, src) {
  const W = Math.round(state.width), H = Math.max(1, Math.round(state.width * src.image.height / src.image.width));
  const T = toneMap(state, src, W, H, Math.max(1, state.htCell / 2));
  const cmyk = state.mode === 'cmyk';
  const out = { kind: 'halftone', W, H, count: 0, plates: [], cmyk, color: perCell(state), type: state.htType, shape: state.htShape };
  const plates = cmyk ? PLATES : [{ ch: 'd', color: null, angle: 0 }];
  plates.forEach((pl, pi) => {
    const dAt = pl.ch === 'd' ? (i) => T.D[i] : (i) => {
      const r = T.C[i * 3] / 255, g = T.C[i * 3 + 1] / 255, b = T.C[i * 3 + 2] / 255, k = 1 - Math.max(r, g, b);
      let v;
      if (pl.ch === 'k') v = k;
      else { const den = 1 - k || 1; v = pl.ch === 'c' ? (1 - r - k) / den : pl.ch === 'm' ? (1 - g - k) / den : (1 - b - k) / den; }
      if (state.invert) v = 1 - v;
      return v * T.A[i];
    };
    const items = genItems(state, W, H, T, dAt, state.htAngle + pl.angle, pi * 13);
    out.plates.push({ color: pl.color, items }); out.count += items.length;
  });
  return out;
}

export function genItems(state, W, H, T, dAt, angleDeg, seed) {
  const cell = state.htCell, a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const mn = state.htMin / 100, mx = state.htMax / 100, items = [];
  const keepCol = perCell(state);
  const colOf = (k) => keepCol ? [T.C[k * 3], T.C[k * 3 + 1], T.C[k * 3 + 2]] : null;
  const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2 + cell;
  if (state.htType === 'points') {
    const hex = state.htGrid === 'hexa', rowH = hex ? cell * 0.8660254 : cell;
    const nj = Math.ceil(R / rowH), ni = Math.ceil(R / cell) + 1, jit = state.htJit / 100 * cell;
    for (let j = -nj; j <= nj; j++) for (let i = -ni; i <= ni; i++) {
      let u = i * cell + (hex && (j & 1) ? cell / 2 : 0), v = j * rowH;
      if (jit) { u += (rnd(i, j, seed + 1) - 0.5) * jit; v += (rnd(j, i, seed + 2) - 0.5) * jit; }
      const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
      if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
      const k = T.idx(x, y), d = dAt(k);
      if (d < 0.004) continue;
      const s = cell / 2 * (mn + (mx - mn) * Math.sqrt(d));
      if (s < 0.25) continue;
      items.push({ x, y, s, a, col: colOf(k) });
    }
  } else if (state.htType === 'lignes') {
    const nj = Math.ceil(R / cell), step = Math.max(1.5, cell / 3);
    const amp = state.htAmp / 100 * cell * 1.5, wl = state.htAmp > 0 ? (2 * R) / state.htFreq : 0;
    for (let j = -nj; j <= nj; j++) {
      let top = [], bot = [], prev = null;
      const flush = () => { if (top.length >= 2) items.push({ poly: top.concat(bot.reverse()), col: null }); top = []; bot = []; prev = null; };
      for (let u = -R; u <= R + step; u += step) {
        const ph = wl ? 2 * Math.PI * u / wl : 0;
        const v = j * cell + (wl ? amp * Math.sin(ph) : 0);
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (x < -step || y < -step || x > W + step || y > H + step) { flush(); continue; }
        const k = T.idx(x, y), d = dAt(k);
        const h = d < 0.004 ? 0 : cell / 2 * (mn + (mx - mn) * d);
        if (h < 0.15) { flush(); continue; }
        const dv = wl ? amp * 2 * Math.PI / wl * Math.cos(ph) : 0;
        let tx = ca - sa * dv, ty = sa + ca * dv; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
        const t = [x - ty * h, y + tx * h], b = [x + ty * h, y - tx * h];
        if (keepCol) {
          const col = colOf(k);
          if (prev) items.push({ poly: [prev.t, t, b, prev.b], col: prev.col });
          prev = { t, b, col };
        } else { top.push(t); bot.push(b); }
      }
      flush();
    }
  } else {
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), rad = cell / 2 * mx;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = (i + rnd(i, j, seed + 3)) * cell, y = (j + rnd(i, j, seed + 4)) * cell;
      if (x > W || y > H) continue;
      const k = T.idx(x, y), d = dAt(k);
      if (d < 0.004 || rnd(i, j, seed + 5) >= d) continue;
      items.push({ x, y, s: state.htVar ? rad * (0.35 + 0.65 * Math.sqrt(d)) : rad, a: 0, col: colOf(k), dot: true });
    }
  }
  return items;
}

// Formes : surfaces équivalentes à un disque de rayon s, orientées selon l'angle de trame
export function regPoly(x, y, R, n, rot) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = rot + i * 2 * Math.PI / n; pts.push([x + R * Math.cos(t), y + R * Math.sin(t)]); }
  return pts;
}
export function rotPts(x, y, a, rel) {
  const c = Math.cos(a), s = Math.sin(a);
  return rel.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}
export function itemShape(g, it) {
  if (it.poly) return { type: 'poly', pts: it.poly };
  const { x, y, s, a } = it;
  if (it.dot) return { type: 'circle', x, y, r: s };
  switch (g.shape) {
    case 'carre': return { type: 'poly', pts: regPoly(x, y, s * 1.2533, 4, a + Math.PI / 4) };
    case 'losange': return { type: 'poly', pts: regPoly(x, y, s * 1.2533, 4, a) };
    case 'ellipse': return { type: 'ellipse', x, y, rx: s * 1.35, ry: s * 0.74, a };
    case 'triangle': return { type: 'poly', pts: regPoly(x, y, s * 1.5551, 3, a - Math.PI / 2) };
    case 'hexagone': return { type: 'poly', pts: regPoly(x, y, s * 1.0996, 6, a) };
    case 'croix': { const L = s * 1.45, w = s * 0.52; return { type: 'poly', pts: rotPts(x, y, a, [[-w, -L], [w, -L], [w, -w], [L, -w], [L, w], [w, w], [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w]]) }; }
    case 'etoile': { const pts = [], Ro = s * 1.75, Ri = Ro * 0.42; for (let i = 0; i < 10; i++) { const t = a - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? Ri : Ro; pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]); } return { type: 'poly', pts }; }
    case 'tiret': { const L = s * 1.6, w = s * 0.49; return { type: 'poly', pts: rotPts(x, y, a, [[-L, -w], [L, -w], [L, w], [-L, w]]) }; }
    default: return { type: 'circle', x, y, r: s };
  }
}

// ajoute la forme au chemin en cours du contexte canvas
export function addShape(ctx, sh) {
  if (sh.type === 'circle') { ctx.moveTo(sh.x + sh.r, sh.y); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2); }
  else if (sh.type === 'ellipse') { ctx.moveTo(sh.x + sh.rx * Math.cos(sh.a), sh.y + sh.rx * Math.sin(sh.a)); ctx.ellipse(sh.x, sh.y, sh.rx, sh.ry, sh.a, 0, Math.PI * 2); }
  else { const p = sh.pts; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
}

export function drawHalftone(ctx, g, state) {
  for (const pl of g.plates) {
    if (g.cmyk || !g.color) {
      ctx.globalCompositeOperation = g.cmyk ? 'multiply' : 'source-over';
      ctx.fillStyle = g.cmyk ? pl.color : state.ink;
      ctx.beginPath(); for (const it of pl.items) addShape(ctx, itemShape(g, it)); ctx.fill();
    } else {
      for (const it of pl.items) { ctx.fillStyle = toHex(it.col[0], it.col[1], it.col[2]); ctx.beginPath(); addShape(ctx, itemShape(g, it)); ctx.fill(); }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
