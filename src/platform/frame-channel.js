/* Canal des pixels de l'export vidéo (src-tauri/src/canal.rs) : WebSocket local ouvert par le Rust.
   L'IPC de Tauri plafonne pour de gros volumes sous Windows (8 Mo par image en 1080p, dans chaque sens) ;
   par ce canal, le Rust envoie d'avance les images décodées et reçoit les images rendues.
   Le WebSocket vit dans un worker (frame-channel.worker.js) pour que les transferts continuent pendant
   le rendu de l'image courante sur le fil principal.
   openFrameChannel rend null si la connexion échoue : l'export passe alors par l'IPC. */

const CUT = "La connexion avec ffmpeg a été coupée.";

// canal = { port, jeton } (rendu par export_debut) → { next, send, close } ou null
export function openFrameChannel(canal, { timeout = 3000 } = {}) {
  if (!canal || typeof Worker === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let worker;
    try { worker = new Worker(new URL('./frame-channel.worker.js', import.meta.url), { type: 'module' }); }
    catch { resolve(null); return; }
    const queue = [], waiters = [];
    let opened = false, closed = false;
    const fail = () => { clearTimeout(timer); worker.terminate(); resolve(null); };
    const timer = setTimeout(() => { if (!opened) fail(); }, timeout);
    const settle = () => {
      while (waiters.length && (queue.length || closed)) {
        const w = waiters.shift();
        if (queue.length) w.resolve(queue.shift());
        else w.reject(new Error(CUT));
      }
    };
    worker.onerror = () => { if (!opened) fail(); else { closed = true; settle(); } };
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'fail') { if (!opened) fail(); else { closed = true; settle(); } }
      else if (m.type === 'open') {
        opened = true;
        clearTimeout(timer);
        resolve({
          // image décodée suivante (ArrayBuffer RGBA), ou null à la fin
          next: () => new Promise((res, reject) => { waiters.push({ resolve: res, reject }); settle(); }),
          // image rendue → encodeur : copiée (le tableau du rendu est réutilisé), puis transférée au worker
          send: (px) => {
            if (closed) throw new Error(CUT);
            const buf = px.slice().buffer;
            worker.postMessage({ type: 'send', buf }, [buf]);
          },
          close: () => { worker.postMessage({ type: 'close' }); setTimeout(() => worker.terminate(), 1000); }
        });
      }
      else if (m.type === 'frame') { queue.push(m.buf); settle(); }
      else if (m.type === 'end') { queue.push(null); settle(); }
      else if (m.type === 'closed') { closed = true; settle(); }
    };
    worker.postMessage({ type: 'open', url: `ws://127.0.0.1:${canal.port}/${canal.jeton}` });
  });
}
