import { exportRaster, exportSVG, openSheet } from '../state/actions.js';
import { openProject, saveProject } from '../state/project.js';
import { useSession } from '../state/index.js';
import { openVideoExport } from '../state/video-export.js';
import './Header.css';

const MARK = ['@', '%', ':', '#', '+', '.', '=', '-', ' '];

// Projet : nom du fichier (• = modifications non enregistrées), ouvrir, enregistrer (Maj+clic : enregistrer sous)
function ProjectGroup() {
  const name = useSession('projectName'), path = useSession('projectPath'), dirty = useSession('dirty');
  return (
    <div className="exports project" role="group" aria-label="Projet">
      <span className="lbl">Projet</span>
      <span className="projname" title={path || name || ''}>{(name || 'Sans titre').replace(/\.glyphotrame\.json$|\.json$/, '')}{dirty ? ' •' : ''}</span>
      <button className="btn" type="button" onClick={openProject} title="Ouvrir un projet (Ctrl+O)">Ouvrir…</button>
      <button className="btn" type="button" onClick={(e) => saveProject(e.shiftKey)} title="Enregistrer le projet (Ctrl+S) · Maj+clic ou Ctrl+Maj+S : enregistrer sous">Enregistrer</button>
    </div>
  );
}

export default function Header() {
  const video = useSession('video');
  return (
    <header className="bar">
      <div className="brand">
        <div className="mark" aria-hidden="true">{MARK.map((c, i) => <span key={i}>{c}</span>)}</div>
        <div>
          <h1>Glyphotrame</h1>
          <p>Trames de caractères et halftone à partir de tes images</p>
        </div>
      </div>
      <div className="bar-actions">
        <ProjectGroup />
        <div className="exports" role="group" aria-label="Exporter">
          <span className="lbl">Exporter</span>
          <button className="btn" type="button" onClick={() => exportRaster('png')}>PNG</button>
          <button className="btn" type="button" onClick={() => exportRaster('jpeg')}>JPEG</button>
          <button className="btn" type="button" onClick={exportSVG}>SVG</button>
          {video && <button className="btn" type="button" onClick={openVideoExport} title="Exporter toute la vidéo avec l'effet (les autres exports portent sur l'image courante)">Vidéo…</button>}
          <button className="btn primary" id="exCode" type="button" onClick={openSheet}>&lt;/&gt; Code</button>
        </div>
      </div>
    </header>
  );
}
