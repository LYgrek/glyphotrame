/* Banc de comparaison du rendu GPU (WebGL2) avec le rendu canvas 2D du moteur, sur les réglages types.
   Les deux rendus partent de la même grille : seuls le dessin et la composition diffèrent.
   Ils ne peuvent pas être identiques au bit près (anticrénelage, filtrage des textures, flou de la lueur) :
   on mesure l'écart moyen et la part de pixels nettement différents, avec des seuils de tolérance.

   Lancer : npm run compare:gpu  (ou npm run dev, puis http://localhost:1420/tools/compare-gpu.html) */
import '../src/styles/fonts.css';
import * as E from '../src/engine/index.js';
import { createGpuRenderer, gpuRenderBlob } from '../src/gpu/index.js';
import { defaultSettings } from '../src/state/defaults.js';
import { SCENARIOS } from './scenarios.js';

// seuils : écart moyen (niveaux 0-255, tous canaux) et part des pixels écartés de plus de 48 niveaux
const MAX_MEAN = 1.5, MAX_VISIBLE = 0.5;
// tolérances plus larges, justifiées :
// - lignes en couleurs : le canvas anticrénèle chaque segment séparément et laisse des coutures claires
//   entre segments voisins ; le GPU (multi-échantillonnage) n'en a pas ;
// - CMJN : quatre encres superposées, donc quatre fois plus de bords anticrénelés.
const ALLOW = {
  'Halftone · lignes en couleurs': { mean: 2.5, visible: 2 },
  'Halftone · CMJN': { mean: 1.5, visible: 1 }
};

const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

function pixels(source) {
  const c = E.createCanvas(source.width, source.height), x = c.getContext('2d');
  x.drawImage(source, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}
// écart entre deux images + image des écarts (amplifiés ×4)
function compare(a, b, lim = {}) {
  const maxMean = lim.mean ?? MAX_MEAN, maxVisible = lim.visible ?? MAX_VISIBLE;
  if (a.width !== b.width || a.height !== b.height) return { ok: false, text: `taille ${a.width}×${a.height} ≠ ${b.width}×${b.height}` };
  const n = a.width * a.height, da = a.data, db = b.data, diff = new ImageData(a.width, a.height);
  let sum = 0, vis = 0, max = 0;
  // valeurs prémultipliées (couleur × alpha) : un pixel presque transparent a une couleur imprécise mais invisible
  for (let i = 0; i < da.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) {
      const va = c < 3 ? da[i + c] * da[i + 3] / 255 : da[i + 3], vb = c < 3 ? db[i + c] * db[i + 3] / 255 : db[i + 3];
      const d = Math.abs(va - vb); sum += d; if (d > m) m = d;
    }
    if (m > 48) vis++;
    if (m > max) max = Math.round(m);
    const v = Math.min(255, m * 4);
    diff.data[i] = 255; diff.data[i + 1] = 255 - v; diff.data[i + 2] = 255 - v; diff.data[i + 3] = 255;
  }
  const mean = sum / (n * 4), visible = vis / n * 100;
  return { ok: mean <= maxMean && visible <= maxVisible, mean, visible, max, diff, text: `moyen ${mean.toFixed(2)} · nets ${visible.toFixed(2)} % · max ${max}` };
}
const url = (img) => { const c = E.createCanvas(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); return c.toDataURL('image/png'); };
async function blobPixels(blob) { const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none' }); return pixels(bmp); }

async function main() {
  await document.fonts.ready;
  const base = defaultSettings();
  const glCanvas = E.createCanvas(1, 1);
  const gpu = createGpuRenderer(glCanvas);
  if (!gpu) { $('#cmp-status').textContent = 'WebGL2 indisponible dans ce navigateur.'; document.title = 'ERREUR'; return; }
  const exportSet = new Set(['Caractères · défaut', 'Halftone · CMJN', 'Halftone · lignes ondulées', 'Dégradé vague', 'Effets d\'écran (caractères)', 'Style « Néon numérique »', 'Tout ensemble (caractères)']);
  window.__images = {};
  const results = [];
  for (const [name, patch] of SCENARIOS) {
    $('#cmp-status').textContent = 'En cours : ' + name;
    await frame();
    const state = Object.assign(clone(base), clone(patch));
    let src = E.createSource(E.makeSample(), 'exemple-sphere.png');
    const cut = E.applyCutout(state, src); src = cut.src; state.cutColor = cut.cutColor;
    const { grid: g } = await E.compute(state, src);
    // aperçu
    const cc = E.createCanvas();
    let t0 = performance.now();
    E.draw(cc.getContext('2d'), g, state, src, 1, false, 760);
    const pc = pixels(cc);
    const tCanvas = performance.now() - t0;
    t0 = performance.now();
    gpu.draw(g, state, src, 1, false, 760);
    const pg = pixels(glCanvas);
    const tGpu = performance.now() - t0;
    const prev = compare(pc, pg, ALLOW[name]);
    // export 2× (rendu GPU par tuiles)
    let exp = { ok: true, text: '—' };
    if (exportSet.has(name)) {
      const [bc, bg] = await Promise.all([E.renderBlob(g, state, src, 'png'), gpuRenderBlob(g, state, src, 'png')]);
      exp = compare(await blobPixels(bc), await blobPixels(bg), ALLOW[name]);
    }
    window.__images[name] = { canvas: cc.toDataURL('image/png'), gpu: glCanvas.toDataURL('image/png'), diff: prev.diff ? url(prev.diff) : '' };
    const r = { name, prev, exp, tCanvas, tGpu };
    results.push(r);
    const tr = document.createElement('tr');
    const td = (html, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.innerHTML = html; return c; };
    tr.append(td(name), td((prev.ok ? '✓ ' : '✗ ') + prev.text, prev.ok ? 'ok' : 'ko'), td((exp.ok ? '✓ ' : '✗ ') + exp.text, exp.ok ? 'ok' : 'ko'),
      td(`${tCanvas.toFixed(0)} / ${tGpu.toFixed(0)} ms`),
      td(['canvas', 'gpu', 'diff'].map((k) => window.__images[name][k] ? `<img src="${window.__images[name][k]}" alt="">` : '').join('')));
    $('#cmp-rows').append(tr);
  }
  const fails = results.filter((r) => !r.prev.ok || !r.exp.ok);
  window.__fails = fails.map((r) => r.name);
  const tc = results.reduce((a, r) => a + r.tCanvas, 0), tg = results.reduce((a, r) => a + r.tGpu, 0);
  $('#cmp-status').textContent = (fails.length ? `${fails.length} scénario(s) sur ${results.length} au-delà des seuils.` : `Les ${results.length} scénarios sont dans les seuils.`)
    + ` Temps total de l'aperçu : canvas ${tc.toFixed(0)} ms, GPU ${tg.toFixed(0)} ms.`;
  document.title = fails.length ? 'ÉCHEC' : 'OK';
}
main().catch((e) => { $('#cmp-status').textContent = 'Erreur : ' + e.stack; document.title = 'ERREUR'; });
