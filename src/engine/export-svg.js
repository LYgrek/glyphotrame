/* Export SVG vectoriel : texte éditable (caractères) ou formes (halftone),
   dégradé en masques, effets néon & écran en filtres et motifs SVG. */
import { toHex, esc, round2, r1, createCanvas } from './util.js';
import { FONTS } from './constants.js';
import { photoSource } from './source.js';
import { perCell } from './neon.js';
import { itemShape } from './halftone.js';
import { ONE, isVector, gradMasks, gradGeom, maskStops, maskDataURL } from './gradient.js';
import { gridPitch } from './postfx.js';

// feuille Google Fonts de la police choisie (les exports restent liés à Google Fonts)
export const fontImport = (state) => `https://fonts.googleapis.com/css2?family=${FONTS[state.font].gf}&display=swap`;

// photo d'origine intégrée aux exports SVG / HTML quand le dégradé est actif
export function photoDataURL(state, src, W, H) {
  const c = createCanvas(W, H);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(photoSource(state, src), 0, 0, W, H);
  return state.cut ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
}

// chemin SVG d'une forme halftone (coordonnées arrondies au dixième)
export function shapePath(sh) {
  if (sh.type === 'circle') { const r = r1(sh.r); return `M${r1(sh.x - sh.r)} ${r1(sh.y)}a${r} ${r} 0 1 0 ${r1(2 * sh.r)} 0a${r} ${r} 0 1 0 ${r1(-2 * sh.r)} 0Z`; }
  if (sh.type === 'ellipse') {
    const c = Math.cos(sh.a), s = Math.sin(sh.a), deg = r1(sh.a * 180 / Math.PI), rx = r1(sh.rx), ry = r1(sh.ry);
    const p1 = `${r1(sh.x - sh.rx * c)} ${r1(sh.y - sh.rx * s)}`, p2 = `${r1(sh.x + sh.rx * c)} ${r1(sh.y + sh.rx * s)}`;
    return `M${p1}A${rx} ${ry} ${deg} 1 0 ${p2}A${rx} ${ry} ${deg} 1 0 ${p1}Z`;
  }
  return 'M' + sh.pts.map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z';
}

export function halftoneSVG(g, state) {
  const out = [];
  for (const pl of g.plates) {
    if (g.cmyk || !g.color) {
      const d = pl.items.map(it => shapePath(itemShape(g, it))).join('');
      if (d) out.push(`<path fill="${g.cmyk ? pl.color : state.ink}"${g.cmyk ? ' style="mix-blend-mode:multiply"' : ''} d="${d}"/>`);
    } else {
      for (const it of pl.items) {
        const sh = itemShape(g, it), f = toHex(it.col[0], it.col[1], it.col[2]);
        out.push(sh.type === 'circle' ? `<circle cx="${r1(sh.x)}" cy="${r1(sh.y)}" r="${r1(sh.r)}" fill="${f}"/>` : `<path fill="${f}" d="${shapePath(sh)}"/>`);
      }
    }
  }
  return out.join('\n');
}

