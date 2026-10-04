/* =====================================================================
 * ENEMIES — single-player AI opponents for the adventure world.
 * ---------------------------------------------------------------------
 *   normal  "lemon guard"   keeps a middle distance, strafes, fires slow
 *                           glowing shots you can see and dodge
 *   fast    "runner"        low health, rushes you and hits up close
 *   heavy   "heavy"         lots of health and armour; turns slowly; the
 *                           glowing core on its BACK is its weak spot
 *                           (front hits do little). A grenade stuns it.
 *
 * Every attack is telegraphed (a short wind-up glow) so it can be read
 * and avoided. Enemies collide with the level, see you only with a clear
 * line of sight, and wake up when they see you, hear a shot, or are hit.
 *
 *   const sys = new VR.EnemySystem(scene, level, fx)
 *   sys.spawn('normal', [x, z], { yaw })    → enemy
 *   sys.update(dt, players)                  players: one or a list of { id, pos, vel, health, hurt(dmg, from) }
 *                                            (multiplayer-ready: each enemy picks the nearest player
 *                                            it can see; shots can hit any player)
 *   sys.targets()                            hit boxes for the weapon trace
 *   sys.alive · sys.clear()
 * ===================================================================== */
(function () {
  const T = THREE;
  const K = () => VR.WeaponKit;

  const TYPES = {
    normal: { name: { en: 'Lemon guard', ar: 'حارس الليمون' }, hp: 60, speed: 2.6, radius: 0.4, height: 1.8, aggro: 24,
      keep: [7, 14], fireEvery: [1.5, 2.3], windup: 0.4, shotDmg: 9, shotSpeed: 15, burst: 1, mult: { head: 2, body: 1 } },
    fast: { name: { en: 'Runner', ar: 'العدّاء' }, hp: 35, speed: 6.0, radius: 0.35, height: 1.5, aggro: 26,
      melee: { range: 1.6, reach: 2.0, windup: 0.3, dmg: 12, cool: 1.0 }, mult: { head: 2, body: 1 } },
    heavy: { name: { en: 'Heavy', ar: 'الثقيل' }, hp: 300, speed: 1.5, radius: 0.7, height: 2.4, aggro: 26, turn: 1.1,
      keep: [8, 16], fireEvery: [2.8, 3.4], windup: 0.6, shotDmg: 11, shotSpeed: 13, burst: 3, mult: { head: 0.5, body: 0.25, weak: 3 } },
  };

  // ------------------------------------------------------------------ models (front = -Z)
  function glow(color) { const m = new T.MeshBasicMaterial({ color }); m.toneMapped = false; m.userData.own = true; return m; }
  function build(type) {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    const parts = {};
    if (type === 'normal') {
      vb.addColorBox(-0.17, 0, 0, 0.2, 0.8, 0.24, 0x2d4a2a); vb.addColorBox(0.17, 0, 0, 0.2, 0.8, 0.24, 0x2d4a2a);   // legs
      vb.addColorBox(0, 0.8, 0, 0.7, 0.55, 0.42, 0x4f9a3a);                                                         // body
      vb.addColorBox(0, 1.32, 0, 0.5, 0.48, 0.5, 0xf2d43a);                                                         // lemon head
      vb.addColorBox(0.42, 0.95, -0.2, 0.14, 0.14, 0.5, 0x23262f);                                                  // gun arm
    } else if (type === 'fast') {
      vb.addColorBox(-0.13, 0, 0, 0.15, 0.7, 0.2, 0x7a3a14); vb.addColorBox(0.13, 0, 0, 0.15, 0.7, 0.2, 0x7a3a14);
      vb.addColorBox(0, 0.7, 0, 0.5, 0.45, 0.32, 0xe3702a);
      vb.addColorBox(0, 1.12, 0, 0.38, 0.38, 0.38, 0xf6b13a);
      vb.addColorBox(-0.33, 0.75, -0.15, 0.12, 0.12, 0.45, 0x3a1e0a); vb.addColorBox(0.33, 0.75, -0.15, 0.12, 0.12, 0.45, 0x3a1e0a);   // claws
    } else {
      vb.addColorBox(-0.32, 0, 0, 0.4, 1.0, 0.5, 0x2f2346); vb.addColorBox(0.32, 0, 0, 0.4, 1.0, 0.5, 0x2f2346);
      vb.addColorBox(0, 1.0, 0, 1.3, 0.9, 0.85, 0x5a3f8a);                                                          // armoured body
      vb.addColorBox(0, 1.0, -0.47, 1.1, 0.75, 0.1, 0x7d8496);                                                     // front plate
      vb.addColorBox(0, 1.9, 0, 0.62, 0.5, 0.6, 0x4a3570);                                                          // head
      vb.addColorBox(0.8, 1.2, -0.3, 0.3, 0.3, 0.9, 0x23262f); vb.addColorBox(-0.8, 1.2, -0.3, 0.3, 0.3, 0.9, 0x23262f);   // cannons
    }
    g.add(vb.build());
    // eyes (glow) — also the wind-up light
    const eyeW = type === 'heavy' ? 0.42 : type === 'fast' ? 0.26 : 0.34;
    const eyeY = type === 'heavy' ? 2.18 : type === 'fast' ? 1.33 : 1.6;
    const eyeZ = type === 'heavy' ? -0.31 : type === 'fast' ? -0.2 : -0.26;
    const eyes = new T.Mesh(new T.BoxGeometry(eyeW, 0.08, 0.02), glow(0xff4b3a)); eyes.geometry.userData.own = true;
    eyes.position.set(0, eyeY, eyeZ); g.add(eyes); parts.eyes = eyes;
    if (type === 'heavy') {
      const core = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.12), glow(0xffe14a)); core.geometry.userData.own = true;
      core.position.set(0, 1.45, 0.48); g.add(core); parts.core = core;
    }
    g.userData.parts = parts;
    return g;
  }

  // ------------------------------------------------------------------ enemy
  let nextId = 1;
  class Enemy {
    constructor(type, pos, yaw = 0) {
      this.id = nextId++;
      this.type = type; this.def = TYPES[type];
      this.pos = new T.Vector3(pos[0], 0, pos[1]);
      this.yaw = yaw; this.vel = new T.Vector3();
      this.health = new VR.Health(this.def.hp);
      this.obj = build(type);
      this.state = 'idle';            // idle → hunt → (windup) → dead
      this.aware = false;
      this.fireT = 1 + Math.random(); this.windT = 0; this.coolT = 0; this.burstLeft = 0;
      this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
      this.stunT = 0; this.hitT = 0; this.deadT = 0;
      this.sync();
    }
    get alive() { return !this.health.dead; }
    forward(out = new T.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
    sync() {
      this.obj.position.copy(this.pos); this.obj.rotation.y = this.yaw;
      const p = this.obj.userData.parts;
      const wind = this.windT > 0;
      p.eyes.material.color.setHex(wind ? 0xffffff : this.aware ? 0xff4b3a : 0x8a3a30);
      const s = 1 + this.hitT * 0.12; this.obj.scale.set(s, 1 - this.hitT * 0.05, s);
      if (p.core) p.core.material.color.setHex(this.stunT > 0 ? 0xffffff : 0xffe14a);
    }
    /** hit boxes in the world (axis aligned) */
    parts() {
      const d = this.def, p = this.pos, r = d.radius, h = d.height;
      const headH = this.type === 'heavy' ? 0.5 : this.type === 'fast' ? 0.38 : 0.48;
      const hr = this.type === 'heavy' ? 0.33 : this.type === 'fast' ? 0.21 : 0.27;
      const out = {
        head: new T.Box3(new T.Vector3(p.x - hr, h - headH, p.z - hr).setY(p.y + h - headH), new T.Vector3(p.x + hr, p.y + h + 0.02, p.z + hr)),
        body: new T.Box3(new T.Vector3(p.x - r, p.y, p.z - r), new T.Vector3(p.x + r, p.y + h - headH, p.z + r)),
      };
      if (this.type === 'heavy') {
        // the core sits on the back; its box sticks out behind the body so the trace finds it first from behind
        const back = this.forward().multiplyScalar(-0.75);
        const c = new T.Vector3(p.x + back.x, p.y + 1.7, p.z + back.z);
        out.weak = new T.Box3(c.clone().addScalar(-0.26), c.clone().addScalar(0.26));
      }
      return out;
    }
    /** damage from the player; returns { dmg, part, killed } */
    hurt(base, part, sys) {
      const m = this.def.mult[part] !== undefined ? this.def.mult[part] : 1;
      const dmg = base * m;
      this.health.damage(dmg);
      this.hitT = 1; this.aware = true; sys.alertNear(this.pos, 12);
      return { dmg, part, killed: this.health.dead, armored: m < 1 };
    }
  }

  // ------------------------------------------------------------------ system
  class EnemySystem {
    constructor(scene, level, fx, boxes) {
      this.scene = scene; this.level = level; this.fx = fx;
      this.boxes = boxes || (() => []);                 // Box3s for sight lines (level solids are used for walking)
      this.enemies = []; this.shots = [];
      this.ray = new T.Ray();
      this.solids = level.solids;
      this.shotGeo = new T.BoxGeometry(0.22, 0.22, 0.22);
      this._v = new T.Vector3(); this._w = new T.Vector3();
      this.onKill = null;
    }
    get alive() { return this.enemies.filter(e => e.alive).length; }
    spawn(type, at, opts = {}) {
      const e = new Enemy(type, at, opts.yaw || 0);
      if (opts.aware) e.aware = true;
      this.scene.add(e.obj);
      this.enemies.push(e);
      this.fx && this.fx.puff(e.pos.clone().setY(0.6), 0xcfc2ff, 10);
      return e;
    }
    clear() {
      for (const e of this.enemies) this.scene.remove(e.obj);
      for (const s of this.shots) this.scene.remove(s.mesh);
      this.enemies = []; this.shots = [];
    }
    targets() { return this.enemies.filter(e => e.alive).map(e => ({ parts: e.parts(), ref: e })); }
    alertNear(p, r) { for (const e of this.enemies) if (e.alive && e.pos.distanceTo(p) < r) e.aware = true; }
    /** a shot was fired at o: enemies that can hear it wake up */
    noise(o, r = 18) { this.alertNear(o, r); }
    los(from, to) {
      const d = this._w.copy(to).sub(from); const dist = d.length(); d.normalize();
      return K().wallDist(this.ray, this.boxes(), from, d, dist) >= dist - 0.05;
    }
    /** move an enemy, sliding along walls (circle vs boxes, x and z separately) */
    move(e, dx, dz) {
      const r = e.def.radius, h = e.def.height;
      const blocked = (x, z) => this.solids.some(s => s.enabled !== false && s.max[1] > e.pos.y + 0.35 && s.min[1] < e.pos.y + h &&
        x + r > s.min[0] && x - r < s.max[0] && z + r > s.min[2] && z - r < s.max[2]);
      const x0 = e.pos.x, z0 = e.pos.z;
      if (!blocked(e.pos.x + dx, e.pos.z)) e.pos.x += dx;
      if (!blocked(e.pos.x, e.pos.z + dz)) e.pos.z += dz;
      return Math.hypot(e.pos.x - x0, e.pos.z - z0);
    }
    /** which player this enemy goes for: the nearest one it can see, else the nearest alive one */
    pickTarget(e, players) {
      let best = null, bestSeen = null, bd = Infinity, bs = Infinity;
      const eye = new T.Vector3(e.pos.x, e.pos.y + e.def.height - 0.25, e.pos.z);
      for (const p of players) {
        if (p.health.dead) continue;
        const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        if (d < bd) { bd = d; best = p; }
        if (d < bs && d < e.def.aggro && this.los(eye, new T.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z))) { bs = d; bestSeen = p; }
      }
      return bestSeen || best || players[0];
    }
    update(dt, players) {
      players = Array.isArray(players) ? players : [players];
      for (const e of this.enemies) {
        if (!e.alive) {
          if (e.deadT === 0) { this.fx && this.fx.puff(e.pos.clone().setY(e.def.height * 0.5), 0xffe14a, 14); VR.Audio.play('enemyDown'); if (this.onKill) this.onKill(e); }
          e.deadT += dt;
          e.obj.scale.setScalar(Math.max(0.01, 1 - e.deadT * 4));
          e.obj.position.y = -e.deadT;
          if (e.deadT > 0.3) e.obj.visible = false;
          continue;
        }
        const player = players.length === 1 ? players[0] : this.pickTarget(e, players);
        e.target = player;
        this.think(e, dt, player, new T.Vector3(player.pos.x, player.pos.y + 1.0, player.pos.z));
        e.hitT = Math.max(0, e.hitT - dt * 6);
        e.sync();
      }
      // separate enemies from each other
      const live = this.enemies.filter(e => e.alive);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.def.radius + b.def.radius;
        if (d > 0.001 && d < min) { const k = (min - d) / 2 / d; this.move(a, -dx * k, -dz * k); this.move(b, dx * k, dz * k); }
      }
      this.updateShots(dt, players);
    }
    think(e, dt, player, pc) {
      const d = e.def;
      const eye = new T.Vector3(e.pos.x, e.pos.y + d.height - 0.25, e.pos.z);
      const toP = new T.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z);
      const dist = toP.length();
      const sees = dist < d.aggro && this.los(eye, pc);
      if (!e.aware && sees) { e.aware = true; this.alertNear(e.pos, 10); }
      if (!e.aware || player.health.dead) return;
      e.stunT = Math.max(0, e.stunT - dt);
      if (e.stunT > 0) { e.windT = 0; return; }
      // face the player (the heavy turns slowly: that is how you get behind it)
      const want = Math.atan2(-toP.x, -toP.z);
      let dy = want - e.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      const turn = (d.turn || 8) * dt;
      e.yaw += Math.max(-turn, Math.min(turn, dy));
      const facing = Math.abs(dy) < 0.35;
      const dir = toP.clone().normalize();
      let mx = 0, mz = 0;
      if (d.melee) {
        // runner: rush, wind up, swing
        e.coolT = Math.max(0, e.coolT - dt);
        if (e.windT > 0) {
          e.windT -= dt;
          if (e.windT <= 0) {
            if (dist < d.melee.reach) player.hurt(d.melee.dmg, e);
            e.coolT = d.melee.cool; VR.Audio.play('swipe');
          }
        } else if (dist < d.melee.range && e.coolT <= 0 && sees) { e.windT = d.melee.windup; VR.Audio.play('windup'); }
        else if (dist > 1.2) {
          e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = 0.5 + Math.random() * 0.6; e.strafe *= -1; }
          const side = dist > 4 ? 0.45 * e.strafe : 0;
          mx = (dir.x + dir.z * side) * d.speed; mz = (dir.z - dir.x * side) * d.speed;
        }
      } else {
        // ranged: hold a distance band, strafe, fire telegraphed shots
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = 1.2 + Math.random() * 1.5; e.strafe *= -1; }
        let fwd = 0;
        if (!sees || dist > d.keep[1]) fwd = 1; else if (dist < d.keep[0]) fwd = -0.8;
        const side = sees ? 0.55 * e.strafe : 0;
        const sp = e.windT > 0 ? d.speed * 0.25 : d.speed;
        mx = (dir.x * fwd + dir.z * side) * sp; mz = (dir.z * fwd - dir.x * side) * sp;
        if (e.windT > 0) {
          e.windT -= dt;
          if (e.windT <= 0) { this.fire(e, eye, player); e.burstLeft = d.burst - 1; e.burstGap = 0.18; e.fireT = d.fireEvery[0] + Math.random() * (d.fireEvery[1] - d.fireEvery[0]); }
        } else if (e.burstLeft > 0) {
          e.burstGap -= dt;
          if (e.burstGap <= 0) { this.fire(e, eye, player); e.burstLeft--; e.burstGap = 0.18; }
        } else {
          e.fireT -= dt;
          if (e.fireT <= 0 && sees && facing) { e.windT = d.windup; VR.Audio.play('windup'); }
        }
      }
      // stuck against a wall or a pillar: go around it for a moment
      if (e.detourT > 0) {
        e.detourT -= dt;
        const sp = d.speed;
        mx = (dir.z * e.strafe + dir.x * 0.3) * sp; mz = (-dir.x * e.strafe + dir.z * 0.3) * sp;
      }
      if (mx || mz) {
        const want = Math.hypot(mx, mz) * dt, got = this.move(e, mx * dt, mz * dt);
        e.stuckT = got < want * 0.3 ? (e.stuckT || 0) + dt : 0;
        if (e.stuckT > 0.35) { e.stuckT = 0; e.detourT = 1.1; e.strafe *= -1; }
      }
    }
    fire(e, eye, player) {
      const d = e.def;
      const from = eye.clone().addScaledVector(e.forward(), d.radius + 0.25);
      const target = new T.Vector3(player.pos.x, player.pos.y + 1.0, player.pos.z);
      // lead a little less than perfectly, plus a small error
      target.addScaledVector(player.vel || new T.Vector3(), from.distanceTo(target) / d.shotSpeed * 0.5);
      target.x += (Math.random() - 0.5) * 0.6; target.y += (Math.random() - 0.5) * 0.3; target.z += (Math.random() - 0.5) * 0.6;
      const vel = target.sub(from).normalize().multiplyScalar(d.shotSpeed);
      const mesh = new T.Mesh(this.shotGeo, glow(e.type === 'heavy' ? 0xb26bff : 0xff7a3a));
      mesh.position.copy(from); this.scene.add(mesh);
      this.shots.push({ pos: from, vel, dmg: d.shotDmg, life: 4, mesh, from: e });
      VR.Audio.play('enemyShot');
    }
    updateShots(dt, players) {
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i];
        s.life -= dt;
        const steps = 2; let done = false;
        for (let k = 0; k < steps && !done; k++) {
          s.pos.addScaledVector(s.vel, dt / steps);
          // any player's capsule (segment y+0.3 .. y+1.5, radius 0.45)
          for (const player of players) {
            const cy = Math.max(player.pos.y + 0.3, Math.min(player.pos.y + 1.5, s.pos.y));
            const dx = s.pos.x - player.pos.x, dz = s.pos.z - player.pos.z, dyy = s.pos.y - cy;
            if (!player.health.dead && dx * dx + dz * dz + dyy * dyy < 0.45 * 0.45) { player.hurt(s.dmg, s.from); done = true; break; }
          }
          if (done) break;
          if (this.solids.some(b => b.enabled !== false && s.pos.x > b.min[0] && s.pos.x < b.max[0] && s.pos.y > b.min[1] && s.pos.y < b.max[1] && s.pos.z > b.min[2] && s.pos.z < b.max[2])) {
            this.fx && this.fx.puff(s.pos.clone(), 0xffb070, 4); done = true;
          }
        }
        s.mesh.position.copy(s.pos); s.mesh.rotation.x += dt * 8; s.mesh.rotation.y += dt * 6;
        if (done || s.life <= 0) { this.scene.remove(s.mesh); s.mesh.material.dispose(); this.shots.splice(i, 1); }
      }
    }
    /** grenade blast: damage + push + stun */
    blast(p, R, dmg, push) {
      const out = [];
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const c = new T.Vector3(e.pos.x, e.pos.y + e.def.height * 0.5, e.pos.z);
        const dist = c.distanceTo(p);
        if (dist > R + e.def.radius) continue;
        const k = 1 - Math.min(1, dist / (R + e.def.radius)) * 0.6;
        e.health.damage(dmg * k); e.hitT = 1; e.aware = true;
        e.stunT = e.type === 'heavy' ? 1.4 : 0.6; e.windT = 0;
        const dir = c.sub(p).setY(0); if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); dir.normalize();
        const kb = push * k * (e.type === 'heavy' ? 0.08 : 0.25);
        this.move(e, dir.x * kb, dir.z * kb);
        out.push(e);
      }
      return out;
    }
  }

  VR.Audio.define('windup', ({ tone }) => { tone(520, 0.18, 'triangle', 0.06, 900); });
  VR.Audio.define('enemyShot', ({ tone, noise }) => { noise(0.08, 0.15, 1800); tone(260, 0.12, 'square', 0.07, 140); });
  VR.Audio.define('swipe', ({ noise }) => { noise(0.12, 0.25, 3200); });
  VR.Audio.define('enemyDown', ({ tone }) => { tone(700, 0.08, 'square', 0.1, 300); tone(300, 0.2, 'triangle', 0.1, 90, 0.06); });

  VR.Enemies = { TYPES, Enemy };
  VR.EnemySystem = EnemySystem;
})();
