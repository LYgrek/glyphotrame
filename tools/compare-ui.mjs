/* Banc de comparaison de l'interface : joue les mêmes actions dans l'application et dans la
   référence, section par section de docs/fonctionnalites.md, et compare après chaque action :
   - l'aperçu (pixels du résultat, de l'image « avant », de la vignette du détourage) ;
   - l'état visible de chaque contrôle (libellés, valeurs affichées, cases, boutons enfoncés) ;
   - le calque du tracé plume, les messages affichés, le texte copié ;
   et en fin de section, des captures d'écran du panneau, de l'en-tête et de l'aperçu.
   Les fichiers exportés (PNG, JPEG, SVG, HTML, texte) sont comparés octet par octet.

   Usage : npm run compare:ui            (toutes les sections)
           npm run compare:ui -- Dégradé (une ou plusieurs sections)
   Les captures qui diffèrent sont enregistrées dans tools/.ui-diff/. */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVite, openPage, sleep } from './lib/cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROBE = readFileSync(join(here, 'ui-probe.js'), 'utf8');
const DIFF_DIR = join(here, '.ui-diff');
// différences voulues : réglage ajouté, bouton renommé
// différences voulues : réglages ajoutés (taille max de la source, rendu GPU / canvas), bouton renommé
const SKIP = ["Taille max de l'image source", "Rendu de l'aperçu"];
const RENAME = { 'Enregistrer…': 'Télécharger' };

/* ---------- Actions ---------- */
const IMG = 'T.btn("Image d\'exemple")';
// action jouée telle quelle dans les deux pages (texte), ou fonction (page, nom) => …
const perPage = (app, ref) => (p, who) => p.eval(who === 'app' ? app : ref);
const at = async (p, sel, fx, fy) => { const [l, t, w, h] = await p.eval(`T.rect(${JSON.stringify(sel)})`); return [l + fx * w, t + fy * h]; };
const CAN = '.pane.after canvas';
const click = (fx, fy, mods = 0, sel = CAN) => async (p) => { const [x, y] = await at(p, sel, fx, fy); await p.mouse(x, y, { type: 'hover' }); await p.mouse(x, y, { modifiers: mods }); };
const hover = (fx, fy) => async (p) => { const [x, y] = await at(p, CAN, fx, fy); await p.mouse(x, y, { type: 'hover' }); };
const drag = (pts, mods = 0, sel = CAN) => async (p) => {
  const abs = []; for (const [fx, fy] of pts) abs.push(await at(p, sel, fx, fy));
  await p.mouse(...abs[0], { type: 'hover' }); await p.mouse(...abs[0], { type: 'down' });
  for (const q of abs.slice(1)) await p.mouse(...q, { type: 'move', modifiers: mods });
  await p.mouse(...abs.at(-1), { type: 'up' });
};
const dblclick = (fx, fy) => async (p) => { const [x, y] = await at(p, CAN, fx, fy); await p.mouse(x, y, { clickCount: 1 }); await p.mouse(x, y, { clickCount: 2 }); };
const key = (k, code, vk, mods = 0) => (p) => p.key(k, code, vk, mods);
const seq = (...fns) => async (p, who) => { for (const f of fns) await (typeof f === 'string' ? p.eval(f) : f(p, who)); };
const handle = (i) => `(() => { const h = document.querySelectorAll('.ce-handle')[${i}]; h.scrollIntoView({ block: 'center' }); const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`;
const dragHandle = (i, dx, dy) => async (p) => { const [x, y] = await p.eval(handle(i)); await p.mouse(x, y, { type: 'down' }); await p.mouse(x + dx / 2, y + dy / 2, { type: 'move' }); await p.mouse(x + dx, y + dy, { type: 'move' }); await p.mouse(x + dx, y + dy, { type: 'up' }); };
const wipeDrag = async (p) => { const [l, t, w, h] = await p.eval("T.rect('.compare')"); await p.mouse(l + w * 0.5, t + h / 2, { type: 'down' }); await p.mouse(l + w * 0.4, t + h / 2, { type: 'move' }); await p.mouse(l + w * 0.25, t + h / 2, { type: 'move' }); await p.mouse(l + w * 0.25, t + h / 2, { type: 'up' }); };
const DIRS = ['En haut à gauche', 'En haut', 'En haut à droite', 'À gauche', 'À droite', 'En bas à gauche', 'En bas', 'En bas à droite', 'Au centre (radial)'];
const SHAPES = ['Carré', 'Losange', 'Ellipse', 'Triangle', 'Hexagone', 'Croix', 'Étoile', 'Tiret', 'Rond'];

