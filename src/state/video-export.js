/* Vidéo, étape 4 : export (docs/video.md). Boucle lire → rendre → écrire :
   le décodeur ffmpeg (Rust) donne les images de la plage, chaque image est rendue avec l'effet
   (frame.js, réglages figés au lancement), puis envoyée en binaire brut à l'encodeur ffmpeg.
   Les réglages sont copiés au lancement : on peut continuer à travailler pendant l'export. */
import { invoke } from '@tauri-apps/api/core';
import { settings, session, toast } from './index.js';
import { defaultExportOptions } from './export-options.js';
import * as R from './renderer.js';
import { pause, frameCount, rangeFrames } from './video.js';
import { createFrameRenderer, outputSize, pixelsToCanvas } from './frame.js';
import { chooseVideoDestination, revealFile, inTauri } from '../platform/files.js';
import { dirname, resolvePath } from '../platform/paths.js';

// formats proposés : extension, transparence, son
export const FORMATS = {
  mp4: { label: 'MP4', name: 'MP4 · H.264', hint: 'Réseaux sociaux, lecture partout.', alpha: false, sound: true },
  mov: { label: 'MOV', name: 'MOV · ProRes 4444', hint: 'Avec transparence, pour After Effects / Premiere. Fichier lourd.', alpha: true, sound: true },
  webm: { label: 'WebM', name: 'WebM · VP9', hint: 'Avec transparence, pour le web.', alpha: true, sound: true },
  png: { label: 'PNG', name: 'Séquence PNG', hint: 'Une image par fichier (nom_00001.png…) dans le dossier choisi, avec transparence.', alpha: true, sound: false },
  gif: { label: 'GIF', name: 'GIF animé', hint: '800 px de large au plus, 15 images/s conseillées.', alpha: false, sound: false }
};
export const GIF_MAX = 800;

export { defaultExportOptions };

export const openVideoExport = () => { if (session.get().video) session.set({ vExportOpen: true }); };
export const closeVideoExport = () => session.set({ vExportOpen: false });

// taille de la sortie pour ces réglages → { W, H } (paires) ; null sans grille
export function exportSize(o) {
  const g = R.getGrid(), v = session.get().video;
  if (!g || !v) return null;
  let width = o.taille === 'origine' ? v.meta.largeur : g.W;
  if (o.format === 'gif') width = Math.min(width, GIF_MAX);
  return { width, ...outputSize(g, width) };
}

let cancelRequested = false;
export const cancelVideoExport = () => { cancelRequested = true; };
export const closeExportStatus = () => session.set({ vExport: null });
export const revealExport = () => { const e = session.get().vExport; if (e && e.path) revealFile(e.path).catch((err) => toast(String(err))); };

const errText = (e) => (typeof e === 'string' ? e : e && e.message) || String(e);

// o : réglages de la fenêtre ; dest : destination déjà choisie (sinon boîte Enregistrer / dossier)
export async function exportVideo(o, dest = null) {
  const src = R.getSource(), g = R.getGrid();
  if (!src || src.kind !== 'video' || !g) return;
  if (!inTauri()) { toast("L'export vidéo n'est possible que dans l'application."); return; }
  if (session.get().vExport && session.get().vExport.phase === 'run') { toast('Un export vidéo est déjà en cours.'); return; }
  pause();
  const f = FORMATS[o.format], st = settings.get(), meta = src.meta;
  // destination : à côté de la vidéo d'origine par défaut
  try { if (!dest) dest = await chooseVideoDestination(resolvePath(dirname(src.path), `${src.slug}-glyphotrame.${o.format}`), o.format); }
  catch (e) { toast(errText(e)); return; }
  if (!dest) return;
  session.set({ vExportOpen: false, vExportOpts: o });

  const size = exportSize(o);
  const opaque = !st.transparent || !f.alpha;
  if (st.transparent && !f.alpha) toast(`Le ${f.label} n'a pas de transparence : la vidéo aura un fond plein.`);
  const [inF, outF] = rangeFrames();
  const [debut, images] = o.plage === 'es' ? [inF, outF - inF + 1] : [0, frameCount()];
  const outName = o.format === 'png' ? `${src.slug}-glyphotrame_00001.png…` : dest.split(/[\\/]/).pop();

  let fr = null, info = null;
  cancelRequested = false;
  session.set({ vExport: { phase: 'run', n: 0, total: images, name: outName, eta: null, fps: 0 } });
  try {
    fr = await createFrameRenderer(st, { width: size.width, opaque, gpu: session.get().rendu === 'gpu', W: size.W, H: size.H });
    info = await invoke('export_debut', {
      reglages: {
        chemin: src.path, sortie: dest, prefixe: `${src.slug}-glyphotrame`, format: o.format, qualite: o.qualite,
        debut, images, cadence: o.cadence, largeur: size.W, hauteur: size.H, tailleSource: st.srcMax,
        son: !!o.son, transparent: !opaque
      }
    });
    const t0 = performance.now();
    let n = 0, lastUi = 0;
    session.set({ vExport: { ...session.get().vExport, total: info.images } });
    for (;;) {
      if (cancelRequested) throw new Error('annulé');
      const buf = await invoke('export_lire_image', { id: info.id });
      if (!buf.byteLength) break;
      const px = fr.render(pixelsToCanvas(buf, info.largeur, info.hauteur), info.debut + n / info.cadence, meta);
      await invoke('export_ecrire_image', px, { headers: { id: String(info.id) } });
      n++;
      const now = performance.now();
      if (now - lastUi > 150 || n === info.images) {
        lastUi = now;
        const per = (now - t0) / n;
        session.set({ vExport: { ...session.get().vExport, n, eta: (per * Math.max(0, info.images - n)) / 1000, fps: 1000 / per } });
      }
    }
    const fin = await invoke('export_fin', { id: info.id });
    info = null;
    session.set({ vExport: { phase: 'done', n: fin.images, total: fin.images, name: fin.chemin.split(/[\\/]/).pop(), path: fin.chemin, secs: (performance.now() - t0) / 1000 } });
  } catch (e) {
    if (info) await invoke('export_annuler', { id: info.id }).catch(() => {});
    if (cancelRequested) { session.set({ vExport: null }); toast('Export vidéo annulé.'); }
    else { console.error(e); session.set({ vExport: { phase: 'error', msg: errText(e) } }); }
  } finally {
    if (fr) fr.dispose();
  }
}
