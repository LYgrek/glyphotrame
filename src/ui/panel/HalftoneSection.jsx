import { useSetting, setSettings } from '../../state/index.js';
import { setHtType } from '../../state/actions.js';
import Slider from '../controls/Slider.jsx';
import Seg from '../controls/Seg.jsx';
import { Check } from '../controls/Toggles.jsx';

const SHAPES = [
  ['rond', 'Rond', <circle r="7" />],
  ['carre', 'Carré', <rect x="-6" y="-6" width="12" height="12" />],
  ['losange', 'Losange', <path d="M0-8L8 0 0 8-8 0Z" />],
  ['ellipse', 'Ellipse', <ellipse rx="8.5" ry="4.5" />],
  ['triangle', 'Triangle', <path d="M0-8L7.5 5.5-7.5 5.5Z" />],
  ['hexagone', 'Hexagone', <path d="M7.5 0L3.75 6.5-3.75 6.5-7.5 0-3.75-6.5 3.75-6.5Z" />],
  ['croix', 'Croix', <path d="M-2.5-8h5v5.5h5.5v5h-5.5v5.5h-5v-5.5h-5.5v-5h5.5Z" />],
  ['etoile', 'Étoile', <path d="M0-8.5L2.4-3.3 8.1-2.6 3.9 1.3 5 7 0 4.2-5 7-3.9 1.3-8.1-2.6-2.4-3.3Z" />],
  ['tiret', 'Tiret', <rect x="-8.5" y="-3" width="17" height="6" />]
];

export default function HalftoneSection() {
  const effect = useSetting('effect'), t = useSetting('htType'), shape = useSetting('htShape');
  const grid = useSetting('htGrid'), htVar = useSetting('htVar'), mode = useSetting('mode');
  const points = t === 'points', lignes = t === 'lignes', poin = t === 'pointillisme';
  return (
    <section className="group" hidden={effect !== 'halftone'}>
      <h2>Trame halftone</h2>
      <Seg className="three" label="Type de trame" value={t} onChange={setHtType}
        options={[{ value: 'points', label: 'Points' }, { value: 'lignes', label: 'Lignes' }, { value: 'pointillisme', label: 'Pointillisme' }]} />
      <div className="field" hidden={!points}>
        <span className="name" id="shapeLabel">Forme des points</span>
        <div className="shapes" role="group" aria-labelledby="shapeLabel">
          {SHAPES.map(([id, name, svg]) => (
            <button key={id} type="button" aria-pressed={shape === id} title={name} onClick={() => setSettings({ htShape: id })}>
              <svg viewBox="-10 -10 20 20" aria-hidden="true">{svg}</svg><span>{name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field" hidden={!points}>
        <span className="name">Grille</span>
        <Seg label="Grille" value={grid} onChange={(v) => setSettings({ htGrid: v })}
          options={[{ value: 'carree', label: 'Carrée' }, { value: 'hexa', label: 'Hexagonale' }]} />
      </div>
      <Slider k="htCell" label={poin ? 'Espacement des points' : lignes ? 'Écart entre les lignes' : 'Taille de la trame'} term="linéature" min={3} max={60} step={1} />
      <Slider k="htAngle" label="Angle de la trame" min={0} max={180} step={1} hidden={poin} />
      <Slider k="htMax" label={poin ? 'Taille des points' : lignes ? 'Épaisseur maximale' : 'Taille maximale'} min={10} max={160} step={1} />
      <Slider k="htMin" label={lignes ? 'Épaisseur minimale' : 'Taille minimale'} min={0} max={80} step={1} hidden={poin} />
      <Slider k="htJit" label="Désordre" min={0} max={100} step={1} hidden={!points} />
      <div className="cutbox" hidden={!lignes}>
        <Slider k="htAmp" label="Ondulation des lignes" min={0} max={100} step={1} />
        <Slider k="htFreq" label="Nombre d'ondulations" min={0.5} max={30} step={0.5} />
      </div>
      <Check checked={htVar} onChange={(v) => setSettings({ htVar: v })} hidden={!poin}>Points plus gros dans les zones sombres</Check>
      <p className="hint" hidden={mode !== 'cmyk'}>En CMJN, chaque encre a son propre angle (cyan 15°, magenta 75°, jaune 0°, noir 45°), ajouté à l'angle de la trame. C'est ce qui crée la rosette des impressions offset.</p>
    </section>
  );
}