export function buildSVG(g, state, src) {
  const f = FONTS[state.font];
  const color = perCell(state);
  const lines = [];
  const ht = g.kind === 'halftone';
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="${ht ? 'Image en trame halftone' : 'Image en caractères'}">`);
  if (!ht) lines.push(`<style>@import url('${fontImport(state).replace(/&/g, '&amp;')}');text{font-family:'${f.family}',${f.fallback};font-weight:${state.weight};font-size:${state.size}px;text-anchor:middle;dominant-baseline:central}</style>`);
  const solid = !state.transparent;
  const headLen = lines.length;
  if (solid) lines.push(`<rect width="100%" height="100%" fill="${state.paper}"/>`);
  let glyphMask = '';
  const glOpen = state.fxGlow > 0 ? '<g filter="url(#fx-glow)">' : '', glClose = glOpen ? '</g>' : '';
  if (state.grad) {
    const m = gradMasks(state, solid), G = gradGeom(state, g.W, g.H), defs = [];
    const def = (id, fn) => {
      if (!fn || fn === ONE) return '';
      if (!isVector(state)) {
        // forme vague ou courbe libre : masque en image
        defs.push(`<mask id="m-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${g.W}" height="${g.H}"><image href="${maskDataURL(state, fn, g.W, g.H)}" width="${g.W}" height="${g.H}" preserveAspectRatio="none"/></mask>`);
        return ` mask="url(#m-${id})"`;
      }
      const stops = maskStops(state, fn).map(s => `<stop offset="${s.t}" stop-color="#fff" stop-opacity="${s.a}"/>`).join('');
      defs.push(G.type === 'radial'
        ? `<radialGradient id="g-${id}" gradientUnits="userSpaceOnUse" cx="${round2(G.cx)}" cy="${round2(G.cy)}" r="${round2(G.r)}">${stops}</radialGradient>`
        : `<linearGradient id="g-${id}" gradientUnits="userSpaceOnUse" x1="${round2(G.x1)}" y1="${round2(G.y1)}" x2="${round2(G.x2)}" y2="${round2(G.y2)}">${stops}</linearGradient>`);
      defs.push(`<mask id="m-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${g.W}" height="${g.H}"><rect width="${g.W}" height="${g.H}" fill="url(#g-${id})"/></mask>`);
      return ` mask="url(#m-${id})"`;
    };
    const mp = def('photo', m.photo), mq = def('paper', m.paper);
    glyphMask = def('glyph', m.glyph);
    if (defs.length) lines.push(`<defs>${defs.join('')}</defs>`);
    lines.push(`<image href="${photoDataURL(state, src, g.W, g.H)}" x="0" y="0" width="${g.W}" height="${g.H}" preserveAspectRatio="none"${mp}/>`);
    if (m.paper) lines.push(`<rect width="${g.W}" height="${g.H}" fill="${state.paper}"${mq}/>`);
  }
  if (ht) { lines.push(`<g${glyphMask}>${glOpen}`, halftoneSVG(g, state), `${glClose}</g>`); return finishSVG(lines, headLen, g, state, solid); }
  lines.push((color ? `<g${glyphMask}>` : `<g fill="${state.ink}"${glyphMask}>`) + glOpen);
  for (let r = 0; r < g.rows; r++) {
    const y = round2((r + 0.5) * g.lh);
    if (color) {
      let row = '';
      for (let x = 0; x < g.cols; x++) {
        const i = r * g.cols + x, ch = g.glyph[i];
        if (ch === ' ') continue;
        const k = i * 3;
        row += `<tspan x="${round2((x + 0.5) * g.cw)}" fill="${toHex(g.col[k], g.col[k + 1], g.col[k + 2])}">${esc(ch)}</tspan>`;
      }
      if (row) lines.push(`<text y="${y}">${row}</text>`);
    } else {
      const xs = [], txt = [];
      for (let x = 0; x < g.cols; x++) {
        const ch = g.glyph[r * g.cols + x];
        if (ch === ' ') continue;
        xs.push(round2((x + 0.5) * g.cw)); txt.push(esc(ch));
      }
      if (xs.length) lines.push(`<text x="${xs.join(' ')}" y="${y}">${txt.join('')}</text>`);
    }
  }
  lines.push(`${glClose}</g>`);
  return finishSVG(lines, headLen, g, state, solid);
}

// Effets néon & écran en SVG : filtres et motifs vectoriels, équivalents du rendu canvas
function finishSVG(lines, headLen, g, state, solid) {
  const W = g.W, H = g.H, defs = [], over = [];
  const fis = 'color-interpolation-filters="sRGB"';
  if (state.fxGlow > 0) {
    defs.push(`<filter id="fx-glow" x="-15%" y="-15%" width="130%" height="130%" ${fis}><feGaussianBlur in="SourceGraphic" stdDeviation="${r1(state.fxGlowR * 0.65)}" result="b"/><feComposite in="SourceGraphic" in2="b" operator="arithmetic" k1="0" k2="1" k3="${round2(state.fxGlow / 100)}" k4="0"/></filter>`);
  }
  if (state.fxChroma > 0) {
    const d = state.fxChroma;
    defs.push(`<filter id="fx-ca" x="0" y="0" width="100%" height="100%" ${fis}><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feOffset in="r" dx="${d}" result="r2"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="gb"/><feOffset in="gb" dx="${-d}" result="gb2"/><feComposite in="r2" in2="gb2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/></filter>`);
  }
  if (state.fxGrid > 0) {
    const [px, py] = gridPitch(state, g), lw = r1(Math.max(1, Math.min(px, py) * state.fxGridW / 100));
    defs.push(`<pattern id="fx-grid" width="${r1(px)}" height="${r1(py)}" patternUnits="userSpaceOnUse"><path d="M0 0H${r1(px)}V${lw}H0ZM0 ${lw}H${lw}V${r1(py)}H0Z" fill="#000"/></pattern>`);
    over.push(`<rect width="${W}" height="${H}" fill="url(#fx-grid)" fill-opacity="${state.fxGrid / 100}"/>`);
  }
  if (state.fxScan > 0) {
    const p = state.fxScanGap;
    defs.push(`<pattern id="fx-scan" width="${W}" height="${p}" patternUnits="userSpaceOnUse"><rect y="${p / 2}" width="${W}" height="${p / 2}" fill="#000"/></pattern>`);
    over.push(`<rect width="${W}" height="${H}" fill="url(#fx-scan)" fill-opacity="${state.fxScan / 100}"/>`);
  }
  if (state.fxVig > 0) {
    defs.push(`<radialGradient id="fx-vig" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 2}" r="${r1(Math.hypot(W, H) / 2)}"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${state.fxVig / 100}"/></radialGradient>`);
    over.push(`<rect width="${W}" height="${H}" fill="url(#fx-vig)"/>`);
  }
  if (state.fxGrain > 0) {
    defs.push(`<filter id="fx-grain" x="0" y="0" width="100%" height="100%" ${fis}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>`);
    over.push(`<rect width="${W}" height="${H}" filter="url(#fx-grain)" opacity="${round2(state.fxGrain / 100 * (solid ? 1 : 0.4))}"${solid ? ' style="mix-blend-mode:overlay"' : ''}/>`);
  }
  const head = lines.slice(0, headLen), body = lines.slice(headLen);
  const out = head.slice();
  if (defs.length) out.push(`<defs>${defs.join('')}</defs>`);
  const needId = !solid && over.length;
  out.push(`<g${needId ? ' id="fx-content"' : ''}${state.fxChroma > 0 ? ' filter="url(#fx-ca)"' : ''}>`, ...body, '</g>');
  if (over.length) {
    if (needId) {
      // fond transparent : les calques d'écran ne s'appliquent que sur le contenu
      out.push(`<mask id="fx-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" style="mask-type:alpha"><use href="#fx-content"/></mask>`, `<g mask="url(#fx-m)">`, ...over, '</g>');
    } else out.push(...over);
  }
  out.push('</svg>');
  return out.join('\n');
}
