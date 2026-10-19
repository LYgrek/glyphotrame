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

// image de la vidéo à l'instant `time` (s), plus grand côté ≤ maxDim → canvas
export async function videoFrame(path, time, maxDim) {
  if (!inTauri() || !path) throw notInApp();
  const buf = await invoke('image_video', { chemin: path, temps: time, tailleMax: Math.round(maxDim) });
  const head = new DataView(buf, 0, 8), w = head.getUint32(0, true), h = head.getUint32(4, true);
  const c = createCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf, 8, w * h * 4), w, h), 0, 0);
  return c;
}
