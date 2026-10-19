/* Tracé à la plume : courbes de Bézier (points d'ancrage + poignées), ouvert ou fermé.
   nœud : { x, y, hin: [dx, dy], hout: [dx, dy], smooth } en coordonnées relatives (0 → 1)
   tracé : { closed, nodes }

   Géométrie et masque utilisés par le dégradé « courbe libre », puis opérations d'édition
   (sans modifier le tracé reçu : elles rendent un nouveau tracé) et détection au pointeur
   pour l'outil plume de l'interface. `rect` = taille affichée de l'aperçu ({ width, height }). */
import { clamp, round3, createCanvas } from './util.js';

export const segCount = (path) => { const n = path.nodes.length; return n < 2 ? 0 : path.closed ? n : n - 1; };

export function segPts(path, i, W, H) {
  const N = path.nodes, a = N[i], b = N[(i + 1) % N.length];
  return [[a.x * W, a.y * H], [(a.x + a.hout[0]) * W, (a.y + a.hout[1]) * H], [(b.x + b.hin[0]) * W, (b.y + b.hin[1]) * H], [b.x * W, b.y * H]];
}

export function bez(P, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
}

export function flattenPath(path, W, H, steps = 28) {
  const out = [], n = segCount(path);
  if (!n) return out;
  out.push([path.nodes[0].x * W, path.nodes[0].y * H]);
  for (let i = 0; i < n; i++) { const P = segPts(path, i, W, H); for (let k = 1; k <= steps; k++) out.push(bez(P, k / steps)); }
  return out;
}

export const pathValid = (path) => path.closed ? path.nodes.length >= 2 : path.nodes.length >= 2;

// polygone à remplir : la forme fermée, ou pour un tracé ouvert le côté gauche du tracé prolongé jusqu'aux bords
export function pathPolygon(path, W, H) {
  const P = flattenPath(path, W, H);
  if (path.closed) return P;
  const BIG = 6 * (W + H), n = P.length;
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  let k = 1; while (k < n - 1 && Math.hypot(P[k][0] - P[0][0], P[k][1] - P[0][1]) < 1e-6) k++;
  let j = n - 2; while (j > 0 && Math.hypot(P[n - 1][0] - P[j][0], P[n - 1][1] - P[j][1]) < 1e-6) j--;
  const ds = dir(P[0], P[k]), de = dir(P[j], P[n - 1]);
  const S = [P[0][0] - ds[0] * BIG, P[0][1] - ds[1] * BIG], E = [P[n - 1][0] + de[0] * BIG, P[n - 1][1] + de[1] * BIG];
  // normale « gauche » (au-dessus quand on trace de gauche à droite)
  const El = [E[0] + de[1] * BIG, E[1] - de[0] * BIG], Sl = [S[0] + ds[1] * BIG, S[1] - ds[0] * BIG];
  return [S, ...P, E, El, Sl];
}

// flou boîte séparable (3 passes ≈ flou gaussien), en place
export function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = -r; x <= r; x++) s += a[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) { tmp[o + x] = s / (2 * r + 1); s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
  }
}

// masque « intérieur » du tracé : 1 côté effet, 0 côté original, adouci selon la largeur du fondu (gSoft)
export function pathInside(path, gSoft, mw, mh) {
  const c = createCanvas(mw, mh);
  const x = c.getContext('2d', { willReadFrequently: true }), poly = pathPolygon(path, mw, mh);
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) x.lineTo(poly[i][0], poly[i][1]);
  x.closePath(); x.fill();
  const px = x.getImageData(0, 0, mw, mh).data, a = new Float32Array(mw * mh);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
  const r = Math.round(gSoft / 200 * Math.hypot(mw, mh) * 0.5);
  if (r >= 1) boxBlur(a, mw, mh, r);
  return a;
}

/* ---------- Édition ---------- */
export const clonePath = (path) => JSON.parse(JSON.stringify(path));
export const hasH = (h) => Math.abs(h[0]) + Math.abs(h[1]) > 1e-6;
export const pxLen = (v, rect) => Math.hypot(v[0] * rect.width, v[1] * rect.height);

// contraint un vecteur relatif à un multiple de 45° à l'écran
export function constrain45(v, rect) {
  const px = v[0] * rect.width, py = v[1] * rect.height, L = Math.hypot(px, py);
  const a = Math.round(Math.atan2(py, px) / (Math.PI / 4)) * (Math.PI / 4);
  return [L * Math.cos(a) / rect.width, L * Math.sin(a) / rect.height];
}

// détection de ce qui est sous le pointeur p (relatif), tolérance en pixels écran
export function hitAnchor(path, p, rect, tol = 8) {
  let best = -1, bd = tol;
  path.nodes.forEach((n, i) => { const d = Math.hypot((n.x - p[0]) * rect.width, (n.y - p[1]) * rect.height); if (d <= bd) { bd = d; best = i; } });
  return best;
}
export function hitKnob(path, selNode, p, rect, tol = 7) {
  if (selNode < 0 || selNode >= path.nodes.length) return null;
  const n = path.nodes[selNode];
  for (const side of ['hout', 'hin']) {
    if (!hasH(n[side])) continue;
    if (Math.hypot((n.x + n[side][0] - p[0]) * rect.width, (n.y + n[side][1] - p[1]) * rect.height) <= tol) return { i: selNode, side };
  }
  return null;
}
export function hitSegment(path, p, rect, tol = 7) {
  let best = null, bd = tol;
  for (let s = 0; s < segCount(path); s++) {
    const P = segPts(path, s, 1, 1);
    for (let k = 1; k < 60; k++) {
      const t = k / 60, q = bez(P, t), d = Math.hypot((q[0] - p[0]) * rect.width, (q[1] - p[1]) * rect.height);
      if (d < bd) { bd = d; best = { seg: s, t }; }
    }
  }
  return best;
}

