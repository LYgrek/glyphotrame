import { useSetting, useSession } from '../../state/index.js';
import { setEffect, openImage, loadSample } from '../../state/actions.js';
import Slider from '../controls/Slider.jsx';

export function EffectSection() {
  const effect = useSetting('effect');
  return (
    <section className="group">
      <h2>Effet</h2>
      <div className="seg effects" role="group" aria-label="Type d'effet">
        <button type="button" aria-pressed={effect === 'chars'} onClick={() => setEffect('chars')}>
          <span className="fx-ico chars" aria-hidden="true">#@<br />:.</span><span>Caractères<small>Lettres et signes</small></span>
        </button>
        <button type="button" aria-pressed={effect === 'halftone'} onClick={() => setEffect('halftone')}>
          <span className="fx-ico dots" aria-hidden="true"></span><span>Halftone<small>Points, lignes, pointillé</small></span>
        </button>
      </div>
    </section>
  );
}

export function ImageSection() {
  const name = useSession('sourceName');
  const over = useSession('dragOver');
  return (
    <section className="group">
      <h2>Image</h2>
      <button type="button" className={'drop' + (over ? ' over' : '')} onClick={openImage} title="Images (JPEG, PNG, WebP, GIF, SVG…) et vidéos (MP4, MOV, M4V, WebM, MKV, AVI)">
        <strong>Déposer une image ou cliquer pour choisir</strong>
        <span>JPEG, PNG, WebP, GIF, SVG · ou coller avec Ctrl+V</span>
      </button>
      <div className="srcrow">
        <span className="srcname" title={name}>{name}</span>
        <button className="btn small" type="button" onClick={loadSample}>Image d'exemple</button>
      </div>
      <Slider k="width" label="Largeur de sortie" min={300} max={2400} step={50} />
      <Slider k="srcMax" label="Taille max de l'image source" min={1000} max={8000} step={100}>
        <p className="hint">Les grandes images sont réduites à cette taille à l'ouverture. Au-delà de 2 000 px, le détourage et le halftone ralentissent.</p>
      </Slider>
    </section>
  );
}
