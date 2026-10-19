import { useSetting, setSettings } from '../../state/index.js';
import { newPath, toggleClosed, resetPath } from '../../state/pen.js';
import Slider from '../controls/Slider.jsx';
import Seg from '../controls/Seg.jsx';
import { Check, Switch } from '../controls/Toggles.jsx';
import CurveEditor from './CurveEditor.jsx';

const DIRS = [
  ['45', 'En haut à gauche', '↖'], ['90', 'En haut', '↑'], ['135', 'En haut à droite', '↗'],
  ['0', 'À gauche', '←'], ['radial', 'Au centre (radial)', '◎'], ['180', 'À droite', '→'],
  ['315', 'En bas à gauche', '↙'], ['270', 'En bas', '↓'], ['225', 'En bas à droite', '↘']
];

function Compass() {
  const gType = useSetting('gType'), gAngle = useSetting('gAngle');
  return (
    <div className="compass" role="group" aria-labelledby="dirLabel">
      {DIRS.map(([d, label, arrow]) => (
        <button key={d} type="button" aria-label={label}
          aria-pressed={gType === 'radial' ? d === 'radial' : d === String(gAngle)}
          onClick={() => setSettings(d === 'radial' ? { gType: 'radial' } : { gType: 'linear', gAngle: +d })}>{arrow}</button>
      ))}
    </div>
  );
}

export default function GradientSection() {
  const grad = useSetting('grad'), gShape = useSetting('gShape'), gType = useSetting('gType');
  const gStyle = useSetting('gStyle'), gInvert = useSetting('gInvert'), gShowCurve = useSetting('gShowCurve');
  const closed = useSetting('gPath').closed;
  const libre = gShape === 'libre';
  return (
    <section className="group">
      <h2>Dégradé</h2>
      <Switch label="Appliquer l'effet en dégradé" checked={grad} onChange={(v) => setSettings({ grad: v })} />
      <div className="cutbox" aria-disabled={!grad}>
        <div className="field">
          <span className="name">Forme de la frontière</span>
          <Seg className="three" label="Forme de la frontière" value={gShape} onChange={(v) => setSettings({ gShape: v })}
            options={[{ value: 'droite', label: 'Droite' }, { value: 'vague', label: 'Vague' }, { value: 'libre', label: 'Courbe libre' }]} />
        </div>
        <div className="field" hidden={!libre}>
          <p className="hint">Dessine sur l'aperçu avec la barre d'outils <b>Plume</b> qui s'affiche au-dessus de l'image, comme dans Photoshop. Un tracé <b>fermé</b> entoure un élément : l'effet s'applique à l'intérieur. Un tracé <b>ouvert</b> coupe l'image : l'effet va du côté gauche du tracé. « Inverser les côtés » fait l'inverse.</p>
          <div className="btnrow">
            <button className="btn small primary" type="button" onClick={newPath}>Nouveau tracé</button>
            <button className="btn small" type="button" onClick={toggleClosed}>{closed ? 'Ouvrir le tracé' : 'Fermer le tracé'}</button>
            <button className="btn small" type="button" onClick={resetPath}>Tracé d'exemple</button>
          </div>
          <Check checked={gShowCurve} onChange={(v) => setSettings({ gShowCurve: v })}>Afficher le tracé sur l'aperçu</Check>
          <details className="keys">
            <summary>Raccourcis clavier</summary>
            <ul>
              <li><kbd>P</kbd> Plume · <kbd>A</kbd> Sélection directe · <kbd>+</kbd> Ajouter · <kbd>−</kbd> Supprimer · <kbd>Maj</kbd>+<kbd>C</kbd> Convertir</li>
              <li><b>Plume</b> : clic = point d'angle, cliquer-glisser = point courbe. Clic sur le premier point = fermer. Survol du tracé = ajouter, survol d'un point = supprimer.</li>
              <li><b>Alt</b> en glissant une poignée : casse la symétrie (point d'angle courbé).</li>
              <li><b>Maj</b> : contraint à 45°. <kbd>Suppr</kbd> retire le point sélectionné. <kbd>Échap</kbd> arrête le tracé. <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> annuler / rétablir.</li>
            </ul>
          </details>
        </div>
        <div className="field" hidden={libre}>
          <span className="name" id="dirLabel">Côté de l'effet</span>
          <div className="dirrow">
            <Compass />
            <p className="hint">La flèche indique où l'effet est le plus fort. L'autre côté garde l'image d'origine. Le centre crée un dégradé rond.</p>
          </div>
        </div>
        <Slider k="gAngle" label="Angle" min={0} max={359} step={1} hidden={libre || gType === 'radial'} />
        <div className="cutbox" hidden={gShape !== 'vague'}>
          <Slider k="gAmp" label="Amplitude de la vague" min={0} max={100} step={1} />
          <Slider k="gFreq" label={gType === 'radial' ? 'Nombre de pétales' : "Nombre d'ondulations"} min={0.5} max={12} step={0.5} />
          <Slider k="gPhase" label="Décalage de la vague" min={0} max={360} step={5} />
        </div>
        <Slider k="gPos" label="Position de la transition" min={0} max={100} step={1} hidden={libre} />
        <Slider k="gSoft" label="Largeur du fondu" min={0} max={100} step={1} />
        <div className="field">
          <span className="name" id="curveLabel">Courbe de progression</span>
          <CurveEditor />
        </div>
        <div className="field">
          <span className="name">Transition</span>
          <Seg label="Style de transition" value={gStyle} onChange={(v) => setSettings({ gStyle: v })}
            options={[{ value: 'superpose', label: 'Effet sur la photo' }, { value: 'fondu', label: 'Fondu simple' }]} />
        </div>
        <Check checked={gInvert} onChange={(v) => setSettings({ gInvert: v })}>Inverser les côtés</Check>
      </div>
    </section>
  );
}
