// Tests du format de projet et des chemins (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, mergeSettings, PROJECT_VERSION } from '../../src/state/project-format.js';
import { defaultSettings } from '../../src/state/defaults.js';
import { relativePath, resolvePath, dirname, fileName } from '../../src/platform/paths.js';

test('aller-retour : les réglages et l\'image reviennent à l\'identique', () => {
  const s = { ...defaultSettings(), effect: 'halftone', htShape: 'etoile', gCurve: [0.1, 0.9, 0.5, 0.2], grad: true, gShape: 'libre' };
  s.gPath = { closed: true, nodes: [{ x: 0.1, y: 0.2, hin: [0, 0], hout: [0.1, 0], smooth: false }, { x: 0.5, y: 0.6, hin: [-0.1, 0], hout: [0, 0], smooth: true }] };
  const image = { nom: 'photo.jpg', chemin: 'C:\\Images\\photo.jpg', relatif: '../Images/photo.jpg' };
  const p = parseProject(serializeProject({ settings: s, image }));
  assert.deepEqual(p.settings, s);
  assert.deepEqual(p.image, image);
  assert.deepEqual(p.ignored, []);
});

test('fusion : clés inconnues ou mal typées écartées, clés manquantes par défaut', () => {
  const { settings, ignored } = mergeSettings({ size: 20, inconnue: 1, weight: 'gras', gCurve: [1, 2], gPath: { closed: 'non' }, width: NaN });
  const d = defaultSettings();
  assert.equal(settings.size, 20);
  assert.equal(settings.weight, d.weight);
  assert.deepEqual(settings.gCurve, d.gCurve);
  assert.deepEqual(settings.gPath, d.gPath);
  assert.equal(settings.width, d.width);
  assert.equal(settings.mode, d.mode);
  assert.deepEqual(ignored.sort(), ['gCurve', 'gPath', 'inconnue', 'weight', 'width']);
});

test('fichiers refusés avec un message clair', () => {
  assert.throws(() => parseProject('pas du json'), /JSON illisible/);
  assert.throws(() => parseProject('{"format":"autre"}'), /pas un projet Glyphotrame/);
  assert.throws(() => parseProject(JSON.stringify({ format: 'glyphotrame-projet', version: PROJECT_VERSION + 1 })), /plus récente/);
});

test('chemins Windows : relatif, résolu, autre lecteur', () => {
  assert.equal(relativePath('C:\\Projets\\Affiche', 'C:\\Projets\\Affiche\\images\\a.png'), 'images/a.png');
  assert.equal(relativePath('C:\\Projets\\Affiche', 'c:\\projets\\Photos\\b.jpg'), '../Photos/b.jpg');
  assert.equal(relativePath('C:\\Projets', 'D:\\Photos\\b.jpg'), null);
  assert.equal(resolvePath('C:\\Projets\\Affiche', '../Photos/b.jpg'), 'C:\\Projets\\Photos\\b.jpg');
  assert.equal(resolvePath('E:\\Copie\\Affiche', 'images/a.png'), 'E:\\Copie\\Affiche\\images\\a.png');
  assert.equal(dirname('C:\\Projets\\Affiche\\p.json'), 'C:\\Projets\\Affiche');
  assert.equal(fileName('C:\\Projets\\Affiche\\p.json'), 'p.json');
});

test('chemins Unix', () => {
  assert.equal(relativePath('/Users/enzo/Projets', '/Users/enzo/Images/a.png'), '../Images/a.png');
  assert.equal(relativePath('/Users/enzo', '/Volumes/Disque/a.png'), '../../Volumes/Disque/a.png');
  assert.equal(resolvePath('/Users/enzo/Projets', '../Images/a.png'), '/Users/enzo/Images/a.png');
  assert.equal(dirname('/a/b.json'), '/a');
  assert.equal(dirname('/b.json'), '/');
});
