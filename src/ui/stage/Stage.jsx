import { useRef, useState } from 'react';
import { clamp, fmt } from '../../engine/index.js';
import { session, useSetting, useSession, setSettings } from '../../state/index.js';
import { pickAt } from '../../state/actions.js';
import { formatDuration, formatFps } from '../../state/video.js';
import { canvasRef } from '../../state/renderer.js';
import Seg from '../controls/Seg.jsx';
import PenToolbar from './PenToolbar.jsx';
import PenLayer from './PenLayer.jsx';
import './Stage.css';

// Statistiques. Chaque texte est une seule chaîne, comme dans la référence : un texte coupé en
// plusieurs morceaux est espacé (crénage) différemment par le navigateur.
function Stats() {
  const st = useSession('stats');
  if (!st) return <div className="stats">Préparation…</div>;
  let strong, rest, warn = '';
  if (st.kind === 'halftone') {
    const what = { points: 'points', lignes: 'segments de ligne', pointillisme: 'points' }[st.type];
    strong = fmt(st.count);
    rest = ` ${what}${st.cmyk ? ' (4 encres)' : ''} · trame ${st.htCell} px · ${fmt(st.W)} × ${fmt(st.H)} px`;
    if (st.count > 150000) warn = 'trame très fine, le rendu ralentit';
  } else {
    strong = `${fmt(st.cols)} × ${fmt(st.rows)}`;
    rest = ` caractères · ${fmt(st.count)} glyphes · ${fmt(st.W)} × ${fmt(st.H)} px`;
    if (st.cols * st.rows > 250000) warn = 'grille très dense, le rendu ralentit';
  }
  // vidéo : dimensions d'origine, durée, cadence
  if (st.video) rest += ` · vidéo ${fmt(st.video.largeur)} × ${fmt(st.video.hauteur)} · ${formatDuration(st.video.duree)} · ${formatFps(st.video.cadence)}`;
  return (
    <div className="stats">
      <b>{strong}</b>{rest + (warn ? ' · ' : '')}{warn && <span className="warn">{warn}</span>}
    </div>
  );
}

// Zone d'aperçu : vues Résultat / Côte à côte / Curseur (glissoir avant-après)
function Viewport() {
  const view = useSession('view'), picking = useSession('picking'), dragOver = useSession('dragOver');
  const zoom = useSetting('zoom'), cut = useSetting('cut');
  const [x, setX] = useState(50);
  const compare = useRef(null), wiping = useRef(false);
  const fromEvent = (e) => { const r = compare.current.getBoundingClientRect(); setX(clamp((e.clientX - r.left) / r.width * 100, 0, 100)); };
  const down = (e) => {
    if (view !== 'wipe' || picking) return;
    wiping.current = true; compare.current.setPointerCapture(e.pointerId); fromEvent(e);
  };
  const stop = () => { wiping.current = false; };
  // pipette : clic sur l'image d'origine ou sur le résultat
  const pick = (e) => {
    if (!picking) return;
    const r = e.currentTarget.getBoundingClientRect();
    pickAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  return (
    <div className={'viewport ' + zoom} data-view={view}>
      <div className="compare" ref={compare} style={{ '--x': x + '%' }}
        onPointerDown={down} onPointerMove={(e) => { if (wiping.current) fromEvent(e); }} onPointerUp={stop} onPointerCancel={stop}>
        <figure className="pane before">
          <figcaption>{cut ? 'Avant · détouré' : 'Avant'}</figcaption>
          <canvas ref={canvasRef.orig} className={'orig' + (picking ? ' picking' : '')} role="img"
            aria-label={cut ? "Image d'origine détourée" : "Image d'origine"} onClick={pick}></canvas>
        </figure>
        <figure className="pane after">
          <figcaption>Après</figcaption>
          <PenLayer onPick={pick} />
        </figure>
        <div className="wipe-handle" aria-hidden="true"></div>
      </div>
      <input type="range" className="wipe-range" min="0" max="100" step="1" value={Math.round(x)}
        aria-label="Position du curseur avant / après" onChange={(e) => setX(clamp(+e.target.value, 0, 100))} />
      <div className="dropveil" hidden={!dragOver}>Dépose l'image ici</div>
    </div>
  );
}

export default function Stage() {
  const view = useSession('view'), zoom = useSetting('zoom');
  return (
    <section className="stage" aria-label="Aperçu">
      <div className="stage-head">
        <Stats />
        <div className="stage-tools">
          <Seg className="views" label="Vue" value={view} onChange={(v) => session.set({ view: v })}
            options={[{ value: 'result', label: 'Résultat' }, { value: 'side', label: 'Côte à côte' }, { value: 'wipe', label: 'Curseur' }]} />
          <Seg label="Zoom" value={zoom} onChange={(v) => setSettings({ zoom: v })}
            options={[{ value: 'fit', label: 'Ajuster' }, { value: 'actual', label: '100 %' }]} />
        </div>
      </div>
      <PenToolbar />
      <Viewport />
    </section>
  );
}
