/* Banc vidéo (docs/video.md, étape 7) : vérifie la chaîne complète de l'export vidéo dans la vraie
   application (fenêtre Tauri, ffmpeg embarqué, rendu GPU), pilotée par le protocole DevTools de WebView2.

   1. Génère une mire avec ffmpeg (testsrc2 640 × 360, 2 s à 30 i/s, avec son).
   2. Pour plusieurs réglages types : export en séquence PNG, puis chaque image comparée au pixel près
      à l'export PNG de la même image par l'application (bouton PNG, échelle 1).
   3. Exports MP4 / MOV / WebM / GIF contrôlés par ffprobe : durée, cadence, nombre d'images, dimensions,
      son, canal alpha (ProRes 4444 et WebM, avec des pixels réellement transparents).
   4. Projet vidéo : enregistré puis rouvert avec la vraie vidéo, à la même image.
   Les pixels passent par le canal WebSocket local (src-tauri/src/canal.rs), vérifié lui aussi.

   Usage : npm run compare:video          (≈ 2 min ; compile d'abord le Rust si besoin)
           $env:KEEP="1"; npm run compare:video   garde le dossier de travail (images, vidéos)
   Prérequis : ffmpeg dans src-tauri/binaries (tools/get-ffmpeg.ps1), port 1420 libre (fermer « npm run tauri dev »). */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decode, makeTestVideo, probe, ratio, startApp } from './lib/tauri-app.mjs';

const FPS = 30, SECONDS = 2, FRAMES = FPS * SECONDS;

