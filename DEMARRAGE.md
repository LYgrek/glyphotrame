# Démarrer le développement de Glyphotrame

Guide pas à pas pour passer de l'artefact à l'application de bureau.

## Ce qui est déjà prêt dans ce dossier

| Fichier | Rôle |
|---|---|
| `src/`, `src-tauri/`, `package.json`… | Squelette officiel **Tauri 2 + React + Vite**, déjà configuré (nom Glyphotrame, fenêtre 1440 × 900, identifiant `fr.lymonstudio.glyphotrame`) |
| `reference/glyphotrame-reference.html` | La version complète actuelle de Glyphotrame. C'est le modèle à reproduire |
| `CLAUDE.md` | Le brief du projet. **Claude Code le lit tout seul** à chaque session |
| `docs/fonctionnalites.md` | La liste de toutes les fonctions à conserver, à cocher au fil du portage |
| `verifier-installation.ps1` | Vérifie que tous les outils sont installés |

## Étape 1 · Installer les outils (une seule fois)

Dans cet ordre :

1. **Microsoft C++ Build Tools** : https://visualstudio.microsoft.com/visual-cpp-build-tools/
   Dans l'installateur, coche **« Développement Desktop en C++ »**.
2. **Rust** : https://rustup.rs → `rustup-init.exe`, options par défaut.
3. **Node.js** version **LTS** : https://nodejs.org
4. **Git** : https://git-scm.com/downloads/win
5. **VS Code** : https://code.visualstudio.com, puis l'extension **Claude Code** (onglet Extensions, recherche « Claude Code »).

Redémarre le PC après les installations.

## Étape 2 · Vérifier l'installation

1. Ouvre ce dossier dans VS Code : **Fichier → Ouvrir le dossier…** → `glyphotrame-app`.
2. VS Code propose d'installer les extensions recommandées (Tauri, Rust, Claude Code) : accepte.
3. Ouvre un terminal : **Terminal → Nouveau terminal**, puis tape :

```powershell
powershell -ExecutionPolicy Bypass -File .\verifier-installation.ps1
```

Tout doit être en vert `[OK]`. Sinon, le script indique quoi installer.

## Étape 3 · Lancer l'application de démo

