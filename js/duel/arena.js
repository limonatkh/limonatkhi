/* =====================================================================
 * 1v1 SNIPER ARENA — "ساحة القنص"
 * ---------------------------------------------------------------------
 * A small walled yard, open to the sky, built with the mission Level
 * class (same voxel builder, same AABB colliders the first-person
 * controller already walks on).
 *
 * Size (player height PH = 1.75 m):
 *   length 46 m ≈ 26 PH · width 23 m ≈ 13 PH · walls 11 m ≈ 6.3 PH
 * The floor is a 2 m checker grid so distances are easy to judge.
 * Cover is placed with 180° rotational symmetry: each half has the same
 * pieces, turned around, so both spawns are equally good but the yard
 * doesn't look mirrored. Every piece is either jumpable (≤ 1.2 m),
 * chest/head cover (2.2-3.6 m) or a perch (3 m platform with a step).
 *
 * Host spawns at +Z (purple end), guest at -Z (yellow end).
 * ===================================================================== */
(function () {
  const W = 11.5, LEN = 23, H = 11;
  const COLORS = { h: 0x9b6bff, g: 0xffd23a };

  function build() {
    const L = new VR.MissionLevel('arena');
    const tint = (t, c) => VR.Mat.tinted(t, c);
    L.ambient = { sky: 0xbfe3ff, ground: 0x8a7a5a, intensity: 1.0, background: 0x8fd3ff, fog: [0xb8e4ff, 70, 160] };
    L.sun = { color: 0xfff2d6, intensity: 1.15, dir: [-0.5, 1, 0.35] };

    // ---- floor: 2 m checker grid + lines every 4 m
    L.collider(-W - 1, -1, -LEN - 1, W + 1, 0, LEN + 1);
    const A = tint('concrete', 0xf4ead2), B = tint('concrete', 0xc4b48a);
    for (let x = -W; x < W - 0.01; x += 2.3) {
      for (let z = -LEN; z < LEN - 0.01; z += 2) {
        const ix = Math.round((x + W) / 2.3), iz = Math.round((z + LEN) / 2);
        L.box(x, -0.3, z, Math.min(W, x + 2.3), 0, Math.min(LEN, z + 2), (ix + iz) % 2 ? A : B, false);
      }
    }
    const line = tint('concrete', 0x9c8a64);
    for (let z = -LEN + 4; z < LEN; z += 4) L.box(-W, 0, z - 0.04, W, 0.012, z + 0.04, line, false);
    for (let x = -W + 4.6; x < W; x += 4.6) L.box(x - 0.04, 0, -LEN, x + 0.04, 0.012, LEN, line, false);
    L.box(-W, 0, -0.12, W, 0.016, 0.12, 'lemon', false);                       // centre line

    // ---- spawn pads (team colours)
    L.box(-3, 0, LEN - 4.2, 3, 0.06, LEN - 0.2, tint('concrete', COLORS.h), false);
    L.box(-3, 0, -LEN + 0.2, 3, 0.06, -LEN + 4.2, tint('concrete', COLORS.g), false);

    // ---- walls (+ invisible extensions so no jump can leave the yard)
    const wall = 'sandstone', T2 = 0.8;
    L.box(-W - T2, 0, -LEN - T2, W + T2, H, -LEN, wall);
    L.box(-W - T2, 0, LEN, W + T2, H, LEN + T2, wall);
    L.box(-W - T2, 0, -LEN, -W, H, LEN, wall);
    L.box(W, 0, -LEN, W + T2, H, LEN, wall);
    L.collider(-W - 2, H, -LEN - 2, W + 2, 80, -LEN);
    L.collider(-W - 2, H, LEN, W + 2, 80, LEN + 2);
    L.collider(-W - 2, H, -LEN, -W, 80, LEN);
    L.collider(W, H, -LEN, W + 2, 80, LEN);
    // wall trim: lemon band on top, team colour stripe at each end
    L.box(-W - T2, H, -LEN - T2, W + T2, H + 0.4, -LEN + 0.1, 'lemon', false);
    L.box(-W - T2, H, LEN - 0.1, W + T2, H + 0.4, LEN + T2, 'lemon', false);
    L.box(-W - T2, H, -LEN, -W + 0.1, H + 0.4, LEN, 'lemon', false);
    L.box(W - 0.1, H, -LEN, W + T2, H + 0.4, LEN, 'lemon', false);
    L.box(-W, 2.2, LEN - 0.02, W, 2.7, LEN, tint('concrete', COLORS.h), false);
    L.box(-W, 2.2, -LEN, W, 2.7, -LEN + 0.02, tint('concrete', COLORS.g), false);
    for (const x of [-W, W]) for (const z of [-LEN, LEN]) L.box(x - 1.1, 0, z - 1.1, x + 1.1, H + 0.9, z + 1.1, 'stone_bricks');
    // side pilasters every 8 m
    for (let z = -LEN + 7.5; z < LEN - 4; z += 7.5) for (const s of [-1, 1]) L.box(s * W - (s > 0 ? 0.5 : -0.5) - 0.25 * s, 0, z - 0.5, s * W, H, z + 0.5, 'cobble', false);

    // ---- cover. One half is described; the other half is the same set turned 180°.
    const half = [
      // [cx, cz, w, h, d, material]
      [-6.0, 14.5, 3.0, 1.1, 1.4, 'planks'],                 // low: jump over, crouch behind
      [5.0, 12.0, 2.2, 2.2, 2.2, 'stone'],                   // chest-high block
      [-2.5, 7.5, 5.0, 3.6, 0.8, 'sandstone'],               // tall wall
      [7.6, 4.5, 1.6, 5.0, 1.6, 'cobble'],                   // pillar
      [-7.4, 3.4, 4.0, 3.0, 4.0, 'sandstone'],               // perch
      [-4.6, 3.4, 1.4, 1.1, 2.0, 'planks'],                  // its step
      [1.2, 17.5, 1.3, 1.3, 1.3, 'hay'],                     // crate
      [2.4, 17.5, 1.1, 0.9, 1.1, 'hay'],
    ];
    for (const s of [1, -1]) {
      for (const [cx, cz, w, h, d, mat] of half) {
        const x = cx * s, z = cz * s;
        L.box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, mat);
      }
      // lemon crate decoration on the perch
      VR.Props.lemon(L.vb, -7.4 * s + 1.2 * s, 3.0, 3.4 * s - 1.1 * s, 1.1, s > 0);
    }
    // centre: a tower and two low walls
    L.box(-1.2, 0, -1.2, 1.2, 4.5, 1.2, 'sandstone');
    L.box(-1.25, 4.5, -1.25, 1.25, 4.8, 1.25, 'lemon', false);
    L.box(-6.0, 0, -0.3, -3.0, 1.2, 0.3, 'planks');
    L.box(3.0, 0, -0.3, 6.0, 1.2, 0.3, 'planks');

    // big lemon on top of each end wall
    VR.Props.lemon(L.vb, 0, H + 0.4, LEN + 0.3, 2.4, true);
    VR.Props.lemon(L.vb, 0, H + 0.4, -LEN - 0.3, 2.4, true);

    L.extras.spawns = {
      h: { pos: [0, 0.05, LEN - 2.4], yaw: 0 },
      g: { pos: [0, 0.05, -LEN + 2.4], yaw: Math.PI },
    };
    // random round starts: free spots on each side (the yellow side is the purple side turned 180°)
    const pts = [[0, 20.6], [-6, 20.4], [6, 20.2], [-9, 17.5], [8.6, 16.8], [-2.5, 12], [2, 10], [9, 9.5], [-9, 10.2], [0, 14.5]];
    L.extras.spawnPts = { h: pts.map(([x, z]) => [x, z]), g: pts.map(([x, z]) => [-x, -z]) };
    L.extras.bounds = { W, LEN, H };
    L.spawn = L.extras.spawns.h;
    return L.finish();
  }

  VR.DuelArena = { build, COLORS };
})();
