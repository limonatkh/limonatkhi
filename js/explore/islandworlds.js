/* =====================================================================
 * THE FIVE SKY ISLANDS — the places behind the silhouettes in the sky
 * (js/explore/islands.js), each its own area, built only when you go
 * there (nothing of it exists before).
 *
 *   isl1  The Overgrown Ruins    a temple podium with a room behind the
 *                                vines, an islet over a plank bridge with a
 *                                broken tower to climb (the crystal key)
 *   isl2  The Frozen Summit      a terraced snow cone, an ice cave in its
 *                                side, a narrow causeway over the drop to
 *                                a lonely knob (a sniper rifle)
 *   isl3  The Desert Fortress    walls, towers, a keep; a stair house in
 *                                the courtyard down to a chamber under it
 *   isl4  The Crystal Caverns    a thick rock: a stair tunnel down into a
 *                                great crystal chamber, a hidden alcove
 *   isl5  The Broken Citadel     three rocks, broken bridges to jump, a
 *                                tower with a stair around it; three sigils
 *                                (behind a wall that is not one, on the
 *                                climbing stones, in the far rock's back)
 *                                open the crown chest at the top
 *
 * The ways there are in the square (js/adventure/hub.js), each opened by
 * something found while exploring; they are added at the bottom of this
 * file (VR.ISLAND_ACCESS), with the way home on each island leading back
 * to the same spot. Every island: first person (T: third), fall off and
 * you are put back where you last stood, all finds kept for good.
 *
 * VR.IslandGen[id]() is pure (no rendering): used by the level and by the
 * tests (every find reachable on foot, the way home beside the spawn).
 * ===================================================================== */
