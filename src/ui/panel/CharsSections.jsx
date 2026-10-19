import { useRef } from 'react';
import { PRESETS } from '../../engine/index.js';
import { useSetting, setSettings } from '../../state/index.js';
import { setPreset, setCustom } from '../../state/actions.js';
import Slider from '../controls/Slider.jsx';
import { Check } from '../controls/Toggles.jsx';

export function TypographySection() {
  const effect = useSetting('effect'), font = useSetting('font');
  return (
    <section className="group" hidden={effect !== 'chars'}>
      <h2>Typographie</h2>
      <div className="seg fonts" role="group" aria-label="Police">
        <button type="button" aria-pressed={font === 'sans'} onClick={() => setSettings({ font: 'sans' })}>
          <span className="spec sans">Ag</span><span>Archivo<small>Sans serif</small></span>
        </button>
        <button type="button" aria-pressed={font === 'serif'} onClick={() => setSettings({ font: 'serif' })}>
          <span className="spec serif">Ag</span><span>Fraunces<small>Serif</small></span>
        </button>
      </div>
      <Slider k="size" label="Taille" term="corps" min={5} max={64} step={1} />
      <Slider k="weight" label="Épaisseur" term="graisse" min={100} max={900} step={50} />
      <Slider k="spacing" label="Espacement des caractères" term="approche" min={-4} max={24} step={0.5} />
      <Slider k="leading" label="Interligne" min={60} max={200} step={5} />
    </section>
  );
}

export function CharsSection() {
  const effect = useSetting('effect'), preset = useSetting('preset'), custom = useSetting('custom'), sort = useSetting('sort');
  const input = useRef(null);
  return (
    <section className="group" hidden={effect !== 'chars'}>
      <h2>Caractères</h2>
      <div className="field">
        <label htmlFor="preset">Jeu de caractères</label>
        <select id="preset" value={preset} onChange={(e) => { if (setPreset(e.target.value)) input.current.focus(); }}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="chars">Caractères utilisés</label>
        <input ref={input} className="textin" id="chars" type="text" spellCheck={false} autoComplete="off"
          value={custom} onChange={(e) => setCustom(e.target.value)} />
        <p className="hint">Tape n'importe quels caractères du clavier. L'espace sert aux zones vides.</p>
      </div>
      <Check checked={sort} onChange={(v) => setSettings({ sort: v })}>Classer automatiquement par densité d'encre</Check>
    </section>
  );
}

export function TonesSection() {
  const invert = useSetting('invert');
  return (
    <section className="group">
      <h2>Tons</h2>
      <Slider k="bright" label="Luminosité" min={-100} max={100} step={1} />
      <Slider k="contrast" label="Contraste" min={-90} max={90} step={1} />
      <Check checked={invert} onChange={(v) => setSettings({ invert: v })}>Inverser les tons</Check>
    </section>
  );
}
