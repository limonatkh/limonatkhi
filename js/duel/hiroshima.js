/* =====================================================================
 * HIROSHIMA — a loot push grenade for the arena (1v1 against a friend,
 * and the loot arena against the computer).
 *
 * Two of them lie in the yard (glowing red beams, at the middle of each
 * long wall). E picks one up (one at a time); G then throws it instead of
 * an impulse grenade. Where it goes off, whoever is close (5 m, the
 * thrower too) is blown straight up out of the yard — a 2.4 s flight —
 * onto THE SKY DECK: a flat square high above the yard (90 m). Up there
 * you stay; with a sniper you can shoot the other player in the yard
 * below, and he can only get you by shooting up at you (you are hidden on
 * the deck unless you come to its edge to look down). Walk off the edge
 * and you fall back into the yard (no damage).
 *
 * Network (1v1): the inviter's game owns the pickups ('hl' the list, 'hp'
 * the guest asks to pick one up, 'hg' granted). The grenade itself is the
 * impulse grenade's message with h:1; each player launches himself when a
 * Hiroshima goes off near him (like the impulse push).
 * ===================================================================== */
(function () {
  const T = THREE;
  const DECK = { x: 0, y: 90, z: 0, half: 9, thick: 1.2 };      // the sky deck (top at y)
  const R = 5.0, FLIGHT = 2.4, RESPAWN = 30, EDGE = 1.5;
  const SPOTS = [['a', -9.6, 0.6], ['b', 9.6, -0.6]];
  const tr = (k, v) => VR.t(k, v);
  Object.assign(VR.I18N.STRINGS.en, { 'hi.name': 'Hiroshima grenade', 'hi.got': 'Hiroshima grenade! G throws it', 'hi.pick': '{k}: pick up the Hiroshima grenade',
    'hi.badge': 'HIROSHIMA · {k}', 'hi.up': 'Blown up to the sky deck!', 'hi.full': 'You already carry one' });
  Object.assign(VR.I18N.STRINGS.ar, { 'hi.name': 'قنبلة هيروشيما', 'hi.got': 'قنبلة هيروشيما! G ترميها', 'hi.pick': '{k}: التقط قنبلة هيروشيما',
    'hi.badge': 'هيروشيما · {k}', 'hi.up': 'طرت إلى المنصّة فوق!', 'hi.full': 'معك واحدة أصلًا' });
  VR.Audio.define('hiroBoom', ({ tone, noise }) => { noise(0.6, 0.6, 900); tone(70, 0.8, 'sawtooth', 0.25, 30); tone(140, 0.5, 'square', 0.1, 60); });
  VR.Audio.define('hiroFly', ({ noise, tone }) => { noise(1.2, 0.18, 2500); tone(200, 1.2, 'sine', 0.06, 900); });

  const keyOf = (a) => (VR.Input.keyFor ? VR.Input.keyFor(a) : a);

  /** the deck: a flat slab with lines and a lemon rim, plus its collider */
  function addDeck(L) {
    const vb = new VR.VoxelBuilder(), h = DECK.half, y = DECK.y;
    vb.addBox(DECK.x, y - DECK.thick, DECK.z, h * 2, DECK.thick, h * 2, VR.Mat.tinted('concrete', 0xe8e0d0));
    vb.addBox(DECK.x, y - DECK.thick - 2.2, DECK.z, (h - EDGE) * 2, 2.2, (h - EDGE) * 2, 'stone');                // a rock under it (never wider than the shot-stopping middle)
    vb.addBox(DECK.x, y - DECK.thick - 4.4, DECK.z, h * 0.7, 2.2, h * 0.7, 'stone');
    for (const s of [-1, 1]) { vb.addBox(DECK.x + s * (h - 0.15), y, DECK.z, 0.3, 0.02, h * 2, 'lemon'); vb.addBox(DECK.x, y, DECK.z + s * (h - 0.15), h * 2, 0.02, 0.3, 'lemon'); }
    vb.addBox(DECK.x, y, DECK.z, 0.3, 0.02, h * 1.6, VR.Mat.tinted('concrete', 0xc0b8a8)); vb.addBox(DECK.x, y, DECK.z, h * 1.6, 0.02, 0.3, VR.Mat.tinted('concrete', 0xc0b8a8));
    vb.addBox(DECK.x + 5, y, DECK.z - 4.5, 1.0, 1.1, 1.0, 'hay'); vb.addBox(DECK.x - 5, y, DECK.z + 4.5, 1.0, 1.1, 1.0, 'hay');  // two crates (low cover)
    L.group.add(vb.build());
    // you stand on all of it; shots only stop at its middle: the last 1.5 m to each edge lets them through,
    // so from the edge you can shoot down — and that is the only place where you can be shot from below
    L.collider(DECK.x - h, y - DECK.thick, DECK.z - h, DECK.x + h, y, DECK.z + h).noShot = true;
    const e = EDGE;
    (L.extras.shotOnly = L.extras.shotOnly || []).push({ min: [DECK.x - h + e, y - DECK.thick - 4.4, DECK.z - h + e], max: [DECK.x + h - e, y, DECK.z + h - e] });
    L.collider(DECK.x + 4.5, y, DECK.z - 5, DECK.x + 5.5, y + 1.1, DECK.z - 4); L.collider(DECK.x - 5.5, y, DECK.z + 4, DECK.x - 4.5, y + 1.1, DECK.z + 5);
  }

  class Hiroshima {
    constructor(mgr) { this.mgr = mgr; this.items = new Map(); this.charges = 0; this.flight = null; this.badge = null; this.wait = {}; }
    /** on in a 1v1 against a person, and in the loot arena */
    get on() { const m = this.mgr.match; return !!(m && !m.solo && (m.type === 'pvp' || (m.opts && m.opts.loot))); }
    get host() { const m = this.mgr.match; return !m || m.role === 'h'; }
    /** the arena is being built: the deck */
    build(L) { if (this.on) addDeck(L); }
    // ---- pickups
    show(id, x, z) {
      if (this.items.has(id)) return;
      const g = new T.Group(); g.position.set(x, 0, z);
      const gr = VR.DuelWeapons.grenade(); gr.scale.setScalar(3.2);
      gr.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.userData.own = true; if (o.material.color) o.material.color.lerp(new T.Color(0xff3a2a), 0.65); if (o.material.emissive) o.material.emissive.setHex(0x5a0a00); } });
      const holder = new T.Group(); holder.position.y = 0.95; holder.add(gr); g.add(holder);
      const ring = new T.Mesh(new T.RingGeometry(0.55, 0.78, 28), new T.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
      ring.material.userData.own = true; ring.geometry.userData.own = true; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      const beam = new T.Mesh(new T.BoxGeometry(0.2, 9, 0.2), new T.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }));
      beam.material.userData.own = true; beam.geometry.userData.own = true; beam.material.toneMapped = false; beam.position.y = 4.5; g.add(beam);
      this.mgr.scene.add(g);
      this.items.set(id, { id, x, z, obj: g, holder, t: Math.random() * 6 });
    }
    hide(id) { const it = this.items.get(id); if (!it) return; this.mgr.scene.remove(it.obj); this.items.delete(id); }
    list() { return [...this.items.values()].map(it => [it.id, it.x, it.z]); }
    sync(arr) { const want = new Map(arr.map(a => [a[0], a])); for (const id of [...this.items.keys()]) if (!want.has(id)) this.hide(id); for (const [id, x, z] of arr) this.show(id, x, z); }
    broadcast() { const m = this.mgr.match; if (m && m.type === 'pvp') this.mgr.send({ k: 'hl', it: this.list() }); }
    /** a new round: nothing in hand, both on the floor (the host decides) */
    resetRound() {
      this.flight = null; this.charges = 0; this.wait = {};
      for (const id of [...this.items.keys()]) this.hide(id);
      if (!this.on) return this.paint();
      if (this.host) { for (const [id, x, z] of SPOTS) this.show(id, x, z); this.broadcast(); }
      else this.mgr.send({ k: 'hq' });                    // (whatever order the round start and the list arrive in: ask for it)
      this.paint();
    }
    clear() { for (const id of [...this.items.keys()]) this.hide(id); this.charges = 0; this.flight = null; this.paint(); }
    nearest(r = 1.7) {
      const c = this.mgr.ctrl; let best = null, bd = r;
      for (const it of this.items.values()) { const d = Math.hypot(it.x - c.pos.x, it.z - c.pos.z); if (d < bd && c.pos.y < 2.5) { bd = d; best = it; } }
      return best;
    }
    prompt() { return this.on && this.nearest() ? tr('hi.pick', { k: keyOf('interact') }) : null; }
    /** E next to one: mine (the host), or asked for (the guest) */
    pick() {
      const mgr = this.mgr, m = mgr.match;
      if (!this.on || !m || m.phase !== 'fight' || m.dead[m.me]) return false;
      const it = this.nearest(); if (!it) return false;
      if (this.charges > 0) { mgr.ui.feed(tr('hi.full'), ''); VR.Audio.play('buzz'); return true; }
      if (this.host) { this.take(it.id); this.got(); }
      else { mgr.send({ k: 'hp', id: it.id }); }
      return true;
    }
    take(id) { if (!this.items.has(id)) return false; this.hide(id); this.wait[id] = RESPAWN; this.broadcast(); return true; }
    got() { this.charges = 1; VR.Audio.play('unlock'); this.mgr.ui.feed(tr('hi.got'), 'good'); this.paint(); }
    onNet(d) {
      if (d.k === 'hl' && !this.host) this.sync(d.it || []);
      else if (d.k === 'hq' && this.host) this.broadcast();
      else if (d.k === 'hp' && this.host) { if (this.take(d.id)) this.mgr.send({ k: 'hg', id: d.id }); }
      else if (d.k === 'hg' && !this.host) this.got();
    }
    // ---- the grenade
    /** G: throw it (instead of an impulse grenade). Returns true when it did. */
    throwIt() {
      const mgr = this.mgr, m = mgr.match;
      if (!this.on || this.charges < 1 || this.flight || !m || m.phase !== 'fight' || m.dead[m.me]) return false;
      this.charges = 0; this.paint();
      const o = mgr.eyePos(new T.Vector3()), d = mgr.aimDir(new T.Vector3());
      const p = o.addScaledVector(d, 0.5).addScaledVector(mgr.ctrl.right(), -0.12);
      const v = d.multiplyScalar(VR.DUEL.NADE_SPEED).add(new T.Vector3(0, 2.5, 0)).addScaledVector(mgr.ctrl.vel, 0.4);
      const id = VR.Net.randomCode(5);
      mgr.spawnNade(id, p.toArray(), v.toArray(), true, true);
      mgr.send({ k: 'nade', id, p: p.toArray().map(r2), v: v.toArray().map(r2), h: 1 });
      mgr.hands.pokeReach(); VR.Audio.play('throw');
      return true;
    }
    /** a Hiroshima went off at p (each player checks himself) */
    boom(p) {
      const mgr = this.mgr, m = mgr.match;
      VR.Audio.play('hiroBoom'); mgr.shake = Math.max(mgr.shake, 0.4);
      if (mgr.fx) { mgr.fx.wave(p); mgr.fx.wave(p.clone().setY(p.y + 1.5)); }
      if (!m || m.phase !== 'fight' || m.dead[m.me] || this.flight) return;
      const c = mgr.ctrl, d = Math.hypot(c.pos.x - p.x, c.pos.y + 0.9 - p.y, c.pos.z - p.z);
      if (d <= R) this.launch();
    }
    /** blown up: a flight out of the yard, up onto the deck (my own spot on it) */
    launch() {
      const c = this.mgr.ctrl, m = this.mgr.match, side = m && m.me === 'g' ? -1 : 1;
      const to = new T.Vector3(DECK.x + side * 2.5 + (Math.random() - 0.5) * 2, DECK.y + 0.05, DECK.z + side * 5 + (Math.random() - 0.5) * 2);
      this.flight = { t: 0, from: c.pos.clone(), to };
      this.mgr.hostage && this.mgr.hostage.release && this.mgr.hostage.release('jump');
      this.mgr.dropScope && this.mgr.dropScope();
      VR.Audio.play('hiroFly'); this.mgr.ui.feed(tr('hi.up'), 'good');
    }
    /** during the flight the controller is not used: the body follows the arc */
    stepFlight(dt) {
      const f = this.flight, c = this.mgr.ctrl; if (!f) return false;
      f.t += dt;
      const k = Math.min(1, f.t / FLIGHT), e = 1 - Math.pow(1 - k, 2.2);
      const x = f.from.x + (f.to.x - f.from.x) * k, z = f.from.z + (f.to.z - f.from.z) * k;
      const y = f.from.y + (f.to.y + 6 - f.from.y) * e - 6 * Math.max(0, (k - 0.75) / 0.25) ** 2;    // up past it, then down onto it
      c.pos.set(x, y, z); c.vel.set(0, 0, 0);
      if (k >= 1) { c.pos.copy(f.to); this.flight = null; c.update(1 / 60, this.mgr.level, { x: 0, y: 0 }, false); VR.Audio.play('thud'); }
      return true;
    }
    update(dt) {
      for (const it of this.items.values()) { it.t += dt; it.holder.rotation.y = it.t * 1.8; it.holder.position.y = 0.95 + Math.sin(it.t * 2.4) * 0.12; }
      const m = this.mgr.match;
      if (this.on && this.host && m && m.phase === 'fight') {
        for (const id in this.wait) { this.wait[id] -= dt; if (this.wait[id] <= 0) { delete this.wait[id]; const s = SPOTS.find(q => q[0] === id); if (s) { this.show(id, s[1], s[2]); this.broadcast(); } } }
      }
    }
    paint() {
      const ui = this.mgr.ui; if (!ui || !ui.root) return;
      if (!this.badge) { this.badge = document.createElement('div'); this.badge.className = 'du-hiro'; this.badge.hidden = true; ui.root.appendChild(this.badge); }
      const on = this.charges > 0;
      this.badge.hidden = !on;
      if (on) this.badge.textContent = '☢ ' + tr('hi.badge', { k: keyOf('grenade') || 'G' });
    }
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  VR.Hiroshima = { Hiroshima, DECK, R, FLIGHT, SPOTS };
})();
