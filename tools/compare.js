/* Banc de comparaison : exécute la référence et le moteur porté sur les mêmes réglages,
   puis compare les pixels de l'aperçu et de l'export 2×, et les exports SVG / HTML / texte
   caractère par caractère.

   La référence est chargée en mémoire depuis reference/glyphotrame-reference.html : son script
   est seulement complété pour exposer ses fonctions internes (le fichier n'est pas modifié).
   Le lien Google Fonts n'est pas repris : les deux versions utilisent les mêmes polices locales.

   Lancer : npm run dev, puis ouvrir http://localhost:1420/tools/compare.html */
import '../src/styles/fonts.css';
import refHtml from '../reference/glyphotrame-reference.html?raw';
import * as E from '../src/engine/index.js';
import { SCENARIOS } from './scenarios.js';

const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ---------- Chargement de la référence ---------- */
const EXPOSE = `
  window.__ref = { state, render, draw, buildSVG, buildHTML, buildTXT, makeSample, updateCurveUI,
    markCut: () => { cutDirty = true; },
    get grid() { return grid; }, get source() { return source; }, get rawSource() { return rawSource; },
    out, orig };
`;
function loadReference() {
  const start = refHtml.indexOf('<div class="app">');
  const sOpen = refHtml.indexOf('<script>', start);
  const sClose = refHtml.lastIndexOf('</script>');
  let code = refHtml.slice(sOpen + '<script>'.length, sClose);
  const end = code.lastIndexOf('})();');
  code = code.slice(0, end) + EXPOSE + code.slice(end);
  $('#ref-host').innerHTML = refHtml.slice(start, sOpen);
  const s = document.createElement('script');
  s.textContent = code;
  document.body.appendChild(s);
  return window.__ref;
}

/* ---------- Comparaisons ---------- */
function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { ok: false, text: `taille ${a.width}×${a.height} ≠ ${b.width}×${b.height}` };
  const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let n = 0, max = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
    if (d) { n++; if (d > max) max = d; }
  }
  return n ? { ok: false, text: `${n} px différents (écart max ${max})` } : { ok: true, text: `identique ${a.width}×${a.height}` };
}
function strDiff(a, b) {
  if (a === b) return { ok: true, text: `identique (${E.fmt(a.length)} car.)` };
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { ok: false, text: `diffère au car. ${i} (${a.length} / ${b.length})\nréf. : …${a.slice(Math.max(0, i - 50), i + 70)}\nport : …${b.slice(Math.max(0, i - 50), i + 70)}` };
}
const eq = (a, b, label) => a === b ? { ok: true, text: `${label} ${a}` } : { ok: false, text: `${label} ${a} ≠ ${b}` };

/* ---------- Exécution ---------- */
async function runScenario(ref, base, name, patch) {
  const checks = {};
  // référence
  Object.assign(ref.state, clone(base), clone(patch));
  ref.markCut();
  await ref.render();
  const rg = ref.grid;
  // portage
  const state = Object.assign(clone(base), clone(patch));
  let src = E.createSource(E.makeSample(), 'exemple-sphere.png');
  const cut = E.applyCutout(state, src);
  src = cut.src; state.cutColor = cut.cutColor;
  const { grid: g } = await E.compute(state, src);

  checks.grille = g.kind === 'chars'
    ? eq(`${rg.cols}×${rg.rows} ${rg.count}`, `${g.cols}×${g.rows} ${g.count}`, '')
    : eq(`${rg.W}×${rg.H} ${rg.count}`, `${g.W}×${g.H} ${g.count}`, '');

  const prev = E.createCanvas();
  E.draw(prev.getContext('2d'), g, state, src, 1, false, 760);
  checks.apercu = pixelDiff(ref.out, prev);

  const rx = document.createElement('canvas'), px = E.createCanvas();
  ref.draw(rx.getContext('2d'), rg, ref.state.scale, false);
  E.draw(px.getContext('2d'), g, state, src, state.scale, false);
  checks.export = pixelDiff(rx, px);
  if (state.transparent) {
    // JPEG : fond plein forcé
    ref.draw(rx.getContext('2d'), rg, ref.state.scale, true);
    E.draw(px.getContext('2d'), g, state, src, state.scale, true);
    const j = pixelDiff(rx, px);
    checks.export = { ok: checks.export.ok && j.ok, text: `${checks.export.text} · JPEG ${j.text}` };
  }

  checks.svg = strDiff(ref.buildSVG(rg), E.buildSVG(g, state, src));
  checks.html = strDiff(ref.buildHTML(rg), E.buildHTML(g, state, src));
  checks.texte = g.kind === 'chars' ? strDiff(ref.buildTXT(rg), E.buildTXT(g)) : { ok: true, text: '—' };

  const other = [];
  if (state.cut) other.push(eq(ref.state.cutColor, state.cutColor, 'fond'));
  if (state.grad && state.gShape === 'libre') {
    ref.updateCurveUI();
    const ov = E.overlayPaths(state.gPath);
    other.push(eq(document.getElementById('cuLine').getAttribute('d'), ov.line, 'tracé'));
    other.push(eq(document.getElementById('cuExt').getAttribute('d'), ov.ext, 'prolong.'));
  }
  checks.autres = other.length
    ? { ok: other.every((c) => c.ok), text: other.map((c) => c.ok ? c.text.split(' ')[0] + ' ✓' : c.text).join(' · ') }
    : { ok: true, text: '—' };
  return { name, checks };
}

