import { useEffect, useRef, useState } from 'react';
import { toast, useSession } from '../state/index.js';
import { buildCode, closeSheet, saveCode } from '../state/actions.js';
import './CodeSheet.css';

const TABS = [['html', 'HTML + CSS'], ['svg', 'SVG en ligne'], ['txt', 'Texte brut']];

// Fenêtre « Intégrer dans un site » : HTML + CSS, SVG, texte brut
export default function CodeSheet() {
  const open = useSession('sheetOpen');
  const [tab, setTab] = useState('html');
  const [res, setRes] = useState(null);
  const copyBtn = useRef(null), area = useRef(null);

  useEffect(() => {
    if (!open) return;
    const r = buildCode(tab);
    if (!r) return;
    if (r.tab !== tab) setTab(r.tab);
    setRes(r);
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    copyBtn.current && copyBtn.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    closeSheet();
    const b = document.getElementById('exCode');
    if (b) b.focus();
  }
  function copy() {
    const fallback = () => { area.current.focus(); area.current.select(); toast('Code sélectionné : copie-le avec Ctrl+C (ou Cmd+C).'); };
    try { navigator.clipboard.writeText(res.code).then(() => toast('Code copié dans le presse-papiers.'), fallback); }
    catch (e) { fallback(); }
  }

  if (!open) return null;
  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <div className="sheet-top">
          <div>
            <h3 id="sheetTitle">Intégrer dans un site</h3>
            <p className="hint">{res ? res.size : ''}</p>
          </div>
          <button className="btn small" type="button" onClick={close}>Fermer</button>
        </div>
        <div className="tabs" role="tablist" aria-label="Format du code">
          {TABS.map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} hidden={id === 'txt' && res && res.ht} onClick={() => setTab(id)}>{name}</button>
          ))}
        </div>
        <textarea ref={area} readOnly spellCheck={false} aria-label="Code généré" value={res ? res.code : ''}></textarea>
        <div className="sheet-foot">
          <p className="hint">{res ? res.hint : ''}</p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => res && saveCode(res.tab, res.code)}>Enregistrer…</button>
            <button className="btn primary" type="button" ref={copyBtn} onClick={copy}>Copier le code</button>
          </div>
        </div>
      </div>
    </div>
  );
}