// ajoute un point sur un segment sans changer la forme (découpe de De Casteljau) → { path, index }
export function insertAt(path, seg, t) {
  path = clonePath(path);
  const N = path.nodes, a = N[seg], b = N[(seg + 1) % N.length], P = segPts(path, seg, 1, 1);
  const L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const p01 = L(P[0], P[1]), p12 = L(P[1], P[2]), p23 = L(P[2], P[3]), p012 = L(p01, p12), p123 = L(p12, p23), m = L(p012, p123);
  a.hout = [p01[0] - a.x, p01[1] - a.y]; b.hin = [p23[0] - b.x, p23[1] - b.y];
  N.splice(seg + 1, 0, { x: m[0], y: m[1], hin: [p012[0] - m[0], p012[1] - m[1]], hout: [p123[0] - m[0], p123[1] - m[1]], smooth: true });
  return { path, index: seg + 1 };
}

// supprime un point ; un tracé fermé de moins de 3 points redevient ouvert
export function deleteNode(path, i) {
  path = clonePath(path);
  path.nodes.splice(i, 1);
  if (path.closed && path.nodes.length < 3) path.closed = false;
  return path;
}

// point d'angle ↔ point courbe
export function toggleSmooth(path, i) {
  path = clonePath(path);
  const N = path.nodes, n = N[i];
  if (hasH(n.hin) || hasH(n.hout)) { n.hin = [0, 0]; n.hout = [0, 0]; n.smooth = false; return path; }
  const prev = N[(i - 1 + N.length) % N.length], next = N[(i + 1) % N.length];
  const a = (i === 0 && !path.closed) ? n : prev, b = (i === N.length - 1 && !path.closed) ? n : next;
  const v = [(b.x - a.x) / 6, (b.y - a.y) / 6];
  n.hout = v; n.hin = [-v[0], -v[1]]; n.smooth = true;
  return path;
}

/* ---------- Affichage sur l'aperçu ----------
   Chemins SVG (viewBox 0 0 1 1) du calque plume : tracé, prolongements en pointillés d'un tracé ouvert,
   élastique vers `rubberTo` (point relatif, ou null), bras des poignées du point sélectionné ;
   plus la position et l'aspect des points d'ancrage et des poignées. */
export function overlayPaths(path, selNode = -1, rubberTo = null) {
  const N = path.nodes, n = segCount(path), f = round3;
  let line = '';
  if (N.length) {
    line = `M${f(N[0].x)} ${f(N[0].y)}`;
    for (let i = 0; i < n; i++) { const P = segPts(path, i, 1, 1); line += `C${f(P[1][0])} ${f(P[1][1])} ${f(P[2][0])} ${f(P[2][1])} ${f(P[3][0])} ${f(P[3][1])}`; }
    if (path.closed && n) line += 'Z';
  }
  // tracé ouvert : prolongements en pointillés jusqu'aux bords (la frontière continue)
  let ext = '';
  if (!path.closed && N.length >= 2) {
    const poly = pathPolygon(path, 1, 1), m = poly.length - 3;
    ext = `M${f(poly[0][0])} ${f(poly[0][1])}L${f(poly[1][0])} ${f(poly[1][1])}M${f(poly[m - 1][0])} ${f(poly[m - 1][1])}L${f(poly[m][0])} ${f(poly[m][1])}`;
  }
  // élastique : aperçu du prochain segment avec la plume
  let rubber = '';
  if (rubberTo && !path.closed && N.length) {
    const l = N[N.length - 1];
    rubber = `M${f(l.x)} ${f(l.y)}C${f(l.x + l.hout[0])} ${f(l.y + l.hout[1])} ${f(rubberTo[0])} ${f(rubberTo[1])} ${f(rubberTo[0])} ${f(rubberTo[1])}`;
  }
  const anchors = N.map((nd, i) => ({
    x: nd.x, y: nd.y,
    sel: i === selNode,
    smooth: nd.smooth && (hasH(nd.hin) || hasH(nd.hout)),
    first: i === 0 && !path.closed && N.length >= 2
  }));
  // poignées du point sélectionné
  let arms = '';
  const knobs = [];
  const sn = N[selNode];
  for (const side of ['hin', 'hout']) {
    if (sn && hasH(sn[side])) {
      const x = sn.x + sn[side][0], y = sn.y + sn[side][1];
      knobs.push({ side, x, y });
      arms += `M${f(sn.x)} ${f(sn.y)}L${f(x)} ${f(y)}`;
    }
  }
  return { line, ext, rubber, arms, anchors, knobs };
}
