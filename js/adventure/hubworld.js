/* =====================================================================
 * LEMON SQUARE — the main hub, rebuilt (v1.45, branch feature/hub-redesign).
 *
 * A modern stylized block city instead of the old stone yard: clean
 * coloured blocks (no pixel textures), trims and accents, a gradient sky,
 * soft shadows, glowing portals. The PLACES and the RULES are those of the
 * hub area (js/adventure/hub.js): every entity keeps its id, its flags and
 * what it does; only where it stands and how it looks change.
 *
 *   SOUTH  Arrival — the spawn terrace, the corridor with the wall to jump,
 *          the Courtyard of Marks (chest, key, gate), the hidden nook
 *          (same footprint as before: the first chapter plays the same)
 *   CENTRE Lemon Plaza — the Citrus Spire in its pool, the shop, HOME
 *   WEST   Combat — the training arena (same floor plan and cover), its
 *          stadium gate, the Fight and Challenge portals
 *   EAST   the hidden garden (same) · the Arcade pavilion (basketball, billiards)
 *   NORTH  Story Gateway — the hall of chapter doors (5 missions + sealed
 *          places for new chapters) under a balcony reached by two stairs,
 *          a grand arch with a turning ring
 *   NW     the Portal Terrace — the runner ring, the five sky-island gates
 *          (their own locks and puzzles), a reserved plinth for a new world,
 *          an observation deck
 *   NE     an expansion pad in the arcade
 *
 * All entrances stand on the ground (y 0): every way back from a mission,
 * an island, the runner or a mini-game lands you in front of them.
 * North is -Z. Outer walls carry tall invisible colliders (no burst escapes).
 * ===================================================================== */
