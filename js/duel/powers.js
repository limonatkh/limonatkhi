/* =====================================================================
 * POWERS — what the PLAYER can do beyond the guns (matches against the
 * computer only: the local game is the referee).
 *
 *   PlayerPowers   one ability slot on its own key (Settings → Controls,
 *                  default X):
 *                    · play as an AI fighter → its ability (cooldown /
 *                      charges like the fighter's own), every round
 *                    · the loot arena → a loot power with charges
 *                  kinds: dash, blink, shield, overshield, orb (energy /
 *                  freeze / storm), bomb (bomb / meteor), heal, regen,
 *                  frost, rage, decoy, strike
 *   Loot           the loot arena (ساحة التحدي): weapons and powers that
 *                  are NOT in the shop and are stronger than its weapons,
 *                  lying on the floor (glowing beam). E picks up.
 *   Hostage        F next to an enemy, at its side or behind it: you hold
 *                  it in front of you. You walk at the same speed but
 *                  cannot sprint; it is a front-only shield for 3 hits or
 *                  two killing shots, then it falls. A grenade jump (or F
 *                  again) lets it go.
 * ===================================================================== */
(function () {
  const T = THREE;
  const FK = () => VR.FightKit, FB = () => VR.Feedback;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const t2 = (en, ar) => ({ en, ar });

  // ------------------------------------------------------------------ loot weapons (never sold)
  const LOOT_WEAPONS = {
    railgun:  { ads: 0.6, body: 75, head: 200, rate: 0.9, auto: false, mag: 5, reload: 1.8, spread: 0.002, pellets: 1, range: 200, fall: 1, sound: 'sniper', kick: 0.9, loot: true, base: 'dmr', color: 0x4ae0ff },
    plasma:   { ads: 0.7, body: 24, head: 48, rate: 0.1, auto: true, mag: 40, reload: 1.5, spread: 0.009, pellets: 1, range: 80, fall: 0.8, sound: 'rifle', kick: 0.25, loot: true, base: 'rifle', color: 0xb26bff },
    minigun:  { ads: 0.85, body: 16, head: 28, rate: 0.045, auto: true, mag: 150, reload: 3.2, spread: 0.028, pellets: 1, range: 55, fall: 0.6, sound: 'lmg', kick: 0.2, loot: true, base: 'lmg', color: 0xff5a3a },
    goldfang: { ads: 0.78, body: 60, head: 150, rate: 0.38, auto: false, mag: 7, reload: 1.2, spread: 0.004, pellets: 1, range: 70, fall: 0.85, sound: 'revolver', kick: 0.8, loot: true, base: 'revolver', color: 0xffd23a },
    thunder:  { ads: 0.85, body: 18, head: 26, rate: 0.55, auto: false, mag: 8, reload: 1.7, spread: 0.045, pellets: 10, range: 24, fall: 0.45, sound: 'shotgun', kick: 1.1, loot: true, base: 'shotgun', color: 0x7fd8ff },
  };
  const LOOT_NAMES = {
    railgun: t2('Railgun', 'المدفع الكهرومغناطيسي'), plasma: t2('Plasma rifle', 'بندقية البلازما'), minigun: t2('Minigun', 'المدفع الدوّار'),
    goldfang: t2('Golden Fang', 'الناب الذهبي'), thunder: t2('Thunder shotgun', 'بندقية الرعد'),
  };
  Object.assign(FK().WEAPONS, LOOT_WEAPONS);
  Object.assign(FK().NAMES, LOOT_NAMES);
  // their models: the base weapon, recoloured and glowing
  const baseModel = VR.WeaponKit.model;
  VR.WeaponKit.model = function (id) {
    const L = LOOT_WEAPONS[id]; if (!L) return baseModel(id);
    const g = baseModel(L.base), col = new T.Color(L.color);
    g.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const m = o.material.clone(); m.userData.own = true;
      if (m.color) m.color.lerp(col, 0.6);
      if (m.emissive) m.emissive.copy(col).multiplyScalar(0.25);
      o.material = m;
    });
    g.userData.loot = id;
    return g;
  };

  // ------------------------------------------------------------------ the powers
  // fighter abilities (play as a fighter) are built from VR.Fighters.ABILITIES; loot powers are here
  const DEFS = {
    meteor:     { name: t2('Meteor', 'النيزك'), kind: 'bomb', radius: 5.5, damage: 95, delay: 0.9, range: 30, charges: 2, elem: 'blast', color: 0xff5a1a },
    overshield: { name: t2('Overshield', 'الدرع الخارق'), kind: 'overshield', absorb: 90, duration: 10, charges: 1, elem: 'energy', color: 0x7fd4ff },
    phase:      { name: t2('Phase jump', 'قفزة الطور'), kind: 'blink', range: 11, charges: 3, elem: 'magic', color: 0xd59bff },
    regen:      { name: t2('Regeneration', 'التجدد'), kind: 'regen', amount: 70, duration: 1, charges: 1, elem: 'nature', color: 0x5fdc5f },
    frost:      { name: t2('Frost nova', 'عاصفة الجليد'), kind: 'frost', radius: 7, damage: 22, slow: 3, charges: 2, elem: 'ice', color: 0x8fe6ff },
    overdrive:  { name: t2('Overdrive', 'الاندفاع الخارق'), kind: 'rage', duration: 8, speed: 1.5, dmg: 1.6, rate: 0.7, charges: 1, elem: 'fire', color: 0xff5a1a },
    stormorb:   { name: t2('Storm orb', 'كرة العاصفة'), kind: 'orb', damage: 45, speed: 34, range: 60, charges: 4, elem: 'electric', color: 0x7fd8ff },
  };
  const LOOT_POWERS = Object.keys(DEFS);
  /** a fighter's ability as a power I can use */
  function fromAbility(key) {
    const A = VR.Fighters.ABILITIES[key]; if (!A) return null;
    const base = { name: A.name, elem: A.elem, color: A.color || (FB() && FB().ELEMENTS[A.elem] ? FB().ELEMENTS[A.elem].col[0] : 0xffe14a), cooldown: A.cooldown, ability: key };
    switch (key) {
      case 'dash': return Object.assign(base, { kind: 'dash', range: A.range, duration: A.duration });
      case 'flash': return Object.assign(base, { kind: 'blink', range: A.range });
      case 'shield': return Object.assign(base, { kind: 'shield', duration: A.duration, taken: A.status.dmgTaken });
      case 'energy': return Object.assign(base, { kind: 'orb', damage: A.damage, speed: A.speed, range: A.range, charges: A.charges, recharge: A.recharge });
      case 'freeze': return Object.assign(base, { kind: 'orb', damage: A.damage, speed: A.speed, range: A.range, slow: A.duration });
      case 'bomb': return Object.assign(base, { kind: 'bomb', radius: A.radius, damage: A.damage, delay: A.duration, range: A.range });
      case 'heal': return Object.assign(base, { kind: 'heal', amount: -A.damage, duration: A.duration });
      case 'rage': return Object.assign(base, { kind: 'rage', duration: A.duration, speed: A.status.speed, dmg: A.status.dmg, rate: A.status.rate, once: true });
      case 'decoy': return Object.assign(base, { kind: 'decoy', duration: A.duration });
      case 'strike': return Object.assign(base, { kind: 'strike', range: A.range, damage: A.damage, duration: A.duration });
      case 'shrink': return Object.assign(base, { kind: 'shrink', passive: true, factor: A.status.factor, speedUp: A.status.speedUp, minScale: A.status.minScale, maxSpeed: 4, dmg: VR.Fighters.FIGHTERS.shrinker.dmgMul });
    }
    return null;
  }

  // ------------------------------------------------------------------ strings
  Object.assign(VR.I18N.STRINGS.en, {
    'lt.arena': 'Loot arena', 'lt.mode': 'Loot arena', 'lt.modeSub': 'No shop: stronger weapons and powers lie on the floor',
    'lt.pick': '{k}: pick up {name}', 'lt.got': 'Picked up: {name}', 'lt.power': 'power', 'lt.grab': '{k}: take a hostage',
    'lt.held': 'Hostage', 'lt.lost': 'The hostage fell', 'lt.free': 'The hostage got away', 'kb.ability': 'Ability / power', 'kb.grab': 'Take a hostage / let go',
    'du.t.ability': 'POWER', 'du.t.grab': 'GRAB', 'du.t.pick': 'PICK UP', 'lt.legend': 'Legendary', 'lt.epic': 'Epic',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'lt.arena': 'ساحة التحدي', 'lt.mode': 'ساحة التحدي (لوت)', 'lt.modeSub': 'بلا متجر: أسلحة وقدرات أقوى ملقاة على الأرض',
    'lt.pick': '{k}: التقط {name}', 'lt.got': 'التقطت: {name}', 'lt.power': 'قدرة', 'lt.grab': '{k}: امسكه رهينة',
    'lt.held': 'رهينة', 'lt.lost': 'سقطت الرهينة', 'lt.free': 'أفلتت الرهينة', 'kb.ability': 'القدرة', 'kb.grab': 'رهينة / إفلات',
    'du.t.ability': 'قدرة', 'du.t.grab': 'رهينة', 'du.t.pick': 'التقاط', 'lt.legend': 'أسطوري', 'lt.epic': 'ملحمي',
  });
  const keyOf = (a) => { const b = VR.Input.binds ? VR.Input.binds()[a] : null; return b && b[0] ? VR.Input.label(b[0]) : '?'; };

  // ================================================================== the player's ability slot
  class PlayerPowers {
    constructor(mgr) { this.mgr = mgr; this.slot = null; this.clearRound(); }
    get fighterId() { const m = this.mgr.match; return m && m.opts && m.opts.playAs; }
    /** a new match: play as a fighter → its ability */
    setup() {
      this.slot = null;
      const fid = this.fighterId;
      if (fid) { const F = VR.Fighters.FIGHTERS[fid]; this.give(fromAbility(F.ability), false); }
    }
    give(def, loot, id) {
      if (!def) return;
      this.slot = { def, id: id || def.ability, loot, charges: def.charges || null, max: def.charges || null, cd: 0, rechargeT: 0, used: false };
      this.paint();
    }
    clearRound() {
      this.shrinkK = 1; this.shrinkSpd = 1; if (this.mgr.ctrl) this.mgr.ctrl.scaleK = 1;
      this.shieldT = 0; this.over = 0; this.overT = 0; this.healT = 0; this.rageT = 0; this.burst = null;
      for (const p of this.projectiles || []) this.mgr.scene.remove(p.mesh);
      for (const z of this.zones || []) this.mgr.scene.remove(z.mesh);
      if (this.decoy) this.mgr.scene.remove(this.decoy.body.g);
      this.projectiles = []; this.zones = []; this.decoy = null;
    }
    /** start of a round: fighter ability ready again; loot powers are gone (the floor has new ones) */
    resetRound() {
      this.clearRound();
      const m = this.mgr.match;
      if (m && m.opts && m.opts.loot) this.slot = null;
      else if (this.slot) { this.slot.cd = 0; this.slot.charges = this.slot.max; this.slot.used = false; }
      this.paint();
    }
    can() {
      const m = this.mgr.match;
      return m && m.type === 'bots' && (m.phase === 'fight') && !m.dead[m.me];
    }
    use() {
      const s = this.slot;
      if (!s || !this.can()) return false;
      if (s.def.passive || s.cd > 0 || (s.charges != null && s.charges <= 0) || (s.def.once && s.used)) { VR.Audio.play('buzz'); return false; }
      if (!this.act(s.def, s.id)) { VR.Audio.play('buzz'); return false; }
      if (s.loot) { s.charges--; if (s.charges <= 0) this.slot = null; }
      else { s.cd = s.def.cooldown || 0; if (s.max) s.charges--; s.used = true; }
      this.mgr.hands.pokeAbility();
      this.paint();
      return true;
    }
    // ---- what each kind does
    act(def, id) {
      const mgr = this.mgr, c = mgr.ctrl, fb = mgr.fb, m = mgr.match;
      const eye = mgr.eyePos(new T.Vector3()), aim = mgr.aimDir(new T.Vector3());
      const flat = new T.Vector3(aim.x, 0, aim.z); if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1); flat.normalize();
      const vfx = (stage, o) => fb && fb.ability(stage, Object.assign({ elem: def.elem, color: def.color }, o));
      switch (def.kind) {
        case 'dash': {
          const mv = VR.Input.moveVector(), dir = mv.x || mv.y ? c.right().multiplyScalar(mv.x).add(c.forward().multiplyScalar(mv.y)).normalize() : flat;
          this.burst = { dir, t: def.duration, speed: def.range / def.duration, kind: 'dash' };
          c.burstFov = Math.max(c.burstFov, 6); vfx('launch', { pos: c.pos.clone().setY(c.pos.y + 0.9), dir }); VR.Audio.play('slide');
          return true;
        }
        case 'strike':
          this.burst = { dir: flat, t: def.duration, speed: Math.max(14, def.range / def.duration), kind: 'strike', damage: def.damage, id, hit: false };
          c.burstFov = Math.max(c.burstFov, 6); vfx('launch', { pos: c.pos.clone().setY(c.pos.y + 0.9), dir: flat }); VR.Audio.play('knife');
          return true;
        case 'blink': {
          const from = c.pos.clone().setY(c.pos.y + 1);
          let d = Math.min(def.range, mgr.wallDist(from, flat, def.range) - 0.6);
          const B = mgr.level.extras.bounds;
          while (d > 1 && (Math.abs(c.pos.x + flat.x * d) > B.W - 0.6 || Math.abs(c.pos.z + flat.z * d) > B.LEN - 0.6)) d -= 0.5;
          if (d < 1) return false;
          vfx('end', { pos: from.clone() });
          c.pos.addScaledVector(flat, d); c.vel.set(0, c.vel.y, 0);
          vfx('impact', { pos: c.pos.clone().setY(c.pos.y + 1) }); VR.Audio.play('portal');
          return true;
        }
        case 'shield': this.shieldT = def.duration; this.shieldK = def.taken; vfx('charge', { pos: c.pos.clone().setY(c.pos.y + 1) }); VR.Audio.play('powerup'); if (fb) fb.screen.tint(0x7fd4ff, 0.4); return true;
        case 'overshield': this.over = def.absorb; this.overT = def.duration; vfx('charge', { pos: c.pos.clone().setY(c.pos.y + 1) }); VR.Audio.play('powerup'); if (fb) fb.screen.tint(0x7fd4ff, 0.4); return true;
        case 'heal': case 'regen':
          if (m.hp[m.me] >= 100) return false;
          this.healT = def.duration; this.healRate = def.amount / def.duration; this.healRoot = def.kind === 'heal';
          vfx('area', { pos: c.pos.clone(), radius: 1.2 }); VR.Audio.play('gem'); return true;
        case 'rage': this.rageT = def.duration; this.rage = def; vfx('charge', { pos: c.pos.clone().setY(c.pos.y + 1) }); VR.Audio.play('crash'); if (fb) fb.screen.tint(0xff3a1a, 0.5); return true;
        case 'orb': {
          const p = eye.clone().addScaledVector(aim, 0.7).add(new T.Vector3(0, -0.12, 0));
          const mesh = new T.Mesh(new T.SphereGeometry(id === 'freeze' ? 0.2 : 0.17, 10, 8), new T.MeshBasicMaterial({ color: def.color }));
          mesh.material.userData.own = true; mesh.geometry.userData.own = true; mesh.material.toneMapped = false; mesh.position.copy(p); mgr.scene.add(mesh);
          this.projectiles.push({ def, id, pos: p, vel: aim.clone().multiplyScalar(def.speed), life: def.range / def.speed, mesh });
          vfx('launch', { pos: p.clone(), dir: aim.clone() }); VR.Audio.play('sniperFar');
          return true;
        }
        case 'bomb': {
          const dist = mgr.wallDist(eye, aim, def.range), at = eye.clone().addScaledVector(aim, Math.max(2, dist - 0.2)); at.y = 0;
          const R = def.radius;
          const mesh = new T.Mesh(new T.RingGeometry(R - 0.14, R, 36), new T.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
          mesh.material.userData.own = true; mesh.geometry.userData.own = true; mesh.rotation.x = -Math.PI / 2; mesh.position.set(at.x, 0.07, at.z); mgr.scene.add(mesh);
          this.zones.push({ def, id, at, t: def.delay, mesh });
          vfx('area', { pos: at.clone(), radius: R }); VR.Audio.play('throw');
          return true;
        }
        case 'frost': {
          let n = 0;
          for (const b of mgr.bots.list) {
            if (!b.alive || b.held) continue;
            const d = Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z); if (d > def.radius) continue;
            if (!mgr.bots.los(new T.Vector3(c.pos.x, 1, c.pos.z), new T.Vector3(b.pos.x, 1, b.pos.z))) continue;
            b.slowT = Math.max(b.slowT || 0, def.slow); mgr.hostBotHit(b, def.damage, false, m.me, id); n++;
          }
          vfx('impact', { pos: c.pos.clone().setY(c.pos.y + 0.6), radius: def.radius, big: true });
          return true;
        }
        case 'decoy': {
          const body = VR.DuelBody.build(mgr.myChar(), 'white', VR.DuelArena.COLORS.h, null);
          mgr.scene.add(body.g); body.pos.copy(c.pos); body.yaw = c.yaw; VR.DuelBody.setGun(body, mgr.lo.id);
          this.decoy = { body, pos: body.pos, dir: flat.clone(), t: def.duration, alive: true, vel: new T.Vector3() };
          vfx('impact', { pos: c.pos.clone().setY(c.pos.y + 1) }); VR.Audio.play('portal');
          return true;
        }
      }
      return false;
    }
    /** damage coming at me (host): shield / overshield take part of it; a hit stops a standing heal */
    absorb(dmg) {
      if (this.healT > 0 && this.healRoot) this.healT = 0;
      if (this.shieldT > 0) dmg *= this.shieldK;
      if (this.over > 0) { const a = Math.min(this.over, dmg); this.over -= a; dmg -= a; if (this.over <= 0) { this.overT = 0; VR.Audio.play('shieldBreak'); } }
      return dmg;
    }
    /** playing as the SHRINKER: every hit I take makes me 30 % smaller and twice as fast (my shots stay weak) */
    onHurt() {
      const s = this.slot; if (!s || s.def.kind !== 'shrink') return;
      const k0 = this.shrinkK;
      this.shrinkK = Math.max(s.def.minScale, k0 * s.def.factor);
      this.shrinkSpd = Math.min(s.def.maxSpeed, this.shrinkSpd * s.def.speedUp);
      this.mgr.ctrl.scaleK = this.shrinkK;
      if (this.shrinkK !== k0 && this.mgr.fb) this.mgr.fb.ability('impact', { pos: this.mgr.ctrl.pos.clone().setY(0.5), elem: 'poison', color: s.def.color });
      this.paint();
    }
    shrinking() { return this.slot && this.slot.def.kind === 'shrink'; }
    speedMul() { return (this.rageT > 0 ? this.rage.speed : 1) * (this.healT > 0 && this.healRoot ? 0.35 : 1) * (this.shrinkSpd || 1); }
    dmgMul() { return (this.rageT > 0 ? this.rage.dmg : 1) * (this.shrinking() ? this.slot.def.dmg : 1); }
    rateMul() { return this.rageT > 0 ? this.rage.rate : 1; }
    /** bots can be fooled by my decoy: it is one more "player" for them */
    decoyPlayer() { const d = this.decoy; return d && d.alive ? { id: 'decoy', pos: d.pos, low: false, vel: d.vel, alive: true } : null; }
    popDecoy() { if (this.decoy && this.decoy.alive) { this.decoy.alive = false; this.decoy.t = Math.min(this.decoy.t, 0.01); } }

    update(dt) {
      const mgr = this.mgr, c = mgr.ctrl, m = mgr.match, s = this.slot, fb = mgr.fb;
      if (s) {
        if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
        if (!s.loot && s.max && s.charges < s.max) { s.rechargeT += dt; if (s.rechargeT >= s.def.recharge) { s.rechargeT = 0; s.charges++; } }
      }
      this.shieldT = Math.max(0, this.shieldT - dt);
      if (this.overT > 0) { this.overT -= dt; if (this.overT <= 0) this.over = 0; }
      this.rageT = Math.max(0, this.rageT - dt);
      if (this.healT > 0 && m && !m.dead[m.me]) {
        const k = Math.min(this.healT, dt); this.healT -= dt;
        m.hp[m.me] = Math.min(100, m.hp[m.me] + this.healRate * k); mgr.ui.setHP(m.hp[m.me]);
        if (fb && Math.random() < 0.4) fb.ability('trail', { pos: c.pos.clone().add(new T.Vector3(rnd(-0.5, 0.5), rnd(0.3, 1.5), rnd(-0.5, 0.5))), elem: 'nature' });
      }
      // dash / strike: a rush that walls stop
      const bu = this.burst;
      if (bu) {
        const step = bu.speed * Math.min(dt, bu.t), from = c.pos.clone().setY(c.pos.y + 0.9);
        if (mgr.wallDist(from, bu.dir, step + 0.5) > step + 0.45) c.pos.addScaledVector(bu.dir, step); else bu.t = 0;
        if (fb) fb.dashTrail(c.pos.clone().addScaledVector(bu.dir, -1.2), mgr.myProf());
        if (bu.kind === 'strike' && !bu.hit) {
          for (const b of mgr.bots.list) {
            if (!b.alive || b.held || Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z) > 2.3) continue;
            bu.hit = true; bu.t = Math.min(bu.t, 0.02); mgr.hostBotHit(b, bu.damage * this.dmgMul(), false, m.me, bu.id || 'strike'); VR.Audio.play('knife'); break;
          }
        }
        bu.t -= dt; if (bu.t <= 0) this.burst = null;
      }
      // orbs
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i], step = p.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
        const wd = mgr.wallDist(p.pos, dir, len);
        let done = false;
        for (const t of mgr.bots.targets()) {
          if (t.ref.held) continue;
          const box = t.parts.body.clone().union(t.parts.head).expandByScalar(0.16), hit = new T.Ray(p.pos, dir).intersectBox(box, new T.Vector3());
          if (hit && hit.distanceTo(p.pos) <= Math.min(len, wd)) {
            done = true;
            if (p.def.slow && t.ref.alive) t.ref.slowT = Math.max(t.ref.slowT || 0, p.def.slow);
            mgr.hostBotHit(t.ref, p.def.damage * this.dmgMul(), false, m.me, p.id);
            if (fb) fb.ability('impact', { pos: hit, elem: p.def.elem, color: p.def.color });
            break;
          }
        }
        if (!done && wd < len) { done = true; if (fb) fb.ability('impact', { pos: p.pos.clone().addScaledVector(dir, wd), elem: p.def.elem, color: p.def.color }); }
        p.pos.add(step); p.mesh.position.copy(p.pos); p.life -= dt;
        if (!done && fb && Math.random() < 0.7) fb.ability('trail', { pos: p.pos.clone(), elem: p.def.elem, color: p.def.color });
        if (done || p.life <= 0) { mgr.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
      }
      // bombs
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i]; z.t -= dt;
        z.mesh.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(z.t * 14));
        if (z.t > 0) continue;
        mgr.scene.remove(z.mesh); this.zones.splice(i, 1);
        if (fb) fb.ability('impact', { pos: z.at.clone().setY(0.5), elem: z.def.elem, color: z.def.color, radius: z.def.radius, big: true });
        VR.Audio.play('crash');
        for (const b of mgr.bots.list) {
          if (!b.alive || b.held) continue;
          const d = Math.hypot(b.pos.x - z.at.x, b.pos.z - z.at.z); if (d > z.def.radius) continue;
          if (!mgr.bots.los(new T.Vector3(z.at.x, 0.6, z.at.z), new T.Vector3(b.pos.x, 0.9, b.pos.z))) continue;
          mgr.hostBotHit(b, z.def.damage * (1 - 0.5 * d / z.def.radius) * this.dmgMul(), false, m.me, z.id);
        }
      }
      // decoy: walks off and draws fire
      const d = this.decoy;
      if (d) {
        d.t -= dt;
        if (d.alive && d.t > 0) {
          const sp = 4.2, fake = { pos: d.pos };
          if (mgr.bots.move(fake, d.dir.x * sp * dt, d.dir.z * sp * dt) < sp * dt * 0.3) d.dir.set(-d.dir.z, 0, d.dir.x);
          d.vel.set(d.dir.x * sp, 0, d.dir.z * sp);
          d.body.yaw = Math.atan2(-d.dir.x, -d.dir.z); VR.DuelBody.animate(d.body, dt);
        } else {
          if (fb) fb.ability('end', { pos: d.pos.clone().setY(1), elem: 'shadow' });
          mgr.scene.remove(d.body.g); this.decoy = null;
        }
      }
      this.paintT = (this.paintT || 0) - dt; if (this.paintT <= 0) { this.paintT = 0.2; this.paint(); }
    }
    status() {
      const s = this.slot; if (!s) return null;
      let st;
      if (s.def.passive) st = Math.round((this.shrinkK || 1) * 100) + '%';
      else if (s.loot) st = '×' + s.charges;
      else if (s.def.once && s.used) st = this.rageT > 0 ? '🔥' : '—';
      else if (s.max) st = `${s.charges}/${s.max}`;
      else st = s.cd > 0 ? Math.ceil(s.cd) + 's' : '✓';
      const on = this.shieldT > 0 || this.over > 0 || this.rageT > 0 || this.healT > 0;
      return { name: VR.L(s.def.name), st, color: s.def.color, ready: !(s.cd > 0) && !(s.max && !s.charges) && !(s.def.once && s.used), on, key: keyOf('ability') };
    }
    paint() { this.mgr.ui.setPower && this.mgr.ui.setPower(this.status()); }
  }

  // ================================================================== the loot arena
  const LOOT_TABLE = [
    ['railgun', 'weapon', 'legend'], ['plasma', 'weapon', 'epic'], ['minigun', 'weapon', 'legend'], ['goldfang', 'weapon', 'epic'], ['thunder', 'weapon', 'epic'],
    ['meteor', 'power', 'legend'], ['overshield', 'power', 'epic'], ['phase', 'power', 'epic'], ['regen', 'power', 'epic'], ['frost', 'power', 'legend'], ['overdrive', 'power', 'legend'], ['stormorb', 'power', 'epic'],
  ];
  const RARITY = { epic: 0xb26bff, legend: 0xffd23a };
  class Loot {
    constructor(mgr) { this.mgr = mgr; this.items = []; this.max = 6; this.respawnT = 0; }
    get on() { const m = this.mgr.match; return !!(m && m.opts && m.opts.loot); }
    clear() { for (const it of this.items) this.mgr.scene.remove(it.obj); this.items = []; }
    resetRound() { this.clear(); if (!this.on) return; for (let i = 0; i < this.max; i++) this.spawn(); this.respawnT = 10; }
    freeSpot() {
      const mgr = this.mgr, L = mgr.level, S = L.extras.spawnPts, c = mgr.ctrl;
      const pts = S.h.concat(S.g, [[0, 4], [0, -4], [-8.5, 0], [8.5, 0], [-3.5, 11], [3.5, -11], [6, 8], [-6, -8], [9, 17], [-9, -17]]);
      const free = (x, z) => !L.solids.some(s => s.max[1] > 0.3 && s.min[1] < 1.8 && x + 0.5 > s.min[0] && x - 0.5 < s.max[0] && z + 0.5 > s.min[2] && z - 0.5 < s.max[2]);
      for (let k = 0; k < 40; k++) {
        const [x0, z0] = pts[(Math.random() * pts.length) | 0], x = x0 + rnd(-1, 1), z = z0 + rnd(-1, 1);
        if (!free(x, z)) continue;
        if (this.items.some(it => Math.hypot(it.pos.x - x, it.pos.z - z) < 3)) continue;
        if (Math.hypot(c.pos.x - x, c.pos.z - z) < 2.5) continue;
        return new T.Vector3(x, 0, z);
      }
      return null;
    }
    spawn(id, at) {
      let row = id ? LOOT_TABLE.find(r => r[0] === id) : LOOT_TABLE[(Math.random() * LOOT_TABLE.length) | 0];
      if (!row) return null;
      const pos = at ? at.clone().setY(0) : this.freeSpot(); if (!pos) return null;
      const [lid, kind, rar] = row, col = kind === 'weapon' ? LOOT_WEAPONS[lid].color : DEFS[lid].color;
      const g = new T.Group(); g.position.copy(pos);
      let show;
      if (kind === 'weapon') { show = VR.WeaponKit.model(lid); show.scale.setScalar(1.6); }
      else {
        show = new T.Mesh(new T.OctahedronGeometry(0.28, 0), new T.MeshBasicMaterial({ color: col }));
        show.material.toneMapped = false; show.material.userData.own = true; show.geometry.userData.own = true;
        const inner = new T.Mesh(new T.BoxGeometry(0.16, 0.16, 0.16), new T.MeshBasicMaterial({ color: 0xffffff })); inner.material.userData.own = true; inner.geometry.userData.own = true; show.add(inner);
      }
      const holder = new T.Group(); holder.position.y = 0.9; holder.add(show); g.add(holder);
      const ring = new T.Mesh(new T.RingGeometry(0.55, 0.75, 28), new T.MeshBasicMaterial({ color: RARITY[rar], transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
      ring.material.userData.own = true; ring.geometry.userData.own = true; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      const beam = new T.Mesh(new T.BoxGeometry(0.16, 6, 0.16), new T.MeshBasicMaterial({ color: RARITY[rar], transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending }));
      beam.material.userData.own = true; beam.geometry.userData.own = true; beam.material.toneMapped = false; beam.position.y = 3; g.add(beam);
      this.mgr.scene.add(g);
      const it = { id: lid, kind, rar, pos, obj: g, holder, t: Math.random() * 6, col };
      this.items.push(it);
      return it;
    }
    nearest(r = 1.7) {
      const c = this.mgr.ctrl; let best = null, bd = r;
      for (const it of this.items) { const d = Math.hypot(it.pos.x - c.pos.x, it.pos.z - c.pos.z); if (d < bd && Math.abs(c.pos.y - it.pos.y) < 1.6) { bd = d; best = it; } }
      return best;
    }
    name(it) { return VR.L(it.kind === 'weapon' ? LOOT_NAMES[it.id] : DEFS[it.id].name); }
    pick() {
      const mgr = this.mgr, m = mgr.match;
      if (!this.on || !m || m.phase !== 'fight' || m.dead[m.me]) return false;
      const it = this.nearest(); if (!it) return false;
      this.items.splice(this.items.indexOf(it), 1); mgr.scene.remove(it.obj);
      if (it.kind === 'weapon') this.giveWeapon(it.id);
      else mgr.powers.give(DEFS[it.id], true, it.id);
      if (mgr.fb) mgr.fb.ability('charge', { pos: it.pos.clone().setY(1), elem: it.kind === 'weapon' ? 'energy' : DEFS[it.id].elem, color: it.col });
      VR.Audio.play('unlock');
      mgr.ui.feed(VR.t('lt.got', { name: this.name(it) }), 'good');
      return true;
    }
    /** a loot weapon: the second gun slot is filled, or it replaces the gun in hand (a loot gun replaced falls on the floor) */
    giveWeapon(id) {
      const mgr = this.mgr, lo = mgr.lo, W = FK().WEAPONS;
      const guns = lo.slots.filter(s => !W[s.id].melee);
      let i;
      if (guns.length < 2) { lo.slots.splice(0, 0, { id, mag: W[id].mag }); i = 0; }
      else {
        i = W[lo.slot.id].melee ? 0 : lo.cur;
        const old = lo.slots[i].id;
        lo.slots[i] = { id, mag: W[id].mag };
        if (W[old].loot) this.spawn(old, mgr.ctrl.pos.clone().addScaledVector(mgr.ctrl.forward(), -1));
      }
      lo.cur = i; lo.switchT = 0.25; lo.reloadT = 0; lo.coolT = 0;
      mgr.dropScope();
    }
    update(dt) {
      if (!this.on) return;
      for (const it of this.items) { it.t += dt; it.holder.rotation.y = it.t * 1.6; it.holder.position.y = 0.9 + Math.sin(it.t * 2.2) * 0.1; }
      const m = this.mgr.match;
      if (m.phase === 'fight' && this.items.length < this.max) { this.respawnT -= dt; if (this.respawnT <= 0) { this.respawnT = 10; this.spawn(); } }
    }
    prompt() { const it = this.on && this.nearest(); return it ? VR.t('lt.pick', { k: keyOf('interact'), name: this.name(it) }) : null; }
  }

  // ================================================================== hostage
  const SHIELD_HITS = 3, SHIELD_HP = 200;            // 3 hits, or two killing shots
  class Hostage {
    constructor(mgr) { this.mgr = mgr; this.held = null; }
    get allowed() { const m = this.mgr.match; return !!(m && m.type === 'bots' && m.phase === 'fight' && !m.dead[m.me]); }
    /** an enemy next to me, and I am at its side or behind it (not in front of it) */
    candidate() {
      if (!this.allowed || this.held) return null;
      const c = this.mgr.ctrl; let best = null, bd = 1.6;
      for (const b of this.mgr.bots.list) {
        if (!b.alive || b.held) continue;
        const dx = c.pos.x - b.pos.x, dz = c.pos.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d > bd || Math.abs(c.pos.y - b.pos.y) > 0.8 || d < 0.05) continue;
        const face = { x: -Math.sin(b.yaw), z: -Math.cos(b.yaw) };
        if ((face.x * dx + face.z * dz) / d > 0.5) continue;          // it sees me coming: in front of it (±60°)
        best = b; bd = d;
      }
      return best;
    }
    toggle() { if (this.held) { this.release('let'); return true; } const b = this.candidate(); if (!b) { VR.Audio.play('buzz'); return false; } this.grab(b); return true; }
    grab(b) {
      const mgr = this.mgr;
      this.held = b; b.held = true; b.vel && b.vel.set(0, 0, 0);
      if (b.fx) { b.fx.dash = null; b.fx.strike = null; b.fx.healT = 0; if (b.body.healRing) b.body.healRing.visible = false; }
      this.hits = SHIELD_HITS; this.hp = SHIELD_HP;
      mgr.dropScope();
      VR.Audio.play('thud'); mgr.ui.feed(VR.t('lt.held') + ': ' + b.name, 'good');
      if (mgr.fb) mgr.fb.note({ type: 'hostage', on: true });
      this.place(); this.paint();
    }
    release(why) {
      const b = this.held; if (!b) return;
      this.held = null; b.held = false;
      if (b.alive) {
        const f = this.mgr.ctrl.forward(); this.mgr.bots.move(b, f.x * 0.8, f.z * 0.8); b.pos.y = this.mgr.ctrl.pos.y > 0.2 ? 0.05 : b.pos.y;
        b.pos.y = 0.05; b.react = 0; if (b.mem) b.mem.hitT = 0.6;
        if (why === 'jump' || why === 'let') this.mgr.ui.feed(VR.t('lt.free'), '');
      }
      if (this.mgr.fb) this.mgr.fb.note({ type: 'hostage', on: false, why });
      this.paint();
    }
    /** keep the hostage in front of me (a little to the left and lower, so I can still aim) */
    place() {
      const b = this.held, c = this.mgr.ctrl; if (!b) return;
      const f = c.forward(), r = c.right();
      b.pos.set(c.pos.x + f.x * 0.72 - r.x * 0.4, c.pos.y - 0.3, c.pos.z + f.z * 0.72 - r.z * 0.4);
      b.yaw = c.yaw; b.pitch = 0;
      if (b.net !== undefined) b.net = null;
    }
    /** a shot at me: from the front, the hostage takes it. Returns true when it was blocked */
    intercept(from, dmg) {
      const b = this.held; if (!b || !from) return false;
      const c = this.mgr.ctrl, f = c.forward(), dx = from.x - c.pos.x, dz = from.z - c.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((f.x * dx + f.z * dz) / d < 0.26) return false;            // only the front (±75°)
      this.hits--; this.hp -= dmg;
      const mgr = this.mgr;
      if (mgr.fb) mgr.fb.hit(mgr.hitPoint(b.pos, false, false), 'armor', { prof: mgr.botProf(b) });
      VR.Audio.play('fbArmor');
      if (this.hits <= 0 || this.hp <= 0) {
        this.release('dead');
        mgr.hostBotHit(b, 9999, false, mgr.match.me, 'hostage');
        mgr.ui.feed(VR.t('lt.lost'), 'bad');
      }
      this.paint();
      return true;
    }
    update(dt) {
      if (!this.held) { this.paintPrompt(); return; }
      const m = this.mgr.match;
      if (!this.held.alive || !m || m.phase !== 'fight' || m.dead[m.me]) { this.release('end'); return; }
      this.place();
      this.mgr.ctrl.sprint = false;                                   // no running with a hostage
    }
    paintPrompt() {}
    status() { return this.held ? { hits: this.hits, max: SHIELD_HITS } : null; }
    paint() { this.mgr.ui.setHostage && this.mgr.ui.setHostage(this.status()); }
    prompt() { return !this.held && this.candidate() ? VR.t('lt.grab', { k: keyOf('grab') }) : null; }
  }

  VR.Powers = { PlayerPowers, Loot, Hostage, DEFS, LOOT_WEAPONS, LOOT_NAMES, LOOT_TABLE, fromAbility };
})();
