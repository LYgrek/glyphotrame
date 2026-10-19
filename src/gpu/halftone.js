/* Données GPU d'une grille halftone, calculées depuis les éléments du moteur (mêmes positions,
   tailles et couleurs que l'export SVG) : une instance par point, ou un maillage pour les lignes. */
import { itemShape } from '../engine/index.js';

// forme commune à toute une encre (même angle) : disque, ellipse ou polygone en coordonnées unitaires
function shapeOf(g, it) {
  if (!it) return { kind: 0, extent: 1 };
  const sh = itemShape(g, { ...it, x: 0, y: 0, s: 1 });
  if (sh.type === 'circle') return { kind: 0, extent: 1 };
  if (sh.type === 'ellipse') return { kind: 1, ell: [sh.rx, sh.ry], rot: [Math.cos(sh.a), Math.sin(sh.a)], extent: Math.max(sh.rx, sh.ry) };
  const v = new Float32Array(24);
  let extent = 0;
  sh.pts.forEach((p, i) => { v[i * 2] = p[0]; v[i * 2 + 1] = p[1]; extent = Math.max(extent, Math.hypot(p[0], p[1])); });
  return { kind: 2, v, n: sh.pts.length, extent };
}

// lignes : chaque bande (haut + bas inversé) devient une suite de triangles ; en couleurs, des quadrilatères
function linesMesh(items) {
  let n = 0;
  for (const it of items) n += it.poly.length === 4 && it.col ? 6 : (it.poly.length / 2 - 1) * 6;
  const out = new Float32Array(n * 5);
  let o = 0;
  const put = (p, c) => { out[o++] = p[0]; out[o++] = p[1]; out[o++] = c[0]; out[o++] = c[1]; out[o++] = c[2]; };
  const none = [0, 0, 0];
  for (const it of items) {
    const P = it.poly;
    if (it.col) {
      const c = [it.col[0] / 255, it.col[1] / 255, it.col[2] / 255];
      put(P[0], c); put(P[1], c); put(P[2], c); put(P[0], c); put(P[2], c); put(P[3], c);
      continue;
    }
    const m = P.length, k = m / 2;
    for (let i = 0; i < k - 1; i++) {
      const t0 = P[i], t1 = P[i + 1], b0 = P[m - 1 - i], b1 = P[m - 2 - i];
      put(t0, none); put(t1, none); put(b0, none); put(t1, none); put(b1, none); put(b0, none);
    }
  }
  return { data: out, count: n };
}

// par encre : { color, mesh } (lignes) ou { color, inst, count, shape } (points)
export function halftoneData(g) {
  return g.plates.map((pl) => {
    if (g.type === 'lignes') return { color: pl.color, mesh: linesMesh(pl.items) };
    const n = pl.items.length, inst = new Float32Array(n * 6);
    for (let i = 0, o = 0; i < n; i++, o += 6) {
      const it = pl.items[i];
      inst[o] = it.x; inst[o + 1] = it.y; inst[o + 2] = it.s;
      if (it.col) { inst[o + 3] = it.col[0] / 255; inst[o + 4] = it.col[1] / 255; inst[o + 5] = it.col[2] / 255; }
    }
    return { color: pl.color, inst, count: n, shape: shapeOf(g, pl.items[0]) };
  });
}
