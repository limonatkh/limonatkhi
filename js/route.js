/* =====================================================================
 * ROUTE — where the runner can move, as real route geometry.
 * ---------------------------------------------------------------------
 * There are no lanes. Every 40 m section is a ROUTE SEGMENT made of one
 * to three BRANCHES (walkable strips of mountain: a ridge top, a ledge,
 * a pass). A branch has a centre c and a half width hw that change along
 * the section; where branches touch they are one walkable REGION.
 *
 *   PROFILES (what a section starts / ends with)
 *     W   one wide ridge                (room to dodge ~3 ways)
 *     M   one medium ridge / pass       (~2 ways)
 *     N   one narrow ridge              (1 way: jump / slide only)
 *     Fm  two branches, a mountain between them
 *     Fc  two branches, a deep gorge between them
 *     Tm  three branches, mountains between them
 *
 *   A section goes from one profile to the next over a long stretch
 *   (span, ~34 m), so splitting and merging are gradual and visible from
 *   far away:  W -> Tm: one ridge opens into three;  Tm -> N: three routes
 *   converge into one;  W -> N: the ridge narrows from wide to a knife edge.
 *
 * The player's lateral position is continuous (x in metres). It lives in
 * the region under it and keeps its RELATIVE place in that region, so
 * when the region narrows, moves or merges, the runner flows with it.
 * The same regions build the terrain (terrain.js) and decide where
 * obstacles and coins may go (patterns.js).
 * ===================================================================== */
(function () {
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const lerp = (a, b, t) => a + (b - a) * t;

  const PROFILES = {
    W:  { branches: [{ c: 0, hw: 4.4 }] },
    M:  { branches: [{ c: 0, hw: 3.0 }] },
    N:  { branches: [{ c: 0, hw: 1.6 }] },
    Fm: { branches: [{ c: -6.2, hw: 1.75 }, { c: 6.2, hw: 1.75 }], gap: 'mount' },
    Fc: { branches: [{ c: -6.2, hw: 1.75 }, { c: 6.2, hw: 1.75 }], gap: 'chasm' },
    Tm: { branches: [{ c: -8.4, hw: 1.6 }, { c: 0, hw: 1.6 }, { c: 8.4, hw: 1.6 }], gap: 'mount' },
  };

  /** split one strip [a, b] into k touching parts (the start of a split / end of a merge) */
  function subdivide(br, k) {
    const a = br.c - br.hw, w = (br.hw * 2) / k, out = [];
    for (let i = 0; i < k; i++) out.push({ c: a + w * (i + 0.5), hw: w / 2 });
    return out;
  }

  /**
   * spec: { from, to, span: [s0, s1] }   (s0..s1 = where the change happens)
   * returns the route segment used by the track, the terrain and the patterns.
   */
  function makeRoute(spec) {
    const A = PROFILES[spec.from], B = PROFILES[spec.to];
    const span = spec.span || [3, 37];
    let from = A.branches, to = B.branches;
    if (from.length !== to.length) {
      if (from.length === 1) from = subdivide(from[0], to.length);       // split: parts start touching
      else if (to.length === 1) to = subdivide(to[0], from.length);      // merge: parts end touching
      else throw new Error('route: unsupported branch change ' + spec.from + '->' + spec.to);
    }
    const splitting = A.branches.length < B.branches.length;
    const merging = A.branches.length > B.branches.length;
    const gap = B.gap || A.gap || null;
    const t = (u) => smooth((u - span[0]) / (span[1] - span[0]));

    function branches(u) {
      const k = t(u), out = new Array(from.length);
      for (let i = 0; i < from.length; i++) out[i] = { c: lerp(from[i].c, to[i].c, k), hw: lerp(from[i].hw, to[i].hw, k) };
      return out;
    }
    /** walkable regions at u: touching branches are one region */
    function regions(u) {
      const br = branches(u), out = [];
      for (const b of br) {
        const a = b.c - b.hw, e = b.c + b.hw, last = out[out.length - 1];
        if (last && a <= last.b + 0.04) last.b = Math.max(last.b, e);
        else out.push({ a, b: e });
      }
      return out;
    }
    // where the branches come apart / together: no obstacles, so the choice is clear
    const resv = splitting ? [span[0] - 6, span[0] + 10] : merging ? [span[1] - 10, span[1] + 4] : null;
    const reserved = (u) => !!resv && u >= resv[0] && u < resv[1];
    // widest lateral extent (terrain + obstacle grid)
    let ext = 0;
    for (const p of [A, B]) for (const b of p.branches) ext = Math.max(ext, Math.abs(b.c) + b.hw);
    return { from: spec.from, to: spec.to, span, gap, splitting, merging, branches, regions, reserved, ext };
  }

  /* ------------------------------------------------------------------
   * Region helpers used by the player, the camera and the world.
   * ------------------------------------------------------------------ */
  /** the region holding x (or the nearest one; at a tie the `side` (-1/1) wins) */
  function pick(regs, x, side) {
    let best = regs[0], bestD = Infinity;
    for (const r of regs) {
      let d = x < r.a ? r.a - x : x > r.b ? x - r.b : 0;
      if (d === 0) return r;
      // inside a gap: lean toward the side the player last moved
      if (side && Math.abs(d - bestD) < 0.6) {
        const toward = (r.a + r.b) / 2 > x ? 1 : -1;
        if (toward === side) d -= 0.6;
      }
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  /* ------------------------------------------------------------------
   * LANES: the places a runner can be on a walkable span [a, b] (the
   * runner's centre range). The same rule for the player (player.js) and
   * the coins (patterns.js), so a coin is always exactly where a runner
   * can stand: never between two places.
   *   - a branch beside a mountain / gorge (more than one region here): ONE lane
   *   - otherwise one lane per swipe of room, at most 3, spread evenly
   * ------------------------------------------------------------------ */
  const Lanes = {
    count(a, b, branchy) {
      if (branchy) return 1;
      const step = VR.CONFIG.DODGE_STEP;
      return Math.max(1, Math.min(3, 1 + Math.floor((b - a) / step + 0.02)));
    },
    x(a, b, n, i) { return n <= 1 ? (a + b) / 2 : a + (b - a) * Math.max(0, Math.min(n - 1, i)) / (n - 1); },
    /** the lane nearest to x (a tie goes to `side`) */
    nearest(a, b, n, x, side = 0) {
      if (n <= 1) return 0;
      const f = (x - a) / ((b - a) / (n - 1));
      let i = Math.round(f + (Math.abs(f - Math.round(f)) > 0.45 ? side * 0.1 : 0));
      return Math.max(0, Math.min(n - 1, i));
    },
  };

  VR.ROUTE_PROFILES = PROFILES;
  VR.Route = { make: makeRoute, pick, smooth, Lanes };
})();
