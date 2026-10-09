/* =====================================================================
 * POOL SIMULATION + EIGHT-BALL RULES (no rendering; plain numbers).
 * Used by the billiards world (js/mini/billiards.js), by its AI to try
 * shots before taking them, and by the tests (it also runs in node).
 *
 *   Table (an 8-ft table, metres): playing surface L × W, x along the
 *   length, z across. Six pockets: four corners, two in the middle of the
 *   long rails. Balls: radius R.
 *
 *   PoolSim
 *     rack()                cue ball on the head spot, 15 balls in a triangle
 *     strike(angle, speed)  hit the cue ball (angle in the table plane, rad)
 *     step(dt)              advance (fixed small steps inside): moves, ball-ball
 *                           collisions, cushions, pocket jaws, pockets, friction.
 *                           Returns events: {t:'ball',a,b,v} {t:'rail',n,v} {t:'pocket',n,p}
 *     moving()              is anything still rolling
 *     clone()               an independent copy (the AI plays shots on it)
 *
 *   EightBall (simplified, understandable 8-ball)
 *     beginShot() / note(event) / endShot()  →  what happened + whose turn
 *     - break: the player breaks; the table stays OPEN after the break.
 *     - the first ball legally pocketed after the break gives its group
 *       (solids 1-7 / stripes 9-15) to the shooter.
 *     - fouls: cue ball pocketed (scratch), no ball hit, wrong ball hit first,
 *       no ball hit a cushion after contact (and nothing pocketed).
 *       A foul gives the opponent BALL IN HAND (anywhere on the table).
 *     - you keep shooting when you legally pocket one of your balls (on the
 *       open table: any ball but the 8). Pocketing only the opponent's balls
 *       ends your turn.
 *     - the 8: pocketed legally after your group is cleared = WIN. Pocketed
 *       earlier, on an open table, or on a foul (e.g. with the cue ball) = LOSS.
 *       Pocketed on the break: it is put back on its spot.
 * ===================================================================== */
