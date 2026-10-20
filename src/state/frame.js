/* Vidéo, étape 3 : rendre une image de vidéo avec l'effet, en pixels RGBA (docs/video.md).
   Même chaîne que l'aperçu : source → détourage → grille du moteur → rendu (carte graphique, ou canvas 2D
   en secours), mais avec des réglages figés pour toute la vidéo :
   - la couleur du fond détectée automatiquement est celle de l'image courante, gardée pour toutes les
     images (sinon le fond « clignote » d'une image à l'autre) ;
   - police, densité des glyphes et table des tons sont préparées une fois (prepareCompute).
   La pseudo-aléatoire du moteur dépend de la position, pas du temps : le motif reste stable ;
   seul le « Grain animé » change avec l'instant de l'image. */
import * as E from '../engine/index.js';
import { createGpuRenderer } from '../gpu/index.js';
import { outputSize } from './frame-size.js';

export { even, outputSize } from './frame-size.js';

/* Prépare le rendu des images. st : réglages (copiés ici) ; opts :
   - width : largeur de sortie voulue (null = « Largeur de sortie ») ; W × H fixés par la première grille,
     ou imposés par opts.W / opts.H (recadrage depuis le coin haut gauche) ;
   - opaque : fond plein même si le fond transparent est demandé (MP4, GIF) ;
   - gpu : rendu par la carte graphique si possible (sinon canvas 2D). */
export async function createFrameRenderer(st, { width = null, opaque = false, gpu = true, W = 0, H = 0 } = {}) {
  st = { ...st };
  if (st.cut && st.cutAuto) st.cutAuto = false; // couleur détectée sur l'image courante, figée
  const grid = await E.prepareCompute(st);
  const r = gpu ? createGpuRenderer(E.createCanvas(1, 1)) : null;
  let size = null, out = null, c2d = null;

  return {
    gpu: !!r,
    get size() { return size; },
    // image (canvas à la taille de la source) à l'instant `time` (s) → pixels RGBA W × H (tableau réutilisé) ;
    // prof : temps cumulés { calcul, gpu, pixels } (ms), facultatif
    render(image, time, meta = null, prof = null) {
      const t0 = prof ? performance.now() : 0;
      let src = E.createSource(image, 'video', null, { kind: 'video', meta, time });
      src = E.applyCutout(st, src).src;
      const g = grid(src);
      if (prof) prof.calcul += performance.now() - t0;
      if (!size) { const o = outputSize(g, width); size = W && H ? { s: o.s, W, H } : o; }
      const { s } = size;
      if (!out) out = new Uint8Array(size.W * size.H * 4);
      if (r) return r.renderPixels(g, st, src, s, opaque, size.W, size.H, out, prof);
      // canvas 2D (rendu de la référence)
      const t1 = prof ? performance.now() : 0;
      if (!c2d) c2d = E.createCanvas();
      const ctx = c2d.getContext('2d', { willReadFrequently: true });
      E.draw(ctx, g, st, src, s, opaque);
      const t2 = prof ? performance.now() : 0;
      const w = Math.min(size.W, c2d.width), h = Math.min(size.H, c2d.height);
      const d = ctx.getImageData(0, 0, w, h).data;
      out.fill(0);
      for (let y = 0; y < h; y++) out.set(d.subarray(y * w * 4, (y + 1) * w * 4), y * size.W * 4);
      if (prof) { prof.gpu += t2 - t1; prof.pixels += performance.now() - t2; }
      return out;
    },
    dispose() { if (r) r.dispose(true); }
  };
}

// RGBA brut (largeur × hauteur) → canvas
export function pixelsToCanvas(buf, w, h) {
  const c = E.createCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf.buffer || buf, buf.byteOffset || 0, w * h * 4), w, h), 0, 0);
  return c;
}
