/* Fichiers : boîtes de dialogue natives Ouvrir / Enregistrer et glisser-déposer (Tauri).
   Hors de Tauri (npm run dev dans un navigateur), repli sur le sélecteur de fichier
   et le téléchargement du navigateur, pratique pour développer et tester. */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
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
const mimeOf = (path) => MIME[(path.split('.').pop() || '').toLowerCase()] || '';

// lit un fichier image depuis son chemin → { blob, name, path }
export async function readImagePath(path) {
  const bytes = await readFile(path);
  return { blob: new Blob([bytes], { type: mimeOf(path) }), name: fileName(path), path };
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
function chooseImageInBrowser() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => { const f = input.files[0]; resolve(f ? { blob: f, name: f.name } : null); });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// boîte « Enregistrer » puis écriture → { status: 'saved' | 'cancelled' | 'error', name, error }
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
  return { status: 'saved', name };
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
        try { drop(await readImagePath(p.paths[0])); }
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
    if (f) drop({ blob: f, name: f.name });
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
