/* Export HTML + CSS (grille exacte de caractères, redimensionnable avec --k),
   bloc HTML avec SVG pour le halftone, et texte brut. */
import { toHex, esc, fmt, round2, r1 } from './util.js';
import { FONTS } from './constants.js';
import { perCell } from './neon.js';
import { ONE, isVector, gradMasks, cssGradient, maskDataURL } from './gradient.js';
import { gridPitch } from './postfx.js';
import { buildSVG, fontImport, photoDataURL } from './export-svg.js';

export function buildHTML(g, state, src) {
  if (g.kind === 'halftone') {
    return `<!-- Glyphotrame · halftone ${g.type} · ${fmt(g.count)} éléments${state.grad ? ' · dégradé' : ''} -->
<!-- Le SVG prend toute la largeur de son conteneur : change max-width pour le limiter. -->
<style>
.glyphotrame-halftone{width:100%;max-width:${g.W}px}
.glyphotrame-halftone svg{display:block;width:100%;height:auto}
</style>
<div class="glyphotrame-halftone">
${buildSVG(g, state, src)}
</div>`;
  }
  const f = FONTS[state.font];
  const color = perCell(state);
  const cw = round2(g.cw), lh = round2(g.lh);
  const rows = [];
  for (let r = 0; r < g.rows; r++) {
    let line = '', spaces = 0;
    for (let x = 0; x < g.cols; x++) {
      const i = r * g.cols + x, ch = g.glyph[i];
      if (ch === ' ') { spaces++; continue; }
      if (spaces) { line += spaces === 1 ? '<b></b>' : `<b style="--n:${spaces}"></b>`; spaces = 0; }
      if (color) { const k = i * 3; line += `<i style="color:${toHex(g.col[k], g.col[k + 1], g.col[k + 2])}">${esc(ch)}</i>`; }
      else line += `<i>${esc(ch)}</i>`;
    }
    rows.push(`<div>${line}</div>`);
  }
  const solid = !state.transparent;
  const mask = (fn) => {
    if (!fn || fn === ONE) return '';
    if (isVector(state)) { const css = cssGradient(state, fn); return `-webkit-mask-image:${css};mask-image:${css};`; }
    const url = `url("${maskDataURL(state, fn, g.W, g.H)}")`;
    return `-webkit-mask-image:${url};mask-image:${url};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;`;
  };
  let gradCSS = '', gradHTML = '', rowsMask = '';
  if (state.grad) {
    const m = gradMasks(state, solid);
    gradCSS = `
.glyphotrame .gt-photo,.glyphotrame .gt-paper{position:absolute;inset:0;pointer-events:none}
.glyphotrame .gt-photo{background:url("${photoDataURL(state, src, g.W, g.H)}") 0 0/100% 100% no-repeat;${mask(m.photo)}}${m.paper ? `
.glyphotrame .gt-paper{background:${state.paper};${mask(m.paper)}}` : ''}`;
    gradHTML = `<div class="gt-photo"></div>${m.paper ? '<div class="gt-paper"></div>' : ''}\n`;
    rowsMask = mask(m.glyph);
  }
  return `<!-- Glyphotrame · ${g.cols} × ${g.rows} caractères · police ${f.family} ${state.weight}${state.grad ? ' · dégradé' : ''} -->
<!-- Pour redimensionner, change --k (ex. --k:.5 pour la moitié, --k:2 pour le double). -->
<link rel="stylesheet" href="${fontImport(state)}">
<style>
.glyphotrame{
  --k:1;
  --cw:calc(${cw}px * var(--k));
  --lh:calc(${lh}px * var(--k));
  position:relative;
  width:calc(var(--cw) * ${g.cols});
  max-width:none;
  background:${solid ? state.paper : 'transparent'};
  color:${state.ink};
  font-family:"${f.family}",${f.fallback};
  font-weight:${state.weight};
  font-size:calc(${state.size}px * var(--k));
  line-height:var(--lh);
  user-select:none;
}${gradCSS}
.glyphotrame .gt-rows{position:relative;${rowsMask}${htmlShadow(state)}}${htmlOverlayCSS(state, g)}
.glyphotrame .gt-rows>div{display:flex;height:var(--lh)}
.glyphotrame i,.glyphotrame b{flex:none;display:flex;justify-content:center;width:var(--cw);font-style:normal;font-weight:inherit}
.glyphotrame b{width:calc(var(--cw) * var(--n,1))}
</style>
<div class="glyphotrame" role="img" aria-label="Image composée de caractères">
${gradHTML}<div class="gt-rows">
${rows.join('\n')}
</div>${htmlOverlayCSS(state, g) ? '\n<div class="gt-fx"></div>' : ''}
</div>`;
}

// Néon en CSS : lueur et aberration chromatique en text-shadow
function htmlShadow(state) {
  const sh = [];
  if (state.fxChroma > 0) { const d = state.fxChroma; sh.push(`${-d}px 0 rgba(255,0,60,.6)`, `${d}px 0 rgba(0,220,255,.6)`); }
  if (state.fxGlow > 0) {
    const r = state.fxGlowR;
    for (let i = 0; i < Math.ceil(state.fxGlow / 50); i++) sh.push(`0 0 ${r1(r * (0.6 + i * 0.5))}px currentColor`);
  }
  return sh.length ? `text-shadow:${sh.join(',')};` : '';
}

// Calques d'écran en CSS : grille, lignes de balayage, vignettage, grain
function htmlOverlayCSS(state, g) {
  const bg = [];
  if (state.fxGrid > 0) {
    const [px, py] = gridPitch(state, g), lw = r1(Math.max(1, Math.min(px, py) * state.fxGridW / 100)), a = state.fxGrid / 100;
    bg.push(`linear-gradient(90deg,rgba(0,0,0,${a}) ${lw}px,transparent ${lw}px) 0 0/calc(${r1(px)}px * var(--k)) 100%`);
    bg.push(`linear-gradient(rgba(0,0,0,${a}) ${lw}px,transparent ${lw}px) 0 0/100% calc(${r1(py)}px * var(--k))`);
  }
  if (state.fxScan > 0) {
    const p = state.fxScanGap;
    bg.push(`repeating-linear-gradient(transparent 0 ${p / 2}px,rgba(0,0,0,${state.fxScan / 100}) ${p / 2}px ${p}px)`);
  }
  if (state.fxVig > 0) bg.push(`radial-gradient(circle farthest-corner,transparent 35%,rgba(0,0,0,${state.fxVig / 100}))`);
  if (state.fxGrain > 0) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(%23n)' opacity='${round2(state.fxGrain / 100)}'/></svg>`;
    bg.push(`url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`);
  }
  if (!bg.length) return '';
  return `\n.glyphotrame .gt-fx{position:absolute;inset:0;pointer-events:none;background:${bg.join(',')};}`;
}

// Texte brut (caractères seulement), espaces de fin de ligne retirés
export function buildTXT(g) {
  const rows = [];
  for (let r = 0; r < g.rows; r++) rows.push(g.glyph.slice(r * g.cols, (r + 1) * g.cols).join('').replace(/\s+$/, ''));
  return rows.join('\n');
}

// Page HTML complète autour du bloc de code (enregistrement depuis la fenêtre Code)
export const htmlPage = (code, slug) => `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${slug} · Glyphotrame</title>\n</head>\n<body style="margin:0;padding:24px;overflow:auto">\n${code}\n</body>\n</html>\n`;

// Nom de fichier d'export : « photo-glyphotrame.png »
export const exportFileName = (slug, ext) => `${slug}-glyphotrame.${ext}`;
