/* =====================================================================
 * COLLECTIBLES — coins, lemons (the 'gems' set), power-up blocks and pickup sparkles.
 * Coins and gems are drawn with InstancedMesh (1 draw call for all of
 * them); records are recycled through free-lists (object pooling).
 * Records live in path space (like the player); drawing goes through
 * VR.track.toWorld so they follow the turns and hills.
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const T = THREE;
  const HIDE = new T.Matrix4().makeScale(0, 0, 0);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3(1, 1, 1);

  class InstancedSet {
    constructor(scene, geometry, material, capacity) {
      this.mesh = new T.InstancedMesh(geometry, material, capacity);
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, HIDE);
      scene.add(this.mesh);
      this.items = [];
      this.free = [];
      for (let i = capacity - 1; i >= 0; i--) { this.free.push(i); this.items.push(null); }
      this.active = new Set();
    }
    spawn(x, y, z, chunk) {
      const i = this.free.pop();
      if (i === undefined) return -1;
      this.items[i] = { x, y, z, chunk, magnet: false };
      this.active.add(i);
      return i;
    }
    kill(i) {
      if (!this.items[i]) return;
      this.items[i] = null; this.active.delete(i); this.free.push(i);
      this.mesh.setMatrixAt(i, HIDE);
    }
    clear() { for (const i of [...this.active]) this.kill(i); this.mesh.instanceMatrix.needsUpdate = true; }
  }

  class Collectibles {
    constructor(scene) {
      this.scene = scene;
      // coin: flat square with pixel coin face, thin gold rim
      const coinGeo = new T.BoxGeometry(0.72, 0.72, 0.14);
      this.coins = new InstancedSet(scene, coinGeo, VR.Mat.get('coin'), 700);
      // rare bonus pickup: a voxel lemon (worth 5 coins)
      const lb = new VR.VoxelBuilder();
      lb.addColorBox(0, -0.3, 0, 0.62, 0.6, 0.78, 0xffd83a);        // body
      lb.addColorBox(0, -0.22, 0, 0.72, 0.44, 0.62, 0xffd83a);      // rounder middle
      lb.addColorBox(0, -0.12, -0.46, 0.26, 0.24, 0.16, 0xf2c223);  // pointed ends
      lb.addColorBox(0, -0.12, 0.46, 0.26, 0.24, 0.16, 0xf2c223);
      lb.addColorBox(-0.12, 0.12, -0.22, 0.14, 0.1, 0.18, 0xfff4a8); // shine
      lb.addColorBox(0, 0.3, 0.05, 0.08, 0.14, 0.08, 0x5a3a1e);     // stem
      lb.addColorBox(0.12, 0.38, 0.05, 0.3, 0.06, 0.18, 0x4f9e32);  // leaf
      const lemonGeo = lb.buildGeometries()[0].geometry;
      const lemonMat = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3000 });
      this.gems = new InstancedSet(scene, lemonGeo, lemonMat, 60);

      // power-up blocks (pooled meshes, one per type)
      this.pool = new VR.Pool(scene);
      const puGeo = new T.BoxGeometry(0.95, 0.95, 0.95);
      const edge = new T.EdgesGeometry(new T.BoxGeometry(1.1, 1.1, 1.1));
      for (const type in C.POWERUPS) {
        const mat = new T.MeshBasicMaterial({ map: VR.Tex.get('pu_' + type) });
        const lineMat = new T.LineBasicMaterial({ color: VR.POWERUP_COLORS[type] });
        this.pool.define('pu_' + type, () => {
          const g = new T.Group();
          g.add(new T.Mesh(puGeo, mat));
          g.add(new T.LineSegments(edge, lineMat));
          return g;
        });
      }
      this.powerups = [];

      // sparkle FX: 80 tiny cubes, instanced
      this.fx = new InstancedSet(scene, new T.BoxGeometry(0.14, 0.14, 0.14), new T.MeshBasicMaterial({ color: 0xffe28a }), 80);
      this.time = 0;
    }

    spawnCoin(x, y, z, chunk) { return this.coins.spawn(x, y, z, chunk); }
    spawnGem(x, y, z, chunk) { return this.gems.spawn(x, y, z, chunk); }
    spawnPowerUp(type, x, y, z, chunk) {
      const o = this.pool.get('pu_' + type);
      VR.track.toWorld(x, y, z, o.position);
      this.powerups.push({ type, x, y, z, chunk, obj: o });
    }

    releaseChunk(chunk) {
      for (const set of [this.coins, this.gems]) for (const i of [...set.active]) if (set.items[i].chunk === chunk) set.kill(i);
      this.powerups = this.powerups.filter(p => { if (p.chunk === chunk) { this.pool.release(p.obj); return false; } return true; });
    }
    clear() {
      this.coins.clear(); this.gems.clear(); this.fx.clear();
      for (const p of this.powerups) this.pool.release(p.obj);
      this.powerups.length = 0;
    }
    shift(dz) {
      for (const set of [this.coins, this.gems, this.fx]) for (const i of set.active) set.items[i].z += dz;
      for (const p of this.powerups) p.z += dz;          // the world itself doesn't move
    }

    burst(x, y, z, color) {
      for (let k = 0; k < 6; k++) {
        const i = this.fx.spawn(x, y, z, null);
        if (i < 0) return;
        const it = this.fx.items[i];
        const a = (k / 6) * Math.PI * 2;
        it.vx = Math.cos(a) * 3; it.vy = 2 + Math.sin(a) * 2; it.vz = 1.5; it.life = 0.35;
      }
    }

    update(dt, player, game) {
      this.time += dt;
      const tr = VR.track;
      const px = player.x, py = player.y + (player.sliding ? 0.4 : 0.9), pz = player.z;
      const magnet = game.powerups.active('magnet');
      const R2 = C.MAGNET_RADIUS * C.MAGNET_RADIUS;

      // --- coins
      e.set(0, this.time * 3.2, 0); q.setFromEuler(e);
      const coins = this.coins;
      const reach = player.sliding ? 0.8 : 1.2;
      for (const i of coins.active) {
        const c = coins.items[i];
        const dz = c.z - pz;
        if (dz > 6) { coins.kill(i); continue; }           // well behind the player
        if (magnet && !c.magnet && dz < 2 && dz > -C.MAGNET_RADIUS * 3) {
          const dx = c.x - px, dy = c.y - py;
          if (dx * dx + dy * dy + dz * dz * 0.25 < R2 * 1.2) c.magnet = true;
        }
        if (c.magnet) {
          const k = Math.min(1, dt * 14);
          c.x += (px - c.x) * k; c.y += (py - c.y) * k; c.z += (pz - c.z) * k;
        }
        if (Math.abs(c.z - pz) < 0.7 && Math.abs(c.x - px) < 0.75 && c.y > player.y - 0.3 && c.y < player.y + player.height + 0.3 * reach) {
          game.onCoin(1, c.x, c.y, c.z);
          coins.kill(i);
          continue;
        }
        tr.toWorld(c.x, c.y + Math.sin(this.time * 4 + c.z) * 0.06, c.z, v);
        m4.compose(v, q, s); coins.mesh.setMatrixAt(i, m4);
      }
      coins.mesh.instanceMatrix.needsUpdate = true;

      // --- gems
      e.set(0, -this.time * 2, 0); q.setFromEuler(e);
      for (const i of this.gems.active) {
        const g = this.gems.items[i];
        if (g.z - pz > 6) { this.gems.kill(i); continue; }
        if (magnet && Math.abs(g.z - pz) < C.MAGNET_RADIUS) g.magnet = true;
        if (g.magnet) { const k = Math.min(1, dt * 12); g.x += (px - g.x) * k; g.y += (py - g.y) * k; g.z += (pz - g.z) * k; }
        if (Math.abs(g.z - pz) < 0.8 && Math.abs(g.x - px) < 0.85 && g.y > player.y - 0.3 && g.y < player.y + player.height + 0.4) {
          game.onGem(g.x, g.y, g.z); this.gems.kill(i); continue;
        }
        tr.toWorld(g.x, g.y + Math.sin(this.time * 3) * 0.12, g.z, v);
        m4.compose(v, q, s); this.gems.mesh.setMatrixAt(i, m4);
      }
      this.gems.mesh.instanceMatrix.needsUpdate = true;

      // --- power-ups
      for (let k = this.powerups.length - 1; k >= 0; k--) {
        const p = this.powerups[k];
        p.obj.rotation.y = this.time * 2; p.obj.rotation.x = 0.35;
        tr.toWorld(p.x, p.y + Math.sin(this.time * 3 + p.z) * 0.15, p.z, p.obj.position);
        if (Math.abs(p.z - pz) < 0.9 && Math.abs(p.x - px) < 0.95 && p.y > player.y - 0.5 && p.y < player.y + player.height + 0.5) {
          game.onPowerUp(p.type, p.x, p.y, p.z);
          this.pool.release(p.obj); this.powerups.splice(k, 1);
        }
      }

      // --- sparkles
      const fx = this.fx;
      e.set(this.time * 5, this.time * 7, 0); q.setFromEuler(e);
      for (const i of fx.active) {
        const f = fx.items[i];
        f.life -= dt;
        if (f.life <= 0) { fx.kill(i); continue; }
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vy -= 12 * dt;
        tr.toWorld(f.x, f.y, f.z, v); const sc = f.life / 0.35; s.set(sc, sc, sc);
        m4.compose(v, q, s); fx.mesh.setMatrixAt(i, m4);
      }
      s.set(1, 1, 1);
      fx.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  VR.Collectibles = Collectibles;

  /* ------------------------------------------------------------------
   * Power-up state (timers). Add a new power-up by:
   *   1. adding it to CONFIG.POWERUPS
   *   2. drawing an icon in prefabs.js ICONS
   *   3. reading `game.powerups.active('yourId')` wherever it matters
   * ------------------------------------------------------------------ */
  class PowerUpState {
    constructor() { this.timers = {}; }
    reset() { this.timers = {}; }
    activate(type) { this.timers[type] = C.POWERUPS[type].duration * (VR.Shop ? VR.Shop.powerupFactor(type) : 1); }   // shop upgrades
    active(type) { return (this.timers[type] || 0) > 0; }
    remaining(type) { return Math.max(0, this.timers[type] || 0); }
    consume(type) { this.timers[type] = 0; }
    update(dt) { for (const k in this.timers) this.timers[k] -= dt; }
    list() { return Object.keys(this.timers).filter(k => this.timers[k] > 0); }
  }
  VR.PowerUpState = PowerUpState;
})();
