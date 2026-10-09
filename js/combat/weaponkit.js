/* =====================================================================
 * WEAPON KIT — the shooting pieces shared by the 1v1 duel and the
 * single-player combat in the adventure world.
 * ---------------------------------------------------------------------
 *   boxesAt(p, low)              head + body boxes of a standing player
 *   wallDist(ray, solids, o, d)  distance to the first wall along a ray
 *   traceParts(ray, solids, o, d, targets)
 *                                first box part hit (blocked by walls)
 *   stepNade(n, dt, solids)      grenade flight; returns the blast point
 *   impulse(ctrl, p, R, PUSH)    push a first-person controller away from
 *                                a blast (under the feet = rocket jump)
 *   WEAPONS                      the single-player weapon table
 *   model(id)                    the voxel model of a weapon
 *
 * The duel calls these with exactly the numbers it always used, so its
 * behaviour does not change (js/duel/duel.js).
 * ===================================================================== */
(function () {
  const T = THREE;
  const FP = () => VR.CONFIG.FP;
  const _w = new T.Vector3();
  // solids: plain Box3s (duel) or { s: levelSolid, box: Box3 } (areas, where a gate can switch its solid off)
  const off = (b) => (b.s ? b.s.enabled === false : b.enabled === false);

  function boxesAt(p, low, k = 1) {
    // k: body size (1 = normal; the SHRINKER gets smaller with every hit)
    const h = (low ? FP().CROUCH_HEIGHT : FP().HEIGHT) * k, w = 0.34 * k;
    // the head box covers the whole drawn head (the hero's big voxel head reaches ~2.1 m): a hit on the visible head is a headshot
    const head = new T.Box3(new T.Vector3(p.x - w, p.y + h - 0.5 * k, p.z - w), new T.Vector3(p.x + w, p.y + h + 0.4 * k, p.z + w));
    const body = new T.Box3(new T.Vector3(p.x - w, p.y, p.z - w), new T.Vector3(p.x + w, p.y + h - 0.5 * k, p.z + w));
    return { head, body };
  }
  function wallDist(ray, solids, o, d, max = 200) {
    ray.set(o, d);
    let best = max;
    for (const b of solids) {
      if (off(b)) continue;
      const box = b.box || b;
      if (box.containsPoint(o)) continue;
      const hit = ray.intersectBox(box, _w);
      if (hit) { const dist = hit.distanceTo(o); if (dist < best) best = dist; }
    }
    return best;
  }
  /**
   * targets: [{ parts: { name: Box3, … }, ref }]. Returns
   * { hit: partName|null, ref, dist, end, wall }.
   */
  function traceParts(ray, solids, o, d, targets, max = 200) {
    const wall = wallDist(ray, solids, o, d, max);
    ray.set(o, d);
    let best = null;
    for (const t of targets) {
      for (const part in t.parts) {
        const hit = ray.intersectBox(t.parts[part], _w);
        if (!hit) continue;
        const dist = hit.distanceTo(o);
        if (dist < wall && (!best || dist < best.dist - 0.01)) best = { part, dist, ref: t.ref };
      }
    }
    const end = o.clone().addScaledVector(d, best ? best.dist : Math.min(wall, max));
    return { hit: best ? best.part : null, ref: best ? best.ref : null, dist: best ? best.dist : wall, end, wall };
  }
  /* ------------------------------------------------------------------
   * BALLISTICS: shots are fast but not instant, so the wind carries them.
   *   [muzzle speed m/s, wind coupling k 1/s, gravity m/s²]
   * The bullet's sideways speed relaxes towards the wind's speed (drag):
   *   v(t) = W (1 − e^(−k t))   →   x(t) = W (t − (1 − e^(−k t)) / k)
   * so the drift grows with the square of the flight time at first: far
   * targets need more correction, slow arrows a lot (and they also drop).
   * Against a headwind / tailwind the same formula only stretches the path.
   * ---------------------------------------------------------------- */
  const BALLISTIC = {
    pistol: [180, 6, 0], revolver: [200, 5, 0], smg: [190, 6, 0], rifle: [260, 5, 0], dmr: [330, 4, 0], sniper: [420, 3, 0],
    lmg: [240, 5, 0], shotgun: [150, 7, 0], railgun: [600, 1.5, 0], plasma: [280, 4, 0], minigun: [230, 5, 0], goldfang: [220, 5, 0], thunder: [160, 7, 0],
    bow: [70, 1.6, 9.8],
  };
  const drift = (k, t) => t - (1 - Math.exp(-k * t)) / k;
  /** where a shot fired from o along d is after `s` metres (wind: a Vector3, may be null) */
  function pathPoint(o, d, wid, wind, s, out = new T.Vector3()) {
    const B = BALLISTIC[wid]; out.copy(o).addScaledVector(d, s);
    if (!B) return out;
    const t = s / B[0];
    if (wind) out.addScaledVector(wind, drift(B[1], t));
    if (B[2]) out.y -= 0.5 * B[2] * t * t;
    return out;
  }
  /** the drift a shot would get at distance s (what a shooter must aim against) */
  function driftAt(wid, wind, s, out = new T.Vector3()) {
    const B = BALLISTIC[wid]; out.set(0, 0, 0);
    if (!B) return out;
    const t = s / B[0];
    if (wind) out.addScaledVector(wind, drift(B[1], t));
    if (B[2]) out.y -= 0.5 * B[2] * t * t;
    return out;
  }
  /**
   * traceParts along the curved path: short straight pieces, each traced against walls and targets.
   * Same result as traceParts, plus `path` (points along the flight, for the tracer).
   */
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3();
  function tracePath(ray, solids, o, d, targets, max = 200, wid = null, wind = null) {
    const B = BALLISTIC[wid];
    const calm = !wind || (Math.abs(wind.x) + Math.abs(wind.z) < 0.05);
    if (!B || (calm && !B[2])) { const r = traceParts(ray, solids, o, d, targets, max); r.path = [o.clone(), r.end.clone()]; return r; }
    const n = Math.min(24, Math.max(4, Math.ceil(max / 10)));
    const step = max / n, path = [o.clone()];
    let s0 = 0;
    pathPoint(o, d, wid, calm ? null : wind, 0, _a);
    for (let i = 1; i <= n; i++) {
      const s1 = i * step;
      pathPoint(o, d, wid, calm ? null : wind, s1, _b);
      _d.copy(_b).sub(_a); const len = _d.length(); _d.divideScalar(len || 1);
      const r = traceParts(ray, solids, _a, _d, targets, len);
      if (r.ref || r.wall < len) {
        const along = r.ref ? r.dist : Math.min(r.wall, len);
        const end = _a.clone().addScaledVector(_d, along);
        path.push(end.clone());
        return { hit: r.hit, ref: r.ref, dist: s0 + along, end, wall: r.ref ? Infinity : s0 + along, path };
      }
      path.push(_b.clone()); _a.copy(_b); s0 = s1;
    }
    return { hit: null, ref: null, dist: max, end: _a.clone(), wall: max, path };
  }

  /** move a grenade one frame; returns the blast point (or null) */
  /**
   * Grenade flight. It bounces off walls and ceilings; when it LANDS on top of
   * something it stops there, and goes off LAND_DELAY seconds later (it no
   * longer explodes on contact). Returns the blast point when it explodes.
   * n: { pos, vel, t, landed, landT }
   */
  const LAND_DELAY = 1 / 5, AIR_MAX = 6;
  function stepNade(n, dt, solids, gravity = 22, wind = null) {
    if (n.landed) { n.landT = (n.landT || 0) + dt; return n.landT >= LAND_DELAY ? n.pos.clone() : null; }
    const steps = 3, sdt = dt / steps;
    // the wind drags a flying grenade along with it (air drag towards the wind's speed)
    const wk = wind ? 1 - Math.exp(-sdt * 0.45) : 0;
    for (let s = 0; s < steps; s++) {
      n.vel.y -= gravity * sdt;
      if (wk) { n.vel.x += (wind.x - n.vel.x) * wk; n.vel.z += (wind.z - n.vel.z) * wk; }
      const prev = n.pos.clone();
      n.pos.addScaledVector(n.vel, sdt);
      const hit = solids.find(b => !off(b) && (b.box || b).containsPoint(n.pos));
      if (!hit) continue;
      const box = hit.box || hit;
      if (prev.y >= box.max.y - 0.05 && n.vel.y <= 0) {                // on top of it: landed
        n.pos.set(n.pos.x, box.max.y + 0.08, n.pos.z);
        n.vel.set(0, 0, 0); n.landed = true; n.landT = 0;
        return null;
      }
      n.pos.copy(prev);
      if (prev.y <= box.min.y + 0.05 && n.vel.y > 0) n.vel.y *= -0.3;    // ceiling
      else {                                                            // a wall: bounce back, losing speed
        const outX = prev.x <= box.min.x || prev.x >= box.max.x;
        if (outX) n.vel.x *= -0.45; else n.vel.z *= -0.45;
        n.vel.x *= 0.85; n.vel.z *= 0.85;
      }
    }
    return (n.t || 0) >= AIR_MAX ? n.pos.clone() : null;               // never lost in the air
  }
  /** push a first-person controller away from a blast at p. Returns the strength (0 = out of range). */
  /** caps: the launch speed limits ({ vy, h }); the grenade launch is twice as high as it first was (√2 speed) */
  const CAPS = { vy: 36, h: 28.3 };
  function impulse(c, p, R, PUSH, tmp = new T.Vector3(), caps = CAPS) {
    const center = tmp.copy(c.pos); center.y += 0.9;
    const dist = center.distanceTo(p);
    if (dist > R) return 0;
    const k = 1 - (dist / R) * 0.55;
    const dir = center.clone().sub(p);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const flat = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
    const under = p.y < c.pos.y + 0.7 && flat < 1.8;
    if (under) {
      // blast under the feet: straight up where you stand (no long jump forward)
      dir.set(0, 1, 0);
      c.vel.x *= 0.15; c.vel.z *= 0.15;
    }
    c.vel.addScaledVector(dir, PUSH * k);
    c.vel.y = Math.min(c.vel.y, caps.vy);
    const h = Math.hypot(c.vel.x, c.vel.z);
    if (h > caps.h) { c.vel.x *= caps.h / h; c.vel.z *= caps.h / h; }
    c.grounded = false; c.coyote = 0; c.inBurst = true; c.slideTimer = 0;
    c.burstFov = 7;
    return k;
  }

  /* ------------------------------------------------------------------
   * SINGLE-PLAYER WEAPONS
   *   dmg per pellet · head / weak multipliers · rate = seconds between
   *   shots · auto = hold to fire · mag / reserve (max carried) ·
   *   spread (hip), pellets, range (damage falls to 40% at the end)
   * ---------------------------------------------------------------- */
  const WEAPONS = {
    pistol:  { name: { en: 'Lemon pistol', ar: 'مسدس الليمون' }, dmg: 24, head: 2, rate: 0.26, auto: false, mag: 12, reserve: 72, spread: 0.008, pellets: 1, range: 60, reload: 1.1, sound: 'pistol', kick: 0.5 },
    shotgun: { name: { en: 'Scatter shotgun', ar: 'بندقية الرشّ' }, dmg: 11, head: 1.5, rate: 0.85, auto: false, mag: 6, reserve: 30, spread: 0.075, pellets: 9, range: 22, reload: 1.8, sound: 'shotgun', kick: 1.2 },
    smg:     { name: { en: 'Light SMG', ar: 'الرشّاش الخفيف' }, dmg: 12, head: 1.8, rate: 0.085, auto: true, mag: 32, reserve: 160, spread: 0.022, pellets: 1, range: 45, reload: 1.5, sound: 'smg', kick: 0.25 },
    sniper:  { name: { en: 'Sniper', ar: 'القنّاصة' }, dmg: 95, head: 2.5, rate: 1.0, auto: false, mag: 5, reserve: 25, spread: 0.012, scopedSpread: 0, pellets: 1, range: 200, reload: 1.9, sound: 'sniper', kick: 1, scope: true },
  };
  const NADE = { name: { en: 'Impulse grenade', ar: 'قنبلة الدفع' }, max: 2, recharge: 6, speed: 15, fuse: 1.3, R: 3.8, push: 34, dmg: 70 };   // push 34 (was 24): twice the launch height again

  /* ------------------------------------------------------------------ models */
  const NEON = 0xb26bff, LEMON = 0xffe14a;
  function neonMat(color) { const m = new T.MeshBasicMaterial({ color }); m.toneMapped = false; m.userData.own = true; return m; }
  function strip(g, w, h, d, x, y, z, c) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), neonMat(c)); m.position.set(x, y, z); g.add(m); return m; }
  /* ---- weapon models: each has its own shape and colours, and iron sights on
   *      top (rear notch + front post) at userData.sightY: aiming down the sights
   *      (js/duel/duel.js) lines them up with the middle of the screen. */
  const S_W = (vb, z, y, c) => { vb.addColorBox(-0.017, y, z, 0.012, 0.022, 0.012, c); vb.addColorBox(0.017, y, z, 0.012, 0.022, 0.012, c); };   // rear notch
  const S_F = (vb, z, y, c) => vb.addColorBox(0, y, z, 0.01, 0.022, 0.01, c);                                                              // front post
  function cyl(g, r, len, color, x, y, z) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), new T.MeshLambertMaterial({ color }));
    m.material.userData.own = true; m.geometry.userData.own = true;
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
  }
  /** lemon pistol: short, black frame, yellow slide */
  function pistol() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.035, -0.06, 0.055, 0.075, 0.26, 0xe8c22a);        // slide (lemon)
    vb.addColorBox(0, -0.06, -0.05, 0.05, 0.03, 0.2, 0x23262f);            // frame
    vb.addColorBox(0, -0.17, 0.04, 0.05, 0.13, 0.065, 0x23262f);           // grip
    vb.addColorBox(0, -0.1, -0.01, 0.02, 0.04, 0.05, 0x23262f);            // trigger guard
    vb.addColorBox(0, -0.02, -0.2, 0.03, 0.03, 0.03, 0x1a1a1a);            // muzzle
    S_W(vb, 0.055, 0.04, 0x1a1a1a); S_F(vb, -0.175, 0.04, 0x1a1a1a);
    g.add(vb.build());
    strip(g, 0.006, 0.006, 0.006, 0, 0.056, -0.175, 0xff5a3a);             // red front dot
    g.userData.muzzle = new T.Vector3(0, -0.005, -0.23); g.userData.sightY = 0.058;
    return g;
  }
  /** scatter shotgun: two long barrels, wooden pump and stock, orange bead */
  function shotgun() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.06, 0.0, 0.08, 0.1, 0.2, 0x2a2d35);               // receiver
    vb.addColorBox(0.021, -0.025, -0.36, 0.04, 0.042, 0.52, 0x3a3d45);     // barrel 1
    vb.addColorBox(-0.021, -0.025, -0.36, 0.04, 0.042, 0.52, 0x3a3d45);    // barrel 2
    vb.addColorBox(0, 0.017, -0.36, 0.012, 0.008, 0.52, 0x1a1a1a);         // rib
    vb.addColorBox(0, -0.085, -0.27, 0.075, 0.055, 0.2, 0x8a5a2e);         // pump (wood)
    vb.addColorBox(0, -0.11, 0.18, 0.06, 0.12, 0.12, 0x7a4a26);            // grip
    vb.addColorBox(0, -0.09, 0.3, 0.075, 0.13, 0.2, 0x8a5a2e);             // stock
    S_W(vb, 0.08, 0.02, 0x1a1a1a);
    g.add(vb.build());
    strip(g, 0.014, 0.016, 0.014, 0, 0.033, -0.61, 0xff9a2a);              // bead front sight
    g.userData.muzzle = new T.Vector3(0, -0.005, -0.64); g.userData.sightY = 0.039;
    return g;
  }
  /** light SMG: sand-coloured, fat suppressor, front grip, wire stock */
  function smg() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.045, -0.02, 0.065, 0.09, 0.28, 0xb59a6a);        // body (sand)
    vb.addColorBox(0, -0.18, -0.06, 0.04, 0.15, 0.045, 0x1c1f24);          // straight magazine
    vb.addColorBox(0, -0.15, 0.07, 0.045, 0.11, 0.05, 0x1c1f24);           // grip
    vb.addColorBox(0, -0.14, -0.15, 0.035, 0.1, 0.035, 0x1c1f24);          // front grip
    vb.addColorBox(0, -0.025, 0.2, 0.012, 0.012, 0.2, 0x1c1f24);           // wire stock (top)
    vb.addColorBox(0, -0.085, 0.2, 0.012, 0.012, 0.2, 0x1c1f24);           // wire stock (bottom)
    vb.addColorBox(0, -0.09, 0.3, 0.012, 0.075, 0.02, 0x1c1f24);           // butt
    S_W(vb, 0.08, 0.045, 0x1c1f24); S_F(vb, -0.13, 0.045, 0x1c1f24);
    vb.addColorBox(0, 0.045, -0.13, 0.04, 0.008, 0.012, 0x1c1f24);         // front sight hood
    g.add(vb.build());
    cyl(g, 0.03, 0.22, 0x22252b, 0, 0.0, -0.27);                           // suppressor
    strip(g, 0.004, 0.012, 0.2, 0.034, 0.0, -0.02, 0x5fdc5f);
    g.userData.muzzle = new T.Vector3(0, 0.0, -0.39); g.userData.sightY = 0.064;
    return g;
  }
  /** revolver: silver, long barrel, round cylinder, wooden grip */
  function revolver() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.03, -0.17, 0.035, 0.04, 0.24, 0xb8bec8);         // barrel
    vb.addColorBox(0, -0.045, -0.17, 0.02, 0.015, 0.24, 0x9aa0aa);         // under-lug
    vb.addColorBox(0, -0.05, 0.03, 0.05, 0.1, 0.12, 0xb8bec8);             // frame
    vb.addColorBox(0, 0.03, 0.08, 0.015, 0.03, 0.03, 0x50565f);            // hammer
    vb.addColorBox(0, -0.18, 0.1, 0.05, 0.14, 0.07, 0x6b4526);             // wooden grip
    vb.addColorBox(0, -0.1, 0.02, 0.018, 0.045, 0.05, 0x50565f);           // trigger guard
    S_W(vb, 0.06, 0.05, 0x50565f); S_F(vb, -0.27, 0.01, 0x50565f);
    vb.addColorBox(0, 0.01, -0.27, 0.01, 0.06, 0.02, 0x50565f);            // tall front blade
    g.add(vb.build());
    cyl(g, 0.045, 0.08, 0x8a9099, 0, 0.0, -0.01);                          // the cylinder
    g.userData.muzzle = new T.Vector3(0, -0.01, -0.3); g.userData.sightY = 0.068;
    return g;
  }
  /** assault rifle (M16 style): black, carry handle with a rear aperture, tall front sight tower */
  function rifle() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.06, 0.0, 0.07, 0.1, 0.26, 0x1e2024);              // receiver
    vb.addColorBox(0, 0.04, 0.02, 0.03, 0.05, 0.16, 0x1e2024);             // carry handle
    vb.addColorBox(-0.018, 0.04, 0.02, 0.008, 0.05, 0.02, 0x1e2024); vb.addColorBox(0.018, 0.04, 0.02, 0.008, 0.05, 0.02, 0x1e2024);
    vb.addColorBox(0, -0.05, -0.27, 0.06, 0.07, 0.28, 0x3a3e46);           // round-ish grey handguard
    vb.addColorBox(0, -0.025, -0.48, 0.022, 0.022, 0.18, 0x1e2024);        // barrel
    vb.addColorBox(0, -0.025, -0.42, 0.02, 0.115, 0.03, 0x1e2024);         // front sight tower
    vb.addColorBox(0, -0.2, -0.06, 0.045, 0.15, 0.065, 0x2a2d33);          // curved magazine
    vb.addColorBox(0, -0.27, -0.09, 0.045, 0.06, 0.05, 0x2a2d33);
    vb.addColorBox(0, -0.17, 0.1, 0.045, 0.11, 0.05, 0x1e2024);            // grip
    vb.addColorBox(0, -0.09, 0.27, 0.065, 0.12, 0.2, 0x1e2024);            // stock
    S_W(vb, 0.08, 0.09, 0x1e2024); S_F(vb, -0.42, 0.09, 0x1e2024);
    g.add(vb.build());
    strip(g, 0.004, 0.004, 0.004, 0, 0.114, -0.42, 0xffe14a);                // a tiny lemon dot on the post
    g.userData.muzzle = new T.Vector3(0, -0.015, -0.58); g.userData.sightY = 0.108;
    return g;
  }
  /** marksman rifle: long wooden body and a scope (it uses the scope, not iron sights) */
  function dmr() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.05, -0.1, 0.065, 0.085, 0.5, 0x7a5a32);           // long wooden body
    vb.addColorBox(0, -0.02, -0.45, 0.028, 0.028, 0.26, 0x1c1f24);         // barrel
    vb.addColorBox(0, 0.035, -0.06, 0.012, 0.03, 0.012, 0x1c1f24); vb.addColorBox(0, 0.035, -0.18, 0.012, 0.03, 0.012, 0x1c1f24);   // scope rings
    vb.addColorBox(0, -0.15, -0.04, 0.04, 0.1, 0.06, 0x1c1f24);            // magazine
    vb.addColorBox(0, -0.07, 0.26, 0.06, 0.12, 0.17, 0x7a5a32);            // stock
    vb.addColorBox(0, 0.0, 0.26, 0.05, 0.03, 0.12, 0x5a3e22);              // cheek rest
    g.add(vb.build());
    cyl(g, 0.026, 0.26, 0x1c1f24, 0, 0.08, -0.12);                         // scope tube
    cyl(g, 0.034, 0.03, 0x1c1f24, 0, 0.08, -0.26);                         // objective
    strip(g, 0.005, 0.012, 0.22, 0.03, 0.08, -0.12, 0x5fd0ff);
    g.userData.muzzle = new T.Vector3(0, -0.01, -0.6); g.userData.sightY = 0.08;
    return g;
  }
  /** heavy machine gun: olive drab, perforated barrel shroud, ammo box, bipod */
  function lmg() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.07, -0.02, 0.09, 0.12, 0.3, 0x4b5320);            // receiver (olive)
    vb.addColorBox(0, 0.05, -0.02, 0.07, 0.02, 0.24, 0x3d4419);            // top cover
    for (let i = 0; i < 6; i++) vb.addColorBox(0, -0.05, -0.22 - i * 0.05, 0.065, 0.065, 0.032, i % 2 ? 0x2a2d22 : 0x4b5320);   // shroud
    vb.addColorBox(0, -0.025, -0.5, 0.03, 0.03, 0.12, 0x1c1f24);           // barrel
    vb.addColorBox(0, -0.035, -0.53, 0.012, 0.127, 0.014, 0x1c1f24);       // front post on the barrel
    vb.addColorBox(0, -0.2, -0.02, 0.12, 0.11, 0.13, 0x5a6a2a);            // ammo box
    vb.addColorBox(0, -0.18, 0.12, 0.05, 0.11, 0.05, 0x2a2d22);            // grip
    vb.addColorBox(0, -0.09, 0.28, 0.08, 0.13, 0.18, 0x4b5320);            // stock
    vb.addColorBox(0.045, -0.2, -0.46, 0.012, 0.14, 0.012, 0x1c1f24); vb.addColorBox(-0.045, -0.2, -0.46, 0.012, 0.14, 0.012, 0x1c1f24);   // bipod
    S_W(vb, 0.07, 0.07, 0x1c1f24);
    g.add(vb.build());
    strip(g, 0.004, 0.012, 0.28, 0.047, 0.0, -0.02, 0xff4a4a);
    g.userData.muzzle = new T.Vector3(0, -0.01, -0.57); g.userData.sightY = 0.088;
    return g;
  }
  function knife() {
    const g = new T.Group();
    const blade = new T.Mesh(new T.BoxGeometry(0.035, 0.07, 0.34), new T.MeshLambertMaterial({ color: 0xdfe6ee })); blade.position.set(0, 0.02, -0.25);
    const edge = new T.Mesh(new T.BoxGeometry(0.037, 0.02, 0.3), neonMat(LEMON)); edge.position.set(0, -0.02, -0.24);
    const guard = new T.Mesh(new T.BoxGeometry(0.11, 0.05, 0.04), new T.MeshLambertMaterial({ color: 0x3a3f4a })); guard.position.set(0, 0, -0.06);
    const grip = new T.Mesh(new T.BoxGeometry(0.06, 0.07, 0.17), new T.MeshLambertMaterial({ color: 0x2a2018 })); grip.position.set(0, 0, 0.05);
    for (const m of [blade, edge, guard, grip]) { m.material.userData.own = true; m.geometry.userData.own = true; g.add(m); }
    return g;
  }
  /** a spear: a long wooden shaft with a steel head (held low, point forward) */
  function spear() {
    const g = new T.Group(), M = (c) => new T.MeshLambertMaterial({ color: c });
    const parts = [
      [new T.BoxGeometry(0.04, 0.04, 1.5), M(0x8a5a33), [0, 0, -0.2]],                  // shaft
      [new T.BoxGeometry(0.05, 0.05, 0.14), M(0x2a2018), [0, 0, 0.18]],                 // grip wrap
      [new T.BoxGeometry(0.08, 0.025, 0.22), M(0xdfe6ee), [0, 0, -1.04]],               // blade
      [new T.BoxGeometry(0.045, 0.02, 0.08), M(0xdfe6ee), [0, 0, -1.18]],               // tip
      [new T.BoxGeometry(0.06, 0.06, 0.05), neonMat(LEMON), [0, 0, -0.92]],             // collar
    ];
    for (const [geo, mat, p] of parts) { const m = new T.Mesh(geo, mat); m.position.set(...p); m.material.userData.own = true; m.geometry.userData.own = true; g.add(m); }
    g.userData.sightY = 0.05;
    return g;
  }
  /** a bow: a curved limb of blocks, a string, an arrow nocked */
  function bow() {
    const g = new T.Group(), M = (c) => new T.MeshLambertMaterial({ color: c });
    const add = (geo, mat, p, rz = 0) => { const m = new T.Mesh(geo, mat); m.position.set(...p); m.rotation.z = rz; m.material.userData.own = true; m.geometry.userData.own = true; g.add(m); return m; };
    // the limb: blocks along an arc (vertical, in front of the hand)
    // (the limb sits a little to the left of the arrow, so aiming leaves the middle of the screen free)
    for (let i = -4; i <= 4; i++) { const a = i * 0.16; add(new T.BoxGeometry(0.04, 0.1, 0.04), M(i === 0 ? 0x2a2018 : 0x8a5a33), [-0.07, Math.sin(a) * 0.36, -Math.cos(a) * 0.12 + 0.02], 0); }
    add(new T.BoxGeometry(0.01, 0.66, 0.01), M(0xf4f1e6), [-0.07, 0, 0.1]);                // string
    const nock = new T.Group(); nock.name = 'nock'; g.add(nock);                              // the arrow ready to shoot (hidden while nocking)
    for (const [geo, mat, p] of [[new T.BoxGeometry(0.018, 0.018, 0.62), M(0xb98a52), [0, 0.01, -0.12]], [new T.BoxGeometry(0.03, 0.03, 0.06), M(0xdfe6ee), [0, 0.01, -0.45]], [new T.BoxGeometry(0.004, 0.04, 0.06), neonMat(LEMON), [0, 0.03, 0.14]]]) {
      const m = new T.Mesh(geo, mat); m.position.set(...p); m.material.userData.own = true; m.geometry.userData.own = true; nock.add(m);
    }
    g.userData.sightY = 0.01;
    return g;
  }
  /** a flying arrow (for the shot effect) */
  function arrow() {
    const g = new T.Group(), M = (c) => new T.MeshLambertMaterial({ color: c });
    for (const [geo, c, z] of [[new T.BoxGeometry(0.025, 0.025, 0.7), 0xb98a52, 0], [new T.BoxGeometry(0.045, 0.045, 0.08), 0xdfe6ee, -0.37], [new T.BoxGeometry(0.006, 0.06, 0.1), LEMON, 0.3]]) {
      const m = new T.Mesh(geo, M(c)); m.position.z = z; m.material.userData.own = true; m.geometry.userData.own = true; g.add(m);
    }
    return g;
  }
  /** a mine: flat disk with a blinking light */
  function mine() {
    const g = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(0.22, 0.25, 0.08, 10), new T.MeshLambertMaterial({ color: 0x3d4a2e }));
    const top = new T.Mesh(new T.CylinderGeometry(0.14, 0.16, 0.05, 10), new T.MeshLambertMaterial({ color: 0x55643f })); top.position.y = 0.06;
    const led = new T.Mesh(new T.BoxGeometry(0.06, 0.04, 0.06), neonMat(0xff3a2a)); led.position.y = 0.1; led.name = 'led';
    for (const m of [base, top, led]) { m.material.userData.own = true; m.geometry.userData.own = true; g.add(m); }
    return g;
  }
  // ---- the fight weapons from the shop
  function model(id) {
    if (id === 'revolver') return revolver();
    if (id === 'rifle') return rifle();
    if (id === 'dmr') return dmr();
    if (id === 'lmg') return lmg();
    if (id === 'pistol') return pistol();
    if (id === 'shotgun') return shotgun();
    if (id === 'smg') return smg();
    if (id === 'sniper') return VR.DuelWeapons.sniper();
    if (id === 'nade') return VR.DuelWeapons.grenade();
    if (id === 'knife') return knife();
    if (id === 'spear') return spear();
    if (id === 'bow') return bow();
    if (id === 'arrow') return arrow();
    if (id === 'mine') return mine();
    return pistol();
  }

  // sounds for the new weapons (the sniper's comes from the duel)
  VR.Audio.define('pistol', ({ tone, noise }) => { noise(0.1, 0.35, 4200); tone(320, 0.09, 'square', 0.12, 120); });
  VR.Audio.define('shotgun', ({ tone, noise }) => { noise(0.28, 0.55, 2400); tone(110, 0.22, 'sawtooth', 0.2, 45); });
  VR.Audio.define('smg', ({ tone, noise }) => { noise(0.05, 0.22, 5200); tone(420, 0.04, 'square', 0.06, 200); });
  VR.Audio.define('bow', ({ tone, noise }) => { tone(220, 0.12, 'triangle', 0.14, 90); noise(0.1, 0.12, 2500); });
  VR.Audio.define('spear', ({ tone, noise }) => { noise(0.14, 0.22, 3500); tone(300, 0.1, 'sawtooth', 0.06, 140); });
  VR.Audio.define('empty', ({ tone }) => { tone(1300, 0.03, 'square', 0.05); });

  VR.WeaponKit = { boxesAt, wallDist, traceParts, tracePath, pathPoint, driftAt, BALLISTIC, stepNade, impulse, LAND_DELAY, WEAPONS, NADE, model };
})();
