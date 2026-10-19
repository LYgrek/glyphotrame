/* Shaders GLSL ES 3.00.
   Conventions :
   - coordonnées « appareil » en pixels, origine en haut à gauche de l'image complète (W × H à l'échelle s) ;
   - une « région » = la partie de l'image rendue dans une cible (l'image entière pour l'aperçu,
     une tuile avec ses marges pour les grands exports) ; u_origin = coin haut gauche de la région ;
   - les cibles de rendu suivent la convention GL (ligne 0 en bas) ; les images importées
     (photo, atlas, grain, champ du dégradé) gardent la ligne 0 en haut ;
   - couleurs en alpha prémultiplié, comme le canvas 2D. */

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
// position appareil (relative à la région) → coordonnées de découpe
const CLIP = 'vec4 clip(vec2 p) { return vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0); }\n';

// triangle couvrant toute la cible
export const FULL_VS = HEAD + `
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

/* ---------- Halftone : formes instanciées ---------- */
export const SHAPE_VS = HEAD + `
layout(location = 0) in vec2 a_corner;   // coin du carré, -1 → 1
layout(location = 1) in vec2 a_center;   // centre, unités de la grille
layout(location = 2) in float a_size;    // rayon s de la forme
layout(location = 3) in vec3 a_col;
uniform float u_scale; uniform vec2 u_origin; uniform vec2 u_size; uniform float u_extent;
out vec2 v_local; out float v_px; out vec3 v_col;
${CLIP}
void main() {
  float px = a_size * u_scale;                 // pixels par unité locale
  float R = px * u_extent + 1.0;               // demi-côté du carré englobant (+1 px d'anticrénelage)
  vec2 p = a_center * u_scale - u_origin + a_corner * R;
  v_local = a_corner * R / max(px, 1e-6);
  v_px = px; v_col = a_col;
  gl_Position = clip(p);
}`;

// distance signée à la forme (unités locales), anticrénelage analytique sur 1 pixel
export const SHAPE_FS = HEAD + `
in vec2 v_local; in float v_px; in vec3 v_col;
uniform int u_kind;        // 0 disque, 1 ellipse, 2 polygone
uniform vec2 u_v[12]; uniform int u_n;
uniform vec2 u_ell; uniform vec2 u_rot;
uniform int u_mode;        // 0 couverture, 1 couleur
out vec4 o;
float sdPoly(vec2 p) {
  float d = dot(p - u_v[0], p - u_v[0]); float s = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_n) break;
    int j = i == 0 ? u_n - 1 : i - 1;
    vec2 vi = u_v[i], vj = u_v[j];
    vec2 e = vj - vi, w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}
