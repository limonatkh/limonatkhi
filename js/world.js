/* =====================================================================
 * WORLD — the endless high-mountain route the runner crosses.
 * ---------------------------------------------------------------------
 * The world is a chain of 40 m SECTIONS (terrain.js). Each one is a route
 * segment (route.js) whose start profile matches the end of the one
 * before: a wide ridge narrows into a knife edge, opens into two or
 * three branches around a mountain, and they converge again. Each
 * section also gets a TURN (curvature) and a SLOPE, so the route winds
 * around the peaks and climbs and drops (track.js).
 *
 *   spawnChunk()  -> picks section + turn + slope, builds (or bends) the
 *                    terrain, asks Patterns for obstacles / coins that fit
 *                    the section's route
 *   surfaceAt()   -> what the player stands on (ground or a rock shelf)
 *   collide()     -> front / side hits for the game rules
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const L = C.CHUNK_LENGTH;
  const FALL_START = 55;          // a falling rock starts to drop when you are this close
  const FALL_TIME = 0.75;
  // turns: curvature (1/radius) · slopes: metres up per metre
  const TURNS = [1 / 115, 1 / 80];
  const SLOPES = [0.06, 0.1];
  const MAX_HEADING = 1.25;       // keep the route winding, not looping (~72°)
  const HEIGHT_RANGE = [-6, 16];

  class World {
    constructor(scene, collectibles) {
      this.scene = scene;
      this.collect = collectibles;
      this.pool = new VR.Pool(scene);
      this.track = new VR.Track();
      VR.track = this.track;                       // one runner world: player / ghost / camera use it
      this.chunks = [];
      this.obstacles = [];
      this.prefabs = {};
      this.builders = {};
      this.prebuildList = [];
      this.definePools();
    }

    prefab(key, buildFn) {
      if (!this.prefabs[key]) this.prefabs[key] = (buildFn || this.builders[key])().build();
      return this.prefabs[key];
    }
    lazyPool(key, buildFn) {
      this.builders[key] = buildFn;
      if (!this.pool.has(key)) this.pool.define(key, () => VR.clonePrefab(this.prefab(key, buildFn)));
    }

    definePools() {
      for (const t in VR.OBSTACLE_TYPES) this.lazyPool('obs_' + t, () => VR.OBSTACLE_TYPES[t].build());
      this.pool.define('fallmark', () => VR.buildFallMarker());
      for (const s of [-1, 1]) this.lazyPool('pedestal_' + s, () => VR.buildGatePedestal(s));
      for (const s in VR.SECTIONS) for (let v = 0; v < VR.Terrain.VARIANTS; v++) {
        this.prebuildList.push([s, v]);
        for (const b in VR.BIOMES) this.pool.define(this.terrKey(s, v, b), () => VR.Terrain.instance(s, v, b));
      }
    }
    terrKey(s, v, b) { return `terr_${s}_${v}_${b}`; }

    // Build the always-needed models up-front (behind the loading screen)
    warmup() {
      for (const t in VR.OBSTACLE_TYPES) this.prefab('obs_' + t);
      for (const s of ['ridge', 'saddle', 'ledge_l', 'ledge_r', 'w2m', 'm2w']) for (let v = 0; v < VR.Terrain.VARIANTS; v++) VR.Terrain.prebuild(s, v);
    }
    /** Build one more section model in idle time (menu), so runs never wait for one. */
    prebuildStep() {
      while (this.prebuildList.length) {
        const [s, v] = this.prebuildList.shift();
        if (VR.Terrain.hasPrefab(s, v)) continue;
        VR.Terrain.prebuild(s, v);
        return true;
      }
      return false;
    }

    /**
     * seed: null for a normal run; a number for a challenge, so both players
     * get exactly the same world: sections, turns, hills, obstacles, coins.
     */
    reset(seed = null) {
      while (this.chunks.length) this.releaseChunk(this.chunks[0]);
      this.seeded = seed !== null && seed !== undefined;
      this.rnd = this.seeded ? VR.seededRandom(seed) : Math.random;
      this.collect.clear();
      this.track.reset();
      this.nextZ = 60;                // one chunk behind the player (visible from the menu camera)
      this.chunkIndex = 0;
      this.biomeOrder = VR.BIOME_ORDER.slice();
      this.biomeIdx = (this.rnd() * this.biomeOrder.length) | 0;
      this.biomeLeft = C.BIOME_MIN_CHUNKS;
      this.queue = [];
      this.profile = 'W';
      this.lastSection = 'ridge';
      this.height = 0; this.heading = 0; this.slopeLeft = 0; this.slopeDir = 0;
      this.gates = [];
      this.nextGateChunk = C.MISSION_GATE_FIRST_CHUNK;
      this.duelGates = [];
      this.nextDuelChunk = 3;
    }

    currentBiomeKey() { return this.biomeOrder[this.biomeIdx % this.biomeOrder.length]; }

    /** Which section comes next: one whose route starts where the last one ended. */
    nextSection(biome, difficulty) {
      if (this.queue.length) return this.queue.shift();
      if (this.chunkIndex < 4) return 'ridge';
      const bias = biome.bias || {};
      const names = [], w = [];
      for (const k in VR.SECTIONS) {
        const s = VR.SECTIONS[k];
        if (s.from !== this.profile || k === 'tunnel_end') continue;
        let wt = s.w(difficulty);
        if (k === 'tunnel_start') wt = 0.45 * (bias.tunnel || 0) * (0.5 + difficulty);
        if (k === 'arch') wt *= bias.arch || 1;
        if (s.to[0] === 'F' || s.to === 'Tm') wt *= bias.split || 1;
        if (k === this.lastSection && s.restricted) wt *= 0.3;     // vary the narrow bits
        if (wt > 0) { names.push(k); w.push(wt); }
      }
      let r = this.rnd() * w.reduce((a, b) => a + b, 0), pick = names[0];
      for (let i = 0; i < names.length; i++) { r -= w[i]; if (r <= 0) { pick = names[i]; break; } }
      if (pick === 'tunnel_start') this.queue.push('tunnel_end');
      return pick;
    }
    /** How this section bends and climbs. */
    nextShape(sec, idx) {
      if (idx < 3) return { k: 0, slope: 0 };
      let k = 0;
      if (sec.turn && this.rnd() < 0.65) {
        k = TURNS[(this.rnd() * TURNS.length) | 0];
        // a ledge winds AROUND its mountain: the wall stays on the inside of the turn
        const sign = sec.turn === -1 || sec.turn === 1 ? sec.turn : (this.rnd() < 0.5 ? -1 : 1);
        k *= sign;
        if (Math.abs(this.heading + k * L) > MAX_HEADING) k = sec.turn === true ? -k : 0;
      }
      let slope = 0;
      if (sec.hill) {
        if (this.slopeLeft > 0) { slope = this.slopeDir; this.slopeLeft--; }
        else if (this.rnd() < 0.4) {
          // the mountain drops and rises again: a down run is often followed by an up run
          const mag = SLOPES[(this.rnd() * SLOPES.length) | 0];
          const dir = this.slopeDir ? -Math.sign(this.slopeDir) : (this.rnd() < 0.5 ? -1 : 1);
          this.slopeDir = dir * mag;
          if (this.height + this.slopeDir * L * 2 > HEIGHT_RANGE[1]) this.slopeDir = -mag;
          if (this.height + this.slopeDir * L * 2 < HEIGHT_RANGE[0]) this.slopeDir = mag;
          this.slopeLeft = (this.rnd() * 2) | 0;
          slope = this.slopeDir;
        }
      } else this.slopeLeft = 0;
      this.heading += k * L; this.height += slope * L;
      return { k, slope };
    }

    spawnChunk(difficulty, speed) {
      const idx = this.chunkIndex++;
      if (this.seeded) {
        // challenge: difficulty comes from the chunk's place on the route, not from
        // when it was streamed in (that depends on draw distance and boosts)
        const d = Math.max(0, (idx - 5) * L);
        difficulty = 1 - Math.exp(-d / C.DIFFICULTY_RAMP);
        speed = C.SPEED_START + (C.SPEED_MAX - C.SPEED_START) * (1 - Math.exp(-d / C.SPEED_RAMP));
      }
      // biome rotation (never in the middle of a tunnel)
      if (this.biomeLeft <= 0 && !this.queue.length) {
        this.biomeIdx++;
        this.biomeLeft = C.BIOME_MIN_CHUNKS + ((this.rnd() * (C.BIOME_MAX_CHUNKS - C.BIOME_MIN_CHUNKS)) | 0);
      }
      this.biomeLeft--;
      const biomeKey = this.currentBiomeKey();
      const biome = VR.BIOMES[biomeKey];
      const style = this.nextSection(biome, difficulty);
      const sec = VR.SECTIONS[style];
      this.lastSection = style; this.profile = sec.to;
      const shape = this.nextShape(sec, idx);
      const z0 = this.nextZ;
      this.nextZ -= L;
      const seg = this.track.add(z0, L, shape.k, shape.slope, sec);

      const chunk = { id: idx, z0, style, biome: biomeKey, parts: [], obstacles: [], seg, bent: null };
      // ---- terrain
      const tv = (this.rnd() * VR.Terrain.VARIANTS) | 0;
      if (shape.k === 0 && shape.slope === 0) {
        const o = this.pool.get(this.terrKey(style, tv, biomeKey));       // straight & level: pooled
        this.track.place(o, 0, 0, z0);
        chunk.parts.push(o);
      } else {
        // curved / sloped: the section's voxels are bent along the route
        const g = VR.bendGroup([{ obj: VR.Terrain.instance(style, tv, biomeKey) }], shape.k, shape.slope);
        g.position.copy(seg.P0); g.rotation.y = -seg.th0;
        this.scene.add(g);
        chunk.bent = g;
      }

      // ---- content
      const safe = idx < C.SAFE_START_CHUNKS + 2;
      const plan = VR.Patterns.generate({
        rnd: this.rnd, difficulty, speed, safe, route: sec.route, noFalls: !!sec.tunnel,
        powerupChance: 0.16 + difficulty * 0.08,
      });
      chunk.pattern = plan.patternName;
      chunk.plan = plan;

      for (const o of plan.obstacles) this.spawnObstacle(chunk, o, z0);
      for (const c of plan.coins) this.collect.spawnCoin(c.x, c.y, z0 - c.z, idx);
      for (const c of plan.gems) this.collect.spawnGem(c.x, c.y, z0 - c.z, idx);
      for (const p of plan.powerups) this.collect.spawnPowerUp(p.type, p.x, p.y, z0 - p.z, idx);
      this.maybeSpawnGate(chunk, plan, sec, z0);
      this.maybeSpawnDuelGate(chunk, sec, z0);
      chunk.plan = null;

      this.chunks.push(chunk);
      return chunk;
    }

    spawnObstacle(chunk, o, z0) {
      const def = VR.OBSTACLE_TYPES[o.type];
      const obj = this.pool.get('obs_' + o.type);
      const z = z0 - o.z, sx = o.sx || 1;
      this.track.place(obj, o.x, 0, z);
      obj.scale.x = sx;
      const ob = {
        type: o.type, kind: def.kind, x: o.x, z, len: def.length, sx,
        colliders: def.colliders.map(c => ({ x0: c.x0 * sx, x1: c.x1 * sx, y0: c.y0, y1: c.y1, z0: c.z0, z1: c.z1 })),
        standable: def.standable, ramp: def.ramp ? { len: def.ramp.len, h: def.ramp.h, hw: def.w * sx / 2 } : null,
        parts: [obj],
      };
      if (def.falls) {
        // a rock that comes down the mountain when you get close: its landing spot is marked
        const mark = this.pool.get('fallmark');
        this.track.place(mark, o.x, 0, z);
        ob.parts.push(mark);
        ob.fall = { state: 'wait', t: 0, side: o.x >= 0 ? 1 : -1 };
        obj.visible = false;
      }
      this.addObstacle(chunk, ob);
    }

    /* ---------------------------------------------------------------
     * Mission gates: an arch with a glowing lemon curtain, standing on a
     * wide ridge where the ground is clear for 24 m, so running through
     * it is always safe; the run resumes from here.
     * ------------------------------------------------------------- */
    maybeSpawnGate(chunk, plan, sec, z0) {
      chunk.gates = [];
      if (!this.gateProvider || chunk.id < this.nextGateChunk) return;
      if (!sec.gateable) return;
      const r = plan.regs[22][0];
      const c = (r.a + r.b) / 2;
      const xs = [c, c - 2.2, c + 2.2].filter(x => VR.Patterns.clearBox(plan, x - 1.3, x + 1.3, 8, 32));
      if (!xs.length) { this.nextGateChunk = chunk.id + 1; return; }
      const def = this.gateProvider();
      if (!def) { this.nextGateChunk = chunk.id + 4; return; }
      const x = xs[(Math.random() * xs.length) | 0];
      const obj = this.gateObject(def);
      const z = z0 - 22;
      this.track.place(obj, x, 0, z);
      const gate = { x, z, missionId: def.id, parts: [obj], used: false, announced: false, chunk: chunk.id };
      chunk.gates.push(gate); this.gates.push(gate);
      // a short coin line leads into the gate
      for (let zl = 10; zl <= 20; zl += 2) {
        if (!plan.coins.some(cn => Math.abs(cn.x - x) < 1 && Math.abs(cn.z - zl) < 1.2)) this.collect.spawnCoin(x, 0.9, z0 - zl, chunk.id);
      }
      this.nextGateChunk = chunk.id + C.MISSION_GATE_GAP_MIN + ((Math.random() * (C.MISSION_GATE_GAP_MAX - C.MISSION_GATE_GAP_MIN + 1)) | 0);
    }
    /* 1v1 gate: on a rock pillar beside the route (never in the way), so it
     * never changes the run itself; only its prompt starts a challenge.
     * Uses Math.random so a seeded challenge world stays identical. */
    maybeSpawnDuelGate(chunk, sec, z0) {
      chunk.duelGates = [];
      if (!this.duelGateProvider || chunk.id < this.nextDuelChunk || !sec.gateable) return;
      if (!this.duelGateProvider()) { this.nextDuelChunk = chunk.id + 2; return; }
      const sides = [-1, 1].filter(s => sec.sides[s < 0 ? 0 : 1] !== 'wall');
      if (!sides.length) return;
      const side = sides[(Math.random() * sides.length) | 0];
      const key = 'duelgate_' + VR.lang;
      if (!this.pool.has(key)) this.pool.define(key, () => VR.buildDuelGate());
      const u = 20, regs = sec.route.regions(u);
      const edge = side < 0 ? regs[0].a : regs[regs.length - 1].b;
      const x = edge + side * (VR.GATE_PEDESTAL_OFFSET + (sec.sides[side < 0 ? 0 : 1] === 'shoulder' ? 2 : 0));
      const z = z0 - u;
      const obj = this.track.place(this.pool.get(key), x, 0, z);
      const ped = this.track.place(this.pool.get('pedestal_' + side), x, 0, z);
      const gate = { x, z, side, parts: [obj, ped], chunk: chunk.id };
      chunk.duelGates.push(gate); this.duelGates.push(gate);
      this.nextDuelChunk = chunk.id + 7 + ((Math.random() * 5) | 0);
    }
    gateObject(def) {
      const key = 'gate_' + def.id + '_' + VR.lang;            // the sign is drawn in the current language
      if (!this.pool.has(key)) this.pool.define(key, () => VR.buildMissionGate(def));
      return this.pool.get(key);
    }
    /** Language changed: swap every gate on the route for one with the new sign. */
    relabelGates() {
      for (const g of this.duelGates || []) {
        this.pool.release(g.parts[0]);
        const key = 'duelgate_' + VR.lang;
        if (!this.pool.has(key)) this.pool.define(key, () => VR.buildDuelGate());
        g.parts[0] = this.track.place(this.pool.get(key), g.x, 0, g.z);
      }
      for (const g of this.gates) {
        const def = VR.MISSIONS.find(d => d.id === g.missionId); if (!def) continue;
        this.pool.release(g.parts[0]);
        g.parts[0] = this.track.place(this.gateObject(def), g.x, 0, g.z);
      }
    }
    animateGates(dt) {
      if (VR.gateCurtainMat) {
        const m = VR.gateCurtainMat; m.map.offset.y -= dt * 0.35; m.opacity = 0.78 + Math.sin(performance.now() * 0.004) * 0.08;
      }
      for (const g of this.gates) { const sp = g.parts[0].userData.spinner; if (sp) sp.rotation.y += dt * 1.6; }
      if (this.duelGates && this.duelGates.length) {
        const m = VR.duelGateCurtain(); m.map.offset.y += dt * 0.5;
        for (const g of this.duelGates) { const sp = g.parts[0].userData.spinner; if (sp) sp.rotation.y += dt * 1.2; }
      }
    }

    addObstacle(chunk, o) { o.chunk = chunk.id; chunk.obstacles.push(o); this.obstacles.push(o); }

    releaseChunk(chunk) {
      for (const p of chunk.parts) this.pool.release(p);
      if (chunk.bent) { this.scene.remove(chunk.bent); VR.disposeBent(chunk.bent); chunk.bent = null; }
      for (const o of chunk.obstacles) for (const p of o.parts) this.pool.release(p);
      const set = new Set(chunk.obstacles);
      this.obstacles = this.obstacles.filter(o => !set.has(o));
      this.collect.releaseChunk(chunk.id);
      for (const g of chunk.gates || []) { for (const p of g.parts) this.pool.release(p); }
      if (chunk.gates && chunk.gates.length) this.gates = this.gates.filter(g => !chunk.gates.includes(g));
      for (const g of chunk.duelGates || []) { for (const p of g.parts) this.pool.release(p); }
      if (chunk.duelGates && chunk.duelGates.length) this.duelGates = this.duelGates.filter(g => !chunk.duelGates.includes(g));
      this.track.remove(chunk.seg);
      this.chunks.splice(this.chunks.indexOf(chunk), 1);
    }

    update(dt, player, speed, difficulty, game, keepBehind = false) {
      // stream chunks
      while (this.nextZ > player.z - C.CHUNKS_AHEAD * L) this.spawnChunk(difficulty, speed);
      while (!keepBehind && this.chunks.length && this.chunks[0].z0 - L > player.z + 30) this.releaseChunk(this.chunks[0]);
      // falling rocks
      for (const o of this.obstacles) {
        const f = o.fall; if (!f || f.state === 'down') continue;
        if (f.state === 'wait') {
          if (o.z > player.z - FALL_START && o.z < player.z + 2) { f.state = 'falling'; f.t = 0; o.parts[0].visible = true; game.onRockfall(o); }
          else continue;
        }
        f.t = Math.min(1, f.t + dt / FALL_TIME);
        const e = f.t * f.t;                                         // falls faster and faster
        const obj = o.parts[0];
        this.track.place(obj, o.x + f.side * 7 * (1 - f.t), 15 * (1 - e), o.z, f.side * (1 - f.t) * 2.5);
        obj.scale.x = o.sx;
        if (f.t >= 1) { f.state = 'down'; game.onRockLanded(o); }
      }
    }

    // keep path coordinates small on long runs (the world itself doesn't move)
    shift(dz) {
      this.nextZ += dz;
      this.track.shift(dz);
      for (const c of this.chunks) c.z0 += dz;
      for (const o of this.obstacles) o.z += dz;
      for (const g of this.gates) g.z += dz;
      for (const g of this.duelGates) g.z += dz;
      this.collect.shift(dz);
    }

    chunkAt(z) { for (const c of this.chunks) if (z <= c.z0 && z > c.z0 - L) return c; return null; }

    /** ramp height of a rock step at z (0 outside its ramp) */
    rampH(o, z) { return o.ramp.h * Math.min(1, Math.max(0, (o.z - z) / o.ramp.len)); }

    /**
     * Highest walkable surface under the player.
     * Only surfaces at/below the feet (with a small tolerance) count, so
     * running into the side of a rock shelf is a collision, not a teleport up.
     */
    surfaceAt(x, z, y, hw) {
      let best = 0, obj = null;
      for (const o of this.obstacles) {
        if (z > o.z + 1 || z < o.z - o.len - 1) continue;
        // feet partly on the ramp count as on it (you run up its edge instead of clipping it)
        if (o.ramp && Math.abs(x - o.x) < o.ramp.hw + 0.25 && z <= o.z && z >= o.z - o.ramp.len) {
          const h = this.rampH(o, z);
          if (h <= y + 0.9 && h > best) { best = h; obj = o; }
        }
        if (!o.standable || o.tripped) continue;
        for (const c of o.colliders) {
          if (x + hw <= o.x + c.x0 || x - hw >= o.x + c.x1) continue;
          if (z < o.z + c.z0 - 0.25 || z > o.z + c.z1 + 0.25) continue;
          if (c.y1 <= y + 0.3 && c.y1 > best) { best = c.y1; obj = o; }
        }
      }
      return { h: best, obj };
    }

    /**
     * Returns null, or {side: bool, obstacle} for the first hit.
     * side = the overlap was caused by moving sideways into it.
     */
    collide(p) {
      const hw = C.PLAYER_HALF_WIDTH, hd = C.PLAYER_HALF_DEPTH;
      const px0 = p.x - hw, px1 = p.x + hw, py0 = p.y + 0.05, py1 = p.y + p.height, pz0 = p.z - hd, pz1 = p.z + hd;
      const prevX = p.prevX === undefined ? p.x : p.prevX;
      for (const o of this.obstacles) {
        if (o.tripped || p.z > o.z + 2 || p.z < o.z - o.len - 2) continue;
        if (o.ramp && Math.abs(p.x - o.x) >= o.ramp.hw + 0.25 && px1 > o.x - o.ramp.hw && px0 < o.x + o.ramp.hw && pz0 < o.z && pz1 > o.z - o.ramp.len) {
          if (p.y < this.rampH(o, p.z) - 0.9) return { side: true, obstacle: o };
        }
        for (const c of o.colliders) {
          const bx0 = o.x + c.x0, bx1 = o.x + c.x1, bz0 = o.z + c.z0, bz1 = o.z + c.z1;
          if (px1 <= bx0 || px0 >= bx1 || pz1 <= bz0 || pz0 >= bz1 || py1 <= c.y0 || py0 >= c.y1) continue;
          if (o.standable && c.y1 - p.y <= 0.3) continue;       // standing on it
          const wasOverlappingX = prevX + hw > bx0 && prevX - hw < bx1;
          const side = !wasOverlappingX || (Math.abs(p.lateralVel || 0) > 1 && p.z < bz1 - 0.6);
          // how much of the body overlaps it sideways (small = clipped its edge)
          const overlap = Math.min(px1, bx1) - Math.max(px0, bx0);
          return { side, obstacle: o, overlap, bx0, bx1 };
        }
      }
      return null;
    }

    // obstacle destroyed by shield/star: remove it from play
    smash(o) {
      for (const p of o.parts) this.pool.release(p);
      o.parts.length = 0;
      o.colliders = []; o.standable = false; o.ramp = null; o.fall = null;
      const chunk = this.chunks.find(c => c.id === o.chunk);
      this.obstacles = this.obstacles.filter(x => x !== o);
      if (chunk) chunk.obstacles = chunk.obstacles.filter(x => x !== o);
    }
  }

  /** Small deterministic PRNG (mulberry32). */
  VR.seededRandom = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  VR.World = World;
})();
