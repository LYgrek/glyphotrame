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

## Vidéo (phase 4, `docs/video.md`)

- **ffmpeg / ffprobe** : sidecars téléchargés par `tools/get-ffmpeg.ps1` (builds stables BtbN, somme SHA-256 vérifiée), lancés uniquement depuis le Rust (`src-tauri/src/video.rs`). L'interface n'a aucune permission d'exécution (vérifié : `plugin:shell|spawn` refusé).
- **Chemins reçus de l'interface** : vérifiés côté Rust (absolu, fichier existant, extension vidéo) avant d'être passés à ffmpeg : un chemin absolu ne peut pas être pris pour une option `-…` ni pour une adresse réseau.
- **Sortie binaire des sidecars (piège)** : le plugin shell lit par défaut ligne par ligne en retirant les sauts de ligne, et `Command::output()` ajoute un saut de ligne après chaque morceau reçu, même en mode brut. Pour des pixels : `set_raw_out(true)` + `spawn()` et assembler les morceaux soi-même (fonction `lancer`). `cargo test` lance les binaires directement et ne voit pas ce piège : vérifier aussi dans la fenêtre Tauri.
- **Image d'une vidéo** : `image_video` renvoie 8 octets d'en-tête (largeur, hauteur en u32 petit-boutiste) puis les pixels RGBA. ffmpeg applique lui-même la rotation des vidéos de téléphone ; `infos_video` rend les dimensions affichées (rotation, pixels non carrés). Réduction à la taille max avec le même arrondi que `fitImage`.
- **Source** : `{ kind: 'video', path, meta, time }` (`src/state/video.js`) ; tout le reste de l'interface marche sur l'image courante. Changer la taille max redemande l'image au même instant (`replaceImage`, qui ne remet pas le détourage en automatique).
- **Vérifier** : `cd src-tauri; cargo test` génère de vraies mires (paysage avec son, portrait par rotation) et contrôle infos et pixels. Dans l'application, les vidéos de test : `ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30:duration=2 -f lavfi -i sine=duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest mire.mp4`.

## Projets (phase 3)

Fichier `.json` (proposé : `<image>.glyphotrame.json`) : `format`, `version`, `application`, `image`, `reglages` (l'objet `settings`, même forme que `state` dans la référence). Format et lecture : `src/state/project-format.js` (fonctions pures, testées par `npm test`) ; actions : `src/state/project.js`.

- **Image** : chemin absolu + chemin relatif au fichier du projet (un dossier « projet + images » déplacé d'un bloc se rouvre) ; image collée (sans chemin) intégrée en `data:` ; image d'exemple marquée `exemple: true`. À l'ouverture : relatif, puis absolu, puis intégrée ; sinon la recherche est proposée (ou les réglages s'appliquent à l'image actuelle).
- **Lecture de l'image par son chemin** : commande Rust `lire_image` (`src-tauri/src/lib.rs`, testée par `cargo test`), limitée aux extensions d'images. Le plugin fs n'autorise que les fichiers choisis dans les boîtes de dialogue ; un chemin lu dans un projet n'en fait pas partie.
- **Réglages** : fusionnés avec les valeurs par défaut (clés connues et du bon type seulement) ; un projet incomplet ou plus ancien s'ouvre, un projet d'une version plus récente est refusé avec un message.
- **Modifié (•)** : tout changement de réglage ou d'image, sauf la couleur de fond détectée par le détourage automatique. Hors périmètre pour l'instant : avertissement à la fermeture de la fenêtre, « Nouveau projet ».
- **Banc** : `npm run compare:ui -- Projets` enregistre (repli navigateur : téléchargement), modifie, rouvre, et vérifie réglages et aperçu identiques. Le groupe « Projet » de l'en-tête est masqué dans les captures (absent de la référence).

## Rendu sur la carte graphique (phase 2)

Le moteur JavaScript calcule toujours la grille (points, glyphes, couleurs) ; `src/gpu/` ne fait que le dessin et la composition. L'aperçu GPU montre donc la même géométrie que l'export SVG. Les exports SVG et HTML restent calculés par le moteur.

- **Halftone** : une instance par point, forme calculée par distance signée avec les sommets du moteur ; formes de moins de 12 px de rayon mesurées sur 4 × 4 sous-échantillons. Lignes : maillage, anticrénelage multi-échantillonné (8×). CMJN : couverture de chaque encre, puis pose en produit (formule du `multiply` du canvas).
- **Caractères** : atlas dessiné par le canvas 2D. Deux particularités du texte du navigateur sont mesurées à l'exécution et reproduites : le placement (quart de pixel en x, avec un seuil propre à chaque glyphe ; pixel entier en y) et le contraste de l'anticrénelage, qui dépend de la couleur du texte (couleur arrondie à 3 bits par composante → 8 niveaux). Résultat : pixels identiques au rendu canvas.
- **Composition** : fond, photo, dégradé (droite : masques interpolés entre les points du dégradé, comme le canvas et le SVG ; vague : calculée pour chaque pixel ; courbe libre : champ du moteur), lueur (réduction, flou σ 1,2, agrandissement), puis aberration, grille, balayage, vignettage et grain avec les formules de composition du canvas.
- **Exports PNG / JPEG** : rendus par tuiles de 2048 px avec marges (lueur, aberration) ; 9 600 × 9 600 px en 5 s dans Tauri.
- **Secours** : choix « Carte graphique / Canvas 2D » (section Sortie) ; retour automatique au canvas 2D si WebGL2 manque ou si le contexte graphique est perdu ; `?rendu=canvas` dans l'adresse force le canvas.

### Vérifier le rendu GPU

```powershell
npm run compare:gpu                 # GPU ↔ canvas 2D sur les réglages types (aperçu + export 2× par tuiles, temps)
npm run compare:ui -- --gpu         # interface complète en mode GPU face à la référence
node tools/compare-headless.mjs compare-gpu.html --gpu --save   # + images des écarts dans tools/.gpu-diff/
```

Les deux rendus ne peuvent pas être identiques au bit près : on mesure l'écart moyen (valeurs prémultipliées, 0-255) et la part de pixels écartés de plus de 48 niveaux. Seuils : 1,5 et 0,5 % (`compare:gpu`) ; 2,5 et 1,5 % (`compare:ui -- --gpu`). Tolérances plus larges, justifiées dans `tools/compare-gpu.js` : lignes en couleurs (le canvas laisse des coutures entre segments), CMJN (quatre encres, quatre fois plus de bords), trame très fine.

**Pourquoi un écart subsiste sur les petites formes** : le canvas de Chrome déborde de la surface exacte (au coin d'un carré il prend le minimum des deux couvertures au lieu de leur produit ; un cercle de 3,5 px couvre 7 % de trop, un point de 0,6 px 36 %). Le GPU respecte la surface exacte, comme les logiciels vectoriels qui ouvrent le SVG. C'est visible surtout sur fond transparent et sur les trames très fines.

Mesures : aperçu des 46 réglages types en 0,7 s au lieu de 3,3 s ; trame de 4 px en 2400 px de large : 58 ms au lieu de 660 ms.

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
