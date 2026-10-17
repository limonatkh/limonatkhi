/* =====================================================================
 * MAP 2 OF THE FIGHTS — "مصنع الليمون" / Lemon Works (built in v1.46; since
 * v1.44.3 a choice in the Fight menu beside the old sandstone yard, map 1,
 * which stays the default: js/mapchoice.js). Same footprint, same rules.
 * ---------------------------------------------------------------------
 * One map for every fight in js/duel/duel.js: 1v1 against a friend, me vs
 * the computer, me + a friend vs the computer, practice, the loot arena
 * and the Hiroshima sky deck (js/duel/hiroshima.js, 90 m up, unchanged).
 *
 * A modern industrial compound, 23 m × 46 m (W 11.5, LEN 23: the same
 * bounds the mini-map, the abilities and the loot use), mirrored across
 * the centre line: the purple base at +Z, the yellow base at -Z. Three
 * lanes run between them:
 *
 *   WEST    the container alley — 3 m wide between the wall and a row of
 *           containers, roofed in the middle, a low pipe across it on each
 *           side (crouch or slide under): close range, shotguns, knives.
 *   CENTRE  the plaza — the Juice Press tower (the landmark, a lemon on
 *           top) breaks the long line between the bases; low walls,
 *           blocks and a pillar for cover; mid range.
 *   EAST    the catwalk — 2.4 m up along the east wall, from one base's
 *           balcony to the other's, a covered bay over the middle, a
 *           half wall on each side: the longest line (about 40 m), for the
 *           sniper and the DMR — and open to the plaza below. Stairs in
 *           each base and a crate you can jump from lead up to it; under it
 *           runs a low ground lane.
 *
 * Each base has its spawn yard behind a shield wall (no line from one
 * spawn to the other), three ways out (alley, plaza, stairs) and its own
 * colour on the floor, the end wall and the containers of its half, so you
 * always know which half you are in.
 *
 * Movement: steps are 0.34 m (you walk up them), the crates are 1.1 m (a
 * jump), the catwalk is 1.3 m above the crate tops (a jump), the pipes leave
 * 1.15 m (crouch 0.95 m). The computer players walk the stairs and follow a
 * small graph of points (L.extras.nav, used by js/duel/bots.js).
 * Look: clean coloured blocks, glowing accents, a gradient sky, soft sun
 * shadows drawn once (the map does not move), no point lights.
 * ===================================================================== */
