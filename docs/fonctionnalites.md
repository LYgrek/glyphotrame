# Fonctionnalités à conserver

Inventaire de `reference/glyphotrame-reference.html`. À cocher au fil du portage (phase 1), puis à vérifier avec le rendu GPU (phase 2).

Phase 1 : les cases cochées ont été vérifiées en jouant les mêmes actions dans l'application et dans la référence (aperçu identique au pixel près, mêmes statistiques, mêmes messages). Les cases restantes passent par les fenêtres natives de Windows et doivent être testées à la main dans `npm run tauri dev`.

## Image
- [ ] Ouvrir une image (boîte de dialogue native), glisser-déposer, coller (Ctrl+V) — *coller vérifié ; boîte de dialogue et glisser-déposer à tester à la main*
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
- [ ] Copier le code, enregistrer le fichier (boîte de dialogue native) — *fichiers produits vérifiés (PNG 2400 × 2400 à 2×, JPEG, SVG, page HTML, texte) ; boîte « Enregistrer » et copie à tester à la main*
