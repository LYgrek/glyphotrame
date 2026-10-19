# Fonctionnalités à conserver

Inventaire de `reference/glyphotrame-reference.html`. À cocher au fil du portage (phase 1), puis à vérifier avec le rendu GPU (phase 2).

Phase 1 : les cases cochées sont vérifiées par `npm run compare:ui`, qui joue les mêmes actions dans l'application et dans la référence (228 vérifications, thèmes clair et sombre) : aperçu identique au pixel près, même état de chaque contrôle, mêmes messages, mêmes captures d'écran du panneau, fichiers exportés identiques octet par octet. Les deux cases restantes passent par les fenêtres natives de Windows et le glisser-déposer de Tauri, que le banc ne peut pas piloter : à tester à la main dans `npm run tauri dev`.

## Image
- [ ] Ouvrir une image (boîte de dialogue native), glisser-déposer, coller (Ctrl+V) — *coller et glisser-déposer du navigateur vérifiés ; boîte « Ouvrir » et glisser-déposer de Tauri à tester à la main*
- [x] Image d'exemple (sphère générée)
- [x] Largeur de sortie (300 → 2400 px)
- [x] Taille max de l'image source réglable (1000 → 8000 px, 1800 par défaut comme la référence) — *nouveau*

## Effet
- [x] Choix Caractères / Halftone (les autres sections s'adaptent)

## Détourage
- [x] Supprimer le fond (active le fond transparent pour les exports)
- [x] Couleur du fond : détection auto sur les bords, pipette sur l'aperçu, sélecteur
- [x] Tolérance, adoucir les bords
- [x] Seulement le fond relié aux bords (remplissage depuis les bords)
- [x] Aperçu du détourage sur damier
- [x] La vue « Avant » montre l'image détourée

## Dégradé
- [x] Activer / désactiver
- [x] Forme : droite, vague, courbe libre (plume)
- [x] Côté de l'effet : 8 directions + radial, angle libre
- [x] Position de la transition, largeur du fondu
- [x] Vague : amplitude, nombre d'ondulations (pétales en radial), décalage
- [x] Courbe de progression : éditeur Bézier à 2 poignées (souris + clavier), préréglages Douce / Linéaire / Effet persistant / Effet bref
- [x] Transition : « Effet sur la photo » ou « Fondu simple »
- [x] Inverser les côtés
- [x] Plume : outils Plume, Sélection directe, Ajouter, Supprimer, Convertir
- [x] Plume : point d'angle (clic) / point courbe (cliquer-glisser), fermer en cliquant le 1er point, élastique
- [x] Plume : ajout / suppression automatiques au survol, découpe de segment sans changer la forme
- [x] Plume : Alt casse la symétrie, Maj contraint à 45°, double-clic angle ↔ courbe, flèches pour décaler
- [x] Plume : raccourcis P, A, +, −, Maj+C, Suppr, Échap, Ctrl+Z, Ctrl+Maj+Z
- [x] Plume : tracé ouvert (effet à gauche, prolongements en pointillés) ou fermé (effet à l'intérieur)
- [x] Plume : nouveau tracé, fermer / ouvrir, tracé d'exemple, afficher / masquer

## Halftone
- [x] Type : points, lignes, pointillisme
- [x] 9 formes : rond, carré, losange, ellipse, triangle, hexagone, croix, étoile, tiret
- [x] Grille carrée / hexagonale
- [x] Taille de la trame, angle, taille max / min (épaisseur pour les lignes), désordre
- [x] Lignes : ondulation et nombre d'ondulations
- [x] Pointillisme : taille variable selon le ton
- [x] Valeurs par défaut adaptées à chaque type

## Caractères
- [x] Polices Archivo (sans serif) et Fraunces (serif)
- [x] Taille (corps), épaisseur (graisse), espacement (approche), interligne
- [x] Jeux prédéfinis + caractères personnalisés
- [x] Classement automatique par densité d'encre

## Tons
- [x] Luminosité, contraste, inverser les tons
- [x] Inversion automatique selon fond clair / sombre

## Couleurs
- [x] Monochrome (encre + fond), couleurs de l'image, Néon, CMJN (halftone uniquement, rosette 15° / 75° / 0° / 45°)
- [x] Nuancier encre / fond (4 combinaisons)
- [x] Néon : palette ombres / milieux / lumières, position des milieux, 6 préréglages
- [x] Néon : couleurs de l'image (mélange 0-100 %), saturation, éclat
- [x] Passage auto en fond noir à l'activation du néon
- [x] Fond transparent

## Néon & écran
- [x] Préréglage « Néon numérique » en un clic
- [x] Lueur (intensité, diffusion)
- [x] Grille d'écran (opacité, épaisseur, calée sur la trame ou taille libre)
- [x] Lignes de balayage (opacité, écart)
- [x] Aberration chromatique, grain, vignettage
- [x] Retirer les effets d'écran
- [x] Sur fond transparent, les calques d'écran ne touchent que l'image

## Aperçu
- [x] Vues Résultat / Côte à côte / Curseur (glissoir avant-après)
- [x] Zoom Ajuster / 100 %
- [x] Statistiques (caractères ou points, dimensions)

## Exports
- [x] PNG et JPEG, résolution 1× à 4×
- [x] SVG vectoriel : texte éditable ou formes, dégradé en masques, effets en filtres / motifs
- [x] Code : HTML + CSS (grille exacte, variable --k), SVG en ligne, texte brut (caractères seulement)
- [ ] Copier le code, enregistrer le fichier (boîte de dialogue native) — *copie et contenu des 10 fichiers exportés vérifiés (identiques à la référence) ; boîte « Enregistrer » à tester à la main*

## Phase 2 · Rendu sur la carte graphique (WebGL2)

Vérifié par `npm run compare:gpu` (46 réglages types, GPU ↔ canvas 2D) et `npm run compare:ui -- --gpu` (228 vérifications face à la référence). Voir `docs/notes.md`.

- [x] Halftone : points (9 formes, grilles, désordre), lignes, pointillisme, CMJN
- [x] Caractères : atlas de glyphes, pixels identiques au rendu canvas (placement et contraste du texte reproduits)
- [x] Composition : dégradés droit / vague / courbe libre, détourage, fond transparent
- [x] Néon & écran : lueur, aberration chromatique, grille, balayage, vignettage, grain
- [x] Exports PNG / JPEG rendus par la carte graphique (par tuiles, jusqu'à 4×)
- [x] Rendu canvas 2D en secours : choix dans la section Sortie, retour automatique si WebGL2 manque ou si la carte graphique décroche
- [x] Exports SVG / HTML toujours calculés par le moteur JavaScript
- [ ] Vérifié à l'œil dans la fenêtre Tauri : passage Carte graphique ↔ Canvas 2D, export PNG 4× enregistré par la boîte de dialogue — *rendu GPU, retour au GPU et export 4× (9 600 × 9 600 px, 5 s) vérifiés à distance dans WebView2*

## Phase 3 · Confort

- [x] Projets `.json` : enregistrer (Ctrl+S, Maj+clic ou Ctrl+Maj+S : enregistrer sous), ouvrir (Ctrl+O), nom du projet et « • » si modifié — *vérifié par `npm test` (format, chemins) et `npm run compare:ui` (section Projets : réglages et aperçu identiques après réouverture)*
- [x] Image du projet : chemin relatif au fichier (dossier déplacé d'un bloc), chemin absolu, image collée intégrée, image d'exemple ; recherche proposée si l'image est introuvable
- [ ] Projets vérifiés à la main dans la fenêtre Tauri : enregistrer, fermer et rouvrir l'application, déplacer le dossier projet + image, renommer l'image
- [ ] Annuler / rétablir global
- [ ] Préréglages personnels
- [ ] Calculs lourds dans des Web Workers

## Vidéo (phase 4, plan détaillé dans `docs/video.md`)

- [x] Étape 0 · ffmpeg et ffprobe embarqués (sidecars), téléchargés par `tools/get-ffmpeg.ps1` (somme SHA-256 vérifiée) ; lancés uniquement depuis le Rust (commande `version_ffmpeg`, version affichée dans la console au démarrage) — *vérifié dans la fenêtre Tauri : versions renvoyées en 67 ms, exécution d'un programme depuis l'interface refusée*
- [x] Étape 1 · Importer une vidéo : boîte Ouvrir (filtre images et vidéos) et glisser-déposer (mp4, mov, m4v, webm, mkv, avi), infos par ffprobe (dimensions affichées, durée, cadence, images, rotation, son, codec), première image avec l'effet, informations dans les statistiques, taille max appliquée, message clair si illisible — *vérifié par `cargo test` (mires générées par ffmpeg, dont une en portrait) et dans la fenêtre Tauri*
- [x] Étape 2 · Barre de lecture sous l'aperçu (vidéo seulement) : lecture / pause, image précédente / suivante (Maj : 10 images), curseur de temps (la dernière position demandée gagne), temps courant / durée et numéro d'image, points d'entrée et de sortie (plage soulignée, retour à toute la vidéo), lecture en boucle, images par seconde réellement affichées ; raccourcis Espace, ← →, I, O, L (sans conflit avec la plume ni les champs de saisie) — *vérifié par `cargo test` (image n en lecture continue = image n à l'arrêt) et dans la fenêtre Tauri (navigation à l'image près, lecture à l'horloge avec sauts d'images, boucle entre entrée et sortie, arrêt à la sortie, raccourcis, retour à une image)*
- [x] Étape 3 · Rendre une image de vidéo (`createFrameRenderer`, `src/state/frame.js`) : même chaîne que l'aperçu (source → détourage → grille → rendu GPU par tuiles, canvas 2D en secours) en pixels RGBA, dimensions paires, couleur de fond détectée figée pour tout l'export, police et densité préparées une fois (`prepareCompute`) ; option « Grain animé » (Néon & écran, visible pour une vidéo) — *vérifié dans la fenêtre Tauri : image rendue identique octet pour octet à l'export PNG de la même image (GPU et canvas 2D, caractères et halftone + détourage + grain) ; mémoire stable sur 240 images*
- [x] Étape 4 · Exporter la vidéo : bouton « Vidéo… » dans Exporter, fenêtre de réglages (format MP4 H.264 / MOV ProRes 4444 / WebM VP9 / séquence PNG / GIF, taille de sortie ou d'origine, cadence d'origine ou 30 / 25 / 24 / 15 / 12, toute la vidéo ou entrée → sortie, son d'origine, qualité), fond plein forcé pour MP4 et GIF avec message, progression (image n / total, images par seconde, temps restant), annulation (fichier incomplet supprimé), « Ouvrir le dossier » à la fin ; l'interface reste utilisable (réglages copiés au lancement) — *vérifié par `cargo test` (chaîne décodeur → encodeur réelle pour les 5 formats : images exactes, nombre d'images, son, transparence ProRes et WebM) et dans la fenêtre Tauri (exports contrôlés par ffprobe, annulation, dossier absent)*
- [ ] Étape 5 · Projets
- [ ] Étape 6 · Performances
- [ ] Étape 7 · Vérifications (`npm run compare:video`)