Toujours dans le terminal :

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\tools\get-ffmpeg.ps1
npm run tauri dev
```

`get-ffmpeg.ps1` télécharge **ffmpeg** et **ffprobe** (environ 185 Mo, une seule fois) dans `src-tauri\binaries\` : l'application s'en sert pour les vidéos, et Rust refuse de compiler s'ils manquent. Le dossier n'est pas enregistré dans git (fichiers lourds) : relance le script sur chaque nouvel ordinateur. Option `-Licence lgpl` pour une build sans x264 (voir la note de licence dans `docs/video.md`), `-Force` pour retélécharger.

La première fois, Rust compile tout : compte **3 à 10 minutes**. Les fois suivantes, c'est quelques secondes.
Une fenêtre « Glyphotrame » s'ouvre avec la page de démo de Tauri : ton environnement fonctionne. Ferme-la (ou `Ctrl+C` dans le terminal).

## Étape 4 · Démarrer avec Claude Code

Ouvre Claude Code dans VS Code (icône Claude dans la barre latérale, ou `Ctrl+Maj+P` → « Claude Code »). Il lit `CLAUDE.md` automatiquement. Donne-lui les demandes ci-dessous **une par une**, en testant entre chaque.

### Demande 1 · Mise en place

> Lis CLAUDE.md, docs/fonctionnalites.md et reference/glyphotrame-reference.html. Initialise git (avec un .gitignore adapté à Tauri + Node), installe les plugins Tauri dialog et fs, et embarque les polices Archivo, Fraunces et IBM Plex Mono en local avec @fontsource. Puis propose-moi un plan détaillé du portage en React (découpage en composants et modules du moteur), sans encore écrire le code.

### Demande 2 · Le moteur

> Porte le moteur de la référence dans src/engine/ (tons, caractères, halftone, détourage, dégradés, tracé plume, néon, effets d'écran, exports SVG et HTML), en fonctions pures sans React. Garde exactement les mêmes algorithmes et résultats que la référence.

### Demande 3 · L'interface

> Construis l'interface React à l'identique de la référence (panneau de réglages, aperçu avec vues Résultat / Côte à côte / Curseur, barre d'outils plume, éditeur de courbe, fenêtre Code), branchée sur le moteur. Remplace les téléchargements par les boîtes de dialogue natives de Tauri pour ouvrir et enregistrer. Coche docs/fonctionnalites.md au fur et à mesure.

### Demande 4 · Vérification

> Compare l'application avec reference/glyphotrame-reference.html fonction par fonction en suivant docs/fonctionnalites.md, et corrige tout ce qui diffère. Ajoute un réglage pour la taille maximale de l'image source (la référence la limite à 1800 px).

### Demande 5 · La carte graphique (phase 2)

> Passe à la phase 2 de CLAUDE.md : aperçu en WebGL2. Commence par le halftone (points, formes, lignes, CMJN), puis l'effet caractères avec un atlas de glyphes, puis la composition (dégradé, détourage, lueur, effets d'écran). Garde le rendu canvas 2D en secours, et les exports SVG/HTML calculés par le moteur JavaScript.

Pour la suite (projets sauvegardés, vidéo, distribution sur Mac), les phases 3 à 5 sont décrites dans `CLAUDE.md`.

## Publier une nouvelle version

Les versions sont construites et publiées automatiquement par GitHub. Quand une version est prête (tout est commité) :

```powershell
npm run release -- patch    # petites corrections   (1.0.0 → 1.0.1)
npm run release -- minor    # nouvelles fonctions   (1.0.0 → 1.1.0)
npm run release -- major    # grands changements    (1.0.0 → 2.0.0)
```

1. Le script te demande les **notes de version** : tape un point par ligne, puis une ligne vide pour terminer. C'est le texte que verront les utilisateurs dans la fenêtre de mise à jour.
2. Il lance les tests, te montre le résumé et demande confirmation (`o` pour publier).
3. Il envoie tout sur GitHub. La construction prend 15 à 25 minutes : tu peux la suivre sur https://github.com/LYgrek/glyphotrame/actions (un rond jaune qui tourne, puis une coche verte).
4. La version apparaît sur https://github.com/LYgrek/glyphotrame-releases/releases. C'est aussi l'adresse à donner pour télécharger Glyphotrame. Les applications déjà installées proposent la mise à jour à leur prochain démarrage.

Si la construction échoue (croix rouge), clique dessus pour lire l'erreur, ou colle-la à Claude Code. Détails, mise en place des dépôts et des secrets : `docs/notes.md`, section « Publier une version ».

**Clé de signature** : `C:\Users\<toi>\.tauri\glyphotrame.key` et son mot de passe doivent être sauvegardés hors de l'ordinateur (voir `docs/notes.md`, « Mises à jour »). Sans eux, plus aucune mise à jour possible pour les applications installées.

Pour construire un installateur sur ce PC sans rien publier : `npm run release:local` (demande le mot de passe de la clé ; fichiers dans `src-tauri\target\release\bundle\`).

## Bons réflexes

- **Une demande à la fois**, et lance `npm run tauri dev` pour vérifier avant de passer à la suivante.
- **Garde la référence ouverte** dans ton navigateur (double-clic sur `reference/glyphotrame-reference.html`) pour comparer.
- **Si quelque chose casse**, décris à Claude Code ce que tu vois, ou colle le message d'erreur du terminal.
- **Fais des commits** à chaque étape qui marche : demande simplement « fais un commit ».
- Le dossier `src-tauri\target` grossit beaucoup (plusieurs Go) : c'est normal. C'est pour ça que le projet est dans `source\repos` et pas dans OneDrive.
