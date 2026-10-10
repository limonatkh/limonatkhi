/* =====================================================================
 * SKY ROUTES — parkour paths of floating rocks between the five sky
 * islands (js/explore/islandworlds.js). The islands themselves are not
 * touched: each route only ADDS rocks over the void.
 *
 * Each island is its own area (built when you go there), so a route is
 * split in two halves: the rocks from island A's edge out over the void to
 * a CROSSING rock, and — in island B — the same crossing rock and the rest
 * of the way onto B's edge. Land on the crossing rock (and stand on it a
 * moment) and the world fades to island B: you are standing on the same
 * rock, B ahead of you. Walk back onto it from B's side and you cross back.
 *
 * Every rock is a real platform (a collider you stand on). No arrows, no
 * markers: the rocks point out over the void towards where the other
 * island hangs in the sky (each island is always in the same direction),
 * you find the way yourself. Falling off a route puts you back at its
 * start on the island (the routes do not count as safe ground) — a real
 * penalty.
 *
 *   route 1  Ruins → Frozen Summit      "mossy steps"    medium-hard
 *   route 2  Frozen Summit → Desert     "ice spine"      long, small rocks, drops
 *   route 3  Desert → Crystal Caverns   "burst towers"   two rocks only the Lemon Burst (Q) reaches
 *   route 4  Crystal Caverns → Citadel  "needles"        tiny rocks, zig-zags, a burst — the hardest
 *
 * Movement (js/config.js FP): jump 2.1 m high, 0.65 s in the air; walk
 * 6 m/s, sprint 9 m/s, air control keeps you speeding up towards the
 * sprint speed — a flat sprint jump covers ~5.5 m, a standing one ~4.5 m;
 * the Lemon Burst goes 7.3 m straight up (steer in the air). The gaps
 * here go up to ~4.6 m flat / 5 m down / 3 m up a 1.2 m step, and every
 * jump is checked by a test that drives the real controller over each
 * route (sprint, jump at the edge, steer to the next rock).
 *
 * VR.SkyRoutes.forLevel(id, vt, spots) → the rocks of every route half in
 * that island (pure: node tests use it too).
 * ===================================================================== */
