# Fonctionnalités à conserver

Inventaire de `reference/glyphotrame-reference.html`. À cocher au fil du portage (phase 1), puis à vérifier avec le rendu GPU (phase 2).

## Image
- [ ] Ouvrir une image (boîte de dialogue native), glisser-déposer, coller (Ctrl+V)
- [ ] Image d'exemple (sphère générée)
- [ ] Largeur de sortie (300 → 2400 px)

## Effet
- [ ] Choix Caractères / Halftone (les autres sections s'adaptent)

## Détourage
- [ ] Supprimer le fond (active le fond transparent pour les exports)
- [ ] Couleur du fond : détection auto sur les bords, pipette sur l'aperçu, sélecteur
- [ ] Tolérance, adoucir les bords
- [ ] Seulement le fond relié aux bords (remplissage depuis les bords)
- [ ] Aperçu du détourage sur damier
- [ ] La vue « Avant » montre l'image détourée

## Dégradé
- [ ] Activer / désactiver
- [ ] Forme : droite, vague, courbe libre (plume)
- [ ] Côté de l'effet : 8 directions + radial, angle libre
- [ ] Position de la transition, largeur du fondu
- [ ] Vague : amplitude, nombre d'ondulations (pétales en radial), décalage
- [ ] Courbe de progression : éditeur Bézier à 2 poignées (souris + clavier), préréglages Douce / Linéaire / Effet persistant / Effet bref
- [ ] Transition : « Effet sur la photo » ou « Fondu simple »
- [ ] Inverser les côtés
- [ ] Plume : outils Plume, Sélection directe, Ajouter, Supprimer, Convertir
- [ ] Plume : point d'angle (clic) / point courbe (cliquer-glisser), fermer en cliquant le 1er point, élastique
- [ ] Plume : ajout / suppression automatiques au survol, découpe de segment sans changer la forme
- [ ] Plume : Alt casse la symétrie, Maj contraint à 45°, double-clic angle ↔ courbe, flèches pour décaler
- [ ] Plume : raccourcis P, A, +, −, Maj+C, Suppr, Échap, Ctrl+Z, Ctrl+Maj+Z
- [ ] Plume : tracé ouvert (effet à gauche, prolongements en pointillés) ou fermé (effet à l'intérieur)
- [ ] Plume : nouveau tracé, fermer / ouvrir, tracé d'exemple, afficher / masquer

## Halftone
- [ ] Type : points, lignes, pointillisme
- [ ] 9 formes : rond, carré, losange, ellipse, triangle, hexagone, croix, étoile, tiret
- [ ] Grille carrée / hexagonale
- [ ] Taille de la trame, angle, taille max / min (épaisseur pour les lignes), désordre
- [ ] Lignes : ondulation et nombre d'ondulations
- [ ] Pointillisme : taille variable selon le ton
- [ ] Valeurs par défaut adaptées à chaque type

## Caractères
- [ ] Polices Archivo (sans serif) et Fraunces (serif)
- [ ] Taille (corps), épaisseur (graisse), espacement (approche), interligne
- [ ] Jeux prédéfinis + caractères personnalisés
- [ ] Classement automatique par densité d'encre

## Tons
- [ ] Luminosité, contraste, inverser les tons
- [ ] Inversion automatique selon fond clair / sombre

## Couleurs
- [ ] Monochrome (encre + fond), couleurs de l'image, Néon, CMJN (halftone uniquement, rosette 15° / 75° / 0° / 45°)
- [ ] Nuancier encre / fond (4 combinaisons)
- [ ] Néon : palette ombres / milieux / lumières, position des milieux, 6 préréglages
- [ ] Néon : couleurs de l'image (mélange 0-100 %), saturation, éclat
- [ ] Passage auto en fond noir à l'activation du néon
- [ ] Fond transparent

## Néon & écran
- [ ] Préréglage « Néon numérique » en un clic
- [ ] Lueur (intensité, diffusion)
- [ ] Grille d'écran (opacité, épaisseur, calée sur la trame ou taille libre)
- [ ] Lignes de balayage (opacité, écart)
- [ ] Aberration chromatique, grain, vignettage
- [ ] Retirer les effets d'écran
- [ ] Sur fond transparent, les calques d'écran ne touchent que l'image

## Aperçu
- [ ] Vues Résultat / Côte à côte / Curseur (glissoir avant-après)
- [ ] Zoom Ajuster / 100 %
- [ ] Statistiques (caractères ou points, dimensions)

## Exports
- [ ] PNG et JPEG, résolution 1× à 4×
- [ ] SVG vectoriel : texte éditable ou formes, dégradé en masques, effets en filtres / motifs
- [ ] Code : HTML + CSS (grille exacte, variable --k), SVG en ligne, texte brut (caractères seulement)
- [ ] Copier le code, enregistrer le fichier (boîte de dialogue native)
