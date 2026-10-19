/* Outils WebGL2 : contexte, programmes, textures, cibles de rendu (simples et multi-échantillonnées). */

// unité de texture réservée à la création des textures
const SCRATCH_UNIT = 7;

export function createGL(canvas) {
  return canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    // le contenu reste lisible après affichage (captures, copie vers un canvas 2D)
    preserveDrawingBuffer: true, powerPreference: 'high-performance'
  });
}

// programme compilé + emplacements des uniformes ({ p, u })
export function program(gl, vsSrc, fsSrc) {
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader : ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  const vs = shader(gl.VERTEX_SHADER, vsSrc), fs = shader(gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programme : ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export function makeTexture(gl, w, h, { internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null } = {}) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + SCRATCH_UNIT);   // ne pas remplacer une texture déjà attachée pour le rendu en cours
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

// image (canvas) → texture, alpha prémultiplié, ligne 0 = haut de l'image ; mip : réductions de qualité
export function imageTexture(gl, image, { mip = false, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + SCRATCH_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

// cible de rendu : texture + framebuffer ({ tex, fbo, w, h })
export function makeTarget(gl, w, h, opts) {
  const tex = makeTexture(gl, w, h, opts);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Cible de rendu incomplète');
  return { tex, fbo, w, h };
}

// cible multi-échantillonnée (anticrénelage des maillages), à résoudre dans une cible simple
export function makeMsaa(gl, w, h, samples) {
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Cible multi-échantillonnée incomplète');
  return { rb, fbo, w, h, msaa: true };
}

export function freeTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
}

export function bindTarget(gl, t, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
  gl.viewport(0, 0, t ? t.w : w, t ? t.h : h);
}

export function clear(gl) {
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function resolve(gl, from, to) {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.fbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.fbo);
  gl.blitFramebuffer(0, 0, from.w, from.h, 0, 0, to.w, to.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}

// modes de mélange : aucun, « par-dessus » (alpha prémultiplié), maximum (union de couvertures)
export function blend(gl, mode) {
  if (!mode) { gl.disable(gl.BLEND); return; }
  gl.enable(gl.BLEND);
  if (mode === 'max') { gl.blendEquation(gl.MAX); return; }
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

export function bindTex(gl, unit, tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}
