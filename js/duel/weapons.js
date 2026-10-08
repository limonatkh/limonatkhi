/* =====================================================================
 * DUEL WEAPONS — models and effects for the 1v1 arena.
 *   sniper()      the lemon-neon sniper rifle (points down -Z)
 *   grenade()     the impulse grenade (no damage: it only pushes)
 *   DuelFx        tracers, muzzle flashes, impact puffs, push waves
 * Models are flat-coloured voxels like the characters, with a few
 * unlit "neon" strips so they read well in any light.
 * ===================================================================== */
(function () {
  const T = THREE;
  const NEON = 0xb26bff, LEMON = 0xffe14a;

  function neonMat(color) { const m = new T.MeshBasicMaterial({ color }); m.toneMapped = false; m.userData.own = true; return m; }

  function sniper(accent = NEON) {
    const g = new T.Group();
    const vb = new VR.VoxelBuilder();
    const body = 0x2a2f3d, dark = 0x171a22, metal = 0x6b7286;
    vb.addColorBox(0, -0.05, 0.02, 0.07, 0.09, 0.42, body);          // receiver
    vb.addColorBox(0, -0.035, -0.42, 0.035, 0.035, 0.46, dark);      // barrel
    vb.addColorBox(0, -0.045, -0.68, 0.055, 0.055, 0.08, metal);     // muzzle brake
    vb.addColorBox(0, 0.04, -0.02, 0.05, 0.05, 0.24, dark);          // scope tube
    vb.addColorBox(0, 0.03, 0.11, 0.065, 0.07, 0.05, metal);         // scope eyepiece
    vb.addColorBox(0, 0.03, -0.15, 0.07, 0.075, 0.05, metal);        // scope front
    vb.addColorBox(0, -0.04, 0.3, 0.06, 0.1, 0.2, body);             // stock
    vb.addColorBox(0, -0.15, 0.08, 0.05, 0.12, 0.06, dark);          // grip
    vb.addColorBox(0, -0.13, -0.06, 0.04, 0.08, 0.05, metal);        // magazine
    g.add(vb.build());
    // neon strips
    const strip = (w, h, d, x, y, z, c) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), neonMat(c)); m.position.set(x, y, z); g.add(m); return m; };
    strip(0.006, 0.014, 0.36, 0.037, -0.006, 0.02, accent);
    strip(0.006, 0.014, 0.36, -0.037, -0.006, 0.02, accent);
    strip(0.018, 0.006, 0.3, 0, 0.003, -0.4, accent);
    strip(0.052, 0.01, 0.01, 0, 0.075, -0.15, LEMON);
    const lens = strip(0.04, 0.04, 0.005, 0, 0.065, -0.178, 0x9fe8ff);
    g.userData.muzzle = new T.Vector3(0, -0.02, -0.74);
    g.userData.lens = lens;
    return g;
  }

  function grenade() {
    const g = new T.Group();
    const vb = new VR.VoxelBuilder();
    vb.addColorBox(0, -0.06, 0, 0.12, 0.12, 0.12, 0x3b2a63);
    vb.addColorBox(0, 0.06, 0, 0.05, 0.04, 0.05, 0x6b7286);
    vb.addColorBox(0.035, 0.07, 0, 0.02, 0.02, 0.07, 0x6b7286);
    g.add(vb.build());
    const core = new T.Mesh(new T.BoxGeometry(0.128, 0.03, 0.128), neonMat(LEMON)); core.position.y = 0; g.add(core);
    const core2 = new T.Mesh(new T.BoxGeometry(0.03, 0.128, 0.128), neonMat(NEON)); core2.position.y = 0; g.add(core2);
    return g;
  }

  /* ------------------------------------------------------------------ */
  class DuelFx {
    constructor(scene) {
      this.scene = scene; this.items = [];
      this.tracerGeo = new T.BoxGeometry(1, 1, 1);
    }
    add(obj, life, update) { this.scene.add(obj); this.items.push({ obj, life, max: life, update }); }
    tracer(from, to, color = NEON, width = 0.035) {
      const len = from.distanceTo(to);
      if (len < 0.1) return;
      const m = new T.Mesh(this.tracerGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
      m.material.toneMapped = false; m.material.userData.own = true;
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.lookAt(to); m.scale.set(width, width, len);
      const core = new T.Mesh(this.tracerGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      core.material.userData.own = true; core.scale.set(0.4, 0.4, 1); m.add(core);
      this.add(m, 0.22, (it, k) => { m.material.opacity = 0.95 * k; core.material.opacity = 0.9 * k; m.scale.x = m.scale.y = width * (0.4 + k * 0.6); });
    }
    flash(pos, color = 0xfff1a8) {
      const l = new T.PointLight(color, 30, 7, 2); l.position.copy(pos);
      this.add(l, 0.07, (it, k) => { l.intensity = 30 * k; });
      const s = new T.Sprite(new T.SpriteMaterial({ color, transparent: true, depthWrite: false })); s.material.userData.own = true;
      s.position.copy(pos); s.scale.setScalar(0.5);
      this.add(s, 0.06, (it, k) => { s.material.opacity = k; s.scale.setScalar(0.25 + 0.4 * k); });
    }
    puff(pos, color = 0xd8ccb0, n = 7) {
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(this.tracerGeo, new T.MeshBasicMaterial({ color, transparent: true, depthWrite: false })); m.material.userData.own = true;
        const v = new T.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
        m.position.copy(pos); const s = 0.06 + Math.random() * 0.08; m.scale.setScalar(s);
        this.add(m, 0.45, (it, k, dt) => { m.position.addScaledVector(v, dt); v.y -= 6 * dt; m.material.opacity = k; });
      }
    }
    wave(pos) {
      // impulse grenade: an expanding ring + a bright core
      const ring = new T.Mesh(new T.TorusGeometry(1, 0.08, 6, 28), new T.MeshBasicMaterial({ color: NEON, transparent: true, depthWrite: false }));
      ring.material.toneMapped = false; ring.material.userData.own = true; ring.geometry.userData.own = true;
      ring.position.copy(pos); ring.rotation.x = Math.PI / 2;
      this.add(ring, 0.5, (it, k) => { const s = 0.3 + (1 - k) * 3.8; ring.scale.setScalar(s); ring.material.opacity = k; });
      const ball = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshBasicMaterial({ color: LEMON, transparent: true, depthWrite: false }));
      ball.material.toneMapped = false; ball.material.userData.own = true;
      ball.position.copy(pos);
      this.add(ball, 0.35, (it, k) => { ball.scale.setScalar(0.3 + (1 - k) * 2.2); ball.material.opacity = 0.75 * k; });
      const l = new T.PointLight(NEON, 40, 10, 2); l.position.copy(pos);
      this.add(l, 0.3, (it, k) => { l.intensity = 40 * k; });
      this.puff(pos, 0xe6dcc2, 10);
    }
    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.life -= dt;
        const k = Math.max(0, it.life / it.max);
        if (it.update) it.update(it, k, dt);
        if (it.life <= 0) { this.scene.remove(it.obj); this.dispose(it.obj); this.items.splice(i, 1); }
      }
    }
    dispose(o) { o.traverse && o.traverse(n => { if (n.material && n.material.userData.own) n.material.dispose(); if (n.geometry && n.geometry !== this.tracerGeo && n.geometry.userData.own) n.geometry.dispose(); }); }
    clear() { for (const it of this.items) { this.scene.remove(it.obj); this.dispose(it.obj); } this.items.length = 0; }
  }

  VR.DuelWeapons = { sniper, grenade, NEON, LEMON };
  VR.DuelFx = DuelFx;
})();
