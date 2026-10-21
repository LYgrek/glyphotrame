// Numéro de version et outils de publication (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../../src/state/project-format.js';
import { versions, notesFor, readNotes } from '../release-notes.mjs';
import { nextVersion } from '../release.mjs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('version identique : package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock, projets', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(Object.values(versions()), [pkg, pkg, pkg, pkg]);
  assert.equal(APP_VERSION, pkg);
  assert.equal(lock.version, pkg);
  assert.equal(lock.packages[''].version, pkg);
  assert.match(read('src-tauri/Cargo.lock'), new RegExp(`name = "glyphotrame-app"\\r?\\nversion = "${pkg.replace(/\./g, '\\.')}"`));
});

test('notes de version présentes pour la version courante (docs/versions.md)', () => {
  assert.ok(readNotes(JSON.parse(read('package.json')).version));
});

test('notes : texte de la section, jusqu\'au titre suivant', () => {
  const md = '# Notes\n\nIntro\n\n## 1.1.0\n\n- Nouveau\n- Corrigé\n\n## 1.0.0\n\nPremière version.\n';
  assert.equal(notesFor(md, '1.1.0'), '- Nouveau\n- Corrigé');
  assert.equal(notesFor(md.replace(/\n/g, '\r\n'), '1.0.0'), 'Première version.');
  assert.equal(notesFor(md, '2.0.0'), null);
});

test('version suivante : patch, minor, major', () => {
  assert.equal(nextVersion('1.0.9', 'patch'), '1.0.10');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
});
