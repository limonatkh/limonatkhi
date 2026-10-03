/* =====================================================================
 * BACKDROP — what makes the mountain world feel high up.
 * ---------------------------------------------------------------------
 *  - a SEA OF CLOUDS below the route (the mountain bodies vanish into it),
 *    with gaps that show the valley floor far below
 *  - a few clouds high above and around the peaks at the player's level
 *    (never close to the route, so they don't hide anything)
 *  - the VALLEY FLOOR ~100 m down
 *  - a ring of FAR PEAKS on the horizon, hazed toward the sky colour
 * All of it follows the camera horizontally, so it is endless; all of it
 * is voxel boxes. world.js builds the route's own cliffs and medium peaks.
 * ===================================================================== */
(function () {
  const T = THREE;
  const TILE = 520;                 // cloud tile size (wraps around the camera)
  const SEA_Y = -31, VALLEY_Y = -98;

  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  class Backdrop {
    constructor(scene) {
      this.scene = scene;
      const r = rng(4242);
      // ---- clouds: one instanced mesh of boxes (a cloud = a slab + puffs)
      this.clouds = [];
      const add = (x, y, z, w, h, d, kind) => this.clouds.push({ x, y, z, w, h, d, kind });
      for (let i = 0; i < 70; i++) {                       // the cloud sea
        const x = r() * TILE, z = r() * TILE, y = SEA_Y + (r() - 0.5) * 6;
        const w = 14 + r() * 26, d = 12 + r() * 22;
        add(x, y, z, w, 2.5 + r() * 2, d, 'sea');
        add(x + (r() - 0.5) * w * 0.4, y + 2.2, z + (r() - 0.5) * d * 0.4, w * 0.55, 2 + r() * 1.5, d * 0.5, 'sea');
      }
      for (let i = 0; i < 26; i++) {                       // high clouds
        const x = r() * TILE, z = r() * TILE, y = 34 + r() * 18, w = 18 + r() * 24, d = 12 + r() * 16;
        add(x, y, z, w, 2.4, d, 'high'); add(x + w * 0.2, y + 1.8, z, w * 0.5, 1.8, d * 0.6, 'high');
      }
      for (let i = 0; i < 30; i++) {                       // around the peaks, at your level (kept away from the route)
        const x = r() * TILE, z = r() * TILE, y = -14 + r() * 26, w = 10 + r() * 16, d = 8 + r() * 12;
        add(x, y, z, w, 2.2 + r() * 2, d, 'mid'); add(x + w * 0.15, y + 2, z, w * 0.5, 1.8, d * 0.55, 'mid');
      }
      const mat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8f9aa8 });
      this.cloudMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, this.clouds.length);
      this.cloudMesh.frustumCulled = false;
      this.cloudMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(this.cloudMesh);

      // ---- valley floor far below
      const vg = new T.PlaneGeometry(900, 900);
      const uv = vg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 225, uv.getY(i) * 225);
      this.valleyMat = new T.MeshLambertMaterial({ map: VR.Tex.get('grass_top'), color: 0x9fb39a });
      this.valley = new T.Mesh(vg, this.valleyMat);
      this.valley.rotation.x = -Math.PI / 2; this.valley.position.y = VALLEY_Y;
      scene.add(this.valley);

      // ---- far peaks on the horizon (vertex colours, hazed: not affected by fog)
      const vb = new VR.VoxelBuilder();
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.25;
        const rad = 200 + r() * 70;
        const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
        let w = 60 + r() * 50, y = VALLEY_Y;
        const top = -10 + r() * 80;
        const step = 13 + r() * 5;
        while (y < top && w > 6) {
          const snow = y > top - 22;
          vb.addColorBox(x + (r() - 0.5) * 6, y, z + (r() - 0.5) * 6, w, step, w * (0.8 + r() * 0.3), snow ? 0xf4f7fb : 0x8a8f99);
          y += step; w *= 0.78;
        }
      }
      this.peakMat = new T.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0xffffff });
      this.peaks = vb.build();
      this.peaks.children.forEach(m => { m.material = this.peakMat; m.frustumCulled = false; });
      scene.add(this.peaks);
      this.setBiome(VR.BIOMES.grassland, new T.Color(0xc2e2f7));
      this.drift = 0;
    }

    /** sky haze + valley ground follow the biome */
    setBiome(biome, fogColor) {
      // far peaks: their own colour pulled toward the haze
      this.peakMat.color.setRGB(0.5, 0.5, 0.52);
      this.peakMat.emissive.copy(fogColor).multiplyScalar(0.52);
      const key = biome && biome.valley || 'grass_top';
      if (this.valleyKey !== key) { this.valleyKey = key; this.valleyMat.map = VR.Tex.get(key); this.valleyMat.needsUpdate = true; }
    }

    update(dt, camPos) {
      this.drift += dt * 1.6;
      const m = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3();
      const cx = camPos.x, cz = camPos.z;
      const wrap = (v, c) => { let d = ((v - c) % TILE + TILE * 1.5) % TILE - TILE / 2; return c + d; };
      this.clouds.forEach((c, i) => {
        const x = wrap(c.x + this.drift, cx), z = wrap(c.z, cz);
        let visible = true;
        if (c.kind === 'mid') { const dx = x - cx, dz = z - cz; visible = dx * dx + dz * dz > 85 * 85; }
        p.set(x, c.y + c.h / 2, z);
        if (visible) s.set(c.w, c.h, c.d); else s.set(0, 0, 0);
        m.compose(p, q, s);
        this.cloudMesh.setMatrixAt(i, m);
      });
      this.cloudMesh.instanceMatrix.needsUpdate = true;
      this.valley.position.x = Math.round(cx / 4) * 4; this.valley.position.z = Math.round(cz / 4) * 4;
      this.peaks.position.set(cx, 0, cz);
    }
    setVisible(on) { this.cloudMesh.visible = this.valley.visible = this.peaks.visible = on; }
  }
  VR.Backdrop = Backdrop;
})();
