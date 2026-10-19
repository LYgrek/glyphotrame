/* ffmpeg et ffprobe, embarqués comme « sidecars » Tauri (voir docs/video.md).
   Ils ne sont lancés que par des commandes Rust dédiées (src-tauri/src/lib.rs, video.rs) :
   l'interface n'a aucune permission pour exécuter un programme. */
import { invoke } from '@tauri-apps/api/core';
import { createCanvas } from '../engine/index.js';
import { inTauri } from './files.js';

// première ligne de « ffmpeg -version » et « ffprobe -version » ; null hors de Tauri
export async function ffmpegVersion() {
  if (!inTauri()) return null;
  return invoke('version_ffmpeg');
}

const notInApp = () => new Error("Les vidéos ne s'ouvrent que dans l'application (ffmpeg n'est pas disponible dans un navigateur).");

// informations d'une vidéo (ffprobe) :
// { largeur, hauteur (affichées, rotation comprise), duree (s), cadence (i/s), images, rotation, son, codec }
export async function videoInfo(path) {
  if (!inTauri() || !path) throw notInApp();
  return invoke('infos_video', { chemin: path });
}

// pixels RGBA reçus (après un en-tête de `skip` octets) → canvas
function toCanvas(buf, w, h, skip) {
  const c = createCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf, skip, w * h * 4), w, h), 0, 0);
  return c;
}

/* ---------- Lecture continue (aperçu) ---------- */
// démarre une lecture à l'instant `time`, images de plus grand côté ≤ maxDim → numéro de session
export async function playStart(path, time, maxDim) {
  if (!inTauri() || !path) throw notInApp();
  return invoke('lecture_debut', { chemin: path, temps: time, tailleMax: Math.round(maxDim) });
}
// prochaine image de numéro ≥ target (les images en retard sont sautées côté Rust)
// → { canvas, index } (index depuis le début de la session) ou null à la fin de la vidéo
export async function playFrame(id, target) {
  const buf = await invoke('lecture_image', { id, cible: Math.max(0, Math.floor(target)) });
  if (!buf.byteLength) return null;
  const head = new DataView(buf, 0, 12), w = head.getUint32(0, true), h = head.getUint32(4, true);
  return { canvas: toCanvas(buf, w, h, 12), index: head.getUint32(8, true) };
}
export const playStop = (id) => invoke('lecture_fin', { id });

// image de la vidéo à l'instant `time` (s), plus grand côté ≤ maxDim → canvas
export async function videoFrame(path, time, maxDim) {
  if (!inTauri() || !path) throw notInApp();
  const buf = await invoke('image_video', { chemin: path, temps: time, tailleMax: Math.round(maxDim) });
  const head = new DataView(buf, 0, 8), w = head.getUint32(0, true), h = head.getUint32(4, true);
  const c = createCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf, 8, w * h * 4), w, h), 0, 0);
  return c;
}
