/* =====================================================================
 * TERRAIN — the high-mountain voxel world, one 40 m section at a time.
 * ---------------------------------------------------------------------
 * The runner is high up on a mountain range. Every section is a ROUTE
 * SEGMENT (route.js) and its terrain is generated FROM the route's
 * walkable regions, so the ground you see is exactly where you can run:
 *
 *   walkable regions   natural ground (grass / gravel / snow / sand),
 *                      on top of the mountain body that goes far down
 *   side 'drop'        a steep stepped cliff falling ~50 m into the
 *                      cloud sea (the valley is far below)
 *   side 'shoulder'    a gentle grassy shoulder with trees, then the drop
 *   side 'wall'        the mountain rises beside you (ledge / pass)
 *   between branches   a peak ('mount') or a deep gorge ('chasm')
 *   tunnel             through the mountain
 *   arch               a natural rock bridge over the void
 *   + medium peaks standing out of the clouds on the open sides
 *
 * Geometry is pure voxel boxes. Materials are SLOTS ('@top', '@cliff'…)
 * filled in per biome (biomes.js -> slots), so one built section serves
 * every biome. Rows are merged along the run to keep vertex counts low.
 *
 * TO ADD A SECTION: add a `sec(key, {...})` line below with the route
 * profiles (from -> to), the two sides and a weight. The route, the
 * terrain, obstacle placement and the fairness check all follow.
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const L = C.CHUNK_LENGTH;
  const DEPTH = -44;                                   // mountain body bottom (hidden in the clouds)
  const q = (v) => Math.round(v * 2) / 2;              // half-block grid
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  function hash(a, b, c = 0) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  const GROUND = { top: '@top', side: '@topside', bottom: '@cliff' };
  const PATCH = { top: '@alt', side: '@topside', bottom: '@cliff' };
  const ROCK = { top: '@cliffTop', side: '@cliff', bottom: '@cliff' };
  const PEAK = { top: '@peak', side: '@cliff', bottom: '@cliff' };
  const BARE = { top: '@cliff', side: '@cliff', bottom: '@cliff' };
  const NOBOTTOM = [false, false, false, true, false, false];

  /* ---------------------------------------------------------------
   * Boxes are collected per 1 m row and merged with identical boxes of
   * the following rows (up to 4 m, so bending stays smooth).
   * ------------------------------------------------------------- */
  class RowBuilder {
    constructor() { this.vb = new VR.VoxelBuilder(); this.open = new Map(); this.cur = new Map(); }
    /** hide: 'L' / 'R' = that side face is hidden behind a taller neighbour */
    box(x0, x1, y0, y1, mat, keepBottom, hide) {
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      const mk = typeof mat === 'string' ? mat : mat.top + '/' + mat.side + '/' + (mat.bottom || '');
      const key = x0.toFixed(2) + '|' + x1.toFixed(2) + '|' + y0.toFixed(2) + '|' + y1.toFixed(2) + '|' + mk + (keepBottom ? '|b' : '') + (hide || '');
      this.cur.set(key, { x0, x1, y0, y1, mat, keepBottom, hide });
    }
    endRow(u) {
      for (const [k, b] of this.open) {
        const c = this.cur.get(k);
        if (c && b.u1 === u && b.u1 - b.u0 < 4) { b.u1 = u + 1; this.cur.delete(k); }
        else {
          // the same box goes on in the next rows: the faces between the two pieces are hidden
          if (c && b.u1 === u) { b.contNext = true; c.contPrev = true; }
          this.flush(b); this.open.delete(k);
        }
      }
      for (const [k, c] of this.cur) { c.u0 = u; c.u1 = u + 1; this.open.set(k, c); }
      this.cur = new Map();
    }
    flush(b) {
      // FACES order: +x, -x, +y, -y, +z (near end), -z (far end)
      const skip = [b.hide === 'R', b.hide === 'L', false, !b.keepBottom, !!b.contPrev, !!b.contNext];
      this.vb.addBox((b.x0 + b.x1) / 2, b.y0, -(b.u0 + b.u1) / 2, b.x1 - b.x0, b.y1 - b.y0, b.u1 - b.u0, b.mat, skip);
    }
    finish() { for (const b of this.open.values()) this.flush(b); this.open.clear(); return this.vb; }
  }

  // ---------------------------------------------------------------- props (baked, slot materials)
  function conifer(vb, x, y, z, h) {
    vb.addBox(x, y, z, 0.7, h, 0.7, '@trunk');
    let w = 3.2, ty = y + 1.6;
    while (w >= 1) {
      vb.addBox(x, ty, z, w, 1.0, w, '@leaf');
      vb.addBox(x, ty + 1.0, z, w * 0.8, 0.22, w * 0.8, '@leafTop');
      ty += 1.15; w -= 0.75;
    }
  }
  function bush(vb, x, y, z, s) { vb.addBox(x, y, z, s, s * 0.75, s, '@leaf'); }
  function stone(vb, x, y, z, s) { vb.addBox(x, y, z, s, s * 0.7, s * 0.9, '@rock'); vb.addBox(x + s * 0.15, y + s * 0.7, z, s * 0.5, s * 0.35, s * 0.5, '@rock'); }
  function pinnacle(vb, x, z, w, top, d) {
    // a medium peak standing out of the cloud sea: broad, stepped, narrowing toward the top
    let y = DEPTH, cw = w, cd = d, i = 0;
    const steps = Math.max(5, Math.round((top - DEPTH) / 4.5));
    const h = (top - DEPTH) / steps;
    for (; i < steps; i++) {
      const last = i === steps - 1;
      const ox = (hash(i, x | 0, z | 0) - 0.5) * cw * 0.15;
      const snow = top > 2 && y + h > top - 8;
      vb.addBox(x + ox, y, z, cw, h, cd, snow ? PEAK : i > steps - 4 ? ROCK : BARE, NOBOTTOM);
      y += h; cw = Math.max(2.5, cw * 0.84); cd = Math.max(2.5, cd * 0.84);
      if (last) break;
    }
  }

  // ---------------------------------------------------------------- side profiles
  /** cells [{d0, d1, y}] going outward from a region edge (d = metres from the edge) */
  function sideCells(kind, u, variant, sideId, endTaper) {
    const out = [];
    const j = (d, k = 1.5) => (hash(u >> 1, (d * 2) | 0, variant * 7 + sideId) - 0.5) * k;
    if (kind === 'drop' || kind === 'shoulder') {
      let d = 0;
      let base = -0.35;
      if (kind === 'shoulder') {
        for (; d < 4; d += 1) out.push({ d0: d, d1: d + 1, y: q(-0.3 - d * 0.32) });
        base = -1.6;
      } else { out.push({ d0: 0, d1: 1, y: -0.35 }); d = 1; }
      const d0 = d;
      while (true) {
        const w = d - d0 < 3 ? 1 : 2;
        const t = d - d0 + w * 0.5;
        const y = q(base - Math.pow(t, 1.4) * 2.2 + j(d));
        if (y < DEPTH + 3) break;
        out.push({ d0: d, d1: d + w, y: Math.min(y, base) });
        d += w;
      }
      return out;
    }
    if (kind === 'wall') {
      // the mountain beside the route: toe, steep rise, a plateau, then down again
      const H = (11 + hash(u >> 2, 3, variant * 5 + sideId) * 11) * (0.6 + 0.4 * endTaper);
      out.push({ d0: 0, d1: 1, y: 0.8 });
      let d = 1, y = 0.8;
      while (y < H) { y = Math.min(H, q(0.8 + Math.pow(d + 0.5, 1.25) * 2.6 + j(d))); out.push({ d0: d, d1: d + 1, y }); d += 1; }
      out.push({ d0: d, d1: d + 2, y: q(H), plateau: true }); d += 2;
      let t = 1;
      while (true) {
        const yy = q(H - Math.pow(t, 1.35) * 3.4 + j(d));
        if (yy < DEPTH + 3) break;
        out.push({ d0: d, d1: d + 2, y: yy }); d += 2; t += 2;
      }
      return out;
    }
    return out;  // 'void': nothing (the arch bridge hangs free)
  }

  /* ---------------------------------------------------------------
   * Build one section (no biome: materials are slots).
   * ------------------------------------------------------------- */
  function buildSection(sec, variant) {
    const rb = new RowBuilder();
    const vb = rb.vb;                         // props go straight in (not merged)
    const R = sec.route;
    const props = [];
    let sideMax = 0;
    for (let u = 0; u < L; u++) {
      const uc = u + 0.5;
      const regs = R.regions(uc);
      const endTaper = smooth(Math.min(u, L - 1 - u) / 7);
      // visible ground covers the region (snapped outward to the half-block grid)
      const vis = regs.map(r => ({ a: Math.floor(r.a * 2) / 2, b: Math.ceil(r.b * 2) / 2 }));
      for (let i = 1; i < vis.length; i++) if (vis[i].a < vis[i - 1].b) vis[i].a = vis[i - 1].b;
      // arch: the deck thins out toward the middle (void below)
      let bodyBottom = DEPTH;
      if (sec.arch && u >= 5 && u < 35) bodyBottom = Math.max(DEPTH, q(-3 - 46 * Math.pow(Math.abs(uc - 20) / 15, 2.4)));
      for (const r of vis) {
        // natural ground: mostly the biome's ground, patches of gravel / rock
        let x = r.a;
        while (x < r.b - 0.01) {
          const x1 = Math.min(r.b, Math.floor(x) + 1);
          const patch = hash(u >> 1, Math.floor(x) + 50, variant) < 0.07;
          let xe = x1;
          // extend while the same material
          while (xe < r.b - 0.01) {
            const p2 = hash(u >> 1, Math.floor(xe) + 50, variant) < 0.07;
            if (p2 !== patch) break;
            xe = Math.min(r.b, Math.floor(xe) + 1);
          }
          rb.box(x, xe, -1.5, 0, patch ? PATCH : GROUND);
          x = xe;
        }
        rb.box(r.a, r.b, bodyBottom, -1.5, BARE, sec.arch && bodyBottom > DEPTH);
      }
      // between branches: a peak or a gorge
      for (let i = 1; i < vis.length; i++) {
        const e1 = vis[i - 1].b, e2 = vis[i].a, g = e2 - e1;
        if (g <= 0.01) continue;
        for (let x = e1; x < e2 - 0.01; x += 1) {
          const x1 = Math.min(e2, x + 1);
          const d = Math.min(x - e1, e2 - x1) + (x1 - x) / 2;
          if (R.gap === 'chasm') {
            const y = d < 0.6 ? -0.35 : q(-1.5 - Math.pow(d, 1.6) * 5);     // a steep, deep gorge
            if (y > DEPTH + 3) rb.box(x, x1, DEPTH, y, d < 1 ? ROCK : BARE);
          } else {
            const y = Math.min(20, q(0.6 + Math.pow(d, 1.15) * 2.7 + (hash(u >> 2, x | 0, variant) - 0.5)));
            rb.box(x, x1, DEPTH, y, y > 11 ? PEAK : d < 1.2 ? BARE : ROCK);
            if (y < 8 && d > 1.4 && d < 3 && (u % 7) === ((x | 0) & 3) && hash(u, x | 0, variant + 3) < 0.5) props.push(['tree', (x + x1) / 2, y, uc]);
          }
        }
      }
      // the two sides
      for (const [sideId, s] of [[0, -1], [1, 1]]) {
        let kind = sec.sides[sideId];
        if (sec.arch && u >= 8 && u < 32) kind = 'void';
        if (kind === 'tunnel') continue;
        const edge = s < 0 ? vis[0].a : vis[vis.length - 1].b;
        const cells = sideCells(kind, u, variant, sideId, endTaper);
        for (const c of cells) {
          const xa = edge + s * c.d0, xb = edge + s * c.d1;
          const mat = c.y > 11 ? PEAK : c.d0 < 1 && kind !== 'wall' ? ROCK : (kind === 'wall' && c.d0 < 2) ? BARE : ROCK;
          const hideInner = kind !== 'wall' && c.d0 >= 1 ? (s < 0 ? 'R' : 'L') : null;
          rb.box(Math.min(xa, xb), Math.max(xa, xb), DEPTH, c.y, mat, false, hideInner);
          sideMax = Math.max(sideMax, Math.abs(edge) + c.d1);
          // trees and rocks: on shoulders, on the plateau of a wall, on high cliff steps
          const px = (xa + xb) / 2;
          if (kind === 'shoulder' && c.d0 >= 1 && c.d0 < 4 && hash(u, c.d0 * 3 + sideId, variant + 11) < 0.11) props.push([hash(u, 9, variant) < 0.65 ? 'tree' : hash(u, 8) < 0.5 ? 'bush' : 'stone', px, c.y, uc]);
          else if (c.plateau && u % 5 === sideId * 2 && hash(u, 4, variant + sideId) < 0.7) props.push(['tree', px, c.y, uc]);
          else if (kind === 'drop' && c.d0 >= 2 && c.y > -14 && hash(u, c.d0 * 5 + sideId, variant + 17) < 0.035) props.push(['tree', px, c.y, uc]);
        }
      }
      rb.endRow(u);
    }
    // tunnel through the mountain
    if (sec.tunnel) buildTunnel(rb, sec, variant);
    for (const [k, x, y, u] of props) {
      if (k === 'tree') conifer(vb, x, y, -u, 4 + Math.floor(hash(u * 3, x * 7, variant) * 3));
      else if (k === 'bush') bush(vb, x, y, -u, 1.2 + hash(u, x) * 0.6);
      else stone(vb, x, y, -u, 0.9 + hash(u, x) * 0.6);
    }
    // medium peaks rising out of the clouds on the open sides
    if (!sec.tunnel) {
      const n = hash(variant, 77, sec.key.length) < 0.45 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const sideId = hash(variant, i, 5) < 0.5 ? 0 : 1;
        if (sec.sides[sideId] === 'wall') continue;
        const s = sideId ? 1 : -1;
        const wd = 30 + hash(variant, i, 9) * 14;
        const x = s * Math.min(44, Math.max(sideMax, 14) + 2 + wd / 2 + hash(variant, i, 6) * 6);   // within the bend range
        const u = 6 + hash(variant, i, 7) * 28;
        const top = -18 + hash(variant, i, 8) * 30;
        pinnacle(vb, x, -u, wd, top, 24 + hash(variant, i, 10) * 10);
      }
    }
    rb.finish();
    return vb;
  }

  function buildTunnel(rb, sec, variant) {
    const vb = rb.vb;
    const regs = sec.route.regions(0);
    const a = Math.floor(regs[0].a * 2) / 2, b = Math.ceil(regs[regs.length - 1].b * 2) / 2;
    const H = 6.2;
    vb.addBox((a + b) / 2, H, -L / 2, b - a + 2.6, 1, L, { top: '@cliffTop', side: '@cliff', bottom: 'dark' });
    for (const s of [-1, 1]) {
      const e = s < 0 ? a : b;
      vb.addBox(e + s * 0.65, -1.5, -L / 2, 1.3, H + 1.5, L, BARE);
      for (let z = -5; z > -L; z -= 10) vb.addBox(e + s * 0.02, 3.1, z, 0.25, 0.6, 0.6, 'lamp');
      // the mountain's flanks around the tunnel
      for (let i = 0; i < 4; i++) vb.addBox(e + s * (1.3 + 3 + i * 6), DEPTH, -L / 2, 6, H + 8 - i * 3 - DEPTH, L, i ? ROCK : BARE, NOBOTTOM);
    }
    // the mountain above
    for (let i = 0; i < 5; i++) {
      const w = (b - a) + 26 - i * 5;
      vb.addBox((a + b) / 2, H + 1 + i * 2.6, -L / 2, w, 2.6, L - i * 2, i >= 3 ? PEAK : ROCK, NOBOTTOM);
    }
    const portal = (z) => {
      vb.addBox((a + b) / 2, H - 0.4, z, b - a + 3.4, 1.8, 1, 'cobble');
      for (const s of [-1, 1]) vb.addBox(s < 0 ? a - 0.9 : b + 0.9, -0.2, z, 1.8, H + 1.5, 1, 'cobble');
    };
    if (sec.tunnel === 'start') portal(-0.5);
    if (sec.tunnel === 'end') portal(-L + 0.5);
  }

  // ---------------------------------------------------------------- sections
  const S = {};
  function sec(key, def) {
    def.key = key;
    def.route = VR.Route.make({ from: def.from, to: def.to, span: def.span });
    def.restricted = def.to !== 'W';
    def.build = (variant) => buildSection(def, variant);
    S[key] = def;
  }
  const D = 'drop', SH = 'shoulder', WL = 'wall';
  // wide ridge -> wide ridge (mission / 1v1 gates appear on these)
  sec('ridge',    { from: 'W', to: 'W', sides: [D, D],   w: () => 4,   turn: true, hill: true, gateable: true });
  sec('saddle',   { from: 'W', to: 'W', sides: [SH, SH], w: () => 2.4, turn: true, hill: true, gateable: true });
  sec('ledge_l',  { from: 'W', to: 'W', sides: [WL, D],  w: () => 1.7, turn: -1, hill: true, gateable: true });
  sec('ledge_r',  { from: 'W', to: 'W', sides: [D, WL],  w: () => 1.7, turn: 1, hill: true, gateable: true });
  sec('pass_w',   { from: 'W', to: 'W', sides: [WL, WL], w: () => 0.9, turn: true, hill: true });
  // narrowing / widening (always gradual, over ~34 m)
  sec('w2m',      { from: 'W', to: 'M', sides: [D, SH],  w: (d) => 1 + d, turn: true, hill: true });
  sec('w2n',      { from: 'W', to: 'N', sides: [D, D],   w: (d) => 0.5 + d * 1.2, turn: true, hill: true });
  sec('m2w',      { from: 'M', to: 'W', sides: [SH, D],  w: () => 2.2, turn: true, hill: true });
  sec('m2n',      { from: 'M', to: 'N', sides: [D, D],   w: (d) => 0.5 + d, turn: true, hill: true });
  sec('n2m',      { from: 'N', to: 'M', sides: [D, SH],  w: () => 1.6, turn: true, hill: true });
  sec('n2w',      { from: 'N', to: 'W', sides: [D, D],   w: () => 1.8, turn: true, hill: true });
  // medium
  sec('ridge_m',  { from: 'M', to: 'M', sides: [SH, D],  w: () => 1.4, turn: true, hill: true });
  sec('ledge_ml', { from: 'M', to: 'M', sides: [WL, D],  w: () => 1.1, turn: -1, hill: true });
  sec('ledge_mr', { from: 'M', to: 'M', sides: [D, WL],  w: () => 1.1, turn: 1, hill: true });
  sec('pass_m',   { from: 'M', to: 'M', sides: [WL, WL], w: () => 1.0, turn: true, hill: true });
  sec('tunnel_start', { from: 'M', to: 'M', sides: ['tunnel', 'tunnel'], tunnel: 'start', w: () => 0, turn: true, hill: false });
  sec('tunnel_end',   { from: 'M', to: 'M', sides: ['tunnel', 'tunnel'], tunnel: 'end', w: () => 0, turn: true, hill: false });
  // narrow: knife-edge ridge, natural rock bridge
  sec('knife',    { from: 'N', to: 'N', sides: [D, D],   w: (d) => 0.8 + d * 0.6, turn: true, hill: true });
  sec('arch',     { from: 'N', to: 'N', sides: [D, D],   arch: true, w: () => 0.7, turn: false, hill: false });
  // two branches around a mountain / over a gorge
  sec('split_m',  { from: 'W', to: 'Fm', sides: [D, D], w: (d) => 0.7 + d, turn: true, hill: false });
  sec('twin_m',   { from: 'Fm', to: 'Fm', sides: [D, D], w: () => 0.8, turn: true, hill: true });
  sec('merge_mw', { from: 'Fm', to: 'W', sides: [D, D], w: () => 1.4, turn: true, hill: false });
  sec('merge_mn', { from: 'Fm', to: 'N', sides: [D, D], w: (d) => 0.6 + d * 0.8, turn: true, hill: false });
  sec('split_c',  { from: 'W', to: 'Fc', sides: [D, D], w: (d) => 0.5 + d, turn: true, hill: false });
  sec('twin_c',   { from: 'Fc', to: 'Fc', sides: [D, D], w: () => 0.8, turn: true, hill: true });
  sec('merge_cw', { from: 'Fc', to: 'W', sides: [D, D], w: () => 1.4, turn: true, hill: false });
  sec('merge_cn', { from: 'Fc', to: 'N', sides: [D, D], w: (d) => 0.6 + d * 0.8, turn: true, hill: false });
  // three branches that converge into one
  sec('split3',   { from: 'W', to: 'Tm', sides: [D, D], w: (d) => 0.4 + d * 0.9, turn: true, hill: false });
  sec('tri',      { from: 'Tm', to: 'Tm', sides: [D, D], w: () => 0.5, turn: true, hill: true });
  sec('merge3n',  { from: 'Tm', to: 'N', sides: [D, D], w: () => 1.4, turn: true, hill: false });
  sec('merge3w',  { from: 'Tm', to: 'W', sides: [D, D], w: () => 1.0, turn: true, hill: false });

  // ---------------------------------------------------------------- per-biome instances
  const prefabCache = {};
  function geoms(secKey, variant) {
    const k = secKey + '_' + variant;
    if (!prefabCache[k]) prefabCache[k] = S[secKey].build(variant + 1).buildGeometries();
    return prefabCache[k];
  }
  function slotMat(key, biomeKey) {
    if (key[0] !== '@') return key;
    const slots = (VR.BIOMES[biomeKey] || VR.BIOMES.mountains).slots;
    return slots[key.slice(1)] || 'stone';
  }
  /** a Group for this section in this biome (geometry shared, materials per biome) */
  function instance(secKey, variant, biomeKey) {
    const g = new THREE.Group();
    for (const { key, geometry } of geoms(secKey, variant)) {
      const m = new THREE.Mesh(geometry, VR.Mat.get(slotMat(key, biomeKey)));
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    }
    return g;
  }

  VR.SECTIONS = S;
  VR.Terrain = {
    VARIANTS: 2,
    DEPTH,
    instance,
    slotMat,
    hasPrefab: (secKey, v) => !!prefabCache[secKey + '_' + v],
    prebuild: (secKey, v) => geoms(secKey, v),
  };
})();
