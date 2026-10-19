import { useEffect } from 'react';
import { session, toast } from './state/index.js';
import { start } from './state/renderer.js';
import { loadImage } from './state/actions.js';
import { onFileDrop } from './platform/files.js';
import Header from './ui/Header.jsx';
import Controls from './ui/panel/Controls.jsx';
import Stage from './ui/stage/Stage.jsx';
import CodeSheet from './ui/CodeSheet.jsx';
import Toast from './ui/Toast.jsx';
import './App.css';

export default function App() {
  useEffect(() => {
    start();
    // coller une image (Ctrl+V), sauf dans le champ des caractères
    const onPaste = (e) => {
      if (e.target && e.target.id === 'chars') return;
      const items = e.clipboardData ? [...e.clipboardData.items] : [];
      const it = items.find((x) => x.kind === 'file' && /^image\//.test(x.type));
      if (it) { e.preventDefault(); const f = it.getAsFile(); loadImage({ blob: f, name: f.name || 'image-collee.png' }); }
    };
    window.addEventListener('paste', onPaste);
    // glisser-déposer un fichier sur la fenêtre
    const stopDrop = onFileDrop({
      enter: () => session.set({ dragOver: true }),
      leave: () => session.set({ dragOver: false }),
      drop: (file, error) => { if (error) toast('Impossible de lire ce fichier.'); else loadImage(file); }
    });
    return () => { window.removeEventListener('paste', onPaste); stopDrop(); };
  }, []);

  return (
    <>
      <div className="app">
        <Header />
        <main className="work">
          <Controls />
          <Stage />
        </main>
      </div>
      <CodeSheet />
      <Toast />
    </>
  );
}
