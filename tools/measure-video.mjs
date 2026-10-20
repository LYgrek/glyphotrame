/* Mesure des performances de l'export vidéo (docs/video.md, étape 6), dans la vraie fenêtre Tauri.
   Vidéo de test 1080p (testsrc2 1920 × 1080, 30 i/s, avec son), exportée en MP4 1920 px de large
   (taille d'origine, taille max de la source 1920) en caractères puis en halftone CMJN.
   Affiche le temps moyen par image de chaque étape de la boucle d'export :
     lire     attente de l'image décodée (commande export_lire_image : décodeur ffmpeg + transfert)
     image    pixels reçus → canvas
     calcul   détourage + grille du moteur (compute)
     gpu      rendu par la carte graphique, jusqu'à la fin du dessin
     pixels   lecture des pixels rendus (readPixels) et copie
     écrire   envoi à l'encodeur (commande export_ecrire_image : transfert + encodeur ffmpeg)

   Usage : npm run measure:video                 (vidéo de 30 s)
           $env:SECONDES="10"; npm run measure:video
   Prérequis : ceux de compare:video (ffmpeg dans src-tauri/binaries, port 1420 libre). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FFMPEG, makeTestVideo, run, startApp } from './lib/tauri-app.mjs';

const SECONDS = +(process.env.SECONDES || 30), FPS = 30;
const work = mkdtempSync(join(tmpdir(), 'glyphotrame-mesure-'));
const VIDEO = join(work, 'mire-1080p.mp4');
console.log(`Vidéo de test 1920 × 1080, ${SECONDS} s à ${FPS} i/s…`);
makeTestVideo(VIDEO, { width: 1920, height: 1080, fps: FPS, seconds: SECONDS });

// capacité du décodeur seul (même conversion en RGBA que l'export)
let t0 = Date.now();
run(FFMPEG, ['-v', 'error', '-i', VIDEO, '-an', '-pix_fmt', 'rgba', '-f', 'null', '-']);
const decodeOnly = (Date.now() - t0) / (SECONDS * FPS);

const SCENARIOS = [
  ['Caractères', { width: 1920 }],
  ['Halftone CMJN', { width: 1920, effect: 'halftone', mode: 'cmyk', htCell: 12 }]
];
const STAGES = [['lire', 'lire'], ['image', 'image'], ['calcul', 'calcul'], ['gpu', 'gpu'], ['pixels', 'pixels'], ['ecrire', 'écrire']];
let app = null, failed = false;
try {
  app = await startApp();
  const { inPage, settle } = app;
  await inPage(`I.settings.set({ srcMax: 1920 }); return V.loadVideo({ name: 'mire-1080p.mp4', path: ${JSON.stringify(VIDEO)} });`);
  await settle();
  console.log(`Rendu : ${await inPage('return I.session.get().rendu;')} · décodeur ffmpeg seul : ${decodeOnly.toFixed(1)} ms par image\n`);
  const rows = [];
  for (const [name, patch] of SCENARIOS) {
    await inPage(`I.settings.set({ ...D.defaultSettings(), srcMax: 1920, ...${JSON.stringify(patch)} });`);
    await settle();
    const o = { format: 'mp4', taille: 'origine', cadence: 0, plage: 'tout', son: true, qualite: 'haute' };
    const file = join(work, `${name.replace(/\W+/g, '-')}.mp4`);
    const t = Date.now();
    const res = await inPage(`await X.exportVideo(${JSON.stringify(o)}, ${JSON.stringify(file)}); const s = X.exportSize(${JSON.stringify(o)}); return { ...I.session.get().vExport, W: s.W, H: s.H, grid: I.session.get().stats };`);
    const secs = (Date.now() - t) / 1000;
    if (res.phase !== 'done') { console.log(`✗ ${name} : ${res.phase} ${res.msg || ''}`); failed = true; continue; }
    const p = res.prof;
    const count = res.grid ? (res.grid.kind === 'chars' ? `${res.grid.cols} × ${res.grid.rows} caractères` : `${res.grid.count.toLocaleString('fr-FR')} éléments`) : '';
    rows.push([name, p, secs, res.n]);
    console.log(`■ ${name} · ${res.W} × ${res.H} · ${count} · ${res.n} images en ${secs.toFixed(1)} s (${(res.n / secs).toFixed(1)} i/s) · pixels par ${p.canal === 'websocket' ? 'le canal WebSocket' : 'l\'IPC'}`);
    for (const [k, label] of STAGES) {
      const part = p.canal === 'websocket' ? '' : k === 'lire' ? `   dont attente du décodeur ${p.decodeur.toFixed(1)}, transfert ${(p.lire - p.decodeur).toFixed(1)}`
        : k === 'ecrire' ? `   dont attente de l'encodeur ${p.encodeur.toFixed(1)}, transfert ${(p.ecrire - p.encodeur).toFixed(1)}` : '';
      console.log(`  ${label.padEnd(7)} ${p[k].toFixed(1).padStart(6)} ms${part}`);
    }
    if (p.canal === 'websocket') console.log(`  (canal : le Rust attend le décodeur ${p.decodeur.toFixed(1)} ms et l'encodeur ${p.encodeur.toFixed(1)} ms par image, en parallèle du rendu)`);
    console.log(`  ${'total'.padEnd(7)} ${p.total.toFixed(1).padStart(6)} ms par image\n`);
  }
} catch (e) {
  failed = true;
  console.error('✗ ' + (e && e.stack || e));
} finally {
  if (app) await app.close();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* fichier encore ouvert */ }
}
process.exit(failed ? 1 : 0);
