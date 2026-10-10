/* =====================================================================
 * ONE-ON-ONE BASKETBALL: the match, the ball physics, the shot model and
 * the computer player (no rendering; plain numbers — runs in node too).
 * The court, the controls and the screen are js/mini/basketball.js.
 *
 *   Court: x along the length (team 0 = you attack the hoop at +x, the
 *   computer attacks the hoop at -x), z across, y up. Metres, seconds.
 *
 *   HoopMatch
 *     step(dt, intents)   intents[team] = { mx, mz (wish to move, world),
 *                         sprint, shoot (held), steal (pressed), jump (pressed) }
 *     events              what happened this step (for sounds / messages):
 *                         score · miss · rim · board · bounce · steal · stealMiss ·
 *                         block · rebound · pickup · shot · buzzer · over
 *
 *   Rules (simplified 1-on-1):
 *     - 90 s (configurable), a 3-2-1 countdown, you start with the ball.
 *     - 2 points inside the 3-point arc, 3 points from beyond it (decided
 *       where the shooter's feet were at the release).
 *     - a basket counts only when the ball drops down THROUGH the rim of
 *       the hoop that team attacks — once per shot.
 *     - after a basket the other team gets the ball under that basket.
 *     - a missed shot is a loose ball: whoever gets to it first has it
 *       (only players actually near it can take it).
 *     - STEAL: right in front of the ball handler (close, facing him) the
 *       steal is offered (stealable()); pressing it then takes the ball. A
 *       player who just got the ball is safe for a moment, and a steal has a
 *       cool-down (no ping-pong). Pressing it from anywhere else does nothing
 *       but cost a short stumble.
 *     - BLOCK: jump in front of a shooter as he lets go (or get a hand on the
 *       ball just after) — the closer, the surer.
 *     - DUNK: three baskets in a row earn one dunk; every three more, another.
 *       With a dunk ready and the ball close to the hoop, SHOOT dunks: up to
 *       the rim, 2 points, it cannot be blocked. A miss / a blocked shot ends
 *       the streak.
 *     - when the clock runs out, a shot already in the air still counts.
 * ===================================================================== */
