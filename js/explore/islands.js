/* =====================================================================
 * SKY ISLANDS — five floating islands seen high in the sky from the
 * main menu, the runner course, the square and the exploration world.
 * Each is a destination (js/explore/islandworlds.js); here they are only
 * far silhouettes: a few hundred coloured voxels each, merged into one
 * mesh per island, drawn without fog, following the camera like the sky
 * (so they cost almost nothing and are never "reached" by walking).
 *
 *   VR.ISLANDS            the catalogue (id, name, colours, where in the sky)
 *   new VR.SkyIslands(scene, { haze, skip })   .update(camPos, dt) · .dispose()
 *
 * Where they hang (azimuth around you, elevation, distance) is the same
 * everywhere, so a player can learn "the frozen one is over there".
 * ===================================================================== */
(function () {
  const T = THREE;
  const t2 = (en, ar) => ({ en, ar });

  const ISLANDS = [
    { id: 'isl1', name: t2('The Overgrown Ruins', 'الأطلال المكسوّة'), az: 0.35, el: 0.30, dist: 165, size: 1.0,
      colors: { top: 0x5fae3a, rock: 0x6b5a48, under: 0x4a3f33, accent: 0xb8b0a0 } },
    { id: 'isl2', name: t2('The Frozen Summit', 'القمة المتجمّدة'), az: 1.55, el: 0.36, dist: 175, size: 1.0,
      colors: { top: 0xf2f8ff, rock: 0x8a96a6, under: 0x5a6676, accent: 0xbfeaff } },
    { id: 'isl3', name: t2('The Desert Fortress', 'حصن الصحراء'), az: 2.75, el: 0.26, dist: 170, size: 1.05,
      colors: { top: 0xe8c48a, rock: 0xd9905a, under: 0x8a5a3a, accent: 0xb8763e } },
    { id: 'isl4', name: t2('The Crystal Caverns', 'كهوف الكريستال'), az: 4.0, el: 0.32, dist: 160, size: 0.95,
      colors: { top: 0x5a5a6a, rock: 0x3e3e4c, under: 0x2a2a36, accent: 0xa98cff } },
    { id: 'isl5', name: t2('The Broken Citadel', 'القلعة المكسورة'), az: 5.15, el: 0.42, dist: 185, size: 1.15,
      colors: { top: 0x9aa0aa, rock: 0x6a6e78, under: 0x44464e, accent: 0xffd23c } },
  ];

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const mix = (a, b, k) => { const ca = new T.Color(a), cb = new T.Color(b); return ca.lerp(cb, k).getHex(); };

  /** a floating rock: a flat top, sides that taper down into a point (all voxels) */
  function rockBody(vb, r, cx, cy, cz, rad, depth, col, k, flat = 0.9) {
    for (let y = 0; y < depth; y++) {
      const kk = 1 - y / depth, w = rad * (0.25 + 0.75 * Math.pow(kk, 0.7));
      const jx = (r() - 0.5) * rad * 0.15, jz = (r() - 0.5) * rad * 0.15;
      vb.addColorBox(cx + jx, cy - y - 1, cz + jz, w * 2, 1, w * 2 * flat, mix(y === 0 ? col.top : y < depth * 0.4 ? col.rock : col.under, k.haze, k.h));
    }
  }

  /** the five silhouettes (metres; drawn at ~170 m away) */
  const SHAPES = {
    isl1(vb, r, col, k) {                       // wide green cliffs, ruins and an arch
      rockBody(vb, r, 0, 0, 0, 14, 12, col, k);
      rockBody(vb, r, 13, -2, 4, 6, 7, col, k);
      for (const [x, z, h] of [[-6, -3, 6], [-2, -5, 4], [3, -4, 7], [7, 2, 3], [-8, 4, 5]]) vb.addColorBox(x, 0, z, 1.4, h, 1.4, mix(col.accent, k.haze, k.h));
      vb.addColorBox(0.5, 6, -4.5, 6.5, 1.2, 1.4, mix(col.accent, k.haze, k.h));            // an arch across two columns
      for (let i = 0; i < 9; i++) vb.addColorBox(-10 + i * 2.4, -2 - r() * 3, 9 + (r() - 0.5) * 2, 0.6, 4 + r() * 4, 0.6, mix(0x3f8a2b, k.haze, k.h));   // hanging vines
      for (const [x, z] of [[-4, 6], [6, -8], [10, 6]]) { vb.addColorBox(x, 0, z, 0.8, 3, 0.8, mix(0x6b4526, k.haze, k.h)); vb.addColorBox(x, 3, z, 4, 3, 4, mix(0x4f9a32, k.haze, k.h)); }
    },
    isl2(vb, r, col, k) {                       // a tall snowy spire on a small base, icicles under
      rockBody(vb, r, 0, 0, 0, 9, 10, col, k);
      for (let y = 0; y < 22; y++) { const w = 9 * (1 - y / 24); vb.addColorBox((r() - 0.5) * 1.2, y, (r() - 0.5) * 1.2, w * 2, 1, w * 1.8, mix(y > 6 ? col.top : col.rock, k.haze, k.h)); }
      for (let i = 0; i < 10; i++) vb.addColorBox(-7 + r() * 14, -10 - r() * 6, -6 + r() * 12, 0.7, 3 + r() * 4, 0.7, mix(col.accent, k.haze, k.h));
    },
    isl3(vb, r, col, k) {                       // a sandstone mesa with a walled fortress and towers
      rockBody(vb, r, 0, 0, 0, 13, 11, col, k, 0.8);
      const wallC = mix(col.accent, k.haze, k.h);
      vb.addColorBox(0, 0, -6, 16, 3.5, 1.2, wallC); vb.addColorBox(0, 0, 6, 16, 3.5, 1.2, wallC);
      vb.addColorBox(-8, 0, 0, 1.2, 3.5, 13, wallC); vb.addColorBox(8, 0, 0, 1.2, 3.5, 13, wallC);
      for (const [x, z] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) { vb.addColorBox(x, 0, z, 3, 7, 3, wallC); vb.addColorBox(x, 7, z, 3.6, 0.8, 3.6, mix(0xf0d29a, k.haze, k.h)); }
      vb.addColorBox(0, 0, 0, 5, 6, 5, mix(0xf0c890, k.haze, k.h));
    },
    isl4(vb, r, col, k) {                       // jagged dark rock with big glowing crystals
      rockBody(vb, r, 0, 0, 0, 11, 14, col, k);
      for (let i = 0; i < 6; i++) vb.addColorBox((r() - 0.5) * 16, 0, (r() - 0.5) * 12, 2 + r() * 2, 2 + r() * 4, 2 + r() * 2, mix(col.rock, k.haze, k.h));
    },
    isl5(vb, r, col, k) {                       // three separated rocks, tower pieces, a broken bridge, a gold top
      rockBody(vb, r, 0, 0, 0, 8, 10, col, k);
      rockBody(vb, r, 16, 4, -3, 5, 7, col, k);
      rockBody(vb, r, -14, -3, 5, 5, 8, col, k);
      const st = mix(col.accent === 0xffd23c ? 0xa8acb6 : col.accent, k.haze, k.h);
      vb.addColorBox(0, 0, 0, 5, 14, 5, st); vb.addColorBox(0, 14, 0, 6, 1.2, 6, st); vb.addColorBox(0, 15.2, 0, 2.4, 3, 2.4, mix(col.accent, k.haze, k.h * 0.5));
      vb.addColorBox(16, 4, -3, 3, 7, 3, st); vb.addColorBox(-14, -3, 5, 3, 9, 3, st);
      vb.addColorBox(6, 6, -1.5, 6, 0.8, 1.6, st); vb.addColorBox(-6, 3, 2.5, 5, 0.8, 1.6, st);
    },
  };

  /** extra glowing bits drawn with their own material (crystals, the citadel's gold) */
  function glowBits(id, group, col, k) {
    if (id !== 'isl4' && id !== 'isl5') return;
    const mat = new T.MeshBasicMaterial({ color: mix(col.accent, k.haze, k.h * 0.4), fog: false });
    const r = rng(id === 'isl4' ? 77 : 99);
    const geo = new T.ConeGeometry(1, 1, 5);
    const n = id === 'isl4' ? 12 : 3;
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(geo, mat);
      if (id === 'isl4') { const h = 4 + r() * 7; m.scale.set(1 + r(), h, 1 + r()); m.position.set((r() - 0.5) * 18, h / 2 - (i > 8 ? 14 : 0), (r() - 0.5) * 14); if (i > 8) m.rotation.x = Math.PI; }
      else { m.scale.set(1.6, 3, 1.6); m.position.set([0, 16, -14][i], [19, 12.5, 7.5][i], [0, -3, 5][i]); }
      group.add(m);
    }
  }

  class SkyIslands {
    constructor(scene, o = {}) {
      this.scene = scene; this.group = new T.Group(); this.group.name = 'skyIslands';
      const k = { haze: o.haze !== undefined ? o.haze : 0xb8e4ff, h: o.hazeK !== undefined ? o.hazeK : 0.32 };
      this.items = [];
      for (const isl of ISLANDS) {
        if (o.skip === isl.id) continue;               // (standing on it: not also in the sky)
        const vb = new VR.VoxelBuilder(), r = rng(isl.id.charCodeAt(3) * 131);
        SHAPES[isl.id](vb, r, isl.colors, k);
        const g = vb.build();
        g.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.fog = false; m.userData.skyMat = true; } });
        const holder = new T.Group(); holder.add(g); glowBits(isl.id, holder, isl.colors, k);
        const s = isl.size * (o.scale || 1.35);
        holder.scale.setScalar(s);
        const d = isl.dist * (o.distK || 1);
        holder.position.set(Math.sin(isl.az) * Math.cos(isl.el) * d, Math.sin(isl.el) * d, -Math.cos(isl.az) * Math.cos(isl.el) * d);
        holder.rotation.y = isl.az * 0.7;
        holder.userData.y0 = holder.position.y;
        this.group.add(holder);
        this.items.push({ isl, holder, phase: isl.az * 3 });
      }
      this.group.renderOrder = -1;
      scene.add(this.group);
      this.t = 0;
    }
    /** stay "in the sky": centred on the camera, a slow bob */
    update(camPos, dt = 0) {
      this.t += dt;
      this.group.position.copy(camPos);
      for (const it of this.items) it.holder.position.y = it.holder.userData.y0 + Math.sin(this.t * 0.25 + it.phase) * 1.2;
    }
    dispose() {
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material && (o.material.userData.skyMat || o.userData.skyMat || !o.material.map)) o.material.dispose(); } });
    }
  }

  VR.ISLANDS = ISLANDS;
  VR.SkyIslands = SkyIslands;
  VR.islandById = (id) => ISLANDS.find(i => i.id === id) || null;
})();
