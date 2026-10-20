// Tests du format de projet et des chemins (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, mergeSettings, mergeVideo, clampVideoState, PROJECT_VERSION } from '../../src/state/project-format.js';
import { defaultExportOptions } from '../../src/state/export-options.js';
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

/* ---------- Vidéo (format version 2) ---------- */
const VIDEO_IMG = { nom: 'clip.mp4', video: true, chemin: 'C:\\Videos\\clip.mp4', relatif: '../Videos/clip.mp4' };

test('vidéo : instant, entrée / sortie et réglages d\'export reviennent à l\'identique', () => {
  const s = { ...defaultSettings(), effect: 'halftone', mode: 'cmyk', fxGrainAnim: true };
  const video = { instant: 1.5, entree: 0.5, sortie: 1.9666666666666666, export: { format: 'webm', taille: 'origine', cadence: 12, plage: 'es', son: false, qualite: 'legere' } };
  const text = serializeProject({ settings: s, image: VIDEO_IMG, video });
  assert.equal(JSON.parse(text).version, 2);
  const p = parseProject(text);
  assert.deepEqual(p.settings, s);
  assert.deepEqual(p.image, VIDEO_IMG);
  assert.deepEqual(p.video, video);
  assert.deepEqual(p.ignored, []);
});

test('vidéo : un projet de version 1 s\'ouvre au début, toute la plage, export par défaut', () => {
  const v1 = JSON.stringify({ format: 'glyphotrame-projet', version: 1, application: '0.1.0', image: VIDEO_IMG, reglages: { effect: 'halftone' } });
  const p = parseProject(v1);
  assert.equal(p.settings.effect, 'halftone');
  assert.deepEqual(p.video, { instant: 0, entree: 0, sortie: null, export: defaultExportOptions() });
  assert.deepEqual(p.ignored, []);
  assert.deepEqual(clampVideoState(p.video, 12.5), { instant: 0, entree: 0, sortie: 12.5 });
  // projet d'image de version 1 : pas d'état vidéo
  const img = parseProject(JSON.stringify({ format: 'glyphotrame-projet', version: 1, image: { nom: 'a.png', chemin: 'C:\a.png' }, reglages: {} }));
  assert.equal(img.video, null);
});

test('vidéo : valeurs invalides écartées, temps ramenés dans la durée', () => {
  const p = parseProject(JSON.stringify({ format: 'glyphotrame-projet', version: 2, image: VIDEO_IMG, reglages: {},
    video: { instant: -3, entree: 'début', sortie: 4, inconnu: 1, export: { format: 'avi', taille: 'origine', cadence: 60, son: 'oui', qualite: 'moyenne', autre: 2 } } }));
  assert.deepEqual(p.video, { instant: 0, entree: 0, sortie: 4, export: { ...defaultExportOptions(), taille: 'origine', qualite: 'moyenne' } });
  assert.deepEqual(p.ignored.sort(), ['video.entree', 'video.export.autre', 'video.export.cadence', 'video.export.format', 'video.export.son', 'video.inconnu', 'video.instant'].sort());
  // sortie avant l'entrée : toute la plage
  const q = mergeVideo({ entree: 3, sortie: 1 });
  assert.deepEqual([q.state.entree, q.state.sortie], [0, null]);
  // section illisible : valeurs par défaut
  assert.deepEqual(mergeVideo('n\'importe quoi').state, { instant: 0, entree: 0, sortie: null, export: defaultExportOptions() });
  // vidéo plus courte que la plage enregistrée (vidéo remplacée)
  assert.deepEqual(clampVideoState({ instant: 9, entree: 6, sortie: 8 }, 5), { instant: 5, entree: 5, sortie: 5 });
  assert.deepEqual(clampVideoState({ instant: 2, entree: 1, sortie: 3 }, 10), { instant: 2, entree: 1, sortie: 3 });
});

test('vidéo : chemin relatif de la vidéo par rapport au projet', () => {
  assert.equal(relativePath(dirname('D:\\Montage\\Projets\\clip.glyphotrame.json'), 'D:\\Montage\\Rushes\\clip.mp4'), '../Rushes/clip.mp4');
  assert.equal(resolvePath(dirname('E:\\Copie\\Projets\\clip.glyphotrame.json'), '../Rushes/clip.mp4'), 'E:\\Copie\\Rushes\\clip.mp4');
});
