# Vidéo : appliquer les effets à une vidéo

Objectif de cette étape : **appliquer à une vidéo les effets qui existent déjà** (caractères, halftone, dégradés, détourage, néon, effets d'écran), image par image, et exporter le résultat. Les réglages sont les mêmes pour toute la vidéo : pas d'animation des réglages ni d'images clés pour l'instant.

Principe : la vidéo est découpée en images par **ffmpeg** ; chaque image passe dans le pipeline existant (`applyCutout` → `compute` → rendu GPU) ; les images rendues sont réencodées par ffmpeg. Le moteur (`src/engine/`) et le rendu GPU (`src/gpu/`) ne changent pas : une image de vidéo est une source comme une autre.

Avancer étape par étape, avec un commit par étape qui fonctionne. Les bancs `npm run compare`, `compare:ui` et `compare:gpu` doivent rester verts du début à la fin (aucune régression sur les images).

---

## Étape 0 · ffmpeg dans l'application (sidecar)

- Script `tools/get-ffmpeg.ps1` qui télécharge `ffmpeg.exe` et `ffprobe.exe` (build Windows 64 bits) et les place dans `src-tauri/binaries/` sous les noms attendus par Tauri : `ffmpeg-x86_64-pc-windows-msvc.exe`, `ffprobe-x86_64-pc-windows-msvc.exe`. Ajouter `src-tauri/binaries/` au `.gitignore` (fichiers lourds) et documenter la commande dans `DEMARRAGE.md`.
- Déclarer les deux binaires dans `bundle.externalBin` de `tauri.conf.json` ; ajouter le plugin `tauri-plugin-shell`.
- **ffmpeg n'est lancé que depuis le Rust**, dans des commandes dédiées (`app.shell().sidecar(...)`), jamais avec des arguments venant directement de l'interface : pas de permission « exécuter » côté JavaScript.
- Licence : pour un usage personnel, n'importe quelle build convient. Avant de diffuser l'application, vérifier la licence de la build choisie (GPL si elle contient x264) et ses encodeurs (`ffmpeg -encoders`) ; une build LGPL peut encoder le H.264 avec l'encodeur de Windows (`h264_mf`).
- Test : une commande `version_ffmpeg` affichée dans la console au démarrage.

## Étape 1 · Importer une vidéo

- Boîte Ouvrir et glisser-déposer : accepter aussi `mp4, mov, m4v, webm, mkv, avi` (et garder les images).
- Commande Rust `infos_video(chemin)` (ffprobe en JSON) : largeur, hauteur, durée, cadence (`r_frame_rate`), nombre d'images, rotation (vidéos de téléphone), présence de son, codec. Message clair si le fichier n'est pas lisible.
- Commande Rust `image_video(chemin, temps, largeur_max)` : renvoie une image (RGBA brut via `tauri::ipc::Response`, comme `lire_image`) à l'instant demandé, rotation appliquée, réduite à la taille max de la source.
- La source devient `{ kind: 'video', path, meta, time }` ; son canvas est l'image de l'instant courant. Toute l'interface marche donc tout de suite sur la première image (aperçu, avant/après, pipette, plume, exports d'image).
- Statistiques de l'aperçu : ajouter durée, cadence et dimensions de la vidéo.

## Étape 2 · Naviguer et lire la vidéo dans l'aperçu

