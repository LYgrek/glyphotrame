/* Rendu de l'aperçu et des exports PNG / JPEG sur la carte graphique (WebGL2).
   Même entrée que le rendu canvas du moteur (engine/render.js) : une grille calculée par le moteur,
   l'état et la source ; même composition : fond, calque de l'effet, dégradé, lueur, effets d'écran. */
import * as E from '../engine/index.js';
import { createGL, program, makeTexture, imageTexture, makeTarget, makeMsaa, freeTarget, bindTarget, clear, resolve, blend, bindTex } from './gl.js';
import * as S from './shaders.js';
import { halftoneData } from './halftone.js';
import { prepareGlyphs } from './glyphs.js';

const rgb = (hex) => E.hexToRgb(hex).map((v) => v / 255);
// noyau gaussien σ = 1,2 px (filtre « blur(1.2px) » de la lueur du rendu canvas)
const BLUR_W = (() => { const w = [0, 1, 2, 3, 4].map((i) => Math.exp(-i * i / (2 * 1.2 * 1.2))); const sum = w[0] + 2 * (w[1] + w[2] + w[3] + w[4]); return w.map((v) => v / sum); })();
const TILE = 2048;

export class GpuRenderer {
  constructor(canvas) {
    const gl = createGL(canvas);
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl; this.canvas = canvas;
    this.prog = {
      shape: program(gl, S.SHAPE_VS, S.SHAPE_FS),
      mesh: program(gl, S.MESH_VS, S.MESH_FS),
      plate: program(gl, S.FULL_VS, S.PLATE_FS),
      glyph: program(gl, S.GLYPH_VS, S.GLYPH_FS),
      down: program(gl, S.FULL_VS, S.DOWN_FS),
      blur: program(gl, S.FULL_VS, S.BLUR_FS),
      compose: program(gl, S.FULL_VS, S.COMPOSE_FS),
      final: program(gl, S.FULL_VS, S.FINAL_FS)
    };
    this.samples = Math.max(1, Math.min(8, gl.getParameter(gl.MAX_SAMPLES)));
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // triangle plein écran, carré -1 → 1 (formes), carré 0 → 1 (glyphes)
    this.fullVao = this.vao([[new Float32Array([-1, -1, 3, -1, -1, 3]), 2]]);
    this.quadBuf = this.buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.unitBuf = this.buffer(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]));
    this.dummy = makeTexture(gl, 1, 1);
    this.targets = {};
    this.c = {};   // caches : données de la grille, atlas, textures, calque de l'effet, lueur
  }

  /* ---------- Ressources ---------- */
  buffer(data) {
    const { gl } = this, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  // attribs : [[données ou tampon, taille, diviseur?, pas?, décalage?], …] dans l'ordre des emplacements
  vao(attribs) {
    const { gl } = this, v = gl.createVertexArray();
    gl.bindVertexArray(v);
    attribs.forEach(([src, size, div = 0, stride = 0, offset = 0], loc) => {
      const b = src instanceof WebGLBuffer ? src : this.buffer(src);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, div);
    });
    gl.bindVertexArray(null);
    return v;
  }
  target(name, w, h, opts) {
    let t = this.targets[name];
    if (!t || t.w !== w || t.h !== h || !!t.msaa !== !!(opts && opts.msaa)) {
      freeTarget(this.gl, t);
      t = this.targets[name] = opts && opts.msaa ? makeMsaa(this.gl, w, h, this.samples) : makeTarget(this.gl, w, h, opts);
    }
    return t;
  }
  // texture d'une image (photo, grain), recréée seulement quand l'image change
  imageTex(name, image, opts) {
    const c = this.c[name];
    if (c && c.image === image) return c.tex;
    if (c) this.gl.deleteTexture(c.tex);
    const tex = imageTexture(this.gl, image, opts);
    this.c[name] = { image, tex };
    return tex;
  }
  // texture d'un tableau de nombres (1 canal, demi-flottants filtrables)
  floatTex(name, key, w, h, data) {
    const c = this.c[name];
    if (c && c.key === key) return c.tex;
    if (c) this.gl.deleteTexture(c.tex);
    const { gl } = this;
    const tex = makeTexture(gl, w, h, { internal: gl.R16F, format: gl.RED, type: gl.FLOAT, data });
    this.c[name] = { key, tex };
    return tex;
  }
  set(p, values) {
    const { gl } = this;
    for (const [k, v] of Object.entries(values)) {
      const loc = p.u[k];
      if (loc === undefined || loc === null) continue;
      if (Array.isArray(v) || v instanceof Float32Array) {
        if (k === 'u_v') gl.uniform2fv(loc, v);
        else if (k === 'u_w') gl.uniform1fv(loc, v);
        else if (v.length === 2) gl.uniform2fv(loc, v); else gl.uniform3fv(loc, v);
      } else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
      else if (v && v.int !== undefined) gl.uniform1i(loc, v.int);
      else gl.uniform1f(loc, v);
    }
  }
  fullPass() { const { gl } = this; gl.bindVertexArray(this.fullVao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  /* ---------- Rendu ---------- */
  // aperçu : dessine dans le canvas du renderer (redimensionné à la taille de la grille × s)
  draw(g, state, src, s, opaque, maxDim = 1400) {
    const W = Math.max(1, Math.round(g.W * s)), H = Math.max(1, Math.round(g.H * s));
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    const job = this.job(g, state, src, s, opaque, maxDim, W, H, 0, 0, W, H);
    this.region(job, null, { x: 0, y: 0, w: W, h: H }, false);
  }

  // export PNG / JPEG à state.scale, rendu par tuiles (avec marges pour la lueur et l'aberration)
  renderBlob(g, state, src, type) {
    const s = state.scale, opaque = type === 'jpeg';
    const W = Math.max(1, Math.round(g.W * s)), H = Math.max(1, Math.round(g.H * s));
    const margin = Math.ceil((state.fxChroma > 0 ? state.fxChroma * s : 0) + (state.fxGlow > 0 ? 3 * state.fxGlowR * s + 8 : 0)) + 2;
    const out = E.createCanvas(W, H), ctx = out.getContext('2d');
    const { gl } = this;
    for (let ty = 0; ty < H; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
      const core = { x: tx, y: ty, w: Math.min(TILE, W - tx), h: Math.min(TILE, H - ty) };
      const rx = Math.max(0, tx - margin), ry = Math.max(0, ty - margin);
      const rw = Math.min(W, tx + core.w + margin) - rx, rh = Math.min(H, ty + core.h + margin) - ry;
      const job = this.job(g, state, src, s, opaque, 1400, W, H, rx, ry, rw, rh);
      const t = this.target('tile', core.w, core.h);
      this.region(job, t, core, true);
      const px = new Uint8Array(core.w * core.h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.readPixels(0, 0, core.w, core.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // lignes de bas en haut → image de haut en bas
      const img = new ImageData(core.w, core.h), row = core.w * 4;
      for (let y = 0; y < core.h; y++) img.data.set(px.subarray((core.h - 1 - y) * row, (core.h - y) * row), y * row);
      ctx.putImageData(img, tx, ty);
    }
    return new Promise((r) => out.toBlob(r, opaque ? 'image/jpeg' : 'image/png', 0.92));
  }

  job(g, state, src, s, opaque, maxDim, W, H, rx, ry, rw, rh) {
    return { g, state, src, s, solid: opaque || !state.transparent, maxDim, W, H, rx, ry, rw, rh };
  }

  region(job, out, core, unpremul) {
    const eff = this.effect(job);
    const glow = job.state.fxGlow > 0 ? this.glow(job, eff) : null;
    const F = this.compose(job, eff, glow);
    this.final(job, F, out, core, unpremul);
  }

  /* ---------- Calque de l'effet (caché tant que la grille, l'échelle et la région ne changent pas) ---------- */
  effect(job) {
    const { g, s, rx, ry, rw, rh } = job;
    const key = [s, rx, ry, rw, rh].join(',');
    if (this.c.eff && this.c.eff.g === g && this.c.eff.key === key) return this.c.eff.t;
    const t = g.kind === 'halftone' ? this.halftone(job) : this.glyphs(job);
    this.c.eff = { g, key, t, version: (this.c.eff ? this.c.eff.version : 0) + 1 };
    return t;
  }

  halftone(job) {
    const { gl } = this, { g, state, rw, rh } = job;
    if (!this.c.ht || this.c.ht.g !== g) {
      if (this.c.ht) this.c.ht.plates.forEach((p) => { gl.deleteVertexArray(p.vao); p.bufs.forEach((b) => gl.deleteBuffer(b)); });
      const plates = halftoneData(g).map((p) => {
        if (p.mesh) { const b = this.buffer(p.mesh.data); return { ...p, bufs: [b], vao: this.vao([[b, 2, 0, 20, 0], [b, 3, 0, 20, 8]]) }; }
        const b = this.buffer(p.inst);
        return { ...p, bufs: [b], vao: this.vao([[this.quadBuf, 2], [b, 2, 1, 24, 0], [b, 1, 1, 24, 8], [b, 3, 1, 24, 12]]) };
      });
      this.c.ht = { g, plates };
    }
    const lines = g.type === 'lignes';
    let cur = this.target('effA', rw, rh), next = this.target('effB', rw, rh);
    bindTarget(gl, cur); blend(gl, null); clear(gl);
    for (const pl of this.c.ht.plates) {
      if (g.color && !g.cmyk) {
        // couleurs de l'image : chaque élément par-dessus les précédents, dans l'ordre
        if (lines) { const ms = this.target('ms', rw, rh, { msaa: true }); bindTarget(gl, ms); clear(gl); blend(gl, 'over'); this.drawMesh(job, pl, 1); resolve(gl, ms, cur); }
        else { bindTarget(gl, cur); blend(gl, 'over'); this.drawShapes(job, pl, 1); }
        continue;
      }
      // encre unie : couverture (union des formes) puis pose de l'encre par-dessus ou en produit (CMJN)
      const cov = this.target('cov', rw, rh);
      if (lines) { const ms = this.target('ms', rw, rh, { msaa: true }); bindTarget(gl, ms); clear(gl); blend(gl, 'max'); this.drawMesh(job, pl, 0); resolve(gl, ms, cov); }
      else { bindTarget(gl, cov); clear(gl); blend(gl, 'max'); this.drawShapes(job, pl, 0); }
      bindTarget(gl, next); blend(gl, null);
      const p = this.prog.plate; gl.useProgram(p.p);
      bindTex(gl, 0, cov.tex); bindTex(gl, 1, cur.tex);
      this.set(p, { u_cov: { int: 0 }, u_prev: { int: 1 }, u_color: rgb(g.cmyk ? pl.color : state.ink), u_op: { int: g.cmyk ? 1 : 0 } });
      this.fullPass();
      [cur, next] = [next, cur];
    }
    return cur;
  }
  drawShapes(job, pl, mode) {
    if (!pl.count) return;
    const { gl } = this, p = this.prog.shape, sh = pl.shape;
    gl.useProgram(p.p);
    this.set(p, {
      u_scale: job.s, u_origin: [job.rx, job.ry], u_size: [job.rw, job.rh], u_extent: sh.extent,
      u_kind: { int: sh.kind }, u_n: { int: sh.n || 0 }, u_v: sh.v || new Float32Array(24),
      u_ell: sh.ell || [1, 1], u_rot: sh.rot || [1, 0], u_mode: { int: mode }
    });
    gl.bindVertexArray(pl.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, pl.count);
  }
  drawMesh(job, pl, mode) {
    if (!pl.mesh.count) return;
    const { gl } = this, p = this.prog.mesh;
    gl.useProgram(p.p);
    this.set(p, { u_scale: job.s, u_origin: [job.rx, job.ry], u_size: [job.rw, job.rh], u_mode: { int: mode } });
    gl.bindVertexArray(pl.vao);
    gl.drawArrays(gl.TRIANGLES, 0, pl.mesh.count);
  }

  glyphs(job) {
    const { gl } = this, { g, state, s, rw, rh } = job;
    const color = E.perCell(state);
    // atlas + instances, refaits quand la grille, l'échelle, la police ou les couleurs changent
    const key = [color, state.ink, state.font, state.weight, state.size, s].join('|');
    if (!this.c.gl || this.c.gl.g !== g || this.c.gl.key !== key) {
      if (this.c.gl) { gl.deleteVertexArray(this.c.gl.vao); gl.deleteBuffer(this.c.gl.buf); gl.deleteTexture(this.c.gl.tex); }
      const d = prepareGlyphs(state, g, s, color, rgb(state.ink), this.maxTex);
      const buf = this.buffer(d.inst), a = d.atlas;
      this.c.gl = {
        g, key, count: d.count, buf, atlas: a,
        tex: imageTexture(gl, a.canvas, { filter: a.P > 1 ? gl.NEAREST : gl.LINEAR }),
        vao: this.vao([[this.unitBuf, 2], [buf, 2, 1, 28, 0], [buf, 2, 1, 28, 8], [buf, 3, 1, 28, 16]])
      };
    }
    const d = this.c.gl, a = d.atlas, t = this.target('effA', rw, rh);
    bindTarget(gl, t); clear(gl); blend(gl, 'over');
    if (d.count) {
      const p = this.prog.glyph;
      gl.useProgram(p.p);
      bindTex(gl, 0, d.tex);
      this.set(p, {
        u_tex: { int: 0 }, u_scale: s, u_origin: [job.rx, job.ry], u_size: [rw, rh],
        u_cell: [a.cellW, a.cellH], u_pad: [a.padL, a.padT], u_phases: a.P, u_cols: a.cols,
        u_atlas: [a.canvas.width, a.canvas.height], u_oy: a.oy
      });
      gl.bindVertexArray(d.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, d.count);
    }
    return t;
  }

  /* ---------- Lueur : calque de l'effet réduit (moyenne), flouté, puis agrandi à la composition ---------- */
  glow(job, eff) {
    const { gl } = this, { state, s, W, H, rx, ry, rw, rh } = job;
    const k = Math.max(1, state.fxGlowR * s / 2);
    const sw = Math.max(1, Math.round(W / k)), sh = Math.max(1, Math.round(H / k));
    const kx = W / sw, ky = H / sh;
    const j0 = Math.max(0, Math.floor(rx / kx)), i0 = Math.max(0, Math.floor(ry / ky));
    const gw = Math.max(1, Math.min(sw, Math.ceil((rx + rw) / kx)) - j0), gh = Math.max(1, Math.min(sh, Math.ceil((ry + rh) / ky)) - i0);
    const res = { k: [kx, ky], j0: [j0, i0], size: [gw, gh] };
    const key = [this.c.eff.version, kx, ky, j0, i0, gw, gh].join(',');
    if (this.c.glow && this.c.glow.key === key) return { ...res, tex: this.c.glow.tex };
    const a = this.target('glowA', gw, gh), b = this.target('glowB', gw, gh);
    blend(gl, null);
    bindTarget(gl, a);
    let p = this.prog.down; gl.useProgram(p.p); bindTex(gl, 0, eff.tex);
    this.set(p, { u_eff: { int: 0 }, u_effOrigin: [rx, ry], u_effSize: [rw, rh], u_k: [kx, ky], u_j0: [j0, i0], u_gsize: [gw, gh] });
    this.fullPass();
    p = this.prog.blur; gl.useProgram(p.p);
    bindTarget(gl, b); bindTex(gl, 0, a.tex); this.set(p, { u_tex: { int: 0 }, u_dir: [1, 0], u_w: BLUR_W }); this.fullPass();
    bindTarget(gl, a); bindTex(gl, 0, b.tex); this.set(p, { u_dir: [0, 1] }); this.fullPass();
    this.c.glow = { key, tex: a.tex };
    return { ...res, tex: a.tex };
  }

  /* ---------- Composition ---------- */
  compose(job, eff, glow) {
    const { gl } = this, { state, src, s, W, H, rx, ry, rw, rh } = job;
    const F = this.target('F', rw, rh);
    bindTarget(gl, F); blend(gl, null);
    const p = this.prog.compose; gl.useProgram(p.p);
    for (let i = 0; i < 6; i++) bindTex(gl, i, this.dummy);
    bindTex(gl, 0, eff.tex);
    const u = {
      u_origin: [rx, ry], u_size: [rw, rh], u_full: [W, H], u_eff: { int: 0 },
      u_glow: { int: 1 }, u_prof: { int: 2 }, u_field: { int: 3 }, u_photo: { int: 4 },
      u_solid: job.solid, u_paper: rgb(state.paper), u_hasGlow: !!glow, u_grad: state.grad
    };
    if (glow) { bindTex(gl, 1, glow.tex); Object.assign(u, { u_glowK: glow.k, u_glowJ0: glow.j0, u_glowSize: glow.size, u_glowA: state.fxGlow / 100 }); }
    if (state.grad) {
      const curve = state.gCurve, ckey = curve.join(',');
      const lut = new Float32Array(257); for (let i = 0; i <= 256; i++) lut[i] = E.profile(curve, i / 256);
      bindTex(gl, 2, this.floatTex('prof', ckey, 257, 1, lut));
      const libre = state.gShape === 'libre';
      if (libre) {
        const f = E.weightField(state, W, H, job.maxDim);
        bindTex(gl, 3, this.floatTex('field', f, f.mw, f.mh, f.f));
      }
      bindTex(gl, 4, this.imageTex('photo', E.photoSource(state, src), { mip: true }));
      const vector = E.isVector(state);
      if (vector) {
        // masques photo / papier / effet le long du dégradé : interpolation linéaire entre les points,
        // comme un dégradé canvas ou SVG (lignes de la table : photo, papier, effet)
        const m = E.gradMasks(state, job.solid);
        const rows = [m.photo, m.paper, m.glyph].map((fn) => (fn === E.ONE ? null : fn ? E.maskStops(state, fn) : []));
        const key = JSON.stringify(rows);
        const N = 4096, data = new Float32Array(N * 3);
        rows.forEach((stops, r) => {
          for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            let a;
            if (stops === null) a = 1;
            else if (!stops.length) a = 0;
            else if (t <= stops[0].t) a = stops[0].a;
            else if (t >= stops[stops.length - 1].t) a = stops[stops.length - 1].a;
            else {
              let j = 1; while (stops[j].t < t) j++;
              const s0 = stops[j - 1], s1 = stops[j];
              a = s1.t > s0.t ? s0.a + (s1.a - s0.a) * (t - s0.t) / (s1.t - s0.t) : s1.a;
            }
            data[r * N + i] = a;
          }
        });
        bindTex(gl, 5, this.floatTex('masks', key, N, 3, data));
      }
      const th = state.gAngle * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th);
      Object.assign(u, {
        u_masks: { int: 5 },
        u_wMode: { int: libre ? 1 : vector ? 2 : 0 }, u_radial: state.gType === 'radial', u_wave: state.gShape === 'vague',
        u_dir: [dx, dy], u_L: (Math.abs(W * dx) + Math.abs(H * dy)) / 2 || 1, u_Lp: (Math.abs(W * dy) + Math.abs(H * dx)) / 2 || 1,
        u_R: Math.hypot(W, H) / 2, u_amp: state.gAmp / 100 * 0.25, u_ph: state.gPhase * Math.PI / 180,
        u_freq: state.gFreq, u_petals: Math.max(1, Math.round(state.gFreq)),
        u_pos: state.gPos / 100, u_half: state.gSoft / 200, u_inv: state.gInvert, u_fondu: state.gStyle === 'fondu'
      });
    }
    this.set(p, u);
    this.fullPass();
    return F;
  }

  final(job, F, out, core, unpremul) {
    const { gl } = this, { state, g, s, W, H, rx, ry, rw, rh } = job;
    if (out) bindTarget(gl, out); else bindTarget(gl, null, W, H);
    blend(gl, null);
    const p = this.prog.final; gl.useProgram(p.p);
    bindTex(gl, 0, F.tex);
    bindTex(gl, 1, this.imageTex('grain', E.getGrainTile(), { wrap: gl.REPEAT }));
    const [px, py] = E.gridPitch(state, g).map((v) => v * s);
    this.set(p, {
      u_F: { int: 0 }, u_grainTex: { int: 1 }, u_Forigin: [rx, ry], u_Fsize: [rw, rh],
      u_origin: [core.x, core.y], u_size: [core.w, core.h], u_full: [W, H],
      u_ca: state.fxChroma > 0 ? state.fxChroma * s : 0,
      u_grid: state.fxGrid / 100, u_pitch: [px, py], u_lw: Math.max(1, Math.min(px, py) * state.fxGridW / 100),
      u_scan: state.fxScan / 100, u_scanP: state.fxScanGap * s, u_vig: state.fxVig / 100,
      u_grain: state.fxGrain / 100, u_solid: job.solid, u_gscale: Math.max(1, s), u_unpremul: !!unpremul
    });
    this.fullPass();
  }

  // libère les ressources (lose : rend aussi le contexte, pour un renderer d'export jetable)
  dispose(lose = false) {
    const { gl } = this;
    for (const t of Object.values(this.targets)) freeTarget(gl, t);
    for (const p of Object.values(this.prog)) gl.deleteProgram(p.p);
    for (const c of Object.values(this.c)) if (c && c.tex) gl.deleteTexture(c.tex);
    this.targets = {}; this.c = {};
    if (lose) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  }
}

// renderer sur ce canvas, ou null si WebGL2 n'est pas disponible
export function createGpuRenderer(canvas) {
  try { return new GpuRenderer(canvas); } catch (e) { console.warn('Rendu GPU indisponible :', e.message); return null; }
}

// export PNG / JPEG par la carte graphique (contexte dédié, libéré ensuite) ; null si impossible
export async function gpuRenderBlob(g, state, src, type) {
  const r = createGpuRenderer(E.createCanvas(1, 1));
  if (!r) return null;
  try { return await r.renderBlob(g, state, src, type); }
  finally { r.dispose(true); }
}
