// Derniers réglages de la fenêtre d'export vidéo (gardés pendant la session ; étape 5 : dans le projet).
// Fichier à part, sans dépendance, pour être lu par les stores et les tests.
export const defaultExportOptions = () => ({ format: 'mp4', taille: 'sortie', cadence: 0, plage: 'tout', son: true, qualite: 'haute' });
