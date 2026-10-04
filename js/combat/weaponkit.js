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
    const head = new T.Box3(new T.Vector3(p.x - 0.24, p.y + h - 0.46, p.z - 0.24), new T.Vector3(p.x + 0.24, p.y + h + 0.02, p.z + 0.24));
    const body = new T.Box3(new T.Vector3(p.x - 0.34, p.y, p.z - 0.34), new T.Vector3(p.x + 0.34, p.y + h - 0.46, p.z + 0.34));
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
  function stepNade(n, dt, solids, gravity = 22) {
    const steps = 3, sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      n.vel.y -= gravity * sdt;
      const prev = n.pos.clone();
      n.pos.addScaledVector(n.vel, sdt);
      if (solids.some(b => !off(b) && (b.box || b).containsPoint(n.pos))) return prev;
    }
    return null;
  }
  /** push a first-person controller away from a blast at p. Returns the strength (0 = out of range). */
  function impulse(c, p, R, PUSH, tmp = new T.Vector3()) {
    const center = tmp.copy(c.pos); center.y += 0.9;
    const dist = center.distanceTo(p);
    if (dist > R) return 0;
    const k = 1 - (dist / R) * 0.55;
    const dir = center.clone().sub(p);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const flat = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
    if (p.y < c.pos.y + 0.7 && flat < 1.8) { dir.y += 1.1; dir.normalize(); }     // blast under the feet
    c.vel.addScaledVector(dir, PUSH * k);
    c.vel.y = Math.min(c.vel.y, 18);
    const h = Math.hypot(c.vel.x, c.vel.z);
    if (h > 20) { c.vel.x *= 20 / h; c.vel.z *= 20 / h; }
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
  const NADE = { name: { en: 'Impulse grenade', ar: 'قنبلة الدفع' }, max: 2, recharge: 6, speed: 15, fuse: 1.3, R: 3.8, push: 17, dmg: 70 };

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
  function model(id) {
    if (id === 'pistol') return pistol();
    if (id === 'shotgun') return shotgun();
    if (id === 'smg') return smg();
    if (id === 'sniper') return VR.DuelWeapons.sniper();
    if (id === 'nade') return VR.DuelWeapons.grenade();
    return pistol();
  }

  // sounds for the new weapons (the sniper's comes from the duel)
  VR.Audio.define('pistol', ({ tone, noise }) => { noise(0.1, 0.35, 4200); tone(320, 0.09, 'square', 0.12, 120); });
  VR.Audio.define('shotgun', ({ tone, noise }) => { noise(0.28, 0.55, 2400); tone(110, 0.22, 'sawtooth', 0.2, 45); });
  VR.Audio.define('smg', ({ tone, noise }) => { noise(0.05, 0.22, 5200); tone(420, 0.04, 'square', 0.06, 200); });
  VR.Audio.define('empty', ({ tone }) => { tone(1300, 0.03, 'square', 0.05); });

  VR.WeaponKit = { boxesAt, wallDist, traceParts, stepNade, impulse, WEAPONS, NADE, model };
})();
