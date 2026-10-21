// Le numéro de version doit être le même partout (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../../src/state/project-format.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('version identique : package.json, tauri.conf.json, Cargo.toml, projets', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const conf = JSON.parse(read('src-tauri/tauri.conf.json')).version;
  const cargo = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1];
  assert.equal(conf, pkg);
  assert.equal(cargo, pkg);
  assert.equal(APP_VERSION, pkg);
});

test('notes de version présentes pour la version courante (docs/versions.md)', () => {
  const pkg = JSON.parse(read('package.json')).version;
  assert.match(read('docs/versions.md').replace(/\r/g, ''), new RegExp(`^## ${pkg.replace(/\./g, '\.')}\n`, 'm'));
});
