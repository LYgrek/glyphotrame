/* Vidéo (docs/video.md, étapes 1 et 2) : ouvrir une vidéo, naviguer et lire avec l'effet.
   La source devient { kind: 'video', path, meta, time } ; son canvas est l'image de l'instant `time`.
   Tout le reste (aperçu, avant / après, pipette, plume, exports d'image) marche donc sans changement.

   Navigation à l'image près : l'image n est demandée à l'instant (n − ½) / cadence (testé côté Rust).
   Lecture : session de décodage continu ; les images en retard sur l'horloge sont sautées côté Rust. */
import { settings, session, toast } from './index.js';
import * as R from './renderer.js';
import { penActive } from './pen.js';
import { videoInfo, videoFrame, playStart, playFrame, playStop } from '../platform/ffmpeg.js';

// taille des images pendant la lecture (à la pause, l'image est redemandée à la taille max complète)
const PLAY_MAX = 1280;
const err = (e) => toast(typeof e === 'string' ? e : e.message);

/* ---------- Ouvrir ---------- */
// file = { name, path } ; silent : aucun message d'erreur (essai de plusieurs chemins à l'ouverture d'un projet)
export async function loadVideo(file, { quiet = false, maxDim, silent = false } = {}) {
  if (!file) return false;
  try {
    const meta = await videoInfo(file.path);
    const canvas = await videoFrame(file.path, 0, maxDim || settings.get().srcMax);
    stopPlayback();
    R.setSource(canvas, file.name, null, { kind: 'video', path: file.path, meta, time: 0 });
    session.set({ dirty: true, vTime: 0, vIn: 0, vOut: meta.duree, vPlaying: false, vFps: 0 });
    if (!quiet) toast(`Vidéo ouverte : ${file.name} · ${formatDuration(meta.duree)} · ${formatFps(meta.cadence)}`);
    return true;
  } catch (e) {
    if (!silent) err(e);
    return false;
  }
}

/* ---------- Images et temps ---------- */
const meta = () => (session.get().video ? session.get().video.meta : null);
const fps = () => (meta() && meta().cadence > 0 ? meta().cadence : 25);
export const frameCount = () => (meta() ? Math.max(1, meta().images || Math.round(meta().duree * fps())) : 1);
export const frameOf = (t) => Math.round(t * fps());
const clampFrame = (n) => Math.max(0, Math.min(frameCount() - 1, Math.round(n)));
const requestTime = (n) => Math.max(0, (n - 0.5) / fps());
// plage entrée → sortie, en numéros d'images
export const rangeFrames = () => [inFrame(), Math.max(inFrame(), outFrame())];
const inFrame = () => clampFrame(frameOf(session.get().vIn));
const outFrame = () => clampFrame(Math.min(frameOf(session.get().vOut), frameCount() - 1));

// aller à l'image n : une seule demande en cours, la dernière position gagne
let seekBusy = false, seekWant = null;
export function seekFrame(n, { keepPlaying = false } = {}) {
  if (!meta()) return;
  if (!keepPlaying) stopPlayback();
  n = clampFrame(n);
  session.set({ vTime: n / fps() });
  seekWant = n;
  if (!seekBusy) runSeek();
}
async function runSeek() {
  seekBusy = true;
  while (seekWant !== null) {
    const n = seekWant, src = R.getSource();
    seekWant = null;
    try {
      const canvas = await videoFrame(src.path, requestTime(n), settings.get().srcMax);
      if (R.getSource() && R.getSource().path === src.path) R.replaceImage(canvas, { time: n / fps() });
    } catch (e) { err(e); }
  }
  seekBusy = false;
}
export const stepFrame = (d) => seekFrame(frameOf(session.get().vTime) + d);

/* ---------- Lecture ---------- */
let playToken = 0;
export function stopPlayback() { playToken++; if (session.get().vPlaying) session.set({ vPlaying: false, vFps: 0 }); }
export const togglePlay = () => (session.get().vPlaying ? pause() : play());

export function pause() {
  if (!session.get().vPlaying) return;
  stopPlayback();
  // image courante à la taille max complète (pendant la lecture : PLAY_MAX au plus)
  seekFrame(frameOf(session.get().vTime));
}

