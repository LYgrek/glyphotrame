import { useSetting, useSession } from '../../state/index.js';
import { setPenTool, undoPath, redoPath, PEN_HINTS } from '../../state/pen.js';
import './PenToolbar.css';

const TOOLS = [
  { id: 'pen', label: 'Plume', title: 'Plume (P)', icon: <><path d="M8 1.5L12.5 7.5 9.8 14.5H6.2L3.5 7.5Z" /><path d="M8 1.5V7" /><circle cx="8" cy="8.2" r="1.2" /></> },
  { id: 'select', label: 'Sélection', title: 'Sélection directe (A)', icon: <path d="M3.5 1.5V13l3-3 2.4 5 2-1-2.4-4.8h4.2Z" /> },
  { id: 'add', label: 'Ajouter', title: 'Ajouter un point (+)', icon: <><path d="M6.5 2.5L10 7.5 7.8 13.5H5.2L3 7.5Z" /><path d="M12.5 1.5V6.5M10 4H15" /></> },
  { id: 'del', label: 'Supprimer', title: 'Supprimer un point (−)', icon: <><path d="M6.5 2.5L10 7.5 7.8 13.5H5.2L3 7.5Z" /><path d="M10 4H15" /></> },
  { id: 'convert', label: 'Convertir', title: 'Convertir le point (Maj+C)', icon: <><path d="M2 13.5L8 3l6 10.5" /><circle cx="8" cy="3" r="1.4" /></> }
];

// Barre d'outils plume, au-dessus de l'aperçu quand le dégradé est en « courbe libre »
export default function PenToolbar() {
  const grad = useSetting('grad'), gShape = useSetting('gShape'), path = useSetting('gPath');
  const tool = useSession('penTool'), canUndo = useSession('canUndo'), canRedo = useSession('canRedo');
  return (
    <div className="penbar" hidden={!(grad && gShape === 'libre')}>
      <div className="pentools" role="toolbar" aria-label="Outils plume">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tool === t.id} title={t.title} onClick={() => setPenTool(t.id)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">{t.icon}</svg><span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="penactions">
        <button type="button" title="Annuler (Ctrl+Z)" aria-label="Annuler" disabled={!canUndo} onClick={undoPath}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5L2.5 6.5l3 3" /><path d="M2.5 6.5H10a3.5 3.5 0 010 7H7" /></svg>
        </button>
        <button type="button" title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir" disabled={!canRedo} onClick={redoPath}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3.5l3 3-3 3" /><path d="M13.5 6.5H6a3.5 3.5 0 000 7h3" /></svg>
        </button>
      </div>
      <p className="penhint">{PEN_HINTS[tool](path)}</p>
    </div>
  );
}