let total = 0, ko = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' : ' + detail : ''}`); return ok; };

/* ---------- Préparation ---------- */
const work = mkdtempSync(join(tmpdir(), 'glyphotrame-video-'));
const MIRE = join(work, 'mire.mp4');
console.log('Mire de test (ffmpeg testsrc2 + son)…');
makeTestVideo(MIRE, { width: 640, height: 360, fps: FPS, seconds: SECONDS });

let app = null;
try {
  app = await startApp();
  const { inPage, settle } = app;
  check('Fenêtre Tauri pilotée, rendu ' + (await inPage('return I.session.get().rendu;')), true);

  await inPage(`return V.loadVideo({ name: 'mire.mp4', path: ${JSON.stringify(MIRE)} });`);
  await settle();
  const meta = await inPage('return R.getSource().meta;');
  check('Mire ouverte', meta && meta.largeur === 640 && meta.hauteur === 360 && meta.cadence === FPS && meta.son, JSON.stringify(meta));

  // image n à l'écran (même demande que la navigation), rendu terminé ; png : export PNG de l'application en base64
  const showFrame = (n, png) => inPage(`
    const src = R.getSource(), rate = src.meta.cadence;
    const c = await F.videoFrame(src.path, Math.max(0, (${n} - 0.5) / rate), I.settings.get().srcMax);
    const done = R.whenRendered();
    R.replaceImage(c, { time: ${n} / rate }); I.session.set({ vTime: ${n} / rate });
    await done;
    if (!${!!png}) return null;
    const b = new Uint8Array(await (await A.rasterBlob('png')).arrayBuffer());
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);`);
  const applySettings = async (patch) => { await inPage(`I.settings.set({ ...D.defaultSettings(), width: 640, scale: 1, ...${JSON.stringify(patch)} });`); await settle(); };
  // export vidéo lancé comme par le bouton « Exporter… » de la fenêtre, destination imposée → état final
  const exportVideo = (o, dest, opts = {}) => inPage(`await X.exportVideo(${JSON.stringify(o)}, ${JSON.stringify(dest)}, ${JSON.stringify(opts)}); return { ...I.session.get().vExport, size: X.exportSize(${JSON.stringify(o)}) };`);
  const PNG_OPTS = { format: 'png', taille: 'sortie', cadence: 0, plage: 'tout', son: false, qualite: 'haute' };

  /* ---------- Séquences PNG ↔ export PNG de l'application ---------- */
  const HT = { effect: 'halftone' };
  const SCENARIOS = [
    ['Caractères · défaut', {}],
    ['Caractères · couleurs de l\'image, grain animé', { mode: 'color', fxGrain: 40, fxGrainAnim: true }],
    ['Halftone · points ronds', { ...HT }],
    ['Halftone · CMJN', { ...HT, mode: 'cmyk', htCell: 10 }],
    ['Halftone · lignes ondulées, fond transparent', { ...HT, htType: 'lignes', htCell: 8, htMax: 100, htAmp: 40, htFreq: 5, transparent: true }],
    ['Détourage (couleur figée) + dégradé vague + néon numérique', { cut: true, transparent: true, grad: true, gShape: 'vague', ...HT, htShape: 'carre', htCell: 7, htAngle: 0,
      mode: 'neon', paper: '#07010a', fxGlow: 60, fxGlowR: 6, fxGrid: 55, fxChroma: 1.5, fxGrain: 14, fxVig: 45 }]
  ];
  for (const [si, [name, patch]] of SCENARIOS.entries()) {
    console.log(`\n■ ${name}`);
    await showFrame(0, false);
    await applySettings(patch);
    // détourage automatique : l'export fige la couleur détectée sur l'image courante ; la référence la reprend telle quelle
    if (patch.cut) { const c = await inPage('return I.settings.get().cutColor;'); await applySettings({ ...patch, cutAuto: false, cutColor: c }); }
    const dir = join(work, `seq-${si + 1}`), refDir = join(work, `ref-${si + 1}`);
    mkdirSync(dir); mkdirSync(refDir);
    const t0 = Date.now();
    const res = await exportVideo(PNG_OPTS, dir);
    const secs = (Date.now() - t0) / 1000;
    if (si === 0) check('Pixels transférés par le canal WebSocket (pas l\'IPC de secours)', res.prof && res.prof.canal === 'websocket', res.prof && res.prof.canal);
    if (!check('Séquence PNG exportée', res.phase === 'done' && res.n === FRAMES, `${res.phase} · ${res.n ?? '?'} images en ${secs.toFixed(1)} s${res.msg ? ' · ' + res.msg : ''}`)) continue;
    for (let n = 0; n < FRAMES; n++) writeFileSync(join(refDir, `ref_${String(n + 1).padStart(5, '0')}.png`), Buffer.from(await showFrame(n, true), 'base64'));
    const seqName = readdirSync(dir).filter((f) => f.endsWith('.png')).sort()[0].replace(/\d{5}\.png$/, '%05d.png');
    const a = decode(join(dir, seqName)), b = decode(join(refDir, 'ref_%05d.png'));
    check('Dimensions paires, au plus 1 px de moins que l\'export PNG', a.w % 2 === 0 && a.h % 2 === 0 && b.w - a.w <= 1 && b.h - a.h <= 1 && a.w === res.size.W && a.h === res.size.H, `${a.w} × ${a.h} (PNG ${b.w} × ${b.h})`);
    // L'export PNG passe par un canvas, qui garde les couleurs prémultipliées par l'alpha : la couleur d'un pixel
    // semi-transparent y est arrondie (à alpha 3 : 0, 85, 170 ou 255). La séquence garde la valeur exacte.
    // Pixels opaques et alpha : égalité stricte ; pixels semi-transparents : égalité des valeurs prémultipliées
    // (round(c × a / 255), ce qui se voit une fois l'image posée sur un fond).
    let bad = 0, maxDiff = 0, firstBad = -1, translucent = 0;
    for (let n = 0; n < Math.min(a.frames.length, b.frames.length); n++) {
      let diff = 0;
      for (let y = 0; y < a.h; y++) {
        const ra = a.frames[n].subarray(y * a.w * 4, (y + 1) * a.w * 4), rb = b.frames[n].subarray(y * b.w * 4, y * b.w * 4 + a.w * 4);
        if (ra.equals(rb)) continue;
        for (let i = 0; i < ra.length; i += 4) {
          const al = ra[i + 3];
          if (al !== rb[i + 3]) { diff++; maxDiff = Math.max(maxDiff, Math.abs(al - rb[i + 3])); continue; }
          for (let k = 0; k < 3; k++) {
            if (ra[i + k] === rb[i + k]) continue;
            if (al < 255 && Math.round(ra[i + k] * al / 255) === Math.round(rb[i + k] * al / 255)) { translucent++; continue; }
            diff++; maxDiff = Math.max(maxDiff, Math.abs(ra[i + k] - rb[i + k]));
          }
        }
      }
      if (diff) { bad++; if (firstBad < 0) firstBad = n; }
    }
    check(`${a.frames.length} images identiques au pixel près à l'export PNG`, a.frames.length === FRAMES && b.frames.length === FRAMES && !bad,
      bad ? `${bad} image(s) différente(s), première : ${firstBad}, écart max ${maxDiff}`
        : translucent ? `${translucent.toLocaleString('fr-FR')} composantes semi-transparentes plus précises que le PNG (mêmes valeurs prémultipliées)` : '');
    // secours par l'IPC (canal WebSocket indisponible) : même séquence, octet pour octet
    if (si === 0) {
      const ipcDir = join(work, 'seq-ipc');
      mkdirSync(ipcDir);
      const r2 = await exportVideo(PNG_OPTS, ipcDir, { canal: false });
      const c = r2.phase === 'done' ? decode(join(ipcDir, seqName)) : { frames: [] };
      check('Secours par l\'IPC : séquence identique', r2.prof && r2.prof.canal === 'ipc' && c.frames.length === FRAMES && c.frames.every((f, k) => f.equals(a.frames[k])), `${r2.phase} · ${r2.prof && r2.prof.canal}`);
    }
    // le motif doit bouger (chaque image est bien celle de son instant)
    check('Images successives différentes (la vidéo avance)', !a.frames[0].equals(a.frames[FRAMES - 1]));
  }

  /* ---------- MP4 / MOV / WebM / GIF : contrôle ffprobe ---------- */
  console.log('\n■ Formats vidéo (ffprobe)');
  await showFrame(0, false);
  await applySettings({ ...HT, mode: 'cmyk', htCell: 10, transparent: true });
  // entrée à l'image 15, sortie à l'image 44 (30 images, 1 s)
  await inPage('V.seekFrame(15); V.setIn(); V.seekFrame(44); V.setOut();'); await settle();
  const FORMATS = [
    // nom, réglages, images, cadence, durée, son, alpha attendue
    ['MP4 · H.264, toute la vidéo, son', { format: 'mp4', taille: 'sortie', cadence: 0, plage: 'tout', son: true, qualite: 'haute' }, FRAMES, 30, 2, 'aac', false],
    ['MP4 · 12 i/s, sans son', { format: 'mp4', taille: 'origine', cadence: 12, plage: 'tout', son: false, qualite: 'legere' }, 24, 12, 2, null, false],
    ['MOV · ProRes 4444, transparence, son', { format: 'mov', taille: 'sortie', cadence: 0, plage: 'tout', son: true, qualite: 'moyenne' }, FRAMES, 30, 2, 'pcm_s16le', true],
    ['WebM · VP9, entrée → sortie, transparence, son', { format: 'webm', taille: 'sortie', cadence: 0, plage: 'es', son: true, qualite: 'haute' }, 30, 30, 1, 'opus', true],
    ['GIF · 15 i/s', { format: 'gif', taille: 'origine', cadence: 15, plage: 'tout', son: false, qualite: 'haute' }, 30, 15, 2, null, false]
  ];
  for (const [name, o, frames, rate, dur, audio, alpha] of FORMATS) {
    const file = join(work, `export-${o.format}-${o.cadence || 'orig'}.${o.format}`);
    const res = await exportVideo(o, file);
    if (!check(name + ' : exporté', res.phase === 'done' && existsSync(file), res.msg || '')) continue;
    const p = probe(file), v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
    const fmtDur = +p.format.duration;
    // GIF : délais en centièmes de seconde (15 i/s → 7 cs) : tolérance d'une image
    // GIF : délais en centièmes de seconde (15 i/s → 7, 7, 6 cs…) ; ffprobe en tire une cadence moyenne fausse
    // (50/3) : on contrôle la cadence nominale et le rapport images / durée, avec une tolérance d'une image sur la durée
    const tol = o.format === 'gif' ? 1 / rate + 0.02 : 0.05;
    const measured = o.format === 'gif' ? +v.nb_read_frames / fmtDur : ratio(v.avg_frame_rate);
    // durée du son : dans le flux (MP4, MOV) ou dans l'étiquette DURATION (WebM, « 00:00:01.008000000 »)
    const aDur = !a ? 0 : a.duration ? +a.duration : a.tags && a.tags.DURATION ? a.tags.DURATION.split(':').reduce((t, x) => t * 60 + +x, 0) : NaN;
    check(`  ${o.format.toUpperCase()} dimensions ${res.size.W} × ${res.size.H}`, v.width === res.size.W && v.height === res.size.H, `${v.width} × ${v.height}`);
    check(`  ${o.format.toUpperCase()} ${frames} images`, +v.nb_read_frames === frames, String(v.nb_read_frames));
    check(`  ${o.format.toUpperCase()} cadence ${rate} i/s`, Math.abs(measured - rate) < 0.01 && ratio(v.r_frame_rate) === rate, `${Math.round(measured * 1000) / 1000} (nominale ${v.r_frame_rate})`);
    check(`  ${o.format.toUpperCase()} durée ${dur} s`, Math.abs(fmtDur - dur) <= tol, fmtDur.toFixed(3) + ' s');
    check(`  ${o.format.toUpperCase()} son ${audio || 'absent'}`, audio ? !!a && a.codec_name === audio && Math.abs(aDur - dur) <= 0.08 : !a, a ? `${a.codec_name} ${aDur.toFixed(3)} s` : 'aucun');
    if (o.format === 'mov') check('  MOV canal alpha (yuva444p)', /^yuva444p/.test(v.pix_fmt), v.pix_fmt);
    if (o.format === 'webm') check('  WebM canal alpha (alpha_mode 1)', v.tags && v.tags.alpha_mode === '1', JSON.stringify(v.tags || {}));
    if (o.format === 'mp4') check('  MP4 yuv420p (lecture partout)', v.pix_fmt === 'yuv420p', v.pix_fmt);
    if (alpha) {
      // pixels réellement transparents (fond) et opaques (encres) dans la première image décodée
      const d = decode(file, { vp9: o.format === 'webm' }), f0 = d.frames[0];
      let min = 255, max = 0; for (let i = 3; i < f0.length; i += 4) { if (f0[i] < min) min = f0[i]; if (f0[i] > max) max = f0[i]; }
      check(`  ${o.format.toUpperCase()} transparence dans l'image (alpha ${min} → ${max})`, min === 0 && max === 255);
    }
  }

  /* ---------- Projet vidéo avec la vraie vidéo ---------- */
  console.log('\n■ Projet vidéo (vraie vidéo)');
  await inPage('V.resetInOut();');
  await showFrame(37, false); await settle();
  const PROJ = join(work, 'projet', 'mire.glyphotrame.json');
  const text = await inPage(`V.seekFrame(37); return P.projectWriter()(${JSON.stringify(PROJ)});`);
  const before = await inPage('const s = I.session.get(); return JSON.stringify([s.vTime, s.vIn, s.vOut, R.getSource().raw.width]);');
  const shot = () => inPage(`const c = R.getSource().raw; return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 97 === 0)).join(',');`);
  const imgBefore = await shot();
  await inPage('A.loadSample();'); await settle();
  await inPage(`await P.applyProject(PF.parseProject(${JSON.stringify(text)}), ${JSON.stringify(PROJ)}, 'mire.glyphotrame.json');`); await settle();
  check('Chemin relatif enregistré', JSON.parse(text).image.relatif === '../mire.mp4', JSON.parse(text).image.relatif);
  check('Rouvert à l\'image 37, même plage', (await inPage('const s = I.session.get(); return JSON.stringify([s.vTime, s.vIn, s.vOut, R.getSource().raw.width]);')) === before, before);
  check('Image de la vidéo identique à celle de la navigation', (await shot()) === imgBefore);

  const errs = app.logs.filter((l) => !/Réglages ignorés/.test(l));
  console.log(`\n${total - ko}/${total} vérifications réussies` + (errs.length ? `\nConsole :\n${errs.join('\n')}` : ' · console sans erreur'));
} catch (e) {
  ko++;
  console.error('\n✗ ' + (e && e.stack || e));
} finally {
  if (app) await app.close();
  if (process.env.KEEP) console.log('Dossier de travail : ' + work);
  else try { rmSync(work, { recursive: true, force: true }); } catch { /* fichiers encore ouverts */ }
}
process.exit(ko ? 1 : 0);