const SECTIONS = {
  'Image': [
    ["Image d'exemple", IMG],
    ['Largeur de sortie 800', "T.slider('Largeur de sortie', 800)"],
    ['Largeur de sortie 2400', "T.slider('Largeur de sortie', 2400)"],
    ['Largeur de sortie 1200', "T.slider('Largeur de sortie', 1200)"],
    ['Coller une image de 2400 px (réduite à 1800)', 'T.paste(2400, 1600)'],
    ['Glisser-déposer une image', 'T.drop(700, 1000)'],
    ['Détourage de l\'image déposée', "T.check('Supprimer le fond', true)"],
    ["Retour à l'image d'exemple", seq(IMG, "T.check('Supprimer le fond', false)", "T.check('Fond transparent', false)")]
  ],
  'Effet': [
    ['Halftone', "T.btn('Halftone', '.seg.effects button')"],
    ['Caractères', "T.btn('Caractères', '.seg.effects button')"]
  ],
  'Détourage': [
    ['Supprimer le fond', "T.check('Supprimer le fond', true)"],
    ['Tolérance 40', "T.slider('Tolérance', 40)"],
    ['Adoucir 0', "T.slider('Adoucir les bords', 0)"],
    ['Adoucir 25', "T.slider('Adoucir les bords', 25)"],
    ['Sans remplissage depuis les bords', "T.check('Seulement le fond', false)"],
    ['Couleur choisie au sélecteur', "T.color('Détectée', '#f0e0d0')"],
    ['Auto', "T.btn('Auto', '.cutcolor button')"],
    ['Pipette activée', "T.btn('Pipette')"],
    ["Pipette : clic sur l'aperçu", click(0.5, 0.45)],
    ['Vue côte à côte (avant détouré)', "T.btn('Côte à côte')"],
    ["Pipette sur l'image d'origine", seq("T.btn('Pipette')", click(0.03, 0.03, 0, '.pane.before canvas'))],
    ['Auto + remplissage depuis les bords', seq("T.btn('Résultat')", "T.btn('Auto', '.cutcolor button')", "T.check('Seulement le fond', true)")],
    ['Détourage coupé', "T.check('Supprimer le fond', false)"],
    ['Fond transparent coupé', "T.check('Fond transparent', false)"]
  ],
  'Dégradé': [
    ['Activer', "T.check('Appliquer l', true)"],
    ...DIRS.map((d) => ['Côté : ' + d, `T.el('[aria-label="${d}"]')`]),
    ['Droite, angle 30°', seq("T.el('[aria-label=\"À gauche\"]')", "T.slider('Angle', 30)")],
    ['Position 30 %', "T.slider('Position de la transition', 30)"],
    ['Fondu 0', "T.slider('Largeur du fondu', 0)"],
    ['Fondu 80', "T.slider('Largeur du fondu', 80)"],
    ['Vague', "T.btn('Vague', '.seg.three button')"],
    ['Amplitude 70', "T.slider('Amplitude de la vague', 70)"],
    ['Ondulations 5', "T.slider(\"Nombre d'ondulations\", 5)"],
    ['Décalage 90°', "T.slider('Décalage de la vague', 90)"],
    ['Vague radiale (pétales)', "T.el('[aria-label=\"Au centre (radial)\"]')"],
    ...['Linéaire', 'Effet persistant', 'Effet bref', 'Douce'].map((c) => ['Courbe ' + c, `T.btn('${c}', '.presets button')`]),
    ['Courbe : poignée 1 à la souris', dragHandle(0, 40, 30)],
    ['Courbe : poignée 2 au clavier', seq("document.querySelectorAll('.ce-handle')[1].focus()", key('ArrowUp', 'ArrowUp', 38, 8), key('ArrowLeft', 'ArrowLeft', 37))],
    ['Fondu simple', "T.btn('Fondu simple')"],
    ['Inverser les côtés', "T.check('Inverser les côtés', true)"],
    ['Effet sur la photo, sans inversion', seq("T.btn('Effet sur la photo')", "T.check('Inverser les côtés', false)")],
    ['Courbe libre (tracé d\'exemple)', "T.btn('Courbe libre')"],
    ['Plume : nouveau tracé', "T.btn('Nouveau tracé')"],
    ["Plume : point d'angle", click(0.2, 0.3)],
    ['Plume : point courbe', drag([[0.5, 0.2], [0.55, 0.22], [0.6, 0.25], [0.65, 0.3]])],
    ['Plume : troisième point', click(0.7, 0.6)],
    ['Plume : élastique', hover(0.4, 0.8)],
    ['Plume : Maj contraint à 45°', click(0.75, 0.85, 8)],
    ['Plume : survol du premier point', hover(0.2, 0.3)],
    ['Plume : fermer sur le 1er point', click(0.2, 0.3)],
    ['Plume : clic sur le tracé = ajouter', click(0.5, 0.2)],
    ['Plume : clic sur un point = supprimer', click(0.5, 0.2)],
    ['Outil Sélection (touche A)', key('a', 'KeyA', 65)],
    ['Sélection : déplacer un point', drag([[0.7, 0.6], [0.72, 0.65], [0.76, 0.7]])],
    ['Ctrl+Z', key('z', 'KeyZ', 90, 2)],
    ['Ctrl+Maj+Z', key('Z', 'KeyZ', 90, 2 | 8)],
    ['Bouton annuler', "T.el('.penactions button[aria-label=\"Annuler\"]')"],
    ['Bouton rétablir', "T.el('.penactions button[aria-label=\"Rétablir\"]')"],
    ['Flèche + Maj : décaler', seq(click(0.7, 0.6), key('ArrowRight', 'ArrowRight', 39, 8), key('ArrowDown', 'ArrowDown', 40))],
    ['Double-clic : angle → courbe', dblclick(0.2, 0.3)],
    ['Sélection du point courbe (poignées)', click(0.2, 0.3)],
    ['Alt : casse la symétrie', async (p) => {
      const k = await p.eval("(() => { const k = document.querySelector('.pen-knob'); if (!k) return null; const b = k.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()");
      if (!k) return 'pas de poignée';
      await p.mouse(k[0], k[1], { type: 'down' }); await p.mouse(k[0] + 25, k[1] + 10, { type: 'move', modifiers: 1 }); await p.mouse(k[0] + 40, k[1] + 20, { type: 'move', modifiers: 1 }); await p.mouse(k[0] + 40, k[1] + 20, { type: 'up' });
    }],
    ['Double-clic : courbe → angle', dblclick(0.2, 0.3)],
    ['Suppr', seq(click(0.7, 0.6), key('Delete', 'Delete', 46))],
    ['Outil Ajouter (touche +)', seq(key('+', 'Equal', 187), click(0.45, 0.5))],
    ['Outil Ajouter : clic hors du tracé', click(0.05, 0.95)],
    ['Outil Convertir (Maj+C)', key('C', 'KeyC', 67, 8)],
    ['Convertir : glisser des poignées', drag([[0.2, 0.3], [0.25, 0.32], [0.3, 0.35]])],
    ['Convertir : clic rend anguleux', click(0.2, 0.3)],
    ['Outil Supprimer (touche −)', seq(key('-', 'Minus', 189), click(0.2, 0.3))],
    ['Outil Plume (barre d\'outils)', "T.el('.pentools button[title=\"Plume (P)\"]')"],
    ['Plume : clic dans un tracé fermé', click(0.9, 0.1)],
    ['Échap', key('Escape', 'Escape', 27)],
    ['Ouvrir le tracé', "T.btn('Ouvrir le tracé')"],
    ['Fermer le tracé (bouton)', "T.btn('Fermer le tracé')"],
    ["Tracé d'exemple", 'T.btn("Tracé d\'exemple")'],
    ['Nouveau tracé puis fermer (refus)', seq("T.btn('Nouveau tracé')", "T.btn('Fermer le tracé')")],
    ["Tracé d'exemple, masqué", seq('T.btn("Tracé d\'exemple")', "T.check('Afficher le tracé', false)")],
    ['Tracé affiché', "T.check('Afficher le tracé', true)"],
    ['Vue Curseur : calque plume masqué', "T.btn('Curseur', '.seg.views button')"],
    ['Dégradé désactivé', seq("T.btn('Résultat')", "T.check('Appliquer l', false)")]
  ],
  'Halftone': [
    ['Halftone (points ronds)', "T.btn('Halftone', '.seg.effects button')"],
    ...SHAPES.map((s) => ['Forme ' + s, `T.btn('${s}', '.shapes button')`]),
    ['Grille hexagonale', "T.btn('Hexagonale')"],
    ['Trame 18 px', "T.slider('Taille de la trame', 18)"],
    ['Angle 20°', "T.slider('Angle de la trame', 20)"],
    ['Taille max 140 %', "T.slider('Taille maximale', 140)"],
    ['Taille min 20 %', "T.slider('Taille minimale', 20)"],
    ['Désordre 40 %', "T.slider('Désordre', 40)"],
    ['Grille carrée', "T.btn('Carrée')"],
    ['Lignes (valeurs par défaut)', "T.btn('Lignes', '.seg.three button')"],
    ['Lignes : épaisseurs', seq("T.slider('Épaisseur maximale', 120)", "T.slider('Épaisseur minimale', 10)")],
    ['Lignes : ondulation', seq("T.slider('Ondulation des lignes', 60)", "T.slider(\"Nombre d'ondulations\", 9.5)")],
    ['Pointillisme (valeurs par défaut)', "T.btn('Pointillisme')"],
    ['Pointillisme : taille fixe', "T.check('Points plus gros', false)"],
    ['Pointillisme : espacement 8', seq("T.check('Points plus gros', true)", "T.slider('Espacement des points', 8)")],
    ['CMJN', seq("T.btn('Points', '.seg.three button')", "T.btn('CMJN', '.seg.modes button')")],
    ['CMJN inversé', "T.check('Inverser les tons', true)"],
    ['Retour monochrome', seq("T.check('Inverser les tons', false)", "T.btn('Monochrome')")],
    ['Retour aux caractères', "T.btn('Caractères', '.seg.effects button')"]
  ],
  'Caractères': [
    ['Fraunces', "T.btn('Fraunces', '.seg.fonts button')"],
    ['Corps 9', "T.slider('Taille', 9)"],
    ['Graisse 800', "T.slider('Épaisseur', 800)"],
    ['Approche −1,5', "T.slider('Espacement des caractères', -1.5)"],
    ['Approche +3,5', "T.slider('Espacement des caractères', 3.5)"],
    ['Interligne 140 %', "T.slider('Interligne', 140)"],
    ['Archivo, réglages par défaut', seq("T.btn('Archivo', '.seg.fonts button')", "T.slider('Taille', 12)", "T.slider('Épaisseur', 500)", "T.slider('Espacement des caractères', 0)", "T.slider('Interligne', 100)")],
    ...['detail', 'simple', 'binaire', 'lettres', 'signes', 'classique'].map((id) => ['Jeu ' + id, `T.setValue(document.querySelector('#preset'), '${id}', 'change')`]),
    ['Jeu personnalisé (curseur dans le champ)', "T.setValue(document.querySelector('#preset'), 'perso', 'change'); document.activeElement === document.querySelector('#chars') ? 'focus' : 'pas de focus'"],
    ['Caractères tapés', "T.setValue(document.querySelector('#chars'), ' .oO0@@\\t#')"],
    ['Caractères = un jeu prédéfini', "T.setValue(document.querySelector('#chars'), ' 01')"],
    ['Sans classement', "T.check('Classer', false)"],
    ['Avec classement, jeu classique', seq("T.check('Classer', true)", "T.setValue(document.querySelector('#preset'), 'classique', 'change')")]
  ],
  'Tons': [
    ['Luminosité +40', "T.slider('Luminosité', 40)"],
    ['Contraste −50', "T.slider('Contraste', -50)"],
    ['Inverser', "T.check('Inverser les tons', true)"],
    ['Fond sombre (inversion auto)', seq("T.check('Inverser les tons', false)", "T.btn('Négatif', '.swatch')")],
    ['Tons par défaut', seq("T.slider('Luminosité', 0)", "T.slider('Contraste', 10)", "T.btn('Encre', '.swatch')")]
  ],
  'Couleurs': [
    ...['Négatif', 'Riso bleu', 'Terminal', 'Encre'].map((s) => ['Nuancier ' + s, `T.btn('${s}', '.swatch')`]),
    ['Encre au sélecteur', "T.color('Encre', '#7a1f5c')"],
    ['Fond au sélecteur', "T.color('Fond', '#fff3d6')"],
    ["Couleurs de l'image", "T.btn('Image', '.seg.modes button')"],
    ['Néon (fond passé en noir)', "T.btn('Néon', '.seg.modes button')"],
    ...['Cyber', 'Rose / cyan', 'Acide', 'Braise', 'Glace', 'Violet / jaune'].map((n) => ['Palette ' + n, `T.btn('${n}', '.neon-presets button')`]),
    ['Ombres / milieux / lumières au sélecteur', seq("T.color('Ombres', '#001122')", "T.color('Milieux', '#ff0066')", "T.color('Lumières', '#ccffee')")],
    ['Position des milieux 30 %', "T.slider('Position des milieux', 30)"],
    ["Mélange avec l'image 50 %", "T.slider(\"Couleurs de l'image\", 50)"],
    ['Saturation 220 %, éclat 80 %', seq("T.slider('Saturation', 220)", "T.slider('Éclat des couleurs', 80)")],
    ["Tuile « Couleurs de l'image »", "T.btn(\"Couleurs de l'image\", '.neon-presets button')"],
    ['Palette après 100 % (mélange remis à 0)', "T.btn('Cyber', '.neon-presets button')"],
    ['Fond transparent', "T.check('Fond transparent', true)"],
    ['CMJN en halftone', seq("T.btn('Halftone', '.seg.effects button')", "T.btn('CMJN', '.seg.modes button')")],
    ['Caractères : CMJN repasse en monochrome', "T.btn('Caractères', '.seg.effects button')"],
    ['Couleurs par défaut', seq("T.check('Fond transparent', false)", "T.btn('Encre', '.swatch')")]
  ],
  'Néon & écran': [
    ['Style « Néon numérique »', "T.btn('Appliquer le style')"],
    ['Lueur 150 %, diffusion 15', seq("T.slider('Lueur', 150)", "T.slider('Diffusion de la lueur', 15)")],
    ['Grille 80 %, épaisseur 40', seq("T.slider(\"Grille d'écran\", 80)", "T.slider('Épaisseur de la grille', 40)")],
    ['Grille libre, mailles 11', seq("T.check('Caler la grille', false)", "T.slider('Taille des mailles', 11)")],
    ['Balayage 60 %, écart 7', seq("T.slider('Lignes de balayage', 60)", "T.slider('Écart des lignes', 7)")],
    ['Aberration 4,5', "T.slider('Aberration chromatique', 4.5)"],
    ['Grain 50 %', "T.slider('Grain', 50)"],
    ['Vignettage 70 %', "T.slider('Vignettage', 70)"],
    ['Sur fond transparent', "T.check('Fond transparent', true)"],
    ['Effets sur les caractères', "T.btn('Caractères', '.seg.effects button')"],
    ['Retirer les effets', "T.btn('Retirer les effets')"],
    ['Réglages par défaut', seq("T.check('Fond transparent', false)", "T.check('Caler la grille', true)", "T.btn('Monochrome')", "T.btn('Encre', '.swatch')", "T.slider('Contraste', 10)", "T.slider('Luminosité', 0)")]
  ],
  'Aperçu': [
    ['Côte à côte', "T.btn('Côte à côte')"],
    ['Curseur', "T.btn('Curseur', '.seg.views button')"],
    ['Curseur : glisser', wipeDrag],
    ['Curseur : réglette', "T.setValue(document.querySelector('.wipe-range'), 70)"],
    ['Zoom 100 %', "T.btn('100 %')"],
    ['Côte à côte en 100 %', "T.btn('Côte à côte')"],
    ['Résultat, ajuster', seq("T.btn('Résultat')", "T.btn('Ajuster')")],
    ['Grille très dense (avertissement)', seq("T.slider('Largeur de sortie', 2400)", "T.slider('Taille', 5)")],
    ['Trame très fine (avertissement)', seq("T.btn('Halftone', '.seg.effects button')", "T.slider('Taille de la trame', 4)")],
    ['Réglages par défaut', seq("T.slider('Taille de la trame', 12)", "T.btn('Caractères', '.seg.effects button')", "T.slider('Taille', 12)", "T.slider('Largeur de sortie', 1200)")]
  ],
  'Exports': [
    ...['1', '3', '4', '2'].map((s) => ['Résolution ' + s + '×', `T.setValue(document.querySelector('#scale'), '${s}', 'change')`]),
    ['Export PNG', "T.btn('PNG', '.exports button')"],
    ['Export JPEG', "T.btn('JPEG', '.exports button')"],
    ['Export SVG', "T.btn('SVG', '.exports button')"],
    ['Fenêtre Code (HTML + CSS)', "T.btn('Code', '.exports button')"],
    ['Copier le code', "T.btn('Copier le code')"],
    ['Enregistrer le HTML', perPage("T.btn('Enregistrer', '.sheet button')", "T.btn('Télécharger', '.sheet button')")],
    ['Onglet SVG', "T.btn('SVG en ligne')"],
    ['Enregistrer le SVG', perPage("T.btn('Enregistrer', '.sheet button')", "T.btn('Télécharger', '.sheet button')")],
    ['Onglet texte brut', "T.btn('Texte brut')"],
    ['Copier le texte', "T.btn('Copier le code')"],
    ['Enregistrer le texte', perPage("T.btn('Enregistrer', '.sheet button')", "T.btn('Télécharger', '.sheet button')")],
    ['Échap ferme la fenêtre', key('Escape', 'Escape', 27)],
    ['Halftone + dégradé + transparent : PNG', seq("T.btn('Halftone', '.seg.effects button')", "T.check('Appliquer l', true)", "T.check('Fond transparent', true)", "T.btn('PNG', '.exports button')")],
    ['Halftone : JPEG et SVG', seq("T.btn('JPEG', '.exports button')", "T.btn('SVG', '.exports button')")],
    ['Fenêtre Code en halftone (pas de texte brut)', "T.btn('Code', '.exports button')"],
    ['Enregistrer le HTML halftone', perPage("T.btn('Enregistrer', '.sheet button')", "T.btn('Télécharger', '.sheet button')")],
    ['Clic hors de la fenêtre', "document.querySelector('.sheet').dispatchEvent(new MouseEvent('click', { bubbles: true }))"],
    ['Bouton Fermer', seq("T.btn('Code', '.exports button')", "T.btn('Fermer', '.sheet button')")]
  ]
};

