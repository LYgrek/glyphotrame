/* Image source : chargement, réduction, image d'exemple.

   Une « source » est un objet :
     raw    canvas de l'image chargée (déjà réduite à la taille max)
     image  canvas utilisé par l'effet : l'image détourée, ou `raw` sans détourage
     id     change à chaque nouvelle `image` ; sert de clé aux caches du moteur
     name   nom affiché (« photo.jpg »), slug : nom nettoyé pour les exports
     original  image décodée d'origine (pour la réduire à nouveau si la taille max change)
*/
import { createCanvas } from './util.js';
import { SRC_MAX } from './constants.js';

let lastId = 0;

export function createSource(canvas, name, original = null) {
  return { raw: canvas, image: canvas, id: ++lastId, name, slug: slugName(name), original };
}

// même source, nouvelle image utilisée par l'effet (après détourage)
export const withImage = (src, image) => ({ ...src, image, id: ++lastId });

// photo affichée sous le dégradé : l'image détourée si le détourage est actif
export const photoSource = (state, src) => state.cut ? src.image : src.raw;

// pixels de l'image brute, lus une seule fois par image
const rawCache = new WeakMap();
export function getRawData(src) {
  let d = rawCache.get(src.raw);
  if (!d) {
    d = src.raw.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.raw.width, src.raw.height);
    rawCache.set(src.raw, d);
  }
  return d;
}

// nom de fichier nettoyé, sans extension (sert de base aux noms d'export)
export const slugName = (name) => (name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';

/* ---------- Image d'exemple ---------- */
export function makeSample() {
  const c = createCanvas(900, 900);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 900, 900);
  // ombre portée
  x.save(); x.translate(470, 818); x.scale(1, 0.16);
  const sh = x.createRadialGradient(0, 0, 0, 0, 0, 330);
  sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh; x.beginPath(); x.arc(0, 0, 330, 0, Math.PI * 2); x.fill(); x.restore();
  // sphère
  const cx = 450, cy = 430, R = 330;
  const g = x.createRadialGradient(cx - 120, cy - 140, 10, cx, cy, R + 30);
  g.addColorStop(0, '#fffaf0'); g.addColorStop(0.3, '#ffd479'); g.addColorStop(0.68, '#e8604a'); g.addColorStop(1, '#2a1448');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  // méridiens et parallèles
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
  x.strokeStyle = 'rgba(25,10,45,.38)'; x.lineWidth = 9;
  for (let i = 1; i <= 3; i++) { x.beginPath(); x.ellipse(cx, cy, R * Math.sin(i * Math.PI / 8), R, 0, 0, Math.PI * 2); x.stroke(); }
  x.beginPath(); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
  for (let i = -3; i <= 3; i++) {
    const y = cy + i * 90, hw = Math.sqrt(Math.max(0, R * R - (i * 90) ** 2));
    x.beginPath(); x.ellipse(cx, y, hw, hw * 0.16, 0, 0, Math.PI * 2); x.stroke();
  }
  x.restore();
  // reflet
  const hl = x.createRadialGradient(cx - 130, cy - 150, 0, cx - 130, cy - 150, 110);
  hl.addColorStop(0, 'rgba(255,255,255,.9)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hl; x.beginPath(); x.arc(cx - 130, cy - 150, 110, 0, Math.PI * 2); x.fill();
  return c;
}

/* ---------- Chargement d'image ---------- */
// décode un fichier image (Blob avec son type MIME) ; les messages d'erreur sont ceux de la référence
export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || !/^image\//.test(blob.type)) { reject(new Error("Ce fichier n'est pas une image. Choisis un JPEG, PNG, WebP, GIF ou SVG.")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de lire cette image. Essaie un JPEG ou un PNG."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier."));
    reader.readAsDataURL(blob);
  });
}

// copie l'image dans un canvas, réduite pour que son plus grand côté ne dépasse pas maxDim
export function fitImage(img, maxDim = SRC_MAX) {
  let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) { w = 1000; h = 1000; }
  const c = createCanvas();
  const k = Math.min(1, maxDim / Math.max(w, h));
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
