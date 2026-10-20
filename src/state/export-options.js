// Derniers réglages de la fenêtre d'export vidéo (gardés pendant la session et dans le projet).
// Fichier à part, sans dépendance, pour être lu par les stores, le format de projet et les tests.
export const defaultExportOptions = () => ({ format: 'mp4', taille: 'sortie', cadence: 0, plage: 'tout', son: true, qualite: 'haute' });

// valeurs possibles de chaque réglage (cadence 0 = cadence d'origine)
export const EXPORT_CHOICES = {
  format: ['mp4', 'mov', 'webm', 'png', 'gif'],
  taille: ['sortie', 'origine'],
  cadence: [0, 30, 25, 24, 15, 12],
  plage: ['tout', 'es'],
  son: [true, false],
  qualite: ['haute', 'moyenne', 'legere']
};

// réglages lus (projet) → réglages valides, complétés par les valeurs par défaut ; ignored = clés écartées
export function mergeExportOptions(data) {
  const out = defaultExportOptions(), ignored = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { options: out, ignored: data === undefined ? [] : ['export'] };
  for (const [k, v] of Object.entries(data)) {
    if (EXPORT_CHOICES[k] && EXPORT_CHOICES[k].includes(v)) out[k] = v;
    else ignored.push('export.' + k);
  }
  return { options: out, ignored };
}
