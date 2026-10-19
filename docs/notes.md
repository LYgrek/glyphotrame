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

## Vérifier que l'interface reste identique à la référence

```powershell
npm run compare:ui                  # toutes les sections (≈ 5 min)
npm run compare:ui -- Dégradé Halftone   # seulement certaines sections
$env:THEME="light"; npm run compare:ui   # en thème clair (sinon celui du système)
$env:VERBOSE="1"; npm run compare:ui     # affiche les statistiques après chaque étape
```

Joue les mêmes actions dans l'application et dans la référence, section par section de `docs/fonctionnalites.md` (228 vérifications : clics, curseurs, cases, sélecteurs de couleur, gestes de plume à la souris et au clavier, éditeur de courbe, pipette, collage et dépôt d'image, vues, fenêtre Code, exports). Après chaque action, compare :

- les pixels de l'aperçu, de l'image « avant » et de la vignette du détourage ;
- l'état visible de chaque contrôle (libellés, valeurs affichées, cases, boutons enfoncés, blocs désactivés) ;
- le calque du tracé plume, les messages affichés, le texte copié ;
- les fichiers exportés, octet par octet ;

et en fin de section, des captures d'écran de chaque section du panneau, de l'en-tête, de la tête de l'aperçu et de la barre plume (écart toléré : 2 niveaux par canal, bruit d'anticrénelage des coins arrondis). Les captures qui diffèrent sont enregistrées dans `tools/.ui-diff/`. Une dernière section vérifie le réglage de taille max (absent de la référence). Code de sortie 1 au moindre écart.

À relancer après toute modification de l'interface (`src/ui/`, `src/state/`, styles). Fichiers : `tools/compare-ui.mjs` (étapes), `tools/ui-probe.js` (sonde injectée dans les deux pages), `tools/lib/cdp.mjs` (navigateur headless).

Non couvert (fenêtres natives) : boîtes Ouvrir / Enregistrer de Windows et glisser-déposer de Tauri, à tester à la main dans `npm run tauri dev`.

## Rendu logiciel ou accéléré

Le résultat dépend légèrement du rendu canvas : avec la carte graphique (WebView2 dans Tauri, navigateur normal), l'image d'exemple donne 7 975 glyphes ; en rendu logiciel (`npm run compare`, Edge sans carte graphique), 7 966. La référence et l'application donnent toujours le même chiffre dans le même environnement : ce n'est pas un écart du portage.

## Interface (phase 1)

- État : `src/state/` — deux stores (`settings` = réglages, même forme que `state` dans la référence ; `session` = état de l'interface), `renderer.js` relie les réglages au moteur (recalcul complet ou simple recomposition, comme `schedule` / `scheduleGrad`), `actions.js` regroupe les changements qui en entraînent d'autres, `pen.js` l'historique et les outils de la plume.
- Fichiers : `src/platform/files.js` — boîtes Ouvrir / Enregistrer de Tauri, glisser-déposer natif (les fichiers déposés sont lisibles par le plugin fs sans permission en plus). Dans un simple navigateur (`npm run dev`), repli sur le sélecteur de fichier et le téléchargement.
- Différences voulues : bouton « Enregistrer… » au lieu de « Télécharger » dans la fenêtre Code ; zone de dépôt en bouton (ouvre la boîte native) au lieu d'un champ fichier ; curseur « Taille max de l'image source » dans la section Image (1000 → 8000 px ; jamais d'agrandissement ; l'image d'origine est gardée pour la réduire à nouveau quand le réglage change). Dans Tauri, un export affiche « Fichier enregistré : … » ; dans un navigateur, « Téléchargement lancé : … » comme la référence.
- Piège corrigé : un texte affiché en plusieurs morceaux (nœuds de texte) n'est pas espacé comme le même texte d'un seul tenant (crénage). Les statistiques de l'aperçu sont donc construites en une seule chaîne, comme dans la référence.

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
