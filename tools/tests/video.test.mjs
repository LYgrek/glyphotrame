// Tests de la vidéo côté interface (npm test) : grain animé, taille de sortie
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grainOffset } from '../../src/engine/postfx.js';
import { defaultSettings } from '../../src/state/defaults.js';

// fonctions pures de frame.js (qui, lui, importe le rendu GPU)
const { even, outputSize } = await import('../../src/state/frame-size.js');

test('grain animé : figé pour une image ou option coupée, différent à chaque image sinon', () => {
  const st = { ...defaultSettings(), fxGrain: 40 };
  const video = (time) => ({ kind: 'video', time });
  assert.equal(st.fxGrainAnim, false);
  assert.deepEqual(grainOffset(st, video(1)), [0, 0]);
  const on = { ...st, fxGrainAnim: true };
  assert.deepEqual(grainOffset(on, { kind: undefined }), [0, 0]);
  const offs = [0, 1 / 30, 2 / 30, 3 / 30, 10].map((t) => grainOffset(on, video(t)));
  assert.equal(new Set(offs.map(String)).size, offs.length);
  for (const [x, y] of offs) assert.ok(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 256 && y >= 0 && y < 256);
  // même instant → même grain (rendu déterministe)
  assert.deepEqual(grainOffset(on, video(1 / 30)), offs[1]);
});

test('taille de sortie : dimensions paires, largeur demandée', () => {
  assert.deepEqual([even(675), even(674), even(1), even(3)], [674, 674, 2, 2]);
  assert.deepEqual(outputSize({ W: 1200, H: 675 }, null), { s: 1, W: 1200, H: 674 });
  const o = outputSize({ W: 1200, H: 675 }, 1920);
  assert.equal(o.s, 1.6);
  assert.deepEqual([o.W, o.H], [1920, 1080]);
  assert.deepEqual(outputSize({ W: 601, H: 401 }, 800).W % 2, 0);
});
