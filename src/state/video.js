/* Vidéo (docs/video.md, étape 1) : ouvrir une vidéo, afficher une image avec l'effet.
   La source devient { kind: 'video', path, meta, time } ; son canvas est l'image de l'instant `time`.
   Tout le reste (aperçu, avant / après, pipette, plume, exports d'image) marche donc sans changement. */
import { settings, session, toast } from './index.js';
import * as R from './renderer.js';
import { videoInfo, videoFrame } from '../platform/ffmpeg.js';

// file = { name, path } ; maxDim : taille max (par défaut celle des réglages) ; rend true si la vidéo est ouverte
// silent : aucun message d'erreur (essai de plusieurs chemins à l'ouverture d'un projet)
export async function loadVideo(file, { quiet = false, maxDim, silent = false } = {}) {
  if (!file) return false;
  try {
    const meta = await videoInfo(file.path);
    const canvas = await videoFrame(file.path, 0, maxDim || settings.get().srcMax);
    R.setSource(canvas, file.name, null, { kind: 'video', path: file.path, meta, time: 0 });
    session.set({ dirty: true });
    if (!quiet) toast(`Vidéo ouverte : ${file.name} · ${formatDuration(meta.duree)} · ${formatFps(meta.cadence)}`);
    return true;
  } catch (e) {
    if (!silent) toast(typeof e === 'string' ? e : e.message);
    return false;
  }
}

// taille max changée : nouvelle image au même instant, à la nouvelle taille (la dernière demande gagne)
let refetch = 0;
settings.subscribe((next, prev) => {
  const src = R.getSource();
  if (next.srcMax === prev.srcMax || !src || src.kind !== 'video') return;
  const id = ++refetch;
  videoFrame(src.path, src.time, next.srcMax)
    .then((canvas) => { if (id === refetch && R.getSource() && R.getSource().path === src.path) R.replaceImage(canvas); })
    .catch((e) => toast(typeof e === 'string' ? e : e.message));
});

/* ---------- Affichage ---------- */
// 75,4 → « 1:15,4 »
export function formatDuration(s) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1).replace('.', ',')}`;
}
// 29.97 → « 29,97 i/s »
export const formatFps = (f) => `${Math.round(f * 100) / 100}`.replace('.', ',') + ' i/s';