(function () {
  const T = THREE;
  const W = 11.5, LEN = 23, H = 11;
  const COLORS = { h: 0x9b6bff, g: 0xffd23a };
  const VERSION = 2;                 // (1 = the old yard) — online players must have the same map: js/duel/duel.js
  const P = {
    floor: 0xd9d3c7, floor2: 0xcfc8ba, asphalt: 0x585f6b, asphalt2: 0x515865, wall: 0xe9e4da, wall2: 0xd5cfc3,
    navy: 0x2b3448, slate: 0x3b4252, steel: 0x8a929e, steel2: 0x6f7784, orange: 0xff8a3d, white: 0xf7f4ee,
    glass: 0x5f84a8, teal: 0x3fe0c8, gold: 0xffc84a, lemon: 0xffe14a,
    tint: { h: 0xdcd2f2, g: 0xf3e6bc }, deep: { h: 0x6c48c8, g: 0xe0a91c },
    box: { h: [0x3f6fa8, 0xc65a3a], g: [0x4c8f5a, 0xd9a441] },        // the containers of each half
  };

  function build() {
    const L = new VR.MissionLevel('arena');
    L.ambient = { sky: 0xdcecff, ground: 0x8a7a64, intensity: 0.95, background: 0xbfe0ff, fog: [0xe4ecf4, 80, 230] };
    L.sun = { color: 0xfff1da, intensity: 1.05, dir: [0.5, 1, 0.32] };
    const vb = new VR.VoxelBuilder(), gb = new VR.VoxelBuilder(), flo = new VR.VoxelBuilder();   // (the floor: its own mesh, drawn after the rest)
    const box = (b, x0, y0, z0, x1, y1, z1, col) => b.addColorBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col);
    /** a block (solid unless told otherwise) */
    let surf = 'concrete';                           // the surface of the next colliders (steps and impacts: js/duel/feedback.js)
    const as = (m, fn) => { const k = surf; surf = m; try { fn(); } finally { surf = k; } };
    const B = (x0, y0, z0, x1, y1, z1, col, solid = true) => { box(vb, x0, y0, z0, x1, y1, z1, col); if (!solid) return null; const c = L.collider(x0, y0, z0, x1, y1, z1); c.mat = surf; return c; };
    const G = (x0, y0, z0, x1, y1, z1, col) => box(gb, x0, y0, z0, x1, y1, z1, col);
    /** both halves: the piece at +Z for purple ('h'), mirrored to -Z for yellow ('g'). col may be (side) => colour */
    const M = (fn) => { fn(1, 'h'); fn(-1, 'g'); };
    const zr = (s, z0, z1) => (s > 0 ? [z0, z1] : [-z1, -z0]);
    const Bm = (s, x0, y0, z0, x1, y1, z1, col, solid = true) => { const [a, b] = zr(s, z0, z1); return B(x0, y0, a, x1, y1, b, col, solid); };
    const Gm = (s, x0, y0, z0, x1, y1, z1, col) => { const [a, b] = zr(s, z0, z1); G(x0, y0, a, x1, y1, b, col); };
    const nav = [], links = [];
    const node = (x, y, z) => { nav.push([x, y, z]); return nav.length - 1; };

    /* ---------------------------------------------------------------- the floor */
    L.collider(-W - 1, -1, -LEN - 1, W + 1, 0, LEN + 1).mat = 'concrete';
    // (one layer of floor everywhere — tiles with their grout as thin strips — so no pixel of the floor is drawn twice)
    for (let x = -8.4; x < 9.3 - 1e-6; x += 2.35) for (let z = -LEN; z < LEN - 1e-6; z += 2) {
      const i = Math.round((x + 8.4) / 2.35) + Math.round((z + LEN) / 2), x1 = Math.min(x + 2.35, 9.3), z1 = Math.min(z + 2, LEN);
      const base = Math.abs(z + 1) > 16.2 ? (z > 0 ? 'h' : 'g') : null;                // the bases' own colour
      box(flo, x, -0.3, z, x1, 0, z1, base ? (i % 2 ? P.tint[base] : new T.Color(P.tint[base]).multiplyScalar(0.96).getHex()) : (i % 2 ? P.floor : 0xd4cdc0));
      box(flo, x, 0, z - 0.015, x1, 0.002, z + 0.015, P.floor2); box(flo, x - 0.015, 0, z, x + 0.015, 0.002, z1, P.floor2);
    }
    box(flo, -W, -0.3, -LEN, -8.4, 0.004, LEN, P.asphalt);                  // the alley: asphalt
    box(flo, 9.3, -0.3, -LEN, W, 0.004, LEN, P.asphalt2);                   // under the catwalk
    for (let z = -LEN + 1; z < LEN; z += 3) box(vb, -9.98, 0.004, z, -9.92, 0.008, z + 1.6, P.gold);   // the alley's centre dashes
    box(vb, -8.4, 0.004, -LEN, -8.3, 0.01, LEN, P.orange); box(vb, 9.2, 0.004, -LEN, 9.3, 0.01, LEN, P.orange);
    G(-6, 0.003, -0.08, 9.2, 0.012, 0.08, P.lemon);                         // the centre line
    M((s, k) => {
      Bm(s, -8.4, 0.002, 16.95, 9.3, 0.008, 17.1, P.deep[k], false);          // where the base starts
      Gm(s, -2.4, 0.006, 19.0, 2.4, 0.02, 19.12, COLORS[k]); Gm(s, -2.4, 0.006, 22.1, 2.4, 0.02, 22.22, COLORS[k]);    // the spawn pad
      Gm(s, -2.4, 0.006, 19.0, -2.28, 0.02, 22.22, COLORS[k]); Gm(s, 2.28, 0.006, 19.0, 2.4, 0.02, 22.22, COLORS[k]);
    });

    /* ---------------------------------------------------------------- the walls: modern facades */
    const T2 = 0.8;
    B(-W - T2, 0, -LEN - T2, W + T2, H, -LEN, P.wall); B(-W - T2, 0, LEN, W + T2, H, LEN + T2, P.wall);
    B(-W - T2, 0, -LEN, -W, H, LEN, P.wall); B(W, 0, -LEN, W + T2, H, LEN, P.wall);
    L.collider(-W - 2, H, -LEN - 2, W + 2, 140, -LEN); L.collider(-W - 2, H, LEN, W + 2, 140, LEN + 2);      // (up past the sky deck: no standing on top)
    L.collider(-W - 2, H, -LEN, -W, 140, LEN); L.collider(W, H, -LEN, W + 2, 140, LEN);
    for (const sx of [-1, 1]) {                      // the long walls: skirting, a band, a window strip with mullions, a cornice
      const face = (d) => (sx < 0 ? [-W - 0.02, -W + d] : [W - d, W + 0.02]);       // a layer d deep on the inner face
      const [a6, b6] = face(0.06), [a1, b1] = face(0.1), [a2, b2] = face(0.16);
      box(vb, a1, 0, -LEN, b1, 0.45, LEN, P.slate);
      box(vb, a1, 3.2, -LEN, b1, 3.45, LEN, P.navy);
      box(vb, a6, 6.0, -LEN, b6, 7.6, LEN, P.glass);
      for (let z = -LEN + 2; z < LEN; z += 3) box(vb, a1, 6.0, z - 0.1, b1, 7.6, z + 0.1, P.navy);
      box(vb, a2, H - 0.5, -LEN, b2, H + 0.3, LEN, P.navy);
    }
    M((s, k) => {                                     // the end walls: the base colour, a big glowing stripe
      const face = (d) => (s > 0 ? [LEN - d, LEN + 0.02] : [-LEN - 0.02, -LEN + d]);
      const [z0, z1] = face(0.06), [c0, c1] = face(0.1), [d0, d1] = face(0.16);
      box(vb, -W, 0, c0, W, 0.45, c1, P.slate);
      box(vb, -W, 2.2, c0, W, 2.7, c1, COLORS[k]);
      box(vb, -W, H - 0.5, d0, W, H + 0.3, d1, P.navy);
      G(-6, 4.2, s > 0 ? LEN - 0.1 : -LEN + 0.04, 6, 4.5, s > 0 ? LEN - 0.04 : -LEN + 0.1, COLORS[k]);
      box(vb, -4.6, 5.0, z0, 4.6, 9.0, z1, P.deep[k]);                          // the banner (the lemon on it: below)
    });
    for (const x of [-W, W]) for (const z of [-LEN, LEN]) { B(x - 1.1, 0, z - 1.1, x + 1.1, H + 1.2, z + 1.1, P.navy); G(x - 1.14, H + 0.5, z - 1.14, x + 1.14, H + 0.7, z + 1.14, P.lemon); }

    /* ---------------------------------------------------------------- WEST: the container alley */
    const container = (x0, z0, x1, z1, col, h = 2.6, y0 = 0) => {
      as('metal', () => B(x0, y0, z0, x1, y0 + h, z1, col));
      const dk = new T.Color(col).multiplyScalar(0.78).getHex(), y1 = y0 + h;
      if (z1 - z0 >= x1 - x0) for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.55) { box(vb, x0 - 0.04, y0 + 0.1, z, x0, y1 - 0.1, z + 0.18, dk); box(vb, x1, y0 + 0.1, z, x1 + 0.04, y1 - 0.1, z + 0.18, dk); }
      else for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.55) { box(vb, x, y0 + 0.1, z0 - 0.04, x + 0.18, y1 - 0.1, z0, dk); box(vb, x, y0 + 0.1, z1, x + 0.18, y1 - 0.1, z1 + 0.04, dk); }
      box(vb, x0 - 0.05, y1 - 0.12, z0 - 0.05, x1 + 0.05, y1 + 0.02, z1 + 0.05, dk);
    };
    M((s, k) => {
      const [a, b] = zr(s, 3, 7.2), [c, d] = zr(s, 8.6, 13);
      container(-8.4, a, -6.0, b, P.box[k][0]); container(-8.4, c, -6.0, d, P.box[k][1]);
      // the duct across the alley (1.15 m clear: crouch or slide under it; it blocks the long view down the alley)
      as('metal', () => Bm(s, -W, 1.15, 9.2, -8.4, 2.1, 9.8, P.steel));
      Bm(s, -W, 1.13, 9.15, -10.9, 2.12, 9.85, P.orange, false); Bm(s, -9.0, 1.13, 9.15, -8.4, 2.12, 9.85, P.orange, false);
      Bm(s, -W, 1.12, 9.18, -8.4, 1.18, 9.82, P.steel2, false);
      Gm(s, -W + 0.05, 0.004, 9.0, -8.45, 0.012, 9.12, P.orange);
      // the posts holding the roof at the middle opening
      Bm(s, -8.68, 0, 2.85, -8.38, 3.0, 3.15, P.navy);
    });
    B(-W, 3.0, -5, -8.38, 3.3, 5, P.slate); box(vb, -W, 3.3, -5.05, -8.3, 3.42, 5.05, P.orange);       // the roof over the middle
    G(-10.1, 2.96, -4.6, -9.8, 3.0, 4.6, P.teal);
    // a second roof layer over the containers' row in the middle (a covered crossing)
    B(-8.38, 2.6, -3, -6.0, 3.3, 3, P.navy);

    /* ---------------------------------------------------------------- CENTRE: the plaza */
    // the Juice Press tower: the landmark (a lemon on top, readable from everywhere)
    B(-1.6, 0, -1.6, 1.6, 5.2, 1.6, P.slate);
    box(vb, -1.65, 0, -1.65, 1.65, 0.45, 1.65, P.navy);
    box(vb, -1.66, 2.4, -1.66, 1.66, 2.8, 1.66, P.orange);
    box(vb, -1.7, 5.2, -1.7, 1.7, 5.45, 1.7, P.navy);
    G(-1.68, 4.6, -1.68, 1.68, 4.75, 1.68, P.lemon);
    if (VR.Props && VR.Props.lemon) VR.Props.lemon(L.vb, 0, 5.45, 0, 2.6, true);
    // the centre containers (east of the tower: two stacked, they break the diagonal lines between the bases)
    container(4.2, -1.3, 8.0, 1.3, 0x2f8f8a); container(4.5, -1.1, 7.7, 1.1, 0x3b4252, 2.0, 2.6);
    // the generator under the catwalk's middle bay (the ground lane under the catwalk does not run through)
    as('metal', () => B(9.3, 0, -1.2, W, 2.2, 1.2, P.slate)); box(vb, 9.28, 0.6, -1.0, 9.3, 1.6, 1.0, P.steel2); G(9.26, 1.75, -1.0, 9.29, 1.85, 1.0, P.orange);
    // the Hiroshima grenades lie under open sky, both on the centre line (equal for both sides)
    L.extras.hiroSpots = [[-4.0, 0], [2.9, 0]];
    M((s, k) => {
      // the spawn's shield wall: no line from one spawn to the other
      Bm(s, -3.2, 0, 15.4, 3.2, 3.2, 16.0, P.white);
      Bm(s, -3.25, 0, 15.35, 3.25, 0.4, 16.05, P.slate, false); Bm(s, -3.25, 3.2, 15.35, 3.25, 3.4, 16.05, P.navy, false);
      Gm(s, -3.0, 1.6, 15.33, 3.0, 1.75, 15.37, COLORS[k]); Gm(s, -3.0, 1.6, 16.03, 3.0, 1.75, 16.07, COLORS[k]);
      // chest-high barrier, a block, a pillar, two low walls
      const low = (x0, z0, x1, z1, h = 1.15) => { Bm(s, x0, 0, z0, x1, h, z1, P.white); Bm(s, x0 - 0.02, h - 0.12, z0 - 0.02, x1 + 0.02, h, z1 + 0.02, P.orange, false); };
      low(-5.2, 11.4, -2.4, 12.0);
      low(-5.4, 3.8, -2.8, 4.4, 1.2);
      low(1.8, 5.0, 4.0, 5.6, 1.2);
      Bm(s, 2.5, 0, 9.5, 4.3, 2.2, 11.3, P.slate); Bm(s, 2.45, 2.0, 9.45, 4.35, 2.2, 11.35, P.orange, false);
      Bm(s, -1.4, 0, 6.6, -0.2, 3.6, 7.8, P.navy); Gm(s, -1.42, 3.0, 6.58, -0.18, 3.1, 7.82, P.teal);
      // a tall billboard wall off the containers (head cover; it breaks the long line down the west of the plaza)
      Bm(s, -6.0, 0, 5.9, -3.4, 2.8, 6.5, P.navy); Bm(s, -6.02, 2.6, 5.88, -3.38, 2.8, 6.52, P.orange, false);
      Gm(s, -5.8, 1.0, s > 0 ? 6.52 : 6.52, -3.6, 2.2, 6.56, COLORS[k]);
    });

    /* ---------------------------------------------------------------- EAST: stairs, balconies, the catwalk */
    const RAIL = 0.95;
    const rail = (x0, z0, x1, z1, y) => {                         // a railing: a solid band you can see over, a top bar
      as('metal', () => B(x0, y, z0, x1, y + RAIL, z1, P.steel2));
      box(vb, x0 - 0.03, y + RAIL - 0.08, z0 - 0.03, x1 + 0.03, y + RAIL + 0.02, z1 + 0.03, P.orange);
    };
    const railM = (s, x0, z0, x1, z1, y) => { const [a, b] = zr(s, z0, z1); rail(x0, a, x1, b, y); };
    M((s, k) => {
      // stairs from the plaza (z 12.8) up to the balcony (z 17), 7 steps of 0.34 m
      const n = 7, d = 4.2 / n;
      for (let i = 0; i < n; i++) {
        const y1 = 2.4 * (i + 1) / n, z0 = 12.8 + i * d, z1 = 12.8 + (i + 1) * d;
        as('metal', () => Bm(s, 6.4, 0, z0, 8.6, y1, z1, P.wall2));
        Bm(s, 6.38, y1 - 0.06, z0, 8.62, y1, z1, i % 2 ? P.slate : P.navy, false);
      }
      Gm(s, 6.36, 0.2, 12.8, 6.4, 0.3, 17.0, COLORS[k]);
      // the balcony over the base's east corner, its posts and railing
      as('metal', () => Bm(s, 6.0, 2.2, 17.0, W, 2.4, LEN, P.slate));
      Bm(s, 5.98, 2.38, 16.98, W, 2.44, LEN, P.wall2, false);
      Bm(s, 6.0, 0, 22.5, 6.4, 2.2, 22.9, P.navy);
      railM(s, 6.0, 17.6, 6.14, 22.6, 2.4);
      railM(s, 8.6, 17.0, 9.3, 17.14, 2.4);
      Gm(s, 6.02, 2.16, 17.0, W, 2.2, 17.06, COLORS[k]);
      // the catwalk (x 9.3..11.5, from the balcony to the middle bay)
      as('metal', () => Bm(s, 9.3, 2.2, 2.5, W, 2.4, 17.0, P.slate));
      Bm(s, 9.28, 2.38, 2.5, W, 2.44, 17.0, P.wall2, false);
      for (const z of [3, 9, 15]) Bm(s, 11.0, 0, z - 0.25, W, 2.2, z + 0.25, P.navy);
      railM(s, 9.3, 2.5, 9.44, 5.3, 2.4); railM(s, 9.3, 6.7, 9.44, 17.0, 2.4);       // (the gap at z 5.3..6.7: the crate jump)
      Bm(s, 10.5, 2.4, 8.6, W, 3.5, 9.4, P.white); Bm(s, 10.48, 3.38, 8.58, W, 3.5, 9.42, P.orange, false);   // a half wall on the catwalk
      Gm(s, 9.32, 2.16, 2.5, 9.36, 2.2, 17.0, P.teal);
      // the crate to jump from, and two crates under the catwalk
      const crate = (x, z, w, h, col) => { as('planks', () => Bm(s, x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, col)); Bm(s, x - w / 2 - 0.02, h * 0.45, z - w / 2 - 0.02, x + w / 2 + 0.02, h * 0.55, z + w / 2 + 0.02, P.navy, false); };
      crate(7.9, 6.0, 1.4, 1.1, P.box[k][1]);
      crate(10.2, 11.0, 1.2, 1.1, P.box[k][0]);
      Bm(s, 8.6, 0, 3.6, 10.4, 2.0, 4.2, P.white); Bm(s, 8.58, 1.86, 3.58, 10.42, 2.0, 4.22, P.orange, false);   // a tall barrier under the catwalk's edge (a way past it by the wall)
    });
    // the middle bay of the catwalk (over the centre line), railed on the plaza side
    as('metal', () => B(7.8, 2.2, -2.5, W, 2.4, 2.5, P.slate)); B(7.78, 2.38, -2.5, W, 2.44, 2.5, P.wall2, false);
    rail(7.8, -2.5, 7.94, 2.5, 2.4); rail(7.8, 2.36, 9.3, 2.5, 2.4); rail(7.8, -2.5, 9.3, -2.36, 2.4);
    B(10.2, 2.4, -0.7, W, 3.4, 0.7, P.navy);                                         // cover against the wall
    G(7.82, 2.16, -2.5, 7.86, 2.2, 2.5, P.teal);

    /* ---------------------------------------------------------------- the lemons of the brand (decoration), the skyline */
    if (VR.Props && VR.Props.lemon) { VR.Props.lemon(L.vb, 0, 6.2, LEN - 0.3, 2.2, true); VR.Props.lemon(L.vb, 0, 6.2, -LEN + 0.3, 2.2, true); }
    const towers = [[-34, -50, 14, 34, P.white], [-30, 10, 12, 22, P.navy], [-44, 52, 16, 40, P.wall2], [-26, 60, 10, 18, P.white], [32, -60, 16, 42, P.navy],
      [36, -8, 12, 26, P.white], [30, 44, 14, 30, P.wall2], [48, 18, 12, 46, P.slate], [-52, -12, 14, 28, P.white], [6, 64, 18, 24, P.slate], [-8, -66, 18, 30, P.white]];
    const far = new VR.VoxelBuilder();               // (seen over the walls only: no shadows)
    for (const [x, z, w, h, c] of towers) {
      box(far, x - w / 2, -1, z - w / 2, x + w / 2, h, z + w / 2, c);
      box(far, x - w / 2 - 0.3, h, z - w / 2 - 0.3, x + w / 2 + 0.3, h + 0.6, z + w / 2 + 0.3, P.navy);
      for (let y = 3; y < h - 2; y += 4) box(far, x - w / 2 - 0.02, y, z - w / 2 - 0.02, x + w / 2 + 0.02, y + 1.2, z + w / 2 + 0.02, P.glass);
    }
    box(far, -90, -1.4, -90, 90, -0.8, 90, 0xcfc6b4);

    /* ---------------------------------------------------------------- spawns */
    L.extras.spawns = {
      h: { pos: [0, 0.05, LEN - 2.4], yaw: 0 },
      g: { pos: [0, 0.05, -LEN + 2.4], yaw: Math.PI },
    };
    // random round starts: free spots in each base (the yellow side is the purple side mirrored)
    const pts = [[0, 20.6], [-4, 20.4], [4, 20.2], [-9.8, 20.5], [-9.8, 15.5], [9.8, 20.5], [-5.2, 17.6], [4.6, 17.4], [-1.8, 18.4], [10.4, 14.0]];
    L.extras.spawnPts = { h: pts.map(([x, z]) => [x, z]), g: pts.map(([x, z]) => [x, -z]) };
    L.extras.bounds = { W, LEN, H };
    L.spawn = L.extras.spawns.h;

    /* ---------------------------------------------------------------- the computer players' map (js/duel/bots.js) */
    M((s) => {
      const z = (v) => v * s;
      node(0, 0, z(19.5)); node(-5, 0, z(18.5)); node(4.5, 0, z(18.5)); node(-10, 0, z(18)); node(-10, 0, z(11.4));
      node(-4.2, 0, z(14)); node(4.6, 0, z(13.4)); node(-4, 0, z(8)); node(1, 0, z(9.2)); node(6.2, 0, z(9));
      node(-7.2, 0, z(7.9)); node(-10, 0, z(7.9)); node(7.6, 0, z(4.2)); node(10.3, 0, z(6.6)); node(10.3, 0, z(13));
      const bottom = node(7.5, 0, z(12.2)), top = node(7.5, 2.4, z(17.6));
      links.push([bottom, top]);
      node(10.1, 2.4, z(20.0)); node(10.1, 2.4, z(13)); node(9.9, 2.4, z(6)); node(9.9, 2.4, z(9.0)); node(9.85, 2.4, z(3.6));
    });
    node(-10, 0, 0); node(-4, 0, 0); node(2.9, 0, 0); node(8.65, 0, 0); node(8.65, 0, 2.5); node(8.65, 0, -2.5); node(5.5, 0, 2.6); node(5.5, 0, -2.6); node(-2.3, 0, 5.3); node(-2.3, 0, -5.3); node(-5.5, 0, 2.2); node(-5.5, 0, -2.2);
    node(9.75, 2.4, 0); node(8.6, 2.4, 1.6); node(8.6, 2.4, -1.6);
    L.extras.nav = { nodes: nav, links };

    // ---- finish: the lit blocks (shadowed), the glowing ones (unlit); the geometry is this arena's own (freed with it)
    L.finish();
    const lit = vb.build(), glow = gb.build(), city = far.build(), floor = flo.build();
    floor.traverse(o => { o.renderOrder = 1; });          // (after the walls and cover: the floor under them is not shaded for nothing)
    if (VR.HubWorld && VR.HubWorld.glowify) VR.HubWorld.glowify(glow);
    city.traverse(o => { o.userData.noShadow = true; o.renderOrder = 2; }); city.userData.city = true;
    L.group.add(lit, floor, glow, city);
    L.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.userData.own = true; });
    L.extras.decorate = decorate;
    L.extras.undecorate = undecorate;
    L.extras.frame = frame;
    return L;
  }

  /* ---------------------------------------------------------------- sky, shadows (js/duel/duel.js calls these) */
  let fx = null;
  function decorate(scene, sun, renderer, level) {
    undecorate(scene);
    fx = { scene, sky: null, sun, base: scene.background ? scene.background.clone() : null, ambT: 0 };
    // the compound's ambience: a low machine hum and a little air (ducked under the fight: js/audio.js)
    fx.amb = VR.Audio.ambient ? [VR.Audio.ambient(150, 'lowpass'), VR.Audio.ambient(3200, 'bandpass')] : [];
    if (VR.HubWorld && VR.HubWorld.skyDome) fx.sky = VR.HubWorld.skyDome({ top: 0x3a86e8, mid: 0x9cccf8, hor: 0xffe6c8, low: 0xe2ecf6, sun: [0.5, 0.55, 0.32] });
    if (sun && renderer && renderer.shadowMap.enabled) {
      const s = sun.shadow; s.mapSize.set(2048, 2048); s.bias = -0.0005; s.normalBias = 0.05; s.radius = 3;
      const cam = s.camera; cam.left = -30; cam.right = 30; cam.top = 30; cam.bottom = -30; cam.near = 1; cam.far = 160; cam.updateProjectionMatrix();
      sun.target.position.set(0, 0, 0); scene.add(sun.target);
      sun.position.set(0.5 * 70, 1 * 70, 0.32 * 70);
      fx.renderer = renderer;
    }
    // Quality "high": the dome, shadows (drawn once), the skyline; "low": none of them — follows the setting live
    const city = level.group.children.find(o => o.userData.city);
    const apply = (lite) => {
      if (!fx) return;
      scene.userData.skyBackdrop = lite || !fx.sky ? null : fx.sky;
      if (city) city.visible = !lite;
      if (fx.renderer) { sun.castShadow = !lite; VR.Gfx ? VR.Gfx.setShadows(level.group, !lite) : null; if (!lite) { fx.renderer.shadowMap.needsUpdate = true; fx.shadowFrames = 3; } }
    };
    fx.offGfx = VR.Gfx ? VR.Gfx.on(apply) : (apply(false), null);
  }
  /** every frame: the sky follows the weather's colour; the shadows are drawn in the first frames only */
  function frame(scene) {
    if (!fx || fx.scene !== scene) return;
    const now = performance.now();
    if (now > fx.ambT) { fx.ambT = now + 500; if (fx.amb[0]) fx.amb[0].set(0.045); if (fx.amb[1]) fx.amb[1].set(0.006); }
    if (fx.shadowFrames > 0 && fx.sun && fx.sun.castShadow) { fx.shadowFrames--; fx.renderer.shadowMap.needsUpdate = true; }
    if (fx.sky && fx.base && scene.background && scene.background.isColor) {
      const u = fx.sky.children[0].material.uniforms, bg = scene.background;
      const d = Math.min(1, (Math.abs(bg.r - fx.base.r) + Math.abs(bg.g - fx.base.g) + Math.abs(bg.b - fx.base.b)) * 2.2);
      if (u.mixc) { u.mixc.value.copy(bg); u.mixk.value = d * 0.9; }
    }
  }
  function undecorate(scene) {
    if (!fx) return;
    if (fx.offGfx) fx.offGfx();
    if (fx.sun) fx.sun.castShadow = false;
    for (const a of fx.amb || []) a.stop();
    const sc = fx.scene || scene;
    if (sc && sc.userData.skyBackdrop === fx.sky) sc.userData.skyBackdrop = null;
    if (fx.sky) fx.sky.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    fx = null;
  }

  VR.DuelArena2 = { build, COLORS, VERSION };            // (map 2 of the fights since v1.44.3: js/duel/arena.js picks it, js/mapchoice.js)
})();
