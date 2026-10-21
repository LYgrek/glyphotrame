// Notes de version (docs/versions.md) et contrôle du tag, pour le workflow de publication.
//   node tools/release-notes.mjs v1.2.0
// Vérifie que le tag correspond à la version de package.json, tauri.conf.json, Cargo.toml et des projets,
// puis écrit les notes de cette version : dans $GITHUB_OUTPUT (sortie « notes ») sous GitHub Actions,
// sinon dans la console. Voir docs/notes.md, « Publier une version ».
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// texte sous « ## X.Y.Z » jusqu'au titre suivant, ou null
export function notesFor(md, version) {
  const lines = md.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim() || null;
}

// versions lues dans chaque fichier
export function versions() {
  return {
    'package.json': JSON.parse(read('package.json')).version,
    'src-tauri/tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
    'src-tauri/Cargo.toml': read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1],
    'src/state/project-format.js': read('src/state/project-format.js').match(/APP_VERSION = '([^']+)'/)[1]
  };
}

export const readNotes = (version) => notesFor(read('docs/versions.md'), version);

function main() {
  const tag = process.argv[2];
  if (!tag) { console.error('Usage : node tools/release-notes.mjs vX.Y.Z'); process.exit(1); }
  const v = versions(), version = v['package.json'];
  const wrong = Object.entries(v).filter(([, x]) => x !== version);
  if (wrong.length) { console.error('Versions différentes : ' + JSON.stringify(v)); process.exit(1); }
  if (tag !== `v${version}`) { console.error(`Le tag ${tag} ne correspond pas à la version ${version} (attendu : v${version}).`); process.exit(1); }
  const notes = readNotes(version);
  if (!notes) { console.error(`Pas de notes pour ${version} : ajoute une section « ## ${version} » dans docs/versions.md.`); process.exit(1); }
  if (process.env.GITHUB_OUTPUT) {
    const fin = 'FIN_DES_NOTES_' + Date.now();
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nnotes<<${fin}\n${notes}\n${fin}\n`);
    console.log(`Version ${version}, notes :\n${notes}`);
  } else console.log(notes);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
