/* Format des fichiers de projet (.json) : réglages + image (ou vidéo). Fonctions pures (testées par npm test).

   {
     "format": "glyphotrame-projet", "version": 2, "application": "1.0.0",
     "image": { "nom", "chemin", "relatif" } | { "nom", "video": true, "chemin", "relatif" }
            | { "nom", "donnees": "data:image/…" } | { "exemple": true },
     "video": { "instant", "entree", "sortie" (secondes), "export": { format, taille, cadence, plage, son, qualite } },
     "reglages": { … même forme que l'objet state de la référence, + srcMax … }
   }

   Version 1 : pas de section « video » (une vidéo s'ouvre au début, toute la plage, export par défaut).
   À l'ouverture, les réglages sont fusionnés avec les valeurs par défaut : seules les clés connues
   et du bon type sont reprises. Un projet incomplet ou plus ancien reste donc utilisable. */
import { defaultSettings } from './defaults.js';
import { mergeExportOptions } from './export-options.js';

export const PROJECT_FORMAT = 'glyphotrame-projet';
export const PROJECT_VERSION = 2;
export const APP_VERSION = '1.0.0';

// video : { instant, entree, sortie, export } pour une vidéo, sinon absent
export function serializeProject({ settings, image, video = null }) {
  const data = { format: PROJECT_FORMAT, version: PROJECT_VERSION, application: APP_VERSION, image };
  if (video) data.video = video;
  data.reglages = settings;
  return JSON.stringify(data, null, 2) + '\n';
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function validPath(p) {
  return p && typeof p === 'object' && typeof p.closed === 'boolean' && Array.isArray(p.nodes)
    && p.nodes.every((n) => n && isNum(n.x) && isNum(n.y) && isPair(n.hin) && isPair(n.hout) && typeof n.smooth === 'boolean');
}
// la valeur lue a-t-elle le même type que la valeur par défaut ?
function sameType(def, v) {
  if (Array.isArray(def)) return Array.isArray(v) && v.length === def.length && v.every(isNum);
  if (typeof def === 'number') return isNum(v);
  if (def && typeof def === 'object') return false;   // objets traités à part (gPath)
  return typeof v === typeof def;
}

// réglages valides, complétés par les valeurs par défaut ; ignored = clés écartées
export function mergeSettings(data) {
  const out = defaultSettings(), ignored = [];
  if (!data || typeof data !== 'object') return { settings: out, ignored: ['reglages'] };
  for (const [k, v] of Object.entries(data)) {
    if (!(k in out)) { ignored.push(k); continue; }
    if (k === 'gPath' ? validPath(v) : sameType(out[k], v)) out[k] = k === 'gPath' || Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : v;
    else ignored.push(k);
  }
  return { settings: out, ignored };
}

// état de la vidéo lu → { instant, entree, sortie (null = fin de la vidéo), export } valides ; ignored = clés écartées.
// Absent (projet de version 1) : début de la vidéo, toute la plage, export par défaut.
// Les temps sont ramenés dans la durée de la vidéo à l'ouverture (clampVideoState).
export function mergeVideo(data) {
  const state = { instant: 0, entree: 0, sortie: null }, ignored = [];
  const d = isObj(data) ? data : {};
  if (data !== undefined && !isObj(data)) ignored.push('video');
  for (const k of ['instant', 'entree', 'sortie']) {
    if (!(k in d)) continue;
    if (isNum(d[k]) && d[k] >= 0) state[k] = d[k];
    else ignored.push('video.' + k);
  }
  if (state.sortie !== null && state.sortie < state.entree) { state.entree = 0; state.sortie = null; ignored.push('video.entree', 'video.sortie'); }
  const ex = mergeExportOptions(d.export);
  state.export = ex.options;
  ignored.push(...ex.ignored.map((k) => 'video.' + k));
  for (const k of Object.keys(d)) if (!['instant', 'entree', 'sortie', 'export'].includes(k)) ignored.push('video.' + k);
  return { state, ignored };
}

// temps ramenés dans [0, durée] : entrée ≤ sortie, instant dans la vidéo
export function clampVideoState(v, duree) {
  const c = (t) => Math.max(0, Math.min(duree, t));
  const entree = c(v.entree), sortie = v.sortie === null ? duree : Math.max(entree, c(v.sortie));
  return { instant: c(v.instant), entree, sortie };
}

// texte du fichier → { settings, image, video, ignored } ; Error avec un message en français si ce n'est pas un projet lisible.
// video : null si le projet n'a pas de vidéo.
export function parseProject(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Ce fichier n'est pas un projet Glyphotrame (JSON illisible)."); }
  if (!data || data.format !== PROJECT_FORMAT) throw new Error("Ce fichier n'est pas un projet Glyphotrame.");
  if (!isNum(data.version) || data.version > PROJECT_VERSION) throw new Error('Ce projet a été créé par une version plus récente de Glyphotrame.');
  const image = isObj(data.image) ? data.image : {};
  const merged = mergeSettings(data.reglages);
  const video = image.video ? mergeVideo(data.video) : { state: null, ignored: [] };
  return { settings: merged.settings, image, video: video.state, ignored: [...merged.ignored, ...video.ignored] };
}
