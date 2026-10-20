/* Worker du canal des pixels (frame-channel.js). Dans la WebView, un WebSocket lit et écrit ses données sur
   le fil qui l'a créé : dans la page, rien ne circulerait pendant le rendu d'une image. Ici, le fil du worker
   reste libre : les images décodées arrivent et les images rendues partent pendant que la page dessine.
   Messages : page → worker { type: 'open', url } | { type: 'send', buf } | { type: 'close' } ;
              worker → page { type: 'open' } | { type: 'fail' } | { type: 'frame', buf } | { type: 'end' } | { type: 'closed' } */
let ws = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'open') {
    try { ws = new WebSocket(m.url); } catch { self.postMessage({ type: 'fail' }); return; }
    ws.binaryType = 'arraybuffer';
    let opened = false;
    ws.onopen = () => { opened = true; self.postMessage({ type: 'open' }); };
    // image décodée : transférée à la page sans copie ; message vide : fin
    ws.onmessage = (ev) => {
      if (!ev.data.byteLength) self.postMessage({ type: 'end' });
      else self.postMessage({ type: 'frame', buf: ev.data }, [ev.data]);
    };
    ws.onerror = () => { if (!opened) self.postMessage({ type: 'fail' }); };
    ws.onclose = () => self.postMessage({ type: opened ? 'closed' : 'fail' });
  }
  else if (m.type === 'send') { if (ws && ws.readyState === WebSocket.OPEN) ws.send(m.buf); }
  else if (m.type === 'close') { if (ws) ws.close(); }
};
