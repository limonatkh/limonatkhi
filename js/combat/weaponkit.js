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

  function boxesAt(p, low) {
    const h = low ? FP().CROUCH_HEIGHT : FP().HEIGHT;
    // the head box covers the whole drawn head (the hero's big voxel head reaches ~2.1 m): a hit on the visible head is a headshot
    const head = new T.Box3(new T.Vector3(p.x - 0.34, p.y + h - 0.5, p.z - 0.34), new T.Vector3(p.x + 0.34, p.y + h + 0.4, p.z + 0.34));
    const body = new T.Box3(new T.Vector3(p.x - 0.34, p.y, p.z - 0.34), new T.Vector3(p.x + 0.34, p.y + h - 0.5, p.z + 0.34));
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
  /** move a grenade one frame; returns the blast point (or null) */
  /**
   * Grenade flight. It bounces off walls and ceilings; when it LANDS on top of
   * something it stops there, and goes off LAND_DELAY seconds later (it no
   * longer explodes on contact). Returns the blast point when it explodes.
   * n: { pos, vel, t, landed, landT }
   */
  const LAND_DELAY = 1 / 6, AIR_MAX = 6;
  function stepNade(n, dt, solids, gravity = 22) {
    if (n.landed) { n.landT = (n.landT || 0) + dt; return n.landT >= LAND_DELAY ? n.pos.clone() : null; }
    const steps = 3, sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      n.vel.y -= gravity * sdt;
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
  function pistol() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.03, -0.08, 0.06, 0.07, 0.3, 0x3a3f4d);           // slide
    vb.addColorBox(0, -0.15, 0.03, 0.055, 0.15, 0.07, 0x23262f);          // grip
    vb.addColorBox(0, -0.02, -0.25, 0.04, 0.04, 0.05, 0x6b7286);          // muzzle
    g.add(vb.build());
    strip(g, 0.062, 0.01, 0.2, 0, 0.045, -0.08, LEMON);
    g.userData.muzzle = new T.Vector3(0, -0.01, -0.3);
    return g;
  }
  function shotgun() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.05, 0.0, 0.08, 0.09, 0.36, 0x5a3a22);            // body (wood)
    vb.addColorBox(0.02, -0.02, -0.38, 0.04, 0.04, 0.5, 0x2a2d35);        // barrel 1
    vb.addColorBox(-0.02, -0.02, -0.38, 0.04, 0.04, 0.5, 0x2a2d35);       // barrel 2
    vb.addColorBox(0, -0.08, -0.25, 0.07, 0.05, 0.22, 0x6b4a2e);          // pump
    vb.addColorBox(0, -0.07, 0.28, 0.07, 0.11, 0.2, 0x5a3a22);            // stock
    g.add(vb.build());
    strip(g, 0.09, 0.012, 0.012, 0, -0.005, -0.12, 0xff7a3a);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.64);
    return g;
  }
  function smg() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.04, -0.02, 0.07, 0.09, 0.32, 0x2c3a30);
    vb.addColorBox(0, -0.025, -0.27, 0.035, 0.035, 0.2, 0x1c1f24);
    vb.addColorBox(0, -0.16, -0.05, 0.045, 0.16, 0.05, 0x1c1f24);         // magazine
    vb.addColorBox(0, -0.14, 0.08, 0.05, 0.11, 0.05, 0x2c3a30);           // grip
    vb.addColorBox(0, -0.03, 0.2, 0.05, 0.05, 0.14, 0x1c1f24);            // stock
    g.add(vb.build());
    strip(g, 0.006, 0.014, 0.26, 0.037, -0.01, -0.02, 0x5fdc5f);
    strip(g, 0.006, 0.014, 0.26, -0.037, -0.01, -0.02, 0x5fdc5f);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.4);
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
  function revolver() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.02, -0.12, 0.04, 0.04, 0.2, 0x3a3f4a);            // barrel
    vb.addColorBox(0, -0.04, 0.0, 0.08, 0.08, 0.09, 0x50565f);             // cylinder
    vb.addColorBox(0, -0.03, 0.06, 0.05, 0.06, 0.06, 0x3a3f4a);
    vb.addColorBox(0, -0.13, 0.1, 0.05, 0.13, 0.06, 0x6b4526);             // wooden grip
    g.add(vb.build());
    strip(g, 0.006, 0.012, 0.18, 0.022, 0.0, -0.12, LEMON);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.24);
    return g;
  }
  function rifle() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.03, -0.06, 0.07, 0.09, 0.4, 0x4a5a3a);            // body
    vb.addColorBox(0, -0.02, -0.36, 0.035, 0.035, 0.22, 0x1c1f24);         // barrel
    vb.addColorBox(0, 0.04, -0.05, 0.03, 0.03, 0.18, 0x1c1f24);            // rail
    vb.addColorBox(0, -0.15, -0.08, 0.045, 0.15, 0.07, 0x1c1f24);          // curved magazine
    vb.addColorBox(0, -0.14, 0.07, 0.05, 0.11, 0.05, 0x4a5a3a);            // grip
    vb.addColorBox(0, -0.04, 0.23, 0.06, 0.09, 0.16, 0x4a5a3a);            // stock
    g.add(vb.build());
    strip(g, 0.006, 0.014, 0.34, 0.037, -0.01, -0.08, 0xff9a3a);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.48);
    return g;
  }
  function dmr() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.03, -0.08, 0.065, 0.085, 0.46, 0x6b5a3a);         // long wooden body
    vb.addColorBox(0, -0.02, -0.42, 0.03, 0.03, 0.26, 0x1c1f24);           // barrel
    vb.addColorBox(0, 0.06, -0.06, 0.05, 0.05, 0.2, 0x1c1f24);             // scope
    vb.addColorBox(0, -0.14, -0.04, 0.04, 0.11, 0.06, 0x1c1f24);           // magazine
    vb.addColorBox(0, -0.05, 0.25, 0.06, 0.11, 0.16, 0x6b5a3a);            // stock
    g.add(vb.build());
    strip(g, 0.005, 0.012, 0.18, 0.027, 0.06, -0.06, 0x5fd0ff);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.56);
    return g;
  }
  function lmg() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.03, -0.06, 0.09, 0.11, 0.44, 0x2e3238);           // heavy body
    vb.addColorBox(0, -0.01, -0.38, 0.045, 0.045, 0.26, 0x1c1f24);         // thick barrel
    vb.addColorBox(0, -0.12, -0.02, 0.11, 0.1, 0.12, 0x5a5a28);            // ammo box
    vb.addColorBox(0, -0.15, 0.1, 0.05, 0.11, 0.05, 0x2e3238);             // grip
    vb.addColorBox(0, -0.04, 0.24, 0.07, 0.1, 0.14, 0x2e3238);             // stock
    vb.addColorBox(0, -0.1, -0.42, 0.012, 0.12, 0.012, 0x1c1f24);          // bipod
    g.add(vb.build());
    strip(g, 0.006, 0.014, 0.36, 0.047, 0.0, -0.06, 0xff4a4a);
    g.userData.muzzle = new T.Vector3(0, -0.01, -0.52);
    return g;
  }
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
    if (id === 'mine') return mine();
    return pistol();
  }

  // sounds for the new weapons (the sniper's comes from the duel)
  VR.Audio.define('pistol', ({ tone, noise }) => { noise(0.1, 0.35, 4200); tone(320, 0.09, 'square', 0.12, 120); });
  VR.Audio.define('shotgun', ({ tone, noise }) => { noise(0.28, 0.55, 2400); tone(110, 0.22, 'sawtooth', 0.2, 45); });
  VR.Audio.define('smg', ({ tone, noise }) => { noise(0.05, 0.22, 5200); tone(420, 0.04, 'square', 0.06, 200); });
  VR.Audio.define('empty', ({ tone }) => { tone(1300, 0.03, 'square', 0.05); });

  VR.WeaponKit = { boxesAt, wallDist, traceParts, stepNade, impulse, LAND_DELAY, WEAPONS, NADE, model };
})();
