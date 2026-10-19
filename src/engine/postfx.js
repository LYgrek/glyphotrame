/* Néon & écran : lueur, aberration chromatique, grille d'écran, lignes de balayage,
   vignettage, grain. Appliqués sur le canvas final (rendu canvas 2D). */
import { rnd, createCanvas } from './util.js';

// canvas de travail réutilisés, vidés à chaque usage
const fxCans = {};
function fxCanvas(name, W, H) {
  let c = fxCans[name];
  if (!c) { c = fxCans[name] = createCanvas(); }
  if (c.width !== W) c.width = W;
  if (c.height !== H) c.height = H;
  const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H);
  return [c, x];
}

// Lueur : copie floue de l'effet ajoutée par-dessus (mode additif), comme un néon qui bave
export function paintGlow(lc, eff, s, W, H, state) {
  const r = state.fxGlowR * s, k = Math.max(1, r / 2);
  const [sm, sx] = fxCanvas('glow', Math.max(1, Math.round(W / k)), Math.max(1, Math.round(H / k)));
  sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
  if ('filter' in sx) sx.filter = 'blur(1.2px)';
  sx.drawImage(eff, 0, 0, sm.width, sm.height);
  if ('filter' in sx) sx.filter = 'none';
  lc.save(); lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.imageSmoothingEnabled = true; lc.imageSmoothingQuality = 'high';
  let left = state.fxGlow / 100;
  while (left > 0.001) { lc.globalAlpha = Math.min(1, left); lc.drawImage(sm, 0, 0, W, H); left -= 1; }
  lc.restore();
}

// pas de la grille d'écran : calé sur la trame (ou la grille de caractères) ou libre
export function gridPitch(state, g) {
  if (!state.fxGridSync) return [state.fxGridSize, state.fxGridSize];
  return g.kind === 'halftone' ? [state.htCell, state.htCell] : [g.cw, g.lh];
}

let grainTile = null;
export function getGrainTile() {
  if (grainTile) return grainTile;
  const c = createCanvas(256, 256);
  const x = c.getContext('2d'), img = x.createImageData(256, 256), d = img.data;
  for (let i = 0, j = 0; i < 65536; i++, j += 4) { const v = rnd(i % 256, (i / 256) | 0, 9) * 255; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
  x.putImageData(img, 0, 0);
  return (grainTile = c);
}

export function postFX(ctx, g, state, s, W, H, solid) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // aberration chromatique : rouge décalé d'un côté, vert + bleu de l'autre
  if (state.fxChroma > 0) {
    const d = state.fxChroma * s;
    const [src, sx] = fxCanvas('caSrc', W, H); sx.drawImage(ctx.canvas, 0, 0);
    const [rc, rx] = fxCanvas('caR', W, H);
    rx.drawImage(src, 0, 0); rx.globalCompositeOperation = 'multiply'; rx.fillStyle = '#ff0000'; rx.fillRect(0, 0, W, H);
    rx.globalCompositeOperation = 'destination-in'; rx.drawImage(src, 0, 0);
    const [gc, gx] = fxCanvas('caGB', W, H);
    gx.drawImage(src, 0, 0); gx.globalCompositeOperation = 'multiply'; gx.fillStyle = '#00ffff'; gx.fillRect(0, 0, W, H);
    gx.globalCompositeOperation = 'destination-in'; gx.drawImage(src, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(rc, d, 0); ctx.drawImage(gc, -d, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  // les calques d'écran ne s'impriment que sur le contenu (fond transparent préservé)
  ctx.globalCompositeOperation = 'source-atop';
  if (state.fxGrid > 0) {
    const [px, py] = gridPitch(state, g).map(v => v * s), lw = Math.max(1, Math.min(px, py) * state.fxGridW / 100);
    ctx.fillStyle = `rgba(0,0,0,${state.fxGrid / 100})`;
    ctx.beginPath();
    for (let x = 0; x < W; x += px) ctx.rect(x, 0, lw, H);
    for (let y = 0; y < H; y += py) ctx.rect(0, y, W, lw);
    ctx.fill();
  }
  if (state.fxScan > 0) {
    const p = state.fxScanGap * s;
    ctx.fillStyle = `rgba(0,0,0,${state.fxScan / 100})`;
    ctx.beginPath(); for (let y = 0; y < H; y += p) ctx.rect(0, y + p / 2, W, p / 2); ctx.fill();
  }
  if (state.fxVig > 0) {
    const R = Math.hypot(W, H) / 2, gr = ctx.createRadialGradient(W / 2, H / 2, R * 0.35, W / 2, H / 2, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${state.fxVig / 100})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  if (state.fxGrain > 0) {
    const pat = ctx.createPattern(getGrainTile(), 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(Math.max(1, s)));
    ctx.globalCompositeOperation = solid ? 'overlay' : 'source-atop';
    ctx.globalAlpha = state.fxGrain / 100 * (solid ? 1 : 0.4);
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
