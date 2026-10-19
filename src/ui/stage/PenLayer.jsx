import { useRef } from 'react';
import { overlayPaths, hitAnchor } from '../../engine/index.js';
import { useSetting, useSession } from '../../state/index.js';
import { canvasRef } from '../../state/renderer.js';
import usePenTool from './usePenTool.js';
import './PenLayer.css';

// Canvas du résultat + calque du tracé plume (tracé, prolongements, élastique, points, poignées)
export default function PenLayer({ onPick }) {
  const wrap = useRef(null);
  usePenTool(wrap);
  const grad = useSetting('grad'), gShape = useSetting('gShape'), show = useSetting('gShowCurve'), path = useSetting('gPath');
  const transparent = useSetting('transparent');
  const picking = useSession('picking'), tool = useSession('penTool'), selNode = useSession('selNode');
  const hover = useSession('penHover'), busy = useSession('penBusy'), nearFirst = useSession('nearFirst');
  const vis = grad && gShape === 'libre' && show;

  // élastique : aperçu du prochain segment avec la plume (pas au-dessus d'un point existant)
  let rubberTo = null;
  if (vis && tool === 'pen' && hover && !busy && !path.closed && path.nodes.length && wrap.current
    && hitAnchor(path, hover, wrap.current.getBoundingClientRect()) < 0) rubberTo = hover;
  const ov = vis ? overlayPaths(path, selNode, rubberTo) : null;

  const cls = ['cwrap', vis && 'pen-on', 'tool-' + tool, nearFirst && 'near-first'].filter(Boolean).join(' ');
  const pos = (p) => ({ left: p.x * 100 + '%', top: p.y * 100 + '%' });
  return (
    <div className={cls} ref={wrap}>
      <canvas ref={canvasRef.out} className={[transparent && 'checker', picking && 'picking'].filter(Boolean).join(' ') || undefined}
        role="img" aria-label="Aperçu de l'image convertie en caractères" onClick={onPick}></canvas>
      <svg className="curve-ui" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" hidden={!vis}>
        <path className="cu-ext" d={ov ? ov.ext : ''} />
        <path className="cu-under" d={ov ? ov.line : ''} />
        <path className="cu-line" d={ov ? ov.line : ''} />
        <path className="cu-rubber" d={ov ? ov.rubber : ''} />
        <path className="cu-arms" d={ov ? ov.arms : ''} />
      </svg>
      <div className="curve-handles" hidden={!vis}>
        {ov && ov.anchors.map((a, i) => (
          <span key={i} className={'pen-anchor' + (a.sel ? ' sel' : '') + (a.smooth ? ' smooth' : '') + (a.first ? ' first' : '')} style={pos(a)}></span>
        ))}
        {ov && ov.knobs.map((k) => <span key={k.side} className="pen-knob" style={pos(k)}></span>)}
      </div>
    </div>
  );
}
