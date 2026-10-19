import { NEON_PRESETS, SWATCHES } from '../../engine/index.js';
import { useSetting, setSettings } from '../../state/index.js';
import { setMode, setColors, applyNeonPreset, neonImageColors } from '../../state/actions.js';
import Slider from '../controls/Slider.jsx';
import Seg from '../controls/Seg.jsx';
import { Check, ColorField } from '../controls/Toggles.jsx';

function NeonFields() {
  const a = useSetting('neonA'), b = useSetting('neonB'), c = useSetting('neonC');
  const mid = useSetting('neonMid'), mix = useSetting('neonMix');
  return (
    <>
      <div className="field">
        <span className="name" id="neonLabel">Palette néon</span>
        <div className="neon-presets" role="group" aria-labelledby="neonLabel">
          {NEON_PRESETS.map((p) => (
            <button key={p.name} type="button" aria-pressed={mix < 100 && p.a === a && p.b === b && p.c === c} onClick={() => applyNeonPreset(p)}>
              <i style={{ background: `linear-gradient(90deg,${p.a},${p.b} 55%,${p.c})` }}></i>{p.name}
            </button>
          ))}
          <button type="button" aria-pressed={mix === 100} onClick={neonImageColors}>
            <i style={{ background: 'linear-gradient(90deg,#ff2d55,#ffcc00,#34e07a,#2fa8ff,#b04dff)' }}></i>Couleurs de l'image
          </button>
        </div>
      </div>
      <div className="neon-bar" aria-hidden="true" style={{ background: `linear-gradient(90deg,${a},${b} ${mid}%,${c})` }}></div>
      <div className="colors three">
        <ColorField label="Ombres" value={a} onChange={(v) => setSettings({ neonA: v })} />
        <ColorField label="Milieux" value={b} onChange={(v) => setSettings({ neonB: v })} />
        <ColorField label="Lumières" value={c} onChange={(v) => setSettings({ neonC: v })} />
      </div>
      <Slider k="neonMid" label="Position des milieux" min={10} max={90} step={1} />
      <Slider k="neonMix" label="Couleurs de l'image" min={0} max={100} step={1}>
        <p className="hint">0 % = palette seule, 100 % = vraies couleurs de l'image passées en néon. Entre les deux, les deux se mélangent.</p>
      </Slider>
      <div className="cutbox" aria-disabled={mix === 0}>
        <Slider k="neonSat" label="Saturation" min={0} max={250} step={5} />
        <Slider k="neonPop" label="Éclat des couleurs" min={0} max={100} step={1} />
      </div>
      <p className="hint">Les zones sombres prennent la couleur des ombres, les plus claires celle des lumières. Sur fond sombre, l'effet ressort comme un écran allumé.</p>
    </>
  );
}

export default function ColorsSection() {
  const effect = useSetting('effect'), mode = useSetting('mode');
  const ink = useSetting('ink'), paper = useSetting('paper'), transparent = useSetting('transparent');
  return (
    <section className="group">
      <h2>Couleurs</h2>
      <Seg className="modes" label="Mode de couleur" value={mode} onChange={setMode}
        options={[{ value: 'mono', label: 'Monochrome' }, { value: 'color', label: 'Image' }, { value: 'neon', label: 'Néon' },
          { value: 'cmyk', label: 'CMJN', hidden: effect !== 'halftone' }]} />
      <div className="cutbox" hidden={mode !== 'neon'}><NeonFields /></div>
      <div className="swatches">
        {SWATCHES.map((s) => (
          <button key={s.name} type="button" className="swatch" onClick={() => setColors(s.ink, s.paper)}>
            <i style={{ background: s.paper, color: s.ink }}>#</i>{s.name}
          </button>
        ))}
      </div>
      <div className="colors">
        <ColorField label="Encre" value={ink} off={mode !== 'mono'} onChange={(v) => setColors(v, paper)} />
        <ColorField label="Fond" value={paper} onChange={(v) => setColors(ink, v)} />
      </div>
      <Check checked={transparent} onChange={(v) => setSettings({ transparent: v })}>Fond transparent (PNG, SVG et code)</Check>
    </section>
  );
}
