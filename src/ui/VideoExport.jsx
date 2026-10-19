import { useEffect, useRef, useState } from 'react';
import { fmt } from '../engine/index.js';
import { session, useSession, useSetting } from '../state/index.js';
import { frameCount, rangeFrames, formatDuration, formatFps } from '../state/video.js';
import {
  FORMATS, GIF_MAX, exportSize, exportVideo, closeVideoExport, cancelVideoExport, closeExportStatus, revealExport
} from '../state/video-export.js';
import Seg from './controls/Seg.jsx';
import { Check } from './controls/Toggles.jsx';
import './CodeSheet.css';
import './VideoExport.css';

const CADENCES = [30, 25, 24, 15, 12];
// libellé sur deux lignes : nom, puis valeur
const two = (name, value) => <><span>{name}</span><small>{value}</small></>;

// Fenêtre « Exporter la vidéo » : format, taille, cadence, plage, son, qualité
function ExportDialog() {
  const open = useSession('vExportOpen'), saved = useSession('vExportOpts'), video = useSession('video');
  const vIn = useSession('vIn'), vOut = useSession('vOut'), stats = useSession('stats');
  const transparent = useSetting('transparent');
  const [o, setO] = useState(saved);
  const first = useRef(null);
  useEffect(() => { if (open) { setO(saved); setTimeout(() => first.current && first.current.querySelector('button[aria-pressed="true"]')?.focus(), 0); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') closeVideoExport(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || !video) return null;

  const m = video.meta, f = FORMATS[o.format];
  const set = (p) => setO((x) => ({ ...x, ...p }));
  // GIF : 15 images/s conseillées
  const setFormat = (format) => set({ format, ...(format === 'gif' && o.cadence === 0 ? { cadence: 15 } : {}) });
  const ranged = vIn > 0 || vOut < m.duree;
  const plage = ranged ? o.plage : 'tout';
  const [inF, outF] = rangeFrames();
  const srcFrames = plage === 'es' ? outF - inF + 1 : frameCount();
  const rate = o.cadence || m.cadence || 25, seconds = srcFrames / (m.cadence || 25);
  const outFrames = Math.max(1, o.cadence ? Math.round(seconds * o.cadence) : srcFrames);
  const size = exportSize({ ...o, plage });
  const sizeOf = (taille) => { const s = exportSize({ ...o, taille }); return s ? `${fmt(s.W)} × ${fmt(s.H)}` : ''; };
  const sound = f.sound && m.son;

  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) closeVideoExport(); }}>
      <div className="sheet-card vexport-card" role="dialog" aria-modal="true" aria-labelledby="vexTitle">
        <div className="sheet-top">
          <div>
            <h3 id="vexTitle">Exporter la vidéo</h3>
            <p className="hint">Chaque image est rendue avec les réglages actuels{stats ? '' : '…'}</p>
          </div>
          <button className="btn small" type="button" onClick={closeVideoExport}>Fermer</button>
        </div>
        <div className="vex-grid">
          <div className="field" ref={first}>
            <span className="name">Format</span>
            <Seg className="vex-formats" label="Format" value={o.format} onChange={setFormat}
              options={Object.entries(FORMATS).map(([value, x]) => ({ value, label: x.label }))} />
            <p className="hint"><b>{f.name}</b> · {f.hint}</p>
          </div>
          <div className="field">
            <span className="name">Taille</span>
            <Seg label="Taille" value={o.taille} onChange={(taille) => set({ taille })}
              options={[{ value: 'sortie', label: two('Largeur de sortie', sizeOf('sortie')) }, { value: 'origine', label: two("Taille d'origine", sizeOf('origine')) }]} />
            <p className="hint">{o.format === 'gif' ? `GIF : ${fmt(GIF_MAX)} px de large au plus. ` : ''}La hauteur suit les proportions de l'effet.</p>
          </div>
          <div className="field">
            <label htmlFor="vexRate" className="name">Cadence</label>
            <select id="vexRate" value={o.cadence} onChange={(e) => set({ cadence: +e.target.value })}>
              <option value="0">D'origine ({formatFps(m.cadence || 25)})</option>
              {CADENCES.map((c) => <option key={c} value={c}>{c} images par seconde</option>)}
            </select>
            <p className="hint">Les faibles cadences donnent un rendu saccadé, « image par image ».</p>
          </div>
          <div className="field">
            <span className="name">Plage</span>
            <Seg label="Plage" value={plage} onChange={(p) => set({ plage: p })}
              options={[{ value: 'tout', label: two('Toute la vidéo', formatDuration(m.duree)) },
                { value: 'es', label: two('Entrée → sortie', formatDuration((outF - inF + 1) / (m.cadence || 25))), disabled: !ranged }]} />
            {!ranged && <p className="hint">Place des points d'entrée et de sortie (I, O) sous l'aperçu pour n'exporter qu'une partie.</p>}
          </div>
          <div className="field">
            <span className="name">Qualité</span>
            <Seg className="three" label="Qualité" value={o.qualite} onChange={(qualite) => set({ qualite })}
              options={[{ value: 'haute', label: 'Haute', disabled: o.format === 'png' }, { value: 'moyenne', label: 'Moyenne', disabled: o.format === 'png' }, { value: 'legere', label: 'Légère', disabled: o.format === 'png' }]} />
            {o.format === 'png' && <p className="hint">Les PNG sont sans perte.</p>}
          </div>
          <div className="field">
            <span className="name">Son</span>
            <Check checked={sound && o.son} disabled={!sound} onChange={(son) => set({ son })}>Conserver le son d'origine</Check>
            {!sound && <p className="hint">{!m.son ? 'Cette vidéo n’a pas de son.' : `Le ${f.label} ne contient pas de son.`}</p>}
          </div>
        </div>
        <div className="sheet-foot">
          <p className="hint vex-summary">
            {size ? `${fmt(size.W)} × ${fmt(size.H)} px` : ''} · {fmt(outFrames)} images à {formatFps(rate)} · {formatDuration(seconds)}
            {transparent && (f.alpha ? ' · fond transparent' : ` · fond plein (le ${f.label} n'a pas de transparence)`)}
          </p>
          <div className="actions">
            <button className="btn" type="button" onClick={closeVideoExport}>Annuler</button>
            <button className="btn primary" type="button" onClick={() => exportVideo({ ...o, plage })}>Exporter…</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const clock = (s) => (s == null ? '…' : formatDuration(Math.ceil(s), 0));

// Progression de l'export (en bas à droite, l'interface reste utilisable)
function ExportStatus() {
  const x = useSession('vExport');
  if (!x) return null;
  return (
    <div className={'vexport-status ' + x.phase} role="status" aria-live="polite">
      {x.phase === 'run' && <>
        <div className="vrow"><b>Export vidéo</b><span>{x.name}</span></div>
        <progress max={x.total || 1} value={x.n} aria-label="Progression de l'export"></progress>
        <div className="vrow">
          <span>image {fmt(x.n)} / {fmt(x.total)}{x.fps ? ` · ${Math.round(x.fps * 10) / 10} i/s` : ''} · reste {clock(x.eta)}</span>
          <button className="btn small" type="button" onClick={cancelVideoExport}>Annuler</button>
        </div>
      </>}
      {x.phase === 'done' && <>
        <div className="vrow"><b>Vidéo enregistrée</b><span>{x.name}</span></div>
        <p className="hint">{fmt(x.n)} images en {clock(x.secs)}</p>
        <div className="vrow end">
          <button className="btn small" type="button" onClick={revealExport}>Ouvrir le dossier</button>
          <button className="btn small" type="button" onClick={closeExportStatus}>Fermer</button>
        </div>
      </>}
      {x.phase === 'error' && <>
        <div className="vrow"><b>L'export vidéo n'a pas abouti</b></div>
        <p className="hint">{x.msg}</p>
        <div className="vrow end"><button className="btn small" type="button" onClick={closeExportStatus}>Fermer</button></div>
      </>}
    </div>
  );
}

export default function VideoExport() {
  return <><ExportDialog /><ExportStatus /></>;
}
