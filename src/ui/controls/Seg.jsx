// Boutons segmentés : options = [{ value, label, hidden? }]
export default function Seg({ value, options, onChange, className = '', label, labelledBy }) {
  return (
    <div className={'seg' + (className ? ' ' + className : '')} role="group" aria-label={label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} hidden={o.hidden} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