(function () {
  const L = 2.24, W = 1.12, R = 0.0286;
  const HL = L / 2, HW = W / 2;
  const MOUTH_C = 0.088;            // corner pocket opening, along each rail from the corner
  const MOUTH_S = 0.062;            // side pocket half-opening
  const ROLL_A = 0.22, ROLL_K = 0.13;      // deceleration: constant + per speed (m/s², 1/s)
  const E_BALL = 0.95, E_RAIL = 0.76, RAIL_GRIP = 0.95, E_JAW = 0.55;
  const STOP = 0.006;
  const FIX = 1 / 240;              // simulation step (s)
  const POCKETS = [
    { x: -HL - 0.02, z: -HW - 0.02, r: 0.065, k: 'c' }, { x: 0, z: -HW - 0.035, r: 0.06, k: 's' }, { x: HL + 0.02, z: -HW - 0.02, r: 0.065, k: 'c' },
    { x: -HL - 0.02, z: HW + 0.02, r: 0.065, k: 'c' }, { x: 0, z: HW + 0.035, r: 0.06, k: 's' }, { x: HL + 0.02, z: HW + 0.02, r: 0.065, k: 'c' },
  ];
  // the pocket jaws: corner points where a cushion ends (a ball glancing them bounces off)
  const JAWS = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { JAWS.push([sx * HL, sz * (HW - MOUTH_C)], [sx * (HL - MOUTH_C), sz * HW]); }
  for (const sz of [-1, 1]) JAWS.push([-MOUTH_S, sz * HW], [MOUTH_S, sz * HW]);
  const HEAD = { x: -L / 4, z: 0 }, FOOT = { x: L / 4, z: 0 };
  const groupOf = (n) => (n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');

  class PoolSim {
    constructor() { this.balls = []; this.acc = 0; for (let n = 0; n <= 15; n++) this.balls.push({ n, x: 0, z: 0, vx: 0, vz: 0, on: true }); }
    get cue() { return this.balls[0]; }
    ball(n) { return this.balls[n]; }
    /** the standard rack: apex on the foot spot, 8 in the middle, a solid and a stripe in the back corners */
    rack(rand = Math.random) {
      const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
      // shuffle everything but the 8 (middle of row 3), keeping one solid + one stripe in the back corners
      const rest = order.filter(n => n !== 8);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
      const slots = [];
      const dx = R * 2 * Math.cos(Math.PI / 6) + 0.0004, dz = R * 2 + 0.0004;
      for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) slots.push({ x: FOOT.x + row * dx, z: (k - row / 2) * dz, row, k });
      const place = new Array(15);
      place[4] = 8;                                          // row 3, middle
      // back corners: one of each group
      const sIdx = rest.findIndex(n => n < 8), solid = rest.splice(sIdx, 1)[0];
      const tIdx = rest.findIndex(n => n > 8), stripe = rest.splice(tIdx, 1)[0];
      place[10] = rand() < 0.5 ? solid : stripe; place[14] = place[10] === solid ? stripe : solid;
      for (let i = 0; i < 15; i++) if (place[i] === undefined) place[i] = rest.shift();
      for (const b of this.balls) { b.vx = b.vz = 0; b.on = true; }
      slots.forEach((s, i) => { const b = this.balls[place[i]]; b.x = s.x; b.z = s.z; });
      this.cue.x = HEAD.x; this.cue.z = 0;
      this.acc = 0;
    }
    strike(angle, speed) { const c = this.cue; c.vx = Math.cos(angle) * speed; c.vz = Math.sin(angle) * speed; }
    moving() { for (const b of this.balls) if (b.on && (b.vx || b.vz)) return true; return false; }
    clone() {
      const s = new PoolSim();
      s.balls = this.balls.map(b => Object.assign({}, b)); s.acc = 0;
      return s;
    }
    /** is (x, z) a free spot for the cue ball (on the cloth, not touching a ball) */
    freeSpot(x, z, region = null) {
      if (Math.abs(x) > HL - R - 0.002 || Math.abs(z) > HW - R - 0.002) return false;
      if (region === 'kitchen' && x > HEAD.x) return false;
      for (const b of this.balls) if (b.on && b.n !== 0 && (b.x - x) ** 2 + (b.z - z) ** 2 < (2 * R + 0.003) ** 2) return false;
      return true;
    }
    /** put a pocketed ball back on the foot spot (or the nearest free spot behind it) */
    respot(n) {
      const b = this.balls[n];
      for (let k = 0; k < 60; k++) {
        const x = FOOT.x + k * 0.012, z = 0;
        if (this.freeAny(x, z, n)) { b.x = x; b.z = z; b.vx = b.vz = 0; b.on = true; return; }
      }
      b.x = FOOT.x; b.z = 0; b.on = true;
    }
    freeAny(x, z, skip) { for (const b of this.balls) if (b.on && b.n !== skip && (b.x - x) ** 2 + (b.z - z) ** 2 < (2 * R + 0.002) ** 2) return false; return true; }

    /** advance by dt (in fixed steps); returns what happened */
    step(dt) {
      const ev = [];
      this.acc += dt;
      let guard = 0;
      while (this.acc >= FIX && guard++ < 400) { this.acc -= FIX; this.tick(FIX, ev); }
      return ev;
    }
    tick(h, ev) {
      const B = this.balls;
      let vmax = 0;
      for (const b of B) if (b.on) vmax = Math.max(vmax, Math.abs(b.vx) + Math.abs(b.vz));
      if (vmax === 0) return;
      const n = Math.min(12, Math.max(1, Math.ceil(vmax * h / (R * 0.35)))), s = h / n;
      for (let it = 0; it < n; it++) {
        for (const b of B) if (b.on) { b.x += b.vx * s; b.z += b.vz * s; }
        // ball - ball
        for (let i = 0; i < 16; i++) {
          const a = B[i]; if (!a.on) continue;
          for (let j = i + 1; j < 16; j++) {
            const b = B[j]; if (!b.on) continue;
            let dx = b.x - a.x, dz = b.z - a.z; const d2 = dx * dx + dz * dz;
            if (d2 >= 4 * R * R) continue;
            let d = Math.sqrt(d2); if (d < 1e-9) { dx = 1; dz = 0; d = 1e-9; }
            const nx = dx / d, nz = dz / d;
            const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (rel > 0) {
              const j2 = (1 + E_BALL) / 2 * rel;
              a.vx -= j2 * nx; a.vz -= j2 * nz; b.vx += j2 * nx; b.vz += j2 * nz;
              ev.push({ t: 'ball', a: a.n, b: b.n, v: rel });
            }
            const push = (2 * R - d) / 2 + 1e-6;
            a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
          }
        }
        for (const b of B) if (b.on) this.edges(b, ev);
      }
      // rolling friction
      for (const b of B) {
        if (!b.on) continue;
        const sp = Math.hypot(b.vx, b.vz); if (!sp) continue;
        const dec = (ROLL_A + ROLL_K * sp) * h;
        if (sp - dec <= STOP) { b.vx = b.vz = 0; } else { const k = (sp - dec) / sp; b.vx *= k; b.vz *= k; }
      }
    }
    /** cushions (with the pocket openings left out), the jaws, the pockets */
    edges(b, ev) {
      const XL = HL - R, ZW = HW - R;
      // end rails (x = ±L/2), except at the corner openings
      if (Math.abs(b.x) > XL && Math.abs(b.z) < HW - MOUTH_C && b.x * b.vx > 0) {
        const v = Math.abs(b.vx);
        b.x = Math.sign(b.x) * (XL - (Math.abs(b.x) - XL)); b.vx = -b.vx * E_RAIL; b.vz *= RAIL_GRIP;
        ev.push({ t: 'rail', n: b.n, v });
      }
      // long rails (z = ±W/2), except the corner and side openings
      if (Math.abs(b.z) > ZW && Math.abs(b.x) < HL - MOUTH_C && Math.abs(b.x) > MOUTH_S && b.z * b.vz > 0) {
        const v = Math.abs(b.vz);
        b.z = Math.sign(b.z) * (ZW - (Math.abs(b.z) - ZW)); b.vz = -b.vz * E_RAIL; b.vx *= RAIL_GRIP;
        ev.push({ t: 'rail', n: b.n, v });
      }
      // the jaws (the cushion noses at each opening)
      for (const [jx, jz] of JAWS) {
        const dx = b.x - jx, dz = b.z - jz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R * 0.96) continue;
        const d = Math.sqrt(d2) || 1e-9, nx = dx / d, nz = dz / d;
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= (1 + E_JAW) * vn * nx; b.vz -= (1 + E_JAW) * vn * nz; ev.push({ t: 'rail', n: b.n, v: -vn }); }
        b.x = jx + nx * R; b.z = jz + nz * R;
      }
      // the pockets: inside a pocket's circle, or through an opening past the cushion line
      let p = -1;
      for (let i = 0; i < 6; i++) { const P = POCKETS[i]; if ((b.x - P.x) ** 2 + (b.z - P.z) ** 2 < P.r * P.r) { p = i; break; } }
      if (p < 0 && (Math.abs(b.x) > HL + R * 0.3 || Math.abs(b.z) > HW + R * 0.3)) {
        let best = 1e9; for (let i = 0; i < 6; i++) { const P = POCKETS[i], d = (b.x - P.x) ** 2 + (b.z - P.z) ** 2; if (d < best) { best = d; p = i; } }
      }
      if (p >= 0) {
        const v = Math.hypot(b.vx, b.vz);
        b.on = false; b.vx = b.vz = 0; b.x = POCKETS[p].x; b.z = POCKETS[p].z;
        ev.push({ t: 'pocket', n: b.n, p, v });
      }
    }
  }

  /** where the cue ball first meets a ball (or a cushion) going along `angle` — for the aiming guide */
  function firstContact(sim, angle) {
    const c = sim.cue, dx = Math.cos(angle), dz = Math.sin(angle);
    let best = null;
    for (const b of sim.balls) {
      if (!b.on || b.n === 0) continue;
      const fx = c.x - b.x, fz = c.z - b.z;
      const bb = fx * dx + fz * dz, cc = fx * fx + fz * fz - 4 * R * R;
      const disc = bb * bb - cc; if (disc < 0) continue;
      const t = -bb - Math.sqrt(disc);
      if (t > 1e-6 && (!best || t < best.t)) best = { t, n: b.n };
    }
    // the cushion line (where the guide stops when no ball is in the way)
    const XL = HL - R, ZW = HW - R;
    const tx = dx > 0 ? (XL - c.x) / dx : dx < 0 ? (-XL - c.x) / dx : Infinity;
    const tz = dz > 0 ? (ZW - c.z) / dz : dz < 0 ? (-ZW - c.z) / dz : Infinity;
    const tw = Math.max(0, Math.min(tx, tz));
    if (!best || tw < best.t) return { t: tw, n: -1, x: c.x + dx * tw, z: c.z + dz * tw };
    const gx = c.x + dx * best.t, gz = c.z + dz * best.t, ob = sim.balls[best.n];
    const nx = ob.x - gx, nz = ob.z - gz, nl = Math.hypot(nx, nz) || 1;
    return { t: best.t, n: best.n, x: gx, z: gz, ox: nx / nl, oz: nz / nl };
  }

  // ------------------------------------------------------------------ rules
  class EightBall {
    constructor() { this.reset(); }
    reset() {
      this.turn = 0;                     // 0 = the player, 1 = the opponent
      this.groups = [null, null];        // 'solid' | 'stripe'
      this.isBreak = true; this.inHand = 'kitchen';   // the break: cue ball anywhere behind the head string
      this.over = null;                  // { winner, reason }
      this.potted = new Set();           // object balls off the table
      this.shot = null;
    }
    get open() { return !this.groups[0]; }
    left(side, sim) {
      const g = this.groups[side]; if (!g) return 7;
      let n = 0; for (let k = 1; k <= 15; k++) if (groupOf(k) === g && sim.balls[k].on) n++;
      return n;
    }
    /** the balls `side` may hit first right now */
    targets(side, sim) {
      const out = [];
      if (this.isBreak) { for (let k = 1; k <= 15; k++) if (sim.balls[k].on) out.push(k); return out; }
      const g = this.groups[side];
      if (!g) { for (let k = 1; k <= 15; k++) if (k !== 8 && sim.balls[k].on) out.push(k); return out.length ? out : [8]; }
      for (let k = 1; k <= 15; k++) if (groupOf(k) === g && sim.balls[k].on) out.push(k);
      return out.length ? out : [8];
    }
    beginShot(sim) {
      this.shot = { first: null, rail: false, potted: [], scratch: false, cleared: this.groups[this.turn] ? this.left(this.turn, sim) === 0 : false };
    }
    note(e) {
      const s = this.shot; if (!s) return;
      if (e.t === 'ball' && s.first === null && (e.a === 0 || e.b === 0)) s.first = e.a === 0 ? e.b : e.a;
      else if (e.t === 'rail' && s.first !== null) s.rail = true;
      else if (e.t === 'pocket') { if (e.n === 0) s.scratch = true; else { s.potted.push(e.n); this.potted.add(e.n); } }
    }
    /** the balls stopped: judge the shot. Returns { foul, msg, keep, assigned, over, respot8 } */
    endShot(sim) {
      const s = this.shot, me = this.turn, opp = 1 - me, out = { foul: null, keep: false, assigned: null, over: null, respot8: false, potted: s.potted.slice() };
      const myG = this.groups[me];
      const objs = s.potted.filter(n => n !== 8), eight = s.potted.includes(8);
      // fouls
      if (s.first === null) out.foul = 'noHit';
      else if (!this.isBreak) {
        if (myG) { const want = s.cleared ? 'eight' : myG; if (groupOf(s.first) !== want) out.foul = 'wrongFirst'; }
        else if (s.first === 8) out.foul = 'eightFirst';
      }
      if (s.scratch) out.foul = 'scratch';
      if (!out.foul && !s.potted.length && !s.rail && !this.isBreak) out.foul = 'noRail';
      // the 8
      if (eight) {
        if (this.isBreak) { out.respot8 = true; sim.respot(8); this.potted.delete(8); }
        else if (myG && s.cleared && !out.foul) out.over = { winner: me, reason: 'won8' };
        else out.over = { winner: opp, reason: out.foul ? 'eightFoul' : 'eightEarly' };
      }
      // groups: the first ball legally pocketed after the break
      if (!out.over && this.open && !this.isBreak && !out.foul && objs.length) {
        const g = groupOf(objs[0]);
        this.groups[me] = g; this.groups[opp] = g === 'solid' ? 'stripe' : 'solid';
        out.assigned = g;
      }
      // a group may have been cleared by a foul's pocketing — it does not matter here; the 8 decides
      if (!out.over) {
        const mine = this.groups[me];
        if (!out.foul) {
          if (this.isBreak) out.keep = objs.length > 0;
          else if (!mine) out.keep = false;
          else out.keep = objs.some(n => groupOf(n) === mine);
          if (!out.keep && objs.length && mine && objs.every(n => groupOf(n) !== mine)) out.msg = 'oppBall';
        }
        if (out.foul || !out.keep) this.turn = opp;
        this.inHand = out.foul ? 'table' : null;
      } else { this.over = out.over; this.inHand = null; }
      this.isBreak = false;
      this.shot = null;
      return out;
    }
  }

  // ------------------------------------------------------------------ the computer player
  /** speed a ball needs now to still roll at vEnd after d metres (the same friction as the table) */
  function needSpeed(d, vEnd = 0) {
    let v = Math.max(vEnd, 0.02);
    for (let s = 0; s < d; s += 0.01) v += (ROLL_A + ROLL_K * v) / v * 0.01;
    return v;
  }
  const SKILL = {
    //        aim noise (rad) · power noise · chance of a bad shot · picks the best shot · tries a safety when nothing goes
    easy:   { aim: 0.016, power: 0.16, blunder: 0.22, best: 0.35, safety: false },
    normal: { aim: 0.0075, power: 0.09, blunder: 0.08, best: 0.75, safety: true },
    hard:   { aim: 0.003, power: 0.045, blunder: 0.02, best: 1, safety: true },
  };
  function gauss(rand) { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /**
   * The AI thinks like a player: for each ball it may hit and each pocket it finds the
   * "ghost ball" spot, checks the cut, estimates the speed, then PLAYS the shot on a copy of
   * the table to see whether it really goes in without a foul. It keeps the best one and
   * finally adds its own aiming / power error (by skill). With ball in hand it also chooses
   * where to put the cue ball. Work is done a few shots at a time (step()) so the game
   * never stalls while it thinks.
   */
  class Planner {
    constructor(sim, rules, side, level = 'normal', rand = Math.random) {
      this.sim = sim; this.rules = rules; this.side = side; this.sk = SKILL[level] || SKILL.normal; this.rand = rand;
      this.cands = []; this.i = 0; this.done = false; this.result = null; this.good = [];
      this.build();
    }
    build() {
      const sim = this.sim, R2 = 2 * R, hand = this.rules.inHand;
      const targets = this.rules.targets(this.side, sim);
      if (this.rules.isBreak) {          // the break: from the head spot, full speed into the rack
        const z = (this.rand() - 0.5) * 0.3, apex = sim.balls.filter(b => b.on && b.n).reduce((a, b) => (b.x < a.x ? b : a));
        this.result = { place: hand ? { x: HEAD.x, z } : null, angle: Math.atan2(apex.z - (hand ? z : sim.cue.z), apex.x - (hand ? HEAD.x : sim.cue.x)), speed: 6.8, kind: 'break' };
        this.done = true; return;
      }
      for (const n of targets) {
        const t = sim.balls[n];
        for (const P of POCKETS) {
          const ax = P.x * 0.985, az = P.z * 0.985;                       // a little inside the pocket mouth
          const dx = ax - t.x, dz = az - t.z, d2 = Math.hypot(dx, dz), ux = dx / d2, uz = dz / d2;
          const gx = t.x - ux * R2, gz = t.z - uz * R2;
          const places = [];
          if (hand) {                                                       // put the cue ball behind the ghost ball
            for (const back of [0.25, 0.45]) {
              const px = gx - ux * back, pz = gz - uz * back;
              if (sim.freeSpot(px, pz, hand === 'kitchen' ? 'kitchen' : null)) places.push({ x: px, z: pz });
            }
            if (!places.length) continue;
          } else places.push(null);
          for (const pl of places) {
            const cx = pl ? pl.x : sim.cue.x, cz = pl ? pl.z : sim.cue.z;
            const ex = gx - cx, ez = gz - cz, d1 = Math.hypot(ex, ez);
            if (d1 < 0.02) continue;
            const cut = (ex * ux + ez * uz) / d1;                           // cos of the cut angle
            if (cut < 0.2) continue;
            const vObj = needSpeed(d2, 0.55), vc = vObj / (cut * (1 + E_BALL) / 2), v0 = needSpeed(d1, vc);
            for (const k of [1.1, 1.5]) this.cands.push({ n, place: pl, angle: Math.atan2(ez, ex), speed: Math.min(6.5, Math.max(0.45, v0 * k)), cut, d: d1 + d2, kind: 'pot' });
          }
        }
      }
      // safeties: just hit one of my balls full, softly (no foul), if nothing goes in
      for (const n of targets) {
        const t = sim.balls[n];
        const cx = hand ? null : sim.cue.x;
        if (hand) continue;
        const ang = Math.atan2(t.z - sim.cue.z, t.x - cx);
        for (const v of [1.6, 2.6]) this.cands.push({ n, place: null, angle: ang, speed: v, cut: 1, d: 1, kind: 'safe' });
      }
      if (!this.cands.length) {                                             // nothing at all: hit the nearest legal ball
        let best = null;
        for (const n of targets) { const t = sim.balls[n], d = Math.hypot(t.x - sim.cue.x, t.z - sim.cue.z); if (!best || d < best.d) best = { n, d }; }
        const t = best ? sim.balls[best.n] : sim.balls[8];
        let place = null;
        if (hand) { place = this.anyFree(); }
        const cx = place ? place.x : sim.cue.x, cz = place ? place.z : sim.cue.z;
        this.result = { place, angle: Math.atan2(t.z - cz, t.x - cx), speed: 2.4, kind: 'desperate' };
        this.done = true;
      }
    }
    anyFree() {
      for (let k = 0; k < 200; k++) { const x = (this.rand() - 0.5) * (L - 0.2), z = (this.rand() - 0.5) * (W - 0.2); if (this.sim.freeSpot(x, z, this.rules.inHand === 'kitchen' ? 'kitchen' : null)) return { x, z }; }
      return { x: HEAD.x, z: 0 };
    }
    /** play one candidate on a copy of the table: did it work? */
    tryShot(c) {
      const s = this.sim.clone(), r = this.rules.clone();
      if (c.place) { s.cue.x = c.place.x; s.cue.z = c.place.z; s.cue.on = true; }
      r.beginShot(s); s.strike(c.angle, c.speed);
      for (let t = 0; t < 20 && s.moving(); t += 0.05) for (const e of s.step(0.05)) r.note(e);
      const out = r.endShot(s);
      const lose = out.over && out.over.winner !== this.side, win = out.over && out.over.winner === this.side;
      const potted = out.potted.includes(c.n);
      let score = -10;
      if (win) score = 100;
      else if (!lose && !out.foul) {
        if (c.kind === 'pot' && potted && out.keep) {
          // easier & softer shots first, and a cue ball that is not about to drop
          score = 10 + c.cut * 3 - c.d * 0.8 - c.speed * 0.25;
          const nxt = r.targets(this.side, s).length;
          if (nxt) score += 1;
        } else score = c.kind === 'safe' ? 1 - c.speed * 0.1 : 0;
      }
      return score;
    }
    /** think a little (up to `budget` shots); true when decided */
    step(budget = 8) {
      if (this.done) return true;
      for (let k = 0; k < budget && this.i < this.cands.length; k++, this.i++) {
        const c = this.cands[this.i]; c.score = this.tryShot(c);
      }
      if (this.i < this.cands.length) return false;
      const ok = this.cands.filter(c => c.score >= 10).sort((a, b) => b.score - a.score);
      const safe = this.cands.filter(c => c.score > -10 && c.score < 10).sort((a, b) => b.score - a.score);
      let pick = null;
      if (ok.length) pick = this.rand() < this.sk.best ? ok[0] : ok[Math.floor(this.rand() * Math.min(ok.length, 4))];
      else if (safe.length && this.sk.safety) pick = safe[0];
      else pick = this.cands.slice().sort((a, b) => b.score - a.score)[0];
      this.result = { place: pick.place, angle: pick.angle, speed: pick.speed, kind: pick.kind, n: pick.n, expect: pick.score };
      this.done = true;
      return true;
    }
    /** the shot actually taken: the plan plus a human amount of error */
    final() {
      const r = this.result, sk = this.sk, bad = this.rand() < sk.blunder ? 4 : 1;
      if (r.kind === 'break') return Object.assign({}, r, { angle: r.angle + gauss(this.rand) * 0.004, speed: r.speed * (1 + gauss(this.rand) * 0.03) });
      return Object.assign({}, r, { angle: r.angle + gauss(this.rand) * sk.aim * bad, speed: Math.max(0.3, Math.min(6.8, r.speed * (1 + gauss(this.rand) * sk.power * bad))) });
    }
  }
  EightBall.prototype.clone = function () {
    const r = new EightBall();
    r.turn = this.turn; r.groups = this.groups.slice(); r.isBreak = this.isBreak; r.inHand = this.inHand; r.over = this.over; r.potted = new Set(this.potted);
    return r;
  };

  const API = { PoolSim, EightBall, Planner, SKILL, needSpeed, firstContact, groupOf, L, W, R, HL, HW, POCKETS, JAWS, HEAD, FOOT, MOUTH_C, MOUTH_S, FIX, ROLL_A, ROLL_K, E_BALL };
  if (typeof VR !== 'undefined') VR.Pool8 = API;
  if (typeof module !== 'undefined') module.exports = API;
})();
