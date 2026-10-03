/* =====================================================================
 * VOXEL ENGINE
 *  - VR.Tex   : procedural 16x16 pixel textures (no image files needed)
 *  - VR.Mat   : cached materials (one per texture + tint)
 *  - VR.VoxelBuilder : collects boxes and merges them into ONE mesh per
 *    material, so a whole tree / rock / mountain section costs a few draw calls.
 *
 * To use real texture files later, replace the painter for a key in
 * PAINTERS with an image load; everything else keeps working.
 * ===================================================================== */
(function () {
  const T = THREE;
  const PX = 16;

  // Small deterministic RNG so textures look identical every launch.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
  function shade(c, f) {
    const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f));
    const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f));
    const b = Math.min(255, Math.max(0, (c & 255) * f));
    return (r << 16) | (g << 8) | b;
  }

  // Painter helpers ---------------------------------------------------
  function noise(ctx, base, amt, r, seedMix) {
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
      ctx.fillStyle = hex(shade(base, 1 - amt + r() * amt * 2));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  function speckle(ctx, colors, count, r) {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = hex(colors[(r() * colors.length) | 0]);
      ctx.fillRect((r() * PX) | 0, (r() * PX) | 0, 1, 1);
    }
  }

  const PAINTERS = {
    grass_top(c, r) { noise(c, 0x5fae3a, 0.14, r); speckle(c, [0x4c9530, 0x78c64b], 40, r); },
    grass_side(c, r) {
      noise(c, 0x8a5a33, 0.14, r); speckle(c, [0x6e4526, 0x9e6c43], 30, r);
      for (let x = 0; x < PX; x++) {
        const h = 3 + ((r() * 3) | 0);
        for (let y = 0; y < h; y++) { c.fillStyle = hex(shade(0x5fae3a, 0.85 + r() * 0.3)); c.fillRect(x, y, 1, 1); }
      }
    },
    dirt(c, r) { noise(c, 0x8a5a33, 0.15, r); speckle(c, [0x6e4526, 0xa6774c], 40, r); },
    stone(c, r) { noise(c, 0x8b8d90, 0.1, r); speckle(c, [0x6f7174, 0xa3a5a8], 50, r); },
    cobble(c, r) {
      noise(c, 0x7c7e82, 0.12, r);
      c.fillStyle = hex(0x55575b);
      for (let i = 0; i < 9; i++) { c.fillRect((r() * 16) | 0, (r() * 16) | 0, 3 + ((r() * 3) | 0), 1); c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 3); }
    },
    gravel(c, r) { noise(c, 0x7d746c, 0.2, r); speckle(c, [0x5b534c, 0x9c948b, 0x6d6862], 90, r); },
    planks(c, r) {
      noise(c, 0xa87a45, 0.08, r);
      c.fillStyle = hex(0x7a5530);
      for (let y = 3; y < 16; y += 4) c.fillRect(0, y, 16, 1);
      for (let y = 0; y < 16; y += 4) c.fillRect(((y * 7) % 16), y, 1, 3);
    },
    log(c, r) {
      noise(c, 0x6b4f2f, 0.1, r);
      c.fillStyle = hex(0x4f3a22);
      for (let x = 1; x < 16; x += 3) c.fillRect(x, 0, 1, 16);
    },
    leaves(c, r) { noise(c, 0x3f8a2b, 0.22, r); speckle(c, [0x2d6b1e, 0x57a83a, 0x2a5e1b], 70, r); },
    pine(c, r) { noise(c, 0x2f6a3a, 0.2, r); speckle(c, [0x224f2b, 0x3c7f47], 70, r); },
    sand(c, r) { noise(c, 0xe0cf8f, 0.07, r); speckle(c, [0xcdb976, 0xefe0a6], 40, r); },
    sandstone(c, r) { noise(c, 0xd8c285, 0.06, r); c.fillStyle = hex(0xbea66a); c.fillRect(0, 4, 16, 1); c.fillRect(0, 11, 16, 1); },
    snow(c, r) { noise(c, 0xf2f6fa, 0.04, r); speckle(c, [0xdfe7ef], 20, r); },
    snow_side(c, r) {
      noise(c, 0x8a5a33, 0.14, r);
      for (let x = 0; x < PX; x++) { const h = 3 + ((r() * 3) | 0); for (let y = 0; y < h; y++) { c.fillStyle = hex(0xf2f6fa); c.fillRect(x, y, 1, 1); } }
    },
    ice(c, r) { noise(c, 0x9cc8f0, 0.06, r); c.fillStyle = hex(0xc9e4fb); c.fillRect(3, 3, 5, 1); c.fillRect(9, 10, 4, 1); },
    water(c, r) { noise(c, 0x2f6fc4, 0.1, r); speckle(c, [0x4f8fe0, 0x245aa8], 40, r); },
    brick(c, r) {
      noise(c, 0x9c4d3a, 0.1, r);
      c.fillStyle = hex(0xc9b8a8);
      for (let y = 0; y < 16; y += 4) { c.fillRect(0, y, 16, 1); for (let x = (y % 8 ? 0 : 4); x < 16; x += 8) c.fillRect(x, y, 1, 4); }
    },
    wall(c, r) { noise(c, 0xe8dcc4, 0.05, r); speckle(c, [0xd8ccb2], 20, r); },
    roof(c, r) { noise(c, 0x8f3b2c, 0.1, r); c.fillStyle = hex(0x6d2a1f); for (let y = 1; y < 16; y += 3) c.fillRect(0, y, 16, 1); },
    metal(c, r) {                                     // tinted per use (mission props)
      noise(c, 0xe6e6e6, 0.05, r);
      c.fillStyle = hex(0xbdbdbd);
      c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16);
      c.fillStyle = hex(0xd0d0d0); c.fillRect(7, 2, 1, 12);
      c.fillStyle = hex(0x9e9e9e); c.fillRect(3, 4, 1, 1); c.fillRect(12, 4, 1, 1); c.fillRect(3, 11, 1, 1); c.fillRect(12, 11, 1, 1);
    },
    iron(c, r) { noise(c, 0x9da3ab, 0.06, r); c.fillStyle = hex(0xc8ced6); c.fillRect(0, 2, 16, 2); },
    void(c, r) {                                      // the inside of a crevice
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { c.fillStyle = hex(shade(0x0d1016, 0.8 + r() * 0.5)); c.fillRect(x, y, 1, 1); }
      c.fillStyle = hex(0x2a2f3a); c.fillRect(0, 0, 16, 1);
    },
    dark(c, r) { noise(c, 0x33312f, 0.15, r); speckle(c, [0x24221f, 0x44403c], 40, r); },
    glass(c, r) { noise(c, 0xa9d3ee, 0.03, r); c.fillStyle = hex(0xffffff); c.fillRect(0, 0, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(3, 3, 3, 1); },
    hazard(c, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        c.fillStyle = hex(((x + y) >> 2) % 2 ? 0x2a2a2a : 0xf2c230); c.fillRect(x, y, 1, 1);
      }
    },
    hay(c, r) { noise(c, 0xd9b340, 0.12, r); c.fillStyle = hex(0x9c3b20); c.fillRect(0, 4, 16, 1); c.fillRect(0, 11, 16, 1); },
    lamp(c, r) { noise(c, 0xffe29a, 0.08, r); c.fillStyle = hex(0xb07b2c); c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16); },
    concrete(c, r) { noise(c, 0xb9b4ab, 0.05, r); speckle(c, [0xa8a39a], 25, r); },
    cactus(c, r) { noise(c, 0x4c8a32, 0.1, r); c.fillStyle = hex(0x2f5f1f); for (let x = 2; x < 16; x += 4) c.fillRect(x, 0, 1, 16); speckle(c, [0xe6e0b0], 10, r); },
    coin(c, r) {
      c.fillStyle = hex(0xffc93c); c.fillRect(0, 0, 16, 16);
      c.fillStyle = hex(0xe29b12); c.fillRect(0, 0, 16, 2); c.fillRect(0, 14, 16, 2); c.fillRect(0, 0, 2, 16); c.fillRect(14, 0, 2, 16);
      c.fillStyle = hex(0xfff0a8); c.fillRect(5, 4, 2, 8); c.fillRect(7, 4, 4, 2);
      c.fillStyle = hex(0xe29b12); c.fillRect(9, 7, 2, 5);
    },
    gem(c, r) { noise(c, 0x3de0d0, 0.1, r); c.fillStyle = hex(0xbffcf5); c.fillRect(3, 3, 4, 2); c.fillRect(3, 3, 2, 4); c.fillStyle = hex(0x1b9c92); c.fillRect(10, 11, 4, 2); },
    // ---- lemon identity ----
    lemon(c, r) {                                     // lemon peel with pores + shine
      noise(c, 0xf5d93a, 0.06, r);
      speckle(c, [0xe0c02a, 0xd9b420], 26, r);
      c.fillStyle = hex(0xfff3a0); c.fillRect(3, 3, 3, 1); c.fillRect(3, 4, 1, 2);
    },
    lemon_leaves(c, r) {                              // lemon-tree canopy: glossy leaves + fruit
      noise(c, 0x3f8f2e, 0.2, r); speckle(c, [0x2d6b1e, 0x5fb03d], 60, r);
      const spots = [[2, 2], [10, 1], [6, 7], [13, 9], [1, 11], [8, 13]];
      for (const [x, y] of spots) {
        c.fillStyle = hex(0xffd83a); c.fillRect(x, y, 2, 2);
        c.fillStyle = hex(0xfff29a); c.fillRect(x, y, 1, 1);
        c.fillStyle = hex(0xd9a90f); c.fillRect(x + 1, y + 1, 1, 1);
      }
    },
    lemon_icon(c) {                                   // transparent pixel-art lemon
      const P = { o: '#6b4e0a', y: '#ffd83a', l: '#fff29a', d: '#e0a812', g: '#4f9e32', G: '#2f6b1e' };
      const rows = [
        '.........gG.....',
        '........gGG.....',
        '.......oogg.....',
        '.....ooyyyoo....',
        '....oyyllyyyo...',
        '...oyyllyyyyyo..',
        '..oyyylyyyyyydo.',
        '..oyyyyyyyyyydo.',
        '.oyyyyyyyyyyyddo',
        '..oyyyyyyyyyydo.',
        '..oyyyyyyyyyddo.',
        '...oyyyyyyyddo..',
        '....oddyyyddo...',
        '.....oooddoo....',
        '........oo......',
        '................',
      ];
      rows.forEach((row, y) => [...row].forEach((ch, x) => { if (P[ch]) { c.fillStyle = P[ch]; c.fillRect(x, y, 1, 1); } }));
    },
  };

  const texCache = {};
  VR.Tex = {
    get(key) {
      if (texCache[key]) return texCache[key];
      const cv = document.createElement('canvas');
      cv.width = cv.height = PX;
      const ctx = cv.getContext('2d');
      let seed = 0; for (const ch of key) seed = seed * 31 + ch.charCodeAt(0);
      (PAINTERS[key] || PAINTERS.stone)(ctx, rng(seed));
      const t = new T.CanvasTexture(cv);
      t.magFilter = T.NearestFilter;
      t.minFilter = T.NearestMipmapNearestFilter;
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.colorSpace = T.SRGBColorSpace;
      texCache[key] = t;
      return t;
    },
    paint(key, ctx) { (PAINTERS[key] || PAINTERS.stone)(ctx, rng(7)); },
    // Allow custom painters to be added at runtime (e.g. new biome blocks)
    register(key, painter) { PAINTERS[key] = painter; delete texCache[key]; },
    canvasFor(painter) {
      const cv = document.createElement('canvas'); cv.width = cv.height = PX;
      painter(cv.getContext('2d'), rng(7)); return cv;
    },
  };

  const matCache = {};
  const EMISSIVE = { lamp: 0xffd98a, coin: 0x6b4a00, gem: 0x0a5f58, lemon: 0x2a2200 };
  VR.Mat = {
    // key: texture key (optionally "key#tint")
    get(key) {
      if (matCache[key]) return matCache[key];
      let m;
      if (key === '__vcolor') {
        m = new T.MeshLambertMaterial({ vertexColors: true });
      } else {
        const [tex, tint] = key.split('#');
        m = new T.MeshLambertMaterial({ map: VR.Tex.get(tex) });
        if (tint) m.color.setHex(parseInt(tint, 16));
        if (EMISSIVE[tex]) { m.emissive.setHex(EMISSIVE[tex]); }
      }
      matCache[key] = m;
      return m;
    },
    tinted(tex, color) { return tex + '#' + color.toString(16).padStart(6, '0'); },
  };

  /* -------------------------------------------------------------------
   * VoxelBuilder
   * addBox(cx, y0, cz, w, h, d, material)
   *   cx/cz = centre on X/Z, y0 = bottom. material = texture key string,
   *   or {top, side, bottom} for grass-like blocks.
   * addColorBox(...same..., 0xRRGGBB) for flat-coloured voxels (characters).
   * build() -> THREE.Group with one merged mesh per material.
   * ------------------------------------------------------------------- */
  const FACES = [
    // dir, corners (unit cube, 0..1), which dims map to u/v
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: 'd', v: 'h', slot: 'side' },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: 'd', v: 'h', slot: 'side' },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: 'w', v: 'd', slot: 'top' },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: 'w', v: 'd', slot: 'bottom' },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: 'w', v: 'h', slot: 'side' },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: 'w', v: 'h', slot: 'side' },
  ];
  const tmpColor = new T.Color();

  class VoxelBuilder {
    constructor(uvScale = 1) { this.buckets = {}; this.uvScale = uvScale; }
    _bucket(key) {
      return this.buckets[key] || (this.buckets[key] = { pos: [], nor: [], uv: [], col: [], idx: [], n: 0 });
    }
    _face(b, f, x0, y0, z0, w, h, d, color, faceKey) {
      const dims = { w, h, d };
      const us = dims[f.u] * this.uvScale, vs = dims[f.v] * this.uvScale;
      const uvs = [[0, 0], [us, 0], [us, vs], [0, vs]];
      for (let i = 0; i < 4; i++) {
        const c = f.c[i];
        b.pos.push(x0 + c[0] * w, y0 + c[1] * h, z0 + c[2] * d);
        b.nor.push(f.n[0], f.n[1], f.n[2]);
        b.uv.push(uvs[i][0], uvs[i][1]);
        if (color) {
          // cheap baked "ambient occlusion": top faces brightest, bottoms darker
          const k = f.n[1] > 0 ? 1 : f.n[1] < 0 ? 0.6 : 0.85;
          b.col.push(color.r * k, color.g * k, color.b * k);
        }
      }
      const n = b.n;
      b.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      b.n += 4;
    }
    addBox(cx, y0, cz, w, h, d, mat, skipFaces) {
      const x0 = cx - w / 2, z0 = cz - d / 2;
      for (let i = 0; i < 6; i++) {
        if (skipFaces && skipFaces[i]) continue;
        const f = FACES[i];
        const key = typeof mat === 'string' ? mat : (mat[f.slot] || mat.side);
        this._face(this._bucket(key), f, x0, y0, z0, w, h, d, null);
      }
      return this;
    }
    addColorBox(cx, y0, cz, w, h, d, color) {
      tmpColor.setHex(color);
      const b = this._bucket('__vcolor');
      const x0 = cx - w / 2, z0 = cz - d / 2;
      for (const f of FACES) this._face(b, f, x0, y0, z0, w, h, d, tmpColor);
      return this;
    }
    isEmpty() { return Object.keys(this.buckets).length === 0; }
    buildGeometries() {
      const out = [];
      for (const key in this.buckets) {
        const b = this.buckets[key];
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(b.nor, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
        if (key === '__vcolor') g.setAttribute('color', new T.Float32BufferAttribute(b.col, 3));
        g.setIndex(b.n > 65535 ? new T.Uint32BufferAttribute(b.idx, 1) : new T.Uint16BufferAttribute(b.idx, 1));
        g.computeBoundingSphere();
        out.push({ key, geometry: g });
      }
      return out;
    }
    build() { return VR.Prefab.fromGeometries(this.buildGeometries()); }
  }
  VR.VoxelBuilder = VoxelBuilder;

  /* -------------------------------------------------------------------
   * Prefabs + object pool. A prefab = list of {geometry, material key}.
   * Instances share geometry & materials, so spawning is almost free.
   * ------------------------------------------------------------------- */
  VR.Prefab = {
    fromGeometries(list) {
      const g = new T.Group();
      for (const { key, geometry } of list) {
        const m = new T.Mesh(geometry, VR.Mat.get(key));
        m.matrixAutoUpdate = false; m.updateMatrix();
        g.add(m);
      }
      g.userData.prefabParts = list;
      return g;
    },
  };

  class Pool {
    constructor(scene) { this.scene = scene; this.free = {}; this.factories = {}; }
    define(key, factory) { this.factories[key] = factory; this.free[key] = this.free[key] || []; }
    has(key) { return !!this.factories[key]; }
    get(key) {
      const list = this.free[key];
      let o = list && list.pop();
      if (!o) {
        o = this.factories[key]();
        o.userData.poolKey = key;
      }
      o.visible = true;
      this.scene.add(o);
      return o;
    }
    release(o) {
      if (!o) return;
      o.visible = false;
      this.scene.remove(o);
      o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0);
      (this.free[o.userData.poolKey] || (this.free[o.userData.poolKey] = [])).push(o);
    }
  }
  VR.Pool = Pool;

  // Clone a prefab group cheaply (shares geometry + materials)
  VR.clonePrefab = function (prefab) {
    const g = new T.Group();
    for (const child of prefab.children) {
      const m = new T.Mesh(child.geometry, child.material);
      m.position.copy(child.position); m.rotation.copy(child.rotation); m.scale.copy(child.scale);
      m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
    }
    return g;
  };
})();
