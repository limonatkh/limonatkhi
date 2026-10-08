/* =====================================================================
 * MISSION LEVELS — geometry, colliders, lights and named anchors.
 * ---------------------------------------------------------------------
 * An ENVIRONMENT builds the space (walls, props, lights, ladders) and
 * publishes named ANCHORS. Mission data (data.js) places its clues,
 * puzzles and items on those anchors, so a mission's story can change
 * without touching geometry, and an environment can be restyled without
 * touching the puzzle.
 *
 * Proportions follow the movement/arena spec (player height PH = 1.75 m):
 *   corridors 2-4 player widths · low cover 0.7-1.2 PH · full cover
 *   1.5-2.5 PH · big obstacles 3-5 PH. Shipping containers are 2.6 m
 *   (1.5 PH) and a two-high stack is 5.2 m (3 PH).
 *
 * Yaw convention: a model's front is +Z; yaw 0 faces +Z (south),
 * PI faces -Z (north), +PI/2 faces +X (east), -PI/2 faces -X (west).
 * ===================================================================== */
(function () {
  const T = THREE;
  const MM = () => VR.MissionModels;

  class Level {
    constructor(id) {
      this.id = id;
      this.vb = new VR.VoxelBuilder();
      this.group = new T.Group();
      this.solids = [];
      this.ladders = [];
      this.lights = [];
      this.anchors = {};
      this.ambient = { sky: 0x8fb0d0, ground: 0x4a3f33, intensity: 0.6, background: 0x101318, fog: null };
      this.sun = null;
      this.spawn = { pos: [0, 0, 0], yaw: 0 };
      this.extras = {};
    }
    // axis-aligned box given by its min/max corners
    box(x0, y0, z0, x1, y1, z1, mat, solid = true) {
      this.vb.addBox((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mat);
      if (solid) { const s = this.collider(x0, y0, z0, x1, y1, z1); s.mat = mat; return s; }   // mat: for surface effects
      return null;
    }
    collider(x0, y0, z0, x1, y1, z1) {
      const s = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], enabled: true };
      this.solids.push(s);
      return s;
    }
    /** Place a model; solid: true = collide with its bounding box. */
    place(obj, x, y, z, yaw = 0, solid = true, shrink = 0) {
      obj.position.set(x, y, z); obj.rotation.y = yaw;
      this.group.add(obj);
      if (solid) {
        obj.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(obj);
        return this.collider(b.min.x + shrink, b.min.y, b.min.z + shrink, b.max.x - shrink, b.max.y, b.max.z - shrink);
      }
      return null;
    }
    anchor(name, x, y, z, yaw = 0) { this.anchors[name] = { pos: [x, y, z], yaw }; }
    light(x, y, z, color = 0xffe2a8, intensity = 18, distance = 9, opts = {}) {
      const l = { pos: [x, y, z], color, intensity, distance, ...opts };
      this.lights.push(l);
      return l;
    }
    ladder(x, z, y0, y1, yaw, depth = 0.5) {
      const m = MM().ladder(y1 - y0);
      this.place(m, x, y0, z, yaw, false);
      // climb volume, in front of the ladder
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      const cx = x + nx * depth * 0.5, cz = z + nz * depth * 0.5;
      const hw = Math.abs(nx) > 0.5 ? depth * 0.5 + 0.1 : 0.45, hd = Math.abs(nz) > 0.5 ? depth * 0.5 + 0.1 : 0.45;
      this.ladders.push({ min: [cx - hw, y0, cz - hd], max: [cx + hw, y1 + 0.6, cz + hd], top: y1, normal: [nx, nz] });
    }
    finish() {
      const g = this.vb.build();
      this.group.add(g);
      return this;
    }
  }

  // ---- shared helpers -----------------------------------------------------
  function room(L, x0, z0, x1, z1, h, mats, t = 0.4) {
    const { floor, wall, ceil, skip = '' } = mats;
    L.box(x0 - t, -0.4, z0 - t, x1 + t, 0, z1 + t, floor);                 // floor
    if (ceil) L.box(x0 - t, h, z0 - t, x1 + t, h + 0.3, z1 + t, ceil);
    if (!skip.includes('n')) L.box(x0 - t, 0, z0 - t, x1 + t, h, z0, wall);   // north
    if (!skip.includes('s')) L.box(x0 - t, 0, z1, x1 + t, h, z1 + t, wall);   // south
    if (!skip.includes('w')) L.box(x0 - t, 0, z0, x0, h, z1, wall);           // west
    if (!skip.includes('e')) L.box(x1, 0, z0, x1 + t, h, z1, wall);           // east
  }

  /* ======================================================================
   * CELLAR — Mission 1. A lit storage cellar, and behind a shelf
   * partition a pitch-dark storage strip reached through a low gap
   * (crouch or slide). No lamp reaches past the partition.
   * ==================================================================== */
  function cellar() {
    const L = new Level('cellar');
    const M = MM();
    const H = 4.4;
    const DARK = 0x3a3a40;                                // surfaces no lamp ever reaches
    L.ambient = { sky: 0x8090b0, ground: 0x2a2018, intensity: 0.2, background: 0x05060a };
    room(L, -8, -5.5, 8, 5.5, H, { floor: 'cobble', wall: 'stone_bricks', ceil: 'planks' });
    for (let x = -6; x <= 2; x += 4) L.box(x - 0.2, H - 0.4, -5.5, x + 0.2, H, 5.5, 'log', false);   // ceiling beams

    // entrance door (the way the player came in) on the south wall
    L.box(-7.0, 0, 5.38, -5.0, 2.4, 5.5, VR.Mat.tinted('planks', 0x5a3a1e), false);
    L.box(-7.2, 2.4, 5.3, -4.8, 2.6, 5.5, 'log', false);
    L.spawn = { pos: [-6, 0, 3.9], yaw: -0.25 };

    // partition between the cellar and the dark storage strip (x 4.4..4.7)
    L.box(4.4, 0, -5.5, 4.7, H, 1.0, 'stone_bricks');
    L.box(4.4, 0, 2.6, 4.7, H, 5.5, 'stone_bricks');
    L.box(4.4, 1.05, 1.0, 4.7, H, 2.6, 'stone_bricks');                   // low gap: 1.05 m clearance
    L.box(4.3, 0.9, 0.9, 4.8, 1.05, 2.7, 'hazard', false);                // warning beam over the gap
    // the dark strip: every surface darkened (the lamps never reach here)
    const dk = (t) => VR.Mat.tinted(t, DARK);
    L.box(4.7, 0, -5.5, 8, 0.005, 5.5, dk('cobble'), false);
    L.box(4.7, H - 0.005, -5.5, 8, H, 5.5, dk('planks'), false);
    L.box(7.995, 0, -5.5, 8, H, 5.5, dk('stone_bricks'), false);
    L.box(4.7, 0, -5.5, 8, H, -5.495, dk('stone_bricks'), false);
    L.box(4.7, 0, 5.495, 8, H, 5.5, dk('stone_bricks'), false);
    L.box(4.7, 0, -5.5, 4.705, H, 5.5, dk('stone_bricks'), false);
    // shelves against the partition on the lit side
    L.place(M.shelf(3.2, 2.6, 0.6, 4), 4.05, 0, -3.2, -Math.PI / 2);
    L.place(M.shelf(2.4, 2.6, 0.6, 4), 4.05, 0, 4.0, -Math.PI / 2);
    // west wall shelving + crates (low cover, 1.2 m ≈ 0.7 PH)
    L.place(M.shelf(3.6, 2.6, 0.6, 4), -7.6, 0, -2.6, Math.PI / 2);
    L.place(M.crate(1.2), -7.3, 0, 1.0);
    L.place(M.crate(1.2), -7.3, 1.2, 1.0, 0.3);
    L.place(M.crate(1.2), -6.0, 0, -0.2, 0.15);                           // step up to the crate stack
    L.place(M.crate(1.2), -3.2, 0, 1.2, 0.3);
    L.place(M.barrel(), -7.4, 0, 3.4); L.place(M.barrel(), -7.4, 0, 4.4);
    L.place(M.crate(1.2), 1.4, 0, 2.2, 0.4);
    L.place(M.barrel(), 2.9, 0, 3.8);
    L.place(M.crate(1.0), -1.6, 0, -2.4, 0.7);

    // lamps; their range stops before the partition
    L.place(M.hangingLamp(0.9), -5.2, H, 0.2, 0, false);
    L.place(M.hangingLamp(0.9), -1.2, H, -2.4, 0, false);
    L.light(-5.2, H - 1.2, 0.2, 0xffd9a0, 26, 8);
    L.light(-1.2, H - 1.2, -2.4, 0xffd9a0, 26, 6.2);
    L.light(1.6, 2.6, -3.6, 0xffc480, 7, 3.2);                            // warm fill over the chest
    L.light(-4, 2.6, 3.6, 0xffd9a0, 6, 5);                                // near the door

    // dark storage strip props (x 4.7..8)
    L.place(M.crate(1.2, DARK), 6.9, 0, 3.8, 0.2);
    L.place(M.crate(1.2, DARK), 5.9, 0, -0.2, 0.5);
    L.place(M.crate(1.2, DARK), 7.2, 0, -1.9);
    L.place(M.crate(1.2, DARK), 7.2, 1.2, -1.9, 0.3);
    L.place(M.barrel(DARK), 5.4, 0, -3.6);

    // anchors used by mission data
    L.anchor('wallMessage', -2.4, 2.4, -5.47, 0);
    L.anchor('chest', 1.6, 0, -4.85, 0);
    L.anchor('chestNote', 1.6, 1.55, -5.47, 0);
    L.anchor('darkCorner', 6.35, 1.55, -5.47, 0);
    L.anchor('gapSign', 4.38, 1.6, 1.8, -Math.PI / 2);
    L.anchor('bonusTop', -7.3, 2.4, 1.0, 0);
    L.anchor('bonusDark', 5.4, 1.12, -3.6, 0);
    L.anchor('bonusShelf', -7.45, 0.98, -3.7, Math.PI / 2);
    return L.finish();
  }

  /* ======================================================================
   * OFFICE — Mission 2. The stationmaster's office: a numbered shelf of
   * five objects, three written messages, a symbol button panel and a
   * hidden wall compartment.
   * ==================================================================== */
  function office() {
    const L = new Level('office');
    const M = MM();
    const H = 3.4;
    L.ambient = { sky: 0x9aa8bd, ground: 0x3b2e22, intensity: 0.45, background: 0x0b0d12 };
    room(L, -6, -5, 6, 5, H, { floor: 'floor_wood', wall: 'plaster', ceil: 'plaster', skip: 'e' });
    // east wall, with an opening for the hidden compartment (z 1.4..2.6, y 1.05..2.15)
    L.box(6, 0, -5, 6.4, H, 1.4, 'plaster');
    L.box(6, 0, 2.6, 6.4, H, 5, 'plaster');
    L.box(6, 0, 1.4, 6.4, 1.05, 2.6, 'plaster');
    L.box(6, 2.15, 1.4, 6.4, H, 2.6, 'plaster');
    L.box(6.4, 0.9, 1.3, 6.8, 2.3, 2.7, 'plaster');                          // back of the niche
    // wainscot
    L.box(-6, 0, -5, 6, 1.0, -4.94, VR.Mat.tinted('planks', 0x6b4526), false);
    L.box(-6, 0, 4.94, 6, 1.0, 5, VR.Mat.tinted('planks', 0x6b4526), false);
    L.box(-6, 0, -5, -5.94, 1.0, 5, VR.Mat.tinted('planks', 0x6b4526), false);
    L.box(5.94, 0, -5, 6, 1.0, 5, VR.Mat.tinted('planks', 0x6b4526), false);
    // door (south wall, behind the player)
    L.box(-1.0, 0, 4.88, 1.0, 2.4, 5, VR.Mat.tinted('planks', 0x5a3a1e), false);
    L.spawn = { pos: [0, 0, 3.6], yaw: 0 };

    // the numbered shelf (north wall), places 1..5 left → right
    L.box(-4.2, 1.06, -5, 1.2, 1.14, -4.55, 'planks');
    L.box(-4.2, 1.96, -5, 1.2, 2.02, -4.6, 'planks', false);
    for (const x of [-4.15, 1.15]) L.box(x - 0.05, 0.7, -5, x + 0.05, 1.06, -4.6, 'log', false);
    const placeX = [-3.6, -2.5, -1.5, -0.5, 0.6];
    placeX.forEach((x, i) => {
      L.anchor('place' + (i + 1), x, 1.14, -4.78, 0);
      L.anchor('plaque' + (i + 1), x, 1.0, -4.535, 0);
    });
    // desk + furniture (low cover)
    L.place(M.desk(2.2, 1.0), 0, 0, -0.6, Math.PI);
    L.place(M.chair(), 0, 0, -1.6, Math.PI, true, 0.05);
    L.place(M.cabinet(), -5.5, 0, -3.8, Math.PI / 2);
    L.place(M.cabinet(), -5.5, 0, -3.1, Math.PI / 2);
    L.place(M.shelf(2.6, 2.4, 0.5, 4), -5.65, 0, 2.6, Math.PI / 2);
    L.place(M.crate(0.9), 4.9, 0, 4.2, 0.3);
    L.place(M.chair(), 3.8, 0, 3.8, -2.3, true, 0.05);
    // rug
    L.box(-1.8, 0, 0.6, 1.8, 0.02, 3.0, VR.Mat.tinted('planks', 0x8f3b2c), false);

    // lamps
    L.place(M.hangingLamp(0.6), -2.6, H, 0, 0, false);
    L.place(M.hangingLamp(0.6), 2.6, H, 0, 0, false);
    L.light(-2.6, H - 0.9, 0, 0xffe2b0, 20, 10);
    L.light(2.6, H - 0.9, 0, 0xffe2b0, 20, 10);
    L.light(-1.5, 2.4, -3.6, 0xffe2b0, 5, 4);

    L.anchor('msgA', -5.93, 2.15, 0.2, Math.PI / 2);
    L.anchor('msgB', 3.4, 1.95, -4.93, 0);
    L.anchor('msgC', 3.4, 1.7, 4.93, Math.PI);
    L.anchor('panel', 5.96, 0.95, -1.4, -Math.PI / 2);
    L.anchor('compartment', 5.98, 1.05, 2.0, -Math.PI / 2);
    L.anchor('compartmentItem', 6.25, 1.17, 2.0, -Math.PI / 2);
    L.anchor('clockOnWall', -2.0, 2.6, 4.93, Math.PI);
    return L.finish();
  }

  /* ======================================================================
   * DOCKS — Mission 3. A night-time container yard (the spec's "Docks"
   * map): open centre, a narrow container corridor, a two-high stack
   * with a ladder, the sea to the east and the exit gate to the west.
   * ==================================================================== */
  function docks() {
    const L = new Level('docks');
    const M = MM();
    L.ambient = { sky: 0x3a5480, ground: 0x1a1c22, intensity: 0.75, background: 0x0c1424, fog: [0x0c1424, 30, 80] };
    L.sun = { color: 0x9fb8ff, intensity: 0.55, dir: [0.4, 1, 0.3] };
    // ground + quay
    L.box(-30, -0.5, -18, 16, 0, 18, 'asphalt');
    L.box(16, -0.5, -18, 17, 0, 18, 'concrete');
    L.box(16.8, 0, -18, 17.0, 1.1, 18, 'iron');                            // quay railing
    L.box(17, -3, -40, 70, -1.5, 40, 'water', false);
    L.box(-30, -0.01, -1.2, -18, 0.0, 1.2, VR.Mat.tinted('concrete', 0xf2c230), false); // painted lane to the gate
    // perimeter (tall invisible walls stop climbs or bursts leaving the yard)
    L.collider(-22, 0, -18.5, 17, 30, -16.6);
    L.collider(-22, 0, 16.6, 17, 30, 18.5);
    L.collider(17, 0, -18, 18, 30, 18);
    L.collider(-31, 0, -18, -30, 30, 18);
    // west fence with the gate gap (z -2.5..2.5)
    L.place(M.fence(14), -20, 0, -9.5, Math.PI / 2, false);
    L.place(M.fence(14), -20, 0, 9.5, Math.PI / 2, false);
    L.collider(-20.1, 0, -16.6, -19.9, 30, -2.5);
    L.collider(-20.1, 0, 2.5, -19.9, 30, 16.6);
    L.collider(-30, 0, -16.6, -20.1, 30, -3.2);                            // behind the fence
    L.collider(-30, 0, 3.2, -20.1, 30, 16.6);
    L.anchor('gate', -20, 0, 0, Math.PI / 2);
    L.anchor('exitZone', -25, 0, 0, 0);
    L.anchor('gateSign', -19.65, 4.9, 0, Math.PI / 2);

    const COL = [0xc0392b, 0x2f7fd0, 0x3fa34d, 0xe3702a, 0x7a4fc2, 0x2a8f8a, 0xd9a90f];
    let ci = 0;
    const cont = (x, y, z, alongX, opts = {}) => {
      const m = M.container(opts.color || COL[ci++ % COL.length], opts);
      const yaw = alongX ? Math.PI / 2 : 0;
      L.place(m, x, y, z, yaw, !opts.open);
      return m;
    };
    // north wall of stacked containers (big obstacles, 5.2 m = 3 PH)
    for (let x = -15; x <= 13; x += 6.2) { cont(x, 0, -14.2, true); cont(x, 2.6, -14.2, true); }
    // open centre stays clear; a few low covers
    L.place(M.crate(1.2), -2, 0, -2.5, 0.3); L.place(M.crate(1.2), -0.8, 0, -2.4, 0.1);
    L.place(M.pallet(), 2.8, 0, 2.4, 0.4); L.place(M.crate(1.2), 2.8, 0.14, 2.4, 0.4);
    L.place(M.ropeCoil(), 14.5, 0, -6, 0); L.place(M.bollard(), 15.6, 0, -2); L.place(M.bollard(), 15.6, 0, 6);

    // the corridor block (south): two rows, corridor 2.2 m wide (≈3.6 player widths)
    for (const x of [-1, 5.2]) { cont(x, 0, 8.0, true); cont(x, 0, 12.6, true); }
    cont(-1, 2.6, 8.0, true);
    cont(11.6, 0, 7.85, true); cont(11.6, 0, 12.75, true);
    // open container at the corridor's end, open side facing west (the coil hides inside)
    {
      const m = M.container(0x2a8f8a, { open: 'bare' });
      L.place(m, 11.6, 0, 10.3, -Math.PI / 2, false);
      L.collider(8.6, 2.52, 9.1, 14.6, 2.6, 11.5);       // roof
      L.collider(8.6, 0, 9.1, 14.6, 2.6, 9.18);          // side
      L.collider(8.6, 0, 11.42, 14.6, 2.6, 11.5);        // side
      L.collider(14.52, 0, 9.1, 14.6, 2.6, 11.5);        // back
      L.collider(8.6, 0, 9.1, 14.6, 0.12, 11.5);         // floor (a small step)
      L.anchor('coilSpot', 13.7, 0.12, 10.3, -Math.PI / 2);
      L.light(12.4, 2.1, 10.3, 0xffb060, 5, 3.4);
    }
    // the stack with the ladder (east side): two-high, along z
    cont(9.2, 0, -3.5, false, { color: 0x2f7fd0 });
    cont(9.2, 2.6, -3.5, false, { color: 0xc0392b });
    L.ladder(7.95, -2.2, 0, 5.2, -Math.PI / 2, 0.55);
    cont(5.6, 0, -4.2, false, { color: 0x3fa34d });                       // a single one beside it (2.6 m)
    L.anchor('cellSpot', 9.2, 5.2, -5.0, 0);
    // generator + lever by the gate side (north-west)
    L.anchor('generator', -12, 0, -9.6, 0);
    L.collider(-14.15, 0, -10.3, -9.85, 1.7, -9.55);
    L.anchor('lever', -9.0, 0, -9.3, 0);
    L.collider(-9.3, 0, -9.45, -8.7, 0.7, -9.15);
    L.box(-14.2, 1.7, -9.66, -9.8, 3.0, -9.58, 'iron', false);              // label board above the generator
    L.anchor('genLabel', -12, 2.1, -9.55, 0);
    L.box(-16.4, 0, -9.7, -14.5, 2.5, -9.56, 'planks');                     // notice board
    L.anchor('genNotice', -15.45, 1.55, -9.53, 0);
    // cables: sea → generator → gate
    L.box(-9.85, 0.02, -9.4, 16.8, 0.1, -9.25, VR.Mat.tinted('metal', 0x222428), false);
    L.box(-19.6, 0.02, -9.4, -14.15, 0.1, -9.25, VR.Mat.tinted('metal', 0x222428), false);
    L.box(-19.7, 0.02, -9.4, -19.55, 0.1, -2.5, VR.Mat.tinted('metal', 0x222428), false);
    // clue surfaces
    cont(-15.5, 0, 5.5, false, { color: 0x7a4fc2 });                       // near the gate
    L.anchor('fuseClue', -14.27, 1.5, 5.5, Math.PI / 2);
    L.anchor('seaClue', 16.7, 1.65, 1.5, -Math.PI / 2);
    L.box(16.65, 0, 0.4, 16.75, 2.4, 0.5, 'iron', false); L.box(16.65, 0, 2.5, 16.75, 2.4, 2.6, 'iron', false);
    L.anchor('arrivalNote', -14.2, 1.65, 13.95, Math.PI);
    L.place(M.cabinet(), -16.5, 0, 14.3, 0);
    L.box(-15.6, 0, 14.0, -12.8, 1.0, 14.6, 'concrete');
    // the fuse sits on a pallet near the start
    L.place(M.pallet(), -10.2, 0, 10.4, 0.3);
    L.anchor('fuseSpot', -10.2, 0.14, 10.4, 0);
    L.spawn = { pos: [-14.5, 0, 11.5], yaw: -0.75 };
    // lamp posts
    const posts = [[-17, -6, 0], [-6, 4.4, Math.PI], [4, -10.8, 0], [14.8, 4, -Math.PI / 2], [-7, 14.5, Math.PI], [3, 5.6, 0]];
    L.light(3, 2.3, 10.3, 0xffd9a0, 6, 6);                                 // corridor
    for (const [x, z, yaw] of posts) {
      L.place(M.lampPost(5), x, 0, z, yaw, true, 0.12);
      const nx = Math.sin(yaw), nz = Math.cos(yaw);
      L.light(x + nx * 0.65, 4.6, z + nz * 0.65, 0xffe6b8, 30, 13);
    }
    // floodlights that switch on with the power
    L.extras.floods = [
      L.light(-12, 6, -5, 0xd8f0ff, 0, 18, { powered: 60 }),
      L.light(-18, 6, 0, 0xd8f0ff, 0, 14, { powered: 50 }),
      L.light(4, 7, 0, 0xd8f0ff, 0, 20, { powered: 60 }),
    ];
    return L.finish();
  }

  VR.MissionEnvironments = { cellar, office, docks };
  VR.MissionLevel = Level;
})();
