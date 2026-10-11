/* =====================================================================
 * MINI PLANET — a tiny round voxel world hanging in Limonat's sky.
 *
 * One generator, three users:
 *   VR.MiniPlanet.data()        the planet itself (built once, cached): the
 *                               terrain heights, trees, landmarks and the
 *                               collision queries the spherical controller
 *                               uses (js/planet/planetctrl.js)
 *   VR.MiniPlanet.worldMesh()   the playable planet's merged meshes (one per
 *                               block texture) — js/planet/planetworld.js
 *   VR.MiniPlanet.lodMesh()     the same planet with fewer blocks, seen in the
 *                               sky of every other world (js/planet/skyplanet.js)
 *
 * The surface is a CUBE-SPHERE: each of the six faces of a cube is cut into
 * N × N cells (equal angles, so the cells stay nearly square), and every
 * cell is a voxel column standing on the sphere — its top at R + height,
 * its walls radial. Heights are whole half-metre steps; neighbouring cells
 * never differ by more than one step except rocks, so hills are walkable
 * and nothing snags. Trees and landmarks are boxes in the local frame of
 * the point they stand on (local up = the sphere's normal there); the
 * solid ones become collision boxes (radial range r0..r1 over a small
 * footprint in the tangent plane).
 *
 * The planet's centre is the origin of its world.
 * ===================================================================== */
