import { useSetting, useSession, setSettings } from '../../state/index.js';
import { setCut, setCutColor, cutAutoDetect, setPicking } from '../../state/actions.js';
import { canvasRef } from '../../state/renderer.js';
import Slider from '../controls/Slider.jsx';
import { Check, Switch, ColorField } from '../controls/Toggles.jsx';

export default function CutoutSection() {
  const cut = useSetting('cut'), cutAuto = useSetting('cutAuto'), cutColor = useSetting('cutColor'), flood = useSetting('flood');
  const picking = useSession('picking');
  return (
    <section className="group">
      <h2>Détourage</h2>
      <Switch label="Supprimer le fond de l'image" checked={cut} onChange={setCut} />
      <div className="cutbox" aria-disabled={!cut}>
        <div className="field">
          <span className="name">Couleur du fond à retirer</span>
          <div className="cutcolor">
            <ColorField value={cutColor} mode={cutAuto ? 'Détectée' : 'Choisie'} onChange={setCutColor} />
            <button className="btn small" type="button" onClick={cutAutoDetect}>Auto</button>
            <button className="btn small" type="button" aria-pressed={picking} onClick={() => setPicking(!picking)}>Pipette</button>
          </div>
        </div>
        <Slider k="tol" label="Tolérance" min={0} max={100} step={1} />
        <Slider k="soft" label="Adoucir les bords" min={0} max={40} step={1} />
        <Check checked={flood} onChange={(v) => setSettings({ flood: v })}>
          Seulement le fond relié aux bords de l'image<br />
          <span className="hint">Garde les zones claires à l'intérieur du sujet (yeux, reflets, gants…)</span>
        </Check>
        <div className="cutthumb"><canvas ref={canvasRef.cutPreview} width="10" height="10" aria-label="Aperçu du détourage"></canvas></div>
      </div>
    </section>
  );
}
