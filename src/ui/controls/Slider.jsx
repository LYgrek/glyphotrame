import { useSetting, setSettings } from '../../state/index.js';
import { FORMAT } from '../format.js';

// Curseur relié à un réglage : libellé, terme technique facultatif, valeur affichée
export default function Slider({ k, label, term, min, max, step, hidden, children }) {
  const v = useSetting(k);
  return (
    <div className="field" hidden={hidden}>
      <div className="row">
        <label htmlFor={k}>{label}{term && <span className="term">{term}</span>}</label>
        <output htmlFor={k}>{FORMAT[k](v)}</output>
      </div>
      <input type="range" id={k} min={min} max={max} step={step} value={v}
        onChange={(e) => setSettings({ [k]: +e.target.value })} />
      {children}
    </div>
  );
}
