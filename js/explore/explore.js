/* =====================================================================
 * EXPLORATION MODE — the runner's mountain world, on foot.
 *
 * Entered through the secret cave beside the runner route
 * (js/explore/secretcave.js). Same world as the runner — its winding
 * ridge route, its biomes (meadow, forest, lemon village, red desert,
 * bare rock, snow), its block textures, the sea of clouds below and the
 * far peaks — but as solid ground you walk, climb and dig around in,
 * in first person (T: third person). No running, no forced movement.
 *
 * Built from a seed when you enter (nothing of it exists in the runner):
 *   the route ridge (a gravel path south → north, coins along it)
 *   the snow peak (north-west, the highest point: terraces to climb)
 *   the red mesa (east) with a cave into its heart
 *   the forest (west) with a tall tree you can climb
 *   the lemon village (north-east) with a well down to a hidden room
 *   cliffs and ledges under the ridge, a valley with an old ruin
 *   the arrival cave (south) — the way home is there
 *
 * VR.ExploreGen.generate() is pure (no rendering): the level builder
 * uses it, and so do the tests (every find must be reachable).
 * ===================================================================== */
(function () {
  const VT = (typeof VR !== 'undefined' && VR.VoxTerrain) || (typeof require !== 'undefined' ? require('./voxterrain.js') : null);
  const t2 = (en, ar) => ({ en, ar });
  const CELL = 2, N = 80, X0 = -80, Z0 = -80;

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const q = (y, s = 0.4) => Math.round(y / s) * s;

  // the runner's route, as a winding ridge across the map (south → north)
  const ROUTE = [[0, 66], [8, 46], [-4, 26], [6, 6], [-4, -16], [8, -38], [0, -60]];
  function routeInfo(x, z) {
    let best = { d: 1e9, t: 0 };
    let acc = 0, total = 0;
    for (let k = 0; k < ROUTE.length - 1; k++) total += Math.hypot(ROUTE[k + 1][0] - ROUTE[k][0], ROUTE[k + 1][1] - ROUTE[k][1]);
    for (let k = 0; k < ROUTE.length - 1; k++) {
      const [ax, az] = ROUTE[k], [bx, bz] = ROUTE[k + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const u = clamp(((x - ax) * dx + (z - az) * dz) / (L * L), 0, 1);
      const px = ax + dx * u, pz = az + dz * u, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { d, t: (acc + u * L) / total };
      acc += L;
    }
    return best;
  }
  const PEAK = { x: -44, z: -42, h: 30, r: 30 };        // the snow peak
  const MESA = { x: 46, z: 4, h: 15.6, r: 15 };          // the red mesa
  const HILL = { x: -48, z: 30, h: 9, r: 22 };           // the forest hill
  const VILLAGE = { x: 30, z: 48, h: 6.4, r: 16 };       // the lemon terraces

  /** the ground (before caves) */
  function ground(x, z) {
    const n = 1.6 * Math.sin(x * 0.055) * Math.cos(z * 0.047) + 0.8 * Math.sin((x + z) * 0.11);
    let h = 1.2 + n;
    const ri = routeInfo(x, z), ridge = 4 + ri.t * 7;                     // the ridge climbs from 4 m to 11 m
    if (ri.d < 4.2) h = Math.max(h, ridge);
    else if (ri.d < 16) h = Math.max(h, ridge - (ri.d - 4.2) * 0.75);      // its flanks fall away
    // the snow peak: terraces of 1.2 m (each one a jump)
    const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
    if (dp < PEAK.r) h = Math.max(h, q(PEAK.h * Math.pow(1 - dp / PEAK.r, 0.9), 1.2));
    // the mesa: steep sides, a flat top
    const dm = Math.hypot((x - MESA.x) * 0.9, z - MESA.z);
    if (dm < MESA.r) h = Math.max(h, dm < MESA.r - 4 ? MESA.h : MESA.h * (MESA.r - dm) / 4);
    const dh = Math.hypot(x - HILL.x, z - HILL.z);
    if (dh < HILL.r) h = Math.max(h, HILL.h * (1 - dh / HILL.r) + 1.2);
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    if (dv < VILLAGE.r) h = Math.max(h, q(VILLAGE.h - Math.floor(dv / 5) * 1.2, 1.2));
    // the edge of the world: cliffs down to the clouds
    const de = Math.max(Math.abs(x), Math.abs(z));
    if (de > 72) h = -14;
    return clamp(h, -14, 40);
  }
  function biomeAt(x, z, h) {
    if (h >= 18 || Math.hypot(x - PEAK.x, z - PEAK.z) < PEAK.r * 0.55) return 'snow';
    if (x > 24 && z > -30 && z < 30) return 'desert';
    if (x < -24 && z > 4) return 'forest';
    if (x > 8 && z > 32) return 'village';
    if (h > 9) return 'mountains';
    return 'grassland';
  }
  const MATS = {
    grassland: { top: 'grass_top', side: 'stone' }, forest: { top: 'grass_top', side: 'stone' }, village: { top: 'grass_top', side: 'dirt' },
    desert: { top: 'sand', side: 'sandstone#e39a6a' }, mountains: { top: 'gravel', side: 'stone' }, snow: { top: 'snow', side: 'stone' },
  };

  /** the whole world: terrain columns, caves, where everything goes */
  function generate() {
    const vt = new VT({ x0: X0, z0: Z0, nx: N, nz: N, cell: CELL, base: -16 });
    const H = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = vt.cx(i), z = vt.cz(j), h = q(ground(x, z));
      H[j * N + i] = h;
      const b = biomeAt(x, z, h), m = MATS[b];
      const onRoute = routeInfo(x, z).d < 3.2 && h > 3;
      vt.set(i, j, { h, top: onRoute ? 'gravel#d8cdb4' : m.top, side: m.side, biome: b });
    }
    const at = (x, z) => vt.get(...vt.ij(x, z));
    const setH = (x, z, h, extra = {}) => { const [i, j] = vt.ij(x, z), c = vt.get(i, j); if (c) vt.set(i, j, Object.assign({}, c, { h }, extra)); };
    const top = (x, z) => vt.top(x, z);
    const spots = {};
    /**
     * a tunnel / cave / room: cells with air from floorY up ht metres, and rock all around it
     * (neighbours that are lower than the roof are raised, except the openings you walk in by)
     */
    const carve = (cells, floorY, ht, o = {}) => {
      const key = (x, z) => vt.ij(x, z).join(',');
      const inside = new Set(cells.map(([x, z]) => key(x, z))), open = new Set((o.open || []).map(([x, z]) => key(x, z)));
      const roof = floorY + ht;
      for (const [x, z, fy] of cells) {
        const c = at(x, z); if (!c) continue;
        const f = fy !== undefined ? fy : floorY, r = (fy !== undefined ? fy : floorY) + ht;
        vt.set(...vt.ij(x, z), Object.assign({}, c, { h: Math.max(c.h, r + 0.8), gap: [f, r], floorMat: o.floor || 'gravel', side: o.side || c.side, top: c.h > r + 0.8 ? c.top : (o.roofTop || c.top) }));
      }
      for (const [x, z, fy] of cells) for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL], [CELL, CELL], [-CELL, CELL], [CELL, -CELL], [-CELL, -CELL]]) {
        const nx = x + dx, nz = z + dz, k = key(nx, nz); if (inside.has(k) || open.has(k)) continue;
        const n = at(nx, nz); if (!n) continue;
        const r = (fy !== undefined ? fy : floorY) + ht + 0.8;
        if (n.h < r) vt.set(...vt.ij(nx, nz), Object.assign({}, n, { h: r, gap: undefined, side: o.side || 'stone', top: o.roofTop || n.top }));
      }
      return roof;
    };
    // ---- the arrival cave (south): a tunnel into a rocky hill at the start of the route, opening north
    const caveFloor = top(0, 64);
    const caveCells = []; for (let z = 72; z >= 62; z -= 2) for (const x of [-2, 0, 2]) caveCells.push([x, z]);
    carve(caveCells, caveFloor, 3.4, { open: [[-2, 60], [0, 60], [2, 60]], floor: 'gravel', side: 'stone', roofTop: 'grass_top' });
    spots.spawn = [0, caveFloor, 69]; spots.home = [0, caveFloor, 71.4];
    // ---- the desert cave: into the mesa from its west face, a chamber in its heart
    const dFloor = q(top(26, 4));
    const dCells = []; for (let x = 28; x <= 38; x += 2) for (const z of [2, 4]) dCells.push([x, z]);
    for (let x = 40; x <= 48; x += 2) for (let z = -2; z <= 8; z += 2) dCells.push([x, z]);
    carve(dCells, dFloor, 3.6, { open: [[26, 2], [26, 4]], floor: 'sandstone', side: 'sandstone#e39a6a', roofTop: 'sand' });
    spots.desertChest = [46, dFloor, 6]; spots.desertTablet = [48.9, dFloor + 1.6, 1]; spots.desertLight = [44, dFloor + 3.0, 3];
    // ---- the hidden room under the village: a stair down from the well, eastwards, 0.4 m down a cell
    const vTop = q(top(30, 48));
    const vCells = []; let y = vTop;
    for (let k = 0; k < 9; k++) { y = q(vTop - (k + 1) * 0.4); vCells.push([32 + k * 2, 48, y]); }
    const roomY = y;
    for (let x = 50; x <= 56; x += 2) for (let z = 44; z <= 52; z += 2) vCells.push([x, z, roomY]);
    carve(vCells, roomY, 3.0, { open: [[30, 48]], floor: 'planks', side: 'cobble', roofTop: 'grass_top' });
    spots.well = [30, vTop, 48]; spots.roomChest = [54, roomY, 50]; spots.roomLight = [53, roomY + 2.4, 48];
    // ---- the snow summit: the frost shard in a little shrine
    const sTop = top(PEAK.x, PEAK.z);
    spots.summit = [PEAK.x, sTop, PEAK.z]; spots.shard = [PEAK.x, sTop + 1.4, PEAK.z];
    // a winding way up the peak: steps of at most 1.2 m (a jump each) on its south-east side
    for (let k = 0; k <= 26; k++) {
      const a = 0.9 + k * 0.17, r = PEAK.r - 2 - k * 1.05;
      const x = PEAK.x + Math.cos(a) * r, z = PEAK.z + Math.sin(a) * r;
      const want = q(Math.min(sTop, 3 + k * 1.05), 0.4);
      const c = at(x, z); if (c && c.h > want) setH(x, z, want, { top: 'snow' });
      else if (c && c.h < want - 1.2) setH(x, z, want, { top: 'snow' });
    }
    // ---- a ledge under the ridge (drop down onto it): a hidden plate
    spots.ledge = [-12, top(-12, 0), 0];
    // ---- the forest tree with a platform
    spots.tree = [-44, top(-44, 26), 26];
    // ---- other finds
    spots.routeChest = [6, top(6, 50), 50];
    spots.mesaTop = [48, top(48, 4), 4];
    spots.villageChest = [26, top(26, 52), 52];
    spots.ruin = [-20, top(-20, -60), -60];
    spots.pillar = [20, top(20, -20), -20];
    spots.ammo = [3, top(3, 58), 58];
    spots.tablet = [-30, top(-30, -30), -30];
    // a lone pillar with ore on top (reach it by the boulders beside it: a jump each)
    const pg = top(20, -20);
    for (const [dx, h] of [[0, 3.6], [-2, 2.4], [-4, 1.2]]) setH(20 + dx, -20, q(pg + h), { top: 'cobble', side: 'cobble' });
    // a stair cut into the mesa's north side, up to its flat top (steps of 1.2 m: a jump each)
    const stairs = (pts, h0, h1) => { const n = pts.length; pts.forEach(([x, z], k) => { const want = q(h0 + (h1 - h0) * (k + 1) / n, 0.4); const c = at(x, z); if (c) vt.set(...vt.ij(x, z), Object.assign({}, c, { h: want, top: 'sandstone#d9a070', gap: undefined })); }); };
    const mpts = []; for (let x = 67; x >= 47; x -= 2) mpts.push([x, 21]);   // one cell per step along the north side…
    stairs(mpts, top(69, 21), MESA.h);
    for (const z of [19, 17, 15]) setH(47, z, MESA.h, { top: 'sand' });          // …then onto the top
    spots.pillar = [20, top(20, -20), -20];
    return { vt, spots, H };
  }

  if (typeof VR === 'undefined' || typeof THREE === 'undefined') { if (typeof module !== 'undefined') module.exports = { generate, ROUTE, PEAK, MESA }; return; }

  /* ==================================================================
   * the level
   * ================================================================ */
  const T = THREE;
  const PI = Math.PI;
  let GEN = null;
  const gen = () => GEN || (GEN = generate());

  function explore() {
    const L = new VR.MissionLevel('explore');
    L.ambient = { sky: 0xcfe4ff, ground: 0x6a5a40, intensity: 1.0, background: 0x86c8f5, fog: [0xc2e2f7, 90, 300] };
    L.sun = { color: 0xfff0d2, intensity: 1.0, dir: [-0.6, 1, 0.45] };
    const { vt, spots } = gen();
    vt.build(L);
    L.killY = -12; L.safeRespawn = true;
    // invisible walls at the edge of the world (the cliffs to the clouds are for looking at)
    const E = 72, TOP = 80;
    L.collider(-E - 1, -20, -E - 1, E + 1, TOP, -E); L.collider(-E - 1, -20, E, E + 1, TOP, E + 1);
    L.collider(-E - 1, -20, -E, -E, TOP, E); L.collider(E, -20, -E, E + 1, TOP, E);
    // the arrival cave: a lamp, the way home at its back wall
    const sp = spots.spawn;
    L.spawn = { pos: [sp[0], sp[1] + 0.05, sp[2]], yaw: 0 };
    L.light(0, sp[1] + 2.6, 66, 0x9fe8ff, 12, 10);
    L.anchor('home', spots.home[0], spots.home[1], spots.home[2], PI);
    L.anchor('spawnSign', -2.9, sp[1] + 1.5, 67, PI / 2);
    // the route: the start arch, marker stones every so often
    const arch = (x, z, yaw) => {
      const y0 = vt.top(x, z);
      for (const s of [-1, 1]) { const ox = Math.cos(yaw) * s * 3.4, oz = -Math.sin(yaw) * s * 3.4; L.box(x + ox - 0.3, y0, z + oz - 0.3, x + ox + 0.3, y0 + 5, z + oz + 0.3, 'stone_bricks'); }
      L.box(x - 3.7 * Math.abs(Math.cos(yaw)) - 0.3, y0 + 5, z - 3.7 * Math.abs(Math.sin(yaw)) - 0.3, x + 3.7 * Math.abs(Math.cos(yaw)) + 0.3, y0 + 5.6, z + 3.7 * Math.abs(Math.sin(yaw)) + 0.3, 'planks#ffe14a', false);
    };
    arch(2, 56, 0.3);
    // the desert cave: a lamp, the tablet on the back wall, a chest
    L.light(...spots.desertLight, 0xffb070, 14, 12);
    L.box(48.7, spots.desertChest[1], -0.6, 49.1, spots.desertChest[1] + 2.6, 2.6, 'sandstone#c98a5a', false);
    L.anchor('desertTablet', 48.65, spots.desertTablet[1], 1, -PI / 2);
    // the well (the stair starts right beside it) and the room's lamp
    const w = spots.well;
    L.box(w[0] - 1.2, w[1], w[2] - 1.2, w[0] + 1.2, w[1] + 0.9, w[2] - 0.8, 'cobble'); L.box(w[0] - 1.2, w[1], w[2] + 0.8, w[0] + 1.2, w[1] + 0.9, w[2] + 1.2, 'cobble');
    L.box(w[0] - 1.2, w[1], w[2] - 0.8, w[0] - 0.8, w[1] + 0.9, w[2] + 0.8, 'cobble');
    for (const s of [-1, 1]) L.box(w[0] - 0.1, w[1] + 0.9, w[2] + s * 1.0 - 0.1, w[0] + 0.1, w[1] + 2.6, w[2] + s * 1.0 + 0.1, 'log', false);
    L.box(w[0] - 1.3, w[1] + 2.6, w[2] - 1.3, w[0] + 1.3, w[1] + 2.8, w[2] + 1.3, 'planks', false);
    L.light(...spots.roomLight, 0xffc880, 12, 10);
    // the summit shrine
    const s = spots.summit;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) L.box(s[0] + dx - 0.25, s[1], s[2] + dz - 0.25, s[0] + dx + 0.25, s[1] + 2.6, s[2] + dz + 0.25, 'ice');
    L.box(s[0] - 1.7, s[1] + 2.6, s[2] - 1.7, s[0] + 1.7, s[1] + 2.9, s[2] + 1.7, 'snow', false);
    L.box(s[0] - 0.5, s[1], s[2] - 0.5, s[0] + 0.5, s[1] + 0.8, s[2] + 0.5, 'ice');
    L.anchor('summitNote', s[0], s[1] + 1.6, s[2] + 1.41, 0);
    L.box(s[0] - 0.9, s[1] + 0.8, s[2] + 1.15, s[0] + 0.9, s[1] + 2.3, s[2] + 1.35, 'stone', false);
    // the ledge under the ridge: a slab sticking out of the cliff, reached by dropping from the ridge
    const ld = spots.ledge;
    L.box(ld[0] - 2, ld[1] - 0.4, ld[2] - 2, ld[0] + 2, ld[1], ld[2] + 2, 'cobble');
    // the climbing tree: trunk, branches as steps, a platform in the crown
    const tr0 = spots.tree, ty = tr0[1];
    L.box(tr0[0] - 0.5, ty, tr0[2] - 0.5, tr0[0] + 0.5, ty + 9, tr0[2] + 0.5, 'log');
    for (let k = 0; k < 6; k++) { const a = k * 1.7, bx = tr0[0] + Math.cos(a) * 1.2, bz = tr0[2] + Math.sin(a) * 1.2, by = ty + 1.2 + k * 1.3; L.box(bx - 0.5, by, bz - 0.5, bx + 0.5, by + 0.3, bz + 0.5, 'log'); }
    L.box(tr0[0] - 2.2, ty + 9, tr0[2] - 2.2, tr0[0] + 2.2, ty + 9.3, tr0[2] + 2.2, 'planks');
    L.box(tr0[0] - 3.2, ty + 9.3, tr0[2] - 3.2, tr0[0] + 3.2, ty + 12, tr0[2] - 2.4, 'pine', false);
    spots.treeTop = [tr0[0] + 1, ty + 9.3, tr0[2] + 1];
    // forest: pines (trunks collide)
    const r = rng(9);
    for (let k = 0; k < 46; k++) {
      const x = -70 + r() * 46, z = 6 + r() * 60; if (Math.hypot(x - tr0[0], z - tr0[2]) < 5) continue;
      const y0 = vt.top(x, z); if (y0 === null || y0 < 0) continue;
      L.box(x - 0.35, y0, z - 0.35, x + 0.35, y0 + 3, z + 0.35, 'log');
      L.box(x - 1.6, y0 + 3, z - 1.6, x + 1.6, y0 + 4.6, z + 1.6, 'pine', false); L.box(x - 1, y0 + 4.6, z - 1, x + 1, y0 + 5.8, z + 1, 'pine', false);
    }
    // the village: lemon trees and little houses on the terraces
    for (const [x, z] of [[22, 40], [36, 40], [24, 58], [38, 56], [30, 62]]) {
      const y0 = vt.top(x, z); if (y0 === null) continue;
      L.box(x - 0.3, y0, z - 0.3, x + 0.3, y0 + 2.4, z + 0.3, 'log');
      L.box(x - 1.4, y0 + 2.4, z - 1.4, x + 1.4, y0 + 4, z + 1.4, 'lemon_leaves', false);
      L.box(x + 0.6, y0 + 2.2, z + 0.6, x + 1.0, y0 + 2.6, z + 1.0, 'lemon', false);
    }
    for (const [x, z] of [[20, 48], [40, 48]]) { const y0 = vt.top(x, z); L.box(x - 2, y0, z - 2, x + 2, y0 + 3, z + 2, 'planks'); L.box(x - 2.4, y0 + 3, z - 2.4, x + 2.4, y0 + 3.5, z + 2.4, 'brick'); }
    // desert: cacti and rocks
    for (const [x, z] of [[30, -12], [34, 20], [58, -16], [60, 22], [28, 26]]) { const y0 = vt.top(x, z); if (y0 === null) continue; L.box(x - 0.35, y0, z - 0.35, x + 0.35, y0 + 2.6, z + 0.35, 'cactus'); }
    // the old ruin in the southern valley... (north-west valley, actually)
    const ru = spots.ruin, ry = ru[1];
    for (const [dx, dz, h] of [[-4, -4, 3.2], [4, -4, 2], [-4, 4, 1.4], [4, 4, 3.6]]) L.box(ru[0] + dx - 0.5, ry, ru[2] + dz - 0.5, ru[0] + dx + 0.5, ry + h, ru[2] + dz + 0.5, 'stone_bricks');
    L.box(ru[0] - 4.5, ry, ru[2] - 4.5, ru[0] + 4.5, ry + 0.2, ru[2] + 4.5, 'cobble', false);
    // a tablet by the ruin (a hint about the islands)
    const tb = spots.tablet;
    L.box(tb[0] - 0.8, tb[1], tb[2] - 0.2, tb[0] + 0.8, tb[1] + 1.8, tb[2] + 0.2, 'stone');
    L.anchor('islandTablet', tb[0], tb[1] + 1.1, tb[2] + 0.21, 0);
    // anchors for the finds
    const A = (name, p, dy = 0) => L.anchor(name, p[0], p[1] + dy, p[2], 0);
    A('routeChest', spots.routeChest); A('mesaTop', spots.mesaTop); A('villageChest', spots.villageChest); A('desertChest', spots.desertChest);
    A('roomChest', spots.roomChest); A('treeTop', spots.treeTop); A('ledge', spots.ledge); A('pillar', spots.pillar); A('ammo', spots.ammo);
    A('shard', spots.shard); A('ruin', spots.ruin); A('summitChest', [s[0] + 1.6, s[1], s[2] - 0.2]);
    // extras: the runner's sea of clouds and far peaks, and the islands in the sky
    let bd = null, sky = null, far0 = 0;
    L.extras.build = (scene, mgr) => {
      bd = new VR.Backdrop(scene); sky = VR.SkyIslands ? new VR.SkyIslands(scene, { haze: 0xc2e2f7 }) : null;
      far0 = mgr.camera.far; mgr.camera.far = 520; mgr.camera.updateProjectionMatrix();
      L.extras.mgr = mgr;
    };
    L.extras.update = (dt, mgr) => { const c = mgr.camera.position; if (bd) bd.update(dt, c); if (sky) sky.update(c, dt); };
    L.extras.dispose = () => { if (sky) sky.dispose(); sky = null; bd = null; const m = L.extras.mgr; if (m && far0) { m.camera.far = far0; m.camera.updateProjectionMatrix(); } };
    L.extras.terrain = vt; L.extras.spots = spots;
    return L.finish();
  }
  VR.MissionEnvironments.explore = explore;

  /* ==================================================================
   * the area
   * ================================================================ */
  const HUB_PORTAL = { pos: [-7.2, 0.05, -35.4], yaw: -PI / 2 };          // back in the square, in front of the runner portal
  const coinLine = (from, to, n) => { const out = []; for (let k = 0; k < n; k++) { const u = k / (n - 1); out.push([from[0] + (to[0] - from[0]) * u, 0, from[1] + (to[1] - from[1]) * u]); } return out; };
  const EXPLORE = {
    id: 'explore', persistent: true, combat: true, order: 10, environment: 'explore', weather: false,
    view: 'fpp', viewKey: 'exploreView',
    name: t2('The Mountain Route — on foot', 'طريق الجبال — مشيًا'), eyebrow: t2('Exploration', 'استكشاف'),
    intro: t2('The runners never stop here. You can.', 'العدّاؤون لا يتوقّفون هنا أبدًا. أنت تستطيع.'),
    objective: t2('Explore the mountains and find what is hidden', 'استكشف الجبال وجد ما هو مخفي'),
    chapters: [{ title: t2('Explore the mountains and find what is hidden', 'استكشف الجبال وجد ما هو مخفي'), objectives: [
      { text: t2('Climb to the snowy summit', 'اصعد إلى القمة الثلجية'), done: 'got_shard_seen' },
      { text: t2('Find the cave in the red mesa', 'جد المغارة في الهضبة الحمراء'), done: 'read_desertTablet' },
      { text: t2('Find the room under the village', 'جد الغرفة تحت القرية'), done: 'got_roomVisited' },
    ] }],
    hints: [],
    entities: [
      { id: 'home', type: 'secretPortal', at: 'home', style: 'home', to: 'hub', toAt: HUB_PORTAL, name: t2('The way home', 'طريق العودة') },
      { id: 'spawnSign', type: 'text', at: 'spawnSign', style: 'chalk', size: 0.12, width: 1.8, title: t2('Scratched on the wall', 'محفور على الجدار'),
        text: t2('The runners never stop here. You can.\nWalk. Climb. Look under things.\nThe glow behind you leads home.', 'العدّاؤون لا يتوقّفون هنا. أنت تستطيع.\nامشِ. تسلّق. انظر تحت الأشياء.\nالضوء خلفك يعيدك إلى البيت.') },
      { id: 'islandTablet', type: 'text', at: 'islandTablet', style: 'paint', size: 0.1, width: 1.5, title: t2('Old tablet', 'لوح قديم'),
        text: t2('Five islands watch the mountains.\nThe cold one answers to frost.\nThe green one hides behind vines in a low room.', 'خمس جزر تراقب الجبال.\nالباردة تستجيب للصقيع.\nالخضراء تختبئ خلف نباتات في غرفة منخفضة.') },
      { id: 'desertTablet', type: 'text', at: 'desertTablet', style: 'paint', size: 0.2, width: 2.6, title: t2('Carved in the rock', 'منحوت في الصخر'),
        text: t2('1 {sun}   2 {drop}   3 {moon}\nThe square keeps a wall of sand.', '١ {sun}   ٢ {drop}   ٣ {moon}\nفي الساحة جدار من رمل.') },
      { id: 'summitNote', type: 'text', at: 'summitNote', style: 'chalk', size: 0.09, width: 1.6, title: t2('Frozen note', 'ورقة متجمّدة'),
        text: t2('Take the shard down to the square.\nThe fountain has been thirsty for winter.', 'خذ الشظية إلى الساحة.\nالنافورة عطشى للشتاء.') },
      { id: 'c_route1', type: 'coins', points: coinLine([1, 60], [7, 48], 6).map(p => [p[0], 0, p[2]]) },
      { id: 'c_route2', type: 'coins', points: coinLine([-3, 24], [5, 8], 6).map(p => [p[0], 0, p[2]]) },
      { id: 'c_route3', type: 'coins', points: coinLine([-3, -14], [7, -36], 6).map(p => [p[0], 0, p[2]]) },
      // finds
      { id: 'routeChest', type: 'lootChest', at: 'routeChest', yaw: PI / 2, loot: [{ coins: 15 }, { item: 'lemon_ore', n: 2 }] },
      { id: 'ammo', type: 'ammoCrate', at: 'ammo' },
      { id: 'mesaTop', type: 'weaponPickup', at: 'mesaTop', offset: [0, 0, 0], weapon: 'shotgun' },
      { id: 'villageChest', type: 'lootChest', at: 'villageChest', loot: [{ coins: 10 }, { medkit: 1 }] },
      { id: 'desertChest', type: 'lootChest', at: 'desertChest', yaw: -PI / 2, style: 'urn', loot: [{ coins: 25 }, { item: 'sun_glass', n: 2 }, { item: 'old_coin' }] },
      { id: 'roomChest', type: 'lootChest', at: 'roomChest', yaw: -PI / 2, loot: [{ coins: 30 }, { item: 'lemon_ore', n: 3 }, { medkit: 1 }, { nade: true }] },
      { id: 'roomVisited', type: 'zone', at: 'roomChest', size: [8, 4, 10], flag: 'got_roomVisited' },
      { id: 'treeTop', type: 'lootChest', at: 'treeTop', style: 'crate', loot: [{ coins: 20 }, { item: 'sky_crystal' }] },
      { id: 'ledge', type: 'lootItem', at: 'ledge', offset: [0, 1.0, 0], item: 'plate_peak' },
      { id: 'pillar', type: 'lootItem', at: 'pillar', offset: [0, 0.9, 0], item: 'lemon_ore', n: 3 },
      { id: 'ruinSmg', type: 'weaponPickup', at: 'ruin', weapon: 'smg' },
      { id: 'shard', type: 'lootItem', at: 'shard', item: 'frost_shard' },
      { id: 'shardSeen', type: 'zone', at: 'shard', size: [6, 4, 6], flag: 'got_shard_seen' },
      { id: 'summitChest', type: 'lootChest', at: 'summitChest', yaw: PI, style: 'cache', loot: [{ coins: 40 }, { item: 'frost_crystal', n: 2 }, { item: 'sky_crystal' }] },
    ],
    rules: [],
  };
  // coins follow the ground: their height is set when the level is built
  for (const e of EXPLORE.entities) if (e.type === 'coins') e.points = e.points.map(p => [p[0], null, p[2]]);
  const coinsBuild = VR.Missions.Components.coins.build;
  VR.Missions.Components.coins.build = function (def, ctx) {
    if (def.points.some(p => p[1] === null) && ctx.level.extras.terrain) def = Object.assign({}, def, { points: def.points.map(p => (p[1] === null ? [p[0], ctx.level.extras.terrain.top(p[0], p[2]) + 1.0, p[2]] : p)) });
    return coinsBuild.call(this, def, ctx);
  };
  VR.ADVENTURE.areas.explore = EXPLORE;
  VR.ExploreGen = { generate, ROUTE, PEAK, MESA, HUB_PORTAL };
})();
