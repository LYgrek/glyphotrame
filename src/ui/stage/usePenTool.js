/* Gestes de l'outil plume sur l'aperçu (façon Photoshop), repris de la référence :
   plume, sélection directe, ajouter, supprimer, convertir ; raccourcis clavier. */
import { useEffect } from 'react';
import * as E from '../../engine/index.js';
import { session, toast } from '../../state/index.js';
import { getPath, setPath, pushHist, undoPath, redoPath, setPenTool, penActive } from '../../state/pen.js';
import { setDragging, endDrag } from '../../state/renderer.js';

const { clamp, clonePath, hasH, pxLen, constrain45, hitAnchor, hitKnob, hitSegment, insertAt, deleteNode, toggleSmooth } = E;

export default function usePenTool(wrapRef) {
  useEffect(() => {
    const el = wrapRef.current;
    let action = null;
    const rect = () => el.getBoundingClientRect();
    const relPos = (e) => { const r = rect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    const sel = (i) => session.set({ selNode: i });

    const down = (e) => {
      if (!penActive() || session.get().picking || e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const p = relPos(e), r = rect(), { penTool: tool, selNode } = session.get();
      let path = clonePath(getPath());
      const N = path.nodes, closed = path.closed;
      const knob = hitKnob(path, selNode, p, r), ai = hitAnchor(path, p, r);
      action = null;
      if (tool === 'pen') {
        if (knob) { pushHist(); action = { type: 'knob', ...knob }; }
        else if (ai >= 0) {
          pushHist();
          if (!closed && ai === 0 && N.length >= 2) {
            path.closed = true; sel(0); action = { type: 'pull', i: 0, from: p };
            toast('Tracé fermé : l\'effet s\'applique à l\'intérieur.');
          } else if (!closed && ai === N.length - 1) { N[ai].hout = [0, 0]; sel(ai); action = { type: 'pull', i: ai, from: p, outOnly: true }; }
          else { path = deleteNode(path, ai); sel(-1); }
        } else {
          const seg = hitSegment(path, p, r);
          if (seg) { pushHist(); const res = insertAt(path, seg.seg, seg.t); path = res.path; sel(res.index); }
          else if (closed) toast('Le tracé est fermé. « Nouveau tracé » pour en dessiner un autre, ou l\'outil Sélection pour le modifier.');
          else {
            pushHist();
            let q = p;
            if (e.shiftKey && N.length) { const l = N[N.length - 1], v = constrain45([p[0] - l.x, p[1] - l.y], r); q = [clamp(l.x + v[0], 0, 1), clamp(l.y + v[1], 0, 1)]; }
            N.push({ x: q[0], y: q[1], hin: [0, 0], hout: [0, 0], smooth: false });
            sel(N.length - 1); action = { type: 'pull', i: N.length - 1, from: q };
          }
        }
      } else if (tool === 'select') {
        if (knob) { pushHist(); action = { type: 'knob', ...knob }; }
        else if (ai >= 0) { pushHist(); sel(ai); action = { type: 'move', i: ai, from: p, x0: N[ai].x, y0: N[ai].y }; }
        else sel(-1);
      } else if (tool === 'add') {
        const seg = hitSegment(path, p, r, 10);
        if (seg) { pushHist(); const res = insertAt(path, seg.seg, seg.t); path = res.path; sel(res.index); }
        else toast('Clique sur le tracé pour y ajouter un point.');
      } else if (tool === 'del') {
        if (ai >= 0) { pushHist(); path = deleteNode(path, ai); sel(-1); }
      } else if (tool === 'convert') {
        if (knob) { pushHist(); path.nodes[knob.i].smooth = false; action = { type: 'knob', ...knob, free: true }; }
        else if (ai >= 0) { pushHist(); sel(ai); action = { type: 'convert', i: ai, from: p, moved: false }; }
      }
      setDragging(!!action);
      session.set({ penBusy: !!action });
      setPath(path);
    };

    const move = (e) => {
      if (!penActive()) return;
      const p = relPos(e), r = rect();
      if (!action) {
        if (session.get().penTool === 'pen') {
          const path = getPath();
          session.set({ penHover: p, nearFirst: !path.closed && path.nodes.length >= 2 && hitAnchor(path, p, r) === 0 });
        }
        return;
      }
      const a = action, path = clonePath(getPath()), n = path.nodes[a.i];
      if (!n) return;
      if (a.type === 'pull' || a.type === 'convert') {
        let v = [p[0] - n.x, p[1] - n.y];
        if (pxLen(v, r) < 3) return;
        if (e.shiftKey) v = constrain45(v, r);
        a.moved = true;
        n.hout = v;
        if (!a.outOnly) { n.hin = [-v[0], -v[1]]; n.smooth = true; }
      } else if (a.type === 'move') {
        let d = [p[0] - a.from[0], p[1] - a.from[1]];
        if (e.shiftKey) d = Math.abs(d[0] * r.width) > Math.abs(d[1] * r.height) ? [d[0], 0] : [0, d[1]];
        n.x = clamp(a.x0 + d[0], 0, 1); n.y = clamp(a.y0 + d[1], 0, 1);
      } else if (a.type === 'knob') {
        let v = [p[0] - n.x, p[1] - n.y];
        if (e.shiftKey) v = constrain45(v, r);
        n[a.side] = v;
        const other = a.side === 'hout' ? 'hin' : 'hout';
        if (e.altKey || a.free) n.smooth = false;
        else if (n.smooth && hasH(n[other])) { const k = pxLen(n[other], r) / (pxLen(v, r) || 1); n[other] = [-v[0] * k, -v[1] * k]; }
      }
      setPath(path);
    };

    const up = () => {
      if (!action) return;
      const a = action; action = null;
      session.set({ penBusy: false });
      if (a.type === 'convert' && !a.moved) {
        const path = clonePath(getPath()), n = path.nodes[a.i];
        if (n && (hasH(n.hin) || hasH(n.hout))) { n.hin = [0, 0]; n.hout = [0, 0]; n.smooth = false; setPath(path); }
      }
      endDrag();
    };
    const leave = () => { if (session.get().penHover) session.set({ penHover: null, nearFirst: false }); };
    const dbl = (e) => {
      if (!penActive() || session.get().penTool !== 'select') return;
      const ai = hitAnchor(getPath(), relPos(e), rect());
      if (ai >= 0) { pushHist(); setPath(toggleSmooth(getPath(), ai)); sel(ai); }
    };

    // raccourcis clavier façon Photoshop
    const keydown = (e) => {
      if (!penActive()) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || session.get().sheetOpen) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key, { penTool, selNode } = session.get();
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redoPath() : undoPath(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redoPath(); return; }
      if (mod || e.altKey) return;
      if (k === 'p' || k === 'P') setPenTool('pen');
      else if (k === 'a' || k === 'A') setPenTool('select');
      else if (k === '+' || k === '=') setPenTool('add');
      else if (k === '-' || k === '_') setPenTool('del');
      else if ((k === 'c' || k === 'C') && e.shiftKey) setPenTool('convert');
      else if ((k === 'Delete' || k === 'Backspace') && selNode >= 0) { e.preventDefault(); pushHist(); setPath(deleteNode(getPath(), selNode)); sel(-1); }
      else if (k === 'Escape') { if (penTool === 'pen') setPenTool('select'); sel(-1); }
      else if (k.startsWith('Arrow') && selNode >= 0) {
        e.preventDefault();
        const st = e.shiftKey ? 0.01 : 0.002;
        const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[k];
        pushHist();
        const path = clonePath(getPath()), n = path.nodes[selNode];
        n.x = clamp(n.x + mv[0], 0, 1); n.y = clamp(n.y + mv[1], 0, 1);
        setPath(path);
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('dblclick', dbl);
    document.addEventListener('keydown', keydown);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('dblclick', dbl);
      document.removeEventListener('keydown', keydown);
    };
  }, [wrapRef]);
}
