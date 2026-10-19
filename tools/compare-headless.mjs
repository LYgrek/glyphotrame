/* Lance le banc de comparaison sans fenêtre : démarre un serveur Vite, ouvre tools/compare.html
   dans Edge ou Chrome en mode headless (protocole DevTools), attend la fin et affiche le résultat.
   Usage : npm run compare   (variable BROWSER pour choisir le navigateur)
   Code de sortie : 0 si tout est identique à la référence, 1 sinon. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = process.env.BROWSER || BROWSERS.find((p) => existsSync(p));
if (!exe) { console.error('Aucun navigateur trouvé (Edge ou Chrome). Indique-le avec la variable BROWSER.'); process.exit(2); }

const server = await createServer({ server: { port: 1430, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const pageUrl = server.resolvedUrls.local[0] + 'tools/compare.html';

const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'glyphotrame-compare-'));
const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, pageUrl], { stdio: 'ignore' });

let code = 1;
try {
  // onglet de la page
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === 'page' && x.url.includes('compare.html'));
      if (t) wsUrl = t.webSocketDebuggerUrl;
    } catch { /* navigateur pas encore prêt */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('Impossible de se connecter au navigateur.');

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const evaluate = (expression) => new Promise((resolve) => {
    const id = ++nextId;
    waiting.set(id, (m) => resolve(m.result && m.result.result ? m.result.result.value : undefined));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });

  const t0 = Date.now();
  let title = '', last = '';
  while (Date.now() - t0 < 20 * 60 * 1000) {
    title = await evaluate('document.title');
    if (['OK', 'ÉCHEC', 'ERREUR'].includes(title)) break;
    const status = await evaluate("document.querySelector('#cmp-status') && document.querySelector('#cmp-status').textContent");
    if (status && status !== last) { process.stdout.write(`\r${status.slice(0, 100).padEnd(100)}`); last = status; }
    await sleep(500);
  }
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
  const report = await evaluate(`[...document.querySelectorAll('#cmp-rows tr')]
    .map(tr => { const c = [...tr.cells].map(td => td.textContent.trim()); const ko = c.slice(1).filter(t => t.startsWith('✗'));
      return (ko.length ? '✗ ' : '✓ ') + c[0] + (ko.length ? '\\n    ' + ko.join('\\n    ') : ''); })
    .join('\\n') + '\\n\\n' + document.querySelector('#cmp-status').textContent`);
  console.log(report || '(aucun résultat)');
  code = title === 'OK' ? 0 : 1;
  ws.close();
} catch (e) {
  console.error(e.message || e);
} finally {
  browser.kill();
  await server.close();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* fichiers encore verrouillés par le navigateur */ }
}
process.exit(code);
