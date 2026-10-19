/* Réglages types communs aux bancs de comparaison (moteur ↔ référence, GPU ↔ canvas 2D) :
   modifications de l'état par défaut, une par scénario. */
import { PRESETS } from '../src/engine/index.js';

const CLOSED_PATH = { closed: true, nodes: [
  { x: 0.3, y: 0.25, hin: [-0.1, 0.05], hout: [0.1, -0.05], smooth: true },
  { x: 0.75, y: 0.4, hin: [0, -0.1], hout: [0, 0.1], smooth: true },
  { x: 0.45, y: 0.8, hin: [0.1, 0], hout: [-0.1, 0], smooth: true },
  { x: 0.2, y: 0.55, hin: [0, 0], hout: [0, 0], smooth: false }
] };
// style « Néon numérique » (bouton fxPreset de la référence)
const NEON_NUM = { effect: 'halftone', htType: 'points', htShape: 'carre', htGrid: 'carree', htCell: 7, htAngle: 0, htMax: 100, htMin: 6, htJit: 0,
  contrast: 40, bright: -15, mode: 'neon', neonA: '#1a0322', neonB: '#c21fd6', neonC: '#f7e85a', paper: '#07010a', neonMid: 62,
  fxGlow: 60, fxGlowR: 6, fxGrid: 55, fxGridW: 22, fxGridSync: true, fxScan: 0, fxChroma: 1.5, fxGrain: 14, fxVig: 45 };
const HT = { effect: 'halftone' };

export const SCENARIOS = [
  ['Caractères · défaut', {}],
  ['Caractères · Fraunces 800, corps 8, approche +2, interligne 120', { font: 'serif', weight: 800, size: 8, spacing: 2, leading: 120 }],
  ['Caractères · jeu détaillé, sans tri', { preset: 'detail', custom: PRESETS[1].chars, sort: false }],
  ['Caractères · perso avec doublons et tabulation', { preset: 'perso', custom: 'ab\tba#&<' }],
  ['Caractères · un seul caractère', { preset: 'perso', custom: '@' }],
  ['Caractères · couleurs de l\'image', { mode: 'color' }],
  ['Caractères · néon mélangé 50 %', { mode: 'neon', paper: '#07010a', neonMix: 50 }],
  ['Caractères · inversés, lum. +30, contraste −40', { invert: true, bright: 30, contrast: -40 }],
  ['Caractères · négatif (inversion auto)', { ink: '#f4f4f0', paper: '#0e0e10' }],
  ['Caractères · fond transparent, largeur 600', { transparent: true, width: 600 }],
  ['Halftone · points ronds', { ...HT }],
  ['Halftone · carrés, grille hexa', { ...HT, htShape: 'carre', htGrid: 'hexa' }],
  ['Halftone · losanges, désordre 40', { ...HT, htShape: 'losange', htJit: 40 }],
  ['Halftone · ellipses, angle 10', { ...HT, htShape: 'ellipse', htAngle: 10 }],
  ['Halftone · triangles, min 20', { ...HT, htShape: 'triangle', htMin: 20 }],
  ['Halftone · hexagones, hexa', { ...HT, htShape: 'hexagone', htGrid: 'hexa', htCell: 18 }],
  ['Halftone · croix', { ...HT, htShape: 'croix', htCell: 20 }],
  ['Halftone · étoiles, désordre', { ...HT, htShape: 'etoile', htCell: 16, htJit: 25 }],
  ['Halftone · tirets', { ...HT, htShape: 'tiret', htMax: 150 }],
  ['Halftone · lignes ondulées', { ...HT, htType: 'lignes', htCell: 8, htMax: 100, htAmp: 40, htFreq: 5, htMin: 5 }],
  ['Halftone · lignes en couleurs', { ...HT, htType: 'lignes', htCell: 8, htMax: 100, mode: 'color', htAngle: 30 }],
  ['Halftone · pointillisme', { ...HT, htType: 'pointillisme', htCell: 5, htMax: 90 }],
  ['Halftone · pointillisme taille fixe', { ...HT, htType: 'pointillisme', htCell: 6, htMax: 90, htVar: false }],
  ['Halftone · CMJN', { ...HT, mode: 'cmyk', htCell: 10 }],
  ['Halftone · CMJN inversé', { ...HT, mode: 'cmyk', htCell: 10, invert: true }],
  ['Halftone · couleurs, angle 20', { ...HT, mode: 'color', htAngle: 20 }],
  ['Halftone · néon couleurs de l\'image', { ...HT, mode: 'neon', neonMix: 100, paper: '#050507', neonSat: 200, neonPop: 70 }],
  ['Détourage auto + fond transparent', { cut: true, transparent: true }],
  ['Détourage couleur choisie, sans remplissage', { cut: true, transparent: true, cutAuto: false, cutColor: '#ffffff', flood: false, tol: 30, soft: 0 }],
  ['Détourage + halftone + dégradé', { ...HT, cut: true, transparent: true, grad: true }],
  ['Dégradé droit 45°', { grad: true }],
  ['Dégradé radial, fondu simple', { grad: true, gType: 'radial', gStyle: 'fondu' }],
  ['Dégradé droit inversé, sans fondu', { grad: true, gInvert: true, gSoft: 0, gAngle: 180 }],
  ['Dégradé droit, effet persistant, transparent', { grad: true, gCurve: [0.75, 1, 0.95, 0.5], transparent: true, gAngle: 300 }],
  ['Dégradé vague', { grad: true, gShape: 'vague', gAngle: 90 }],
  ['Dégradé vague radiale (pétales)', { grad: true, gShape: 'vague', gType: 'radial', gFreq: 5, gPhase: 40, gAmp: 60 }],
  ['Dégradé libre, tracé ouvert', { grad: true, gShape: 'libre' }],
  ['Dégradé libre, tracé fermé, fondu', { grad: true, gShape: 'libre', gPath: CLOSED_PATH, gStyle: 'fondu', gSoft: 20 }],
  ['Dégradé libre, tracé vide', { grad: true, gShape: 'libre', gPath: { closed: false, nodes: [] } }],
  ['Effets d\'écran (caractères)', { fxGlow: 80, fxGlowR: 10, fxGrid: 40, fxScan: 30, fxScanGap: 5, fxChroma: 2, fxGrain: 20, fxVig: 50 }],
  ['Effets d\'écran, grille libre, transparent', { transparent: true, fxGrid: 60, fxGridSync: false, fxGridSize: 9, fxGrain: 30, fxVig: 40, fxGlow: 150 }],
  ['Style « Néon numérique »', NEON_NUM],
  ['Néon numérique + dégradé vague', { ...NEON_NUM, grad: true, gShape: 'vague' }],
  ['Tout ensemble (caractères)', { mode: 'color', grad: true, gShape: 'vague', cut: true, transparent: true, fxGlow: 60, fxChroma: 1.5, fxGrid: 30 }]
];
