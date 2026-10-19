import { fmt } from '../../engine/index.js';
import { session, useSetting, useSession, setSettings } from '../../state/index.js';
import Seg from '../controls/Seg.jsx';
import { fxPreset, fxReset } from '../../state/actions.js';
import Slider from '../controls/Slider.jsx';
import { Check } from '../controls/Toggles.jsx';

export function ScreenFxSection() {
  const sync = useSetting('fxGridSync');
  return (
    <section className="group">
      <h2>Néon &amp; écran</h2>
      <button className="btn primary fxpreset" type="button" onClick={fxPreset}>Appliquer le style « Néon numérique »</button>
      <p className="hint">Fond noir, palette violet / jaune, lueur et grille d'écran. Tous les réglages restent modifiables ensuite.</p>
      <Slider k="fxGlow" label="Lueur" min={0} max={200} step={5} />
      <Slider k="fxGlowR" label="Diffusion de la lueur" min={1} max={40} step={1} />
      <Slider k="fxGrid" label="Grille d'écran" min={0} max={100} step={1} />
      <Slider k="fxGridW" label="Épaisseur de la grille" min={5} max={50} step={1} />
      <Check checked={sync} onChange={(v) => setSettings({ fxGridSync: v })}>Caler la grille sur la trame</Check>
      <Slider k="fxGridSize" label="Taille des mailles" min={2} max={40} step={1} hidden={sync} />
      <Slider k="fxScan" label="Lignes de balayage" min={0} max={100} step={1} />
      <Slider k="fxScanGap" label="Écart des lignes" min={2} max={16} step={1} />
      <Slider k="fxChroma" label="Aberration chromatique" min={0} max={12} step={0.5} />
      <Slider k="fxGrain" label="Grain" min={0} max={100} step={1} />
      <Slider k="fxVig" label="Vignettage" min={0} max={100} step={1} />
      <button className="btn small" type="button" onClick={fxReset}>Retirer les effets d'écran</button>
    </section>
  );
}

export function OutputSection() {
  const scale = useSetting('scale'), stats = useSession('stats');
  const rendu = useSession('rendu'), gpuOk = useSession('gpuOk');
  return (
    <section className="group">
      <h2>Sortie</h2>
      <div className="field">
        <span className="name">Rendu de l'aperçu et des PNG / JPEG</span>
        <Seg label="Rendu" value={rendu} onChange={(v) => session.set({ rendu: v })}
          options={[{ value: 'gpu', label: 'Carte graphique', disabled: gpuOk === false }, { value: 'canvas', label: 'Canvas 2D' }]} />
        <p className="hint">{gpuOk === false
          ? "WebGL2 n'est pas disponible sur cet ordinateur : le rendu passe par le canvas 2D."
          : 'La carte graphique rend l’aperçu et les grands exports bien plus vite. Le canvas 2D reproduit exactement la version d’origine.'}</p>
      </div>
      <div className="field">
        <div className="row">
          <label htmlFor="scale">Résolution PNG / JPEG</label>
          <output>{stats ? `${fmt(stats.W * scale)} × ${fmt(stats.H * scale)} px` : ''}</output>
        </div>
        <select id="scale" value={scale} onChange={(e) => setSettings({ scale: +e.target.value })}>
          <option value="1">1× (écran)</option>
          <option value="2">2× (Retina)</option>
          <option value="3">3× (impression)</option>
          <option value="4">4× (grand format)</option>
        </select>
      </div>
      <p className="hint">Le SVG et le code restent vectoriels : ils s'affichent nets à toutes les tailles.</p>
    </section>
  );
}