// tests sans équivalent direct dans la référence
function unitChecks(ref) {
  const out = [];
  out.push({ name: 'Image d\'exemple', checks: { apercu: pixelDiff(ref.makeSample(), E.makeSample()) } });
  // ajout d'un point : la forme du tracé ne change pas
  const path = E.defaultPath(), P = E.segPts(path, 0, 1, 1);
  const { path: p2, index } = E.insertAt(path, 0, 0.3);
  const m = E.bez(P, 0.3), n = p2.nodes[index];
  const q1 = E.bez(E.segPts(p2, 0, 1, 1), 0.5), q0 = E.bez(P, 0.15);
  const q3 = E.bez(E.segPts(p2, 1, 1, 1), 0.5), q2 = E.bez(P, 0.65);
  const err = Math.max(Math.abs(m[0] - n.x), Math.abs(m[1] - n.y), Math.abs(q1[0] - q0[0]), Math.abs(q1[1] - q0[1]), Math.abs(q3[0] - q2[0]), Math.abs(q3[1] - q2[1]));
  out.push({ name: 'Plume · ajout de point sans changer la forme', checks: { autres: { ok: err < 1e-9 && path.nodes.length === 3, text: `écart ${err.toExponential(1)}` } } });
  return out;
}

const COLS = ['grille', 'apercu', 'export', 'svg', 'html', 'texte', 'autres'];
function addRow(r) {
  const tr = document.createElement('tr');
  const td = (t, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; const pre = document.createElement('pre'); pre.textContent = t; c.append(pre); return c; };
  tr.append(td(r.name));
  for (const k of COLS) { const c = r.checks[k]; tr.append(c ? td((c.ok ? '✓ ' : '✗ ') + c.text, c.ok ? 'ok' : 'ko') : td('')); }
  $('#cmp-rows').append(tr);
}

async function main() {
  const ref = loadReference();
  const base = clone(ref.state);
  await document.fonts.ready;
  for (let i = 0; i < 3; i++) await frame();
  E.clearDensityCache();

  const results = [];
  for (const r of unitChecks(ref)) { results.push(r); addRow(r); }
  for (const [name, patch] of SCENARIOS) {
    $('#cmp-status').textContent = `En cours : ${name}`;
    let r;
    try { r = await runScenario(ref, base, name, patch); }
    catch (e) { r = { name, checks: { autres: { ok: false, text: 'erreur : ' + (e && e.stack || e) } } }; }
    results.push(r); addRow(r);
    await frame();
  }
  const fails = results.filter((r) => Object.values(r.checks).some((c) => !c.ok));
  $('#cmp-status').textContent = fails.length
    ? `${fails.length} scénario(s) sur ${results.length} diffèrent de la référence.`
    : `Les ${results.length} scénarios sont identiques à la référence.`;
  $('#cmp-summary').textContent = 'RÉSUMÉ ' + JSON.stringify({ total: results.length, echecs: fails.map((r) => ({ name: r.name, checks: Object.fromEntries(Object.entries(r.checks).filter(([, c]) => !c.ok)) })) }, null, 1);
  document.title = fails.length ? 'ÉCHEC' : 'OK';
}
main().catch((e) => { $('#cmp-status').textContent = 'Erreur : ' + e.stack; document.title = 'ERREUR'; });