(function () {
  const VT = (typeof VR !== 'undefined' && VR.VoxTerrain) || (typeof require !== 'undefined' ? require('./voxterrain.js') : null);
  const t2 = (en, ar) => ({ en, ar });
  const CELL = 2, N = 48, X0 = -48, Z0 = -48;            // 96 × 96 m; cell centres on odd numbers
  const PI = Math.PI;

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const q = (y, s = 0.4) => Math.round(y / s) * s;

  /** the tools every island uses */
  function tools(vt) {
    const at = (x, z) => vt.get(...vt.ij(x, z));
    const put = (x, z, c) => vt.set(...vt.ij(x, z), c);
    const clear = (x, z) => { const [i, j] = vt.ij(x, z); if (i >= 0 && j >= 0 && i < vt.nx && j < vt.nz) vt.cols[vt.idx(i, j)] = null; };
    /** a column of height h (keeps what was there; a new one floats: base below it) */
    const setH = (x, z, h, extra = {}) => { const c = at(x, z); put(x, z, Object.assign({ top: 'stone', side: 'stone' }, c || { base: h - 2.4 }, { h, gap: undefined }, extra)); };
    /**
     * a floating rock mass: columns inside a wobbly circle, the underside tapering
     * down to a point (what you see from below and from far away)
     */
    const mass = (o) => {
      const r = rng(o.seed || 1), p1 = r() * 6, p2 = r() * 6, wob = o.wob !== undefined ? o.wob : 0.12;
      for (let j = 0; j < vt.nz; j++) for (let i = 0; i < vt.nx; i++) {
        const x = vt.cx(i), z = vt.cz(j), dx = (x - o.cx) * (o.sx || 1), dz = (z - o.cz) * (o.sz || 1);
        const d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
        const R = o.R * (1 + wob * Math.sin(3 * a + p1) + wob * 0.5 * Math.sin(7 * a + p2));
        if (d > R) continue;
        const dn = d / R, h = q(o.h(x, z, dn));
        const base = q(Math.min(h - 1.2, o.floor - 1.2 - o.depth * Math.pow(1 - dn, 0.6)));
        const c = vt.get(i, j);
        if (c && c.h >= h) { c.base = Math.min(c.base !== undefined ? c.base : base, base); continue; }
        vt.set(i, j, { h, base: c && c.base !== undefined ? Math.min(c.base, base) : base, top: typeof o.top === 'function' ? o.top(x, z, h, dn) : o.top, side: o.side });
      }
    };
    /** a tunnel / cave / room (same as the exploration world's) */
    const carve = (cells, floorY, ht, o = {}) => {
      const key = (x, z) => vt.ij(x, z).join(',');
      const inside = new Set(cells.map(([x, z]) => key(x, z))), open = new Set((o.open || []).map(([x, z]) => key(x, z)));
      for (const [x, z, fy] of cells) {
        const c = at(x, z) || { h: floorY, base: floorY - 2.4, top: 'stone', side: 'stone' };
        const f = fy !== undefined ? fy : floorY, r = f + ht;
        put(x, z, Object.assign({}, c, { h: Math.max(c.h, r + 0.8), base: Math.min(c.base !== undefined ? c.base : f - 2.4, f - 1.2), gap: [f, r], floorMat: o.floor || 'gravel', side: o.side || c.side, top: c.h > r + 0.8 ? c.top : (o.roofTop || c.top) }));
      }
      for (const [x, z, fy] of cells) for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL], [CELL, CELL], [-CELL, CELL], [CELL, -CELL], [-CELL, -CELL]]) {
        const nx = x + dx, nz = z + dz, k = key(nx, nz); if (inside.has(k) || open.has(k)) continue;
        const n = at(nx, nz); if (!n) continue;
        const r = (fy !== undefined ? fy : floorY) + ht + 0.8;
        if (n.h < r || n.gap) put(nx, nz, Object.assign({}, n, { h: Math.max(n.h, r), gap: undefined, side: o.side || n.side, top: n.h >= r ? n.top : (o.roofTop || n.top) }));
      }
    };
    return { at, put, clear, setH, mass, carve, top: (x, z) => vt.top(x, z), floor: (x, z) => vt.floor(x, z) };
  }
  const newVT = () => new VT({ x0: X0, z0: Z0, nx: N, nz: N, cell: CELL, base: -14 });
  const noise = (x, z, k = 1) => k * (0.8 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.5 * Math.sin((x - z) * 0.13));

  /* ------------------------------------------------------------------ 1: the Overgrown Ruins */
  function isl1() {
    const vt = newVT(), T = tools(vt), spots = {};
    const temple = (x, z) => x > -11 && x < 11 && z > -17 && z < 7;
    T.mass({ cx: 0, cz: 0, R: 22, floor: 2.4, depth: 13, seed: 11, side: 'stone#7a6a58',
      h: (x, z, dn) => (temple(x, z) ? 2.4 : 2.4 + Math.max(-0.4, noise(x, z)) - Math.max(0, dn - 0.85) * 6),
      top: (x, z) => (temple(x, z) ? 'cobble#9aa58a' : 'grass_top') });
    T.mass({ cx: 34, cz: 4, R: 7, floor: 3.6, depth: 9, seed: 12, side: 'stone#7a6a58', h: () => 3.6, top: 'grass_top' });
    // the plank bridge to the islet (vines hang under it)
    for (let x = 13; x <= 29; x += 2) { const c = T.at(x, 5); if (!c || c.h < 2.4) T.put(x, 5, { h: x < 22 ? 2.8 : 3.2, base: (x < 22 ? 2.8 : 3.2) - 0.6, top: 'planks', side: 'log' }); }
    // the temple podium (steps on its south side) with a room inside, its door hidden behind vines (west)
    for (let x = -7; x <= 7; x += 2) for (let z = -13; z <= -1; z += 2) T.setH(x, z, 6.0, { top: 'stone_bricks#8f9a80', side: 'stone_bricks#8f9a80' });
    for (let x = -3; x <= 3; x += 2) { T.setH(x, 1, 4.8, { top: 'stone_bricks#8f9a80', side: 'stone_bricks#8f9a80' }); T.setH(x, 3, 3.6, { top: 'stone_bricks#8f9a80', side: 'stone_bricks#8f9a80' }); }
    const room = [[-7, -7], [-5, -7]]; for (let x = -3; x <= 3; x += 2) for (let z = -11; z <= -5; z += 2) room.push([x, z]);
    T.carve(room, 2.4, 2.8, { open: [[-9, -7], [-9, -5], [-9, -9]], floor: 'planks#7a5a3a', side: 'stone_bricks#8f9a80' });
    // the islet's broken tower: a stair of blocks around it, the crystal key on top
    const ring = [[31, 1], [31, 3], [31, 5], [31, 7], [33, 7], [35, 7], [37, 7], [37, 5]];
    ring.forEach(([x, z], k) => T.setH(x, z, 3.6 + 1.2 * (k + 1), { top: 'stone_bricks#9aa088', side: 'stone_bricks#9aa088' }));
    for (const x of [33, 35]) for (const z of [3, 5]) T.setH(x, z, 3.6 + 1.2 * 9, { top: 'stone_bricks#9aa088', side: 'stone_bricks#9aa088' });
    // where things are
    spots.spawn = [-15, T.top(-15, 1), 1]; spots.home = [-17.6, T.top(-17, 1), 1];
    spots.roomRelic = [0, 2.4 + 1.0, -9]; spots.roomChest = [2, 2.4, -6]; spots.room = [0, 2.4, -8];
    spots.podium = [0, 6.0, -9]; spots.key = [34, 3.6 + 10.8 + 0.9, 4];
    spots.plate = [-3, T.top(-3, 15), 15]; spots.ammo = [-11, T.top(-11, 7), 7]; spots.islet = [33, 3.6, 0];
    spots.sign = [-15, T.top(-15, 5), 5];
    return { vt, spots, killY: -16 };
  }

  /* ------------------------------------------------------------------ 2: the Frozen Summit */
  function isl2() {
    const vt = newVT(), T = tools(vt), spots = {};
    const PK = { x: 4, z: -4, h: 14.4, r: 24 };
    T.mass({ cx: 0, cz: 0, R: 22, floor: 2.4, depth: 14, seed: 21, side: 'stone#8a96a6',
      h: (x, z) => { const dp = Math.hypot(x - PK.x, z - PK.z); return 2.4 + Math.max(0, q(PK.h * (1 - dp / PK.r), 1.2)); },
      top: (x, z, h) => (h > 4 ? 'snow' : 'snow') });
    // the narrow causeway (one block wide, nothing either side) to the lonely knob
    const cw = []; let x = -13, z = -9;
    while (x > -31) { cw.push([x, z]); x -= 2; cw.push([x, z]); z -= 2; }
    cw.forEach(([cx, cz], k) => { const c = T.at(cx, cz); const want = q(Math.min(6.0, 2.4 + k * 0.4)); if (!c || c.h < want || Math.hypot(cx, cz) > 15) T.put(cx, cz, { h: want, base: want - 1.6, top: 'snow', side: 'ice' }); });
    // keep it narrow: no rock beside the outer part of the causeway
    const cwSet = new Set(cw.map(p => p.join(',')));
    for (const [cx, cz] of cw) if (Math.hypot(cx, cz) > 17) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (!cwSet.has([cx + dx, cz + dz].join(','))) T.clear(cx + dx, cz + dz);
    T.mass({ cx: -33, cz: -21, R: 4.6, floor: 6.0, depth: 6, seed: 22, wob: 0.06, side: 'stone#8a96a6', h: () => 6.0, top: 'snow' });
    // the ice cave in the cone's west side
    const cave = []; for (let cx = -15; cx <= -7; cx += 2) for (const cz of [-5, -3]) cave.push([cx, cz]);
    for (let cx = -5; cx <= 1; cx += 2) for (let cz = -9; cz <= -1; cz += 2) cave.push([cx, cz]);
    T.carve(cave, 2.4, 3.0, { open: [[-17, -5], [-17, -3], [-17, -7], [-17, -1]], floor: 'ice', side: 'stone#8a96a6', roofTop: 'snow' });
    const sTop = T.top(PK.x + 1, PK.z + 1);
    spots.spawn = [1, T.top(1, 15), 15]; spots.home = [1, T.top(1, 17.4), 17.4];
    spots.summit = [PK.x + 1, sTop, PK.z + 1]; spots.relic = [PK.x + 1, sTop + 1.3, PK.z + 1];
    spots.caveChest = [-3, 2.4, -7]; spots.cavePlate = [-1, 2.4 + 1.0, -3]; spots.cave = [-2, 2.4, -5]; spots.caveLight = [-2, 4.8, -5];
    spots.knob = [-33, 6.0, -21]; spots.hutChest = [-34, 6.0, -22.4];
    spots.ammo = [5, T.top(5, 13), 13]; spots.sign = [-2.6, T.top(-3, 15), 15];
    return { vt, spots, killY: -16 };
  }

  /* ------------------------------------------------------------------ 3: the Desert Fortress */
  function isl3() {
    const vt = newVT(), T = tools(vt), spots = {};
    const SAND = 'sand', SST = 'sandstone#d9a070', TWR = 'sandstone#c98a5a';
    T.mass({ cx: 0, cz: 2, R: 26, sx: 1.15, floor: 2.4, depth: 14, seed: 31, side: 'sandstone#e39a6a',
      h: (x, z) => (Math.abs(x) < 15 && Math.abs(z) < 15 ? 2.4 : 2.4 + Math.max(0, q(noise(x, z, 1.2), 0.4))), top: SAND });
    // the walls (4.4 m), the gate in the south wall, towers at the corners, the stair up to the wall walk
    for (let x = -11; x <= 11; x += 2) for (let z = -11; z <= 11; z += 2) if (Math.abs(x) === 11 || Math.abs(z) === 11) T.setH(x, z, 6.8, { top: SST, side: SST });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const x of [9, 11]) for (const z of [9, 11]) T.setH(sx * x, sz * z, 8.0, { top: TWR, side: TWR });
    [[-9, 7, 3.6], [-9, 5, 4.8], [-9, 3, 6.0]].forEach(([x, z, h]) => T.setH(x, z, h, { top: SST, side: SST }));
    T.carve([[-1, 11], [1, 11]], 2.4, 3.2, { open: [[-1, 13], [1, 13], [-3, 13], [3, 13], [-1, 9], [1, 9], [-3, 9], [3, 9]], floor: 'sandstone', side: SST });
    // the keep in the middle, a hall inside (its door faces the gate)
    for (let x = -3; x <= 3; x += 2) for (let z = -3; z <= 3; z += 2) T.setH(x, z, 9.2, { top: 'sandstone#e0b080', side: 'sandstone#e0b080' });
    T.carve([[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 3], [1, 3]], 2.4, 3.2, { open: [[-1, 5], [1, 5], [-3, 5], [3, 5]], floor: 'sandstone', side: 'sandstone#e0b080' });
    // the stair house in the north-west of the courtyard: down to a chamber under the ground
    const under = [[-7, -7, 1.2], [-5, -7, 0]];
    for (let x = -3; x <= 5; x += 2) for (const z of [-7, -9]) under.push([x, z, -1.2]);
    T.carve(under, -1.2, 3.2, { open: [[-9, -7], [-9, -5], [-9, -9]], floor: 'sandstone', side: SST, roofTop: SST });
    spots.spawn = [0, T.top(0, 21), 21]; spots.home = [0, T.top(0, 23.4), 23.4];
    spots.keep = [0, 2.4, -1]; spots.under = [1, -1.2, -8]; spots.underRelic = [3, -1.2 + 1.0, -9]; spots.underChest = [-1, -1.2, -9]; spots.underLight = [1, 1.2, -8];
    spots.nade = [-10, 8.0, 10]; spots.towerChest = [10, 8.0, -10]; spots.ammo = [7, 2.4, 7];
    spots.sign = [-2.6, T.top(-3, 19), 19];
    return { vt, spots, killY: -16 };
  }

  /* ------------------------------------------------------------------ 4: the Crystal Caverns */
  function isl4() {
    const vt = newVT(), T = tools(vt), spots = {};
    const ROCK = 'stone#9a9ab4', DARK = 'stone#6e6e88';
    T.mass({ cx: 0, cz: 0, R: 18, floor: 6.0, depth: 16, seed: 41, side: DARK,
      h: (x, z, dn) => 6.0 + Math.max(0, q(noise(x, z, 0.9), 0.4)) - (dn > 0.8 ? 0.4 : 0), top: ROCK });
    // the stair tunnel down (a jump per step), turning into the chamber
    const tun = [[-9, 9, 4.8], [-7, 9, 3.6], [-5, 9, 2.4], [-3, 9, 1.2], [-1, 9, 0], [1, 9, -1.2], [3, 9, -2.4], [5, 9, -3.6], [5, 7, -3.6]];
    T.carve(tun, -3.6, 3.4, { open: [[-11, 9]], floor: 'cobble', side: DARK, roofTop: ROCK });
    // the great chamber (7 m high)
    const ch = []; for (let x = -7; x <= 7; x += 2) for (let z = -9; z <= 5; z += 2) ch.push([x, z]);
    T.carve(ch, -3.6, 7.0, { open: [[5, 7]], floor: 'stone#7a7a92', side: DARK });
    // rock steps inside: up to the void stone (two jumps) and the crystal pedestal
    const raise = (x, z, fy) => { const c = T.at(x, z); T.put(x, z, Object.assign({}, c, { gap: [fy, c.gap[1]] })); };
    raise(-3, -5, -2.4); raise(-5, -5, -1.2); raise(1, -3, -2.4);
    // a hidden alcove east, behind the crystals
    T.carve([[9, -5], [11, -5]], -3.6, 2.6, { open: [[7, -5], [7, -3], [7, -7]], floor: 'stone#7a7a92', side: DARK });
    spots.spawn = [1, T.top(1, 13), 13]; spots.home = [1, T.top(1, 15.4), 15.4];
    spots.mouth = [-11, T.top(-11, 9), 9];
    spots.chamber = [0, -3.6, -2]; spots.voidStone = [-5, -1.2 + 0.9, -5]; spots.relic = [1, -2.4 + 1.2, -3];
    spots.chest = [5, -3.6, -7]; spots.alcove = [11, -3.6, -5]; spots.light1 = [-3, 1.6, -3]; spots.light2 = [5, 1.6, 1];
    spots.ammo = [-5, T.top(-5, 13), 13]; spots.sign = [-1.6, T.top(-2, 13), 13];
    return { vt, spots, killY: -18 };
  }

  /* ------------------------------------------------------------------ 5: the Broken Citadel */
  function isl5() {
    const vt = newVT(), T = tools(vt), spots = {};
    const ROCK = 'stone#6a6e78', ST = 'stone_bricks#a8acb6';
    T.mass({ cx: -24, cz: 1, R: 9, floor: 2.4, depth: 10, seed: 51, wob: 0.08, side: ROCK, h: () => 2.4, top: 'cobble#8a8e98' });
    T.mass({ cx: 4, cz: -2, R: 12, floor: 4.4, depth: 14, seed: 52, wob: 0.08, side: ROCK, h: () => 4.4, top: 'cobble#8a8e98' });
    T.mass({ cx: 30, cz: -9, R: 9, floor: 8.4, depth: 9, seed: 53, wob: 0.06, side: ROCK,
      h: (x, z) => (Math.hypot(x - 29, z + 9) < 4.5 ? 12.4 : 8.4), top: 'cobble#8a8e98' });
    // the broken bridges (one block missing in each: jump it)
    for (const [x, h] of [[-15, 2.8], [-13, 3.2], [-9, 3.6], [-7, 4.0]]) T.put(x, 1, { h, base: h - 0.8, top: 'planks#8a7a60', side: ST });
    for (let z = -1; z <= 3; z += 2) T.clear(-11, z);
    for (const [x, h] of [[15, 5.6], [17, 6.8], [19, 8.0], [23, 8.0]]) { const c = T.at(x, -9); if (!c || c.h < h) T.put(x, -9, { h, base: h - 0.8, top: 'planks#8a7a60', side: ST }); }
    for (let z = -11; z <= -7; z += 2) T.clear(21, z);
    // the tower on the middle rock (8 × 8 m, 14.4 m tall), its stair winding around the outside
    for (let x = 1; x <= 7; x += 2) for (let z = -5; z <= 1; z += 2) T.setH(x, z, 18.8, { top: ST, side: ST });
    [[1, 3], [3, 3], [5, 3], [7, 3], [9, 3], [9, 1], [9, -1], [9, -3], [9, -5], [9, -7], [7, -7]].forEach(([x, z], k) => T.setH(x, z, 4.4 + 1.2 * (k + 1), { top: ST, side: ST }));
    // the secret room in the tower's foot: its door is a wall you can walk through (west)
    T.carve([[1, -1], [3, -1], [5, -1], [3, -3], [5, -3]], 4.4, 2.8, { open: [[-1, -1], [-1, -3], [-1, 1]], floor: 'planks#6a5a40', side: ST });
    // the far rock's cave, its mouth on the far side (walk round the rim)
    T.carve([[29, -9], [31, -9], [33, -9]], 8.4, 2.6, { open: [[35, -9], [35, -7], [35, -11]], floor: 'cobble', side: ROCK, roofTop: 'cobble#8a8e98' });
    // the climbing stones on the first rock
    [[-29, 7], [-29, 5], [-29, 3], [-27, 3], [-27, 1]].forEach(([x, z], k) => T.setH(x, z, 2.4 + 1.2 * (k + 1), { top: ST, side: ST }));
    spots.spawn = [-21, 2.4, 5]; spots.home = [-24.4, 2.4, 5];
    spots.sigilRoom = [5, 4.4 + 1.0, -2]; spots.room = [4, 4.4, -2]; spots.wallDoor = [0, 4.4, -1];
    spots.sigilCave = [29.5, 8.4 + 1.0, -9]; spots.cave = [31, 8.4, -9];
    spots.sigilStones = [-27, 2.4 + 6.0 + 1.0, 1];
    spots.top = [4, 18.8, -2]; spots.crown = [3, 18.8, -3]; spots.ammo = [12, 4.4, 2];
    spots.sign = [-21, 2.4, 7.6];
    return { vt, spots, killY: -16 };
  }

  const GEN = { isl1, isl2, isl3, isl4, isl5 };
  if (typeof VR === 'undefined' || typeof THREE === 'undefined') { if (typeof module !== 'undefined') module.exports = { GEN, tools }; return; }

  /* ==================================================================
   * the levels
   * ================================================================ */
  const T3 = THREE;
  const cache = {};
  const gen = (id) => cache[id] || (cache[id] = GEN[id]());
  const LOOK = {
    isl1: { ambient: { sky: 0xd8f0c8, ground: 0x5a4a30, intensity: 1.0, background: 0x8cc8ee, fog: [0xc4e4f2, 70, 260] }, sun: { color: 0xfff0d2, intensity: 1.0, dir: [-0.5, 1, 0.4] } },
    isl2: { ambient: { sky: 0xe8f4ff, ground: 0x7a8aa0, intensity: 1.1, background: 0xa8d4f4, fog: [0xdceefa, 60, 240] }, sun: { color: 0xf4f8ff, intensity: 1.05, dir: [0.4, 1, 0.5] } },
    isl3: { ambient: { sky: 0xffe8c8, ground: 0x8a6040, intensity: 1.0, background: 0x9ccaf0, fog: [0xf0dcc0, 80, 280] }, sun: { color: 0xffe2b0, intensity: 1.15, dir: [-0.6, 1, -0.3] } },
    isl4: { ambient: { sky: 0xc8c8f0, ground: 0x3a3048, intensity: 0.9, background: 0x7a9ad8, fog: [0xb0b8e0, 60, 240] }, sun: { color: 0xf0e8ff, intensity: 0.9, dir: [0.3, 1, -0.5] } },
    isl5: { ambient: { sky: 0xd8dcf0, ground: 0x4a4a58, intensity: 0.95, background: 0x8ab0e0, fog: [0xc8d4ec, 70, 280] }, sun: { color: 0xfff4dc, intensity: 1.0, dir: [-0.4, 1, 0.6] } },
  };

  function makeLevel(id, deco) {
    const L = new VR.MissionLevel(id);
    Object.assign(L, LOOK[id]);
    const G = gen(id), { vt, spots } = G;
    vt.build(L);
    L.killY = G.killY; L.safeRespawn = true;
    L.spawn = { pos: [spots.spawn[0], spots.spawn[1] + 0.05, spots.spawn[2]], yaw: spots.spawnYaw !== undefined ? spots.spawnYaw : 0 };
    for (const k in spots) L.anchor(k, spots[k][0], spots[k][1], spots[k][2], 0);
    deco(L, spots, vt);
    let bd = null, sky = null, far0 = 0;
    L.extras.build = (scene, mgr) => {
      bd = new VR.Backdrop(scene); sky = VR.SkyIslands ? new VR.SkyIslands(scene, { haze: LOOK[id].ambient.fog[0], skip: id }) : null;
      far0 = mgr.camera.far; mgr.camera.far = 520; mgr.camera.updateProjectionMatrix();
      L.extras.mgr = mgr;
    };
    L.extras.update = (dt, mgr) => { const c = mgr.camera.position; if (bd) bd.update(dt, c); if (sky) sky.update(c, dt); };
    L.extras.dispose = () => { if (sky) sky.dispose(); sky = null; bd = null; const m = L.extras.mgr; if (m && far0) { m.camera.far = far0; m.camera.updateProjectionMatrix(); } };
    L.extras.terrain = vt; L.extras.spots = spots;
    return L.finish();
  }
  const tree = (L, vt, x, z, leaves = 'leaves', h = 3) => { const y = vt.top(x, z); if (y === null) return; L.box(x - 0.35, y, z - 0.35, x + 0.35, y + h, z + 0.35, 'log'); L.box(x - 1.6, y + h, z - 1.6, x + 1.6, y + h + 1.8, z + 1.6, leaves, false); L.box(x - 0.9, y + h + 1.8, z - 0.9, x + 0.9, y + h + 2.6, z + 0.9, leaves, false); };
  const portalYaw = (sp, home) => Math.atan2(sp[0] - home[0], sp[2] - home[2]);     // the home portal faces the spawn
  const homeAnchor = (L, s) => { const y = portalYaw(s.spawn, s.home); L.anchor('home', s.home[0], s.home[1], s.home[2], y); L.spawn.yaw = y + PI; };
  const signAnchor = (L, s, yaw) => L.anchor('sign', s.sign[0], s.sign[1] + 1.4, s.sign[2], yaw);
  const signPost = (L, s) => { L.box(s.sign[0] - 0.08, s.sign[1], s.sign[2] - 0.08, s.sign[0] + 0.08, s.sign[1] + 1.0, s.sign[2] + 0.08, 'log'); L.box(s.sign[0] - 0.7, s.sign[1] + 1.0, s.sign[2] - 0.06, s.sign[0] + 0.7, s.sign[1] + 1.8, s.sign[2] - 0.02, 'planks', false); };

  VR.MissionEnvironments.isl1 = () => makeLevel('isl1', (L, s, vt) => {
    homeAnchor(L, s); signPost(L, s); signAnchor(L, s, 0);
    // the temple: columns and a broken arch on the podium, the vine curtain over the room's door
    for (const [x, z, h] of [[-6, -12, 4.2], [6, -12, 2.6], [-6, -2, 3.4], [6, -2, 4.2]]) L.box(x - 0.5, 6.0, z - 0.5, x + 0.5, 6.0 + h, z + 0.5, 'stone_bricks#8f9a80');
    L.box(-6.5, 10.2, -12.5, 0.5, 10.8, -11.5, 'stone_bricks#8f9a80', false);
    for (let i = 0; i < 7; i++) L.box(-8.12, 2.4 + (i % 2) * 0.3, -7.9 + i * 0.27, -8.02, 5.6, -7.72 + i * 0.27, VR.Mat.tinted('leaves', 0x4f8a32), false);
    for (let i = 0; i < 10; i++) L.box(-8.1, 4.2 + (i % 3) * 0.3, -12.5 + i * 1.2, -7.9, 6.0, -12.1 + i * 1.2, VR.Mat.tinted('leaves', 0x4f8a32), false);
    L.light(0, 4.4, -8, 0xbfffa0, 10, 9);
    // ruined walls among the trees
    for (const [x0, z0, x1, z1, h] of [[-14, -14, -8, -13, 1.6], [12, -12, 18, -11, 2.4], [-12, 11, -6, 12, 1.2], [8, 9, 9, 15, 2.0]]) L.box(x0, vt.top((x0 + x1) / 2, (z0 + z1) / 2), z0, x1, vt.top((x0 + x1) / 2, (z0 + z1) / 2) + h, z1, 'stone_bricks#8f9a80');
    for (const [x, z] of [[-10, 15], [-2, 18], [12, 4], [-14, -12], [10, -16], [16, 10], [-6, 9]]) tree(L, vt, x, z, VR.Mat.tinted('leaves', 0x4f9a32));
    // vines under the bridge and down the island's edge
    for (let x = 14; x <= 29; x += 1.5) L.box(x, 0.4 - (x % 3), 4.7, x + 0.12, 2.4, 4.82, VR.Mat.tinted('leaves', 0x3f8a2b), false);
    // the islet's tower top: a broken parapet
    L.box(35.4, 14.4, 2.2, 35.8, 15.2, 5.8, 'stone_bricks#9aa088'); L.box(32.2, 14.4, 2.2, 35.8, 15.4, 2.6, 'stone_bricks#9aa088');
  });
  VR.MissionEnvironments.isl2 = () => makeLevel('isl2', (L, s, vt) => {
    homeAnchor(L, s); signPost(L, s); signAnchor(L, s, 0);
    const sm = s.summit;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) L.box(sm[0] + dx - 0.25, sm[1], sm[2] + dz - 0.25, sm[0] + dx + 0.25, sm[1] + 2.4, sm[2] + dz + 0.25, 'ice');
    L.box(sm[0] - 1.7, sm[1] + 2.4, sm[2] - 1.7, sm[0] + 1.7, sm[1] + 2.7, sm[2] + 1.7, 'snow', false);
    L.box(sm[0] - 0.4, sm[1], sm[2] - 0.4, sm[0] + 0.4, sm[1] + 0.8, sm[2] + 0.4, 'ice');
    // icicles in the cave, a cold light
    for (const [x, z] of [[-4, -8], [0, -2], [-6, -2], [0, -8], [-10, -4]]) L.box(x - 0.15, 4.4, z - 0.15, x + 0.15, 5.4, z + 0.15, 'ice', false);
    L.light(...s.caveLight, 0x9fe8ff, 12, 10);
    // the hut on the knob: a shelter of ice and snow (the chest inside)
    const k = s.knob;
    L.box(k[0] - 2.2, k[1], k[2] - 2.6, k[0] + 2.2, k[1] + 2.4, k[2] - 2.2, 'ice'); L.box(k[0] - 2.6, k[1], k[2] - 2.6, k[0] - 2.2, k[1] + 2.4, k[2] + 0.8, 'ice');
    L.box(k[0] - 2.6, k[1] + 2.4, k[2] - 2.6, k[0] + 2.2, k[1] + 2.8, k[2] + 0.8, 'snow', false);
    for (const [x, z] of [[-14, 10], [14, 6], [10, 14], [-10, 14]]) { const y = vt.top(x, z); L.box(x - 0.3, y, z - 0.3, x + 0.3, y + 2.4, z + 0.3, 'log'); L.box(x - 1.3, y + 2.4, z - 1.3, x + 1.3, y + 4.4, z + 1.3, VR.Mat.tinted('pine', 0xe8f4ff), false); }
  });
  VR.MissionEnvironments.isl3 = () => makeLevel('isl3', (L, s, vt) => {
    homeAnchor(L, s); signPost(L, s); signAnchor(L, s, 0);
    // battlements on the walls, banners, a light in the chamber below
    for (let x = -11; x <= 11; x += 4) for (const z of [-11.8, 11.8]) if (Math.abs(x) > 1.5) L.box(x - 0.5, 6.8, z - 0.2, x + 0.5, 7.4, z + 0.2, 'sandstone#d9a070');
    for (let z = -7; z <= 7; z += 4) for (const x of [-11.8, 11.8]) L.box(x - 0.2, 6.8, z - 0.5, x + 0.2, 7.4, z + 0.5, 'sandstone#d9a070');
    for (const x of [-2.2, 2.2]) L.box(x - 0.05, 4.2, 12.02, x + 0.05, 6.4, 12.1, 'iron', false);
    L.box(-1.6, 3.4, 12.05, 1.6, 6.2, 12.12, 'planks#b8763e', false);
    L.light(...s.underLight, 0xffb070, 12, 10);
    for (const [x, z] of [[18, 12], [-20, -8], [16, -16], [-14, 18], [20, 0]]) { const y = vt.top(x, z); L.box(x - 0.35, y, z - 0.35, x + 0.35, y + 2.6, z + 0.35, 'cactus'); }
    for (const [x, z, h] of [[-20, 10, 3.2], [22, -10, 4.0], [-18, -16, 2.4]]) { const y = vt.top(x, z); L.box(x - 1.2, y, z - 1.2, x + 1.2, y + h, z + 1.2, 'sandstone#e39a6a'); }
  });
  VR.MissionEnvironments.isl4 = () => makeLevel('isl4', (L, s, vt) => {
    homeAnchor(L, s); signPost(L, s); signAnchor(L, s, 0);
    const mat = (c, e) => { const m = new T3.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: 0.55 }); m.userData.own = true; return m; };
    const purple = mat(0xa98cff, 0x6a3cff), blue = mat(0x8fd8ff, 0x2a8aff);
    const cone = (x, y, z, h, w, m, down = false, solid = true) => {
      const c = new T3.Mesh(new T3.ConeGeometry(w, h, 5), m); c.geometry.userData.own = true;
      c.position.set(x, down ? y - h / 2 : y + h / 2, z); if (down) c.rotation.x = PI; c.rotation.y = x * 0.7;
      L.group.add(c);
      if (solid && !down) L.collider(x - w * 0.5, y, z - w * 0.5, x + w * 0.5, y + h * 0.8, z + w * 0.5);
    };
    const f = -3.6, roof = f + 7.0;
    for (const [x, z, h, w, m] of [[-6, 4, 3.4, 0.7, purple], [6, -9, 4.0, 0.8, blue], [-7, -9, 2.6, 0.6, purple], [3, 4, 2.2, 0.5, blue], [7, 3, 3.0, 0.6, purple], [-1, -9, 2.0, 0.5, blue]]) cone(x, f, z, h, w, m);
    for (const [x, z, h] of [[-2, -6, 1.8], [4, -2, 2.4], [-5, 0, 1.6], [2, 2, 2.0], [6, -6, 1.4]]) cone(x, roof, z, h, 0.4, purple, true, false);
    // the alcove's mouth: a curtain of crystals you walk through
    for (const [z, h] of [[-6.4, 2.4], [-5.6, 1.8], [-4.8, 2.6], [-4.0, 2.0]]) cone(8.0, f, z, h, 0.32, blue, false, false);
    cone(1, -2.4, -3, 1.2, 0.35, purple, false, false);
    L.light(...s.light1, 0xb090ff, 12, 12); L.light(...s.light2, 0x80c8ff, 10, 11);
    // crystals on the surface (a hint of what is below)
    for (const [x, z, h] of [[-8, -6, 2.6], [6, -10, 3.2], [10, 4, 2.0], [-12, 2, 1.8], [-10, 9.5, 1.4]]) cone(x, vt.top(x, z), z, h, 0.6, x < 0 ? purple : blue);
    for (const [x, z, h] of [[4, -6, 1.6], [-4, -12, 2.4], [12, -6, 1.2]]) { const y = vt.top(x, z); L.box(x - 1, y, z - 1, x + 1, y + h, z + 1, 'stone#7a7a92'); }
  });
  VR.MissionEnvironments.isl5 = () => makeLevel('isl5', (L, s, vt) => {
    homeAnchor(L, s); signPost(L, s); signAnchor(L, s, 0);
    const ST = 'stone_bricks#a8acb6';
    // the false wall: looks like the tower's foot, you walk through it
    L.box(0.0, 4.4, -2.0, 0.12, 7.2, 0.0, ST, false);
    // battlements on the tower top, a gold finial
    for (let x = 0.4; x <= 7.6; x += 1.8) for (const z of [-5.8, 1.8]) L.box(x - 0.35, 18.8, z - 0.2, x + 0.35, 19.6, z + 0.2, ST);
    for (let z = -4.4; z <= 0.8; z += 1.8) for (const x of [0.2, 7.8]) L.box(x - 0.2, 18.8, z - 0.35, x + 0.2, 19.6, z + 0.35, ST);
    L.box(1.0, 18.8, -0.2, 2.0, 21.8, 0.8, ST); L.box(1.2, 21.8, 0.0, 1.8, 22.4, 0.6, 'lamp#ffe14a', false);
    L.light(4, 6.6, -2, 0xffe6a0, 9, 7);
    // broken pieces: half a tower on the far rock, a stump on the first one
    L.box(27.5, 12.4, -11, 29.5, 16.4, -9.4, ST); L.box(-22, 2.4, -6, -20, 5.2, -4, ST);
    // chains hanging from the bridges' broken ends
    for (const [x, z] of [[-12.2, 1], [-9.8, 1], [20.2, -9], [21.8, -9]]) L.box(x - 0.05, 0.4, z - 0.05, x + 0.05, 3.2, z + 0.05, 'iron', false);
  });

  /* ==================================================================
   * the areas
   * ================================================================ */
  const name = (id) => VR.islandById(id).name;
  const coins = (id, pts) => ({ id, type: 'coins', points: pts.map(([x, z]) => [x, null, z]) });
  /** where each island's way home puts you in the square: in front of the way you came */
  const ACCESS = {
    isl1: { pos: [-9.9, 0, -20.75], yaw: 0, scale: 0.62 },        // the vines in the nook behind the courtyard's low gap
    isl2: { pos: [0, 0, -49.4], yaw: PI },                         // the frost stone behind the fountain
    isl3: { pos: [-10.9, 0, -31.62], yaw: PI },                    // the sand wall in the square's south wall (west of the gate)
    isl4: { pos: [23.7, 0, -40.0], yaw: -PI / 2 },                 // the crystal stone on the hidden garden's far wall
    isl5: { pos: [7.3, 0, -23.0], yaw: -PI / 2 },                  // the four sockets in the courtyard
  };
  const backFrom = (id) => {
    const a = ACCESS[id], d = a.scale ? 1.75 : 2.2;
    return { pos: [+(a.pos[0] + Math.sin(a.yaw) * d).toFixed(2), 0.05, +(a.pos[2] + Math.cos(a.yaw) * d).toFixed(2)], yaw: +(a.yaw + PI).toFixed(3) };
  };
  const area = (id, order, o) => Object.assign({
    id, persistent: true, combat: true, order, environment: id, weather: false, view: 'fpp', viewKey: 'exploreView',
    name: name(id), eyebrow: t2('Sky island', 'جزيرة في السماء'), hints: [], rules: [],
  }, o, { entities: [{ id: 'home', type: 'secretPortal', at: 'home', style: 'home', to: 'hub', toAt: backFrom(id), name: t2('The way home', 'طريق العودة') }].concat(o.entities) });
  const chapter = (title, objectives) => ({ objective: title, chapters: [{ title, objectives }] });

  VR.ADVENTURE.areas.isl1 = area('isl1', 11, Object.assign(chapter(t2('Search the ruins', 'فتّش الأطلال'), [
    { text: t2('Find the room the vines hide', 'جد الغرفة التي تخفيها النباتات'), done: 'isl1_room' },
    { text: t2('Climb the islet\'s broken tower', 'تسلّق البرج المكسور في الجزيرة الصغيرة'), done: 'isl1_tower' },
  ]), { intro: t2('Green cliffs, old stones, roots everywhere.', 'منحدرات خضراء، حجارة قديمة، وجذور في كل مكان.'), entities: [
    { id: 'sign', type: 'text', at: 'sign', style: 'chalk', size: 0.09, width: 1.3, title: t2('Mossy board', 'لوح مطحلب'),
      text: t2('The temple keeps its door green.\nThe tower keeps a key for the dark.', 'المعبد يُبقي بابه أخضر.\nوالبرج يحفظ مفتاحًا للظلام.') },
    { id: 'roomRelic', type: 'lootItem', at: 'roomRelic', item: 'relic_ruins' },
    { id: 'roomChest', type: 'lootChest', at: 'roomChest', yaw: -PI / 2, loot: [{ coins: 40 }, { item: 'lemon_ore', n: 2 }, { medkit: 1 }] },
    { id: 'roomZone', type: 'zone', at: 'room', size: [8, 3, 8], flag: 'isl1_room' },
    { id: 'key', type: 'lootItem', at: 'key', item: 'crystal_key' },
    { id: 'towerZone', type: 'zone', at: 'key', size: [5, 3, 5], flag: 'isl1_tower' },
    { id: 'plate', type: 'lootChest', at: 'plate', style: 'cache', loot: [{ coins: 15 }, { item: 'plate_ruins' }] },
    { id: 'smg', type: 'weaponPickup', at: 'podium', weapon: 'smg' },
    { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
    { id: 'isletOre', type: 'lootItem', at: 'islet', offset: [0, 1.0, 0], item: 'sky_crystal' },
    coins('c1', [[-12, 3], [-9, 5], [-6, 6], [-3, 6], [8, 5], [12, 5], [16, 5], [20, 5], [25, 5]]),
  ] }));
  VR.ADVENTURE.areas.isl2 = area('isl2', 12, Object.assign(chapter(t2('Brave the summit', 'تحدَّ القمة'), [
    { text: t2('Find the ice cave', 'جد كهف الجليد'), done: 'isl2_cave' },
    { text: t2('Reach the summit', 'اصعد إلى القمة'), done: 'isl2_summit' },
    { text: t2('Cross the causeway to the knob', 'اعبر الممر الضيق إلى الصخرة البعيدة'), done: 'isl2_knob' },
  ]), { intro: t2('Snow, wind and a long way down.', 'ثلج وريح وطريق طويل إلى الأسفل.'), entities: [
    { id: 'sign', type: 'text', at: 'sign', style: 'chalk', size: 0.09, width: 1.3, title: t2('Frosted board', 'لوح متجمّد'),
      text: t2('The mountain is hollow on its sunset side.\nThe narrow way is not for the dizzy.', 'الجبل مجوّف من جهة الغروب.\nالطريق الضيق ليس لمن يصيبه الدوار.') },
    { id: 'relic', type: 'lootItem', at: 'relic', item: 'relic_frost' },
    { id: 'summitZone', type: 'zone', at: 'summit', size: [6, 4, 6], flag: 'isl2_summit' },
    { id: 'caveChest', type: 'lootChest', at: 'caveChest', style: 'cache', loot: [{ coins: 35 }, { item: 'frost_crystal', n: 2 }] },
    { id: 'cavePlate', type: 'lootItem', at: 'cavePlate', item: 'plate_frost' },
    { id: 'caveZone', type: 'zone', at: 'cave', size: [8, 3, 10], flag: 'isl2_cave' },
    { id: 'sniper', type: 'weaponPickup', at: 'knob', weapon: 'sniper' },
    { id: 'hutChest', type: 'lootChest', at: 'hutChest', loot: [{ coins: 30 }, { item: 'frost_crystal' }, { medkit: 1 }] },
    { id: 'knobZone', type: 'zone', at: 'knob', size: [8, 3, 8], flag: 'isl2_knob' },
    { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
    coins('c1', [[-1, 11], [-3, 9], [-7, 7], [-11, 5], [-14, 1], [-19, -11], [-23, -13], [-27, -17]]),
  ] }));
  VR.ADVENTURE.areas.isl3 = area('isl3', 13, Object.assign(chapter(t2('Search the fortress', 'فتّش الحصن'), [
    { text: t2('Enter the keep', 'ادخل القلعة الوسطى'), done: 'isl3_keep' },
    { text: t2('Find the chamber under the courtyard', 'جد القاعة تحت الساحة'), done: 'isl3_under' },
  ]), { intro: t2('Hot stone, empty walls, nobody home.', 'حجر حار، أسوار خالية، ولا أحد هنا.'), entities: [
    { id: 'sign', type: 'text', at: 'sign', style: 'paint', size: 0.09, width: 1.3, title: t2('Sun-bleached board', 'لوح باهت من الشمس'),
      text: t2('The keep was emptied in a hurry.\nWhat they could not carry, they buried.', 'أُفرغت القلعة على عجل.\nما لم يستطيعوا حمله دفنوه.') },
    { id: 'shotgun', type: 'weaponPickup', at: 'keep', weapon: 'shotgun' },
    { id: 'keepZone', type: 'zone', at: 'keep', size: [4, 3, 6], flag: 'isl3_keep' },
    { id: 'underRelic', type: 'lootItem', at: 'underRelic', item: 'relic_desert' },
    { id: 'underChest', type: 'lootChest', at: 'underChest', style: 'urn', loot: [{ coins: 40 }, { item: 'sun_glass', n: 2 }, { item: 'old_coin' }] },
    { id: 'underZone', type: 'zone', at: 'under', size: [10, 3, 4], flag: 'isl3_under' },
    { id: 'nade', type: 'weaponPickup', at: 'nade', weapon: 'nade' },
    { id: 'towerChest', type: 'lootChest', at: 'towerChest', loot: [{ coins: 25 }, { item: 'plate_desert' }] },
    { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
    coins('c1', [[0, 17], [0, 14], [0, 11], [0, 8], [-9, 6], [-9, 4], [-11, 0], [-11, -4]]),
  ] }));
  VR.ADVENTURE.areas.isl4 = area('isl4', 14, Object.assign(chapter(t2('Go down into the caverns', 'انزل إلى الكهوف'), [
    { text: t2('Reach the crystal chamber', 'اصل إلى قاعة الكريستال'), done: 'isl4_chamber' },
    { text: t2('Find what the crystals hide', 'جد ما تخفيه البلّورات'), done: 'isl4_alcove' },
  ]), { intro: t2('The rock hums. Something glows below.', 'الصخر يطنّ. شيء ما يتوهّج في الأسفل.'), entities: [
    { id: 'sign', type: 'text', at: 'sign', style: 'chalk', size: 0.09, width: 1.3, title: t2('Board', 'لوح'),
      text: t2('Down the dark stair.\nNot every crystal is a wall.', 'انزل الدرج المظلم.\nليست كل بلّورة جدارًا.') },
    { id: 'relic', type: 'lootItem', at: 'relic', item: 'relic_crystal' },
    { id: 'voidStone', type: 'lootItem', at: 'voidStone', item: 'void_stone' },
    { id: 'chest', type: 'lootChest', at: 'chest', style: 'crystal', loot: [{ coins: 50 }, { item: 'sky_crystal', n: 2 }, { item: 'plate_crystal' }] },
    { id: 'chamberZone', type: 'zone', at: 'chamber', size: [12, 4, 12], flag: 'isl4_chamber' },
    { id: 'alcoveChest', type: 'lootChest', at: 'alcove', yaw: -PI / 2, style: 'cache', loot: [{ coins: 30 }, { item: 'void_stone' }, { medkit: 1 }, { nade: true }] },
    { id: 'alcoveZone', type: 'zone', at: 'alcove', size: [4, 3, 3], flag: 'isl4_alcove' },
    { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
    coins('c1', [[-3, 12], [-7, 11], [-11, 9]]),
  ] }));
  VR.ADVENTURE.areas.isl5 = area('isl5', 15, Object.assign(chapter(t2('Wake the crown', 'أيقظ التاج'), [
    { text: t2('Find the three sigils', 'جد الأختام الثلاثة'), done: ['got_sigilRoom', 'got_sigilCave', 'got_sigilStones'] },
    { text: t2('Open the chest at the top of the tower', 'افتح الصندوق في أعلى البرج'), done: 'isl5_crown' },
  ]), { intro: t2('A fortress broken into pieces, still floating.', 'قلعة تكسّرت قطعًا، وما زالت تطفو.'), entities: [
    { id: 'sign', type: 'text', at: 'sign', style: 'paint', size: 0.085, width: 1.3, title: t2('Carved stone', 'حجر منحوت'),
      text: t2('Three sigils wake the crown:\none behind a wall that is not,\none where the stones climb,\none in the far rock\'s back.', 'ثلاثة أختام توقظ التاج:\nواحد خلف جدار ليس جدارًا،\nوواحد حيث تتسلّق الحجارة،\nوواحد في ظهر الصخرة البعيدة.') },
    { id: 'sigilRoom', type: 'lootItem', at: 'sigilRoom', item: 'citadel_sigil' },
    { id: 'sigilCave', type: 'lootItem', at: 'sigilCave', item: 'citadel_sigil' },
    { id: 'sigilStones', type: 'lootItem', at: 'sigilStones', item: 'citadel_sigil' },
    { id: 'crown', type: 'lootChest', at: 'crown', yaw: PI, needs: 'citadel_sigil', needsN: 3, name: t2('The crown chest', 'صندوق التاج'),
      loot: [{ coins: 150 }, { item: 'citadel_crown' }, { item: 'plate_citadel' }] },
    { id: 'topZone', type: 'zone', at: 'top', size: [8, 3, 8], flag: 'isl5_top' },
    { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
    coins('c1', [[-15, 1], [-13, 1], [-9, 1], [-7, 1], [15, -9], [17, -9], [19, -9], [23, -9]]),
  ] }));
  // the crown chest sets a flag when opened (the last objective)
  const chestBuild = VR.Missions.Components.lootChest.build;
  VR.Missions.Components.lootChest.build = function (def, ctx) {
    const e = chestBuild.call(this, def, ctx);
    if (def.id === 'crown' && ctx.mgr.run.def.id === 'isl5') { const use = e.use; e.use = (run) => { use(run); if (VR.Loot.isOpened('isl5:crown') && run) run.setFlag('isl5_crown'); }; }
    return e;
  };

  /* ==================================================================
   * the ways there, in the square
   * ================================================================ */
  VR.ISLAND_ACCESS = [
    { id: 'skyRuins', type: 'secretPortal', pos: ACCESS.isl1.pos, yaw: ACCESS.isl1.yaw, scale: ACCESS.isl1.scale, style: 'vine', to: 'isl1', openOnUse: true,
      name: t2('Thick vines on the wall', 'نباتات كثيفة على الجدار'), hint: t2('Thick vines… there is a draught behind them.', 'نباتات كثيفة… وخلفها تيار هواء.') },
    { id: 'skyFrost', type: 'secretPortal', pos: ACCESS.isl2.pos, yaw: ACCESS.isl2.yaw, style: 'ice', to: 'isl2', needs: { items: ['frost_shard'] },
      name: t2('A cold stone behind the fountain', 'حجر بارد خلف النافورة'), hint: t2('It is cold here, colder than it should be. It wants winter.', 'المكان بارد هنا، أبرد مما ينبغي. يريد الشتاء.') },
    { id: 'skySand', type: 'secretPortal', pos: ACCESS.isl3.pos, yaw: ACCESS.isl3.yaw, style: 'sand', to: 'isl3', openFlag: 'sky_sand_open',
      name: t2('A wall of sand', 'جدار من الرمل'), hint: t2('A patch of the wall is sand, not stone. The panel beside it…', 'جزء من الجدار رمل لا حجر. واللوحة بجانبه…') },
    { id: 'skySandPanel', type: 'buttonPanel', at: 'skySandPanel', symbols: ['lemon', 'moon', 'leaf', 'star', 'sun', 'drop'], solution: ['sun', 'drop', 'moon'], flag: 'sky_sand_open' },
    { id: 'skyCrystal', type: 'secretPortal', pos: ACCESS.isl4.pos, yaw: ACCESS.isl4.yaw, style: 'crystal', to: 'isl4', needs: { items: ['crystal_key'] },
      name: t2('A crystal stone with a keyhole', 'حجر كريستالي فيه ثقب مفتاح'), hint: t2('A dark crystal with a keyhole cut into it.', 'كريستالة داكنة فيها ثقب مفتاح.') },
    { id: 'skyCitadel', type: 'secretPortal', pos: ACCESS.isl5.pos, yaw: ACCESS.isl5.yaw, style: 'citadel', to: 'isl5', needs: { items: ['relic_ruins', 'relic_frost', 'relic_desert', 'relic_crystal'] },
      name: t2('A pedestal with four sockets', 'قاعدة فيها أربعة تجاويف'), hint: t2('Four empty sockets, each a different shape.', 'أربعة تجاويف فارغة، لكلٍّ شكل مختلف.') },
  ];
  const hub = VR.ADVENTURE.areas.hub;
  if (hub && !hub.entities.some(e => e.id === 'skyRuins')) hub.entities.push(...VR.ISLAND_ACCESS);
  // the square: the sand panel's board, and the islands in its sky
  const hubEnv = VR.MissionEnvironments.hub;
  VR.MissionEnvironments.hub = function () {
    const L = hubEnv.apply(this, arguments);
    L.anchor('skySandPanel', -7.4, 1.15, -31.48, PI);
    const vb = new VR.VoxelBuilder();                 // (the level's blocks are already merged: its own little mesh)
    vb.addBox(-7.4, 0.6, -31.45, 2.0, 1.6, 0.1, 'sandstone#c98a5a'); L.group.add(vb.build());
    const ex = L.extras, b0 = ex.build, u0 = ex.update, d0 = ex.dispose;
    let sky = null;
    ex.build = function (scene, mgr) { if (b0) b0.call(this, scene, mgr); sky = VR.SkyIslands ? new VR.SkyIslands(scene, { haze: 0xc8e6f8, distK: 0.62, scale: 0.9 }) : null; };
    ex.update = function (dt, mgr) { if (u0) u0.call(this, dt, mgr); if (sky) sky.update(mgr.camera.position, dt); };
    ex.dispose = function () { if (d0) d0.call(this); if (sky) sky.dispose(); sky = null; };
    return L;
  };

  VR.IslandGen = Object.assign({}, GEN, { ACCESS, backFrom });
})();
