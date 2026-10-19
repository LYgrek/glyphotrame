# Glyphotrame — application de bureau

Ce fichier est lu automatiquement par Claude Code au début de chaque session. Il décrit le projet, la cible technique et les règles de travail.

## Le projet

Glyphotrame transforme des images en trames graphiques : **caractères du clavier** (façon ASCII art typographique) ou **halftone** (points, lignes, pointillisme, CMJN), avec dégradés, détourage, effets néon/écran et exports PNG, JPEG, SVG et HTML.

Il existe déjà une version complète et fonctionnelle en **un seul fichier HTML** :
`reference/glyphotrame-reference.html` (à ouvrir dans un navigateur pour comparer).

**C'est la référence.** Le but est de la porter en application de bureau, à fonctionnalités identiques, puis de l'améliorer. La liste complète des fonctions à conserver est dans `docs/fonctionnalites.md`.

- Auteur : Enzo, designer graphique et web (Windows). Interface en **français**.
- Ne jamais modifier `reference/` : c'est l'étalon de comparaison.

## Stack

- **Tauri 2** (Rust) pour la fenêtre, l'accès aux fichiers et l'installateur.
- **React + Vite** (JavaScript, pas TypeScript) pour l'interface.
- **WebGL2** pour l'aperçu calculé sur la carte graphique (phase 2). Pas de WebGPU : il n'est pas encore fiable dans les WebView de Tauri sur macOS et Linux.
- Plugins Tauri : `dialog` (ouvrir / enregistrer), `fs` (écrire les fichiers exportés) et `shell` (côté Rust seulement : lancer ffmpeg / ffprobe).
- **ffmpeg / ffprobe** embarqués comme sidecars (`bundle.externalBin`, dossier `src-tauri/binaries/`, non versionné) pour la vidéo (`docs/video.md`). Ils ne sont lancés que par des commandes Rust dédiées, avec des arguments fixés côté Rust ; l'interface n'a aucune permission pour exécuter un programme.

Commandes :
- `npm install` : installer les dépendances
- `powershell -ExecutionPolicy Bypass -File .\tools\get-ffmpeg.ps1` : télécharger ffmpeg et ffprobe dans `src-tauri/binaries/` (obligatoire avant de compiler)
- `npm run tauri dev` : lancer l'application en mode développement
- `npm run tauri build` : créer l'installateur (`src-tauri/target/release/bundle/`)
- `npm test` : tests unitaires (format des projets, chemins) ; `cd src-tauri; cargo test` : tests Rust

## Architecture cible

```
src/
  main.jsx, App.jsx
  state/        état global
    index.js        stores `settings` (même forme que l'objet `state` de la référence) et `session` (interface)
    defaults.js     réglages par défaut
    renderer.js     relie les réglages au moteur et dessine l'aperçu
    actions.js      actions de l'interface (réglages liés, chargement, pipette, exports)
    pen.js          outil plume : outil actif, historique, boutons
    project.js      projets : enregistrer, ouvrir, suivi des modifications
    project-format.js  format des fichiers de projet (.json), fonctions pures
    video.js        vidéo : ouvrir, image courante (source { kind: 'video', path, meta, time })
  platform/     Tauri : boîtes de dialogue, lecture / écriture de fichiers, glisser-déposer ; paths.js : chemins relatifs ;
                ffmpeg.js : appels aux commandes Rust de la vidéo
  engine/       moteur pur JavaScript, sans React, porté depuis la référence
    index.js        point d'entrée (réexporte tous les modules)
    util.js         outils communs, createCanvas
    constants.js    polices, jeux de caractères, nuanciers, palettes néon, courbes, encres CMJN
    source.js       image source (chargement, taille max, image d'exemple)
    tones.js        luminosité, contraste, inversion, carte des tons
    chars.js        grille de caractères, densité des glyphes
    halftone.js     points / lignes / pointillisme / CMJN, formes
    cutout.js       détourage (couleur, tolérance, remplissage depuis les bords)
    gradient.js     dégradés (droit, vague, radial), courbe de progression
    penpath.js      tracé plume (Bézier, ouvert / fermé) et masque
    neon.js         palette néon, couleurs de l'image ravivées
    postfx.js       lueur, grille d'écran, balayage, aberration, grain, vignettage
    render.js       calcul de la grille et composition canvas 2D (aperçu, PNG, JPEG)
    export-svg.js   export SVG vectoriel (masques, filtres, motifs)
    export-html.js  export HTML + CSS, texte brut
  gpu/          rendu WebGL2 de l'aperçu et des exports PNG / JPEG (phase 2)
    index.js        point d'entrée : createGpuRenderer, gpuRenderBlob
    renderer.js     calque de l'effet, lueur, composition, effets d'écran ; exports par tuiles
    shaders.js      shaders GLSL ES 3.00 (formes, lignes, encres, glyphes, flou, composition, écran)
    halftone.js     instances (points) et maillages (lignes) depuis les éléments du moteur
    glyphs.js       atlas de glyphes (placement et contraste du texte du navigateur, mesurés)
    gl.js           outils WebGL2 (programmes, textures, cibles de rendu)
  ui/           composants (un fichier CSS par composant, classes identiques à la référence)
    controls/       curseur, boutons segmentés, cases, interrupteur, couleur
    panel/          colonne de réglages, une section par bloc, éditeur de courbe
    stage/          aperçu (vues, curseur avant-après), barre et gestes de la plume
    Header, CodeSheet, Toast
src-tauri/      côté Rust : plugins dialog + fs + shell, commandes (lire_image, ffmpeg), configuration de la fenêtre
  src/video.rs    vidéo : infos (ffprobe), image à un instant (ffmpeg, RGBA brut) ; tests sur de vraies vidéos
  binaries/       ffmpeg / ffprobe (téléchargés par tools/get-ffmpeg.ps1, non versionnés)
reference/      version HTML d'origine (ne pas modifier)
tools/          bancs de comparaison (`npm run compare`, `compare:ui`, `compare:gpu`), hors application
docs/           fonctionnalités, notes
```

