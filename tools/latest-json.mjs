// Crée latest.json (manifeste des mises à jour) après un build signé fait sur ce PC (npm run release:local) :
//   node tools/latest-json.mjs
// Publication habituelle : le workflow GitHub Actions le crée lui-même (docs/notes.md, « Publier une version »).
// Lit la version dans src-tauri/tauri.conf.json, les notes dans docs/versions.md (section « ## X.Y.Z »)
// et les signatures (.sig) à côté des installateurs. Écrit src-tauri/target/release/bundle/latest.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readNotes } from './release-notes.mjs';

const REPO = 'https://github.com/LYgrek/glyphotrame-releases';
const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'));
const { version, productName } = conf;
const bundle = join(ROOT, 'src-tauri/target/release/bundle');

const notes = readNotes(version);
if (!notes) { console.error(`Ajoute une section « ## ${version} » dans docs/versions.md.`); process.exit(1); }

const files = {
  nsis: join('nsis', `${productName}_${version}_x64-setup.exe`),
  msi: join('msi', `${productName}_${version}_x64_fr-FR.msi`)
};
const entry = (rel) => {
  const sig = join(bundle, rel + '.sig');
  if (!existsSync(sig)) { console.error(`Signature introuvable : ${sig}\nLancer le build avec tools/build-release.ps1 (clé privée).`); process.exit(1); }
  const name = rel.split(/[\\/]/).pop();
  return { signature: readFileSync(sig, 'utf8').trim(), url: `${REPO}/releases/download/v${version}/${name}` };
};

// NSIS : installateur principal (clé par défaut) ; MSI : pour les installations faites avec le .msi
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': entry(files.nsis),
    'windows-x86_64-msi': entry(files.msi)
  }
};
const out = join(bundle, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`latest.json écrit : ${out}\nÀ publier dans la release v${version} avec :\n  ${join(bundle, files.nsis)}\n  ${join(bundle, files.msi)}`);