/* ---------- Relevés et comparaison ---------- */
async function settle(p) {
  let last = '', same = 0;
  for (let i = 0; i < 60 && same < 2; i++) {
    await sleep(200);
    const s = await p.eval("T.hash('.pane.after canvas') + document.querySelector('.stats').textContent");
    same = s === last ? same + 1 : 0; last = s;
  }
}
const SNAP = `(() => ({
  'aperçu (résultat)': T.hash('.pane.after canvas'),
  'aperçu (avant)': T.hash('.pane.before canvas'),
  'vignette du détourage': T.hash('.cutthumb canvas'),
  'panneau': T.ui('.controls'),
  'zone d\\'aperçu': T.ui('.stage'),
  'fenêtre Code': T.ui('.sheet'),
  'plume': T.pen(),
  'messages': T.toasts.splice(0),
  'copié': T.copied ? T.copied.length + ' car. ' + T.copied.slice(0, 60) : '',
  'téléchargements': T.downloads.splice(0)
}))()`;

function diffLines(a, b) {
  a = [].concat(a); b = [].concat(b);
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 6; i++) {
    if (a[i] !== b[i]) out.push(`      app : ${a[i] ?? '(rien)'}\n      réf : ${b[i] ?? '(rien)'}`);
  }
  return out.join('\n');
}

