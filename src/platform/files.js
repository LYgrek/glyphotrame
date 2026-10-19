/* Fichiers : boîtes de dialogue natives Ouvrir / Enregistrer et glisser-déposer (Tauri).
   Hors de Tauri (npm run dev dans un navigateur), repli sur le sélecteur de fichier
   et le téléchargement du navigateur, pratique pour développer et tester. */
import { open, save, ask } from '@tauri-apps/plugin-dialog';
import { readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon'
};
const FILTERS = {
  png: { name: 'Image PNG', extensions: ['png'] },
  jpg: { name: 'Image JPEG', extensions: ['jpg', 'jpeg'] },
  svg: { name: 'Image SVG', extensions: ['svg'] },
  html: { name: 'Page HTML', extensions: ['html'] },
  txt: { name: 'Texte', extensions: ['txt'] }
};

export const fileName = (path) => path.split(/[\\/]/).pop();
// vidéos : lues par ffmpeg côté Rust (src/platform/ffmpeg.js), jamais chargées en mémoire par l'interface
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'];
export const isVideoPath = (path) => VIDEO_EXTENSIONS.includes((path.split('.').pop() || '').toLowerCase());
const mimeOf = (path) => MIME[(path.split('.').pop() || '').toLowerCase()] || '';

// lit un fichier image depuis son chemin → { blob, name, path }
export async function readImagePath(path) {
  const bytes = await readFile(path);
  return { blob: new Blob([bytes], { type: mimeOf(path) }), name: fileName(path), path };
}

// boîte « Ouvrir » (images et vidéos) → image { blob, name, path }, vidéo { video: true, name, path }, ou null si annulé
export async function chooseMedia() {
  if (!inTauri()) {
    const f = await chooseImageInBrowser('image/*,video/*');
    return f && f.blob.type.startsWith('video/') ? { video: true, name: f.name, path: null } : f;
  }
  const path = await open({
    title: 'Ouvrir une image ou une vidéo', multiple: false, directory: false,
    filters: [
      { name: 'Images et vidéos', extensions: [...Object.keys(MIME), ...VIDEO_EXTENSIONS] },
      { name: 'Images', extensions: Object.keys(MIME) },
      { name: 'Vidéos', extensions: VIDEO_EXTENSIONS }
    ]
  });
  if (!path) return null;
  return isVideoPath(path) ? { video: true, name: fileName(path), path } : readImagePath(path);
}

// boîte « Ouvrir une image » → { blob, name, path } ou null si annulé
export async function chooseImage() {
  if (!inTauri()) return chooseImageInBrowser();
  const path = await open({
    title: 'Ouvrir une image', multiple: false, directory: false,
    filters: [{ name: 'Images', extensions: Object.keys(MIME) }]
  });
  return path ? readImagePath(path) : null;
}
function chooseImageInBrowser(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => { const f = input.files[0]; resolve(f ? { blob: f, name: f.name } : null); });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// boîte « Enregistrer » puis écriture → { status: 'saved' | 'downloaded' | 'cancelled' | 'error', name, error }
// ('downloaded' : hors de Tauri, le fichier part dans les téléchargements du navigateur)
// data : texte (SVG, HTML, TXT) ou Blob (PNG, JPEG) ; ext : clé de FILTERS
export async function saveFile(defaultName, data, ext) {
  if (!inTauri()) return downloadInBrowser(defaultName, data);
  let path;
  try {
    path = await save({ title: 'Enregistrer', defaultPath: defaultName, filters: [FILTERS[ext]] });
  } catch (error) { return { status: 'error', error }; }
  if (!path) return { status: 'cancelled' };
  try {
    if (typeof data === 'string') await writeTextFile(path, data);
    else await writeFile(path, new Uint8Array(await data.arrayBuffer()));
    return { status: 'saved', name: fileName(path), path };
  } catch (error) { return { status: 'error', error }; }
}
function downloadInBrowser(name, data) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { status: 'downloaded', name };
}

/* ---------- Projets ---------- */
const PROJECT_FILTER = { name: 'Projet Glyphotrame', extensions: ['json'] };

