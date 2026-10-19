/* ffmpeg et ffprobe, embarqués comme « sidecars » Tauri (voir docs/video.md).
   Ils ne sont lancés que par des commandes Rust dédiées (src-tauri/src/lib.rs) :
   l'interface n'a aucune permission pour exécuter un programme. */
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from './files.js';

// première ligne de « ffmpeg -version » et « ffprobe -version » ; null hors de Tauri
export async function ffmpegVersion() {
  if (!inTauri()) return null;
  return invoke('version_ffmpeg');
}