(function () {
  const T = THREE;
  const R = 45;                      // base radius (m): a full lap ≈ 283 m
  const N = 52;                      // cells per cube-face edge (≈ 1.36 m)
  const STEP = 0.5;                  // terrain height step (walkable: the controller steps up 0.55)
  const QA = Math.PI / 4, CA = (Math.PI / 2) / N;
  const D2R = Math.PI / 180;
  const PATH_W = 0.034;              // the lap road: |dir.x| < PATH_W (≈ 1.5 m each side of the meridian)

  const FACES = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function hash(i) { let h = (i * 374761393 + 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function dirOf(f, a, b, out) {
    const F = FACES[f], ta = Math.tan(a), tb = Math.tan(b);
    return out.set(F.n[0] + ta * F.u[0] + tb * F.v[0], F.n[1] + ta * F.u[1] + tb * F.v[1], F.n[2] + ta * F.u[2] + tb * F.v[2]).normalize();
  }
  function faceOf(x, y, z) {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if (ax >= ay && ax >= az) return x > 0 ? 0 : 1;
    if (ay >= az) return y > 0 ? 2 : 3;
    return z > 0 ? 4 : 5;
  }
  /** the cell under a direction (any length) */
  function cellOf(d, n = N) {
    const f = faceOf(d.x, d.y, d.z), F = FACES[f];
    const dn = d.x * F.n[0] + d.y * F.n[1] + d.z * F.n[2];
    const uc = (d.x * F.u[0] + d.y * F.u[1] + d.z * F.u[2]) / dn, vc = (d.x * F.v[0] + d.y * F.v[1] + d.z * F.v[2]) / dn;
    const ca = (Math.PI / 2) / n;
    let i = Math.floor((Math.atan(uc) + QA) / ca), j = Math.floor((Math.atan(vc) + QA) / ca);
    if (i < 0) i = 0; else if (i >= n) i = n - 1;
    if (j < 0) j = 0; else if (j >= n) j = n - 1;
    return f * n * n + j * n + i;
  }
  const latlon = (lat, lon, out = new T.Vector3()) => out.set(Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R));
  /** the local frame at a direction: x = east-ish, y = up (the normal), z = toward the north pole (yaw turns it) */
  function frameAt(up, yaw = 0) {
    const u = up.clone().normalize();
    let n = new T.Vector3(0, 1, 0).addScaledVector(u, -u.y);
    if (n.lengthSq() < 1e-6) n = new T.Vector3(0, 0, u.y > 0 ? 1 : -1).addScaledVector(u, -u.z);
    n.normalize();
    if (yaw) n.applyAxisAngle(u, yaw);
    const e = new T.Vector3().crossVectors(u, n).normalize();           // e × u = n (right-handed: x = e, y = u, z = n)
    return { x: e, y: u, z: n };
  }

  // ------------------------------------------------------------------ cell types / looks
  const TY = { GRASS: 0, PATH: 1, ROCK: 2, PLAZA: 3, FLOWERS: 4, HILLTOP: 5, MEADOW: 6, SAND: 7 };
  const TOP = ['grass_top', 'sand#ead2a0', 'stone', 'cobble', 'grass_top#d8ffb0', 'grass_top#e8ffc0', 'grass_top#b8f0a0', 'sand'];
  const SIDE = ['grass_side', 'dirt', 'stone', 'cobble', 'grass_side', 'grass_side', 'grass_side', 'sandstone'];
  // the far (sky) planet: one flat colour per cell type, from the same textures' average colours
  const LOD_COL = [0x5fae3a, 0xd9c08a, 0x8b8d90, 0x8f8f92, 0x86c45a, 0x7cc24e, 0x6ab846, 0xe0cf8f];

  // ------------------------------------------------------------------ landmarks (all around the sphere)
  // parts: [cx, y0, cz, w, h, d, material, solid?]  in the landmark's local frame (y up, +z = its front)
  const LANDMARKS = [
    { id: 'portal', lat: 85, lon: 60, yaw: 0, pad: 4.5, parts: [                              // the way home beside the start, off the road, facing it
      [-1.25, 0, 0, 0.45, 3.2, 0.5, null, true], [1.25, 0, 0, 0.45, 3.2, 0.5, null, true], [0, 3.2, 0, 2.95, 0.95, 0.5, null, true]] },   // (only its posts collide: the component draws it)
    { id: 'cottage', lat: 75, lon: 100, yaw: 0.2, pad: 6.5, parts: cottage() },
    { id: 'archN', lat: 1, lon: 0, yaw: 0, pad: 4, parts: arch() },                             // two arches over the lap road at the equator
    { id: 'archS', lat: 1, lon: 180, yaw: 0, pad: 4, parts: arch() },
    { id: 'lemonTree', lat: 30, lon: 95, yaw: 0, pad: 7, parts: bigLemonTree() },
    { id: 'rocket', lat: 14, lon: -100, yaw: 0.9, pad: 7, parts: rocket() },
    { id: 'beacon', lat: -22, lon: 48, yaw: -0.4, pad: 5, parts: beacon() },
    { id: 'crystals', lat: -40, lon: 135, yaw: 0, pad: 6, parts: crystals() },
    { id: 'windmill', lat: 42, lon: -150, yaw: 2.4, pad: 5.5, parts: windmill() },
    { id: 'garden', lat: 52, lon: -55, yaw: 0.6, pad: 6.5, parts: garden() },
    { id: 'henge', lat: -90, lon: 0, yaw: 0, pad: 8.5, parts: henge() },                         // the bottom of the planet
    { id: 'well', lat: -48, lon: -70, yaw: 0, pad: 4, parts: well() },
  ];
  function cottage() {
    const p = [];
    p.push([0, 0, 0, 5, 0.3, 4.6, 'cobble', true]);
    p.push([-2.2, 0.3, 0, 0.6, 2.6, 4.2, 'planks', true], [2.2, 0.3, 0, 0.6, 2.6, 4.2, 'planks', true], [0, 0.3, -1.95, 3.8, 2.6, 0.6, 'planks', true]);
    p.push([-1.35, 0.3, 1.95, 1.1, 2.6, 0.6, 'planks', true], [1.35, 0.3, 1.95, 1.1, 2.6, 0.6, 'planks', true], [0, 2.2, 1.95, 1.6, 0.7, 0.6, 'planks', true]);
    for (let i = 0; i < 4; i++) p.push([0, 2.9 + i * 0.45, 0, 5.4 - i * 1.3, 0.45, 5.2, 'roof', true]);
    p.push([1.6, 3.6, -1.2, 0.6, 1.6, 0.6, 'brick', true]);
    p.push([-2.55, 1.3, 0.8, 0.12, 0.8, 0.9, 'glass', false], [2.55, 1.3, -0.8, 0.12, 0.8, 0.9, 'glass', false]);
    p.push([0, 0, 2.9, 1.6, 0.25, 0.8, 'planks', true]);                                         // the step
    p.push([-1.9, 2.15, 2.4, 0.3, 0.3, 0.3, 'lamp', false]);
    return p;
  }
  function arch() {
    const p = [];
    for (const x of [-2.6, 2.6]) p.push([x, 0, 0, 0.8, 3.8, 0.8, 'stone_bricks', true], [x, 3.8, 0, 1.0, 0.3, 1.0, 'stone', true]);
    p.push([0, 4.1, 0, 6.2, 0.6, 0.8, 'stone_bricks', true]);
    p.push([0, 4.7, 0, 1.0, 0.5, 0.5, 'lemon', false]);
    return p;
  }
  function bigLemonTree() {
    const p = [];
    p.push([0, 0, 0, 1.2, 4.6, 1.2, 'log', true], [0.9, 2.8, 0, 1.6, 0.5, 0.5, 'log', false], [-0.8, 3.3, 0.3, 1.4, 0.5, 0.5, 'log', false]);
    p.push([0, 4.4, 0, 6.4, 2.0, 6.4, 'lemon_leaves', false], [0, 6.4, 0, 4.4, 1.6, 4.4, 'lemon_leaves', false], [0, 8.0, 0, 2.2, 1.0, 2.2, 'lemon_leaves', false]);
    for (const [x, y, z] of [[2.6, 4.1, 1.4], [-2.3, 4.1, -1.9], [1.2, 4.1, -2.9], [-2.9, 4.6, 1.8], [2.9, 5.6, -1.0], [0.4, 3.9, 3.0]]) p.push([x, y, z, 0.5, 0.6, 0.5, 'lemon', false]);
    for (const [x, z] of [[-2.0, 2.4], [2.2, 2.8], [3.1, -2.2]]) p.push([x, 0, z, 0.55, 0.55, 0.55, 'lemon', false]);   // fallen lemons
    return p;
  }
  function rocket() {
    const p = [];
    // lying on its side, nose buried in a mound
    p.push([0, 0, 0, 2.6, 2.4, 6.0, 'iron', true], [0, 0.3, 3.6, 2.0, 1.8, 1.4, 'iron', true], [0, 0.6, 4.6, 1.2, 1.2, 0.8, 'metal#e5433a', true]);
    p.push([0, 0.6, -3.4, 1.6, 1.4, 0.8, 'dark', true]);
    p.push([-1.8, 0, -2.4, 1.0, 1.2, 1.4, 'metal#e5433a', true], [1.8, 0, -2.4, 1.0, 1.2, 1.4, 'metal#e5433a', true], [0, 2.4, -2.4, 0.4, 1.0, 1.4, 'metal#e5433a', false]);
    p.push([1.32, 0.8, 0.6, 0.1, 0.8, 0.8, 'glass', false], [-1.32, 0.8, 0.6, 0.1, 0.8, 0.8, 'glass', false]);
    p.push([0, 0, 5.6, 3.2, 1.0, 1.8, 'dirt', true]);
    for (const [x, z] of [[2.6, -4.2], [-2.8, 3.0], [3.0, 2.2]]) p.push([x, 0, z, 0.6, 0.3, 0.5, 'iron', false]);
    return p;
  }
  function beacon() {
    const p = [];
    p.push([0, 0, 0, 3.4, 0.6, 3.4, 'stone', true]);
    for (let i = 0; i < 6; i++) p.push([0, 0.6 + i * 1.3, 0, 2.2 - i * 0.12, 1.3, 2.2 - i * 0.12, i % 2 ? 'wall' : 'metal#e5433a', true]);
    p.push([0, 8.4, 0, 1.8, 0.3, 1.8, 'iron', true], [0, 8.7, 0, 1.2, 1.1, 1.2, 'lamp', true], [0, 9.8, 0, 1.6, 0.3, 1.6, 'roof', true]);
    return p;
  }
  function crystals() {
    const p = [];
    for (const [x, z, w, h] of [[0, 0, 1.1, 4.2], [1.4, 0.8, 0.8, 2.6], [-1.3, 0.6, 0.7, 3.0], [0.5, -1.4, 0.7, 2.2], [-0.7, -1.2, 0.6, 1.6], [2.2, -0.9, 0.5, 1.3], [-2.3, -0.5, 0.5, 1.8]]) p.push([x, 0, z, w, h, w, 'gem', true]);
    p.push([0, 0, 0, 5.4, 0.25, 4.6, 'stone', true]);
    return p;
  }
  function windmill() {
    const p = [];
    p.push([0, 0, 0, 3.0, 0.4, 3.0, 'cobble', true], [0, 0.4, 0, 2.4, 3.2, 2.4, 'wall', true], [0, 3.6, 0, 2.0, 1.4, 2.0, 'wall', true], [0, 5.0, 0, 2.4, 0.5, 2.4, 'roof', true], [0, 5.5, 0, 1.4, 0.6, 1.4, 'roof', true]);
    p.push([0, 0.4, 1.25, 0.9, 1.6, 0.1, 'planks', false], [0, 4.3, 1.2, 0.5, 0.5, 0.6, 'log', false]);
    return p;                                                                                    // (the sails are their own turning mesh)
  }
  function garden() {
    const p = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = -2.7 + c * 1.8, z = -1.8 + r * 1.8;
      p.push([x, 0, z, 0.9, 0.6, 0.9, 'lemon_leaves', true], [x + 0.2, 0.6, z - 0.1, 0.3, 0.3, 0.3, 'lemon', false]);
    }
    p.push([-4.2, 0, 0, 0.2, 0.9, 5.6, 'planks', false], [4.2, 0, 0, 0.2, 0.9, 5.6, 'planks', false]);
    return p;
  }
  function henge() {
    const p = [];
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4, x = Math.sin(a) * 6.2, z = Math.cos(a) * 6.2;
      p.push([x, 0, z, 1.1, 3.2 - (k % 2) * 0.8, 1.1, 'stone', true]);
    }
    p.push([0, 0, 0, 3.0, 0.2, 3.0, 'stone_bricks', true]);
    return p;                                                                                    // (the floating crystal over it: its own glowing mesh)
  }
  function well() {
    const p = [];
    p.push([0, 0, -1.0, 2.6, 0.9, 0.5, 'cobble', true], [0, 0, 1.0, 2.6, 0.9, 0.5, 'cobble', true], [-1.05, 0, 0, 0.5, 0.9, 1.5, 'cobble', true], [1.05, 0, 0, 0.5, 0.9, 1.5, 'cobble', true]);
    p.push([0, 0.05, 0, 1.6, 0.4, 1.5, 'water', false]);
    p.push([-1.05, 0.9, 0, 0.25, 1.6, 0.25, 'log', true], [1.05, 0.9, 0, 0.25, 1.6, 0.25, 'log', true], [0, 2.5, 0, 2.8, 0.4, 1.8, 'roof', true]);
    return p;
  }

  // ------------------------------------------------------------------ generation
  let DATA = null;
  function generate() {
    const NC = 6 * N * N;
    const h = new Float32Array(NC), type = new Uint8Array(NC), fixed = new Uint8Array(NC);
    const cen = new Float32Array(NC * 3), nb = new Int32Array(NC * 4);
    const v = new T.Vector3(), w = new T.Vector3();
    const r = rng(20261011);
    for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = f * N * N + j * N + i, a = -QA + (i + 0.5) * CA, b = -QA + (j + 0.5) * CA;
      dirOf(f, a, b, v); cen[c * 3] = v.x; cen[c * 3 + 1] = v.y; cen[c * 3 + 2] = v.z;
      nb[c * 4] = cellOf(dirOf(f, a + CA, b, w)); nb[c * 4 + 1] = cellOf(dirOf(f, a - CA, b, w));
      nb[c * 4 + 2] = cellOf(dirOf(f, a, b + CA, w)); nb[c * 4 + 3] = cellOf(dirOf(f, a, b - CA, w));
    }
    const C = (c) => v.set(cen[c * 3], cen[c * 3 + 1], cen[c * 3 + 2]);
    const lms = LANDMARKS.map(l => Object.assign({}, l, { dir: latlon(l.lat, l.lon) }));
    const nearLandmark = (d, extra) => lms.some(l => d.angleTo(l.dir) * R < l.pad + extra);
    // hills: smooth bumps off the road and away from the landmarks, terraced to whole steps
    const hills = [];
    for (let k = 0; hills.length < 16 && k < 400; k++) {
      const d = new T.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.05) continue; d.normalize();
      if (Math.abs(d.x) < 0.2 || nearLandmark(d, 6)) continue;
      if (hills.some(hh => hh.dir.angleTo(d) < 0.5)) continue;
      hills.push({ dir: d, H: 2 + r() * 3, rad: 0.13 + r() * 0.1 });
    }
    for (let c = 0; c < NC; c++) {
      const d = C(c);
      if (Math.abs(d.x) < PATH_W) { type[c] = TY.PATH; fixed[c] = 1; h[c] = 0; continue; }
      const lm = lms.find(l => d.angleTo(l.dir) * R < l.pad);
      if (lm) { type[c] = lm.id === 'garden' || lm.id === 'lemonTree' ? TY.MEADOW : TY.PLAZA; fixed[c] = 1; h[c] = 0; continue; }
      let s = 0; for (const hh of hills) { const a = d.angleTo(hh.dir) / hh.rad; if (a < 3) s += hh.H * Math.exp(-a * a); }
      let hh = Math.round(s / STEP) * STEP;
      if (hash(c) < 0.1) hh += STEP;
      h[c] = hh; type[c] = TY.GRASS;
    }
    // walkable: a cell is never more than one step over its lowest neighbour (cones of terraces)
    for (let it = 0; it < 80; it++) {
      let ch = false;
      for (let c = 0; c < NC; c++) {
        if (fixed[c]) continue;
        let m = Infinity; for (let k = 0; k < 4; k++) m = Math.min(m, h[nb[c * 4 + k]]);
        if (h[c] > m + STEP) { h[c] = m + STEP; ch = true; }
      }
      if (!ch) break;
    }
    for (let c = 0; c < NC; c++) {
      if (type[c] !== TY.GRASS) continue;
      if (h[c] >= 2.5) type[c] = TY.HILLTOP;
      else if (hash(c * 7 + 3) < 0.07) type[c] = TY.FLOWERS;
      else if (hash(c * 13 + 5) < 0.18) type[c] = TY.MEADOW;
    }
    // rocks: small outcrops a jump high (1 m – 1.5 m), never on the road
    let rocks = 0;
    for (let k = 0; rocks < 34 && k < 2000; k++) {
      const c = Math.floor(r() * NC); const d = C(c);
      if (fixed[c] || type[c] === TY.ROCK || Math.abs(d.x) < 0.1 || nearLandmark(d, 2)) continue;
      const up = r() < 0.6 ? 1.0 : 1.5, base = h[c];
      const cl = [c]; if (r() < 0.6) cl.push(nb[c * 4 + Math.floor(r() * 4)]); if (r() < 0.3) cl.push(nb[c * 4 + Math.floor(r() * 4)]);
      for (const q of cl) { if (fixed[q] || Math.abs(C(q).x) < 0.1) continue; type[q] = TY.ROCK; h[q] = Math.max(h[q], base) + (q === c ? up : up - 0.5); }
      rocks++;
    }
    // sand around the crystals and the well
    for (let c = 0; c < NC; c++) { if (fixed[c] || type[c] === TY.ROCK) continue; const d = C(c); for (const l of lms) if ((l.id === 'crystals' || l.id === 'well') && d.angleTo(l.dir) * R < l.pad + 2.5) { type[c] = TY.SAND; } }

    // trees: little voxel trees on the grass (not on the road, rocks or landmark pads)
    const trees = [];
    for (let k = 0; trees.length < 78 && k < 6000; k++) {
      const d = new T.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.05) continue; d.normalize();
      if (Math.abs(d.x) < 0.075 || nearLandmark(d, 2.5)) continue;
      const c = cellOf(d);
      if (type[c] === TY.ROCK || type[c] === TY.SAND || fixed[c]) continue;
      let bad = false; for (let q = 0; q < 4; q++) { const n = nb[c * 4 + q]; if (type[n] === TY.ROCK || Math.abs(h[n] - h[c]) > 0.01) bad = true; }
      if (bad) continue;                                   // (a tree stands on a flat cell)
      if (trees.some(t => t.dir.angleTo(d) * R < 4.2)) continue;
      const kind = r() < 0.22 ? 'lemon' : r() < 0.3 ? 'pine' : 'round';
      trees.push({ dir: C(c).clone(), base: R + h[c], kind, s: 0.85 + r() * 0.35, yaw: r() * Math.PI * 2 });
    }
    // flowers (decoration only)
    const flowers = [];
    for (let c = 0; c < NC; c++) if (type[c] === TY.FLOWERS) flowers.push(c);

    const P = { R, N, STEP, h, type, cen, nb, lms, trees, flowers, hills };
    P.heightAtCell = (c) => h[c];
    // collision boxes from the landmarks' solid parts and the trees' trunks
    const boxes = [];
    const addBox = (fr, base, cx, y0, cz, bw, bh, bd, tag) => {
      const c = fr.y.clone().multiplyScalar(base).addScaledVector(fr.x, cx).addScaledVector(fr.z, cz);
      const dir = c.clone().normalize(), rb = c.length();
      const e1 = fr.x.clone().addScaledVector(dir, -fr.x.dot(dir)).normalize(), e2 = new T.Vector3().crossVectors(e1, dir).normalize();
      const ext = Math.hypot(bw, bd) / 2 + 0.6;
      boxes.push({ dir, e1, e2, hx: bw / 2, hz: bd / 2, r0: rb + y0, r1: rb + y0 + bh, rb, cosR: Math.cos(ext / rb), tag });
    };
    for (const l of lms) {
      l.frame = frameAt(l.dir, l.yaw); l.base = R;
      for (const pt of l.parts) if (pt[7]) addBox(l.frame, R, pt[0], pt[1], pt[2], pt[3], pt[4], pt[5], l.id);
    }
    for (const t of trees) { t.frame = frameAt(t.dir, t.yaw); const th = treeHeight(t); addBox(t.frame, t.base, 0, 0, 0, 0.5 * t.s + 0.05, th, 0.5 * t.s + 0.05, 'tree'); }
    P.boxes = boxes;
    return P;
  }
  function treeHeight(t) { return t.kind === 'pine' ? 5.6 * t.s : t.kind === 'lemon' ? 4.4 * t.s : 4.6 * t.s; }
  function treeParts(t, lod) {
    const s = t.s, p = [];
    if (t.kind === 'pine') {
      p.push([0, 0, 0, 0.5 * s, 1.6 * s, 0.5 * s, 'log']);
      if (lod) p.push([0, 1.4 * s, 0, 2.4 * s, 3.6 * s, 2.4 * s, 'pine']);
      else for (let i = 0; i < 4; i++) p.push([0, (1.4 + i * 1.0) * s, 0, (2.8 - i * 0.6) * s, 1.0 * s, (2.8 - i * 0.6) * s, 'pine']);
      if (!lod) p.push([0, 5.4 * s, 0, 0.5 * s, 0.4 * s, 0.5 * s, 'pine']);
    } else {
      const lv = t.kind === 'lemon' ? 'lemon_leaves' : 'leaves';
      p.push([0, 0, 0, 0.5 * s, 2.2 * s, 0.5 * s, 'log']);
      p.push([0, 2.0 * s, 0, 2.6 * s, 1.6 * s, 2.6 * s, lv]);
      if (!lod) p.push([0, 3.6 * s, 0, 1.6 * s, 0.9 * s, 1.6 * s, lv]);
      if (!lod && t.kind === 'lemon') for (const [x, z] of [[1.3, 0.5], [-0.6, 1.3], [0.4, -1.3]]) p.push([x * s, 2.3 * s, z * s, 0.35, 0.4, 0.35, 'lemon']);
    }
    return p;
  }

  // ------------------------------------------------------------------ queries (spherical controller, camera)
  const _q = new T.Vector3();
  /** the terrain's top (radius) under a direction */
  function terrainR(P, d) { return P.R + P.h[cellOf(d)]; }
  /** is the direction inside a box's footprint? (the gnomonic projection on its tangent plane) */
  function inBox(b, d, pad = 0) {
    const k = d.x * b.dir.x + d.y * b.dir.y + d.z * b.dir.z;
    if (k < b.cosR) return false;
    const s = b.rb / k;
    _q.set(d.x * s - b.dir.x * b.rb, d.y * s - b.dir.y * b.rb, d.z * s - b.dir.z * b.rb);
    return Math.abs(_q.dot(b.e1)) <= b.hx + pad && Math.abs(_q.dot(b.e2)) <= b.hz + pad;
  }
  /** a world point (planet centre = origin): inside the ground or a solid box? (camera pull-in) */
  function solidAt(P, p, margin = 0.2) {
    const r = p.length(); if (r < 1e-6) return true;
    _p2.copy(p).divideScalar(r);
    if (r < terrainR(P, _p2) + margin) return true;
    for (const b of P.boxes) if (r > b.r0 - margin && r < b.r1 + margin && inBox(b, _p2, margin)) return true;
    return false;
  }
  const _p2 = new T.Vector3();

  // ------------------------------------------------------------------ meshing
  /** quads and boxes on the sphere, bucketed by block texture like VR.VoxelBuilder (one mesh per material) */
  class Mesher {
    constructor(colors) { this.b = {}; this.colors = !!colors; }
    bucket(k) { return this.b[k] || (this.b[k] = { p: [], n: [], uv: [], c: [], i: [], cnt: 0 }); }
    quad(key, a, b, c, d, nrm, us = 1, vs = 1, v0 = 0, col = null, shade = 1) {
      const B = this.bucket(this.colors ? '__vcolor' : key), base = B.cnt;
      const uvs = [[0, v0], [us, v0], [us, v0 + vs], [0, v0 + vs]];
      [a, b, c, d].forEach((q, k) => {
        B.p.push(q.x, q.y, q.z); B.n.push(nrm.x, nrm.y, nrm.z); B.uv.push(uvs[k][0], uvs[k][1]);
        if (this.colors) B.c.push(col.r * shade, col.g * shade, col.b * shade);
      });
      B.i.push(base, base + 1, base + 2, base, base + 2, base + 3); B.cnt += 4;
    }
    /** a box [cx, y0, cz, w, h, d] in a local frame (x, y = up, z) placed at origin o */
    box(fr, o, part, col) {
      const [cx, y0, cz, w, h, d, key] = part;
      const P = (x, y, z) => o.clone().addScaledVector(fr.x, x).addScaledVector(fr.y, y).addScaledVector(fr.z, z);
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
      const F = [
        [fr.x, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], d, h, 0.85],
        [fr.x.clone().negate(), [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], d, h, 0.85],
        [fr.y, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], w, d, 1],
        [fr.y.clone().negate(), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], w, d, 0.6],
        [fr.z, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], w, h, 0.85],
        [fr.z.clone().negate(), [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], w, h, 0.85],
      ];
      for (const [nrm, a, b, c, dd, us, vs, sh] of F) this.quad(key, P(...a), P(...b), P(...c), P(...dd), nrm, us, vs, 0, col, sh);
    }
    build(matFor) {
      const g = new T.Group();
      for (const k in this.b) {
        const B = this.b[k], geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(B.p, 3));
        geo.setAttribute('normal', new T.Float32BufferAttribute(B.n, 3));
        geo.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2));
        if (this.colors) geo.setAttribute('color', new T.Float32BufferAttribute(B.c, 3));
        geo.setIndex(B.cnt > 65535 ? new T.Uint32BufferAttribute(B.i, 1) : new T.Uint16BufferAttribute(B.i, 1));
        geo.computeBoundingSphere();
        geo.userData.shared = true;                       // cached: never freed with a world (missions.js clearWorld)
        const m = new T.Mesh(geo, matFor(k)); m.matrixAutoUpdate = false; m.updateMatrix(); m.userData.planetKey = k;
        g.add(m);
      }
      return g;
    }
  }

  /** the terrain columns at resolution n (the playable planet: N; the sky planet: fewer) */
  function meshTerrain(P, M, n, lod) {
    const ca = (Math.PI / 2) / n, v = new T.Vector3(), w = new T.Vector3();
    const corner = []; // per face (n+1)² unit directions
    for (let f = 0; f < 6; f++) { const arr = []; for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) arr.push(dirOf(f, -QA + i * ca, -QA + j * ca, new T.Vector3())); corner.push(arr); }
    const hAt = (f, i, j) => { const c = cellOf(dirOf(f, -QA + (i + 0.5) * ca, -QA + (j + 0.5) * ca, w)); return { h: P.h[c], t: P.type[c] }; };
    const col = new T.Color();
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const me = hAt(f, i, j), rT = R + me.h;
      const K = corner[f], c00 = K[j * (n + 1) + i], c10 = K[j * (n + 1) + i + 1], c11 = K[(j + 1) * (n + 1) + i + 1], c01 = K[(j + 1) * (n + 1) + i];
      dirOf(f, -QA + (i + 0.5) * ca, -QA + (j + 0.5) * ca, v);
      const cell = c00.distanceTo(c10) * rT;
      if (lod) col.setHex(LOD_COL[me.t]).multiplyScalar(0.94 + hash(f * 9973 + j * 131 + i) * 0.12);
      M.quad(TOP[me.t], c00.clone().multiplyScalar(rT), c10.clone().multiplyScalar(rT), c11.clone().multiplyScalar(rT), c01.clone().multiplyScalar(rT), v.clone(), cell, cell, 0, col, 1);
      // walls down to each lower neighbour (the higher cell owns the wall: no gaps, no doubles)
      const E = [[c10, c11, i + 1, j], [c01, c00, i - 1, j], [c11, c01, i, j + 1], [c00, c10, i, j - 1]];
      for (const [pa, pb, ni, nj] of E) {
        const nbr = hAt(f, ni, nj);                        // (off the face: dirOf goes past 45° and lands on the next face)
        if (nbr.h >= me.h - 1e-4) continue;
        const r0 = R + nbr.h, a0 = pa.clone().multiplyScalar(r0), b0 = pb.clone().multiplyScalar(r0), a1 = pa.clone().multiplyScalar(rT), b1 = pb.clone().multiplyScalar(rT);
        const nrm = new T.Vector3().subVectors(pb, pa).cross(v).normalize();
        const hgt = rT - r0, side = SIDE[me.t], wid = pa.distanceTo(pb) * rT;
        if (lod) col.setHex(LOD_COL[me.t]).multiplyScalar(0.7);
        M.quad(side, a0, b0, b1, a1, nrm, wid, hgt, side === 'grass_side' ? 1 - hgt : 0, col, 0.85);
      }
    }
  }
  function meshDecor(P, M, lod) {
    const col = new T.Color();
    const AVG = { log: 0x7a5530, leaves: 0x3f8a2b, lemon_leaves: 0x4f9a32, pine: 0x2f6a3a, lemon: 0xffe14a, planks: 0xb08850, roof: 0x8f3b2c, cobble: 0x8a8a8a,
      stone: 0x8b8d90, stone_bricks: 0x9a9a9a, brick: 0xa0522d, glass: 0xa9d3ee, lamp: 0xffe29a, iron: 0x9da3ab, dark: 0x33312f, dirt: 0x8a5a33, gem: 0x3de0d0,
      wall: 0xe8dcc4, water: 0x2f6fc4, 'metal#e5433a': 0xd04030 };
    const put = (fr, o, part) => {
      if (!part[6]) return;                                // (collision only)
      if (lod) { if (part[3] * part[4] * part[5] < 0.5) return; col.setHex(AVG[part[6]] || 0x999999); }
      M.box(fr, o, part, col);
    };
    for (const t of P.trees) { const o = t.dir.clone().multiplyScalar(t.base); for (const pt of treeParts(t, lod)) put(t.frame, o, pt); }
    for (const l of P.lms) { const o = l.dir.clone().multiplyScalar(l.base); for (const pt of l.parts) put(l.frame, o, pt); }
    if (!lod) {                                            // flowers: tiny coloured blocks on the flower cells
      const fl = ['lemon', 'wall', 'metal#e5433a'];
      for (const c of P.flowers) {
        const d = new T.Vector3(P.cen[c * 3], P.cen[c * 3 + 1], P.cen[c * 3 + 2]), fr = frameAt(d, hash(c) * 6), o = d.clone().multiplyScalar(R + P.h[c]);
        for (let k = 0; k < 3; k++) { const x = (hash(c * 3 + k) - 0.5) * 0.9, z = (hash(c * 5 + k) - 0.5) * 0.9; M.box(fr, o, [x, 0, z, 0.06, 0.28, 0.06, 'leaves']); M.box(fr, o, [x, 0.28, z, 0.18, 0.14, 0.18, fl[(c + k) % 3]]); }
      }
    }
  }

  let WORLD = null, LOD = null;
  VR.MiniPlanet = {
    R, N, STEP, TY, PATH_W,
    data() { return DATA || (DATA = generate()); },
    cellOf, dirOf, latlon, frameAt, treeHeight,
    terrainR(d) { return terrainR(this.data(), d); },
    inBox, solidAt(p, m) { return solidAt(this.data(), p, m); },
    /** the boxes whose footprint may contain direction d */
    boxesNear(d) { const out = []; for (const b of this.data().boxes) if (d.x * b.dir.x + d.y * b.dir.y + d.z * b.dir.z >= b.cosR) out.push(b); return out; },
    landmark(id) { return this.data().lms.find(l => l.id === id) || null; },
    /** the playable planet: textured blocks, merged per texture (built once) */
    worldMesh() {
      if (!WORLD) {
        const P = this.data(), M = new Mesher(false);
        meshTerrain(P, M, N, false); meshDecor(P, M, false);
        WORLD = M.build(k => VR.Mat.get(k));
      }
      const g = new T.Group(); for (const m of WORLD.children) { const c = new T.Mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.updateMatrix(); g.add(c); }
      g.name = 'miniPlanet';
      return g;
    },
    /** the far planet: the same heights / trees / landmarks with fewer blocks, flat colours (one mesh) */
    lodGeometry() {
      if (!LOD) {
        const P = this.data(), M = new Mesher(true);
        meshTerrain(P, M, 22, true); meshDecor(P, M, true);
        const g = M.build(() => null);
        LOD = g.children[0].geometry;
      }
      return LOD;
    },
  };
})();
