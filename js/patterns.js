/* =====================================================================
 * PATTERNS — what is on the route inside one 40 m section.
 * ---------------------------------------------------------------------
 * Works on the section's real route geometry (route.js), not on lanes:
 * a grid of 0.5 m lateral cells x 1 m along the run, filled from the
 * walkable regions (one wide ridge, a knife edge, two or three
 * branches...). Obstacles are placed at any lateral position inside a
 * region; full-width hurdles are stretched to span the region.
 *
 * Cell codes:  OUT not walkable · FREE · J jump-over · S slide-under ·
 *              B blocked · P ramp of a rock step · R top of a rock step
 *
 * verify() is the fairness check. It walks the section backwards and
 * marks every cell from which the end can still be reached (moving
 * sideways only as fast as a player really can at this speed, never
 * through rock or obstacles). The layout is accepted only if EVERY
 * branch, at every metre, still has a way through, so whichever side of
 * a fork the player took, there is no dead end. Rejected layouts are
 * regenerated.
 *
 * Coins follow the runner's LANES (route.js Lanes, the same rule the player
 * uses): one line per branch, flowing with the route like the runner does,
 * moving one lane over exactly like a swipe to go around blocks, arcing over
 * jump obstacles, ducking under slides and running up onto rock steps.
 * Never between two lanes, never three rows.
 *
 * HOW TO ADD A RECIPE: write a function (g) => {...} using g.single /
 * g.hurdle / g.rows and add it to RECIPES with a weight function.
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const L = C.CHUNK_LENGTH;
  const CELL = 0.5, XMIN = -16, NX = 64;
  const ZMIN = 6, ZMAX = 34;               // obstacles stay inside this band -> fair section seams
  const M = C.ROUTE_MARGIN;                // the runner's centre stays this far from a region edge
  const PHW = C.PLAYER_HALF_WIDTH;
  const BLOCK_GAP = 1.5;                  // metres of free ground beside a rock you must go around
  const OUT = 0, FREE = 1, J = 2, S = 3, B = 4, P = 5, R = 6;
  const cx = (i) => XMIN + (i + 0.5) * CELL;
  const ci = (x) => Math.max(0, Math.min(NX - 1, Math.floor((x - XMIN) / CELL)));
  const passable = (c) => c !== OUT && c !== B;

  class Plan {
    constructor(rnd, diff, speed, route) {
      this.rnd = rnd; this.diff = diff; this.speed = speed; this.route = route;
      this.regs = []; this.walk = []; this.code = []; this.comp = []; this.reserved = [];
      for (let z = 0; z < L; z++) {
        const regs = route.regions(z + 0.5);
        this.regs.push(regs);
        const w = new Uint8Array(NX), cp = new Int8Array(NX).fill(-1);
        regs.forEach((r, k) => {
          let a = r.a + M, b = r.b - M;
          if (b < a) a = b = (r.a + r.b) / 2;
          for (let i = ci(a); i <= ci(b); i++) { if (cx(i) >= a - CELL / 2 && cx(i) <= b + CELL / 2) { w[i] = FREE; cp[i] = k; } }
        });
        this.walk.push(w); this.code.push(Uint8Array.from(w)); this.comp.push(cp);
        this.reserved.push(route.reserved(z + 0.5));
      }
      this.obstacles = [];   // {type, x, z, sx}
      this.coins = []; this.gems = []; this.powerups = [];
      this.jumps = [];       // {x0, x1, zc}
      this.slides = [];      // {x0, x1, z0, z1}
      this.steps = [];       // {x0, x1, z, ramp, h, len}
    }
    pick(arr) { return arr[(this.rnd() * arr.length) | 0]; }
    rangeR(a, b) { return a + this.rnd() * (b - a); }
    regionAt(z, x) { const regs = this.regs[Math.max(0, Math.min(L - 1, Math.floor(z)))]; return VR.Route.pick(regs, x, 0); }
    /** nothing else within this box (lateral range, rows z0..z1) */
    clear(x0, x1, z0, z1, codes) {
      for (let z = Math.max(0, Math.floor(z0)); z <= Math.min(L - 1, Math.ceil(z1)); z++) {
        const row = this.code[z];
        for (let i = ci(x0); i <= ci(x1); i++) if (codes.includes(row[i])) return false;
      }
      return true;
    }
    fits(def, x, z, sx) {
      const w = def.w * sx, len = def.length;
      if (z < ZMIN || z + len > ZMAX) return false;
      // spanning obstacles may hang a little over the edge; blocks stand fully on the route
      const tol = def.kind === 'jump' ? 0.4 : def.kind === 'slide' ? 0.55 : -0.15;
      for (let zz = Math.floor(z); zz <= Math.min(L - 1, Math.ceil(z + len)); zz++) {
        if (this.reserved[zz]) return false;
        const r = VR.Route.pick(this.regs[zz], x, 0);
        if (x - w / 2 < r.a - tol || x + w / 2 > r.b + tol) return false;
        // a rock you must go around leaves a comfortable way past it (not a squeeze)
        if (def.kind === 'block' && Math.max((x - w / 2) - r.a, r.b - (x + w / 2)) < BLOCK_GAP) return false;
      }
      return true;
    }
    spacingOk(def, x0, x1, z) {
      // a clear run-up around everything; jumps and slides need room to land / stand up
      if (!this.clear(x0 - PHW - 0.6, x1 + PHW + 0.6, z - 2, z + def.length + 2, [J, S, B, P, R])) return false;
      if (def.kind === 'jump' || def.kind === 'slide') {
        // a jump keeps you in the air ~0.65 s: the next jump / slide must be out of reach of it
        const gap = Math.max(7, this.speed * 0.8);
        if (!this.clear(x0 - PHW, x1 + PHW, z - gap, z + def.length + gap, [J, S, P, R])) return false;
      }
      return true;
    }
    mark(def, x, z, sx) {
      const pad = PHW + (def.kind === 'block' ? 0.15 : 0);      // a little safety margin around rocks
      const w = def.w * sx, x0 = x - w / 2 - pad, x1 = x + w / 2 + pad;
      const code = def.kind === 'jump' ? J : def.kind === 'slide' ? S : def.kind === 'block' ? B : P;
      // a slide obstacle's supports are solid: only its opening can be slid through
      const open = def.pass ? def.pass * sx - PHW : Infinity;
      for (let zz = Math.floor(z); zz < Math.min(L, Math.ceil(z + def.length)); zz++) {
        const c = def.kind === 'step' && zz >= z + def.ramp.len ? R : code;
        for (let i = ci(x0); i <= ci(x1); i++) if (this.walk[zz][i]) this.code[zz][i] = Math.abs(cx(i) - x) <= open ? c : B;
      }
      if (def.kind === 'jump') this.jumps.push({ x0: x - w / 2, x1: x + w / 2, zc: z + def.length / 2 });
      if (def.kind === 'slide') { const hp = (def.pass || def.w / 2) * sx; this.slides.push({ x0: x - hp, x1: x + hp, z0: z, z1: z + def.length }); }
      if (def.kind === 'step') this.steps.push({ x0: x - w / 2, x1: x + w / 2, z, ramp: def.ramp.len, h: def.ramp.h, len: def.length });
    }
    /** one obstacle at (x, z) */
    single(type, x, z, sx = 1) {
      const def = VR.OBSTACLE_TYPES[type];
      if (!this.fits(def, x, z, sx)) return false;
      if (!this.spacingOk(def, x - def.w * sx / 2, x + def.w * sx / 2, z)) return false;
      this.mark(def, x, z, sx);
      this.obstacles.push({ type, x, z, sx });
      return true;
    }
    /** a jump / slide obstacle stretched across a whole region (pieces side by side) */
    hurdle(kind, z, region) {
      const types = kind === 'jump' ? ['rock_low', 'log', 'crevice', 'rock_low'] : ['lintel'];
      const type = this.pick(types), def = VR.OBSTACLE_TYPES[type];
      const W = region.b - region.a;
      if (kind === 'slide') {
        // one beam across the whole route, held by posts beyond its edges: the
        // whole width is a clear opening to slide through
        const n = Math.max(1, Math.round(W / def.w)), pw = W / n, sx = pw / def.w;
        if (!this.spacingOk(def, region.a, region.b, z)) return false;
        for (let zz = Math.floor(z); zz <= Math.ceil(z + def.length); zz++) if (this.reserved[Math.min(L - 1, zz)]) return false;
        if (z < ZMIN || z + def.length > ZMAX) return false;
        const at = (zz) => VR.Route.pick(this.regs[Math.min(L - 1, Math.floor(zz))], (region.a + region.b) / 2, 0);
        const r0 = at(z), r1 = at(z + def.length);
        if (Math.abs(r0.a - r1.a) > 0.3 || Math.abs(r0.b - r1.b) > 0.3) return false;      // not where the route moves
        for (let k = 0; k < n; k++) { const x = region.a + pw * (k + 0.5); this.mark(def, x, z, sx); this.obstacles.push({ type, x, z, sx }); }
        for (const x of [region.a - 0.3, region.b + 0.3]) this.obstacles.push({ type: 'post', x, z, sx: 1 });
        return true;
      }
      const n = Math.max(1, Math.round(W / (def.w * 1.15)));
      const pw = W / n, sx = Math.max(0.6, Math.min(1.6, pw / def.w));
      if (!this.spacingOk(def, region.a, region.b, z)) return false;
      const pieces = [];
      for (let k = 0; k < n; k++) {
        const x = region.a + pw * (k + 0.5);
        if (!this.fits(def, x, z, sx)) return false;
        pieces.push(x);
      }
      for (const x of pieces) { this.mark(def, x, z, sx); this.obstacles.push({ type, x, z, sx }); }
      return true;
    }
    usable(r) { const a = r.a + M, b = r.b - M; return b < a ? [(r.a + r.b) / 2, (r.a + r.b) / 2] : [a, b]; }
    /** the runner's lanes in region r of row z: [x...] (route.js Lanes; a branch has one) */
    lanes(z, r) {
      const regs = this.regs[Math.max(0, Math.min(L - 1, Math.floor(z)))], [a, b] = this.usable(r);
      const n = VR.Route.Lanes.count(a, b, regs.length > 1), out = [];
      for (let i = 0; i < n; i++) out.push(VR.Route.Lanes.x(a, b, n, i));
      return out;
    }
    /** call fn(z, regions) every `spacing` metres */
    rows(spacing, fn, start = ZMIN + this.rnd() * 3) {
      for (let z = start; z < ZMAX - 1; z += spacing * (0.85 + this.rnd() * 0.3)) fn(z, this.regs[Math.floor(z)]);
    }
  }

  // ------------------------------------------------------------------ fairness
  function verify(plan) {
    const perRow = Math.max(1, Math.round((C.DODGE_STEP / Math.max(3.5, plan.speed * 0.2)) / CELL));
    const G = [];
    for (let z = 0; z < L; z++) G.push(new Uint8Array(NX));
    const last = plan.code[L - 1];
    for (let i = 0; i < NX; i++) G[L - 1][i] = passable(last[i]) ? 1 : 0;
    for (let z = L - 2; z >= 0; z--) {
      const row = plan.code[z], next = plan.code[z + 1], gn = G[z + 1], g = G[z];
      for (let i = 0; i < NX; i++) {
        if (!passable(row[i])) continue;
        const onTop = row[i] === R;
        let ok = false;
        // move sideways within this row (not through rock / obstacles; not up onto a
        // rock step from the side), then forward
        for (const dir of [0, -1, 1]) {
          for (let k = dir === 0 ? 0 : 1; k <= (dir === 0 ? 0 : perRow); k++) {
            const j = i + dir * k;
            if (j < 0 || j >= NX || !passable(row[j])) break;
            if (row[j] === R && !onTop) break;
            const nc = next[j];
            if (passable(nc) && gn[j] && !(nc === R && row[j] !== P && row[j] !== R)) { ok = true; break; }
          }
          if (ok) break;
        }
        g[i] = ok ? 1 : 0;
      }
    }
    // every branch, at every metre, must still have a way through — from a LANE (where a
    // runner actually is), not just from some spot in between
    for (let z = 0; z < L; z++) {
      for (const r of plan.regs[z]) {
        if (!plan.lanes(z + 0.5, r).some(x => G[z][ci(x)])) return false;
      }
    }
    plan.G = G;
    return true;
  }

  // ------------------------------------------------------------------ recipes
  const BLOCKS = ['boulder', 'boulder', 'pillar'];
  const JUMPS = ['rock_low', 'log', 'crevice'];
  const SLIDES = ['arch', 'leaning'];
  // one lane only (a knife edge, or a branch between mountains): nothing to go around, only jump / slide
  const narrow = (g, r, z) => g.lanes(z, r).length < 2;
  const RECIPES = {
    // easy stretch: coins, maybe one hurdle
    calm: {
      weight: d => 3 - d * 2,
      build(g) {
        if (g.rnd() < 0.55 + g.diff * 0.4) {
          const z = 12 + g.rnd() * 14, regs = g.regs[Math.floor(z)];
          const r = g.pick(regs);
          if (narrow(g, r, z) || g.rnd() < 0.4) g.hurdle('jump', z, r);
          else { const [a, b] = g.usable(r); g.single(g.pick(['rock_low', 'log']), g.rangeR(a, b), z); }
        }
      },
    },
    // rocks scattered across the route — the core reaction recipe
    scatter: {
      weight: d => 1.5 + d * 3,
      build(g) {
        const sp = Math.max(9 + (1 - g.diff) * 7, g.speed * 0.48);
        g.rows(sp, (z, regs) => {
          for (const r of regs) {
            if (narrow(g, r, z)) { if (g.rnd() < 0.55 + g.diff * 0.3) g.hurdle(g.rnd() < 0.62 ? 'jump' : 'slide', z, r); continue; }
            const [a, b] = g.usable(r);
            const n = 1 + (g.rnd() < 0.2 + g.diff * 0.5 ? 1 : 0);
            for (let k = 0; k < n; k++) {
              const t = g.rnd();
              const type = t < 0.45 ? g.pick(BLOCKS) : t < 0.8 ? g.pick(JUMPS) : g.pick(SLIDES);
              g.single(type, g.rangeR(a, b), z + k * 0.5);
            }
          }
        });
      },
    },
    // hurdles across the whole route: one action clears them
    hurdles: {
      weight: d => (d > 0.1 ? 1 + d : 0.3),
      build(g) {
        g.rows(Math.max(12, g.speed * 0.6), (z, regs) => {
          const kind = g.rnd() < 0.6 ? 'jump' : 'slide';
          for (const r of regs) g.hurdle(kind, z, r);
        }, ZMIN + 2);
      },
    },
    // boulders left and right: weave between them
    slalom: {
      weight: d => (d > 0.05 ? 0.8 + d * 2 : 0.2),
      build(g) {
        let side = g.rnd() < 0.5 ? -1 : 1;
        g.rows(Math.max(8, g.speed * 0.4), (z, regs) => {
          for (const r of regs) {
            if (narrow(g, r, z)) { if (g.rnd() < 0.5) g.hurdle('jump', z, r); continue; }
            const [a, b] = g.usable(r);
            const x = side < 0 ? a + 0.6 + g.rnd() * 0.8 : b - 0.6 - g.rnd() * 0.8;
            g.single(g.pick(BLOCKS), x, z);
          }
          side = -side;
        });
      },
    },
    // a rock falls from the mountain as you come
    rockfall: {
      weight: d => (d > 0.15 ? 0.6 + d * 1.4 : 0),
      build(g) {
        const z = 14 + g.rnd() * 10, regs = g.regs[Math.floor(z)];
        const r = regs.reduce((p, c) => (c.b - c.a > p.b - p.a ? c : p), regs[0]);
        if (!narrow(g, r, z)) { const [a, b] = g.usable(r); g.single('rockfall', g.rangeR(a, b), z); }
        if (g.rnd() < 0.6) RECIPES.calm.build(g);
      },
    },
    // rock shelves: the ground steps up, run over the top
    steps: {
      weight: d => 0.7,
      build(g) {
        const z = ZMIN + g.rnd() * 10, regs = g.regs[Math.floor(z)];
        for (const r of regs) {
          if (narrow(g, r, z)) continue;
          const [a, b] = g.usable(r);
          g.single('step', g.rangeR(a + 0.4, b - 0.4), z);
          if (g.rnd() < 0.5 + g.diff * 0.4) g.single(g.pick(BLOCKS), g.rangeR(a, b), z + 3 + g.rnd() * 6);
        }
      },
    },
  };

  // ------------------------------------------------------------------ coins
  function surfaceY(g, x, z) {
    for (const s of g.steps) {
      if (x < s.x0 - 0.1 || x > s.x1 + 0.1 || z < s.z || z > s.z + s.len) continue;
      return z < s.z + s.ramp ? s.h * (z - s.z) / s.ramp : s.h;
    }
    return 0;
  }
  function coinY(g, x, z) {
    for (const sl of g.slides) if (x > sl.x0 - 0.3 && x < sl.x1 + 0.3 && z > sl.z0 - 1.2 && z < sl.z1 + 1.2) return 0.5;
    let y = 0.9 + surfaceY(g, x, z);
    for (const j of g.jumps) {
      if (x < j.x0 - 0.3 || x > j.x1 + 0.3) continue;
      const d = (z - j.zc) / 4.5;
      if (Math.abs(d) < 1) y = Math.max(y, 0.9 + 1.5 * (1 - d * d));
    }
    return y;
  }
  /*
   * Coins sit on the runner's LANES (route.js Lanes, the same rule player.js
   * uses): a coin is always exactly where a runner can be. A line keeps its
   * lane while the route narrows, bends, splits or merges (taking the nearest
   * lane when their number changes, like the runner), and changes lane only
   * the way a swipe does: no coins in the middle of the move.
   */
  /** one line of coins following one runner's way along the branch it is on */
  function coinLine(g, z0, x0, every = 1) {
    const Ln = VR.Route.Lanes;
    let joined = 0;
    const before = g.coins.slice();                        // lines laid down earlier
    // where branches have merged, this line joins the one already there (no side-by-side rows)
    const taken = (z, r) => before.some(c => Math.abs(c.z - z) < 1.1 && c.x >= r.a - 0.01 && c.x <= r.b + 0.01);
    const side = x0 < 0 ? -1 : 1;
    const lanesAt = (zi, r) => { const [a, b] = g.usable(r); return { a, b, n: Ln.count(a, b, g.regs[zi].length > 1) }; };
    let r = VR.Route.pick(g.regs[Math.floor(z0)], x0, side);
    let { a, b, n } = lanesAt(Math.floor(z0), r);
    let lane = Ln.nearest(a, b, n, x0, side), x = Ln.x(a, b, n, lane), regW = r.b - r.a;
    let sinceMove = 0, cnt = 0, swiping = false;
    // how far sideways a runner gets per 2 m at this section's speed: flowing with
    // the route (FOLLOW_SPEED) or in the middle of a swipe
    const spd = Math.max(8, g.speed);
    const followStep = 2 * C.FOLLOW_SPEED / spd;
    // a place is bad if a rock (or the route's edge) is in the way over the next metres,
    // or the fairness map says there is no way on from it
    const look = Math.min(9, 5 + Math.ceil(spd * C.DODGE_TIME));
    const bad = (zi, xx) => {
      for (let k = 0; k <= look; k++) {
        const zz = Math.min(L - 1, zi + k), c = g.code[zz][ci(xx)];
        if (c === B || c === OUT || (c === R && g.code[zi][ci(xx)] !== R && g.code[zi][ci(xx)] !== P)) return true;
      }
      return !g.G[zi][ci(xx)];
    };
    for (let z = z0; z < L - 1; z += 2) {
      const zi = Math.floor(z);
      r = VR.Route.pick(g.regs[zi], x, side);
      const ln = lanesAt(zi, r);
      // a new region (split / merge) or a different number of lanes: the nearest lane, like the runner
      if (ln.n !== n || Math.abs((r.b - r.a) - regW) > 0.8 || x < r.a - 0.05 || x > r.b + 0.05) { lane = Ln.nearest(ln.a, ln.b, ln.n, x, side); swiping = false; }
      ({ a, b, n } = ln); regW = r.b - r.a;
      let target = Ln.x(a, b, n, lane);
      // rock ahead (or now and then, for fun): swipe over to a free lane (1 or 2 lanes)
      if (!swiping && n > 1 && (bad(zi, target) || (sinceMove > 6 && g.rnd() < 0.14))) {
        const opts = [];
        for (const s of [-1, 1]) for (const k of [1, 2]) {
          const L2 = lane + s * k;
          if (L2 < 0 || L2 >= n || bad(zi, Ln.x(a, b, n, L2)) || opts.some(o => o.l === L2)) continue;
          opts.push({ l: L2, k });
        }
        if (opts.length) {
          const o = opts.sort((p, q) => p.k - q.k || g.rnd() - 0.5)[0];
          lane = o.l; target = Ln.x(a, b, n, lane); swiping = true; sinceMove = 0;
        }
      }
      // move like the runner: one swipe takes DODGE_TIME, otherwise flowing with the route
      const swipeStep = 2 * (Math.max(C.DODGE_STEP, (b - a) / Math.max(1, n - 1)) / C.DODGE_TIME) / spd;
      const mx = swiping ? swipeStep : followStep;
      x += Math.max(-mx, Math.min(mx, target - x));
      x = Math.max(r.a + 0.2, Math.min(r.b - 0.2, x));
      const onLane = Math.abs(target - x) < 0.05;
      if (swiping && onLane) swiping = false;
      sinceMove++;
      // only ON a lane: never a coin in the middle of a move or while flowing over to a lane
      if (!onLane) continue;
      // not right where the number of lanes changes (a split / merge edge): the runner is moving over there
      const nAt = (zz) => { const q = Math.max(0, Math.min(L - 1, zz)), rr = VR.Route.pick(g.regs[q], x, side); return lanesAt(q, rr).n; };
      if (nAt(zi - 1) !== n || nAt(zi + 1) !== n || nAt(zi + 2) !== n) continue;
      if (bad(zi, x) && g.code[zi][ci(x)] !== FREE) continue;      // nothing good: leave a gap
      if (taken(z, r)) { if (++joined >= 2) break; continue; }
      joined = 0;
      const c = g.code[zi][ci(x)];
      if (c === B || c === OUT) continue;
      if ((cnt++ % every) !== 0) continue;
      g.coins.push({ x, y: coinY(g, x, z), z });
    }
    // where a runner on this line is at the end of the section (the next section carries on)
    g.coinEnds.push(x);
  }
  function addCoins(g, safe, carried) {
    const route = g.route;
    const start = g.regs[0];
    g.coinEnds = [];
    // one line per branch, carrying on from where the last section's line ended (so a
    // runner who followed it is still on it); a branch without one starts on a resting place
    start.forEach((r) => {
      const prev = (carried || []).find(x => x >= r.a - 0.05 && x <= r.b + 0.05);
      if (prev !== undefined) coinLine(g, 0, prev, 1);
      else { const xs = g.lanes(0, r); coinLine(g, 0, g.pick(xs)); }
    });
    // a split gets a second, lighter line on the other branch
    if (route.splitting) {
      const zs = Math.min(L - 4, Math.ceil(route.span[0] + 14));
      const regs = g.regs[zs];
      const taken = new Set(g.coins.filter(c => Math.abs(c.z - zs) < 2).map(c => VR.Route.pick(regs, c.x, 0)));
      for (const r of regs) if (!taken.has(r)) coinLine(g, zs, (r.a + r.b) / 2, 2);
    }
    // bonus lemon (the "gem" pickup) replaces a coin
    if (!safe && g.rnd() < 0.3 && g.coins.length > 4) {
      const i = (g.rnd() * g.coins.length) | 0;
      g.gems.push(g.coins.splice(i, 1)[0]);
    }
  }

  const PU_TYPES = Object.keys(C.POWERUPS);

  /**
   * Build the content plan for one section.
   * ctx: { rnd, difficulty (0..1), speed, safe, route, powerupChance }
   */
  VR.Patterns = {
    RECIPES,
    verify,
    generate(ctx) {
      const { rnd, difficulty, speed, safe, route } = ctx;
      let plan = null;
      for (let attempt = 0; attempt < 10 && !plan; attempt++) {
        const g = new Plan(rnd, difficulty, speed, route);
        if (!safe) {
          const names = Object.keys(RECIPES).filter(n => !(ctx.noFalls && n === 'rockfall'));
          const weights = names.map(n => Math.max(0, RECIPES[n].weight(difficulty)));
          let r = rnd() * weights.reduce((a, b) => a + b, 0);
          let chosen = names[0];
          for (let i = 0; i < names.length; i++) { r -= weights[i]; if (r <= 0) { chosen = names[i]; break; } }
          RECIPES[chosen].build(g);
          g.patternName = chosen;
        } else g.patternName = 'safe';
        if (verify(g)) plan = g;
      }
      if (!plan) { plan = new Plan(rnd, difficulty, speed, route); plan.patternName = 'fallback'; verify(plan); }
      addCoins(plan, safe, ctx.coinStart);
      if (!safe && rnd() < ctx.powerupChance && plan.coins.length > 6) {
        const i = 3 + ((rnd() * (plan.coins.length - 6)) | 0);
        const c = plan.coins.splice(i, 1)[0];
        plan.powerups.push({ type: PU_TYPES[(rnd() * PU_TYPES.length) | 0], x: c.x, y: Math.max(1.0, c.y), z: c.z });
      }
      return plan;
    },
    /** is this box free of everything (used for mission gates)? */
    clearBox(plan, x0, x1, z0, z1) { return plan.clear(x0, x1, z0, z1, [J, S, B, P, R, OUT]); },
  };
})();
