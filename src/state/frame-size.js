// Taille des images d'un export vidéo (fonctions pures, testées par npm test).

// dimension paire (obligatoire pour le H.264), au moins 2
export const even = (v) => Math.max(2, Math.floor(v / 2) * 2);

// taille de sortie pour une grille g et une largeur voulue (null = largeur de sortie de l'effet) :
// échelle s du rendu, et dimensions paires W × H (recadrage d'au plus un pixel)
export function outputSize(g, width) {
  const s = (width || g.W) / g.W;
  return { s, W: even(Math.round(g.W * s)), H: even(Math.round(g.H * s)) };
}
