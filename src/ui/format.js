/* Affichage des valeurs des curseurs (repris de la référence) */
import { fmt } from '../engine/index.js';

const signed = (v) => `${v > 0 ? '+' : ''}${v}`;
const comma = (v) => String(v).replace('.', ',');
const pct = (v) => `${v} %`, px = (v) => `${v} px`, deg = (v) => `${v}°`;

export const FORMAT = {
  width: (v) => `${fmt(v)} px`,
  srcMax: (v) => `${fmt(v)} px`,
  size: px,
  weight: (v) => `${v}`,
  spacing: (v) => `${v > 0 ? '+' : ''}${comma(v)} px`,
  leading: pct,
  bright: signed,
  contrast: signed,
  tol: pct,
  soft: (v) => `${v}`,
  gAngle: deg, gPos: pct, gSoft: pct, gAmp: pct, gFreq: comma, gPhase: deg,
  htCell: px, htAngle: deg, htMax: pct, htMin: pct, htJit: pct, htAmp: pct, htFreq: comma,
  neonMid: pct, neonMix: pct, neonSat: pct, neonPop: pct,
  fxGlow: pct, fxGlowR: px, fxGrid: pct, fxGridW: pct, fxGridSize: px,
  fxScan: pct, fxScanGap: px, fxChroma: (v) => `${comma(v)} px`, fxGrain: pct, fxVig: pct
};
