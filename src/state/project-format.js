/* Format des fichiers de projet (.json) : réglages + image. Fonctions pures (testées par npm test).

   {
     "format": "glyphotrame-projet", "version": 1, "application": "0.1.0",
     "image": { "nom", "chemin", "relatif" } | { "nom", "donnees": "data:image/…" } | { "exemple": true },
     "reglages": { … même forme que l'objet state de la référence, + srcMax … }
   }

   À l'ouverture, les réglages sont fusionnés avec les valeurs par défaut : seules les clés connues
   et du bon type sont reprises. Un projet incomplet ou d'une version future reste donc utilisable. */
import { defaultSettings } from './defaults.js';

export const PROJECT_FORMAT = 'glyphotrame-projet';
export const PROJECT_VERSION = 1;
export const APP_VERSION = '0.1.0';

export function serializeProject({ settings, image }) {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, application: APP_VERSION, image, reglages: settings }, null, 2) + '\n';
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
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

// texte du fichier → { settings, image, ignored } ; Error avec un message en français si ce n'est pas un projet lisible
export function parseProject(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Ce fichier n'est pas un projet Glyphotrame (JSON illisible)."); }
  if (!data || data.format !== PROJECT_FORMAT) throw new Error("Ce fichier n'est pas un projet Glyphotrame.");
  if (!isNum(data.version) || data.version > PROJECT_VERSION) throw new Error('Ce projet a été créé par une version plus récente de Glyphotrame.');
  const image = data.image && typeof data.image === 'object' ? data.image : {};
  return { ...mergeSettings(data.reglages), image };
}
