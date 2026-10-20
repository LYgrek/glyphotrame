/* Outils communs aux bancs vidéo : ffmpeg / ffprobe embarqués, et la vraie fenêtre Tauri pilotée par le
   protocole DevTools de WebView2 (compare-video.mjs, measure-video.mjs). */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { connectPage, sleep } from './cdp.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const TAURI = join(ROOT, 'src-tauri');
const BIN = join(TAURI, 'binaries');
const sidecar = (name) => { const f = existsSync(BIN) && readdirSync(BIN).find((x) => x.startsWith(name + '-') && !x.endsWith('.txt')); return f ? join(BIN, f) : null; };
export const FFMPEG = sidecar('ffmpeg'), FFPROBE = sidecar('ffprobe');
if (!FFMPEG || !FFPROBE) { console.error('ffmpeg / ffprobe absents de src-tauri/binaries : lance d\'abord tools/get-ffmpeg.ps1.'); process.exit(1); }
// PROFIL=release : Rust optimisé (comme l'application installée), compilé à part dans target/mesure pour ne pas
// remplacer la build de l'installateur ; sinon la build de « npm run tauri dev » (target/debug)
const RELEASE = process.env.PROFIL === 'release';
const EXE = join(TAURI, 'target', RELEASE ? join('mesure', 'release') : 'debug', process.platform === 'win32' ? 'glyphotrame-app.exe' : 'glyphotrame-app');
const DEBUG_PORT = 9340;

export const run = (exe, args, opts = {}) => {
  const r = spawnSync(exe, args, { maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`${exe.split(/[\\/]/).pop()} ${args.join(' ')}\n${String(r.stderr || '').slice(-2000)}`);
  return r.stdout;
};
export const probe = (file) => JSON.parse(run(FFPROBE, ['-v', 'error', '-count_frames', '-show_entries',
  'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt,nb_read_frames,duration:stream_tags=alpha_mode,DURATION:format=duration', '-of', 'json', file]).toString());
// images d'un fichier ou d'une séquence (motif %05d) → { w, h, frames: [Buffer RGBA] }
export function decode(input, { vp9 = false } = {}) {
  const first = input.includes('%') ? input.replace('%05d', '00001') : input;
  const s = probe(first).streams.find((x) => x.codec_type === 'video');
  const raw = run(FFMPEG, ['-v', 'error', ...(vp9 ? ['-c:v', 'libvpx-vp9'] : []), '-i', input, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  const size = s.width * s.height * 4, frames = [];
  for (let o = 0; o + size <= raw.length; o += size) frames.push(raw.subarray(o, o + size));
  return { w: s.width, h: s.height, frames };
}
export const ratio = (r) => { const [a, b] = String(r).split('/').map(Number); return b ? a / b : a; };
// mire de test : testsrc2 avec son (sinusoïde)
export function makeTestVideo(file, { width, height, fps, seconds }) {
  run(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
}

/* Lance l'application (cargo build, Vite sur le port 1420, fenêtre Tauri de target/debug) et s'y connecte.
   → { ev, inPage, settle, logs, close } ; inPage(corps) exécute une fonction asynchrone avec les modules
   de l'application : R (renderer), I (stores), V (vidéo), F (ffmpeg), A (actions), X (export vidéo),
   D (réglages par défaut), P (projets), PF (format des projets). */
export async function startApp() {
  console.log(`Compilation du Rust (cargo build${RELEASE ? ' --release' : ''})…`);
  const cargo = spawnSync('cargo', ['build', ...(RELEASE ? ['--release', '--target-dir', 'target/mesure'] : [])], { cwd: TAURI, stdio: ['ignore', 'ignore', 'inherit'] });
  if (cargo.status !== 0) throw new Error('cargo build a échoué.');
  let vite = null, app = null, page = null;
  const close = async () => {
    if (page) await page.close().catch(() => {});
    if (app) { app.kill(); await sleep(500); }
    if (vite) await vite.close();
  };
  try {
    // Vite sur le port attendu par la fenêtre Tauri (devUrl)
    try {
      vite = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), server: { hmr: false }, logLevel: 'error' });
      await vite.listen();
    } catch (e) { throw new Error('Port 1420 occupé : ferme « npm run tauri dev » avant de lancer ce banc. (' + e.message + ')'); }
    app = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}` }, stdio: 'ignore' });
    page = await connectPage(DEBUG_PORT, 'http://localhost:1420', { timeout: 60000 });
    const ev = (js) => page.eval(js);
    for (let i = 0; i < 150 && !(await ev("(async () => { try { return !!(await import('/src/state/renderer.js')).getGrid(); } catch { return false; } })()").catch(() => false)); i++) await sleep(200);
    const M = `const R = await import('/src/state/renderer.js'), I = await import('/src/state/index.js'), V = await import('/src/state/video.js'),
      F = await import('/src/platform/ffmpeg.js'), A = await import('/src/state/actions.js'), X = await import('/src/state/video-export.js'),
      D = await import('/src/state/defaults.js'), P = await import('/src/state/project.js'), PF = await import('/src/state/project-format.js');`;
    const inPage = (body) => ev(`(async () => { ${M} ${body} })()`);
    // compteur de rendus de l'aperçu, pour attendre qu'ils soient terminés
    await inPage(`window.__renders = 0; I.session.subscribe((n, p) => { if (n.stats !== p.stats) window.__renders++; });`);
    const settle = async () => {
      let last = -1;
      for (let i = 0; i < 50; i++) { await sleep(150); const n = await ev('window.__renders'); if (n === last) return; last = n; }
    };
    return { ev, inPage, settle, send: page.send, logs: page.logs, close };
  } catch (e) { await close(); throw e; }
}
