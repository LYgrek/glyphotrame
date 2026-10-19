/* Réglages par défaut : même forme que l'objet `state` de la référence,
   plus srcMax (taille max de l'image source, fixée à 1800 px dans la référence). */
import { defaultPath, SRC_MAX } from '../engine/index.js';

export const defaultSettings = () => ({
  font: 'sans', size: 12, weight: 500, spacing: 0, leading: 100, width: 1200,
  preset: 'classique', custom: ' .:-=+*#%@', sort: true, invert: false,
  bright: 0, contrast: 10, mode: 'mono', ink: '#111111', paper: '#ffffff',
  transparent: false, zoom: 'fit', scale: 2,
  cut: false, cutAuto: true, cutColor: '#ffffff', tol: 14, soft: 8, flood: true,
  grad: false, gType: 'linear', gAngle: 45, gPos: 50, gSoft: 45, gStyle: 'superpose', gInvert: false,
  gShape: 'droite', gAmp: 35, gFreq: 2, gPhase: 0, gCurve: [0.42, 1, 0.58, 0], gShowCurve: true,
  gPath: defaultPath(),
  effect: 'chars', htType: 'points', htShape: 'rond', htGrid: 'carree', htCell: 12, htAngle: 45,
  htMax: 120, htMin: 0, htJit: 0, htAmp: 0, htFreq: 6, htVar: true,
  neonA: '#1a0322', neonB: '#c21fd6', neonC: '#f7e85a', neonMid: 55, neonMix: 0, neonSat: 160, neonPop: 45,
  fxGlow: 0, fxGlowR: 8, fxGrid: 0, fxGridW: 18, fxGridSync: true, fxGridSize: 6,
  fxScan: 0, fxScanGap: 4, fxChroma: 0, fxGrain: 0, fxVig: 0,
  srcMax: SRC_MAX
});
