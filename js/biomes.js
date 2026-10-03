/* =====================================================================
 * BIOMES — the mountain regions the run crosses.
 * ---------------------------------------------------------------------
 * The terrain (terrain.js) is built with material SLOTS; a biome fills
 * them in, and sets the sky, the fog and how often its special route
 * pieces appear (tunnels through the mountain, natural rock bridges,
 * splitting routes).
 *
 * HOW TO ADD A NEW ENVIRONMENT:
 *   1. Add an entry to VR.BIOMES with sky / fog colours, `slots`
 *      (texture keys from voxel.js, optionally tinted with
 *      VR.Mat.tinted) and `bias`.
 *   2. (optional) add new block textures with VR.Tex.register(...)
 *   3. Add its name to i18n.js ('biome.<key>').
 * ===================================================================== */
(function () {
  const L = 40; // chunk length

  // ---------- prop helpers (all take a VoxelBuilder) ------------------
  const P = {
    oak(vb, x, z, h = 4, leaf = 'leaves') {
      vb.addBox(x, 0, z, 1, h, 1, 'log');
      vb.addBox(x, h - 1.5, z, 5, 2, 5, leaf);
      vb.addBox(x, h + 0.5, z, 3, 1.5, 3, leaf);
    },
    birch(vb, x, z, h = 5) {
      vb.addBox(x, 0, z, 0.9, h, 0.9, 'wall');
      vb.addBox(x, h - 2, z, 3.4, 2.4, 3.4, 'leaves');
      vb.addBox(x, h + 0.4, z, 2, 1.2, 2, 'leaves');
    },
    pine(vb, x, z, h = 7, snowy = false) {
      vb.addBox(x, 0, z, 1, h, 1, 'log');
      let w = 5, y = 2;
      while (w >= 1) {
        vb.addBox(x, y, z, w, 1.2, w, 'pine');
        if (snowy) vb.addBox(x, y + 1.2, z, w * 0.8, 0.25, w * 0.8, 'snow');
        y += 1.3; w -= 1.3;
      }
    },
    bush(vb, x, z, s = 1.4) { vb.addBox(x, 0, z, s, s * 0.8, s, 'leaves'); },
    rock(vb, x, z, s = 1.5) { vb.addBox(x, 0, z, s, s * 0.7, s * 0.9, 'cobble'); vb.addBox(x + s * 0.2, s * 0.7, z, s * 0.5, s * 0.4, s * 0.5, 'stone'); },
    flower(vb, x, z, c) { vb.addColorBox(x, 0, z, 0.12, 0.45, 0.12, 0x3c8a2a); vb.addColorBox(x, 0.45, z, 0.32, 0.25, 0.32, c); },
    tuft(vb, x, z) { vb.addColorBox(x, 0, z, 0.5, 0.35, 0.12, 0x4f9e32); vb.addColorBox(x, 0, z, 0.12, 0.45, 0.5, 0x5fae3a); },
    hill(vb, x, z, w, d, h, top, side) {
      for (let i = 0; i < h; i++) {
        const k = 1 - i / (h + 1);
        vb.addBox(x, i, z, w * k, 1, d * k, { top, side, bottom: 'dirt' });
      }
    },
    mountain(vb, x, z, w, h, snowLine) {
      let y = 0, cw = w;
      const step = 2.5;
      while (cw > 2 && y < h) {
        const snow = y >= snowLine;
        vb.addBox(x, y, z, cw, step, cw * 0.9, snow ? { top: 'snow', side: 'snow_side' } : { top: 'stone', side: 'stone' });
        y += step; cw *= 0.8;
      }
    },
    cactus(vb, x, z, h = 3) {
      vb.addBox(x, 0, z, 0.8, h, 0.8, 'cactus');
      if (h > 2.5) { vb.addBox(x + 0.8, 1.2, z, 0.8, 0.6, 0.6, 'cactus'); vb.addBox(x + 1.0, 1.2, z, 0.6, 1.4, 0.6, 'cactus'); }
    },
    deadBush(vb, x, z) { vb.addColorBox(x, 0, z, 0.1, 0.6, 0.1, 0x8a6a3a); vb.addColorBox(x + 0.2, 0.3, z, 0.5, 0.08, 0.08, 0x8a6a3a); },
    dune(vb, x, z, w, d, h) { for (let i = 0; i < h; i++) { const k = 1 - i / (h + 0.5); vb.addBox(x, i * 0.8, z, w * k, 0.8, d * k, 'sand'); } },
    pyramid(vb, x, z, w) { let y = 0; while (w > 1) { vb.addBox(x, y, z, w, 1.5, w, 'sandstone'); y += 1.5; w -= 3; } },
    house(vb, x, z, w = 5, d = 5, h = 3.5, wallMat = 'planks') {
      vb.addBox(x, 0, z, w + 0.4, 0.4, d + 0.4, 'cobble');
      vb.addBox(x, 0.4, z, w, h, d, wallMat);
      for (const cx of [-w / 2, w / 2]) for (const cz of [-d / 2, d / 2]) vb.addBox(x + cx, 0.4, z + cz, 0.6, h, 0.6, 'log');
      // roof (stepped)
      let rw = w + 1.2, ry = h + 0.4;
      while (rw > 0.8) { vb.addBox(x, ry, z, rw, 0.7, d + 1.2, 'roof'); ry += 0.7; rw -= 1.6; }
      // windows / door facing the tracks (+x side for left strip)
      vb.addBox(x + w / 2 + 0.02, 1.6, z - d * 0.25, 0.1, 1, 1, 'glass');
      vb.addBox(x + w / 2 + 0.02, 1.6, z + d * 0.25, 0.1, 1, 1, 'glass');
      vb.addBox(x + w / 2 + 0.02, 0.4, z, 0.1, 2, 1.1, 'log');
    },
    well(vb, x, z) {
      vb.addBox(x, 0, z, 2.4, 1, 2.4, 'cobble'); vb.addBox(x, 1, z, 1.6, 0.05, 1.6, 'water');
      vb.addBox(x - 1, 1, z - 1, 0.3, 2, 0.3, 'log'); vb.addBox(x + 1, 1, z + 1, 0.3, 2, 0.3, 'log');
      vb.addBox(x - 1, 1, z + 1, 0.3, 2, 0.3, 'log'); vb.addBox(x + 1, 1, z - 1, 0.3, 2, 0.3, 'log');
      vb.addBox(x, 3, z, 2.8, 0.5, 2.8, 'roof');
    },
    farm(vb, x, z, w, d) {
      vb.addBox(x, 0, z, w, 0.15, d, 'dirt');
      for (let i = -w / 2 + 0.5; i < w / 2; i += 1) vb.addColorBox(x + i, 0.15, z, 0.35, 0.6, d - 0.4, 0x7fbf3a);
      vb.addBox(x, 0.1, z, 0.9, 0.12, d, 'water');
    },
    fence(vb, x, z0, z1) {
      for (let z = z0; z > z1; z -= 2) vb.addBox(x, 0, z, 0.25, 1.1, 0.25, 'planks');
      vb.addBox(x, 0.7, (z0 + z1) / 2, 0.12, 0.15, Math.abs(z1 - z0), 'planks');
      vb.addBox(x, 0.35, (z0 + z1) / 2, 0.12, 0.15, Math.abs(z1 - z0), 'planks');
    },
    lampPost(vb, x, z) {
      vb.addBox(x, 0, z, 0.3, 3.6, 0.3, 'log');
      vb.addBox(x, 3.6, z, 0.6, 0.6, 0.6, 'lamp');
    },
    iceSpike(vb, x, z, h) { vb.addBox(x, 0, z, 1.2, h, 1.2, 'ice'); vb.addBox(x, h, z, 0.6, h * 0.4, 0.6, 'ice'); },
    mushroom(vb, x, z) { vb.addColorBox(x, 0, z, 0.3, 0.8, 0.3, 0xeee1c8); vb.addColorBox(x, 0.8, z, 1.1, 0.4, 1.1, 0xc9352a); },

    // ---- lemons ------------------------------------------------------
    // a single voxel lemon: body + pointed ends + a tiny leaf
    lemon(vb, x, y, z, s = 1, alongX = false) {
      const L = 0.5 * s, W = 0.38 * s, t = 0.14 * s;
      if (alongX) {
        vb.addBox(x, y, z, L, W, W, 'lemon');
        vb.addBox(x - L / 2 - t / 2, y + W * 0.3, z, t, W * 0.42, W * 0.42, 'lemon');
        vb.addBox(x + L / 2 + t / 2, y + W * 0.3, z, t, W * 0.42, W * 0.42, 'lemon');
      } else {
        vb.addBox(x, y, z, W, W, L, 'lemon');
        vb.addBox(x, y + W * 0.3, z - L / 2 - t / 2, W * 0.42, W * 0.42, t, 'lemon');
        vb.addBox(x, y + W * 0.3, z + L / 2 + t / 2, W * 0.42, W * 0.42, t, 'lemon');
      }
      vb.addColorBox(x, y + W, z, 0.08 * s, 0.12 * s, 0.08 * s, 0x5a3a1e);
      vb.addColorBox(x + 0.1 * s, y + W + 0.06 * s, z, 0.22 * s, 0.05 * s, 0.14 * s, 0x4f9e32);
    },
    // lemon tree: short trunk, round canopy, fruit hanging below the leaves
    lemonTree(vb, x, z, rnd, h = 3.2) {
      vb.addBox(x, 0, z, 0.8, h, 0.8, 'log');
      vb.addBox(x, h - 1, z, 4.2, 1.8, 4.2, 'lemon_leaves');
      vb.addBox(x, h + 0.8, z, 3, 1, 3, 'lemon_leaves');
      vb.addBox(x, h - 1.5, z, 3, 0.5, 3, 'lemon_leaves');
      // big fruit hanging on the outside of the canopy so it reads from the track
      const sides = [[2.25, -0.9, true], [2.25, 1.0, true], [-2.25, 0.2, true], [0.6, 2.25, false], [-1.0, -2.25, false], [1.2, -2.25, false]];
      for (const [dx, dz, ax] of sides) {
        if (rnd() < 0.2) continue;
        P.lemon(vb, x + dx, h - 1.6 + rnd() * 0.9, z + dz, 1.25, !ax);
      }
      if (rnd() < 0.8) P.lemon(vb, x + 1.4 + rnd(), 0, z - 1 + rnd() * 2, 1.1, true);   // fallen lemon
    },
    // wooden crate of lemons (stations, villages, farms)
    lemonCrate(vb, x, z, y = 0, rnd = Math.random) {
      vb.addBox(x, y, z, 1.2, 0.7, 0.9, 'planks');
      vb.addBox(x, y + 0.7, z, 1.1, 0.05, 0.8, 'dark');
      const pos = [[-0.3, -0.2], [0.25, -0.18], [-0.05, 0.2], [0.35, 0.22], [-0.35, 0.18]];
      for (const [dx, dz] of pos) P.lemon(vb, x + dx, y + 0.7, z + dz, 0.75, rnd() < 0.5);
    },
  };

  const tint = (t, c) => t + '#' + c.toString(16).padStart(6, '0');
  // slot -> texture. top/topside: the ground you run on · alt: patches in it ·
  // cliff/cliffTop: the mountain body and its steps · peak: high tops ·
  // leaf/leafTop/trunk: trees · rock: loose stones
  const SLOTS = {
    meadow: { top: 'grass_top', topside: 'grass_side', alt: 'gravel', cliff: 'stone', cliffTop: 'grass_top', peak: 'snow', leaf: 'leaves', leafTop: 'leaves', trunk: 'log', rock: 'cobble' },
  };
  VR.BIOMES = {
    grassland: {   // high alpine meadows
      sky: 0x86c8f5, fog: 0xc2e2f7, valley: 'grass_top',
      slots: SLOTS.meadow,
      bias: { tunnel: 0.6, arch: 1, split: 1 },
    },
    forest: {      // pine-covered heights
      sky: 0x93cfc0, fog: 0xbfe2d6, valley: 'pine',
      slots: Object.assign({}, SLOTS.meadow, { leaf: 'pine', leafTop: 'pine', alt: 'dirt' }),
      bias: { tunnel: 1, arch: 0.8, split: 1.2 },
    },
    village: {     // lemon terraces on the mountain
      sky: 0x9fd5ff, fog: 0xcbe6fb, valley: 'grass_top',
      slots: Object.assign({}, SLOTS.meadow, { leaf: 'lemon_leaves', leafTop: 'lemon_leaves', alt: 'dirt', rock: 'sandstone' }),
      bias: { tunnel: 0.4, arch: 0.8, split: 1 },
    },
    desert: {      // red sandstone canyons
      sky: 0xffcf96, fog: 0xffe2bd, valley: 'sand',
      slots: { top: 'sand', topside: 'sandstone', alt: tint('sandstone', 0xe8b48a), cliff: tint('sandstone', 0xe39a6a), cliffTop: 'sand', peak: tint('sandstone', 0xf0c8a0), leaf: 'cactus', leafTop: 'cactus', trunk: 'log', rock: tint('sandstone', 0xc98a5a) },
      bias: { tunnel: 0.8, arch: 1.6, split: 1 },
    },
    mountains: {   // bare rocky peaks
      sky: 0x9dbde6, fog: 0xc9d8ee, valley: 'stone',
      slots: { top: 'gravel', topside: 'stone', alt: 'stone', cliff: 'stone', cliffTop: 'stone', peak: 'snow', leaf: 'pine', leafTop: 'pine', trunk: 'log', rock: 'cobble' },
      bias: { tunnel: 1.4, arch: 1.2, split: 1.2 },
    },
    snow: {        // snowy summits
      sky: 0xc7def2, fog: 0xe3eef8, valley: 'snow',
      slots: { top: 'snow', topside: 'snow_side', alt: 'ice', cliff: 'stone', cliffTop: 'snow', peak: 'snow', leaf: 'pine', leafTop: 'snow', trunk: 'log', rock: 'stone' },
      bias: { tunnel: 1.6, arch: 1, split: 0.9 },
    },
  };

  // Order biomes rotate in (random start, never the same twice in a row)
  VR.BIOME_ORDER = ['grassland', 'forest', 'village', 'desert', 'mountains', 'snow'];
  VR.Props = P;
})();
