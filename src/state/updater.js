/* Mises à jour automatiques (plugins updater et process de Tauri, voir docs/notes.md « Mises à jour »).
   Au démarrage : recherche discrète (aucun message si hors ligne ou si l'adresse ne répond pas).
   Depuis l'en-tête : recherche à la demande, avec un message dans tous les cas.
   Fenêtre (ui/UpdateDialog.jsx) pilotée par session.update :
     null | { phase: 'available' | 'save' | 'download' | 'install' | 'error', version, notes, received, total, msg } */
import { session, toast } from './index.js';
import { saveProject } from './project.js';
import { APP_VERSION } from './project-format.js';
import { inTauri } from '../platform/files.js';

let pending = null;      // objet Update du plugin (non sérialisable, gardé hors du store)
let checking = false;

// numéro de version de l'application (celui de tauri.conf.json dans Tauri)
export async function loadAppVersion() {
  if (!inTauri()) return;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    session.set({ appVersion: await getVersion() });
  } catch { /* garde APP_VERSION */ }
}

// manual : demandé depuis l'en-tête (message même s'il n'y a rien de neuf ou en cas d'erreur)
export async function checkForUpdates({ manual = false } = {}) {
  if (!inTauri()) { if (manual) toast("Les mises à jour ne sont disponibles que dans l'application installée."); return; }
  if (checking || session.get().update) return;
  checking = true;
  if (manual) session.set({ updateChecking: true });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check({ timeout: 15000 });
    if (u) {
      pending = u;
      session.set({ update: { phase: 'available', version: u.version, notes: (u.body || '').trim(), received: 0, total: 0 } });
    } else if (manual) toast(`Glyphotrame ${session.get().appVersion || APP_VERSION} est à jour.`);
  } catch (e) {
    console.info('Recherche de mise à jour impossible :', e);
    if (manual) toast('Impossible de rechercher les mises à jour. Vérifie ta connexion à Internet.');
  } finally {
    checking = false;
    if (manual) session.set({ updateChecking: false });
  }
}

// « Plus tard » : la fenêtre ne reviendra qu'au prochain démarrage ou à la prochaine recherche
export function postponeUpdate() {
  const u = session.get().update;
  if (!u || u.phase === 'download' || u.phase === 'install') return;
  pending = null;
  session.set({ update: null });
}

const setPhase = (patch) => session.set({ update: { ...session.get().update, ...patch } });

// « Installer maintenant » : proposer d'enregistrer le projet avant le redémarrage
export function installUpdate() {
  const s = session.get();
  if (!pending || !s.update) return;
  if (s.vExport && s.vExport.phase === 'run') { toast("Un export vidéo est en cours : attends la fin avant d'installer la mise à jour."); return; }
  if (s.dirty) { setPhase({ phase: 'save' }); return; }
  download();
}

// enregistrer le projet, puis installer (enregistrement annulé ou en échec : on reste sur la question)
export async function saveThenInstall() {
  if (await saveProject()) download();
}

export const installWithoutSaving = () => download();
export const backToUpdate = () => setPhase({ phase: 'available' });

// téléchargement (barre de progression), installation, redémarrage.
// Windows : l'installateur NSIS ferme l'application puis la relance lui-même (mode passif) ;
// macOS / Linux : redémarrage par le plugin process.
async function download() {
  setPhase({ phase: 'download', received: 0, total: 0, msg: null });
  let received = 0;
  try {
    await pending.download((ev) => {
      if (ev.event === 'Started') setPhase({ total: ev.data.contentLength || 0 });
      else if (ev.event === 'Progress') { received += ev.data.chunkLength; setPhase({ received }); }
    });
    setPhase({ phase: 'install' });
    await pending.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.error(e);
    setPhase({ phase: 'error', msg: String(e && e.message || e) });
  }
}
