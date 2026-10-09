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

  function portalFrame(color) {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    for (const x of [-1.6, 1.6]) vb.addColorBox(x, 0, 0, 0.5, 3.6, 0.6, 0x4a4f5d);
    vb.addColorBox(0, 3.6, 0, 3.7, 0.5, 0.6, 0x4a4f5d);
    vb.addColorBox(0, 0, 0, 3.7, 0.12, 1.2, 0x2a2f3d);
    for (const x of [-1.6, 1.6]) vb.addColorBox(x, 3.0, 0.31, 0.3, 0.3, 0.02, color);
    g.add(vb.build());
    return g;
  }
  function doorFrame(color) {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, 0, 0, 2.7, 3.2, 0.3, 0x5a3a20);                 // frame
    vb.addColorBox(0, 0, 0.16, 2.0, 2.8, 0.06, 0x7a4c28);             // leaf
    vb.addColorBox(0.65, 1.25, 0.21, 0.15, 0.15, 0.08, 0xd9a90f);     // handle
    vb.addColorBox(0, 2.95, 0.2, 2.2, 0.18, 0.04, color);             // a coloured lintel
    g.add(vb.build());
    return g;
  }

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
    { id: 'gFight', type: 'hubGate', pos: [-9.4, 0, -49.5], yaw: Math.PI / 2, action: 'fight', label: 'hub.fight', icon: '⚔', color: 0xc9b2ff },
    { id: 'gChallenge', type: 'hubGate', pos: [9.4, 0, -49.5], yaw: -Math.PI / 2, action: 'challenge', label: 'hub.challenge', icon: '🏁', color: 0x7fe8ff },
    { id: 'gBasket', type: 'hubGate', pos: [9.4, 0, -43.2], yaw: -Math.PI / 2, action: 'basketball', label: 'hub.basketball', icon: '🏀', color: 0xff9a3a },
    { id: 'gBilliards', type: 'hubGate', style: 'door', pos: [13.8, 0, -48], yaw: -Math.PI / 2, action: 'billiards', label: 'hub.billiards', icon: '🎱', color: 0x3f8a2b },
  ];
  // add them to the start area's definition (js/adventure/hub.js)
  const hub = VR.ADVENTURE && VR.ADVENTURE.areas && VR.ADVENTURE.areas.hub;
  if (hub && !hub.entities.some(e => e.type === 'hubGate')) hub.entities.push(...VR.HUB_GATES);
})();
// where "home" puts you: just inside the square, facing the fountain
VR.ADVENTURE = Object.assign(VR.ADVENTURE || {}, { HOME: { pos: [0, 0.05, -34.5], yaw: 0 } });