(function () {
  const T = THREE;
  const PI = Math.PI;
  const TOP = 40;
  // ---- the palette: few colours, used the same way everywhere
  const P = {
    floor: 0xe9e1d2, floor2: 0xdcd2bf, path: 0x3fb8ad, pathEdge: 0x2b8f87, gold: 0xf2c230, lemon: 0xffd84a,
    wall: 0xf4efe5, wall2: 0xe4ddcf, trim: 0x2f3542, trim2: 0x485063, roof: 0xff7a59, navy: 0x2b3a67, purple: 0x6b4fc0,
    teal: 0x5fd0d8, glass: 0x9fe3ec, grass: 0x7dcb52, grass2: 0x5fb33f, leaf: 0x6cc24a, leaf2: 0x4fa83a, trunk: 0x8b5a3c,
    sand: 0xe6cf9a, slate: 0x3b4252, slate2: 0x434b5c, arena: 0xb7aa96, arena2: 0xa59882, orange: 0xff8a3d, white: 0xfaf7f0,
    water: 0x3fc2d8, waterDeep: 0x2a9fb8, wood: 0xb57f50, wood2: 0x8f5f38, stone: 0xb9b4ab, stripe: 0x2f3542,
  };

  function hubWorld() {
    const L = new VR.MissionLevel('hub');
    L.ambient = { sky: 0xdcecff, ground: 0x8a7a64, intensity: 1.0, background: 0xbfe0ff, fog: [0xf4dfc4, 70, 200] };
    L.sun = { color: 0xfff1da, intensity: 1.05, dir: [0.55, 0.95, 0.4] };
    L.hubV2 = true;
    const vb = new VR.VoxelBuilder();          // clean coloured blocks (lit, shadowed)
    const gb = new VR.VoxelBuilder();          // glowing accents (unlit)
    /** a block from corner to corner, coloured; solid unless told otherwise */
    const B = (x0, y0, z0, x1, y1, z1, col, solid = true) => {
      vb.addColorBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col);
      return solid ? L.collider(x0, y0, z0, x1, y1, z1) : null;
    };
    const G = (x0, y0, z0, x1, y1, z1, col) => gb.addColorBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col);
    /** a wall with a base trim and a cap; its collider goes up to TOP (zone boundaries) */
    const W = (x0, z0, x1, z1, h = 4, col = P.wall, cap = P.trim, tall = true) => {
      B(x0, 0, z0, x1, h, z1, col, false);
      vb.addColorBox((x0 + x1) / 2, 0, (z0 + z1) / 2, (x1 - x0) + 0.06, 0.35, (z1 - z0) + 0.06, P.wall2);          // skirting
      vb.addColorBox((x0 + x1) / 2, h, (z0 + z1) / 2, (x1 - x0) + 0.12, 0.22, (z1 - z0) + 0.12, cap);           // cap
      L.collider(x0, -1, z0, x1, tall ? TOP : h + 0.22, z1);
    };
    /** a floor: one collider, a pattern of tiles on top (visual) */
    const F = (x0, z0, x1, z1, a, b, tile = 2) => {
      L.collider(x0, -0.5, z0, x1, 0, z1);
      vb.addColorBox((x0 + x1) / 2, -0.5, (z0 + z1) / 2, x1 - x0, 0.48, z1 - z0, a);
      if (b === undefined) return;
      for (let x = x0; x < x1 - 1e-6; x += tile) for (let z = z0; z < z1 - 1e-6; z += tile) {
        const i = Math.round((x - x0) / tile) + Math.round((z - z0) / tile);
        vb.addColorBox(Math.min(x + tile, x1) / 2 + x / 2, -0.02, Math.min(z + tile, z1) / 2 + z / 2, Math.min(tile, x1 - x) - 0.06, 0.02, Math.min(tile, z1 - z) - 0.06, i % 2 ? a : b);
      }
    };
    /** stairs from (x0,z0) rising along +dir to height h over `len` metres, width w (steps ≤ 0.4 m: walkable) */
    const STAIRS = (x, z, dx, dz, len, w, h, col = P.wall2, top = P.trim2) => {
      const n = Math.ceil(h / 0.38), d = len / n;
      for (let i = 0; i < n; i++) {
        const y1 = h * (i + 1) / n, a = i * d, b = (i + 1) * d;
        const px0 = x + dx * a, px1 = x + dx * b, pz0 = z + dz * a, pz1 = z + dz * b;
        const xa = dx ? Math.min(px0, px1) : x - w / 2, xb = dx ? Math.max(px0, px1) : x + w / 2;
        const za = dz ? Math.min(pz0, pz1) : z - w / 2, zb = dz ? Math.max(pz0, pz1) : z + w / 2;
        B(xa, 0, za, xb, y1, zb, col);
        vb.addColorBox((xa + xb) / 2, y1 - 0.05, (za + zb) / 2, xb - xa + 0.02, 0.06, zb - za + 0.02, top);
      }
    };
    const tree = (x, z, s = 1, lemons = false) => {
      B(x - 0.25 * s, 0, z - 0.25 * s, x + 0.25 * s, 2.2 * s, z + 0.25 * s, P.trunk);
      B(x - 1.5 * s, 2.0 * s, z - 1.5 * s, x + 1.5 * s, 3.4 * s, z + 1.5 * s, P.leaf, false);
      B(x - 1.05 * s, 3.4 * s, z - 1.05 * s, x + 1.05 * s, 4.3 * s, z + 1.05 * s, P.leaf2, false);
      B(x - 0.55 * s, 4.3 * s, z - 0.55 * s, x + 0.55 * s, 4.8 * s, z + 0.55 * s, P.leaf, false);
      L.collider(x - 1.5 * s, 2.0 * s, z - 1.5 * s, x + 1.5 * s, 4.3 * s, z + 1.5 * s);
      if (lemons) [[1.2, 0.6], [-1.1, -0.8], [0.4, -1.2], [-0.6, 1.2]].forEach(([a, c], k) => { const y = (2.05 + (k % 2) * 0.35) * s; G(x + a * s - 0.17, y - 0.34, z + c * s - 0.17, x + a * s + 0.17, y, z + c * s + 0.17, P.lemon); });
    };
    const planter = (x0, z0, x1, z1, h = 0.6) => {
      B(x0, 0, z0, x1, h, z1, P.wall2);
      vb.addColorBox((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 0.1, 0.08, z1 - z0 + 0.1, P.trim2);
      vb.addColorBox((x0 + x1) / 2, h - 0.05, (z0 + z1) / 2, x1 - x0 - 0.3, 0.12, z1 - z0 - 0.3, P.grass2);
    };
    /** a light pylon: a slim post with a glowing head (and a real light every few) */
    const pylon = (x, z, h = 4.4, light = true, col = 0xfff0c8) => {
      B(x - 0.14, 0, z - 0.14, x + 0.14, h, z + 0.14, P.trim);
      B(x - 0.3, 0, z - 0.3, x + 0.3, 0.35, z + 0.3, P.trim2);
      G(x - 0.24, h, z - 0.24, x + 0.24, h + 0.5, z + 0.24, col);
      vb.addColorBox(x, h + 0.5, z, 0.62, 0.1, 0.62, P.trim);
      if (light) L.light(x, h + 0.2, z, col, 12, 13);
    };
    const bench = (x, z, alongX = true) => {
      const w = alongX ? 2.2 : 0.7, d = alongX ? 0.7 : 2.2;
      B(x - w / 2, 0, z - d / 2, x + w / 2, 0.45, z + d / 2, P.wood);
      vb.addColorBox(x, 0, z, alongX ? w - 0.5 : 0.4, 0.42, alongX ? 0.4 : d - 0.5, P.trim);
    };
    /** a wall panel band (accent stripe) on a wall face */
    const band = (x0, y0, z0, x1, y1, z1, col) => vb.addColorBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col);

    /* ================================================================ ARRIVAL (south) */
    // the spawn terrace (x -9..9, z -1..12): open, bright, a pad to stand on
    F(-9, -1, 9, 12, P.floor, P.floor2, 1.5);
    W(-9.4, -1, -9, 12.4, 3.6); W(9, -1, 9.4, 12.4, 3.6); W(-9.4, 12, 9.4, 12.4, 3.6);
    W(-9.4, -1.4, -1.6, -1, 3.6); W(1.6, -1.4, 9.4, -1, 3.6);                 // north side, the corridor opening
    for (const [x0, x1] of [[-9.0, -1.6], [1.6, 9.0]]) band(x0, 1.2, -1.02, x1, 1.45, -0.98, P.gold);
    // the spawn pad: a ring in the floor, glowing
    B(-2.2, 0, 5.3, 2.2, 0.12, 9.7, P.trim2); B(-1.8, 0.12, 5.7, 1.8, 0.16, 9.3, P.wall2);
    G(-1.9, 0.12, 5.6, 1.9, 0.15, 5.75, P.teal); G(-1.9, 0.12, 9.25, 1.9, 0.15, 9.4, P.teal); G(-1.95, 0.12, 5.6, -1.8, 0.15, 9.4, P.teal); G(1.8, 0.12, 5.6, 1.95, 0.15, 9.4, P.teal);
    planter(-8.6, 9.0, -5.4, 11.6); planter(5.4, 9.0, 8.6, 11.6); tree(-7.0, 10.3, 0.8); tree(7.0, 10.3, 0.8, true);
    bench(-7.6, 4.5, false); bench(7.6, 4.5, false);
    pylon(-8.2, 0.4, 3.6, false); pylon(8.2, 0.4, 3.6, false);
    L.anchor('welcome', -2.9, 1.75, -0.95, 0);
    L.spawn = { pos: [0, 0.2, 7.5], yaw: 0 };

    // ---- the corridor (x -1.6..1.6, z -15..-1) with the low wall to jump (same as before)
    F(-1.6, -15, 1.6, -1, P.floor2, P.floor, 1);
    W(-2.0, -15, -1.6, -1, 3.2); W(1.6, -15, 2.0, -1, 3.2);
    for (const s of [-1, 1]) for (let z = -14; z <= -2; z += 3) G(s * 1.62 - 0.02, 2.4, z - 0.6, s * 1.62 + 0.02, 2.55, z + 0.6, P.teal);
    B(-1.6, 0, -9.0, 1.6, 1.3, -8.4, P.orange);                                   // 1.3 m: needs a jump
    band(-1.6, 1.3, -9.02, 1.6, 1.36, -8.38, P.trim);
    B(-1.6, 0.0, -8.25, 1.6, 0.02, -8.15, P.gold, false);                          // the painted line before it
    L.anchor('wallSign', 0, 0.75, -8.38, 0);

    // ---- the Courtyard of Marks (x -8..8, z -31..-15)
    F(-8, -31.4, 8, -15, P.floor, P.floor2, 2);
    B(-2.0, -0.01, -31, 2.0, 0.01, -15.4, P.path, false);                          // the path to the gate
    W(-8.4, -15.4, -1.6, -15, 4); W(1.6, -15.4, 8.4, -15, 4);
    W(-8.4, -31, -8, -19.6, 4); W(-8.4, -18.4, -8, -15.4, 4); W(8, -31, 8.4, -15.4, 4);
    // the west wall's LOW GAP (1.05 m: crouch or slide) into the hidden nook
    B(-8.4, 1.05, -19.6, -8, 4, -18.4, P.wall, false); L.collider(-8.4, 1.05, -19.6, -8, TOP, -18.4);
    band(-8.42, 1.05, -19.6, -7.98, 1.15, -18.4, P.gold);
    // the nook (x -12..-8.4, z -21..-17), roofed
    F(-12, -21, -8.4, -17, P.wood, P.wood2, 0.6);
    W(-12.4, -21.4, -12, -16.6, 2.4, P.wall2); W(-12.4, -21.4, -8.4, -21, 2.4, P.wall2); W(-12.4, -17, -8.4, -16.6, 2.4, P.wall2);
    B(-12.4, 2.4, -21.4, -8.0, 2.7, -16.6, P.navy, false); L.collider(-12.4, 2.4, -21.4, -8.0, TOP, -16.6);
    B(-11.9, 0, -20.9, -10.9, 1.0, -19.9, P.wood2); B(-11.9, 0, -18.1, -11.1, 0.9, -17.3, P.orange);
    G(-10.5, 2.1, -19.3, -9.9, 2.35, -18.7, 0xffc880); L.light(-10.2, 1.8, -19, 0xffc880, 7, 5);
    L.anchor('nookNote', -11.97, 1.4, -19, PI / 2);
    F(-8.4, -19.6, -8, -18.4, P.floor2);                                          // under the gap
    W(-8.4, -31.4, -2.5, -31, 4.4); W(2.5, -31.4, 8.4, -31, 4.4);                 // north wall, the gate gap 5 m
    B(-2.9, 3.4, -31.5, 2.9, 4.6, -30.9, P.navy, false); L.collider(-2.9, 3.4, -31.5, 2.9, TOP, -30.9);   // the lintel over the gate
    band(-2.9, 3.9, -31.52, 2.9, 4.05, -30.88, P.gold);
    L.anchor('gate', 0, 0, -31.2, 0);
    L.anchor('mark1', 7.95, 1.9, -18.5, -PI / 2);
    L.anchor('mark2', -7.95, 1.9, -25.5, PI / 2);
    L.anchor('mark3', -5.3, 1.9, -30.95, 0);
    L.anchor('chest', 5.4, 0, -27.6, 0);
    B(3.9, 0, -29.0, 6.9, 0.25, -26.4, P.trim2, false);                            // the chest's dais
    vb.addColorBox(5.4, 0.25, -27.7, 2.8, 0.02, 2.4, P.gold);
    L.anchor('chestNote', 5.4, 1.65, -30.95, 0);
    B(4.6, 0.9, -31.0, 6.2, 2.4, -30.97, P.wood, false);                            // the board behind the note
    L.anchor('keyhole', 3.3, 1.3, -30.95, 0);
    // planters for low cover, a lemon tree, lights
    planter(-6.8, -19.0, -4.8, -17.4); planter(4.8, -17.0, 7.4, -15.8, 0.9);
    tree(-4.0, -24.0, 1.0, true);
    L.collider(-4.3, 0, -24.3, -3.7, 2.6, -23.7);
    for (const [x, z] of [[-7.4, -21], [7.4, -24]]) pylon(x, z, 4.2, false);
    band(-8.0, 2.6, -15.42, -1.6, 2.75, -15.38, P.teal); band(1.6, 2.6, -15.42, 8.0, 2.75, -15.38, P.teal);

    /* ================================================================ LEMON PLAZA (centre) */
    F(-14, -64, 14, -31.4, P.floor, P.floor2, 2);
    // teal paths: from the gate to the spire, and a ring around it
    B(-2.2, -0.01, -41.5, 2.2, 0.012, -31.4, P.path, false);
    B(-2.2, -0.01, -64, 2.2, 0.012, -53.5, P.path, false);
    B(-14, -0.01, -48.7, -6.5, 0.012, -46.3, P.path, false); B(6.5, -0.01, -48.7, 14, 0.012, -46.3, P.path, false);
    for (const [x0, z0, x1, z1] of [[-6.5, -54, 6.5, -53.5], [-6.5, -41.5, 6.5, -41], [-6.5, -54, -6, -41], [6, -54, 6.5, -41]]) B(x0, -0.01, z0, x1, 0.014, z1, P.pathEdge, false);
    // boundaries: the courtyard's wall (south), the arena (west), the garden (east)
    W(-14.4, -31.4, -8.4, -31, 4); W(8.4, -31.4, 14.4, -31, 4);
    W(-14.4, -54.4, -14, -44.5, 4.4, P.navy, P.gold); W(-14.4, -41.5, -14, -31.4, 4.4, P.navy, P.gold);   // the arena's east wall
    B(-14.4, 3.2, -44.7, -14, 4.4, -41.3, P.navy, false); L.collider(-14.4, 3.2, -44.7, -14, TOP, -41.3);
    F(-14.4, -44.5, -14, -41.5, P.floor2);
    L.anchor('arenaGate', -14.2, 0, -43, PI / 2);
    W(14, -51, 14.4, -44.5, 4.4); W(14, -41.5, 14.4, -31.4, 4.4);
    B(14, 3.2, -44.7, 14.4, 4.4, -41.3, P.wall, false); L.collider(14, 3.2, -44.7, 14.4, TOP, -41.3);
    F(14, -44.5, 14.4, -41.5, P.floor2);
    L.anchor('gardenGate', 14.2, 0, -43, PI / 2);
    L.anchor('panel', 13.92, 1.15, -39.2, -PI / 2);
    B(13.9, 0.6, -40.2, 14.0, 2.6, -36.2, P.trim2, false);                            // the board for the panel and its note
    L.anchor('panelNote', 13.88, 1.6, -37.0, -PI / 2);
    // the plaza's services and the combat side
    L.anchor('shop', 8.4, 0, -37.6, 0);
    L.anchor('arenaSign', -13.95, 3.75, -43, -PI / 2);
    L.anchor('arenaRespawn', -11.8, 0, -43, PI / 2);
    L.anchor('pistolRack', -12.4, 0, -38.6, PI / 2);
    B(-13.2, 0, -39.4, -11.6, 0.6, -37.8, P.trim2);                                    // the table of the first weapon
    vb.addColorBox(-12.4, 0.6, -38.6, 1.7, 0.05, 1.7, P.orange);
    L.anchor('arenaNote', -13.97, 1.7, -36.4, -PI / 2);
    // the stadium gate of the arena, on the plaza side: two pylons and a banner
    for (const z of [-45.3, -40.7]) { B(-14.0, 0, z - 0.6, -13.0, 6.2, z + 0.6, P.navy); G(-13.02, 0.6, z - 0.42, -12.98, 5.6, z - 0.3, P.orange); G(-13.02, 0.6, z + 0.3, -12.98, 5.6, z + 0.42, P.orange); }
    B(-14.0, 5.0, -45.9, -13.0, 6.2, -40.1, P.navy, false);
    band(-13.02, 5.3, -45.9, -12.98, 5.9, -40.1, P.orange);
    // the Citrus Spire: the landmark in its pool (centre 0,-47.5)
    const SX = 0, SZ = -47.5;
    B(SX - 5.6, 0, SZ - 5.6, SX + 5.6, 0.55, SZ + 5.6, P.wall2, false);              // the pool's rim (outer)
    L.collider(SX - 5.6, 0, SZ - 5.6, SX + 5.6, 0.55, SZ - 5.0); L.collider(SX - 5.6, 0, SZ + 5.0, SX + 5.6, 0.55, SZ + 5.6);
    L.collider(SX - 5.6, 0, SZ - 5.0, SX - 5.0, 0.55, SZ + 5.0); L.collider(SX + 5.0, 0, SZ - 5.0, SX + 5.6, 0.55, SZ + 5.0);
    vb.addColorBox(SX, 0.55, SZ, 11.3, 0.08, 11.3, P.trim2);
    vb.addColorBox(SX, 0.1, SZ, 10.0, 0.32, 10.0, P.waterDeep);
    G(SX - 4.95, 0.42, SZ - 4.95, SX + 4.95, 0.45, SZ + 4.95, P.water);
    L.collider(SX - 5.0, 0, SZ - 5.0, SX + 5.0, 0.42, SZ + 5.0);
    B(SX - 2.2, 0, SZ - 2.2, SX + 2.2, 1.6, SZ + 2.2, P.white);                         // the spire's tiers
    B(SX - 1.7, 1.6, SZ - 1.7, SX + 1.7, 5.4, SZ + 1.7, P.wall);
    B(SX - 1.25, 5.4, SZ - 1.25, SX + 1.25, 9.8, SZ + 1.25, P.white);
    B(SX - 0.8, 9.8, SZ - 0.8, SX + 0.8, 12.6, SZ + 0.8, P.wall);
    for (const y of [1.6, 5.4, 9.8, 12.6]) { const w = y < 2 ? 4.6 : y < 6 ? 3.7 : y < 10 ? 2.8 : 1.9; vb.addColorBox(SX, y - 0.12, SZ, w, 0.24, w, P.trim); G(SX - w / 2 - 0.02, y - 0.35, SZ - w / 2 - 0.02, SX + w / 2 + 0.02, y - 0.25, SZ + w / 2 + 0.02, P.gold); }
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) G(SX + a * 1.71 - (b ? 0.15 : 0.02), 2.0, SZ + b * 1.71 - (a ? 0.15 : 0.02), SX + a * 1.71 + (b ? 0.15 : 0.02), 5.0, SZ + b * 1.71 + (a ? 0.15 : 0.02), P.teal);
    // the lemon on top (stacked blocks rounded) — glowing a little
    for (const [w, y0, h] of [[1.2, 12.6, 0.3], [1.9, 12.9, 0.5], [2.2, 13.4, 1.0], [1.9, 14.4, 0.5], [1.2, 14.9, 0.3], [0.5, 15.2, 0.3]]) G(SX - w / 2, y0, SZ - w * 0.4, SX + w / 2, y0 + h, SZ + w * 0.4, P.lemon);
    B(SX - 0.12, 15.5, SZ - 0.12, SX + 0.12, 15.9, SZ + 0.12, P.trunk, false); B(SX + 0.05, 15.7, SZ - 0.1, SX + 0.75, 15.85, SZ + 0.3, P.leaf, false);
    L.light(SX, 3, SZ + 3, 0xcff4ff, 10, 12);
    L.anchor('spireRing', SX, 8.2, SZ, 0);
    // benches, planters with trees, light pylons around the plaza
    for (const [x, z] of [[-10.5, -36], [10.5, -60], [-10.5, -60]]) { planter(x - 1.6, z - 1.6, x + 1.6, z + 1.6); tree(x, z, 0.9, x > 0); }
    for (const [x, z, ax] of [[-8.6, -52.5, true], [8.6, -52.5, true], [-8.6, -42.5, true], [8.6, -42.5, true]]) bench(x, z, ax);
    for (const [x, z, l] of [[-12.6, -33.2, false], [12.6, -33.2, false], [-12.6, -62.6, false], [12.6, -62.6, false], [-6.8, -47.5, false], [6.8, -47.5, false]]) pylon(x, z, 4.6, l);

    /* ================================================================ STORY GATEWAY (north) */
    F(-24, -76, 24, -64, P.floor2, P.floor, 2);
    B(-3, -0.01, -76, 3, 0.012, -64, P.purple, false);                                   // the purple carpet to the chapters
    W(-24.4, -79.4, 24.4, -79, 14, P.wall, P.gold);                                      // the hall's back wall (tall)
    band(-24.4, 9.5, -79.02, 24.4, 10.2, -78.98, P.purple);
    // the door wall (doors at x -18 … 18 every 6 m), under the balcony
    W(-24.4, -76.4, 24.4, -76, 4.6, P.white, P.trim, false);                              // (its collider stops under the balcony: the balcony is walked on)
    F(-24.4, -79, 24.4, -76.4, P.floor2);                                                 // (behind the doors: never reached, but never a hole)
    band(-24.4, 4.0, -76.02, 24.4, 4.25, -75.98, P.gold);
    L.extras.doors = [];
    const chapters = [-12, -6, 0, 6, 12];
    chapters.forEach((x, i) => {
      B(x - 1.45, 0, -76.0, x + 1.45, 3.4, -75.72, P.navy, false);                      // a tall frame
      B(x - 1.0, 0, -75.75, x + 1.0, 2.8, -75.66, P.purple, false);                      // the door leaf
      G(x - 1.1, 2.9, -75.72, x + 1.1, 3.05, -75.6, P.gold);
      B(x + 0.6, 1.25, -75.68, x + 0.75, 1.4, -75.58, P.gold, false);
      L.anchor('door' + (i + 1), x, 0, -75.74, 0);
      L.anchor('doorMark' + (i + 1), x, 2.15, -75.62, 0);
      L.anchor('doorSign' + (i + 1), x, 3.75, -75.6, 0);
      L.extras.doors.push({ x, z: -75.7 });
    });
    // two sealed places for the chapters to come
    for (const x of [-18, 18]) {
      B(x - 1.45, 0, -76.0, x + 1.45, 3.4, -75.72, P.trim2, false);
      B(x - 1.0, 0, -75.75, x + 1.0, 2.8, -75.66, P.slate, false);
      for (let k = 0; k < 4; k++) B(x - 1.0 + k * 0.55, 0.2 + k * 0.6, -75.64, x - 0.6 + k * 0.55, 0.45 + k * 0.6, -75.6, P.gold, false);   // a hazard band
      L.anchor('soonSign' + (x < 0 ? 'W' : 'E'), x, 3.75, -75.6, 0);
    }
    // the balcony over the doors (y 5) and the stairs up at both ends
    B(-21, 4.6, -79, 21, 5.0, -68, P.wall2);
    vb.addColorBox(0, 5.0, -73.5, 42, 0.04, 11, P.floor);
    for (let x = -21; x < 21; x += 3) vb.addColorBox(x + 1.5, 5.02, -73.5, 2.94, 0.02, 10.9, (x / 3) % 2 ? P.floor : P.floor2);
    for (const x of [-21, -15, -9, -3, 3, 9, 15, 21]) { B(x - 0.4, 0, -68.9, x + 0.4, 4.6, -68.1, P.white); band(x - 0.42, 3.2, -68.92, x + 0.42, 3.35, -68.08, P.gold); }
    B(-21, 5.0, -68.25, 21, 6.05, -68.0, P.trim);                                         // the front rail
    G(-21, 6.05, -68.25, 21, 6.12, -68.0, P.gold);
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -24.2 : 21, xb = s < 0 ? -21 : 24.2;
      STAIRS((xa + xb) / 2, -64, 0, -1, 10, xb - xa, 5.0, P.wall2, P.trim2);
      B(xa, 4.6, -79, xb, 5.0, -74, P.wall2);                                               // the landing
      B(s < 0 ? -24.4 : 24.2, 0, -79, s < 0 ? -24.2 : 24.4, 6.05, -64, P.trim);            // the outer rail
    }
    // the grand arch in front of the hall, with a turning ring
    for (const x of [-7.2, 7.2]) { B(x - 0.8, 0, -66.8, x + 0.8, 13, -65.2, P.white); band(x - 0.82, 0, -66.82, x + 0.82, 0.6, -65.18, P.trim); G(x - 0.82, 1.0, -66.0 - 0.06, x + 0.82, 11.5, -66.0 + 0.06, P.purple); }
    B(-8.0, 11.2, -66.8, 8.0, 13.2, -65.2, P.white, false); band(-8.02, 11.7, -66.82, 8.02, 12.0, -65.18, P.gold);
    L.anchor('storyRing', 0, 7.6, -66.0, 0);
    L.light(0, 6, -66, 0xd7c2ff, 14, 16);
    for (const [x, l] of [[-19.6, false], [19.6, false]]) pylon(x, -63.0, 4.6, l, 0xe6dcff);        // (beside the stairs' foot, not on them)

    /* ================================================================ PORTAL TERRACE (north-west) */
    F(-42.4, -76.4, -14, -54.4, P.slate, P.slate2, 2);
    W(-42.4, -76.4, -24.4, -76, 5, P.slate2, P.teal); W(-42.4, -76.4, -42, -54.4, 5, P.slate2, P.teal);
    W(-42.4, -54.8, -40.4, -54.4, 5, P.slate2, P.teal);
    // glowing circuit lines in the floor
    for (const [x0, z0, x1, z1] of [[-41, -66.1, -15, -65.9], [-26.6, -76, -26.4, -55], [-41, -59.6, -15, -59.4]]) G(x0, 0.005, z0, x1, 0.02, z1, P.teal);
    // the runner portal: a big ring
    L.anchor('portal', -26.5, 0, -74.0, 0);                                          // (clear of the observation deck's stairs)
    L.anchor('runnerRing', -26.5, 3.4, -74.25, 0);
    // the five sky-island gates stand here (positions: js/explore/islandworlds.js ACCESS): a plinth and a frame of light each
    const gateDeck = (x, z, yaw, col) => {                     // (called later, by islandworlds.js: its own little meshes)
      const v = new VR.VoxelBuilder(), g = new VR.VoxelBuilder();
      const box = (bld, x0, y0, z0, x1, y1, z1, c) => bld.addColorBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c);
      const f = [Math.sin(yaw), Math.cos(yaw)], r = [f[1], -f[0]];
      const cx = x - f[0] * 0.4, cz = z - f[1] * 0.4, hw = 2.0, hd = 1.3;
      const ax = Math.abs(r[0]) * hw + Math.abs(f[0]) * hd, az = Math.abs(r[1]) * hw + Math.abs(f[1]) * hd;
      box(v, cx - ax, 0, cz - az, cx + ax, 0.06, cz + az, P.trim2);
      box(g, cx - ax - 0.05, 0.03, cz - az - 0.05, cx + ax + 0.05, 0.08, cz + az + 0.05, col);
      for (const sd of [-1, 1]) {                                                        // two light posts beside it
        const px = x + r[0] * 2.05 * sd, pz = z + r[1] * 2.05 * sd;
        box(v, px - 0.18, 0, pz - 0.18, px + 0.18, 4.0, pz + 0.18, P.trim); L.collider(px - 0.18, 0, pz - 0.18, px + 0.18, 4.0, pz + 0.18);
        box(g, px - 0.12, 0.4, pz - 0.12, px + 0.12, 3.8, pz + 0.12, col);
      }
      L.group.add(v.build(), glowify(g.build()));
    };
    L.extras.islandDeck = gateDeck;
    // (the decks are drawn by explore/islandworlds.js through L.extras.islandDeck, which knows the five gates)
    // the reserved plinth for a new world
    B(-18.4, 0, -63.2, -15.6, 0.4, -60.4, P.trim2); vb.addColorBox(-17, 0.4, -61.8, 2.4, 0.04, 2.4, P.slate);
    for (let k = 0; k < 4; k++) G(-18.3 + k * 0.7, 0.42, -60.5, -18.0 + k * 0.7, 0.46, -60.42, P.gold);
    L.anchor('soonPlinth', -17, 2.2, -61.8, -PI / 2);
    // the observation deck (y 2.4) in the north-west corner, stairs down to the east
    B(-42, 0, -76, -36, 2.4, -71.8, P.slate2); vb.addColorBox(-39, 2.4, -73.9, 6, 0.04, 4.2, P.wall2);
    STAIRS(-30.4, -74.0, -1, 0, 5.6, 2.2, 2.4, P.slate2, P.teal);
    B(-42, 2.4, -71.95, -36, 3.4, -71.8, P.trim); G(-42, 3.4, -71.95, -36, 3.45, -71.8, P.teal);
    pylon(-37.0, -57.0, 4.4, false, 0xc8fbff); pylon(-19.5, -74.6, 4.4, false, 0xc8fbff);

    /* ================================================================ ARCADE (north-east) */
    F(14, -76.4, 32.4, -51, P.navy, 0x33447a, 1.6);
    W(14.4, -51.4, 32.4, -51, 5, P.navy, P.orange); W(32, -76.4, 32.4, -51, 5, P.navy, P.orange); W(24.4, -76.4, 32.4, -76, 5, P.navy, P.orange);
    // a neon canopy along the east wall
    B(26.5, 4.2, -74, 32, 4.5, -53, P.trim, false);
    G(26.45, 4.2, -74, 26.55, 4.5, -53, P.orange);
    for (const z of [-73.6, -63.5, -53.4]) B(26.5, 0, z - 0.2, 26.9, 4.2, z + 0.2, P.trim);
    // arcade cabinets (decoration) and a stage (expansion pad)
    for (const [z, c] of [[-60.5, 0xff5fa2], [-61.7, P.teal], [-62.9, P.lemon]]) { B(31.0, 0, z - 0.5, 32, 1.9, z + 0.5, P.trim); G(30.98, 1.0, z - 0.38, 31.02, 1.7, z + 0.38, c); }
    // (east of the story hall's stairs: the hall reaches x 24.4 north of z -64)
    B(25, 0, -76, 31.8, 1.2, -70.5, P.trim2); vb.addColorBox(28.4, 1.2, -73.25, 6.8, 0.04, 5.5, P.slate);
    STAIRS(28.4, -68.5, 0, -1, 2.0, 3.0, 1.2, P.trim2, P.orange);
    for (let k = 0; k < 8; k++) G(25.2 + k * 0.82, 1.22, -70.7, 25.6 + k * 0.82, 1.26, -70.55, P.gold);
    L.anchor('soonPad', 28.4, 2.8, -75.9, 0);
    pylon(16.2, -53.0, 4.4, false, 0xffd6b0); pylon(26.0, -62.5, 4.4, false, 0xffd6b0);

    /* ================================================================ THE GARDEN (east, hidden; same) */
    F(14.4, -50, 24, -36, P.grass, P.grass2, 1.6);
    W(24, -50.4, 24.4, -35.6, 3.6, P.wall2, P.trim2); W(14.4, -50.4, 24.4, -50, 3.6, P.wall2, P.trim2); W(14.4, -36, 24.4, -35.6, 3.6, P.wall2, P.trim2);
    for (const [x, z] of [[17, -38.2], [21.6, -47.6], [21.8, -38.4]]) tree(x, z, 0.85, true);
    B(19.6, 0, -44.2, 21.4, 0.5, -41.8, P.white); band(19.6, 0.5, -44.2, 21.4, 0.56, -41.8, P.gold);
    L.anchor('gardenPrize', 20.5, 0.5, -43, -PI / 2);
    L.anchor('gardenNote', 23.95, 1.6, -45.6, -PI / 2);
    L.light(20.5, 3, -43, 0xfff2b0, 10, 10);

    /* ================================================================ COMBAT: the training arena (west; same floor plan) */
    arena(L, B, W, F, G, pylon, vb);

    /* ================================================================ the city around (seen, not reached) */
    vb.addColorBox(-5, -1.4, -36, 260, 0.8, 240, 0xcfc6b4);
    const towers = [[-60, -20, 10, 26, P.white], [-58, -90, 14, 34, P.navy], [-20, -100, 18, 40, P.white], [26, -98, 12, 30, P.roof], [52, -70, 12, 24, P.white],
      [56, -30, 10, 18, P.teal], [40, 10, 14, 20, P.white], [-40, 18, 12, 16, P.roof], [0, 30, 20, 12, P.wall2], [-66, -50, 10, 30, P.wall2]];
    for (const [x, z, w, h, c] of towers) {
      vb.addColorBox(x, -1, z, w, h, w, c);
      vb.addColorBox(x, h - 1, z, w + 0.6, 0.6, w + 0.6, P.trim);
      for (let y = 3; y < h - 2; y += 4) vb.addColorBox(x, y, z, w + 0.04, 1.2, w + 0.04, P.glass);
    }

    L.finish();
    const lit = vb.build(), glow = gb.build();
    L.group.add(lit, glowify(glow));
    L.extras.build = (scene, mgr) => buildExtras(L, scene, mgr);
    L.extras.update = (dt, mgr) => updateExtras(L, dt, mgr);
    L.extras.dispose = () => disposeExtras(L);
    return L;
  }

  /* ---- the training arena (x -40..-14.4, z -54..-32): the same floor plan, cover and spots as before */
  function arena(L, B, W, F, G, pylon) {
    F(-40, -54, -14.4, -32, P.arena, P.arena2, 2);
    for (const [x0, z0, x1, z1] of [[-27.3, -54, -27.1, -32], [-40, -43.1, -14.4, -42.9]]) B(x0, -0.01, z0, x1, 0.012, z1, P.white, false);   // painted lines
    W(-40.4, -54.4, -14.4, -54, 5, P.navy, P.orange); W(-40.4, -32, -14.4, -31.6, 5, P.navy, P.orange); W(-40.4, -54, -40, -32, 5, P.navy, P.orange);
    const low = (x0, z0, x1, z1, h = 1.1) => { B(x0, 0, z0, x1, h, z1, P.orange); B(x0 - 0.02, h - 0.12, z0 - 0.02, x1 + 0.02, h, z1 + 0.02, P.trim, false); };
    low(-24.3, -47.5, -23.7, -44.5); low(-24.3, -41.5, -23.7, -38.5);
    low(-31, -52, -28, -51.4); low(-31, -34.6, -28, -34);
    for (const [x, z] of [[-30, -38.5], [-30, -47.5], [-33, -43]]) { B(x - 0.6, 0, z - 0.6, x + 0.6, 3.2, z + 0.6, P.white); B(x - 0.66, 3.0, z - 0.66, x + 0.66, 3.2, z + 0.66, P.navy, false); }
    const crate = (x, z, s) => { B(x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2, P.wood); B(x - s / 2 - 0.02, s * 0.45, z - s / 2 - 0.02, x + s / 2 + 0.02, s * 0.55, z + s / 2 + 0.02, P.wood2, false); };
    crate(-19.5, -40.2, 1.2); crate(-19.4, -46.0, 1.2); crate(-35.6, -50.8, 1.2);
    for (const z of [-33.2, -52.8]) { B(-27.0, 0, z - 0.5, -26.0, 1.2, z + 0.5, P.teal); B(-27.05, 1.0, z - 0.55, -25.95, 1.2, z + 0.55, P.trim, false); }
    // the sniper platform (north-west) with steps and its railing
    B(-39.6, 0, -36.2, -35.4, 2.0, -32.4, P.navy); B(-39.62, 1.88, -36.22, -35.38, 2.0, -32.38, P.orange, false);
    for (let i = 0; i < 5; i++) B(-35.4 + i * 0.5, 0, -35.6, -34.9 + i * 0.5, 2.0 - i * 0.4, -34.0, P.trim2);
    B(-39.6, 2.0, -36.3, -35.4, 2.9, -36.2, P.trim);
    L.anchor('sniperSpot', -37.6, 2.0, -34.2, -PI / 2);
    L.anchor('shotgunSpot', -20.6, 0, -50.4, -PI / 2);
    L.anchor('smgSpot', -20.6, 0, -35.6, -PI / 2);
    L.anchor('nadeSpot', -27.0, 0, -50.2, -PI / 2);
    L.anchor('ammo1', -16.0, 0, -52.6, 0); L.anchor('ammo2', -16.0, 0, -33.4, 0);
    L.anchor('arenaZone', -20.5, 0, -43, 0);
    L.anchor('bell', -16.4, 0, -47.6, 0);
    // floodlight towers in the corners, stands (seen over the walls)
    for (const [x, z, l] of [[-17, -34, false], [-17, -52, true], [-38, -52, false], [-38, -40, true]]) pylon(x, z, 4.6, l, 0xfff4dc);
    for (let r = 0; r < 3; r++) { B(-40.4 - 1.2 * (r + 1), 0, -54.4, -40.4 - 1.2 * r, 5.2 + r * 1.2, -31.6, r % 2 ? P.navy : 0x33447a, false); }
  }

  /** glowing blocks: unlit (they are the light), cast no shadow */
  function glowify(g) {
    g.traverse(o => { if (o.isMesh) { const m = new T.MeshBasicMaterial({ vertexColors: true }); m.toneMapped = false; m.userData.own = true; o.material = m; o.userData.noShadow = true; } });
    return g;
  }
  // ---------------------------------------------------------------- extras: sky, shadows, signs, moving parts
  function skyDome() {
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(0x3d8ff0) }, mid: { value: new T.Color(0x9fd2ff) }, hor: { value: new T.Color(0xffe1bd) }, low: { value: new T.Color(0xe6f0fa) }, sun: { value: new T.Vector3(0.55, 0.5, 0.4).normalize() } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top, mid, hor, low, sun; varying vec3 vD;
        void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.25, y)) : mix(hor, low, smoothstep(0.0, -0.2, y));
          c = mix(c, top, smoothstep(0.25, 0.85, y));
          float s = max(dot(normalize(vD), sun), 0.0); c += vec3(1.0, 0.86, 0.6) * (pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.12);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    mat.toneMapped = false; mat.userData.own = true;
    const m = new T.Mesh(new T.SphereGeometry(90, 32, 16), mat);
    const sc = new T.Scene(); sc.add(m);
    return sc;
  }
  function ring(radius, col, n = 24, size = 0.35) {
    const g = new T.Group(), gb = new VR.VoxelBuilder();
    for (let i = 0; i < n; i++) { const a = i / n * PI * 2; gb.addColorBox(Math.cos(a) * radius, Math.sin(a) * radius - size / 2, 0, size, size, size, col); }
    const mesh = gb.build(); mesh.traverse(o => { if (o.isMesh) { const m = new T.MeshBasicMaterial({ vertexColors: true }); m.toneMapped = false; m.userData.own = true; o.material = m; } });
    g.add(mesh); return g;
  }
  function sign(L, scene, anchor, text, opts = {}) {
    const a = L.anchors[anchor]; if (!a || !VR.WorldText) return null;
    const m = VR.WorldText.make(Object.assign({ text: VR.L(text), style: 'sign', size: 0.22, width: 3.2 }, opts));
    m.position.set(a.pos[0], a.pos[1], a.pos[2]); m.rotation.y = a.yaw; scene.add(m);
    return m;
  }
  const t2 = (en, ar) => ({ en, ar });
  function buildExtras(L, scene, mgr) {
    const x = L.extras.hubFx = { t: 0, scene };
    // the sky: a gradient dome drawn behind the world (with the Mini Planet: js/planet/skyplanet.js)
    x.sky = skyDome(); scene.userData.skyBackdrop = x.sky;
    // soft sun shadows, rendered once (and again when something big moves: a gate opening)
    const r = mgr.game.renderer, sun = scene.children.find(o => o.isDirectionalLight);
    if (sun && r.shadowMap.enabled) {
      sun.castShadow = true;
      const s = sun.shadow; s.mapSize.set(2048, 2048); s.bias = -0.0004; s.normalBias = 0.05; s.radius = 3;
      const cam = s.camera; cam.left = -72; cam.right = 72; cam.top = 72; cam.bottom = -72; cam.near = 1; cam.far = 260; cam.updateProjectionMatrix();
      sun.target.position.set(-5, 0, -38); scene.add(sun.target);
      sun.position.set(-5 + 0.55 * 110, 0.95 * 110, -38 + 0.4 * 110);
      scene.traverse(o => { if (o.isMesh && !o.userData.noShadow && !(o.material && (o.material.transparent || o.material.isMeshBasicMaterial || o.material.isShaderMaterial))) { o.castShadow = true; o.receiveShadow = true; } });
      x.sun = sun; r.shadowMap.needsUpdate = true; x.shadowT = 0.3; x.flags = mgr.run ? mgr.run.flags.size : 0;
    }
    // moving parts: the spire's ring, the story arch's ring, the runner ring
    const add = (anchor, rad, col, n, size) => { const a = L.anchors[anchor]; if (!a) return null; const g = ring(rad, col, n, size); g.position.set(a.pos[0], a.pos[1], a.pos[2]); g.rotation.y = a.yaw; scene.add(g); return g; };
    x.spire = add('spireRing', 3.2, 0xffe680, 28, 0.32); if (x.spire) x.spire.rotation.x = PI / 2;
    x.story = add('storyRing', 3.6, 0xd7c2ff, 32, 0.4);
    x.runner = add('runnerRing', 3.1, 0xffe14a, 30, 0.38);
    // zone signs (big, readable from afar)
    x.signs = [
      sign(L, scene, 'soonSignW', t2('Chapter soon', 'فصل قادم'), { size: 0.2, width: 2.8 }), sign(L, scene, 'soonSignE', t2('Chapter soon', 'فصل قادم'), { size: 0.2, width: 2.8 }),
      sign(L, scene, 'soonPlinth', t2('A new world soon', 'عالم جديد قريبًا'), { size: 0.2, width: 2.6 }), sign(L, scene, 'soonPad', t2('Coming soon', 'قريبًا'), { size: 0.26, width: 3.6 }),
    ];
    const big = (pos, yaw, text, w = 6) => { const m = VR.WorldText && VR.WorldText.make({ text: VR.L(text), style: 'sign', size: 0.42, width: w }); if (!m) return; m.position.set(...pos); m.rotation.y = yaw; scene.add(m); x.signs.push(m); };
    big([0, 12.2, -65.15], 0, t2('STORY', 'القصة'), 7);
    big([-12.95, 5.6, -43], PI / 2, t2('ARENA', 'الساحة'), 5.4);
    big([-26.5, 7.6, -74.3], 0, t2('WORLDS', 'العوالم'), 6);
    big([23, 4.0, -51.45], 0, t2('ARCADE', 'الألعاب'), 6);
  }
  function updateExtras(L, dt, mgr) {
    const x = L.extras.hubFx; if (!x) return;
    x.t += dt;
    if (x.spire) x.spire.rotation.z += dt * 0.35;
    if (x.story) x.story.rotation.z -= dt * 0.25;
    if (x.runner) x.runner.rotation.z += dt * 0.5;
    if (x.sun) {
      const n = mgr.run ? mgr.run.flags.size : 0;
      if (n !== x.flags) { x.flags = n; x.shadowT = 0.8; }                  // a gate may be opening: draw the shadows again for a moment
      if (x.shadowT > 0) { x.shadowT -= dt; mgr.game.renderer.shadowMap.needsUpdate = true; }
    }
  }
  function disposeExtras(L) {
    const x = L.extras.hubFx; if (!x) return;
    if (x.sun) x.sun.castShadow = false;
    if (x.scene && x.scene.userData.skyBackdrop === x.sky) x.scene.userData.skyBackdrop = null;     // (the next world has its own sky)
    if (x.sky) x.sky.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    L.extras.hubFx = null;
  }

  VR.MissionEnvironments.hub = hubWorld;
  VR.HubWorld = { PALETTE: P, version: 2 };
})();
