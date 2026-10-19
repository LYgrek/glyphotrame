/* Outils communs aux bancs de comparaison : serveur Vite, navigateur headless piloté
   par le protocole DevTools (Edge ou Chrome), sans dépendance. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

// serveur Vite du projet (quel que soit le dossier courant) sur un port libre → { url, close }
export async function startVite() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const server = await createServer({ root, configFile: join(root, 'vite.config.js'), server: { port: 1430, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

let nextPort = 9333;

// ouvre un onglet headless sur url → page { eval, send, mouse, key, shot, logs, close }
export async function openPage(url, { width = 1440, height = 900, gpu = false } = {}) {
  const exe = process.env.BROWSER || BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error('Aucun navigateur trouvé (Edge ou Chrome). Indique-le avec la variable BROWSER.');
  const port = nextPort++;
  const profile = mkdtempSync(join(tmpdir(), 'glyphotrame-cdp-'));
  const proc = spawn(exe, ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--disable-gpu']), '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, url], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      // l'onglet de la page demandée (Edge peut ouvrir d'abord un onglet système, edge://…)
      const t = list.find((x) => x.type === 'page' && x.url.startsWith(url.split('?')[0])) || list.find((x) => x.type === 'page' && !/^(edge|chrome):/.test(x.url));
      if (t) wsUrl = t.webSocketDebuggerUrl;
    } catch { /* navigateur pas encore prêt */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('Impossible de se connecter au navigateur.');
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let id = 0;
  const waiting = new Map(), logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) logs.push(m.params.type + ' : ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception : ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; waiting.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  // thème clair / sombre : THEME=light ou THEME=dark (sinon celui du système)
  if (process.env.THEME) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.THEME }] });

  const page = {
    logs, send,
    // autorise les téléchargements dans dir (à appeler une fois la page chargée)
    allowDownloads: (dir) => send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir }),
    async eval(expression) {
      const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (m.result && m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
      return m.result && m.result.result ? m.result.result.value : undefined;
    },
    async mouse(x, y, { type = 'click', modifiers = 0, clickCount = 1 } = {}) {
      const ev = (t, extra = {}) => send('Input.dispatchMouseEvent', { type: t, x, y, modifiers, ...extra });
      if (type === 'hover') await ev('mouseMoved', { button: 'none' });
      if (type === 'move') await ev('mouseMoved', { button: 'left', buttons: 1 });
      if (type === 'click' || type === 'down') await ev('mousePressed', { button: 'left', clickCount });
      if (type === 'click' || type === 'up') await ev('mouseReleased', { button: 'left', clickCount });
      await sleep(40);
    },
    async key(key, code, vk, modifiers = 0) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await sleep(40);
    },
    // capture PNG (Buffer) d'une zone de la page, au-delà de la fenêtre si besoin
    async shot(clip) {
      const m = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      return Buffer.from(m.result.data, 'base64');
    },
    async close() {
      ws.close(); proc.kill(); await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* fichiers encore verrouillés */ }
    }
  };
  return page;
}

export const saveBuffer = (file, buf) => writeFileSync(file, buf);
