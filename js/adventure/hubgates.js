/* =====================================================================
 * HUB GATES — the square is the game's home: what used to be buttons on
 * the main menu is reached by walking to it.
 *
 *   { id, type: 'hubGate', pos, yaw, action, style: 'portal' | 'door', color, label, icon }
 *     action  fight       the fight menu (1v1, vs the computer, fighters, loot…)
 *             challenge   challenge a friend (the live race)
 *             billiards   / basketball   mini-games for coins (their rules come next;
 *                         for now the entrance says so)
 *
 * Using a gate: fade out, the screen it leads to; when you are done you are
 * back in front of the same gate (game.backToHub).
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);

  Object.assign(VR.I18N.STRINGS.en, {
    'hub.fight': 'FIGHT', 'hub.challenge': 'CHALLENGE A FRIEND', 'hub.billiards': 'BILLIARDS', 'hub.basketball': 'BASKETBALL',
    'hub.enter': 'Enter', 'menu.play': 'PLAY', 'hub.soon': '{name}: the game is being built — coming very soon!', 'hub.view': 'View: first / third person',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'hub.fight': 'القتال', 'hub.challenge': 'تحدَّ صديقًا', 'hub.billiards': 'البلياردو', 'hub.basketball': 'كرة السلة',
    'hub.enter': 'ادخل', 'menu.play': 'ابدأ اللعب', 'hub.soon': '{name}: اللعبة قيد البناء — قريبًا جدًا!', 'hub.view': 'الكاميرا: من عيون اللاعب / من خلفه',
  });

  /* ------------------------------------------------------------------
   * THE SQUARE'S GATE MODELS (v1.45) — shared by the hub's gates, the
   * runner portal (portal.js) and the sky-island gates on the Portal
   * Terrace (loot.js secretPortal with skin 'hub'). Front = +z, base y 0;
   * the sizes match each gate's colliders and hit boxes.
   * ------------------------------------------------------------------ */
  const DARK = 0x2f3542, NAVY = 0x2b3a67, TRIM = 0x485063;
  const glowMat = () => { const m = new T.MeshBasicMaterial({ vertexColors: true }); m.toneMapped = false; m.userData.own = true; return m; };
  /** two builders: lit blocks + glowing blocks (unlit) */
  function kit() {
    const lit = new VR.VoxelBuilder(), glow = new VR.VoxelBuilder();
    const done = () => {
      const g = new T.Group(); g.add(lit.build());
      if (!glow.isEmpty()) { const m = glow.build(); m.traverse(o => { if (o.isMesh) { o.material = glowMat(); o.userData.noShadow = true; } }); g.add(m); }
      return g;
    };
    return { L: (...a) => lit.addColorBox(...a), G: (...a) => glow.addColorBox(...a), done };
  }
  const ringOf = (G, r, y, n, size, col, z = 0) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; G(Math.cos(a) * r, y + Math.sin(a) * r - size / 2, z, size, size, size, col); } };
  VR.HubPortals = {
    /** an energy gate: two angled pylons with light strips, a beam, a ring of light inside (fight, challenge, basketball) */
    energy(col) {
      const k = kit();
      k.L(0, 0, 0, 4.4, 0.22, 1.7, DARK); k.G(0, 0.22, 0.86, 4.2, 0.04, 0.04, col);
      for (const s of [-1, 1]) {
        k.L(s * 1.85, 0.22, 0, 0.6, 3.9, 0.75, NAVY); k.L(s * 1.85, 0.22, 0, 0.72, 0.4, 0.86, DARK);
        k.G(s * 1.53, 0.7, 0.2, 0.06, 3.1, 0.12, col); k.G(s * 1.85, 3.0, 0.39, 0.3, 0.3, 0.04, col);
      }
      k.L(0, 4.1, 0, 4.4, 0.5, 0.8, NAVY); k.G(0, 4.25, 0.41, 3.6, 0.08, 0.04, col);
      ringOf(k.G, 1.42, 2.05, 24, 0.16, col, 0.05);
      return k.done();
    },
    /** an arcade door: a dark glass door in a neon frame (billiards) */
    arcadeDoor(col) {
      const k = kit();
      k.L(0, 0, 0, 2.9, 3.35, 0.32, DARK);
      k.L(0, 0, 0.17, 2.0, 2.8, 0.06, 0x24324a);
      k.G(0, 1.15, 0.21, 1.6, 0.08, 0.02, col); k.G(0, 1.9, 0.21, 1.6, 0.08, 0.02, col);
      for (const s of [-1, 1]) k.G(s * 1.25, 0.1, 0.17, 0.1, 3.0, 0.06, col);
      k.G(0, 3.0, 0.17, 2.6, 0.1, 0.06, col);
      k.L(0.68, 1.3, 0.22, 0.12, 0.3, 0.08, 0xffd84a);
      return k.done();
    },
    /** the runner course: a plinth, two pylons with yellow light (the big turning ring is the square's: hubworld.js) */
    runner(col = 0xffe14a) {
      const k = kit();
      k.L(0, 0, 0, 4.0, 0.22, 1.6, DARK); k.G(0, 0.22, 0.81, 3.8, 0.04, 0.04, col);
      for (const s of [-1, 1]) { k.L(s * 1.6, 0.22, 0, 0.5, 3.6, 0.62, NAVY); k.G(s * 1.33, 0.6, 0.15, 0.05, 2.9, 0.1, col); k.L(s * 1.6, 3.82, 0, 0.66, 0.2, 0.74, DARK); }
      return k.done();
    },
    /** a time gate (the sky islands): two obelisks of stacked lights, a stepped top, small floating lights */
    timeGate(col) {
      const k = kit();
      k.L(0, 0, 0, 3.6, 0.18, 1.4, DARK); k.G(0, 0.18, 0.71, 3.4, 0.04, 0.04, col);
      for (const s of [-1, 1]) {
        k.L(s * 1.35, 0.18, 0, 0.42, 3.4, 0.5, TRIM);
        for (let i = 0; i < 5; i++) k.G(s * 1.35, 0.5 + i * 0.6, 0.26, 0.26, 0.3, 0.02, col);
        k.L(s * 1.35, 3.58, 0, 0.56, 0.22, 0.6, DARK);
      }
      k.L(0, 3.4, 0, 3.1, 0.28, 0.5, DARK); k.L(0, 3.68, 0, 1.9, 0.26, 0.46, TRIM); k.G(0, 3.94, 0, 0.5, 0.22, 0.3, col);
      for (const [x, y] of [[-0.7, 4.5], [0.5, 4.75], [0, 5.1]]) k.G(x, y, 0, 0.18, 0.18, 0.18, col);
      return k.done();
    },
  };
  const portalFrame = (color) => VR.HubPortals.energy(color);
  const doorFrame = (color) => VR.HubPortals.arcadeDoor(color);

  MS.Components.hubGate = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const door = def.style === 'door', col = def.color || 0xffe14a;
      const m = door ? doorFrame(col) : portalFrame(col);
      m.position.copy(pos); m.rotation.y = yaw; ctx.scene.add(m);
      let curtain = null, mat = null;
      if (!door) {
        mat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false });
        mat.userData.own = true; mat.toneMapped = false;
        curtain = new T.Mesh(new T.PlaneGeometry(2.7, 3.45), mat); curtain.geometry.userData.own = true;
        curtain.position.set(0, 1.85, 0); m.add(curtain);
        const glow = new T.PointLight(col, 6, 6, 2); glow.position.set(0, 1.8, 0.8); m.add(glow);
      }
      const sign = VR.WorldText.make({ text: (def.icon ? def.icon + ' ' : '') + tr(def.label), style: 'sign', size: 0.22, width: 3.4 });
      sign.position.set(0, door ? 3.75 : 4.45, door ? 0.2 : 0.32); m.add(sign);
      // posts / frame are solid; the opening is "used", not walked through
      const f = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new T.Vector3(f.z, 0, -f.x);
      const half = door ? 1.35 : 1.85, depth = door ? 0.2 : 0.3;
      const c0 = pos.clone().addScaledVector(r, -half), c1 = pos.clone().addScaledVector(r, half);
      ctx.level.solids.push({ min: [Math.min(c0.x, c1.x) - Math.abs(f.x) * depth - 0.01, 0, Math.min(c0.z, c1.z) - Math.abs(f.z) * depth - 0.01],
        max: [Math.max(c0.x, c1.x) + Math.abs(f.x) * depth + 0.01, door ? 3.2 : 4.1, Math.max(c0.z, c1.z) + Math.abs(f.z) * depth + 0.01], enabled: true, owner: def.id, seeThrough: !door });
      let t = Math.random() * 6;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        hit: new T.Box3().setFromCenterAndSize(pos.clone().add(new T.Vector3(0, 1.6, 0)).addScaledVector(f, 0.3), new T.Vector3(Math.abs(r.x) * 3 + 0.8, 3.4, Math.abs(r.z) * 3 + 0.8)),
        prompt: () => ({ verb: tr('hub.enter'), label: tr(def.label) }),
        use: (run) => {
          // back in front of the gate, facing away from it, when you come back
          const back = pos.clone().addScaledVector(f, 2.2);
          const at = { area: run.def.id, pos: [+back.x.toFixed(2), 0.05, +back.z.toFixed(2)], yaw: +(yaw + Math.PI).toFixed(3) };
          ctx.mgr.game.hubAction(def.action, at, L(tr(def.label)));
        },
        update: (dt) => { t += dt; if (mat) mat.opacity = 0.52 + Math.sin(t * 2.6) * 0.12; },
        sync: () => {},
      };
      return e;
    },
  };

  // the gates in the square (x -14..14, z -55..-31): two portals on the sides, a door and a portal for the mini-games
  VR.HUB_GATES = [
    { id: 'gFight', type: 'hubGate', pos: [-12.2, 0, -33.4], yaw: Math.PI / 2, action: 'fight', label: 'hub.fight', icon: '⚔', color: 0xc9b2ff },
    { id: 'gChallenge', type: 'hubGate', pos: [-12.2, 0, -52.6], yaw: Math.PI / 2, action: 'challenge', label: 'hub.challenge', icon: '🏁', color: 0x7fe8ff },
    { id: 'gBasket', type: 'hubGate', pos: [29.6, 0, -57.0], yaw: -Math.PI / 2, action: 'basketball', label: 'hub.basketball', icon: '🏀', color: 0xff9a3a },
    { id: 'gBilliards', type: 'hubGate', style: 'door', pos: [31.8, 0, -66.5], yaw: -Math.PI / 2, action: 'billiards', label: 'hub.billiards', icon: '🎱', color: 0x3f8a2b },
  ];
  // add them to the start area's definition (js/adventure/hub.js)
  const hub = VR.ADVENTURE && VR.ADVENTURE.areas && VR.ADVENTURE.areas.hub;
  if (hub && !hub.entities.some(e => e.type === 'hubGate')) hub.entities.push(...VR.HUB_GATES);
})();
// where "home" puts you: just inside the square, facing the fountain
VR.ADVENTURE = Object.assign(VR.ADVENTURE || {}, { HOME: { pos: [0, 0.05, -34.5], yaw: 0 } });