uniform float u_extent;
float dist(vec2 p) {
  if (u_kind == 0) return length(p) - 1.0;
  if (u_kind == 1) {
    vec2 q = vec2(u_rot.x * p.x + u_rot.y * p.y, -u_rot.y * p.x + u_rot.x * p.y);
    vec2 e = q / u_ell; float k = length(e);
    vec2 g = e / (u_ell * max(k, 1e-6));
    return (k - 1.0) / max(length(g), 1e-6);
  }
  return sdPoly(p);
}
void main() {
  vec2 dx = dFdx(v_local), dy = dFdy(v_local);
  float a;
  if (v_px * u_extent < 12.0) {
    // petite forme (moins de 12 px de rayon) : couverture réelle, mesurée sur 4 × 4 sous-échantillons
    // (la distance au bord seule arrondit les coins des polygones et perd de la surface)
    a = 0.0;
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
      vec2 o = (vec2(i, j) - 1.5) / 4.0;
      a += clamp(0.5 - dist(v_local + o.x * dx + o.y * dy) * v_px * 4.0, 0.0, 1.0);
    }
    a /= 16.0;
  } else a = clamp(0.5 - dist(v_local) * v_px, 0.0, 1.0);
  if (a <= 0.0) discard;
  o = u_mode == 0 ? vec4(a) : vec4(v_col * a, a);
}`;

/* ---------- Halftone : lignes (maillage de triangles) ---------- */
export const MESH_VS = HEAD + `
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec3 a_col;
uniform float u_scale; uniform vec2 u_origin; uniform vec2 u_size;
out vec3 v_col;
${CLIP}
void main() { v_col = a_col; gl_Position = clip(a_pos * u_scale - u_origin); }`;

export const MESH_FS = HEAD + `
in vec3 v_col; uniform int u_mode; out vec4 o;
void main() { o = u_mode == 0 ? vec4(1.0) : vec4(v_col, 1.0); }`;

/* ---------- Encre (couverture) posée sur le calque : par-dessus ou produit (CMJN) ---------- */
export const PLATE_FS = HEAD + `
uniform sampler2D u_cov; uniform sampler2D u_prev; uniform vec3 u_color; uniform int u_op;
out vec4 o;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  float as = texelFetch(u_cov, q, 0).r;
  vec4 d = texelFetch(u_prev, q, 0);
  vec3 cs = u_color * as;
  if (u_op == 0) o = vec4(cs, as) + d * (1.0 - as);
  // produit (multiply) en alpha prémultiplié : cs(1 - ab) + cb(1 - as) + cs·cb
  else o = vec4(cs * (1.0 - d.a) + d.rgb * (1.0 - as) + cs * d.rgb, as + d.a - as * d.a);
}`;

/* ---------- Caractères : glyphes de l'atlas ---------- */
export const GLYPH_VS = HEAD + `
layout(location = 0) in vec2 a_corner;   // 0 → 1
layout(location = 1) in vec2 a_anchor;   // point d'ancrage (centre, milieu), unités de la grille
layout(location = 2) in vec2 a_glyph;    // case de l'atlas (glyphe × niveau de contraste), seuil horizontal du glyphe
layout(location = 3) in vec3 a_col;
uniform float u_scale; uniform vec2 u_origin; uniform vec2 u_size;
uniform vec2 u_cell; uniform vec2 u_pad; uniform float u_phases; uniform float u_cols; uniform vec2 u_atlas; uniform float u_oy;
out vec2 v_uv; out vec3 v_col;
${CLIP}
void main() {
  vec2 a = a_anchor * u_scale - u_origin;
  vec2 base = a; float k = 0.0;
  if (u_phases > 1.0) {
    // même placement que le navigateur : quart de pixel en x (seuils du glyphe), pixel entier en y
    float ox = a_glyph.y, m = floor((a.x - ox) * u_phases);
    k = mod(m, u_phases);
    base.x = (m - k) / u_phases + floor(ox + (k + 0.5) / u_phases);
    base.y = floor(a.y - u_oy) + floor(u_oy + 0.5);
  }
  // calcul en entiers : en flottants, 7.0 / 7.0 peut donner 0,99999994 et tomber dans la mauvaise case
  int cell = int(a_glyph.x * u_phases + k + 0.5), cols = int(u_cols + 0.5);
  vec2 cellPos = vec2(float(cell % cols), float(cell / cols)) * u_cell;
  v_uv = (cellPos + a_corner * u_cell) / u_atlas;
  v_col = a_col;
  gl_Position = clip(base - u_pad + a_corner * u_cell);
}`;

export const GLYPH_FS = HEAD + `
in vec2 v_uv; in vec3 v_col; uniform sampler2D u_tex; out vec4 o;
void main() { float a = texture(u_tex, v_uv).a; if (a <= 0.0) discard; o = vec4(v_col * a, a); }`;

/* ---------- Lueur : réduction (moyenne) puis flou gaussien ---------- */
export const DOWN_FS = HEAD + `
uniform sampler2D u_eff; uniform vec2 u_effOrigin; uniform vec2 u_effSize;
uniform vec2 u_k; uniform vec2 u_j0; uniform vec2 u_gsize;
out vec4 o;
void main() {
  vec2 j = u_j0 + vec2(gl_FragCoord.x - 0.5, u_gsize.y - gl_FragCoord.y - 0.5);
  vec2 d0 = j * u_k, d1 = (j + 1.0) * u_k;
  int n = int(clamp(ceil(u_k.x), 1.0, 8.0)), m = int(clamp(ceil(u_k.y), 1.0, 8.0));
  vec4 acc = vec4(0.0);
  for (int a = 0; a < 8; a++) {
    if (a >= n) break;
    for (int b = 0; b < 8; b++) {
      if (b >= m) break;
      vec2 lp = d0 + (vec2(a, b) + 0.5) / vec2(n, m) * (d1 - d0) - u_effOrigin;
      if (lp.x >= 0.0 && lp.y >= 0.0 && lp.x <= u_effSize.x && lp.y <= u_effSize.y)
        acc += texture(u_eff, vec2(lp.x / u_effSize.x, 1.0 - lp.y / u_effSize.y));
    }
  }
  o = acc / float(n * m);
}`;

export const BLUR_FS = HEAD + `
uniform sampler2D u_tex; uniform vec2 u_dir; uniform float u_w[5];
out vec4 o;
void main() {
  ivec2 size = textureSize(u_tex, 0), q = ivec2(gl_FragCoord.xy);
  vec4 acc = texelFetch(u_tex, q, 0) * u_w[0];
  for (int i = 1; i < 5; i++) {
    ivec2 d = ivec2(u_dir) * i;
    ivec2 a = q + d, b = q - d;
    if (a.x < size.x && a.y < size.y) acc += texelFetch(u_tex, a, 0) * u_w[i];
    if (b.x >= 0 && b.y >= 0) acc += texelFetch(u_tex, b, 0) * u_w[i];
  }
  o = acc;
}`;

/* ---------- Composition : fond, photo, dégradé, calque de l'effet, lueur ---------- */
export const COMPOSE_FS = HEAD + `
uniform vec2 u_origin; uniform vec2 u_size; uniform vec2 u_full;
uniform sampler2D u_eff;
uniform int u_solid; uniform vec3 u_paper;
uniform int u_hasGlow; uniform sampler2D u_glow; uniform vec2 u_glowK; uniform vec2 u_glowJ0; uniform vec2 u_glowSize; uniform float u_glowA;
uniform int u_grad; uniform int u_wMode; uniform int u_radial; uniform int u_wave;
uniform vec2 u_dir; uniform float u_L; uniform float u_Lp; uniform float u_R;
uniform float u_amp; uniform float u_ph; uniform float u_freq; uniform float u_petals;
uniform float u_pos; uniform float u_half; uniform int u_inv; uniform int u_fondu;
uniform sampler2D u_prof; uniform sampler2D u_field; uniform sampler2D u_photo; uniform sampler2D u_masks;
out vec4 o;
// position t le long d'un dégradé droit (linéaire ou radial)
float tAt(vec2 X) {
  vec2 r = X - u_full * 0.5;
  return u_radial == 1 ? length(r) / u_R : (dot(r, u_dir) / u_L + 1.0) * 0.5;
}
float profile(float u) { u = clamp(u, 0.0, 1.0); return texture(u_prof, vec2((u * 256.0 + 0.5) / 257.0, 0.5)).r; }
float uFromT(float t) { if (u_half < 0.001) return t < u_pos ? 0.0 : 1.0; return (t - (u_pos - u_half)) / (2.0 * u_half); }
// poids de l'effet (1 = effet complet, 0 = image d'origine), calculé pour chaque pixel
float weight(vec2 X) {
  if (u_wMode == 1) return texture(u_field, X / u_full).r;
  vec2 r = X - u_full * 0.5; float t;
  if (u_radial == 1) { t = length(r) / u_R; if (u_wave == 1) t += u_amp * sin(u_petals * atan(r.y, r.x) + u_ph); }
  else { t = (dot(r, u_dir) / u_L + 1.0) * 0.5; if (u_wave == 1) t += u_amp * sin(6.283185307 * u_freq * (((r.y * u_dir.x - r.x * u_dir.y) / u_Lp + 1.0) * 0.5) + u_ph); }
  float w = profile(uFromT(t));
  return u_inv == 1 ? 1.0 - w : w;
}
vec4 glowAt(vec2 X) {
  vec2 s = X / u_glowK - u_glowJ0;
  return texture(u_glow, vec2(s.x / u_glowSize.x, 1.0 - s.y / u_glowSize.y));
}
void main() {
  vec2 X = u_origin + vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);   // centre du pixel, coordonnées appareil
  vec4 col = u_solid == 1 ? vec4(u_paper, 1.0) : vec4(0.0);
  vec4 eff = texelFetch(u_eff, ivec2(gl_FragCoord.xy), 0);
  vec4 glow = u_hasGlow == 1 ? glowAt(X) : vec4(0.0);
  if (u_grad == 0) {
    col = eff + col * (1.0 - eff.a);
    if (u_hasGlow == 1) col = min(col + glow * u_glowA, vec4(1.0));        // « lighter »
  } else {
    float mp, mq, mg;
    if (u_wMode == 2) {
      // forme « droite » : les masques suivent les points du dégradé vectoriel (comme le canvas et le SVG)
      float u = (clamp(tAt(X), 0.0, 1.0) * 4095.0 + 0.5) / 4096.0;
      mp = texture(u_masks, vec2(u, 1.0 / 6.0)).r; mq = texture(u_masks, vec2(u, 0.5)).r; mg = texture(u_masks, vec2(u, 5.0 / 6.0)).r;
    } else {
      float w = weight(X);
      mp = u_solid == 1 ? 1.0 : (u_fondu == 1 ? 1.0 - w : clamp(2.0 - 2.0 * w, 0.0, 1.0));
      mq = u_fondu == 1 ? w : clamp(2.0 * w - 1.0, 0.0, 1.0);
      mg = u_fondu == 1 ? w : clamp(2.0 * w, 0.0, 1.0);
    }
    vec4 ph = texture(u_photo, X / u_full) * mp; col = ph + col * (1.0 - ph.a);
    if (u_solid == 1) { vec4 pp = vec4(u_paper, 1.0) * mq; col = pp + col * (1.0 - pp.a); }
    vec4 ef = eff * mg; col = ef + col * (1.0 - ef.a);
    if (u_hasGlow == 1) {
      // dans le calque masqué, les passes de lueur se superposent (« par-dessus ») avant l'ajout
      vec4 acc = glow * min(1.0, u_glowA);
      if (u_glowA > 1.001) { vec4 g2 = glow * (u_glowA - 1.0); acc = g2 + acc * (1.0 - g2.a); }
      col = min(col + acc * mg, vec4(1.0));
    }
  }
  o = col;
}`;

/* ---------- Effets d'écran : aberration chromatique, grille, balayage, vignettage, grain ---------- */
export const FINAL_FS = HEAD + `
uniform sampler2D u_F; uniform vec2 u_Forigin; uniform vec2 u_Fsize;
uniform vec2 u_origin; uniform vec2 u_size; uniform vec2 u_full;
uniform float u_ca; uniform float u_grid; uniform vec2 u_pitch; uniform float u_lw;
uniform float u_scan; uniform float u_scanP; uniform float u_vig;
uniform float u_grain; uniform int u_solid; uniform float u_gscale; uniform sampler2D u_grainTex; uniform vec2 u_grainOff;
uniform int u_unpremul;
out vec4 o;
vec4 F(vec2 X) {
  vec2 l = X - u_Forigin;
  if (l.x < 0.0 || l.y < 0.0 || l.x > u_Fsize.x || l.y > u_Fsize.y) return vec4(0.0);
  return texture(u_F, vec2(l.x / u_Fsize.x, 1.0 - l.y / u_Fsize.y));
}
// part du pixel [x0, x0 + 1] couverte par les bandes [k·pitch, k·pitch + w] (k·pitch < lim)
float band(float x0, float pitch, float w, float lim) {
  float c = 0.0, k0 = max(0.0, floor((x0 - w) / pitch));
  for (int i = 0; i < 4; i++) {
    float a = (k0 + float(i)) * pitch;
    if (a >= lim || a > x0 + 1.0) break;
    c += max(0.0, min(x0 + 1.0, a + w) - max(x0, a));
  }
  return min(c, 1.0);
}
void main() {
  vec2 P = u_origin + vec2(gl_FragCoord.x - 0.5, u_size.y - gl_FragCoord.y - 0.5);   // coin haut gauche du pixel
  vec2 X = P + 0.5;
  vec4 c = F(X);
  if (u_ca > 0.0) {
    // rouge décalé à droite, vert + bleu à gauche (multiply + destination-in, puis « lighter »)
    vec4 s1 = F(X - vec2(u_ca, 0.0)), s2 = F(X + vec2(u_ca, 0.0));
    vec4 rc = vec4(s1.a * (1.0 - s1.a + s1.r), 0.0, 0.0, s1.a);
    vec4 gc = vec4(0.0, s2.a * (1.0 - s2.a + s2.g), s2.a * (1.0 - s2.a + s2.b), s2.a);
    c = min(rc + gc, vec4(1.0));
  }
  // calques noirs « source-atop » : ils assombrissent le contenu sans toucher au fond transparent
  if (u_grid > 0.0) {
    float cx = band(P.x, u_pitch.x, u_lw, u_full.x), cy = band(P.y, u_pitch.y, u_lw, u_full.y);
    c.rgb *= 1.0 - (cx + cy - cx * cy) * u_grid;
  }
  if (u_scan > 0.0) c.rgb *= 1.0 - band(P.y - u_scanP * 0.5, u_scanP, u_scanP * 0.5, u_full.y) * u_scan;
  if (u_vig > 0.0) {
    float R = length(u_full) * 0.5;
    c.rgb *= 1.0 - clamp((length(X - u_full * 0.5) - 0.35 * R) / (0.65 * R), 0.0, 1.0) * u_vig;
  }
  if (u_grain > 0.0) {
    float v = texture(u_grainTex, X / (256.0 * u_gscale) + u_grainOff / 256.0).r;
    if (u_solid == 1) {
      // incrustation (overlay) sur fond plein
      vec3 cb = c.rgb;
      vec3 B = vec3(cb.r <= 0.5 ? 2.0 * v * cb.r : 1.0 - 2.0 * (1.0 - v) * (1.0 - cb.r),
               cb.g <= 0.5 ? 2.0 * v * cb.g : 1.0 - 2.0 * (1.0 - v) * (1.0 - cb.g),
               cb.b <= 0.5 ? 2.0 * v * cb.b : 1.0 - 2.0 * (1.0 - v) * (1.0 - cb.b));
      c.rgb = u_grain * B + (1.0 - u_grain) * cb;
    } else {
      float as = u_grain * 0.4;
      c.rgb = v * as * c.a + c.rgb * (1.0 - as);
    }
  }
  if (u_unpremul == 1 && c.a > 0.0) c.rgb /= c.a;
  o = c;
}`;
