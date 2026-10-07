/* =====================================================================
 * ARENA BOTS — computer players for "me vs the computer" and
 * "me + a friend vs the computer" (js/duel/duel.js runs the match).
 * ---------------------------------------------------------------------
 * Bots are player-shaped (same characters, 100 health, the same arena
 * weapons from js/duel/fightkit.js). They are simulated by ONE game only:
 * your own game alone, or the host's game in a co-op match; the host
 * streams their state to the guest (net / applyNet) and decides every
 * hit, like the duel referee.
 *
 * Difficulty (DIFF) changes how fast they react, how well they aim, how
 * fast they turn and move, how often they fire, how often they aim for
 * the head, and whether they retreat or throw impulse grenades:
 *   normal · medium · hard · impossible
 * Their misses come from an aiming error (bigger when you move fast), so
 * moving and using cover always helps, even against "impossible".
 * ===================================================================== */
(function () {
  const T = THREE;
  const FK = () => VR.FightKit;
  const WK = () => VR.WeaponKit;

  const DIFF = {
    normal:     { react: 1.2,  err: 0.12,  turn: 2.6, fireMul: 2.4,  head: 0.04, speed: 0.75, strafe: 0.35, nades: 0,  retreat: false,
                  picks: [['pistol'], ['smg'], ['pistol', 'smg']], reward: 40 },
    medium:     { react: 0.8,  err: 0.07,  turn: 4,   fireMul: 1.7,  head: 0.12, speed: 0.9,  strafe: 0.55, nades: 0,  retreat: false,
                  picks: [['smg', 'pistol'], ['shotgun', 'pistol']], reward: 70 },
    hard:       { react: 0.45, err: 0.038, turn: 7,   fireMul: 1.2,  head: 0.25, speed: 1.0,  strafe: 0.75, nades: 11, retreat: true,
                  picks: [['smg', 'sniper'], ['shotgun', 'smg'], ['sniper', 'pistol']], reward: 110 },
    impossible: { react: 0.18, err: 0.014, turn: 16,  fireMul: 0.95, head: 0.55, speed: 1.15, strafe: 1.0,  nades: 7,  retreat: true,
                  picks: [['sniper', 'smg'], ['smg', 'shotgun']], reward: 180 },
  };
  const ORDER = ['normal', 'medium', 'hard', 'impossible'];
  const RANGE = { pistol: [7, 14], smg: [5, 11], shotgun: [2.5, 6], sniper: [13, 28] };
  const NAMES = [{ en: 'Limo', ar: 'ليمو' }, { en: 'Sour', ar: 'حامض' }, { en: 'Peel', ar: 'قشرة' }];
  const WALK = () => VR.CONFIG.FP.SPEED_UNITS * VR.CONFIG.FP.UNIT;

  Object.assign(VR.I18N.STRINGS.en, {
    'bot.diff.normal': 'Normal', 'bot.diff.medium': 'Medium', 'bot.diff.hard': 'Hard', 'bot.diff.impossible': 'Impossible',
    'bot.team': 'Computer', 'bot.you': 'You', 'bot.youTwo': 'You two',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'bot.diff.normal': 'عادي', 'bot.diff.medium': 'متوسط', 'bot.diff.hard': 'صعب', 'bot.diff.impossible': 'مستحيل',
    'bot.team': 'الكمبيوتر', 'bot.you': 'أنت', 'bot.youTwo': 'أنتما',
  });

  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // −1..1, centred
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  class DuelBots {
    constructor(mgr) { this.mgr = mgr; this.list = []; this.ray = new T.Ray(); this.diffKey = 'normal'; }
    get diff() { return DIFF[this.diffKey] || DIFF.normal; }
    get aliveCount() { return this.list.filter(b => b.alive).length; }
    clear() { for (const b of this.list) this.mgr.scene.remove(b.body.g); this.list = []; }

    /** make the bots (both host and guest: the guest only draws them) */
    setup(n, diffKey) {
      this.clear();
      this.diffKey = DIFF[diffKey] ? diffKey : 'normal';
      const col = VR.DuelArena.COLORS.g;
      for (let i = 0; i < n; i++) {
        const ch = VR.CHARACTERS[(i + 1) % VR.CHARACTERS.length].id;
        const name = VR.L(NAMES[i % NAMES.length]) + ' · ' + VR.t('bot.diff.' + this.diffKey);
        const body = VR.DuelBody.build(ch, 'grey', col, name);
        this.mgr.scene.add(body.g);
        const pick = this.diff.picks[(Math.random() * this.diff.picks.length) | 0];
        this.list.push({ i, name, body, pos: body.pos, vel: new T.Vector3(), yaw: Math.PI, pitch: 0, hp: 100, alive: true,
          lo: new (FK().Loadout)({ weapons: pick, nades: false }), net: null });
      }
      this.respawn();
    }
    /** start of a round: back to the spawn, full health */
    respawn() {
      const sp = this.mgr.level.extras.spawns.g;
      const xs = [0, -3.6, 3.6];
      for (const b of this.list) {
        b.pos.set(sp.pos[0] + xs[b.i % 3], 0.05, sp.pos[2] - (b.i > 2 ? 2 : 0));
        b.yaw = sp.yaw; b.pitch = 0; b.hp = 100; b.alive = true; b.vel.set(0, 0, 0);
        b.lo.refill(); b.seenT = 0; b.lastSeen = null; b.react = 0; b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = rnd(0.6, 1.4);
        b.detourT = 0; b.stuckT = 0; b.nadeT = rnd(3, 6); b.headPick = false; b.aimErr = new T.Vector2(); b.errT = 0; b.net = null;
        b.body.g.visible = true; b.body.deadT = 0; b.body.g.rotation.z = 0;
        b.body.yaw = b.yaw; b.body.pitch = 0;
        VR.DuelBody.animate(b.body, 0);
      }
    }
    /** hit boxes for shots (alive bots only) */
    targets() { return this.list.filter(b => b.alive).map(b => { const bx = WK().boxesAt(b.pos, false); return { parts: { head: bx.head, body: bx.body }, ref: b }; }); }

    /** host: damage a bot. Returns true if it died. */
    hurt(b, dmg) {
      if (!b.alive) return false;
      b.hp = Math.max(0, b.hp - dmg);
      b.react = Math.min(b.react, this.diff.react * 0.5);            // it notices you
      if (b.hp <= 0) { b.alive = false; return true; }
      return false;
    }

    // ------------------------------------------------------------ host: AI
    los(from, to) {
      const d = to.clone().sub(from), dist = d.length(); d.normalize();
      return this.mgr.wallDist(from, d, dist) >= dist - 0.05;
    }
    move(b, dx, dz) {
      const r = 0.36, y0 = b.pos.y + 0.4, y1 = b.pos.y + 1.75;
      const blocked = (x, z) => this.mgr.level.solids.some(s => s.max[1] > y0 && s.min[1] < y1 &&
        x + r > s.min[0] && x - r < s.max[0] && z + r > s.min[2] && z - r < s.max[2]);
      const x0 = b.pos.x, z0 = b.pos.z;
      if (!blocked(b.pos.x + dx, b.pos.z)) b.pos.x += dx;
      if (!blocked(b.pos.x, b.pos.z + dz)) b.pos.z += dz;
      return Math.hypot(b.pos.x - x0, b.pos.z - z0);
    }
    pickTarget(b, players) {
      let best = null, bd = Infinity, seen = null, sd = Infinity;
      const eye = new T.Vector3(b.pos.x, b.pos.y + 1.55, b.pos.z);
      for (const p of players) {
        if (!p.alive) continue;
        const d = b.pos.distanceTo(p.pos);
        if (d < bd) { bd = d; best = p; }
        if (d < sd && this.los(eye, new T.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z))) { sd = d; seen = p; }
      }
      return seen || best;
    }
    update(dt, players) {
      const D = this.diff, mgr = this.mgr;
      for (const b of this.list) {
        b.lo.update(dt, VR.DUEL.NADE_RECHARGE);
        if (!b.alive) continue;
        const tgt = this.pickTarget(b, players);
        if (!tgt) continue;
        const eye = new T.Vector3(b.pos.x, b.pos.y + 1.55, b.pos.z);
        const chest = new T.Vector3(tgt.pos.x, tgt.pos.y + (tgt.low ? 0.6 : 1.15), tgt.pos.z);
        const sees = this.los(eye, chest);
        const dist = Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z);
        if (sees) { b.seenT += dt; b.lastSeen = tgt.pos.clone(); b.unseenT = 0; } else { b.seenT = 0; b.unseenT = (b.unseenT || 0) + dt; }
        // weapon for the distance
        if (b.lo.slots.length > 1 && b.lo.ready()) {
          const want = b.lo.slots.findIndex(s => dist > 12 ? s.id === 'sniper' : s.id !== 'sniper');
          if (want >= 0 && want !== b.lo.cur) b.lo.switchTo(want);
        }
        // turn toward the target (limited turn speed); a new aim error every so often
        b.errT -= dt;
        if (b.errT <= 0) { b.errT = rnd(0.25, 0.5); b.headPick = Math.random() < D.head; b.aimErr.set(gauss(), gauss()); }
        const aimPt = b.headPick ? new T.Vector3(tgt.pos.x, tgt.pos.y + (tgt.low ? 0.75 : 1.5), tgt.pos.z) : chest;
        const to = aimPt.clone().sub(eye);
        const wantYaw = Math.atan2(-to.x, -to.z), wantPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
        const tr = D.turn * dt;
        const dy = wrap(wantYaw - b.yaw);
        b.yaw += Math.max(-tr, Math.min(tr, dy));
        b.pitch += Math.max(-tr, Math.min(tr, wantPitch - b.pitch));
        const aligned = Math.abs(wrap(wantYaw - b.yaw)) < 0.12;
        // fire
        if (sees && b.seenT >= D.react && aligned) {
          const w = b.lo.shoot();
          if (w) { b.lo.coolT *= D.fireMul; this.fire(b, eye, aimPt, tgt, w, players); }
        }
        // grenade at where you were last seen (hard / impossible)
        b.nadeT -= dt;
        if (D.nades && b.nadeT <= 0 && !sees && b.lastSeen && b.unseenT > 1.5 && b.pos.distanceTo(b.lastSeen) < 20) {
          b.nadeT = D.nades * rnd(0.8, 1.3);
          this.throwNade(b, b.lastSeen);
        }
        // movement: keep a good distance for the weapon, strafe, go around cover
        const range = RANGE[b.lo.id] || [6, 12];
        const dir = new T.Vector3(tgt.pos.x - b.pos.x, 0, tgt.pos.z - b.pos.z); dir.y = 0;
        if (!sees && b.lastSeen) dir.set(b.lastSeen.x - b.pos.x, 0, b.lastSeen.z - b.pos.z);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize();
        let fwd = 0;
        if (!sees || dist > range[1]) fwd = 1; else if (dist < range[0]) fwd = -0.8;
        if (D.retreat && b.hp < 35 && sees) fwd = -1;
        b.strafeT -= dt; if (b.strafeT <= 0) { b.strafeT = rnd(0.5, 1.4) / Math.max(0.4, D.strafe); b.strafe *= -1; }
        const side = sees ? D.strafe * b.strafe : 0;
        const sp = WALK() * D.speed * (b.lo.reloadT > 0 && D.retreat ? 0.9 : 1);
        let mx = (dir.x * fwd + dir.z * side), mz = (dir.z * fwd - dir.x * side);
        if (b.detourT > 0) { b.detourT -= dt; mx = dir.z * b.strafe + dir.x * 0.3; mz = -dir.x * b.strafe + dir.z * 0.3; }
        const l = Math.hypot(mx, mz);
        if (l > 0.01) {
          mx *= sp / l; mz *= sp / l;
          const want = sp * dt, got = this.move(b, mx * dt, mz * dt);
          b.stuckT = got < want * 0.3 ? (b.stuckT || 0) + dt : 0;
          if (b.stuckT > 0.35) { b.stuckT = 0; b.detourT = 1.0; b.strafe *= -1; }
          b.vel.set(mx, 0, mz);
        } else b.vel.set(0, 0, 0);
      }
    }
    /** a bot fires: the shot is traced against every player (only the host does this) */
    fire(b, eye, aimPt, tgt, w, players) {
      const D = this.diff, mgr = this.mgr;
      const base = aimPt.clone().sub(eye).normalize();
      // aiming error grows with the target's speed (moving makes you harder to hit)
      const tspd = tgt.vel ? Math.hypot(tgt.vel.x, tgt.vel.z) : 0;
      const err = D.err * (1 + tspd / 4);
      const right = new T.Vector3(base.z, 0, -base.x).normalize(), up = new T.Vector3().crossVectors(right, base).normalize();
      const targets = players.filter(p => p.alive).map(p => { const bx = WK().boxesAt(p.pos, p.low); return { parts: { head: bx.head, body: bx.body }, ref: p }; });
      const hits = new Map(); const ends = [];
      for (let k = 0; k < w.pellets; k++) {
        const d = base.clone().addScaledVector(right, b.aimErr.x * err + gauss() * w.spread).addScaledVector(up, b.aimErr.y * err * 0.7 + gauss() * w.spread).normalize();
        const r = WK().traceParts(this.ray, mgr.solidBoxes, eye, d, targets);
        if (k < 3) ends.push(r.end);
        if (r.ref) {
          const h = hits.get(r.ref) || { dmg: 0, head: false };
          h.dmg += FK().damage(b.lo.id, r.hit, r.dist); h.head = h.head || r.hit === 'head';
          hits.set(r.ref, h);
        }
      }
      mgr.botShotFx(b, ends, b.lo.id);
      for (const [p, h] of hits) mgr.botHitPlayer(p.id, h.dmg, h.head);
    }
    throwNade(b, at) {
      const from = new T.Vector3(b.pos.x, b.pos.y + 1.6, b.pos.z);
      const flat = new T.Vector3(at.x - from.x, 0, at.z - from.z); const d = flat.length(); flat.normalize();
      const t = Math.max(0.6, d / 12);                                  // flight time
      const v = flat.multiplyScalar(d / t); v.y = (at.y + 0.3 - from.y) / t + 0.5 * 22 * t;
      this.mgr.throwNadeFrom(from, v);
    }
    /** grenade blast near bots: they are pushed (no damage, like players) */
    impulse(p) {
      for (const b of this.list) {
        if (!b.alive) continue;
        const c = new T.Vector3(b.pos.x, b.pos.y + 0.9, b.pos.z), dist = c.distanceTo(p);
        if (dist > VR.DUEL.NADE_R) continue;
        const k = 1 - dist / VR.DUEL.NADE_R, dir = c.sub(p).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
        dir.normalize();
        this.move(b, dir.x * 2.2 * k, dir.z * 2.2 * k);
      }
    }

    // ------------------------------------------------------------ network (co-op)
    /** host → guest, ~10 times a second */
    net() {
      const r2 = (v) => Math.round(v * 100) / 100;
      return this.list.map(b => [b.i, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.yaw), r2(b.pitch), b.alive ? 1 : 0, b.lo.id, Math.round(b.hp)]);
    }
    applyNet(arr) {
      for (const a of arr || []) {
        const b = this.list[a[0]]; if (!b) continue;
        b.net = { p: [a[1], a[2], a[3]], yaw: a[4], pitch: a[5] };
        b.alive = !!a[6]; b.hp = a[8];
        if (b.lo.id !== a[7]) { const i = b.lo.slots.findIndex(s => s.id === a[7]); if (i >= 0) b.lo.cur = i; else b.lo.slots[b.lo.cur] = { id: a[7], mag: 1 }; }
      }
    }

    // ------------------------------------------------------------ both: draw
    render(dt) {
      for (const b of this.list) {
        const body = b.body;
        if (b.net) {                                  // guest: follow the host's reports smoothly
          const k = Math.min(1, dt * 12);
          b.pos.x += (b.net.p[0] - b.pos.x) * k; b.pos.y += (b.net.p[1] - b.pos.y) * k; b.pos.z += (b.net.p[2] - b.pos.z) * k;
          b.yaw += wrap(b.net.yaw - b.yaw) * k; b.pitch += (b.net.pitch - b.pitch) * k;
        }
        body.yaw = b.yaw; body.pitch = b.pitch; body.low = false;
        VR.DuelBody.setGun(body, b.lo.id);
        if (!b.alive) {
          body.deadT = (body.deadT || 0) + dt;
          body.g.rotation.z = Math.min(1.5, body.deadT * 5);
          if (body.deadT > 1.2) body.g.visible = false;
        }
        VR.DuelBody.animate(body, dt);
      }
    }
  }

  VR.DuelBots = DuelBots;
  VR.DuelBots.DIFF = DIFF;
  VR.DuelBots.ORDER = ORDER;
})();
