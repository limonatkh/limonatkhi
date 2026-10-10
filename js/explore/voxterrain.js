/* =====================================================================
 * VOX TERRAIN — walkable voxel ground for big outdoor levels (the
 * exploration world, the sky islands), in the game's block style.
 *
 *   const vt = new VoxTerrain({ x0, z0, nx, nz, cell, base });
 *   vt.set(i, j, { h, base?, gap?: [y0, y1], top, side })   a column
 *   vt.build(level)   greedy-merges equal neighbouring columns into big
 *                     boxes (few meshes, few colliders) and adds them to
 *                     the level: visible blocks + AABB colliders. A column
 *                     with a GAP is two boxes with air between (tunnels,
 *                     caves, rooms under the ground).
 *   vt.top(x, z)      the ground height at a point (for placing things)
 *   vt.floor(x, z)    the floor you would stand on there (a tunnel's floor
 *                     if there is one)
 *   VoxTerrain.reach(vt, from, opts)   which columns can be walked / jumped
 *                     to from a point (used by the tests: every find must be
 *                     reachable). Moves: up a step ≤ walk, up ≤ jump,
 *                     down any; never into a gap too low to stand in;
 *                     with { gap: true } also across one empty cell (a jump
 *                     over a broken bridge) to the same height or lower.
 *
 * Heights are multiples of the step (0.4 m by default: one step = one
 * small ledge the player steps up without jumping).
 * ===================================================================== */
(function () {
  const STEP = 0.4;

  class VoxTerrain {
    constructor(o) {
      this.x0 = o.x0; this.z0 = o.z0; this.nx = o.nx; this.nz = o.nz; this.cell = o.cell || 2; this.baseY = o.base !== undefined ? o.base : -6;
      this.cols = new Array(this.nx * this.nz).fill(null);
    }
    idx(i, j) { return j * this.nx + i; }
    ij(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
    cx(i) { return this.x0 + (i + 0.5) * this.cell; }
    cz(j) { return this.z0 + (j + 0.5) * this.cell; }
    q(y) { return Math.round(y / STEP) * STEP; }
    set(i, j, c) { if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return; c.h = this.q(c.h); if (c.base !== undefined) c.base = this.q(c.base); if (c.gap) c.gap = [this.q(c.gap[0]), this.q(c.gap[1])]; this.cols[this.idx(i, j)] = c; }
    get(i, j) { return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? null : this.cols[this.idx(i, j)]; }
    top(x, z) { const [i, j] = this.ij(x, z), c = this.get(i, j); return c ? c.h : null; }
    floor(x, z) { const [i, j] = this.ij(x, z), c = this.get(i, j); return c ? (c.gap ? c.gap[0] : c.h) : null; }

    /** add every column to the level (merged) */
    build(L) {
      const nx = this.nx, nz = this.nz, used = new Uint8Array(nx * nz), cell = this.cell;
      const key = (c) => c ? `${c.h}|${c.base !== undefined ? c.base : this.baseY}|${c.gap ? c.gap.join(',') : ''}|${c.top}|${c.side}` : null;
      const keys = this.cols.map(key);
      let boxes = 0;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k0 = keys[this.idx(i, j)]; if (!k0 || used[this.idx(i, j)]) continue;
        // grow along x, then along z while the whole row matches
        let w = 1; while (i + w < nx && !used[this.idx(i + w, j)] && keys[this.idx(i + w, j)] === k0) w++;
        let d = 1;
        grow: while (j + d < nz) { for (let a = 0; a < w; a++) { const id = this.idx(i + a, j + d); if (used[id] || keys[id] !== k0) break grow; } d++; }
        for (let b = 0; b < d; b++) for (let a = 0; a < w; a++) used[this.idx(i + a, j + b)] = 1;
        const c = this.cols[this.idx(i, j)];
        const x0 = this.x0 + i * cell, z0 = this.z0 + j * cell, x1 = x0 + w * cell, z1 = z0 + d * cell;
        const base = c.base !== undefined ? c.base : this.baseY;
        const mat = { top: c.top, side: c.side, bottom: c.side };
        if (c.gap) {
          if (c.gap[0] > base) { L.box(x0, base, z0, x1, c.gap[0], z1, { top: c.floorMat || c.top, side: c.side, bottom: c.side }); boxes++; }
          if (c.h > c.gap[1]) { L.box(x0, c.gap[1], z0, x1, c.h, z1, mat); boxes++; }
        } else if (c.h > base) { L.box(x0, base, z0, x1, c.h, z1, mat); boxes++; }
      }
      this.boxes = boxes;
      return boxes;
    }

    /**
     * Reachability on the column grid (tests): from (x, z) standing on the floor, which columns can be reached.
     * walk: step up without jumping · jump: highest step up with a jump · head: room needed in a gap
     */
    static reach(vt, x, z, o = {}) {
      const walk = o.walk || 0.45, jump = o.jump || 1.75, head = o.head || 1.9, maxDrop = o.maxDrop || 99;
      const [si, sj] = vt.ij(x, z), seen = new Map(), q = [];
      // a column can have two places to stand: the gap floor (inside) and the top (outside)
      const stands = (c) => { if (!c) return []; const s = [{ y: c.h, roof: Infinity }]; if (c.gap && c.gap[1] - c.gap[0] >= head) s.push({ y: c.gap[0], roof: c.gap[1] }); return s; };
      const start = vt.get(si, sj); if (!start) return seen;
      const sy = o.y !== undefined ? o.y : (start.gap ? start.gap[0] : start.h);
      const push = (i, j, y, roof) => { const k = i + ',' + j + ',' + y; if (seen.has(k)) return; seen.set(k, { i, j, y }); q.push([i, j, y, roof]); };
      push(si, sj, sy, Infinity);
      while (q.length) {
        const [i, j, y, roof] = q.shift();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = vt.get(i + di, j + dj);
          if (!n) {                                    // a gap of one cell: jump across it (no higher than a step)
            const g = o.gap && vt.get(i + 2 * di, j + 2 * dj);
            if (g && roof === Infinity && g.h - y <= walk && y - g.h <= 4) push(i + 2 * di, j + 2 * dj, g.h, Infinity);
            continue;
          }
          for (const s of stands(n)) {
            const up = s.y - y;
            const room = Math.min(s.roof, roof) - Math.max(s.y, y);        // headroom while moving between them
            if (room < head) continue;
            if (up <= walk || (up <= jump && roof - y >= head + up) || (up < 0 && -up <= maxDrop)) push(i + di, j + dj, s.y, s.roof);
          }
        }
      }
      return seen;
    }
    /** is a point (x, y, z) among the reached places (within one cell and a small height difference) */
    static reached(vt, seen, x, y, z, tol = 1.0) {
      const [i, j] = vt.ij(x, z);
      for (const v of seen.values()) if (Math.abs(v.i - i) <= 1 && Math.abs(v.j - j) <= 1 && Math.abs(v.y - y) <= tol) return true;
      return false;
    }
  }
  VoxTerrain.STEP = STEP;

  if (typeof VR !== 'undefined') VR.VoxTerrain = VoxTerrain;
  if (typeof module !== 'undefined') module.exports = VoxTerrain;
})();