// boîte « Ouvrir un projet » → { path, name, text } ou null si annulé (path null hors de Tauri)
export async function chooseProject() {
  if (!inTauri()) {
    const f = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.addEventListener('change', () => resolve(input.files[0] || null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
    return f ? { path: null, name: f.name, text: await f.text() } : null;
  }
  const path = await open({ title: 'Ouvrir un projet', multiple: false, directory: false, filters: [PROJECT_FILTER] });
  return path ? { path, name: fileName(path), text: await readTextFile(path) } : null;
}

// enregistre un projet : directement à currentPath s'il est connu, sinon par la boîte « Enregistrer ».
// makeText(chemin) fabrique le contenu (il dépend du chemin, pour le chemin relatif de l'image).
// → { status: 'saved' | 'downloaded' | 'cancelled' | 'error', name, path, error }
export async function saveProjectFile(currentPath, defaultName, makeText) {
  if (!inTauri()) return downloadInBrowser(defaultName, makeText(null));
  let path = currentPath;
  if (!path) {
    try { path = await save({ title: 'Enregistrer le projet', defaultPath: defaultName, filters: [PROJECT_FILTER] }); }
    catch (error) { return { status: 'error', error }; }
    if (!path) return { status: 'cancelled' };
  }
  try {
    await writeTextFile(path, makeText(path));
    return { status: 'saved', name: fileName(path), path };
  } catch (error) { return { status: 'error', error }; }
}

// image enregistrée dans un projet, lue par son chemin (commande Rust lire_image) → { blob, name, path }
export async function readImageAtPath(path) {
  if (!inTauri()) throw new Error('Image introuvable.');
  const bytes = await invoke('lire_image', { chemin: path });
  return { blob: new Blob([bytes], { type: mimeOf(path) }), name: fileName(path), path };
}

// question oui / non (boîte native dans Tauri)
export async function askYesNo(message, { title = 'Glyphotrame', ok = 'Oui', cancel = 'Annuler' } = {}) {
  if (!inTauri()) return window.confirm(message);
  return ask(message, { title, kind: 'warning', okLabel: ok, cancelLabel: cancel });
}

// glisser-déposer de fichiers sur la fenêtre ; rend une fonction pour arrêter l'écoute.
// drop reçoit { blob, name } (ou une erreur de lecture)
export function onFileDrop({ enter, leave, drop }) {
  if (inTauri()) {
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      const p = e.payload;
      if (p.type === 'enter') enter();
      else if (p.type === 'leave') leave();
      else if (p.type === 'drop') {
        leave();
        if (!p.paths || !p.paths.length) return;
        const path = p.paths[0];
        if (isVideoPath(path)) { drop({ video: true, name: fileName(path), path }); return; }
        try { drop(await readImagePath(path)); }
        catch (error) { drop(null, error); }
      }
    });
    return () => { un.then((f) => f()); };
  }
  // navigateur : glisser-déposer HTML5 (comme la référence)
  let depth = 0;
  const onEnter = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; enter(); } };
  const onLeave = () => { depth = Math.max(0, depth - 1); if (!depth) leave(); };
  const onOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault(); depth = 0; leave();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) drop(f.type.startsWith('video/') ? { video: true, name: f.name, path: null } : { blob: f, name: f.name });
  };
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('dragover', onOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragenter', onEnter);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('drop', onDrop);
  };
}

/* ---------- Export vidéo ---------- */
const VIDEO_FILTERS = {
  mp4: { name: 'Vidéo MP4 (H.264)', extensions: ['mp4'] },
  mov: { name: 'Vidéo MOV (ProRes 4444)', extensions: ['mov'] },
  webm: { name: 'Vidéo WebM (VP9)', extensions: ['webm'] },
  gif: { name: 'GIF animé', extensions: ['gif'] }
};
// destination d'un export vidéo : fichier (boîte Enregistrer), ou dossier pour une séquence PNG ; null si annulé
export async function chooseVideoDestination(defaultPath, ext) {
  if (!inTauri()) throw new Error("L'export vidéo n'est possible que dans l'application.");
  if (ext === 'png') {
    const dir = defaultPath.replace(/[\/][^\/]*$/, '');
    return open({ title: 'Dossier où enregistrer les images PNG', directory: true, multiple: false, defaultPath: dir });
  }
  return save({ title: 'Exporter la vidéo', defaultPath, filters: [VIDEO_FILTERS[ext]] });
}
// montre le fichier dans l'explorateur
export async function revealFile(path) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  return revealItemInDir(path);
}