export async function play() {
  if (!meta() || session.get().vPlaying) return;
  let start = frameOf(session.get().vTime);
  if (start >= outFrame() || start < inFrame()) start = inFrame();
  const token = ++playToken;
  session.set({ vPlaying: true });
  const path = R.getSource().path;
  const alive = () => token === playToken && R.getSource() && R.getSource().path === path;
  let ended = false;
  while (alive()) {
    let id;
    try { id = await playStart(path, requestTime(start), Math.min(settings.get().srcMax, PLAY_MAX)); }
    catch (e) { err(e); break; }
    const t0 = performance.now(), rate = fps();
    let shown = 0, tFps = t0, restart = false;
    try {
      while (alive()) {
        // image attendue maintenant d'après l'horloge ; les précédentes sont sautées
        const f = await playFrame(id, ((performance.now() - t0) / 1000) * rate);
        const n = f ? start + f.index : Infinity;
        if (!f || n > outFrame()) {
          if (session.get().vLoop) { start = inFrame(); restart = true; }
          else { session.set({ vTime: outFrame() / rate }); stopPlayback(); ended = true; }
          break;
        }
        // en avance : on attend l'heure de l'image
        const due = t0 + (f.index / rate) * 1000 - performance.now();
        if (due > 1) await new Promise((r) => setTimeout(r, due));
        if (!alive()) break;
        R.replaceImage(f.canvas, { time: n / rate });
        session.set({ vTime: n / rate });
        await R.whenRendered();
        // images par seconde réellement affichées, mesurées sur ~1 s
        shown++;
        const now = performance.now();
        if (now - tFps > 1000) { session.set({ vFps: (shown * 1000) / (now - tFps) }); shown = 0; tFps = now; }
      }
    } catch (e) { err(e); stopPlayback(); }
    finally { playStop(id).catch(() => {}); }
    if (!restart) break;
  }
  // source changée (autre image, autre vidéo) ou erreur : la lecture s'arrête
  if (token === playToken) stopPlayback();
  // arrêt de fin de vidéo : image finale à la taille max complète
  if (ended && R.getSource() && R.getSource().path === path) seekFrame(frameOf(session.get().vTime));
}

/* ---------- Points d'entrée et de sortie, boucle ---------- */
export function setIn() {
  const s = session.get(), t = s.vTime;
  session.set({ vIn: t, ...(t >= s.vOut ? { vOut: meta().duree } : {}) });
}
export function setOut() {
  const s = session.get(), t = s.vTime;
  session.set({ vOut: t, ...(t <= s.vIn ? { vIn: 0 } : {}) });
}
export const resetInOut = () => meta() && session.set({ vIn: 0, vOut: meta().duree });
export const toggleLoop = () => session.set({ vLoop: !session.get().vLoop });

/* ---------- Raccourcis ---------- */
// Espace : lecture / pause · ← → : image précédente / suivante (Maj : 10 images) · I / O : entrée / sortie · L : boucle.
// Ignorés dans les champs de saisie, avec la fenêtre Code ouverte, et pour ← → quand la plume a un point sélectionné.
export function onVideoKey(e) {
  if (e.defaultPrevented || !session.get().video || session.get().sheetOpen || session.get().vExportOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, tag = (t && t.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || (t && t.isContentEditable)) return;
  const k = e.key;
  if (k === ' ') {
    // un bouton focalisé se cliquerait aussi au relâchement de la touche : on lui retire le focus
    e.preventDefault();
    if (t && t.closest && t.closest('button, [role="button"], summary')) t.blur();
    togglePlay();
  }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (penActive() && session.get().selNode >= 0) return;
    e.preventDefault();
    stepFrame((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
  }
  else if (k === 'i' || k === 'I') setIn();
  else if (k === 'o' || k === 'O') setOut();
  else if (k === 'l' || k === 'L') toggleLoop();
}

// taille max changée : nouvelle image au même instant, à la nouvelle taille (la dernière demande gagne)
settings.subscribe((next, prev) => {
  if (next.srcMax !== prev.srcMax && session.get().video && !session.get().vPlaying) seekFrame(frameOf(session.get().vTime));
});

/* ---------- Affichage ---------- */
// 75,4 → « 1:15,4 » ; digits : décimales
export function formatDuration(s, digits = 1) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(digits).replace('.', ',')}`;
}
// 29.97 → « 29,97 i/s »
export const formatFps = (f) => `${Math.round(f * 100) / 100}`.replace('.', ',') + ' i/s';
