/* Constantes de la référence : polices, jeux de caractères, nuanciers, palettes néon,
   courbes de progression, encres CMJN, valeurs par défaut des trames. */

export const FONTS = {
  sans:  { family: 'Archivo',  fallback: 'Arial, sans-serif', gf: 'Archivo:wght@100..900' },
  serif: { family: 'Fraunces', fallback: 'Georgia, serif',     gf: 'Fraunces:opsz,wght@9..144,100..900' }
};

export const PRESETS = [
  { id: 'classique', name: 'Classique', chars: ' .:-=+*#%@' },
  { id: 'detail',    name: 'Détaillé (70 caractères)', chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
  { id: 'simple',    name: 'Minimal', chars: ' .oO@' },
  { id: 'binaire',   name: 'Binaire', chars: ' 01' },
  { id: 'lettres',   name: 'Lettres', chars: ' ilcoeaxswkbdmMWB' },
  { id: 'signes',    name: 'Signes', chars: ' .,-~+=*x#' },
  { id: 'perso',     name: 'Personnalisé', chars: '' }
];

export const SWATCHES = [
  { name: 'Encre', ink: '#111111', paper: '#ffffff' },
  { name: 'Négatif', ink: '#f4f4f0', paper: '#0e0e10' },
  { name: 'Riso bleu', ink: '#2336d1', paper: '#f2f0ea' },
  { name: 'Terminal', ink: '#5cff8a', paper: '#07140c' }
];

export const NEON_PRESETS = [
  { name: 'Violet / jaune', a: '#1a0322', b: '#c21fd6', c: '#f7e85a', paper: '#07010a' },
  { name: 'Cyber', a: '#04102a', b: '#1f6bff', c: '#34f5ff', paper: '#02040c' },
  { name: 'Rose / cyan', a: '#1a0414', b: '#ff2bb1', c: '#7df9ff', paper: '#08020a' },
  { name: 'Acide', a: '#031a0a', b: '#19c24a', c: '#e8ff5a', paper: '#010702' },
  { name: 'Braise', a: '#1a0302', b: '#ff3b1f', c: '#ffd27a', paper: '#080101' },
  { name: 'Glace', a: '#0a0f1f', b: '#7a8cff', c: '#ffffff', paper: '#03040a' }
];

// Courbe de progression : Bézier cubique de (0, 1) à (1, 0) dans l'espace (position dans la transition, intensité de l'effet)
export const CURVES = {
  douce: [0.42, 1, 0.58, 0],
  lineaire: [0.33, 0.67, 0.67, 0.33],
  persistante: [0.75, 1, 0.95, 0.5],
  breve: [0.05, 0.5, 0.3, 0]
};

// Encres CMJN et angles de trame (rosette offset)
export const PLATES = [
  { ch: 'c', color: '#00a0e3', angle: 15 },
  { ch: 'm', color: '#e5097f', angle: 75 },
  { ch: 'y', color: '#ffe500', angle: 0 },
  { ch: 'k', color: '#1d1d1b', angle: 45 }
];

// Valeurs appliquées quand on change de type de trame
export const HT_DEFAULTS = { points: { htCell: 12, htMax: 120 }, lignes: { htCell: 8, htMax: 100 }, pointillisme: { htCell: 5, htMax: 90 } };

// Tracé plume d'exemple (coordonnées relatives 0 → 1)
const DEFAULT_PATH = JSON.stringify({ closed: false, nodes: [
  { x: 0, y: 0.72, hin: [0, 0], hout: [0.12, -0.04], smooth: true },
  { x: 0.36, y: 0.42, hin: [-0.1, 0.08], hout: [0.1, -0.08], smooth: true },
  { x: 0.74, y: 0, hin: [-0.08, 0.1], hout: [0, 0], smooth: true }
] });
export const defaultPath = () => JSON.parse(DEFAULT_PATH);

// Côté maximal de l'image source, en pixels (fixé à 1800 dans la référence, réglable dans l'application)
export const SRC_MAX = 1800;
