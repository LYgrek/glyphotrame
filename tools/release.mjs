// Publier une nouvelle version (docs/notes.md, « Publier une version ») :
//   npm run release -- patch     1.0.0 → 1.0.1 (corrections)
//   npm run release -- minor     1.0.0 → 1.1.0 (nouveautés)
//   npm run release -- major     1.0.0 → 2.0.0 (changements importants)
// Met la version à jour partout, demande les notes de version (docs/versions.md), lance npm test,
// puis, après confirmation : commit « Version X.Y.Z », tag vX.Y.Z et envoi sur GitHub.
// Le tag déclenche le workflow .github/workflows/publier.yml, qui construit et publie la release.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, versions } from './release-notes.mjs';

const KINDS = ['patch', 'minor', 'major'];
const FILES = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock',
  'src/state/project-format.js', 'docs/versions.md'];

const path = (p) => join(ROOT, p);
const read = (p) => readFileSync(path(p), 'utf8');
const write = (p, t) => writeFileSync(path(p), t);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const stop = (msg) => { console.error('\n' + msg); process.exit(1); };

export function nextVersion(v, kind) {
  const [a, b, c] = v.split('.').map(Number);
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

// remplace la première occurrence, en exigeant qu'elle existe
function replaceOnce(file, re, by) {
  const t = read(file);
  if (!re.test(t)) stop(`Version introuvable dans ${file}.`);
  write(file, t.replace(re, by));
}

export function setVersion(v) {
  for (const f of ['package.json', 'package-lock.json']) {
    const j = JSON.parse(read(f));
    j.version = v;
    if (j.packages && j.packages['']) j.packages[''].version = v;
    write(f, JSON.stringify(j, null, 2) + '\n');
  }
  replaceOnce('src-tauri/tauri.conf.json', /("version":\s*")[^"]+(")/, `$1${v}$2`);
  replaceOnce('src-tauri/Cargo.toml', /^(version\s*=\s*")[^"]+(")/m, `$1${v}$2`);
  replaceOnce('src-tauri/Cargo.lock', /(name = "glyphotrame-app"\r?\nversion = ")[^"]+(")/, `$1${v}$2`);
  replaceOnce('src/state/project-format.js', /(APP_VERSION = ')[^']+(')/, `$1${v}$2`);
  replaceOnce('src/state/project-format.js', /("application": ")[^"]+(")/, `$1${v}$2`);
}

// ajoute « ## X.Y.Z » + notes avant la première version de docs/versions.md
export function addNotes(v, lines) {
  const t = read('docs/versions.md'), nl = t.includes('\r\n') ? '\r\n' : '\n';
  const i = t.search(/^## /m);
  const block = [`## ${v}`, '', ...lines, '', ''].join(nl);
  write('docs/versions.md', i < 0 ? t.trimEnd() + nl + nl + block : t.slice(0, i) + block + t.slice(i));
}

async function main() {
  const kind = process.argv[2];
  if (!KINDS.includes(kind)) stop('Usage : npm run release -- patch | minor | major');

  // dépôt propre, sur main, relié à GitHub, à jour
  if (git('status', '--porcelain')) stop('Il reste des modifications non commitées : commite-les (ou annule-les) avant de publier.');
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') stop('Publie depuis la branche main.');
  try { git('remote', 'get-url', 'origin'); } catch { stop('Aucun dépôt GitHub « origin » : voir docs/notes.md, « Publier une version ».'); }
  git('fetch', 'origin', '--tags');
  const behind = git('rev-list', '--count', 'HEAD..origin/main');
  if (behind !== '0') stop(`La branche main a ${behind} commit(s) de retard sur GitHub : fais « git pull » d'abord.`);

  const v = versions(), current = v['package.json'];
  if (Object.values(v).some((x) => x !== current)) stop('Versions différentes selon les fichiers : ' + JSON.stringify(v));
  const next = nextVersion(current, kind);
  if (git('tag', '--list', `v${next}`)) stop(`Le tag v${next} existe déjà.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nGlyphotrame ${current} → ${next}\n`);
  console.log('Notes de version, affichées dans la fenêtre de mise à jour.');
  console.log('Une ligne par point, puis une ligne vide pour terminer :');
  const lines = [];
  for (;;) {
    const l = (await rl.question('  ')).trim();
    if (!l) { if (lines.length) break; console.log('(au moins une ligne)'); continue; }
    lines.push(l.startsWith('-') ? l : `- ${l}`);
  }

  setVersion(next);
  addNotes(next, lines);
  console.log('\nVérifications (npm test)…');
  const test = spawnSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (test.status !== 0) {
    git('checkout', '--', ...FILES);
    rl.close();
    stop('npm test a échoué : rien n\'a été publié, les fichiers ont été remis comme avant.');
  }

  console.log(`\n## ${next}\n${lines.join('\n')}\n`);
  const ok = (await rl.question(`Publier Glyphotrame ${next} sur GitHub ? Les utilisateurs recevront la mise à jour. (o/N) `)).trim().toLowerCase();
  rl.close();
  if (ok !== 'o' && ok !== 'oui') {
    git('checkout', '--', ...FILES);
    stop('Publication annulée : les fichiers ont été remis comme avant.');
  }

  git('add', ...FILES);
  git('commit', '-m', `Version ${next}`);
  git('tag', '-a', `v${next}`, '-m', `Glyphotrame ${next}`);
  // main et le tag ensemble : tout ou rien
  const push = spawnSync('git', ['push', '--atomic', 'origin', 'main', `v${next}`], { cwd: ROOT, stdio: 'inherit' });
  if (push.status !== 0) stop(`L'envoi a échoué. Le commit et le tag v${next} existent sur ce PC : relance « git push --atomic origin main v${next} ».`);

  console.log(`\nVersion ${next} envoyée. Construction et publication en cours (10 à 20 min) :`);
  console.log('  https://github.com/LYgrek/glyphotrame/actions');
  console.log(`Puis : https://github.com/LYgrek/glyphotrame-releases/releases/tag/v${next}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
