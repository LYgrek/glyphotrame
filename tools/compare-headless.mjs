/* Lance le banc de comparaison du moteur sans fenêtre : démarre un serveur Vite, ouvre
   tools/compare.html dans Edge ou Chrome en mode headless, attend la fin et affiche le résultat.
   Usage : npm run compare   (variable BROWSER pour choisir le navigateur)
   Code de sortie : 0 si tout est identique à la référence, 1 sinon. */
import { startVite, openPage, sleep } from './lib/cdp.mjs';

const vite = await startVite();
let code = 1, page = null;
try {
  page = await openPage(vite.url + 'tools/compare.html');
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
      return (ko.length ? '✗ ' : '✓ ') + c[0] + (ko.length ? '\\n    ' + ko.join('\\n    ') : ''); })
    .join('\\n') + '\\n\\n' + document.querySelector('#cmp-status').textContent`);
  console.log(report || '(aucun résultat)');
  code = title === 'OK' ? 0 : 1;
} catch (e) {
  console.error(e.message || e);
} finally {
  if (page) await page.close();
  await vite.close();
}
process.exit(code);