// captures d'écran des zones (panneau section par section, en-tête, aperçu)
async function shots(p) {
  await p.mouse(2, 2, { type: 'hover' });
  return p.eval(`(() => {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const st = document.createElement('style'); st.id = 'cmp-shot';
    st.textContent = '.controls{max-height:none!important;overflow:visible!important}*{transition:none!important;caret-color:transparent!important}.bar .project,.bar .appinfo{display:none!important}';
    document.head.append(st);
    for (const f of document.querySelectorAll('.controls .field')) { const l = f.querySelector('label, .name'); if (l && T.skip.some((s) => T.norm(l.textContent).startsWith(s))) f.style.display = 'none'; }
    window.scrollTo(0, 0);
    const zones = [...document.querySelectorAll('.controls .group')].filter(T.shown).map((g) => ['section ' + g.querySelector('h2').textContent, g]);
    zones.push(['en-tête', document.querySelector('.bar')], ['tête de l\\'aperçu', document.querySelector('.stage-head')]);
    const pb = document.querySelector('.penbar'); if (T.shown(pb)) zones.push(['barre plume', pb]);
    return zones.map(([n, el]) => { const b = el.getBoundingClientRect(); return [n, { x: Math.floor(b.left + scrollX), y: Math.floor(b.top + scrollY), width: Math.ceil(b.width), height: Math.ceil(b.height) }]; });
  })()`);
}
const unshot = "document.getElementById('cmp-shot').remove(); for (const f of document.querySelectorAll('.controls .field')) f.style.display = ''";