(function () {
  const CL = 22, CW = 13, HCL = CL / 2, HCW = CW / 2;
  const HOOP_X = HCL - 1.2, RIM_Y = 3.05, RIM_R = 0.23, RIM_T = 0.02, BALL_R = 0.12;
  const BOARD_X = HOOP_X + RIM_R + 0.15, BOARD_HZ = 0.9, BOARD_Y0 = 2.9, BOARD_Y1 = 3.95, BOARD_T = 0.05;
  const THREE_R = 6.0;                  // the 3-point arc (from the point under the rim)
  const AX = HCL + 1.4, AZ = HCW + 1.4; // the arena walls the ball bounces off
  const G = 9.8, CHARGE = 0.75, SWEET = 0.9, SWEET_W = 0.06;
  const RUN = 5.2, WITH_BALL = 4.6, SPRINT = 1.28, ACC = 22, PR = 0.36;
  const hoopX = (team) => (team === 0 ? HOOP_X : -HOOP_X);       // the hoop a team attacks

  function gauss(rand) { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** launch velocity to drop through the rim from (fx,fy,fz) — before any error */
  function solveShot(fx, fy, fz, tx) {
    const dx = tx - fx, dz = 0 - fz, D = Math.hypot(dx, dz), h = RIM_Y + 0.03 - fy;
    const th = (D < 2 ? 60 : 56 - clamp((D - 2) / 5, 0, 1) * 6) * Math.PI / 180;
    const den = 2 * Math.cos(th) ** 2 * (D * Math.tan(th) - h);
    const v = Math.sqrt(G * D * D / Math.max(0.05, den));
    return { v, th, D, ux: dx / D, uz: dz / D };
  }
  /**
   * The shot model: the perfect launch, then errors. Short / long from the release timing
   * (the meter) and from distance; left / right from distance, moving and a defender in front.
   * skill < 1 is better than average, > 1 worse.
   */
  function shotVelocity(o, rand) {
    const s = solveShot(o.x, o.y, o.z, o.tx);
    const D = s.D, lay = D < 1.6;
    const sk = o.skill || 1;
    const timing = Math.abs(o.meter - SWEET) <= SWEET_W ? 0 : clamp(o.meter - SWEET, -0.6, 0.45);
    const pErr = timing * (lay ? 0.12 : 0.28) + gauss(rand) * (0.006 + 0.0019 * D) * sk + gauss(rand) * (o.contest || 0) * 0.025;
    const dErr = gauss(rand) * ((0.005 + 0.0015 * D) * sk + (o.moving || 0) * 0.012 + (o.contest || 0) * 0.035 + Math.abs(timing) * 0.13) * (lay ? 0.6 : 1);
    const v = s.v * (1 + pErr), ca = Math.cos(dErr), sa = Math.sin(dErr);
    const hx = s.ux * ca - s.uz * sa, hz = s.ux * sa + s.uz * ca;
    return { vx: hx * v * Math.cos(s.th), vy: v * Math.sin(s.th), vz: hz * v * Math.cos(s.th), D, timing };
  }

  // ------------------------------------------------------------------ the ball in the air
  /** rim, backboard, floor, walls, the net; scores. ev: event list */
  function ballPhysics(b, dt, ev, onScore) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * dt / 0.04));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const py = b.y;
      b.vy -= G * h;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      for (const sx of [-1, 1]) {
        const hx = sx * HOOP_X;
        // through the hoop: crossing the rim height going down, inside the ring
        if (py > RIM_Y && b.y <= RIM_Y && b.vy < 0 && Math.hypot(b.x - hx, b.z) < RIM_R - BALL_R * 0.25) onScore(sx);
        // up through the ring from below: that ball cannot score any more
        if (py < RIM_Y && b.y >= RIM_Y && b.vy > 0 && Math.hypot(b.x - hx, b.z) < RIM_R + BALL_R) b.fromBelow = sx;
        // the rim (a ring): bounce off its nearest point
        let rx = b.x - hx, rz = b.z, rl = Math.hypot(rx, rz);
        if (rl < 1e-4) { rx = 1; rz = 0; rl = 1; }                         // right over the centre: any point of the ring is as near
        const qx = hx + rx / rl * RIM_R, qz = rz / rl * RIM_R;
        const dx = b.x - qx, dy = b.y - RIM_Y, dz = b.z - qz, d = Math.hypot(dx, dy, dz);
        if (d < BALL_R + RIM_T) {
          const nx = dx / d, ny = dy / d, nz = dz / d, vn = b.vx * nx + b.vy * ny + b.vz * nz;
          if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz; b.vx *= 0.9; b.vz *= 0.9; ev.push({ t: 'rim', v: -vn }); b.touched = true; }
          const push = BALL_R + RIM_T - d; b.x += nx * push; b.y += ny * push; b.z += nz * push;
        }
        // the backboard (a thin box)
        const bx = sx * BOARD_X;
        if (Math.abs(b.z) < BOARD_HZ + BALL_R && b.y > BOARD_Y0 - BALL_R && b.y < BOARD_Y1 + BALL_R && Math.abs(b.x - bx) < BOARD_T / 2 + BALL_R) {
          const pen = [BOARD_T / 2 + BALL_R - Math.abs(b.x - bx), BOARD_Y1 + BALL_R - b.y, b.y - (BOARD_Y0 - BALL_R), BOARD_HZ + BALL_R - Math.abs(b.z)];
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) { const s = Math.sign(b.x - bx) || -sx; b.x = bx + s * (BOARD_T / 2 + BALL_R); if (b.vx * s < 0) { ev.push({ t: 'board', v: Math.abs(b.vx) }); b.vx = -b.vx * 0.6; b.touched = true; } }
          else if (k === 1) { b.y = BOARD_Y1 + BALL_R; if (b.vy < 0) b.vy = -b.vy * 0.5; b.touched = true; }
          else if (k === 2) { b.y = BOARD_Y0 - BALL_R; if (b.vy > 0) b.vy = -b.vy * 0.5; b.touched = true; }
          else { const s = Math.sign(b.z); b.z = s * (BOARD_HZ + BALL_R); if (b.vz * s < 0) b.vz = -b.vz * 0.6; b.touched = true; }
        }
        // the net slows a ball dropping through it
        if (b.y < RIM_Y && b.y > RIM_Y - 0.45 && Math.hypot(b.x - hx, b.z) < RIM_R) { const k = Math.exp(-h * 6); b.vx *= k; b.vz *= k; }
      }
      // the floor
      if (b.y < BALL_R) {
        b.y = BALL_R;
        if (b.vy < -0.7) { ev.push({ t: 'bounce', v: -b.vy }); b.vy = -b.vy * 0.72; b.vx *= 0.88; b.vz *= 0.88; }
        else b.vy = 0;
        b.touched = true; b.floor = true;
      }
      if (b.y <= BALL_R + 1e-4 && b.vy === 0) {                     // rolling
        const sp = Math.hypot(b.vx, b.vz), dec = 1.6 * h;
        if (sp <= dec) { b.vx = b.vz = 0; } else { b.vx *= (sp - dec) / sp; b.vz *= (sp - dec) / sp; }
      }
      // the arena walls
      if (Math.abs(b.x) > AX - BALL_R) { b.x = Math.sign(b.x) * (AX - BALL_R); b.vx = -b.vx * 0.55; b.touched = true; }
      if (Math.abs(b.z) > AZ - BALL_R) { b.z = Math.sign(b.z) * (AZ - BALL_R); b.vz = -b.vz * 0.55; b.touched = true; }
    }
  }

  // ------------------------------------------------------------------ the match
  class HoopMatch {
    constructor(o = {}) {
      this.len = o.time || 90; this.rand = o.rand || Math.random;
      this.players = [0, 1].map(team => ({ team, x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0, yaw: 0, stun: 0, stealCD: 0, charge: null, holdT: 0, jumpCD: 0, skill: 1, safeT: 0, streak: 0, dunks: 0, dunk: null }));
      this.ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, holder: -1, shot: null, touched: false, floor: false, last: -1, phase: 0 };
      this.score = [0, 0]; this.time = this.len; this.phase = 'countdown'; this.count = 3; this.deadT = 0; this.next = 0;
      this.events = []; this.stats = { shots: [0, 0], made: [0, 0], steals: [0, 0], blocks: [0, 0], rebounds: [0, 0] };
      this.reset(0, true);
    }
    /** both players in place, `team` has the ball (start: centre; after a basket: under that basket) */
    reset(team, start = false) {
      const [a, b] = this.players, B = this.ball;
      const me = this.players[team], other = this.players[1 - team];
      if (start) { a.x = -1.2; a.z = 0; b.x = 2.6; b.z = 0; }
      else {
        // the team that conceded starts under the basket just scored on (its own end)
        const end = -hoopX(team) * 0.9;
        me.x = end; me.z = (this.rand() - 0.5) * 2;
        other.x = end * 0.25; other.z = 0;
      }
      for (const p of this.players) { p.vx = p.vz = p.vy = 0; p.y = 0; p.charge = null; p.stun = 0; p.holdT = 0; p.dunk = null; p.yaw = Math.atan2(-(hoopX(p.team) - p.x), 0); }
      this.players[team].safeT = 0.8;
      B.holder = team; B.shot = null; B.vx = B.vy = B.vz = 0; B.touched = false; B.floor = false; B.last = team;
      this.syncHeld(0);
    }
    ev(t, o = {}) { this.events.push(Object.assign({ t }, o)); }
    get over() { return this.phase === 'over'; }

    step(dt, intents) {
      this.events.length = 0;
      if (this.phase === 'over') return this.events;
      if (this.phase === 'countdown') {
        const c0 = Math.ceil(this.count); this.count -= dt;
        if (Math.ceil(this.count) !== c0 && this.count > 0) this.ev('count', { n: Math.ceil(this.count) });
        if (this.count <= 0) { this.phase = 'play'; this.ev('go'); }
        this.syncHeld(dt);
        return this.events;
      }
      if (this.phase === 'dead') {                       // after a basket: the ball drops, then the other team inbounds
        this.deadT -= dt;
        ballPhysics(this.ball, dt, [], () => {});
        for (const p of this.players) this.movePlayer(p, { mx: 0, mz: 0 }, dt, true);
        if (this.deadT <= 0) { if (this.time <= 0) return this.finish(); this.reset(this.next); this.phase = 'play'; this.ev('inbound', { team: this.next }); }
        return this.events;
      }
      // the clock (a shot already in the air still counts)
      if (this.time > 0) { this.time = Math.max(0, this.time - dt); if (this.time === 0) this.ev('buzzer'); }
      if (this.time <= 0 && !this.liveShot()) return this.finish();
      for (const p of this.players) this.control(p, intents[p.team] || {}, dt);
      this.separate();
      this.updateBall(dt);
      return this.events;
    }
    liveShot() { const s = this.ball.shot; return !!(s && !s.done && this.ball.holder < 0 && (this.time > -4)); }
    finish() {
      if (this.phase === 'over') return this.events;
      this.phase = 'over';
      const [a, b] = this.score;
      this.result = a > b ? 'win' : a < b ? 'lose' : 'draw';
      this.ev('over', { result: this.result });
      return this.events;
    }

    /** one player: move, jump, shoot (hold / let go), steal */
    control(p, it, dt) {
      const B = this.ball, has = B.holder === p.team, opp = this.players[1 - p.team];
      p.stun = Math.max(0, p.stun - dt); p.stealCD = Math.max(0, p.stealCD - dt); p.jumpCD = Math.max(0, p.jumpCD - dt); p.safeT = Math.max(0, p.safeT - dt);
      if (has) p.holdT += dt; else p.holdT = 0;
      if (p.dunk) return this.stepDunk(p, dt);
      // a dunk ready, the ball, close to the hoop: SHOOT dunks
      if (has && it.shoot && p.charge === null && this.canDunk(p) && this.time > 0) return this.startDunk(p);
      // jump (a block, a rebound — or the jump of a jump shot)
      if (it.jump && p.y <= 0 && p.jumpCD <= 0 && p.stun <= 0) { p.vy = 3.6; p.jumpCD = 0.5; this.ev('jump', { team: p.team }); }
      // shooting: hold to load the meter, let go to shoot
      if (has && it.shoot && p.charge === null && this.time > 0) {
        p.charge = 0; if (p.y <= 0) p.vy = 3.2;           // up for the shot
        this.ev('load', { team: p.team });
      }
      if (p.charge !== null) {
        if (!has) p.charge = null;
        else {
          p.charge += dt;
          const m = p.charge / CHARGE;
          if (!it.shoot || m >= 1.3) this.release(p, m);
        }
      }
      // steal (offered right in front of the ball handler)
      if (it.steal && !has && B.holder === opp.team && p.stealCD <= 0 && p.stun <= 0) this.trySteal(p, opp);
      this.movePlayer(p, it, dt, false);
      // grab a loose ball (only if really there)
      if (B.holder < 0 && p.stun <= 0 && this.phase === 'play') {
        const sh = B.shot, protectedShot = sh && !sh.done && !B.touched && !(B.vy < 0 && B.y < 2.2);
        const reach = 2.25 + p.y;
        if (!protectedShot && Math.hypot(B.x - p.x, B.z - p.z) < 0.75 && B.y < reach) {
          const o = this.players[1 - p.team], od = Math.hypot(B.x - o.x, B.z - o.z);
          if (!(B.holder < 0 && od < Math.hypot(B.x - p.x, B.z - p.z) && od < 0.75 && o.stun <= 0)) this.take(p, sh && !sh.done ? 'rebound' : 'pickup');
        }
      }
    }
    movePlayer(p, it, dt, frozen) {
      const B = this.ball, has = B.holder === p.team;
      let mx = frozen ? 0 : it.mx || 0, mz = frozen ? 0 : it.mz || 0;
      const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
      let top = (has ? WITH_BALL : RUN) * (it.sprint ? SPRINT : 1) * (p.speedK || 1);
      if (p.charge !== null) top *= 0.25;
      if (p.stun > 0) top *= 0.35;
      if (p.y > 0) top *= 0.85;
      const tx = mx * top, tz = mz * top, k = Math.min(1, ACC * dt / Math.max(0.01, Math.hypot(tx - p.vx, tz - p.vz)));
      p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
      p.x = clamp(p.x + p.vx * dt, -AX + 0.4, AX - 0.4); p.z = clamp(p.z + p.vz * dt, -AZ + 0.4, AZ - 0.4);
      // jumping
      if (p.y > 0 || p.vy > 0) { p.vy -= G * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; } }
      // face: the hoop while shooting, the ball handler on defence, else where I run
      let fx = p.vx, fz = p.vz;
      if (p.charge !== null) { fx = hoopX(p.team) - p.x; fz = -p.z; }
      else if (B.holder >= 0 && B.holder !== p.team && Math.hypot(p.vx, p.vz) < 2.5) { const h = this.players[B.holder]; fx = h.x - p.x; fz = h.z - p.z; }
      if (Math.hypot(fx, fz) > 0.3) { const want = Math.atan2(-fx, -fz); const d = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)); p.yaw += d * Math.min(1, dt * 12); }
    }
    separate() {
      const [a, b] = this.players, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < PR * 2 && d > 1e-6) { const push = (PR * 2 - d) / 2; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
    }
    take(p, why) {
      const B = this.ball, sh = B.shot;
      if (sh && !sh.done) { sh.done = true; if (!sh.scored) { this.ev('miss', { team: sh.team }); this.streakEnd(sh.team); } }
      B.holder = p.team; B.shot = null; B.last = p.team; p.holdT = 0; p.safeT = 0.5;
      if (why === 'rebound') this.stats.rebounds[p.team]++;
      this.ev(why, { team: p.team });
    }
    /**
     * Can `team` steal right now? Only right in front of the ball handler: close, facing him,
     * on the side he is going (not from behind), he is not just after getting it, no cool-down.
     */
    stealable(team) {
      const B = this.ball, p = this.players[team], h = this.players[1 - team];
      if (this.phase !== 'play' || B.holder !== h.team || p.stealCD > 0 || p.stun > 0 || h.safeT > 0 || h.dunk) return false;
      const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.3 || d < 1e-3) return false;
      const facing = (-Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz) / d;               // I look at him
      const front = (-Math.sin(h.yaw) * -dx - Math.cos(h.yaw) * -dz) / d;              // I am in front of him
      return facing > 0.45 && front > 0.15;
    }
    trySteal(p, h) {
      const B = this.ball;
      if (!this.stealable(p.team)) { p.stealCD = 0.45; p.stun = 0.25; this.ev('stealMiss', { team: p.team }); return; }
      p.stealCD = 1.4;
      B.holder = p.team; B.last = p.team; h.charge = null; h.stun = 0.5; p.holdT = 0; p.safeT = 1.0;
      this.stats.steals[p.team]++;
      this.ev('steal', { team: p.team });
    }
    // ---- dunks
    canDunk(p) { return p.dunks > 0 && !p.dunk && p.y <= 0.05 && p.stun <= 0 && Math.hypot(hoopX(p.team) - p.x, p.z) < 2.7 && this.ball.holder === p.team; }
    startDunk(p) {
      const tx = hoopX(p.team);
      p.dunks--; p.charge = null;
      p.dunk = { t: 0, x0: p.x, z0: p.z, x1: tx - Math.sign(tx) * 0.5, z1: 0 };
      this.ev('dunkGo', { team: p.team });
    }
    stepDunk(p, dt) {
      const d = p.dunk, B = this.ball, tx = hoopX(p.team);
      d.t += dt;
      const k = Math.min(1, d.t / 0.45), e = k * k * (3 - 2 * k);
      p.x = d.x0 + (d.x1 - d.x0) * e; p.z = d.z0 + (d.z1 - d.z0) * e; p.vx = p.vz = 0;
      p.y = Math.sin(Math.min(1, d.t / 0.55) * Math.PI * 0.5) * 1.25; p.vy = 0;
      p.yaw = Math.atan2(-(tx - p.x), -(0 - p.z) || 1e-6);
      B.x = p.x + (tx - p.x) * e * 0.9; B.z = p.z * (1 - e); B.y = 2.2 + p.y + e * 0.4;
      if (d.t >= 0.55) {
        // through the rim: 2 points, no block possible
        B.holder = -1; B.x = tx; B.z = 0; B.y = RIM_Y - 0.15; B.vx = 0; B.vz = 0; B.vy = -3.5; B.touched = true; B.floor = false; B.last = p.team;
        B.shot = { team: p.team, target: Math.sign(tx), value: 2, done: true, scored: true, dunk: true };
        this.score[p.team] += 2; this.stats.made[p.team]++; this.stats.shots[p.team]++;
        this.stats.dunks = this.stats.dunks || [0, 0]; this.stats.dunks[p.team]++;
        this.ev('score', { team: p.team, value: 2, dunk: true });
        p.dunk = null; p.vy = -0.5;
        this.phase = 'dead'; this.deadT = 1.5; this.next = 1 - p.team;
      }
    }
    /** a basket: the streak grows (every 3 in a row: a dunk); a miss / block ends it */
    streakScore(team) {
      const p = this.players[team]; p.streak++;
      if (p.streak % 3 === 0) { p.dunks++; this.ev('dunkReady', { team, dunks: p.dunks }); }
    }
    streakEnd(team) { this.players[team].streak = 0; }
    /** let go of a loaded shot */
    release(p, meter) {
      const B = this.ball, opp = this.players[1 - p.team], tx = hoopX(p.team);
      p.charge = null;
      // where the feet were: 2 or 3 points
      const dist = Math.hypot(p.x - tx, p.z), value = dist > THREE_R ? 3 : 2;
      const fwx = Math.sign(tx - p.x) || 1;
      let ox = p.x + fwx * 0.25, oy = 2.15 + p.y, oz = p.z;
      // right under the rim: the lay-up goes up from a little out (no shooting from beneath the ring)
      const near = Math.hypot(ox - tx, oz);
      if (near < 1.1) { const ux = (ox - tx) / (near || 1) || -fwx, uz = oz / (near || 1); ox = tx + (near ? ux : -fwx) * 1.1; oz = near ? uz * 1.1 : 0; }
      // a defender in front of me (towards the hoop) puts a hand up
      const dx = opp.x - p.x, dz = opp.z - p.z, od = Math.hypot(dx, dz);
      const front = od > 0.01 ? ((tx - p.x) * dx + (-p.z) * dz) / (Math.hypot(tx - p.x, p.z) * od) : 0;
      const contest = front > 0.35 ? clamp((1.9 - od) / 1.9, 0, 1) * (opp.y > 0.2 ? 1.4 : 1) : 0;
      this.stats.shots[p.team]++;
      B.holder = -1; B.x = ox; B.y = oy; B.z = oz; B.touched = false; B.floor = false; B.last = p.team; B.fromBelow = 0;
      B.shot = { team: p.team, target: Math.sign(tx), value, done: false, scored: false, meter, dist, t: 0 };
      // a block: the defender in the air, right there
      const air = opp.y > 0.25, standing = !air && od < 0.85 && front > 0.6;
      if ((air && od < 1.3 && front > 0.35 && this.rand() < clamp(0.3 + 0.55 * (1 - od / 1.3) * (opp.blockSkill || 1), 0, 0.9)) || (standing && this.rand() < 0.18 * (opp.blockSkill || 1))) {
        B.vx = -fwx * (1 + this.rand() * 1.5); B.vy = -0.5 - this.rand(); B.vz = (this.rand() - 0.5) * 3; B.touched = true;
        B.shot.done = true; this.stats.blocks[opp.team]++; this.streakEnd(p.team);
        this.ev('block', { team: opp.team });
        return;
      }
      const v = shotVelocity({ x: ox, y: oy, z: oz, tx, meter, skill: p.skill, moving: Math.hypot(p.vx, p.vz) / RUN, contest }, this.rand);
      B.vx = v.vx; B.vy = v.vy; B.vz = v.vz;
      this.ev('shot', { team: p.team, value, meter, timing: v.timing, contest });
    }
    updateBall(dt) {
      const B = this.ball;
      if (B.holder >= 0) return this.syncHeld(dt);
      const ev = [];
      ballPhysics(B, dt, ev, (sx) => {
        const sh = B.shot;
        if (sh && !sh.done && !sh.scored && sh.target === sx && B.fromBelow !== sx) {
          sh.scored = true; sh.done = true;
          this.score[sh.team] += sh.value; this.stats.made[sh.team]++;
          this.ev('score', { team: sh.team, value: sh.value });
          this.streakScore(sh.team);
          this.phase = 'dead'; this.deadT = 1.5; this.next = 1 - sh.team;
        }
      });
      for (const e of ev) this.events.push(e);
      const sh = B.shot;
      if (sh && !sh.done && B.floor) { sh.done = true; this.ev('miss', { team: sh.team }); this.streakEnd(sh.team); }
      // a hand on the ball just after it left (a block in the air)
      if (sh && !sh.done && !sh.dunk && (sh.t = (sh.t || 0) + dt) < 0.4 && !B.touched) {
        const o = this.players[1 - sh.team];
        if (o.y > 0.2 && Math.hypot(B.x - o.x, B.z - o.z) < 0.55 && Math.abs(B.y - (2.3 + o.y)) < 0.5) {
          B.vx = -B.vx * 0.3 + (this.rand() - 0.5) * 2; B.vy = -1 - this.rand(); B.vz = (this.rand() - 0.5) * 3; B.touched = true;
          sh.done = true; this.stats.blocks[o.team]++; this.streakEnd(sh.team);
          this.ev('block', { team: o.team });
        }
      }
      // a ball resting on the rim / the board: knock it off
      if (B.y > 2.5 && Math.hypot(B.vx, B.vy, B.vz) < 0.4) { B.still = (B.still || 0) + dt; if (B.still > 0.8) { B.vx += (this.rand() - 0.5) * 2; B.vz += (this.rand() - 0.5) * 2; B.vy = 0.5; B.still = 0; } } else B.still = 0;
    }
    /** a held ball: dribbled at the hand (or up at the head while loading a shot) */
    syncHeld(dt) {
      const B = this.ball; if (B.holder < 0) return;
      const p = this.players[B.holder];
      if (p.dunk) return;
      B.phase += dt * (6 + Math.hypot(p.vx, p.vz) * 0.9);
      const fwx = -Math.sin(p.yaw), fwz = -Math.cos(p.yaw), rx = -fwz, rz = fwx;
      if (p.charge !== null) { B.x = p.x + fwx * 0.3; B.z = p.z + fwz * 0.3; B.y = 2.0 + p.y + Math.min(1, p.charge / CHARGE) * 0.15; }
      else { B.x = p.x + fwx * 0.42 + rx * 0.3; B.z = p.z + fwz * 0.42 + rz * 0.3; B.y = BALL_R + Math.abs(Math.sin(B.phase)) * 0.85; }
      B.x = clamp(B.x, -AX + BALL_R, AX - BALL_R); B.z = clamp(B.z, -AZ + BALL_R, AZ - BALL_R);
      B.vx = p.vx; B.vz = p.vz; B.vy = 0;
    }
  }

  // ------------------------------------------------------------------ the computer player
  const LEVELS = {
    //        speed · reaction (s) · aim spread · release timing spread · steal tries/s · steal skill · block · shot choice (min chance) · 3s · reads rebounds
    easy:   { speed: 0.8, react: 0.42, skill: 1.55, timing: 0.17, steals: 0.35, stealSkill: 0.22, block: 0.6, pick: 0.3, three: 0.15, rebound: 0.55 },
    normal: { speed: 0.9, react: 0.28, skill: 1.15, timing: 0.1, steals: 0.6, stealSkill: 0.3, block: 0.85, pick: 0.42, three: 0.3, rebound: 0.8 },
    hard:   { speed: 0.97, react: 0.17, skill: 0.85, timing: 0.055, steals: 0.9, stealSkill: 0.36, block: 1, pick: 0.5, three: 0.45, rebound: 1 },
  };
  /** rough chance of making a shot from distance d with a contest (0..1) — for choosing shots */
  function makeChance(d, contest = 0) { return clamp(0.92 - d * 0.085 - contest * 0.35, 0.05, 0.92); }

  class Brain {
    constructor(match, team, level = 'normal', rand = Math.random) {
      this.m = match; this.team = team; this.L = LEVELS[level] || LEVELS.normal; this.rand = rand;
      const p = match.players[team];
      p.speedK = this.L.speed; p.skill = this.L.skill; p.stealSkill = this.L.stealSkill; p.blockSkill = this.L.block;
      this.t = 0; this.goal = { x: p.x, z: p.z }; this.side = rand() < 0.5 ? -1 : 1; this.releaseAt = null; this.jumpT = -1;
      this.intent = { mx: 0, mz: 0, sprint: false, shoot: false, steal: false, jump: false };
    }
    /** a guess of where a loose ball will be when it is low enough to take */
    landing() {
      const b = Object.assign({}, this.m.ball);
      for (let i = 0; i < 80; i++) { ballPhysics(b, 0.025, [], () => {}); if (b.y < 1.8 && b.vy <= 0) break; }
      return b;
    }
    think(dt) {
      const m = this.m, p = m.players[this.team], o = m.players[1 - this.team], B = m.ball, L = this.L, it = this.intent;
      it.steal = false; it.jump = false;
      const myHoop = hoopX(this.team), oppHoop = hoopX(o.team);
      // keep loading a shot until the chosen moment on the meter
      if (p.charge !== null) { it.shoot = p.charge / CHARGE < this.releaseAt; it.mx = it.mz = 0; return it; }
      this.t -= dt;
      if (this.jumpT >= 0) { this.jumpT -= dt; if (this.jumpT < 0) it.jump = true; }
      if (this.t > 0) return it;
      this.t = L.react * (0.7 + this.rand() * 0.6);
      it.shoot = false; it.sprint = false;
      const go = (x, z, sprint = false) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); it.mx = d > 0.15 ? dx / d * Math.min(1, d) : 0; it.mz = d > 0.15 ? dz / d * Math.min(1, d) : 0; it.sprint = sprint; };
      if (B.holder === this.team) {
        // ATTACK
        const d = Math.hypot(p.x - myHoop, p.z), od = Math.hypot(o.x - p.x, o.z - p.z);
        const between = ((myHoop - p.x) * (o.x - p.x) + (-p.z) * (o.z - p.z)) > 0 && od < 2.2;
        const contest = between ? clamp((1.9 - od) / 1.9, 0, 1) : 0;
        const chance = makeChance(d, contest) / L.skill;
        const three = d > THREE_R + 0.2 && d < THREE_R + 1.6 && !between && this.rand() < L.three;
        const late = p.holdT > 7 || (m.time < 3 && m.time > 0);
        if (m.canDunk(p)) { it.shoot = true; it.mx = it.mz = 0; return it; }          // a dunk ready and close: dunk it
        if (p.dunks > 0 && d < 6 && !late) { go(myHoop - Math.sign(myHoop) * 1.6, 0, true); return it; }   // a dunk ready: drive in for it
        if (d < 1.9 || three || late || (d < THREE_R && chance > L.pick && !between) || (d < 3.2 && this.rand() < 0.35)) {
          it.shoot = true; this.releaseAt = SWEET + gauss(this.rand) * L.timing; it.mx = it.mz = 0;
          return it;
        }
        // drive to the hoop, around the defender
        let tx = myHoop - Math.sign(myHoop) * 1.0, tz = 0;
        if (between) { if (Math.abs(o.z - p.z) < 0.9 && this.rand() < 0.3) this.side = -Math.sign(o.z - p.z) || this.side; tz = this.side * 2.2; tx = p.x + Math.sign(myHoop) * 2.5; }
        // never past the hoop (behind the board): come back out in front of it
        const sg = Math.sign(myHoop);
        if (tx * sg > Math.abs(myHoop) - 0.8) tx = sg * (Math.abs(myHoop) - 0.8);
        if (p.x * sg > Math.abs(myHoop) - 0.3) { tx = sg * (Math.abs(myHoop) - 2.5); tz = p.z * 0.5; }
        go(tx, tz, d > 7);
      } else if (B.holder === o.team) {
        // DEFENCE: between the ball handler and my basket, a hand in (sometimes)
        const gx = o.x + (oppHoop - o.x) / Math.max(0.1, Math.hypot(oppHoop - o.x, o.z)) * 1.25, gz = o.z + (-o.z) / Math.max(0.1, Math.hypot(oppHoop - o.x, o.z)) * 1.25;
        go(gx, gz, Math.hypot(gx - p.x, gz - p.z) > 3);
        const od = Math.hypot(o.x - p.x, o.z - p.z);
        if (m.stealable(this.team) && this.rand() < 0.25 + 0.6 * L.steals) it.steal = true;
        if (o.charge !== null && od < 2.0 && this.jumpT < 0 && this.rand() < 0.2 + 0.3 * L.block) this.jumpT = 0.05 + this.rand() * L.react;
      } else {
        // LOOSE BALL / a shot in the air: go where it comes down (or back on defence)
        const sh = B.shot, mine = sh && !sh.done && sh.team === this.team;
        const land = this.landing();
        if (mine && this.rand() > L.rebound) go(myHoop - Math.sign(myHoop) * 4, 0);
        else go(land.x, land.z, true);
      }
      return it;
    }
  }

  const API = { HoopMatch, Brain, LEVELS, ballPhysics, shotVelocity, solveShot, makeChance, hoopX,
    CL, CW, HCL, HCW, HOOP_X, RIM_Y, RIM_R, BALL_R, BOARD_X, BOARD_HZ, BOARD_Y0, BOARD_Y1, BOARD_T, THREE_R, AX, AZ, CHARGE, SWEET, SWEET_W };
  if (typeof VR !== 'undefined') VR.Hoops = API;
  if (typeof module !== 'undefined') module.exports = API;
})();
