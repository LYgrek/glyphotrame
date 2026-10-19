import { exportRaster, exportSVG, openSheet } from '../state/actions.js';
import './Header.css';

const MARK = ['@', '%', ':', '#', '+', '.', '=', '-', ' '];

export default function Header() {
  return (
    <header className="bar">
      <div className="brand">
        <div className="mark" aria-hidden="true">{MARK.map((c, i) => <span key={i}>{c}</span>)}</div>
        <div>
          <h1>Glyphotrame</h1>
          <p>Trames de caractères et halftone à partir de tes images</p>
        </div>
      </div>
      <div className="exports" role="group" aria-label="Exporter">
        <span className="lbl">Exporter</span>
        <button className="btn" type="button" onClick={() => exportRaster('png')}>PNG</button>
        <button className="btn" type="button" onClick={() => exportRaster('jpeg')}>JPEG</button>
        <button className="btn" type="button" onClick={exportSVG}>SVG</button>
        <button className="btn primary" id="exCode" type="button" onClick={openSheet}>&lt;/&gt; Code</button>
      </div>
    </header>
  );
}