- Barre de lecture sous l'aperçu, visible seulement pour une vidéo : lecture / pause, curseur de temps, temps courant / durée, image précédente / suivante, points d'entrée et de sortie, lecture en boucle.
- Glisser le curseur de temps demande l'image correspondante (une seule requête en cours, la dernière position gagne) et la rend avec l'effet.
- Lecture : session de décodage ffmpeg en continu depuis l'instant courant, à la taille de l'aperçu (commandes `lecture_debut`, `lecture_image`, `lecture_fin`). Chaque image est rendue avec l'effet ; si le rendu est en retard, on saute des images (indicateur d'images par seconde réelles). Le son n'est pas joué dans l'aperçu (v1).
- Raccourcis : Espace = lecture / pause, ← → = image précédente / suivante, I / O = entrée / sortie. Ne pas entrer en conflit avec les raccourcis de la plume (actifs seulement quand la plume l'est).
- Les vues Résultat / Côte à côte / Curseur fonctionnent sur l'image courante.

## Étape 3 · Rendre une image de vidéo

- Fonction unique (ex. `renderFrame(settings, canvasImage, { largeur, opaque })` dans `src/state/` ou `src/gpu/`) : crée la source, applique le détourage, `compute`, rendu GPU à la taille de sortie, et rend les pixels RGBA. Elle reprend le rendu par tuiles de `gpuRenderBlob` mais rend des pixels bruts au lieu d'un Blob ; canvas 2D en secours.
- **Détourage** : la couleur détectée automatiquement est calculée une fois (sur l'image courante) puis **figée pendant tout l'export**, sinon le fond « clignote » d'une image à l'autre.
- Polices chargées une fois avant la boucle (`ensureFont`), pas à chaque image.
- Dimensions de sortie **paires** (obligatoire pour le H.264).
- La pseudo-aléatoire du moteur (désordre, pointillisme) dépend de la position, pas du temps : le motif reste stable d'une image à l'autre. Le garder ainsi.
- Option « Grain animé » (section Néon & écran, visible pour une vidéo) : décaler le motif du grain à chaque image ; désactivée = grain figé comme sur une image.
- Mémoire : aucune image ne doit s'accumuler (vérifier sur une vidéo longue que la mémoire reste stable).

## Étape 4 · Exporter la vidéo

- Bouton « Vidéo » dans Exporter (visible pour une vidéo), qui ouvre une fenêtre de réglages :
  - **Format** : MP4 H.264 (réseaux sociaux) · MOV ProRes 4444 (avec transparence, pour After Effects / Premiere) · WebM VP9 (avec transparence, pour le web) · séquence PNG (dossier) · GIF.
  - **Taille** : reprend « Largeur de sortie », ou taille d'origine de la vidéo.
  - **Cadence** : celle d'origine, ou 30 / 25 / 24 / 15 / 12 images par seconde (les faibles cadences donnent un rendu saccadé « image par image »).
  - **Plage** : toute la vidéo ou entre les points d'entrée et de sortie.
  - **Son** : conserver le son d'origine (case cochée par défaut ; sans objet pour PNG et GIF).
  - **Qualité** : Haute / Moyenne / Légère.
- Fond transparent avec un format sans transparence (MP4, GIF) : fond plein forcé, avec un message (comme pour le JPEG).
- Pipeline côté Rust : une session d'export = un ffmpeg qui décode (`-ss` / `-to`, `fps=`, sortie `rawvideo rgba` sur stdout) et un ffmpeg qui encode (`rawvideo rgba` sur stdin, plus la vidéo source pour le son). Commandes : `export_debut(reglages) → id`, `export_lire_image(id)` (pixels ou fin), `export_ecrire_image(id, pixels)` (corps binaire brut, pas de JSON ni de base64), `export_fin(id)`, `export_annuler(id)` (processus arrêtés, fichier incomplet supprimé).
- Réglages d'encodage de départ (à ajuster après essais) :
  - MP4 : `-c:v libx264 -pix_fmt yuv420p -crf 18/23/28 -preset medium -movflags +faststart`, son `-c:a aac -b:a 192k` (ou `h264_mf` si la build n'a pas x264)
  - ProRes 4444 : `-c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le`, son `-c:a pcm_s16le`
  - WebM : `-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30/34/40`, son `-c:a libopus`
  - PNG : `nom_00001.png…` dans le dossier choisi
  - GIF : `palettegen` / `paletteuse`, 15 images/s et 800 px de large au plus par défaut
- Côté interface : boucle lire → rendre → écrire, barre de progression (image n / total, temps restant estimé), bouton Annuler, l'interface reste utilisable (céder la main entre les images). À la fin : « Vidéo enregistrée : … » et un bouton pour ouvrir le dossier (plugin opener).
- Les exports existants (PNG, JPEG, SVG, Code) restent disponibles et portent sur **l'image courante** de la vidéo.

## Étape 5 · Projets

- Le fichier projet enregistre la vidéo (chemin absolu + relatif, comme les images), l'instant courant, les points d'entrée / sortie et les derniers réglages d'export vidéo. Augmenter la version du format ; les anciens projets s'ouvrent toujours. Tests dans `npm test`.

## Étape 6 · Performances (si besoin)

- Mesurer le temps par image (décodage, `compute`, rendu GPU, lecture des pixels, écriture). Afficher la moyenne pendant l'export.
- Si `compute` domine : le déplacer dans un Web Worker (OffscreenCanvas) et préparer l'image suivante pendant que la carte graphique dessine la courante.
- Si les transferts dominent : vérifier que les pixels passent en binaire brut, sans copie inutile.

## Étape 7 · Vérifications

- Banc `npm run compare:video` : génère une vidéo de test avec ffmpeg (`testsrc2`, 2 s, avec son), l'exporte en **séquence PNG** avec plusieurs réglages types, et compare chaque image à l'export PNG de la même image par le moteur (identique au pixel). Vérifie aussi avec ffprobe les exports MP4 / MOV / WebM : durée, cadence, dimensions, présence du son, canal alpha pour ProRes et WebM.
- Cas à tester à la main : vidéo verticale de téléphone (rotation), vidéo sans son, cadence variable, 4K, vidéo longue (mémoire stable), annulation en cours d'export, fichier illisible.
- `npm run compare`, `compare:ui`, `compare:gpu` toujours verts.
- Ajouter une section « Vidéo » à `docs/fonctionnalites.md` et la cocher au fil des étapes.

## Plus tard (hors de cette étape)

Images clés et timeline (animer les réglages), animation du tracé plume, lecture du son dans l'aperçu, effets propres aux caractères (défilement, scramble), réaction au son, détourage automatique de personnes.
