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
- **Navigation** : l'image n est demandée à l'instant (n − ½) / cadence (`-ss` à la microseconde) : on tombe toujours sur la bonne image, même si les horodatages sont un peu décalés. Le curseur de temps n'a qu'une demande en cours ; la dernière position gagne.
- **Lecture** : `lecture_debut` lance un ffmpeg qui décode en continu (images ≤ 1280 px), une tâche Rust découpe le flux en images dans une file bornée (2). `lecture_image(id, cible)` saute côté Rust les images en retard sur l'horloge et rend la première de numéro ≥ cible (en-tête 12 octets : largeur, hauteur, numéro). L'interface attend la fin du rendu (`whenRendered`) avant de demander la suivante. À la pause, l'image est redemandée à la taille max complète. Le son n'est pas joué (v1). Le détourage automatique est recalculé à chaque image de l'aperçu (il sera figé à l'export, étape 3).
- **Raccourcis vidéo** (`onVideoKey`) : ignorés dans les champs de saisie, avec la fenêtre Code ouverte, quand un autre raccourci a déjà traité la touche (plume, éditeur de courbe) et, pour ← →, quand la plume a un point sélectionné. Espace sur un bouton focalisé lui retire le focus (sinon le bouton se cliquerait aussi).
- **Rendu d'une image de vidéo** (`src/state/frame.js`) : `createFrameRenderer(réglages, { width, opaque, gpu, W, H })` copie les réglages, fige la couleur de fond détectée (`cutAuto` coupé : couleur de l'image courante), prépare la grille une fois (`prepareCompute` du moteur) et rend chaque image en RGBA non prémultiplié via `GpuRenderer.renderPixels` (même boucle de tuiles que `renderBlob`) ou `draw` du canvas 2D. Dimensions paires : recadrage d'au plus un pixel en bas / à droite. « Taille d'origine » = largeur de la vidéo ; la hauteur suit les proportions de la grille de l'effet.
- **Grain animé** (`fxGrainAnim`) : décalage du motif 256 × 256 tiré de l'instant de l'image (`grainOffset`), dans le shader final et dans `postFX` ; coupé = grain figé, résultats inchangés.
- **Export** (`src-tauri/src/export.rs`, `src/state/video-export.js`) : deux ffmpeg lancés avec `std::process` (commande du sidecar convertie, pas de console sous Windows). Décodeur : `-ss (début − ½ image)`, `setpts=PTS-STARTPTS,fps=cadence` (la remise à zéro évite les égalités d'arrondi de fps=), `-frames:v N`, RGBA brut lu par un fil dans une file bornée (2). Encodeur : RGBA sur l'entrée standard, son repris de la vidéo d'origine (`-ss`/`-t` sur la plage, `-map 1:a:0?`). L'interface envoie chaque image en corps binaire brut (`invoke(cmd, Uint8Array, { headers: { id } })`). Annuler ou échouer supprime le fichier (ou les PNG écrits). H.264 : libx264, ou `h264_mf` (Windows) si la build n'a pas x264.
- **Canal des pixels de l'export** (`src-tauri/src/canal.rs`, `src/platform/frame-channel.js` + `frame-channel.worker.js`) : les images décodées et rendues passent par un **WebSocket local** ouvert par le Rust, et non par l'IPC de Tauri. Raison (mesurée, voir « Performances » plus bas) : sous Windows, l'IPC plafonne pour de gros corps binaires (1080p : 8 Mo par image dans chaque sens, ≈ 115 ms pour recevoir et ≈ 175 ms pour envoyer, 85 % du temps de l'export, en debug comme en release). Le Rust écoute sur 127.0.0.1 (port libre) avec un jeton aléatoire de 128 bits dans l'adresse (rendu par `export_debut` dans `canal`), accepte une seule connexion, vérifie l'origine (localhost, 127.0.0.1, tauri.localhost) et la clé WebSocket (SHA-1 et base64 écrits à la main, testés sur l'exemple de la RFC 6455). Messages binaires seulement : le Rust envoie les images décodées avec 3 images d'avance sur les images rendues reçues, un message vide marque la fin ; `export_fin(id, images)` attend que toutes les images envoyées soient écrites. **Le WebSocket vit dans un worker** : dans Chromium, un WebSocket lit et écrit ses données sur le fil qui l'a créé ; dans la page, rien ne circulait pendant le rendu (debug : 9,5 → 16,6 i/s en le déplaçant). Les images décodées sont transférées du worker à la page sans copie ; les images rendues sont copiées (`slice`, le tableau du rendu est réutilisé) puis transférées. Si le canal ne s'ouvre pas en 3 s, l'export repasse par l'IPC (`export_lire_image` / `export_ecrire_image`, inchangées) ; `compare:video` vérifie les deux chemins.
- **Banc `npm run compare:video`** (`tools/compare-video.mjs`, ≈ 2 min) : compile le Rust (`cargo build`), démarre Vite sur le port 1420 et lance la **vraie fenêtre Tauri** (`target/debug`) avec `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9340`, puis la pilote par le protocole DevTools (`tools/lib/tauri-app.mjs`, `connectPage` de `tools/lib/cdp.mjs`). Toute la chaîne est donc réelle : ffmpeg embarqué, commandes Rust, rendu GPU, encodeurs. Fermer `npm run tauri dev` avant (port 1420). `$env:KEEP="1"` garde le dossier de travail.
  - Mire `testsrc2` 640 × 360, 2 s à 30 i/s, avec son (générée par ffmpeg).
  - 6 réglages types (caractères, couleurs + grain animé, points, CMJN, lignes sur fond transparent, détourage + dégradé vague + néon numérique) : export en **séquence PNG** (`exportVideo` avec destination imposée), puis chaque image n affichée par la navigation et exportée en PNG par l'application (`rasterBlob`, échelle 1). Décodage des deux séries par ffmpeg (RGBA brut) et comparaison sur la zone commune (la vidéo est recadrée à des dimensions paires). Égalité stricte de l'alpha et des pixels opaques. **Pixels semi-transparents** : l'export PNG passe par un canvas qui garde les couleurs prémultipliées, donc arrondies (à alpha 3 : 0, 85, 170 ou 255), alors que la séquence garde la valeur exacte ; on compare `round(c × a / 255)`, c'est-à-dire ce qui se voit sur un fond.
  - **ffprobe** : MP4 (son AAC, yuv420p), MP4 à 12 i/s sans son, MOV ProRes 4444 (yuva444p12le, son PCM), WebM VP9 entre entrée et sortie (alpha_mode 1, son Opus ; durée du son lue dans l'étiquette `DURATION`), GIF à 15 i/s. Contrôle des dimensions, du nombre d'images, de la cadence, de la durée et du son ; pour MOV et WebM, présence de pixels transparents et opaques dans l'image décodée. GIF : délais en centièmes de seconde, ffprobe en déduit une cadence moyenne fausse (50/3) ; on contrôle la cadence nominale et le rapport images / durée.
  - Projet vidéo enregistré puis rouvert avec la vraie vidéo : même image (37), même plage, chemin relatif.
  - Le premier export passe par le canal WebSocket (vérifié) ; le même export forcé par l'IPC donne la même séquence, octet pour octet.
- **Performances** (`npm run measure:video`, `tools/measure-video.mjs` ; `$env:PROFIL="release"` pour un Rust optimisé, compilé à part dans `target/mesure`) : mire 1920 × 1080, 30 s, exportée en MP4 1920 px (taille max de la source 1920), en caractères et en halftone CMJN. Temps moyen par image de chaque étape, aussi affiché dans la progression de l'export : décodage (attente de l'image), image (pixels → canvas), calcul (détourage + grille), GPU (dessin jusqu'à sa fin), pixels (lecture), écriture ; à la fin, la part passée à attendre ffmpeg, mesurée côté Rust (`attenteDecodeur`, `attenteEncodeur` de `export_fin`). Résultats (machine de développement, 20 cœurs, release) :

  | ms par image | Départ (IPC) | Canal WebSocket dans un worker |
  |---|---|---|
  | Caractères | 275 (lire 91 · calcul 17 · GPU 16 · pixels 9 · écrire 140) → 3,6 i/s | 75 (lire 4 · calcul 24 · GPU 20 · pixels 17 · écrire 4) → 13,3 i/s |
  | Halftone CMJN | 293 (lire 95 · calcul 21 · GPU 17 · pixels 9 · écrire 149) → 3,4 i/s | 75 (lire 4 · calcul 28 · GPU 19 · pixels 16 · écrire 4) → 13,2 i/s |

  Le décodeur seul tient ≈ 1,3 ms par image, l'encodeur x264 n'a jamais fait attendre plus de 4 ms par image. Sur 10 s, ≈ 16 i/s ; sur 30 s, la lecture des pixels et le GPU s'allongent un peu. Essayé puis **retiré** faute de gain mesurable : rendu en deux temps (dessin et lecture des pixels asynchrones, tampon WebGL2 + barrière, grille de l'image suivante calculée pendant le dessin : 60–62 ms au lieu de 59–64), images rendues en RGB pour les sorties opaques (25 % de données en moins : aucun gain), canvas de l'image décodée en mémoire (`willReadFrequently`, profil : `getImageData` du moteur ≈ 18 ms par image) : gain en caractères mais perte en CMJN (la réduction par moitiés se fait sur des canvas accélérés). Le calcul dans un Web Worker n'a pas été tenté : il demanderait de porter les canvas et les polices du moteur dans le worker, sans garantie de résultats identiques. Ce qui reste : le moteur lit l'image par des canvas accélérés (relectures synchrones de la carte graphique) et la lecture des pixels rendus (≈ 8 ms de `readPixels`).
- **Vérifier** : `cd src-tauri; cargo test` génère de vraies mires (paysage avec son, portrait par rotation) et contrôle infos et pixels. Dans l'application, les vidéos de test : `ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30:duration=2 -f lavfi -i sine=duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest mire.mp4`.

## Projets (phase 3)

Fichier `.json` (proposé : `<image>.glyphotrame.json`) : `format`, `version` (2), `application`, `image`, `video` (vidéo seulement), `reglages` (l'objet `settings`, même forme que `state` dans la référence). Format et lecture : `src/state/project-format.js` (fonctions pures, testées par `npm test`) ; actions : `src/state/project.js`.

- **Vidéo (version 2)** : `image` = `{ nom, video: true, chemin, relatif }` ; `video` = `{ instant, entree, sortie, export }` (secondes ; `export` = derniers réglages de la fenêtre d'export vidéo, valeurs vérifiées une à une dans `export-options.js`). La vidéo est rouverte directement à l'image enregistrée (`loadVideo(…, { state })`, même demande `(n − ½) / cadence` que la navigation) ; les temps sont ramenés dans la durée de la vidéo (`clampVideoState`), utile si elle a été remplacée. Version 1 : pas de section `video` → début, toute la plage, export par défaut. Entrée / sortie et réglages d'export marquent le projet modifié ; la tête de lecture non (elle est enregistrée quand même).

- **Image** : chemin absolu + chemin relatif au fichier du projet (un dossier « projet + images » déplacé d'un bloc se rouvre) ; image collée (sans chemin) intégrée en `data:` ; image d'exemple marquée `exemple: true`. À l'ouverture : relatif, puis absolu, puis intégrée ; sinon la recherche est proposée (ou les réglages s'appliquent à l'image actuelle).
- **Lecture de l'image par son chemin** : commande Rust `lire_image` (`src-tauri/src/lib.rs`, testée par `cargo test`), limitée aux extensions d'images. Le plugin fs n'autorise que les fichiers choisis dans les boîtes de dialogue ; un chemin lu dans un projet n'en fait pas partie.
- **Réglages** : fusionnés avec les valeurs par défaut (clés connues et du bon type seulement) ; un projet incomplet ou plus ancien s'ouvre, un projet d'une version plus récente est refusé avec un message.
- **Modifié (•)** : tout changement de réglage ou d'image, sauf la couleur de fond détectée par le détourage automatique. Hors périmètre pour l'instant : avertissement à la fermeture de la fenêtre, « Nouveau projet ».
- **Banc** : `npm run compare:ui -- Projets` enregistre (repli navigateur : téléchargement), modifie, rouvre, et vérifie réglages et aperçu identiques. Partie vidéo : les commandes Rust `infos_video` / `image_video` sont simulées dans la page (`window.__TAURI_INTERNALS__`, mire de synthèse 2 s à 30 i/s), le projet est rouvert depuis un dossier « déplacé » sur un autre lecteur (seul le chemin relatif mène à la vidéo), puis un projet de version 1. Le groupe « Projet » de l'en-tête est masqué dans les captures (absent de la référence).

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
