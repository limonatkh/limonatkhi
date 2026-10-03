/* =====================================================================
 * PREFABS — reusable voxel models: mountain obstacles, power-up icons,
 * the mission gate.
 * ---------------------------------------------------------------------
 * HOW TO ADD A NEW OBSTACLE: add an entry to VR.OBSTACLE_TYPES with
 *   build()      -> VoxelBuilder model (front at z = 0, extends to -length,
 *                   centred on x = 0)
 *   w, length    -> width across the route and depth along it (metres)
 *   colliders    -> boxes {x0,x1,y0,y1,z0,z1} relative to its centre/front
 *   kind         -> 'jump' | 'slide' | 'block' | 'step'
 *                   (used by the fairness check and the collision rules:
 *                    hitting a 'jump' obstacle makes you stumble, a second
 *                    hit while stumbling ends the run; 'block' and 'slide'
 *                    obstacles end the run when hit head-on)
 *   scalable     -> may be widened / narrowed to span a route
 * then use it from a recipe in patterns.js.
 * ===================================================================== */
(function () {
  // ---------------------------------------------------------------- mountain obstacles
  const MOSS = 'leaves';
  VR.OBSTACLE_TYPES = {
    rock_low: {                                      // JUMP over: a low band of jagged rocks
      kind: 'jump', w: 2.4, length: 0.9, standable: true, scalable: true,
      colliders: [{ x0: -1.2, x1: 1.2, y0: 0, y1: 0.95, z0: -0.9, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        vb.addBox(0, 0, -0.45, 2.4, 0.55, 0.9, 'cobble');
        vb.addBox(-0.7, 0.55, -0.4, 0.8, 0.4, 0.7, 'stone');
        vb.addBox(0.35, 0.55, -0.5, 0.9, 0.3, 0.75, 'stone');
        vb.addBox(0.95, 0.55, -0.35, 0.45, 0.35, 0.55, 'cobble');
        vb.addBox(-0.15, 0.55, -0.45, 0.5, 0.15, 0.6, MOSS);
        return vb;
      },
    },
    log: {                                           // JUMP over: a fallen pine trunk
      kind: 'jump', w: 3.6, length: 0.85, standable: true, scalable: true,
      colliders: [{ x0: -1.8, x1: 1.8, y0: 0, y1: 0.85, z0: -0.85, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        vb.addBox(0, 0.05, -0.42, 3.5, 0.75, 0.75, 'log');
        vb.addBox(0.3, 0.8, -0.42, 1.6, 0.08, 0.5, MOSS);
        vb.addBox(-1.85, 0, -0.42, 0.35, 1.0, 1.0, 'dirt');            // root plate
        vb.addBox(0.9, 0.55, -0.2, 0.18, 0.18, 0.6, 'log');            // broken branches
        vb.addBox(-0.6, 0.6, -0.65, 0.16, 0.45, 0.16, 'log');
        return vb;
      },
    },
    crevice: {                                       // JUMP over: a crack in the ground
      kind: 'jump', w: 2.6, length: 1.6, standable: false, scalable: true,
      colliders: [{ x0: -1.3, x1: 1.3, y0: -1.2, y1: 0.12, z0: -1.6, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        vb.addBox(0, -0.9, -0.8, 2.6, 0.93, 1.6, 'void');
        for (const [x, z, w] of [[-0.9, -0.05, 0.7], [0.2, -0.08, 0.9], [1.05, -0.04, 0.5], [-0.4, -1.55, 0.8], [0.8, -1.52, 0.7]]) vb.addBox(x, 0, z, w, 0.1, 0.16, 'cobble');
        return vb;
      },
    },
    arch: {                                          // SLIDE under: a stone lintel on two pillars
      kind: 'slide', w: 2.8, length: 0.6, standable: false, scalable: true,
      colliders: [{ x0: -1.4, x1: 1.4, y0: 1.05, y1: 3.4, z0: -0.6, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        for (const s of [-1, 1]) { vb.addBox(s * 1.2, 0, -0.3, 0.5, 2.4, 0.55, 'cobble'); vb.addBox(s * 1.2, 2.4, -0.3, 0.6, 0.8, 0.6, 'stone'); }
        vb.addBox(0, 1.15, -0.3, 2.9, 1.15, 0.55, 'stone');
        vb.addBox(0, 2.3, -0.3, 2.3, 0.18, 0.5, MOSS);
        vb.addBox(-0.5, 2.48, -0.3, 0.9, 0.5, 0.5, 'cobble');
        return vb;
      },
    },
    leaning: {                                       // SLIDE under: two leaning stone pillars
      kind: 'slide', w: 2.8, length: 0.7, standable: false, scalable: true,
      colliders: [{ x0: -1.4, x1: 1.4, y0: 1.05, y1: 3.4, z0: -0.7, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        for (const s of [-1, 1]) for (let i = 0; i < 6; i++) vb.addBox(s * (1.25 - i * 0.2), i * 0.5, -0.35, 0.55, 0.52, 0.6, i % 2 ? 'stone' : 'cobble');
        vb.addBox(0, 1.2, -0.35, 1.6, 1.0, 0.65, 'cobble');            // wedged block
        vb.addBox(0, 2.2, -0.35, 1.0, 0.6, 0.6, 'stone');
        return vb;
      },
    },
    boulder: {                                       // must go around
      kind: 'block', w: 2.3, length: 2.0, standable: true,
      colliders: [{ x0: -1.15, x1: 1.15, y0: 0, y1: 2.4, z0: -2.0, z1: 0 }],
      build() { return boulderModel(); },
    },
    pillar: {                                        // must go around: a rock pillar
      kind: 'block', w: 1.7, length: 1.5, standable: false,
      colliders: [{ x0: -0.85, x1: 0.85, y0: 0, y1: 4.6, z0: -1.5, z1: 0 }],
      build() {
        const vb = new VR.VoxelBuilder();
        vb.addBox(0, 0, -0.75, 1.7, 1.6, 1.5, 'cobble');
        vb.addBox(0.1, 1.6, -0.75, 1.45, 1.6, 1.3, 'stone');
        vb.addBox(-0.05, 3.2, -0.7, 1.2, 1.1, 1.1, 'cobble');
        vb.addBox(0, 4.3, -0.7, 0.8, 0.3, 0.8, MOSS);
        return vb;
      },
    },
    rockfall: {                                      // must go around: falls from the mountain as you come
      kind: 'block', w: 2.3, length: 2.0, standable: true, falls: true,
      colliders: [{ x0: -1.15, x1: 1.15, y0: 0, y1: 2.4, z0: -2.0, z1: 0 }],
      build() { return boulderModel(); },
    },
    step: {                                          // run up onto a rock shelf (ground height changes)
      kind: 'step', w: 2.6, length: 12, standable: true, ramp: { len: 5, h: 1.6 },
      colliders: [{ x0: -1.3, x1: 1.3, y0: 0, y1: 1.6, z0: -12, z1: -5 }],
      build() {
        const vb = new VR.VoxelBuilder();
        for (let i = 0; i < 5; i++) vb.addBox(0, 0, -(i + 0.5), 2.6, 0.32 * (i + 1), 1.0, { top: 'gravel', side: 'cobble' });
        vb.addBox(0, 0, -8.5, 2.6, 1.6, 7, { top: 'gravel', side: 'stone' });
        vb.addBox(-0.7, 1.6, -9.5, 0.6, 0.2, 2, MOSS);
        return vb;
      },
    },
  };
  function boulderModel() {
    const vb = new VR.VoxelBuilder();
    vb.addBox(0, 0, -1.0, 2.3, 0.9, 2.0, 'cobble');
    vb.addBox(-0.1, 0.9, -1.0, 2.1, 0.9, 1.9, 'stone');
    vb.addBox(0.1, 1.8, -1.05, 1.5, 0.6, 1.4, 'cobble');
    vb.addBox(0.3, 2.35, -1.0, 0.8, 0.12, 0.7, MOSS);
    return vb;
  }
  // dark ring that marks where a falling rock will land
  VR.buildFallMarker = function () {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(m); m.position.set(0, 0.04, -1.0);
    return g;
  };

  /**
   * The 1v1 gate stands beside the route on a rock pillar rising out of the
   * void, joined to the route edge by a short rock bridge. side: -1 = the
   * pillar is left of the route (bridge goes to +x), 1 = right of it.
   */
  VR.GATE_PEDESTAL_OFFSET = 4.4;                     // pillar centre -> route edge
  VR.buildGatePedestal = function (side) {
    const vb = new VR.VoxelBuilder();
    const o = VR.GATE_PEDESTAL_OFFSET;
    vb.addBox(0, -1.2, 0, 4.4, 1.2, 4.4, { top: 'gravel', side: 'cobble' });
    vb.addBox(0, -26, 0, 3.6, 24.8, 3.6, 'stone');
    vb.addBox(0.3, -50, 0.2, 2.6, 24, 2.6, 'cobble');
    vb.addBox(-side * (o / 2 + 0.6), -1.0, 0, o - 0.6, 1.0, 1.8, { top: 'gravel', side: 'cobble' });
    vb.addBox(-side * (o / 2 + 0.6), -2.4, 0, o - 1.6, 1.4, 1.2, 'stone');
    return vb;
  };

  // ---------------------------------------------------------------- collectibles
  // Power-up icons (16x16 pixel art)
  const ICONS = {
    magnet(c) {
      c.fillStyle = '#23313f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#e5433a'; c.fillRect(3, 3, 3, 9); c.fillRect(10, 3, 3, 9); c.fillRect(3, 10, 10, 3);
      c.fillStyle = '#dfe6ee'; c.fillRect(3, 2, 3, 2); c.fillRect(10, 2, 3, 2);
    },
    shield(c) {
      c.fillStyle = '#23313f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#5ec8ff'; c.fillRect(3, 2, 10, 7); c.fillRect(4, 9, 8, 2); c.fillRect(5, 11, 6, 2); c.fillRect(7, 13, 2, 1);
      c.fillStyle = '#d9f4ff'; c.fillRect(5, 4, 2, 5);
    },
    boost(c) {
      c.fillStyle = '#23313f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#ffc93c';
      for (let i = 0; i < 2; i++) { const o = i * 5; c.fillRect(3 + o, 3, 2, 2); c.fillRect(5 + o, 5, 2, 2); c.fillRect(7 + o, 7, 2, 2); c.fillRect(5 + o, 9, 2, 2); c.fillRect(3 + o, 11, 2, 2); }
    },
    double(c) {
      c.fillStyle = '#23313f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#7ee06a';
      c.fillRect(2, 4, 5, 2); c.fillRect(5, 6, 2, 2); c.fillRect(2, 8, 5, 2); c.fillRect(2, 10, 2, 2); c.fillRect(2, 12, 5, 2);
      c.fillRect(9, 7, 2, 2); c.fillRect(13, 7, 2, 2); c.fillRect(11, 9, 2, 2); c.fillRect(9, 11, 2, 2); c.fillRect(13, 11, 2, 2);
    },
    invincible(c) {
      c.fillStyle = '#23313f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#ffe066';
      c.fillRect(7, 2, 2, 3); c.fillRect(2, 6, 12, 2); c.fillRect(4, 8, 8, 2); c.fillRect(5, 10, 6, 2); c.fillRect(4, 12, 3, 2); c.fillRect(9, 12, 3, 2); c.fillRect(6, 5, 4, 1);
      c.fillStyle = '#fff6c4'; c.fillRect(7, 6, 2, 2);
    },
  };
  VR.POWERUP_ICONS = ICONS;
  VR.POWERUP_COLORS = { magnet: 0xe5433a, shield: 0x5ec8ff, boost: 0xffc93c, double: 0x7ee06a, invincible: 0xffe066 };
  for (const k in ICONS) VR.Tex.register('pu_' + k, ICONS[k]);

  // ---------------------------------------------------------------- mission gate
  // Sandstone arch with lemon blocks, a flowing lemon-light curtain, a
  // "MISSION n" sign and a spinning lemon on top.
  VR.buildMissionGate = function (def) {
    const g = new THREE.Group();
    const vb = new VR.VoxelBuilder();
    for (const s of [-1, 1]) {
      vb.addBox(s * 1.3, -0.1, 0, 0.6, 0.5, 0.9, 'cobble');
      vb.addBox(s * 1.3, 0.4, 0, 0.45, 3.7, 0.7, 'sandstone');
      for (const y of [1.2, 2.6]) vb.addBox(s * 1.3, y, 0, 0.5, 0.35, 0.75, 'lemon');
    }
    vb.addBox(0, 4.1, 0, 3.4, 0.6, 0.8, 'sandstone');
    vb.addBox(0, 4.7, 0, 1.0, 0.5, 0.8, 'lemon');
    vb.addBox(0, 4.1, 0.41, 3.0, 0.08, 0.02, 'hazard');
    g.add(vb.build());
    if (!VR.gateCurtainMat) {
      const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
      const c = cv.getContext('2d');
      for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
        const v = 0.55 + 0.45 * Math.sin((x * 0.5) + Math.sin(y * 0.3) * 2) * Math.cos(y * 0.2);
        c.fillStyle = `rgba(${255},${(220 + v * 35) | 0},${(60 + v * 120) | 0},${0.55 + v * 0.45})`;
        c.fillRect(x, y, 1, 1);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
      VR.gateCurtainMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
    }
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 3.7), VR.gateCurtainMat);
    curtain.position.set(0, 2.25, 0); g.add(curtain);
    const sign = VR.WorldText.make({ text: VR.t('gate.sign', { n: def.order }), style: 'sign', width: 2.0, size: 0.32 });
    sign.position.set(0, 5.45, 0.42); g.add(sign);
    const spinner = new THREE.Group();
    const lv = new VR.VoxelBuilder(); VR.Props.lemon(lv, 0, 0, 0, 2.2, true);
    spinner.add(lv.build()); spinner.position.set(0, 6.0, 0); g.add(spinner);
    g.userData.spinner = spinner;
    return g;
  };
})();
