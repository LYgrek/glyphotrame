// Case à cocher avec texte
export function Check({ checked, onChange, children, hidden, disabled }) {
  return (
    <label className="check" hidden={hidden}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// Interrupteur (active une section)
export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// Sélecteur de couleur avec nom et code hexadécimal ; mode = mention en italique (Détectée / Choisie)
export function ColorField({ value, onChange, label, mode, off }) {
  return (
    <label className={'colorfield' + (off ? ' off' : '')}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{mode ? <em>{mode}</em> : label}<code>{value}</code></span>
    </label>
  );
}
