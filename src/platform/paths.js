/* Chemins de fichiers Windows ou Unix, sans dépendance (les boîtes de dialogue rendent des chemins absolus).
   Sous Windows, les noms sont comparés sans tenir compte des majuscules. */

const SEP = /[\\/]+/;
const isWin = (p) => /^[a-zA-Z]:/.test(p) || p.startsWith('\\\\');
// morceaux du chemin ; le premier est '' pour une racine Unix, 'C:' pour un lecteur Windows
const parts = (p) => p.split(SEP).filter((s, i) => i === 0 || s);

export const fileName = (p) => p.split(SEP).pop();

export function dirname(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i <= 0 ? p.slice(0, i + 1) : p.slice(0, i);
}

// chemin de `target` vu depuis le dossier `fromDir`, avec des « / » ; null si autre lecteur
export function relativePath(fromDir, target) {
  const win = isWin(target) || isWin(fromDir);
  const eq = (x, y) => (win ? x.toLowerCase() === y.toLowerCase() : x === y);
  const a = parts(fromDir), b = parts(target);
  if (!a.length || !b.length || !eq(a[0], b[0])) return null;
  let i = 0;
  while (i < a.length && i < b.length && eq(a[i], b[i])) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}

// chemin absolu de `rel` (écrit avec « / » ou « \ ») depuis le dossier `fromDir`
export function resolvePath(fromDir, rel) {
  const sep = isWin(fromDir) ? '\\' : '/';
  const out = parts(fromDir);
  for (const s of rel.split(SEP)) {
    if (!s || s === '.') continue;
    if (s === '..') { if (out.length > 1) out.pop(); } else out.push(s);
  }
  return out.join(sep) || sep;
}