(function () {
  const VT = (typeof VR !== 'undefined' && VR.VoxTerrain) || (typeof require !== 'undefined' ? require('./voxterrain.js') : null);
  const AZ = { isl1: 0.35, isl2: 1.55, isl3: 2.75, isl4: 4.0, isl5: 5.15 };        // where each hangs in the sky (js/explore/islands.js)
  const ORIGIN = { isl1: [0, 0], isl2: [0, 0], isl3: [0, 2], isl4: [0, 0], isl5: [4, -2] };
  const MAT = {
    isl1: { top: 'grass_top', side: 'stone#7a6a58' }, isl2: { top: 'snow', side: 'stone#8a96a6' }, isl3: { top: 'sandstone#d9a070', side: 'sandstone#c98a5a' },
    isl4: { top: 'stone#9a9ab4', side: 'stone#6e6e88' }, isl5: { top: 'cobble#8a8e98', side: 'stone#6a6e78' },
  };

  /**
   * The routes, as steps from island A's edge: [gap, lateral, dy, w, d, kind]
   *   gap      edge to edge, along the route (m)
   *   lateral  the next rock's centre moves this far to the right (m) — a change of direction
   *   dy       its top is this much higher (m)
   *   w, d     its size across / along (m)
   *   kind     'x' the crossing rock · 'b' only the Lemon Burst gets you up there
   * end: [gap, lateral, dy] — onto island B's edge.
   */
  const ROUTES = [
    { id: 'r12', from: 'isl1', to: 'isl2', steps: [
      [2.0, 0, 0, 2.2, 2.2], [2.6, 1.2, 0.8, 1.6, 1.6], [3.0, -1.5, 0, 1.4, 1.4], [2.2, 0, 1.2, 1.0, 1.0], [3.4, 1.0, -0.8, 2.0, 2.0],
      [3.0, 1.8, 0, 0.9, 0.9], [2.4, 1.8, 0.8, 0.9, 0.9], [3.2, 0, -1.2, 1.6, 1.6], [3.0, -1.2, 0, 2.4, 2.4, 'x'],
      [2.8, -1.0, 0.8, 1.2, 1.2], [3.6, 0, -1.6, 1.6, 1.6], [2.6, 1.2, 1.2, 1.0, 1.0], [3.0, 0, 0, 2.0, 2.0], [2.8, -1.0, 0.4, 1.2, 1.2]],
      end: [2.4, 0, 0.4] },
    { id: 'r23', from: 'isl2', to: 'isl3', steps: [
      [2.4, 0, 0, 1.4, 1.4], [3.8, 0, -1.0, 1.2, 1.2], [4.2, 0, -2.0, 1.0, 1.0], [3.6, 1.4, 0, 0.9, 0.9], [2.0, 1.4, 1.2, 0.9, 0.9],
      [3.8, -0.6, -0.4, 1.0, 1.0], [3.4, -2.0, 0, 0.8, 0.8], [4.4, 0, -1.6, 1.2, 1.2], [3.0, 0, 1.2, 1.8, 1.8], [4.6, 0, -0.4, 1.0, 1.0],
      [3.2, 1.6, 0, 0.8, 0.8], [3.8, 0, -2.4, 1.4, 1.4], [3.2, 0, 0.8, 2.2, 2.2, 'x'],
      [4.0, -1.2, -1.2, 1.0, 1.0], [3.6, 0, 0, 0.9, 0.9], [2.6, 1.0, 1.2, 0.9, 0.9], [4.2, 0, -1.6, 1.2, 1.2], [3.6, -1.4, 0.4, 1.0, 1.0]],
      end: [3.0, 0, 0.4] },
    { id: 'r34', from: 'isl3', to: 'isl4', steps: [
      [2.0, 0, 0, 2.0, 2.0], [3.4, 0, 1.2, 1.2, 1.2], [1.4, 0, 5.2, 1.4, 1.4, 'b'], [3.6, 0, 0, 1.0, 1.0], [4.0, 1.2, -2.0, 1.0, 1.0],
      [3.0, -1.2, 0, 0.9, 0.9], [1.2, 0, 5.4, 1.2, 1.2, 'b'], [4.4, 0, -1.2, 1.0, 1.0], [4.8, 0, -3.0, 1.6, 1.6], [3.4, 1.2, 0, 2.2, 2.2, 'x'],
      [3.6, 0, -1.2, 1.0, 1.0], [1.4, 0, 5.0, 1.2, 1.2, 'b'], [3.8, -1.4, -0.8, 0.9, 0.9], [3.2, 0, -1.6, 1.2, 1.2]],
      end: [3.0, 0, -0.4] },
    { id: 'r45', from: 'isl4', to: 'isl5', steps: [
      [2.0, 0, 0, 1.6, 1.6], [3.6, 1.5, 0, 0.8, 0.8], [3.6, -3.0, 0, 0.8, 0.8], [3.4, 3.0, 0.4, 0.8, 0.8], [4.2, -1.5, -1.2, 0.8, 0.8],
      [1.0, 0, 5.0, 1.0, 1.0, 'b'], [4.4, 0, -0.8, 0.8, 0.8], [4.4, 1.2, -1.2, 0.8, 0.8], [3.8, -2.4, 0, 0.7, 0.7], [4.6, 0, -2.0, 1.2, 1.2], [3.6, 0, 0, 2.0, 2.0, 'x'],
      [4.2, 1.4, -0.8, 0.8, 0.8], [3.6, -2.8, 0.4, 0.8, 0.8], [1.2, 0, 5.0, 1.0, 1.0, 'b'], [4.4, 1.4, -1.6, 0.8, 0.8], [4.0, 0, -0.8, 1.0, 1.0]],
      end: [2.6, 0, -0.4] },
  ];

  /** the route in its own frame: rock centres (s along, l across, y up from A's edge) */
  function layout(route) {
    const rocks = []; let s = 0, l = 0, y = 0, d0 = 2;        // A's edge cell: 2 m
    for (const st of route.steps) {
      const [gap, dl, dy, w, d, kind] = st;
      s += d0 / 2 + gap + d / 2; l += dl; y += dy; d0 = d;
      rocks.push({ s, l, y, w, d, kind: kind || '' });
    }
    const [gap, dl, dy] = route.end;
    const end = { s: s + d0 / 2 + gap + 1, l: l + dl, y: y + dy };
    return { rocks, end, cross: rocks.findIndex(r => r.kind === 'x') };
  }

  /** an island's edge towards a direction: the outermost cell along that line you can walk to from the spawn */
  function anchorOf(id, vt, spots, dir) {
    const [ox, oz] = ORIGIN[id], sp = spots.spawn;
    const seen = VT.reach(vt, sp[0], sp[2], { y: sp[1], gap: true });
    const tops = new Set(); for (const v of seen.values()) { const c = vt.get(v.i, v.j); if (c && Math.abs(c.h - v.y) < 1e-6) tops.add(v.i + ',' + v.j); }
    let best = null;
    for (let t = 0; t < 70; t += 0.5) {
      const x = ox + dir[0] * t, z = oz + dir[1] * t, [i, j] = vt.ij(x, z);
      if (tops.has(i + ',' + j)) best = { i, j, x: vt.cx(i), z: vt.cz(j), y: vt.get(i, j).h, t };
    }
    return best;
  }
  const dirTo = (other) => [Math.sin(AZ[other]), -Math.cos(AZ[other])];

  /**
   * The rocks in island `id` (each route half that touches it), in world coordinates:
   * { route, half: 'a'|'b', rocks: [{ x, z, y, w, d, ang, kind, i }], cross, start, to, toArrive }
   */
  function forLevel(id, vt, spots, lookup) {
    const out = [];
    for (const R of ROUTES) {
      if (R.from !== id && R.to !== id) continue;
      const lay = layout(R), half = R.from === id ? 'a' : 'b';
      const other = half === 'a' ? R.to : R.from;
      const f = dirTo(other), a = anchorOf(id, vt, spots, f); if (!a) continue;
      const r = [-f[1], f[0]];                                 // right of "outwards"
      const ang = Math.atan2(f[0], f[1]);
      const rocks = [];
      const put = (rk, i) => {
        let s, l, y;
        if (half === 'a') { s = rk.s; l = rk.l; y = rk.y; }
        else { s = lay.end.s - rk.s; l = -(rk.l - lay.end.l); y = rk.y - lay.end.y; }    // walking towards B: B's edge is the origin, the route comes in from outside
        // the edge cell's centre is the origin; its outer face is 1 m out
        rocks.push({ x: a.x + f[0] * s + r[0] * l, z: a.z + f[1] * s + r[1] * l, y: a.y + y, w: rk.w, d: rk.d, ang, kind: rk.kind, i });
      };
      lay.rocks.forEach((rk, i) => { if (half === 'a' ? i <= lay.cross : i >= lay.cross) put(rk, i); });
      const cross = rocks.find(q => q.kind === 'x');
      out.push({ route: R.id, half, rocks, cross, anchor: a, dir: f, to: other, from: id });
    }
    return out;
  }

  const API = { ROUTES, layout, forLevel, anchorOf, AZ, ORIGIN };
  if (typeof VR === 'undefined' || typeof THREE === 'undefined') { if (typeof module !== 'undefined') module.exports = API; return; }

  /* ==================================================================
   * in the levels: the rocks (one merged mesh per island), their colliders,
   * the crossing, no safe ground on the rocks
   * ================================================================ */
  const T = THREE;
  /** a rock: a flat top to land on, a rough underside tapering into the void */
  function rockBoxes(vb, L, rk, mat, rand) {
    // (axis-aligned blocks, the voxel style: a square as big as the rock)
    const W = (rk.w + rk.d) / 2, D = W;
    vb.addBox(rk.x, rk.y - 0.8, rk.z, W, 0.8, D, { top: mat.top, side: mat.side, bottom: mat.side });
    const k = 0.55 + rand() * 0.2;
    vb.addBox(rk.x + (rand() - 0.5) * 0.2, rk.y - 1.8, rk.z + (rand() - 0.5) * 0.2, W * k, 1.0, D * k, mat.side);
    if (W > 1.2) vb.addBox(rk.x, rk.y - 2.6, rk.z, W * 0.3, 0.8, D * 0.3, mat.side);
    const sol = L.collider(rk.x - W / 2, rk.y - 0.8, rk.z - D / 2, rk.x + W / 2, rk.y, rk.z + D / 2);
    sol.route = true; sol.mat = mat.top;
    return { x0: rk.x - W / 2, x1: rk.x + W / 2, z0: rk.z - D / 2, z1: rk.z + D / 2, y: rk.y };
  }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function attach(id) {
    const env = VR.MissionEnvironments[id]; if (!env || env.skyRoutes) return;
    const wrapped = function () {
      const L = env.apply(this, arguments);
      const vt = L.extras.terrain, spots = L.extras.spots; if (!vt) return L;
      const halves = forLevel(id, vt, spots), mat = MAT[id], vb = new VR.VoxelBuilder(), rand = rng(id.charCodeAt(3) * 977);
      const boxes = [];
      L.extras.routes = halves.map(h => {
        const rb = h.rocks.map(rk => Object.assign(rockBoxes(vb, L, rk, mat, rand), { kind: rk.kind, i: rk.i }));
        boxes.push(...rb);
        const cross = rb.find(b => b.kind === 'x');
        return { route: h.route, half: h.half, to: h.to, rocks: rb, cross, anchor: h.anchor, dir: h.dir, world: h };
      });
      if (halves.length) L.group.add(vb.build());
      // the rocks are not safe ground: a fall puts you back where you last stood on the island
      L.unsafeAt = (p) => boxes.some(b => p.x > b.x0 - 0.35 && p.x < b.x1 + 0.35 && p.z > b.z0 - 0.35 && p.z < b.z1 + 0.35 && Math.abs(p.y - b.y) < 0.5);
      // the crossing: stand on it a moment → the other island, on the same rock
      const up0 = L.extras.update;
      let onT = 0, armed = false;                           // (armed once you are off every crossing rock: arriving on one does not send you back)
      L.extras.update = function (dt, mgr) {
        if (up0) up0.call(this, dt, mgr);
        const c = mgr.ctrl; if (!c || !L.extras.routes) return;
        let on = null;
        for (const r of L.extras.routes) { const b = r.cross; if (b && c.grounded && c.pos.x > b.x0 - 0.2 && c.pos.x < b.x1 + 0.2 && c.pos.z > b.z0 - 0.2 && c.pos.z < b.z1 + 0.2 && Math.abs(c.pos.y - b.y) < 0.3) on = r; }
        if (!on) { onT = 0; armed = true; return; }
        if (!armed) return;
        onT += dt;
        if (onT > 0.25 && mgr.game && mgr.game.modes) {
          armed = false;
          const at = VR.SkyRoutes.arrivalAt(on.to, on.route);
          if (at) mgr.game.modes.travel(on.to, at);
        }
      };
      return L;
    };
    wrapped.skyRoutes = true;
    VR.MissionEnvironments[id] = wrapped;
  }
  ['isl1', 'isl2', 'isl3', 'isl4', 'isl5'].forEach(attach);

  /** where you stand when you cross into `island` by `route`: the centre of its crossing rock, facing the island */
  function arrivalAt(island, route) {
    const gen = VR.IslandGen && VR.IslandGen[island]; if (!gen) return null;
    const cache = arrivalAt.cache || (arrivalAt.cache = {});
    const key = island + ':' + route;
    if (!cache[key]) {
      const G = gen();
      const h = forLevel(island, G.vt, G.spots).find(q => q.route === route);
      if (!h || !h.cross) return null;
      const towards = [-h.dir[0], -h.dir[1]];                  // into the island
      cache[key] = { pos: [+h.cross.x.toFixed(2), +(h.cross.y + 0.05).toFixed(2), +h.cross.z.toFixed(2)], yaw: +Math.atan2(-towards[0], -towards[1]).toFixed(3), cross: true };
    }
    return cache[key];
  }

  VR.SkyRoutes = Object.assign(API, { arrivalAt, MAT });
})();