// nombre de pixels différents entre deux captures (calculé dans le navigateur)
const pixelDiff = (p, a, b) => p.eval(`(async () => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
  const [A, B] = await Promise.all([load('${a.toString('base64')}'), load('${b.toString('base64')}')]);
  if (A.width !== B.width || A.height !== B.height) return 'taille ' + A.width + '×' + A.height + ' / ' + B.width + '×' + B.height;
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const da = px(A), db = px(B); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const ex = [];
  // écart ≤ 2 par canal : bruit d'anticrénelage des coins arrondis, ignoré
  for (let i = 0; i < da.length; i += 4) if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 2) { n++; const k = i / 4, x = k % A.width, y = (k / A.width) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); if (ex.length < 4) ex.push(x + ',' + y + ' ' + [da[i], da[i + 1], da[i + 2]] + '/' + [db[i], db[i + 1], db[i + 2]]); }
  return n ? n + ' px différents, zone ' + x0 + ',' + y0 + ' → ' + x1 + ',' + y1 + ' (' + ex.join(' ; ') + ')' : '';
})()`);

/* ---------- Exécution ---------- */
const args = process.argv.slice(2);
// --gpu : application en rendu carte graphique (aperçu et PNG / JPEG comparés avec tolérance, comme compare:gpu)
const GPU = args.includes('--gpu');
const only = args.filter((a) => !a.startsWith('--'));
const vite = await startVite();
const dl = { app: mkdtempSync(join(tmpdir(), 'glypho-dl-app-')), ref: mkdtempSync(join(tmpdir(), 'glypho-dl-ref-')) };
// rendu canvas 2D forcé (sauf --gpu) : la comparaison avec la référence se fait alors au pixel près
const app = await openPage(vite.url + (GPU ? '' : '?rendu=canvas'), { gpu: GPU });
const ref = await openPage(vite.url + 'reference/glyphotrame-reference.html', { gpu: GPU });
const pages = { app, ref };
rmSync(DIFF_DIR, { recursive: true, force: true });
let total = 0, ko = 0, shotKo = 0;
try {
  for (const [who, p] of Object.entries(pages)) {
    for (let i = 0; i < 50 && !(await p.eval("!!document.querySelector('.stats') && /px/.test(document.querySelector('.stats').textContent)")); i++) await sleep(200);
    await p.eval(PROBE);
    await p.eval(`T.init(${JSON.stringify(SKIP)}, ${JSON.stringify(RENAME)})`);
    await p.allowDownloads(dl[who]);
    await settle(p);
  }
  for (const [section, steps] of Object.entries(SECTIONS)) {
    if (only.length && !only.includes(section)) continue;
    console.log(`\n■ ${section}`);
    for (const [name, action] of steps) {
      total++;
      const res = {};
      for (const [who, p] of Object.entries(pages)) {
        try { res[who] = typeof action === 'string' ? await p.eval(action) : await action(p, who); }
        catch (e) { res[who] = 'ERREUR ' + e.message.split('\n')[0]; }
      }
      await Promise.all(Object.values(pages).map(settle));
      if (/Coller|Glisser/.test(name)) await sleep(1500);
      // exports : on attend que les téléchargements des deux pages soient terminés
      if (/Export|Enregistrer|PNG|JPEG/.test(name)) {
        let last = '', same = 0;
        for (let i = 0; i < 100 && same < 4; i++) {
          await sleep(300);
          const s = JSON.stringify(await Promise.all([app.eval('T.downloads.length'), ref.eval('T.downloads.length')])) + readdirSync(dl.app).join() + '|' + readdirSync(dl.ref).join();
          same = s === last && !/crdownload/.test(s) ? same + 1 : 0; last = s;
        }
      }
      const [a, r] = await Promise.all([app.eval(SNAP), ref.eval(SNAP)]);
      a['retour de l\'action'] = res.app ?? ''; r['retour de l\'action'] = res.ref ?? '';
      if (GPU) {
        // rendu GPU : l'aperçu est comparé avec la tolérance du banc compare:gpu (anticrénelage différent)
        const url = await ref.eval("document.querySelector('.pane.after canvas').toDataURL('image/png')");
        a['aperçu (résultat)'] = await app.eval(`T.cmp({ sel: '.pane.after canvas' }, ${JSON.stringify(url)})`);
        r['aperçu (résultat)'] = 'proche';
      }
      const diffs = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(r[k]));
      if (diffs.length) ko++;
      const msg = [].concat(a.messages).filter(Boolean).join(' / ');
      console.log((diffs.length ? '  ✗ ' : '  ✓ ') + name + (!diffs.length && msg ? `  « ${msg} »` : ''));
      // VERBOSE=1 : statistiques et empreinte de l'aperçu après chaque étape
      if (process.env.VERBOSE) console.log(`      ${a["zone d'aperçu"].find((l) => l.startsWith('texte ')) || ''} · ${a['aperçu (résultat)']}`);
      for (const k of diffs) console.log(`    ${k} :\n${diffLines(a[k], r[k])}`);
      // fichiers téléchargés pendant l'étape : rangés sous le numéro de l'étape (sinon le suivant les écrase)
      for (const d of Object.values(dl)) for (const f of readdirSync(d)) if (!/^\d{3} /.test(f)) renameSync(join(d, f), join(d, `${String(total).padStart(3, '0')} ${f}`));
    }
    // captures d'écran de fin de section
    const za = await shots(app), zr = await shots(ref);
    const names = za.map((z) => z[0]);
    for (const [n, clip] of za) {
      const other = zr.find((z) => z[0] === n);
      if (!other) { console.log(`  ✗ capture ${n} : absente de la référence`); shotKo++; continue; }
      const [ia, ir] = [await app.shot(clip), await ref.shot(other[1])];
      if (ia.equals(ir)) continue;
      const d = await pixelDiff(app, ia, ir);
      if (!d) continue;
      shotKo++;
      mkdirSync(DIFF_DIR, { recursive: true });
      const base = `${section}-${n}`.replace(/[^\w\-]+/g, '_');
      writeFileSync(join(DIFF_DIR, base + '-app.png'), ia); writeFileSync(join(DIFF_DIR, base + '-ref.png'), ir);
      console.log(`  ✗ capture ${n} : ${d}`);
    }
    for (const z of zr) if (!names.includes(z[0])) { console.log(`  ✗ capture ${z[0]} : absente de l'application`); shotKo++; }
    console.log(`  captures : ${za.length} zones comparées`);
    for (const p of Object.values(pages)) await p.eval(unshot);
  }
  // fichiers exportés
  if (!only.length || only.includes('Exports')) {
    console.log('\n■ Fichiers exportés');
    const fa = readdirSync(dl.app).sort(), fr = readdirSync(dl.ref).sort();
    for (const f of new Set([...fa, ...fr])) {
      total++;
      if (!fa.includes(f) || !fr.includes(f)) { ko++; console.log(`  ✗ ${f} : seulement dans ${fa.includes(f) ? "l'application" : 'la référence'}`); continue; }
      const A = readFileSync(join(dl.app, f)), B = readFileSync(join(dl.ref, f));
      if (A.equals(B)) console.log(`  ✓ ${f} (${A.length.toLocaleString('fr-FR')} octets)`);
      else if (GPU && /\.(png|jpg)$/.test(f)) {
        // export rendu par la carte graphique : comparé en pixels, avec tolérance
        const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg', u = (b) => JSON.stringify(`data:${mime};base64,${b.toString('base64')}`);
        const res = await app.eval(`T.cmp(${u(A)}, ${u(B)})`);
        if (res === 'proche') console.log(`  ✓ ${f} (rendu GPU proche de la référence)`);
        else { ko++; console.log(`  ✗ ${f} : ${res}`); }
      }
      else { ko++; console.log(`  ✗ ${f} : ${A.length} / ${B.length} octets`); }
    }
  }
  // réglage propre à l'application : taille max de l'image source (la référence la fixe à 1800 px)
  if (!only.length || only.includes('Taille max')) {
    console.log("\n■ Taille max de l'image source (application seule)");
    const size = "(async () => { const s = (await import('/src/state/renderer.js')).getSource(); return s.raw.width + '×' + s.raw.height; })()";
    const out = "T.norm(T.field(\"Taille max de l'image source\").querySelector('output').textContent).replace(/\\s/g, ' ')";
    const CHECKS = [
      ['Valeur par défaut', null, out, '1 800 px'],
      ['Image collée de 3000 × 2000', 'T.paste(3000, 2000)', size, '1800×1200'],
      ['Taille max 2600', "T.slider(\"Taille max de l'image source\", 2600)", size, '2600×1733'],
      ['Taille max 1000', "T.slider(\"Taille max de l'image source\", 1000)", size, '1000×667'],
      ["Taille max 8000 (jamais d'agrandissement)", "T.slider(\"Taille max de l'image source\", 8000)", size, '3000×2000'],
      ['Affichage de la valeur', null, out, '8 000 px'],
      ["Image d'exemple non concernée", IMG, size, '900×900'],
      ['Retour à 1800', "T.slider(\"Taille max de l'image source\", 1800)", size, '900×900']
    ];
    for (const [name, action, read, expected] of CHECKS) {
      total++;
      if (action) await app.eval(action);
      await sleep(action && /paste/.test(action) ? 2000 : 300);
      await settle(app);
      const got = await app.eval(read);
      if (got === expected) console.log(`  ✓ ${name} : ${got}`);
      else { ko++; console.log(`  ✗ ${name} : ${got} (attendu ${expected})`); }
    }
  }
  // projets (absents de la référence) : enregistrer, modifier, rouvrir → même état, même aperçu
  if (!only.length || only.includes('Projets')) {
    console.log('\n■ Projets (application seule)');
    const check = (name, ok, detail = '') => { total++; if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' : ' + detail : ''}`); };
    const state = "(async () => JSON.stringify((await import('/src/state/index.js')).settings.get()))()";
    const sess = (k) => `(async () => (await import('/src/state/index.js')).session.get()[${JSON.stringify(k)}])()`;
    const projFile = () => readdirSync(dl.app).filter((f) => f.endsWith('.glyphotrame.json')).map((f) => join(dl.app, f));
    for (const f of projFile()) rmSync(f);
    // réglages variés + image collée (sans chemin : elle sera intégrée au fichier)
    await app.eval('T.paste(1300, 900)'); await sleep(1500);
    for (const js of ["T.btn('Halftone', '.seg.effects button')", "T.btn('Étoile', '.shapes button')", "T.slider('Taille de la trame', 15)",
      "T.btn('Néon', '.seg.modes button')", "T.check('Appliquer l', true)", "T.btn('Courbe libre')", "T.slider('Lueur', 70)"]) await app.eval(js);
    await settle(app);
    const before = await app.eval(state), hashBefore = await app.eval("T.hash('.pane.after canvas')");
    check('Projet modifié signalé (•)', await app.eval(sess('dirty')) === true);
    await app.eval("T.btn('Enregistrer', '.project button')");
    for (let i = 0; i < 30 && !projFile().length; i++) await sleep(300);
    const file = projFile()[0];
    check('Projet enregistré (fichier téléchargé)', !!file, file ? file.split(/[\\/]/).pop() : 'aucun fichier');
    check('Plus de modifications en attente', await app.eval(sess('dirty')) === false);
    const text = file ? readFileSync(file, 'utf8') : '{}', json = JSON.parse(text);
    check('Image collée intégrée au fichier', typeof json.image?.donnees === 'string' && json.image.donnees.startsWith('data:image/'), json.image?.nom);
    // modifications, puis réouverture
    for (const js of ["T.btn('Caractères', '.seg.effects button')", "T.slider('Largeur de sortie', 600)", 'T.btn("Image d\'exemple")']) await app.eval(js);
    await settle(app);
    check('Aperçu modifié avant réouverture', (await app.eval("T.hash('.pane.after canvas')")) !== hashBefore);
    await app.eval(`(async () => { const P = await import('/src/state/project.js'), F = await import('/src/state/project-format.js');
      await P.applyProject(F.parseProject(${JSON.stringify(text)}), null, 'test.glyphotrame.json'); })()`);
    await sleep(800); await settle(app);
    const after = await app.eval(state);
    check('Réglages restaurés à l\'identique', after === before, after === before ? '' : 'différents');
    check('Aperçu identique', (await app.eval("T.hash('.pane.after canvas')")) === hashBefore);
    check('Image restaurée', (await app.eval(sess('sourceName'))) === 'colle.png');
    check('Projet ouvert sans modification en attente', await app.eval(sess('dirty')) === false);
    // image d'exemple : simple marque dans le fichier
    for (const f of projFile()) rmSync(f);
    await app.eval('T.btn("Image d\'exemple")'); await settle(app);
    await app.eval("T.btn('Enregistrer', '.project button')");
    for (let i = 0; i < 30 && !projFile().length; i++) await sleep(300);
    const ex = projFile()[0] ? JSON.parse(readFileSync(projFile()[0], 'utf8')) : {};
    check("Image d'exemple enregistrée comme telle", ex.image?.exemple === true && !ex.image?.donnees);

    // projet vidéo : ffmpeg n'existe pas dans le navigateur, les commandes Rust de la vidéo sont simulées
    // (mire de synthèse 640 × 360, 2 s à 30 i/s, un disque qui avance à chaque image)
    const VID = 'C:\\Videos\\mire.mp4', PROJ = 'C:\\Projets\\mire.glyphotrame.json';
    const MOVED_VID = 'D:\\Copie\\Videos\\mire.mp4', MOVED_PROJ = 'D:\\Copie\\Projets\\mire.glyphotrame.json';
    const mock = (allowed) => `(() => {
      const allowed = ${JSON.stringify(allowed)};
      const meta = { largeur: 640, hauteur: 360, duree: 2, cadence: 30, images: 60, rotation: 0, son: true, codec: 'h264' };
      const ok = (p) => { if (!allowed.includes(p)) throw 'Vidéo introuvable : ' + p; };
      window.__TAURI_INTERNALS__ = { requests: [], invoke: async (cmd, a) => {
        if (cmd === 'infos_video') { ok(a.chemin); return meta; }
        if (cmd === 'image_video') {
          ok(a.chemin);
          window.__TAURI_INTERNALS__.requests.push([a.chemin, a.temps]);
          const n = Math.floor(a.temps * 30 + 0.5 + 1e-6), s = Math.min(1, a.tailleMax / 640), w = Math.round(640 * s), h = Math.round(360 * s);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, '#1d3b6a'); g.addColorStop(1, '#f2c14e');
          x.fillStyle = g; x.fillRect(0, 0, w, h);
          x.fillStyle = '#fafafa'; x.beginPath(); x.arc((0.1 + n / 75) * w, h / 2, h / 4, 0, 7); x.fill();
          const px = x.getImageData(0, 0, w, h).data, buf = new ArrayBuffer(8 + px.length), v = new DataView(buf);
          v.setUint32(0, w, true); v.setUint32(4, h, true); new Uint8Array(buf, 8).set(px);
          return buf;
        }
        throw 'Commande non simulée : ' + cmd;
      } };
    })()`;
    const S = "(async () => (await import('/src/state/index.js')).session";
    const sessVideo = `${S}.get())().then((s) => JSON.stringify({ t: s.vTime, i: s.vIn, o: s.vOut, e: s.vExportOpts, v: !!s.video, n: s.sourceName }))`;
    const lastRequest = "JSON.stringify(window.__TAURI_INTERNALS__.requests.at(-1))";
    const V = "(await import('/src/state/video.js'))";
    await app.eval(mock([VID]));
    await app.eval(`(async () => ${V}.loadVideo({ name: 'mire.mp4', path: ${JSON.stringify(VID)} }))()`);
    await settle(app);
    check('Vidéo simulée ouverte', JSON.parse(await app.eval(sessVideo)).v === true);
    for (const js of ["T.btn('Halftone', '.seg.effects button')", "T.btn('CMJN', '.seg.modes button')", "T.slider('Taille de la trame', 10)"]) await app.eval(js);
    // entrée à l'image 12, sortie à l'image 50, tête de lecture à l'image 37, derniers réglages d'export
    const EXPORT = { format: 'webm', taille: 'origine', cadence: 12, plage: 'es', son: false, qualite: 'moyenne' };
    await app.eval(`(async () => { const v = ${V}; v.seekFrame(12); v.setIn(); v.seekFrame(50); v.setOut(); v.seekFrame(37); })()`);
    await app.eval(`(async () => (await import('/src/state/index.js')).session.set({ vExportOpts: ${JSON.stringify(EXPORT)} }))()`);
    await settle(app);
    const vBefore = await app.eval(sessVideo), vState = await app.eval(state), vHash = await app.eval("T.hash('.pane.after canvas')");
    const exp = { t: 37 / 30, i: 12 / 30, o: 50 / 30, e: EXPORT, v: true, n: 'mire.mp4' };
    check('Instant, entrée, sortie et export avant enregistrement', vBefore === JSON.stringify(exp), vBefore);
    const vText = await app.eval(`(async () => (await import('/src/state/project.js')).projectWriter()(${JSON.stringify(PROJ)}))()`);
    const vj = JSON.parse(vText);
    check('Format version 2', vj.version === 2);
    check('Vidéo enregistrée par ses chemins absolu et relatif', vj.image?.video === true && vj.image.chemin === VID && vj.image.relatif === '../Videos/mire.mp4', JSON.stringify(vj.image));
    check('Instant, entrée, sortie et export dans le fichier', JSON.stringify(vj.video) === JSON.stringify({ instant: exp.t, entree: exp.i, sortie: exp.o, export: EXPORT }), JSON.stringify(vj.video));
    // modifications, puis réouverture du dossier copié ailleurs (seul le chemin relatif mène à la vidéo)
    for (const js of ['T.btn("Image d\'exemple")', "T.btn('Caractères', '.seg.effects button')"]) await app.eval(js);
    await app.eval(`${S}.set({ vExportOpts: (await import('/src/state/export-options.js')).defaultExportOptions() }))()`);
    await settle(app);
    await app.eval(mock([MOVED_VID]));
    await app.eval(`(async () => { const P = await import('/src/state/project.js'), F = await import('/src/state/project-format.js');
      await P.applyProject(F.parseProject(${JSON.stringify(vText)}), ${JSON.stringify(MOVED_PROJ)}, 'mire.glyphotrame.json'); })()`);
    await sleep(500); await settle(app);
    check('Vidéo retrouvée par le chemin relatif (dossier déplacé)', JSON.parse(await app.eval(lastRequest) || '[]')[0] === MOVED_VID, await app.eval(lastRequest));
    check('Image de l\'instant demandée directement (image 37)', Math.abs(JSON.parse(await app.eval(lastRequest))[1] - 36.5 / 30) < 1e-9);
    check('Instant, entrée, sortie et export restaurés', (await app.eval(sessVideo)) === vBefore, await app.eval(sessVideo));
    check('Réglages restaurés à l\'identique (vidéo)', (await app.eval(state)) === vState);
    check('Aperçu identique (vidéo)', (await app.eval("T.hash('.pane.after canvas')")) === vHash);
    check('Projet vidéo ouvert sans modification en attente', await app.eval(sess('dirty')) === false);
    // tête de lecture : pas une modification ; entrée / sortie : modification
    await app.eval(`(async () => ${V}.stepFrame(1))()`); await settle(app);
    check('Déplacer la tête de lecture ne modifie pas le projet', await app.eval(sess('dirty')) === false);
    await app.eval(`(async () => ${V}.setIn())()`);
    check("Déplacer l'entrée modifie le projet (•)", await app.eval(sess('dirty')) === true);
    // projet de version 1 avec une vidéo : début de la vidéo, toute la plage, export par défaut
    const v1 = JSON.stringify({ ...vj, version: 1, video: undefined });
    await app.eval(mock([VID]));
    await app.eval(`(async () => { const P = await import('/src/state/project.js'), F = await import('/src/state/project-format.js');
      await P.applyProject(F.parseProject(${JSON.stringify(v1)}), ${JSON.stringify(PROJ)}, 'ancien.glyphotrame.json'); })()`);
    await sleep(500); await settle(app);
    const old = JSON.parse(await app.eval(sessVideo));
    check('Projet vidéo de version 1 : début, toute la plage, export par défaut',
      old.v && old.t === 0 && old.i === 0 && old.o === 2 && JSON.stringify(old.e) === JSON.stringify({ format: 'mp4', taille: 'sortie', cadence: 0, plage: 'tout', son: true, qualite: 'haute' }), JSON.stringify(old));
    check('Réglages du projet de version 1 appliqués', (await app.eval(state)) === vState);
    await app.eval('delete window.__TAURI_INTERNALS__');
    await app.eval('T.btn("Image d\'exemple")'); await settle(app);
    // retour aux réglages par défaut pour la suite
    await app.eval("(async () => { const { settings } = await import('/src/state/index.js'), { defaultSettings } = await import('/src/state/defaults.js'); settings.set(defaultSettings()); })()");
  }
  const errs = [...app.logs.map((l) => 'app ' + l), ...ref.logs.map((l) => 'réf ' + l)];
  console.log(`\n${total - ko}/${total} vérifications identiques · ${shotKo} capture(s) différente(s)` + (errs.length ? `\nConsole :\n${errs.join('\n')}` : ' · console sans erreur'));
} finally {
  await app.close(); await ref.close(); await vite.close();
  for (const d of Object.values(dl)) rmSync(d, { recursive: true, force: true });
}
process.exit(ko || shotKo ? 1 : 0);