Principes :
- Le **moteur** (`engine/`) reste indépendant de React : fonctions pures qui prennent l'état et une image, et rendent des données (grille, points, masques). L'interface ne fait qu'appeler le moteur.
- Les **exports SVG et HTML restent calculés par le moteur JavaScript** (vectoriels, identiques à la référence). Le GPU sert à l'aperçu et aux exports PNG/JPEG.
- Reprendre l'identité visuelle de la référence : tokens de couleur (`--paper`, `--panel`, `--accent`…), thèmes clair et sombre, polices Archivo, Fraunces et IBM Plex Mono. Dans l'application, embarquer les polices localement (paquets `@fontsource/*`) car l'app doit marcher hors ligne. Les exports SVG/HTML, eux, continuent de pointer vers Google Fonts.

## Phases

1. **Portage à l'identique** (moteur canvas 2D existant) : même interface, mêmes réglages, mêmes résultats que la référence. Ouvrir et enregistrer via les boîtes de dialogue natives (plugins dialog + fs), à la place des téléchargements du navigateur. Supprimer la limite de 1800 px sur l'image source (la rendre réglable).
2. **Aperçu sur la carte graphique (WebGL2)** : shaders pour le halftone (points, lignes, CMJN), atlas de glyphes pour les caractères, composition (dégradé, détourage, lueur, effets d'écran) en shaders. Le rendu canvas 2D reste en secours si WebGL2 n'est pas disponible. Exports PNG haute définition rendus par le GPU.
3. **Confort** : calculs lourds dans des Web Workers, sauvegarde / ouverture de projets (.json avec réglages + chemin de l'image), préréglages personnels, annuler / rétablir global.
4. **Vidéo** : d'abord appliquer les effets existants à une vidéo, plan détaillé dans `docs/video.md`. Ensuite : import et export via ffmpeg (sidecar Tauri), timeline, images clés sur les réglages, export ProRes 4444 / WebM avec transparence et séquence PNG pour After Effects.
5. **Distribution** : icône et nom définitifs, GitHub Actions (`tauri-action`) pour construire Windows et macOS (version universelle).

## Règles de travail

- Avancer par **petites étapes vérifiables**. Après chaque étape : lancer `npm run tauri dev`, vérifier, et comparer avec `reference/glyphotrame-reference.html`.
- Après toute modification de `src/engine/` : `npm run compare` doit rester entièrement vert ; après toute modification de l'interface : `npm run compare:ui` (et `npm run compare:ui -- --gpu`) ; après toute modification de `src/gpu/` : `npm run compare:gpu` (voir `docs/notes.md`).
- Cocher l'avancement dans `docs/fonctionnalites.md`.
- Faire un commit git à chaque étape qui fonctionne, avec un message en français.
- Textes de l'interface, messages d'erreur et commentaires en français.
- Ne pas ajouter de dépendance lourde sans raison (pas de framework UI) : la référence est en CSS pur, garder cette approche (CSS modules ou un fichier CSS par composant).
- Windows est la plateforme de développement principale (chemins, scripts PowerShell).
