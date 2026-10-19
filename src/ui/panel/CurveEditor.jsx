import { useRef, useState } from 'react';
import { clamp, round3, CURVES } from '../../engine/index.js';
import { settings, useSetting, setSettings } from '../../state/index.js';
import { setDragging, endDrag } from '../../state/renderer.js';
import './CurveEditor.css';

// Courbe de progression : Bézier de (0, 1) à (1, 0), deux poignées réglables à la souris ou au clavier
const ce = { x: (v) => 14 + v * 172, y: (v) => 100 - v * 90 };
const PRESETS = [['douce', 'Douce'], ['lineaire', 'Linéaire'], ['persistante', 'Effet persistant'], ['breve', 'Effet bref']];

function setHandle(idx, x, y) {
  const c = settings.get().gCurve.slice();
  c[idx * 2] = round3(clamp(x, 0, 1)); c[idx * 2 + 1] = round3(clamp(y, 0, 1));
  setSettings({ gCurve: c });
}

export default function CurveEditor() {
  const curve = useSetting('gCurve');
  const svgRef = useRef(null);
  const dragRef = useRef(-1);
  const [drag, setDrag] = useState(-1);
  const [x1, y1, x2, y2] = curve;
  const P1 = [ce.x(x1), ce.y(y1)], P2 = [ce.x(x2), ce.y(y2)];
  const key = curve.map((v) => round3(v)).join(',');

  const down = (idx) => (e) => {
    e.preventDefault();
    dragRef.current = idx; setDrag(idx); setDragging(true);
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (dragRef.current < 0) return;
    const svg = svgRef.current;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    setHandle(dragRef.current, (pt.x - 14) / 172, (100 - pt.y) / 90);
  };
  const end = () => { if (dragRef.current < 0) return; dragRef.current = -1; setDrag(-1); endDrag(); };
  const keys = (idx) => (e) => {
    const st = e.shiftKey ? 0.1 : 0.02, c = settings.get().gCurve, x = c[idx * 2], y = c[idx * 2 + 1];
    const moves = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
    if (moves[e.key]) { e.preventDefault(); setHandle(idx, x + moves[e.key][0], y + moves[e.key][1]); }
  };
  const handle = (idx, P, x, y) => (
    <circle className={'ce-handle' + (drag === idx ? ' drag' : '')} cx={P[0]} cy={P[1]} r="7" tabIndex={0} role="slider"
      aria-label={`Poignée ${idx + 1} de la courbe`} aria-valuetext={`position ${Math.round(x * 100)} %, intensité ${Math.round(y * 100)} %`}
      onPointerDown={down(idx)} onKeyDown={keys(idx)} />
  );

  return (
    <>
      <div className="curve-editor">
        <svg ref={svgRef} viewBox="0 0 200 124" role="group" aria-labelledby="curveLabel"
          onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <rect className="ce-bg" x="14" y="10" width="172" height="90" rx="3" />
          <path className="ce-grid" d="M57 10V100M100 10V100M143 10V100M14 32.5H186M14 55H186M14 77.5H186" />
          <line className="ce-arm" x1="14" y1="10" x2={P1[0]} y2={P1[1]} />
          <line className="ce-arm" x1="186" y1="100" x2={P2[0]} y2={P2[1]} />
          <path className="ce-curve" d={`M14 10C${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]} 186 100`} />
          <circle className="ce-end" cx="14" cy="10" r="3.5" />
          <circle className="ce-end" cx="186" cy="100" r="3.5" />
          {handle(0, P1, x1, y1)}
          {handle(1, P2, x2, y2)}
          <text className="ce-lbl" x="14" y="116">Effet</text>
          <text className="ce-lbl" x="186" y="116" textAnchor="end">Original</text>
          <text className="ce-lbl" x="100" y="116" textAnchor="middle">transition →</text>
        </svg>
      </div>
      <div className="presets" role="group" aria-label="Courbes prédéfinies">
        {PRESETS.map(([id, name]) => (
          <button key={id} type="button" aria-pressed={CURVES[id].join(',') === key} onClick={() => setSettings({ gCurve: CURVES[id].slice() })}>{name}</button>
        ))}
      </div>
      <p className="hint">Hauteur = intensité de l'effet. Glisse les deux poignées pour régler la vitesse du fondu.</p>
    </>
  );
}
