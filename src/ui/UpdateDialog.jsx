import { useEffect, useRef } from 'react';
import { useSession } from '../state/index.js';
import { postponeUpdate, installUpdate, saveThenInstall, installWithoutSaving, backToUpdate } from '../state/updater.js';
import './CodeSheet.css';
import './UpdateDialog.css';

const mo = (n) => (n / 1048576).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' Mo';

// Fenêtre « Glyphotrame X.Y.Z est disponible » : notes de version, installer maintenant ou plus tard,
// enregistrement du projet, progression du téléchargement
export default function UpdateDialog() {
  const u = useSession('update'), name = useSession('projectName');
  const main = useRef(null);
  const phase = u && u.phase;
  const busy = phase === 'download' || phase === 'install';
  useEffect(() => { if (phase && !busy) setTimeout(() => main.current && main.current.focus(), 0); }, [phase]);
  useEffect(() => {
    if (!phase || busy) return;
    const onKey = (e) => { if (e.key === 'Escape') { if (phase === 'save') backToUpdate(); else postponeUpdate(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);
  if (!u) return null;

  const pct = u.total ? Math.min(100, Math.round((u.received / u.total) * 100)) : null;
  const project = (name || 'Sans titre').replace(/\.glyphotrame\.json$|\.json$/, '');

  return (
    <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget && phase === 'available') postponeUpdate(); }}>
      <div className="sheet-card update-card" role="dialog" aria-modal="true" aria-labelledby="updTitle">
        <div className="sheet-top">
          <div>
            <h3 id="updTitle">Glyphotrame {u.version} est disponible</h3>
            <p className="hint">{busy ? 'Mise à jour en cours : ne ferme pas Glyphotrame.' : "Une nouvelle version de l'application peut être installée."}</p>
          </div>
        </div>

        {(phase === 'available' || phase === 'error') && (
          u.notes ? <div className="upd-notes" tabIndex={0} aria-label="Notes de version">{u.notes}</div>
            : <p className="hint">Aucune note de version.</p>
        )}

        {phase === 'error' && <p className="upd-error">La mise à jour n'a pas pu être installée : {u.msg}</p>}

        {phase === 'save' && (
          <p className="upd-question">Le projet « {project} » a des modifications non enregistrées. Glyphotrame va redémarrer : veux-tu l'enregistrer avant ?</p>
        )}

        {busy && (
          <div className="upd-progress" role="status" aria-live="polite">
            <progress max={u.total || 1} value={phase === 'install' ? (u.total || 1) : u.received} aria-label="Téléchargement de la mise à jour"></progress>
            <p className="hint">
              {phase === 'install' ? 'Installation… Glyphotrame va redémarrer.'
                : `Téléchargement… ${pct != null ? `${pct} % · ${mo(u.received)} / ${mo(u.total)}` : mo(u.received)}`}
            </p>
          </div>
        )}

        <div className="sheet-foot">
          <span />
          <div className="actions">
            {phase === 'available' && <>
              <button className="btn" type="button" onClick={postponeUpdate}>Plus tard</button>
              <button className="btn primary" type="button" ref={main} onClick={installUpdate}>Installer maintenant</button>
            </>}
            {phase === 'save' && <>
              <button className="btn" type="button" onClick={backToUpdate}>Annuler</button>
              <button className="btn" type="button" onClick={installWithoutSaving}>Ne pas enregistrer</button>
              <button className="btn primary" type="button" ref={main} onClick={saveThenInstall}>Enregistrer</button>
            </>}
            {phase === 'error' && <>
              <button className="btn" type="button" onClick={postponeUpdate}>Fermer</button>
              <button className="btn primary" type="button" ref={main} onClick={installUpdate}>Réessayer</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
