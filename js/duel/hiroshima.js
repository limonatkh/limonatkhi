/* =====================================================================
 * HIROSHIMA — a loot push grenade for the arena (1v1 against a friend,
 * and the loot arena against the computer).
 *
 * Two of them lie in the yard (glowing red beams, at the middle of each
 * long wall). E picks one up (one at a time); G then throws it instead of
 * an impulse grenade. Where it goes off, whoever is close (5 m, the
 * thrower too) is blown straight up out of the yard — a real jump (the
 * same physics as the push grenade, ~2.6 s up and over): you fly up THROUGH
 * the deck from below and come down on top of THE SKY DECK, a flat square
 * high above the yard (90 m). On the deck lies a sniper with only two
 * rounds (one at a time, back after 30 s; gone at the next round). Up there
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
  const SPOTS = [['a', -9.6, 0.6], ['b', 9.6, -0.6], ['deck', 0, 0]];      // two grenades in the yard, the sniper on the deck
  // (an arena can name its own two yard spots, under open sky: L.extras.hiroSpots = [[x, z], [x, z]])
  const spotsOf = (L) => { const h = L && L.extras && L.extras.hiroSpots; return h ? [['a', h[0][0], h[0][1]], ['b', h[1][0], h[1][1]], ['deck', 0, 0]] : SPOTS; };
  const yOf = (id) => (id === 'deck' ? DECK.y : 0);
  // the deck's sniper: two rounds, no reload (a loot weapon: js/duel/powers.js draws it from the sniper, recoloured)
  if (VR.Powers && VR.FightKit) {
    const sn = VR.FightKit.WEAPONS.sniper;
    VR.Powers.LOOT_WEAPONS.skysniper = Object.assign({}, sn, { mag: 2, noReload: true, loot: true, base: 'sniper', color: 0xff3a2a });
    VR.FightKit.WEAPONS.skysniper = VR.Powers.LOOT_WEAPONS.skysniper;
    VR.FightKit.NAMES.skysniper = { en: 'Sky sniper (2 rounds)', ar: 'قناصة المنصّة (طلقتان)' };
  }
  const tr = (k, v) => VR.t(k, v);
  Object.assign(VR.I18N.STRINGS.en, { 'hi.name': 'Hiroshima grenade', 'hi.got': 'Hiroshima grenade! G throws it', 'hi.pick': '{k}: pick up the Hiroshima grenade',
    'hi.badge': 'HIROSHIMA · {k}', 'hi.up': 'Blown up to the sky deck!', 'hi.full': 'You already carry one', 'hi.pickGun': '{k}: take the sniper (2 rounds)', 'hi.gotGun': 'Sniper — two rounds only. Make them count!' });
  Object.assign(VR.I18N.STRINGS.ar, { 'hi.name': 'قنبلة هيروشيما', 'hi.got': 'قنبلة هيروشيما! G ترميها', 'hi.pick': '{k}: التقط قنبلة هيروشيما',
    'hi.badge': 'هيروشيما · {k}', 'hi.up': 'طرت إلى المنصّة فوق!', 'hi.full': 'معك واحدة أصلًا', 'hi.pickGun': '{k}: خذ القناصة (طلقتان)', 'hi.gotGun': 'قناصة — طلقتان فقط. استغلّهم صح!' });
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
    const slab = L.collider(DECK.x - h, y - DECK.thick, DECK.z - h, DECK.x + h, y, DECK.z + h); slab.noShot = true;
    L.extras.deckSlab = slab;                                  // (flying up from the yard you pass through it: Hiroshima.stepFlight)
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
      const g = new T.Group(); g.position.set(x, yOf(id), z);
      const gr = id === 'deck' ? VR.WeaponKit.model('skysniper') : VR.DuelWeapons.grenade(); gr.scale.setScalar(id === 'deck' ? 1.6 : 3.2);
      if (id !== 'deck') gr.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.userData.own = true; if (o.material.color) o.material.color.lerp(new T.Color(0xff3a2a), 0.65); if (o.material.emissive) o.material.emissive.setHex(0x5a0a00); } });
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
      this.endFlight(); this.charges = 0; this.wait = {};
      // the deck's sniper is for one round only
      const lo = this.mgr.lo;
      if (lo && lo.slots) { const i = lo.slots.findIndex(q => q.id === 'skysniper'); if (i >= 0) { lo.slots.splice(i, 1); if (lo.cur > i || lo.cur >= lo.slots.length) lo.cur = Math.max(0, lo.cur - 1); } }
      for (const id of [...this.items.keys()]) this.hide(id);
      if (!this.on) return this.paint();
      if (this.host) { for (const [id, x, z] of spotsOf(this.mgr.level)) this.show(id, x, z); this.broadcast(); }
      else this.mgr.send({ k: 'hq' });                    // (whatever order the round start and the list arrive in: ask for it)
      this.paint();
    }
    clear() { for (const id of [...this.items.keys()]) this.hide(id); this.charges = 0; this.flight = null; this.paint(); }
    nearest(r = 1.7) {
      const c = this.mgr.ctrl; let best = null, bd = r;
      for (const it of this.items.values()) { const d = Math.hypot(it.x - c.pos.x, it.z - c.pos.z), dy = c.pos.y - yOf(it.id); if (d < bd && dy > -0.5 && dy < 2.5) { bd = d; best = it; } }
      return best;
    }
    prompt() { const it = this.on && this.nearest(); return it ? tr(it.id === 'deck' ? 'hi.pickGun' : 'hi.pick', { k: keyOf('interact') }) : null; }
    /** E next to one: mine (the host), or asked for (the guest) */
    pick() {
      const mgr = this.mgr, m = mgr.match;
      if (!this.on || !m || m.phase !== 'fight' || m.dead[m.me]) return false;
      const it = this.nearest(); if (!it) return false;
      if (it.id !== 'deck' && this.charges > 0) { mgr.ui.feed(tr('hi.full'), ''); VR.Audio.play('buzz'); return true; }
      if (this.host) { this.take(it.id); this.got(it.id); }
      else { mgr.send({ k: 'hp', id: it.id }); }
      return true;
    }
    take(id) { if (!this.items.has(id)) return false; this.hide(id); this.wait[id] = RESPAWN; this.broadcast(); return true; }
    got(id) {
      if (id === 'deck') {                                   // the deck's sniper: in hand at once, two rounds
        const mgr = this.mgr;
        if (mgr.loot && mgr.lo) { mgr.loot.giveWeapon('skysniper'); const sl = mgr.lo.slots.find(q => q.id === 'skysniper'); if (sl) sl.mag = 2; }
        VR.Audio.play('unlock'); mgr.ui.feed(tr('hi.gotGun'), 'good');
        return;
      }
      this.charges = 1; VR.Audio.play('unlock'); this.mgr.ui.feed(tr('hi.got'), 'good'); this.paint();
    }
    onNet(d) {
      if (d.k === 'hl' && !this.host) this.sync(d.it || []);
      else if (d.k === 'hq' && this.host) this.broadcast();
      else if (d.k === 'hp' && this.host) { if (this.take(d.id)) this.mgr.send({ k: 'hg', id: d.id }); }
      else if (d.k === 'hg' && !this.host) this.got(d.id);
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
    /** blown up: a real jump out of the yard — straight up through the deck, down onto it (my own spot on it) */
    launch() {
      const c = this.mgr.ctrl, m = this.mgr.match, side = m && m.me === 'g' ? -1 : 1;
      const to = new T.Vector3(DECK.x + side * 2.5 + (Math.random() - 0.5) * 2, DECK.y, DECK.z + side * 5 + (Math.random() - 0.5) * 2);
      const g = c.gravity, apex = DECK.y + 4.5;                         // up past the deck's top, then down onto it
      c.vel.y = Math.sqrt(2 * g * Math.max(4, apex - c.pos.y));
      c.grounded = false; c.coyote = 0; c.climbing = null; c.slideTimer = 0;
      this.flight = { t: 0, to };
      this.steer();
      this.mgr.hostage && this.mgr.hostage.release && this.mgr.hostage.release('jump');
      this.mgr.dropScope && this.mgr.dropScope();
      VR.Audio.play('hiroFly'); this.mgr.ui.feed(tr('hi.up'), 'good');
    }
    /** aim the sideways speed so the arc comes down on my spot (wind or not) */
    steer() {
      const c = this.mgr.ctrl, f = this.flight, g = c.gravity;
      const vy = c.vel.y, top = c.pos.y + Math.max(0, vy) * Math.max(0, vy) / (2 * g);
      const tUp = Math.max(0, vy) / g, tDown = Math.sqrt(Math.max(0, 2 * (top - f.to.y)) / g), left = Math.max(0.15, tUp + tDown);
      c.vel.x = (f.to.x - c.pos.x) / left; c.vel.z = (f.to.z - c.pos.z) / left;
    }
    /**
     * Every frame of the flight, BEFORE the controller moves me (the controller does the flying: real
     * gravity, the camera follows): the deck lets me through while my feet are under its top, and holds
     * me once they are over it — then I land on it like on any floor and stay there.
     */
    stepFlight(dt) {
      const f = this.flight, c = this.mgr.ctrl; if (!f) return false;
      f.t += dt;
      const slab = this.mgr.level && this.mgr.level.extras.deckSlab;
      if (slab) slab.enabled = c.pos.y >= DECK.y - 0.02;
      if (c.pos.y < DECK.y + 0.5 || c.vel.y > 0) this.steer();
      if (f.t > 0.3 && c.vel.y <= 0 && c.pos.y < DECK.y - 3 && f.t < 1) { this.endFlight(); return true; }   // (a roof over me stopped the jump)
      if (f.t > 0.3 && c.grounded) { this.endFlight(); VR.Audio.play('thud'); }
      return true;
    }
    endFlight() {
      this.flight = null;
      const slab = this.mgr.level && this.mgr.level.extras && this.mgr.level.extras.deckSlab;
      if (slab) slab.enabled = true;
    }
    update(dt) {
      for (const it of this.items.values()) { it.t += dt; it.holder.rotation.y = it.t * 1.8; it.holder.position.y = 0.95 + Math.sin(it.t * 2.4) * 0.12; }
      const m = this.mgr.match;
      if (this.on && this.host && m && m.phase === 'fight') {
        for (const id in this.wait) { this.wait[id] -= dt; if (this.wait[id] <= 0) { delete this.wait[id]; const s = spotsOf(this.mgr.level).find(q => q[0] === id); if (s) { this.show(id, s[1], s[2]); this.broadcast(); } } }
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
