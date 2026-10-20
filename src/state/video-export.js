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
import { openFrameChannel } from '../platform/frame-channel.js';
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

/* ---------- Mesure du temps par image (docs/video.md, étape 6) ----------
   lire : attente de l'image décodée · image : pixels → canvas · calcul : détourage + grille ·
   gpu : dessin (jusqu'à sa fin) · pixels : lecture des pixels rendus · ecrire : envoi à l'encodeur */
export const PROFILE_STAGES = ['lire', 'image', 'calcul', 'gpu', 'pixels', 'ecrire'];
const newProfile = () => Object.fromEntries(PROFILE_STAGES.map((k) => [k, 0]));
// moyennes par image (ms), et temps total réel par image
function averages(prof, n, elapsed) {
  const a = {};
  for (const k of PROFILE_STAGES) a[k] = n ? prof[k] / n : 0;
  a.total = n ? elapsed / n : 0;
  return a;
}

const errText = (e) => (typeof e === 'string' ? e : e && e.message) || String(e);

// o : réglages de la fenêtre ; dest : destination déjà choisie (sinon boîte Enregistrer / dossier) ;
// canal : false = pixels par l'IPC seulement (vérification du secours par compare:video)
export async function exportVideo(o, dest = null, { canal = true } = {}) {
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

  let fr = null, info = null, ch = null;
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
    // pixels par le canal WebSocket local (rapide, images décodées envoyées d'avance), sinon par l'IPC
    ch = canal ? await openFrameChannel(info.canal) : null;
    const id = info.id;
    const read = ch ? ch.next : async () => { const b = await invoke('export_lire_image', { id }); return b.byteLength ? b : null; };
    const write = ch ? ch.send : (px) => invoke('export_ecrire_image', px, { headers: { id: String(id) } });
    const t0 = performance.now();
    let n = 0, lastUi = 0;
    // temps cumulés de chaque étape (ms), affichés en moyenne par image
    const prof = newProfile();
    session.set({ vExport: { ...session.get().vExport, total: info.images } });
    for (;;) {
      if (cancelRequested) throw new Error('annulé');
      let t = performance.now();
      const buf = await read();
      if (!buf) break;
      const t1 = performance.now();
      prof.lire += t1 - t;
      const image = pixelsToCanvas(buf, info.largeur, info.hauteur);
      t = performance.now();
      prof.image += t - t1;
      const px = fr.render(image, info.debut + n / info.cadence, meta, prof);
      t = performance.now();
      await write(px);
      prof.ecrire += performance.now() - t;
      n++;
      const now = performance.now();
      if (now - lastUi > 150 || n === info.images) {
        lastUi = now;
        const per = (now - t0) / n;
        session.set({ vExport: { ...session.get().vExport, n, eta: (per * Math.max(0, info.images - n)) / 1000, fps: 1000 / per, prof: averages(prof, n, now - t0) } });
      }
    }
    // par le canal, les dernières images peuvent être encore en route : export_fin attend qu'elles soient écrites
    const fin = await invoke('export_fin', { id: info.id, images: n });
    info = null;
    const secs = (performance.now() - t0) / 1000, avg = averages(prof, n, secs * 1000);
    // part de la lecture / écriture passée à attendre ffmpeg (mesurée côté Rust) ; le reste est le transfert
    // (par le canal, l'écriture vers l'encodeur se fait en parallèle du rendu)
    avg.decodeur = n ? fin.attenteDecodeur / n : 0;
    avg.encodeur = n ? fin.attenteEncodeur / n : 0;
    avg.canal = ch ? 'websocket' : 'ipc';
    console.info('Export vidéo, ms par image :', JSON.stringify(avg));
    session.set({ vExport: { phase: 'done', n: fin.images, total: fin.images, name: fin.chemin.split(/[\\/]/).pop(), path: fin.chemin, secs, prof: avg } });
  } catch (e) {
    // erreur de l'encodeur pendant l'échange par le canal : son message, rendu par export_annuler
    const msg = info ? await invoke('export_annuler', { id: info.id }).catch(() => null) : null;
    if (cancelRequested) { session.set({ vExport: null }); toast('Export vidéo annulé.'); }
    else { console.error(e); session.set({ vExport: { phase: 'error', msg: msg || errText(e) } }); }
  } finally {
    if (ch) ch.close();
    if (fr) fr.dispose();
  }
}
