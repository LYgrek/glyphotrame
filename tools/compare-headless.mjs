/* Lance un banc de comparaison (page de tools/) sans fenêtre : démarre un serveur Vite, ouvre la page
   dans Edge ou Chrome en mode headless, attend la fin et affiche le résultat.
   Usage : node tools/compare-headless.mjs [page] [--gpu] [--save]
     page    compare.html (moteur ↔ référence, par défaut) ou compare-gpu.html (GPU ↔ canvas 2D)
     --gpu   garde la carte graphique (sinon rendu logiciel, plus stable d'une machine à l'autre)
     --save  enregistre les images de la page (window.__images) dans tools/.gpu-diff/
   Code de sortie : 0 si tout est dans les seuils, 1 sinon. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, openPage, sleep } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const pageName = args.find((a) => !a.startsWith('--')) || 'compare.html';
const vite = await startVite();
let code = 1, page = null;
try {
  page = await openPage(vite.url + 'tools/' + pageName, { gpu: args.includes('--gpu') });
  const t0 = Date.now();
  let title = '', last = '';
  while (Date.now() - t0 < 20 * 60 * 1000) {
    title = await page.eval('document.title');
    if (['OK', 'ÉCHEC', 'ERREUR'].includes(title)) break;
    const status = await page.eval("document.querySelector('#cmp-status') && document.querySelector('#cmp-status').textContent");
    if (status && status !== last) { process.stdout.write(`\r${status.slice(0, 100).padEnd(100)}`); last = status; }
    await sleep(500);
  }
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
  const report = await page.eval(`[...document.querySelectorAll('#cmp-rows tr')]
    .map(tr => { const c = [...tr.cells].map(td => td.textContent.trim()); const ko = c.slice(1).filter(t => t.startsWith('✗'));
      const info = c.slice(1).filter(t => t && t !== '✓ —' && !t.startsWith('✗')).map(t => t.replace(/^✓ /, ''));
      return (ko.length ? '✗ ' : '✓ ') + c[0] + (ko.length ? '\\n    ' + ko.join('\\n    ') : '') + (info.length && ${JSON.stringify(pageName)} !== 'compare.html' ? '  (' + info.join(' · ') + ')' : ''); })
    .join('\\n') + '\\n\\n' + document.querySelector('#cmp-status').textContent`);
  console.log(report || '(aucun résultat)');
  if (args.includes('--save')) {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '.gpu-diff');
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    // une image à la fois (les envoyer toutes d'un coup sature la liaison avec le navigateur) ;
    // seulement les scénarios en échec, sauf --save-all
    const names = await page.eval(`Object.keys(window.__images || {}).filter((n) => ${args.includes('--save-all')} || (window.__fails || []).includes(n))`);
    for (const name of names) for (const k of ['canvas', 'gpu', 'diff']) {
      const data = await page.eval(`window.__images[${JSON.stringify(name)}].${k}`);
      if (data) writeFileSync(join(dir, `${name.replace(/[^\w\-]+/g, '_')}-${k}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log('Images enregistrées dans ' + dir);
  }
  code = title === 'OK' ? 0 : 1;
} catch (e) {
  console.error(e.message || e);
} finally {
  if (page) await page.close();
  await vite.close();
}
process.exit(code);
