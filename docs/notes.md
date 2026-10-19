# Notes de portage

## Vérifier que le moteur reste identique à la référence

```powershell
npm run compare
```

Démarre Vite, ouvre `tools/compare.html` dans Edge (ou Chrome) sans fenêtre, et compare la référence et le moteur porté sur 44 réglages types (caractères, 9 formes halftone, lignes, pointillisme, CMJN, néon, détourage, dégradés droit / vague / libre, effets d'écran) :

- pixels de l'aperçu et de l'export PNG 2× (et JPEG quand le fond est transparent) ;
- exports SVG, HTML et texte, caractère par caractère ;
- couleur de fond détectée, tracé plume affiché sur l'aperçu.

La page peut aussi s'ouvrir dans un navigateur : `npm run dev`, puis http://localhost:1420/tools/compare.html.
La référence y est chargée en mémoire et son script est seulement complété pour exposer ses fonctions : `reference/` n'est jamais modifié.

À relancer après toute modification de `src/engine/`.

## Rendu logiciel ou accéléré

Le résultat dépend légèrement du rendu canvas : avec la carte graphique (WebView2 dans Tauri, navigateur normal), l'image d'exemple donne 7 975 glyphes ; en rendu logiciel (`npm run compare`, Edge sans carte graphique), 7 966. La référence et l'application donnent toujours le même chiffre dans le même environnement : ce n'est pas un écart du portage.

## Interface (phase 1)

- État : `src/state/` — deux stores (`settings` = réglages, même forme que `state` dans la référence ; `session` = état de l'interface), `renderer.js` relie les réglages au moteur (recalcul complet ou simple recomposition, comme `schedule` / `scheduleGrad`), `actions.js` regroupe les changements qui en entraînent d'autres, `pen.js` l'historique et les outils de la plume.
- Fichiers : `src/platform/files.js` — boîtes Ouvrir / Enregistrer de Tauri, glisser-déposer natif (les fichiers déposés sont lisibles par le plugin fs sans permission en plus). Dans un simple navigateur (`npm run dev`), repli sur le sélecteur de fichier et le téléchargement.
- Vérifié en jouant les mêmes clics dans l'application et la référence (Edge sans fenêtre, protocole DevTools) : 34 étapes de réglages, 24 gestes de plume, éditeur de courbe, pipette, vues, fenêtre Code. Seules différences : l'ordre des classes CSS sur les points d'ancrage et le chemin du tracé vidé quand il est masqué (invisible dans les deux cas).
- Différences voulues : bouton « Enregistrer… » au lieu de « Télécharger » dans la fenêtre Code ; curseur « Taille max de l'image source » dans la section Image.

## Particularités de la référence reproduites à l'identique

À corriger éventuellement après la phase 1 (le banc de comparaison signalera alors l'écart, c'est voulu).

- **Aberration chromatique inversée entre les exports** : dans le canvas et le SVG, le rouge part à droite et le cyan à gauche ; dans l'export HTML (`text-shadow`), le rouge part à gauche.
- **Grain dans l'export HTML** : son opacité n'est pas réduite sur fond transparent (× 0,4 dans le canvas et le SVG).
- **`pathValid()`** : les deux branches (tracé fermé / ouvert) font le même test (au moins 2 points).
- **`toneMap()`** vide le cache d'échantillonnage des caractères à chaque nouvelle carte des tons (sans effet sur le résultat, seulement un recalcul de plus).
- **Section Sortie de la référence** : une balise `</output>` en trop après le texte d'aide (HTML seulement, sans effet visible).

## Écarts volontaires avec la référence (moteur)

- Les fonctions reçoivent l'état et la source en paramètres au lieu de lire des variables globales.
- `applyCutout` ne modifie pas l'état : il rend la couleur de fond détectée, que l'interface enregistre.
- Les opérations d'édition du tracé plume (`insertAt`, `deleteNode`, `toggleSmooth`) rendent un nouveau tracé au lieu de modifier l'existant.
- Le champ d'intensité du dégradé lit la table de la courbe de progression une fois par calcul au lieu de la rechercher pour chaque pixel (résultat identique).
- La taille max de l'image source est un paramètre de `fitImage` (1800 px par défaut, comme la référence).
