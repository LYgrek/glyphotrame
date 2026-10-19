/* Projets : enregistrer et ouvrir un fichier .json (réglages + image), suivi des modifications.
   Format : state/project-format.js. */
import * as E from '../engine/index.js';
import { settings, session, toast } from './index.js';
import * as R from './renderer.js';
import { loadImage, loadMedia } from './actions.js';
import { loadVideo } from './video.js';
import { resetPenHistory } from './pen.js';
import { serializeProject, parseProject } from './project-format.js';
import { chooseProject, saveProjectFile, readImageAtPath, chooseMedia, askYesNo, fileName } from '../platform/files.js';
import { dirname, relativePath, resolvePath } from '../platform/paths.js';

/* ---------- Suivi des modifications ---------- */
let applying = false;
settings.subscribe((next, prev) => {
  if (applying) return;
  const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
  // couleur de fond détectée par le rendu (détourage automatique) : pas un geste de l'utilisateur
  if (changed.length === 1 && changed[0] === 'cutColor' && next.cutAuto) return;
  if (changed.length && !session.get().dirty) session.set({ dirty: true });
});

/* ---------- Enregistrer ---------- */
// description de l'image pour le fichier : chemin (absolu + relatif au projet), image intégrée, ou exemple
function imageRecord(src, projectPath) {
  if (src.exemple) return { exemple: true, nom: src.name };
  // vidéo (étape 1 de docs/video.md) : chemin seulement ; instant et plage viendront à l'étape 5
  if (src.kind === 'video') return { nom: src.name, video: true, chemin: src.path, relatif: projectPath ? relativePath(dirname(projectPath), src.path) : null };
  if (src.path) return { nom: src.name, chemin: src.path, relatif: projectPath ? relativePath(dirname(projectPath), src.path) : null };
  if (src.original && typeof src.original.src === 'string' && src.original.src.startsWith('data:')) return { nom: src.name, donnees: src.original.src };
  return { nom: src.name };
}

// saveAs : toujours demander où enregistrer
export async function saveProject(saveAs = false) {
  const src = R.getSource();
  if (!src) return;
  const { projectPath, projectName } = session.get();
  const st = settings.get();
  const r = await saveProjectFile(saveAs ? null : projectPath, projectName || `${src.slug}.glyphotrame.json`,
    (path) => serializeProject({ settings: st, image: imageRecord(src, path) }));
  if (r.status === 'saved') { session.set({ projectPath: r.path, projectName: r.name, dirty: false }); toast('Projet enregistré : ' + r.name); }
  else if (r.status === 'downloaded') { session.set({ projectName: r.name, dirty: false }); toast('Téléchargement lancé : ' + r.name); }
  else if (r.status === 'cancelled') toast('Enregistrement annulé.');
  else { console.error(r.error); toast("Le projet n'a pas pu être enregistré : " + (r.error && r.error.message || r.error)); }
}

/* ---------- Ouvrir ---------- */
async function blobFromDataURL(url) { return (await fetch(url)).blob(); }

// charge l'image du projet : chemin relatif, chemin absolu, image intégrée ou exemple ; rend false si introuvable
async function loadProjectImage(rec, projectPath, maxDim) {
  if (rec.exemple) { R.setSource(E.makeSample(), rec.nom || 'exemple-sphere.png', null, { exemple: true }); return true; }
  const paths = [];
  if (rec.relatif && projectPath) paths.push(resolvePath(dirname(projectPath), rec.relatif));
  if (rec.chemin) paths.push(rec.chemin);
  if (rec.video) {
    for (const p of paths) if (await loadVideo({ name: rec.nom || fileName(p), path: p }, { quiet: true, maxDim, silent: true })) return true;
    return false;
  }
  for (const p of paths) {
    let file;
    try { file = await readImageAtPath(p); } catch { continue; }
    if (await loadImage(file, { quiet: true, maxDim })) return true;
  }
  if (typeof rec.donnees === 'string' && rec.donnees.startsWith('data:image/')) {
    return loadImage({ blob: await blobFromDataURL(rec.donnees), name: rec.nom || 'image' }, { quiet: true, maxDim });
  }
  return false;
}

// applique un projet lu (parseProject) : image, réglages, historique de la plume
export async function applyProject(data, projectPath = null, name = null) {
  const found = await loadProjectImage(data.image, projectPath, data.settings.srcMax);
  let replaced = false;
  if (!found) {
    const label = data.image.nom || 'image';
    if (await askYesNo(`L'image « ${label} » de ce projet est introuvable. Voulez-vous la rechercher ?`, { title: 'Image introuvable', ok: 'Rechercher…', cancel: 'Garder l’image actuelle' })) {
      try { replaced = await loadMedia(await chooseMedia(), { quiet: true, maxDim: data.settings.srcMax }); } catch { /* annulé */ }
    }
  }
  // après le chargement de l'image (qui remet le détourage en automatique) : les réglages du projet
  applying = true;
  settings.set(data.settings);
  applying = false;
  resetPenHistory();
  // image remplacée ou absente : le projet diffère du fichier, à enregistrer
  session.set({ projectPath, projectName: name || (projectPath ? fileName(projectPath) : null), dirty: !found });
  if (found) toast('Projet ouvert : ' + (name || 'projet'));
  else if (replaced) toast('Projet ouvert avec la nouvelle image. Enregistre-le pour garder ce chemin.');
  else toast("Réglages du projet appliqués à l'image actuelle.");
  if (data.ignored && data.ignored.length) console.warn('Réglages ignorés :', data.ignored.join(', '));
}

export async function openProject() {
  if (session.get().dirty && !(await askYesNo('Les modifications du projet en cours ne sont pas enregistrées. Ouvrir un autre projet quand même ?', { title: 'Modifications non enregistrées', ok: 'Ouvrir quand même' }))) return;
  let f;
  try { f = await chooseProject(); } catch (e) { toast('Impossible de lire ce fichier.'); return; }
  if (!f) return;
  let data;
  try { data = parseProject(f.text); } catch (e) { toast(e.message); return; }
  await applyProject(data, f.path, f.name);
}
