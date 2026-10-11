/* =====================================================================
 * MINI PLANET — the world you walk around (an adventure area).
 *
 *   area 'planet'           VR.ADVENTURE.areas.planet (def.planet: missions.js
 *                           gives it the spherical PlanetController; every
 *                           other area keeps the normal controller)
 *   environment             VR.MissionEnvironments.miniPlanet: the planet's
 *                           merged meshes (js/planet/miniplanet.js), a space
 *                           sky with stars, the windmill's sails, the glowing
 *                           crystal over the bottom of the planet
 *   component planetPortal  the way home beside the spawn → the main menu
 *
 * You come in from the main menu ("Mini Planet — الكوكب الصغير", modes.js
 * enterPlanet) on the top of the planet. The lap road runs from the top,
 * under the north arch, across the bottom (the stone circle) and back up
 * under the south arch to the start: walking it all sets planet_lap.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v);
  const t2 = (en, ar) => ({ en, ar });
  const own = (m) => { m.userData.own = true; return m; };
  const MP = () => VR.MiniPlanet;

  Object.assign(VR.I18N.STRINGS.en, {
    'menu.planet': 'Mini Planet — الكوكب الصغير', 'menu.planetSub': 'A tiny round world: walk all the way around it',
    'pl.back': 'Back to', 'pl.menu': 'the main menu', 'pl.arrive': 'Gravity pulls you to the planet\'s centre — walk any way you like, all the way around.',
    'pl.bottom': 'The bottom of the planet! Keep walking — the road goes back up to the start.', 'pl.lap': 'All the way around the planet!',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'menu.planet': 'Mini Planet — الكوكب الصغير', 'menu.planetSub': 'عالم صغير مستدير: امشِ حوله كله',
    'pl.back': 'العودة إلى', 'pl.menu': 'الواجهة الرئيسية', 'pl.arrive': 'الجاذبية تشدّك نحو مركز الكوكب — امشِ بأي اتجاه، وحوله كله.',
    'pl.bottom': 'أسفل الكوكب! تابع المشي — الطريق يرجع صعودًا إلى نقطة البداية.', 'pl.lap': 'درت حول الكوكب كله!',
  });

  // ------------------------------------------------------------------ the way home
  MS.Components.planetPortal = {
    build(def, ctx) {
      const lm = MP().landmark('portal'), fr = lm.frame, o = lm.dir.clone().multiplyScalar(lm.base);
      const root = new T.Group();
      root.matrixAutoUpdate = false;
      root.matrix.makeBasis(fr.x, fr.y, fr.z).setPosition(o);
      ctx.scene.add(root);
      const vb = new VR.VoxelBuilder();
      for (const x of [-1.25, 1.25]) vb.addBox(x, 0, 0, 0.45, 3.2, 0.5, 'stone_bricks');
      vb.addBox(0, 3.2, 0, 2.95, 0.45, 0.5, 'stone_bricks');
      vb.addBox(0, 3.65, 0, 0.6, 0.5, 0.5, 'lemon');
      vb.addBox(0, -0.02, 0, 2.95, 0.1, 1.0, 'cobble');
      root.add(vb.build());
      const curtainMat = own(new T.MeshBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false }));
      curtainMat.toneMapped = false;
      const curtain = new T.Mesh(new T.PlaneGeometry(2.05, 3.15), curtainMat); curtain.position.set(0, 1.62, 0); root.add(curtain);
      const glow = new T.PointLight(0xa8ecff, 5, 7, 2); glow.position.set(0, 1.8, 0.8); root.add(glow);
      const c = o.clone().addScaledVector(fr.y, 1.6);
      let t = 0;
      return {
        id: def.id, def, obj: root, kind: 'interact',
        hit: new T.Box3().setFromCenterAndSize(c, new T.Vector3(3.2, 3.4, 3.2)),
        prompt: () => ({ verb: tr('pl.back'), label: tr('pl.menu') }),
        use: () => { ctx.mgr.game.modes.leavePlanet(); },
        update: (dt) => { t += dt; curtainMat.opacity = 0.5 + Math.sin(t * 2.4) * 0.14; },
      };
    },
  };

  // ------------------------------------------------------------------ the world
  VR.MissionEnvironments.miniPlanet = function () {
    const P = MP().data();
    const L = new VR.MissionLevel('miniPlanet');
    L.ambient = { sky: 0xeef2ff, ground: 0xd6dcf4, intensity: 0.95, background: 0x070a1c, fog: null };
    L.sun = { color: 0xfff0d6, intensity: 1.1, dir: [0.5, 0.8, 0.35] };
    L.planet = true;
    const top = MP().terrainR(new T.Vector3(0, 1, 0));
    L.spawn = { pos: [0, top + 0.05, 0], yaw: 0 };              // the top of the planet, looking down the lap road (toward the south arch)
    const pl = MP().landmark('portal');
    L.anchor('portal', pl.dir.x * pl.base, pl.dir.y * pl.base, pl.dir.z * pl.base, 0);
    L.finish();
    L.group.add(MP().worldMesh());
    let stars = null, sails = null, crystal = null, fill = null, beam = null, lap = null;
    L.extras.build = (scene, mgr) => {
      // stars all round (they follow the camera: infinitely far)
      const n = 900, pos = new Float32Array(n * 3), r = rng(31);
      for (let i = 0; i < n; i++) { const v = new T.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(150); pos.set([v.x, v.y, v.z], i * 3); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      stars = new T.Points(g, own(new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
      stars.renderOrder = -1; scene.add(stars);
      // a soft fill from the other side: the planet's night side is never black
      fill = new T.DirectionalLight(0x9ab0ff, 0.9); fill.position.set(-0.5, -0.8, -0.35); scene.add(fill);
      // the windmill's sails (they turn)
      const wm = MP().landmark('windmill'), wf = wm.frame;
      const svb = new VR.VoxelBuilder();
      svb.addBox(0, -0.15, 0, 0.3, 0.3, 0.3, 'log');                // one bar of two sails; a second one turned 90°
      svb.addBox(0, 0, 0, 0.28, 3.4, 0.12, 'planks'); svb.addBox(0, -3.4, 0, 0.28, 3.4, 0.12, 'planks');
      svb.addBox(0.35, 0.6, 0, 0.5, 2.6, 0.06, 'wall'); svb.addBox(-0.35, -3.2, 0, 0.5, 2.6, 0.06, 'wall');
      const arm = () => svb.build();
      sails = new T.Group(); const s1 = arm(), s2 = arm(); s2.rotation.z = Math.PI / 2; sails.add(s1, s2);
      const hubM = new T.Group(); hubM.matrixAutoUpdate = false;
      hubM.matrix.makeBasis(wf.x, wf.y, wf.z).setPosition(wm.dir.clone().multiplyScalar(wm.base).addScaledVector(wf.y, 4.55).addScaledVector(wf.z, 1.55));
      hubM.add(sails); scene.add(hubM);
      // the crystal floating over the bottom of the planet
      const hg = MP().landmark('henge');
      crystal = new T.Mesh(new T.OctahedronGeometry(0.9, 0), own(new T.MeshBasicMaterial({ color: 0x9ff0ff, fog: false })));
      crystal.material.toneMapped = false;
      const cBase = hg.dir.clone().multiplyScalar(hg.base + 3.2);
      crystal.position.copy(cBase); crystal.userData.base = cBase; scene.add(crystal);
      const cl = new T.PointLight(0x9ff0ff, 8, 14, 2); cl.position.copy(hg.dir.clone().multiplyScalar(hg.base + 3)); scene.add(cl);
      // the beacon's lamp glows
      const bc = MP().landmark('beacon');
      beam = new T.PointLight(0xffe29a, 10, 16, 2); beam.position.copy(bc.dir.clone().multiplyScalar(bc.base + 9.2)); scene.add(beam);
      lap = { seen: {}, at: null };
    };
    L.extras.update = (dt, mgr) => {
      if (stars) stars.position.copy(mgr.camera.position);
      if (sails) sails.rotation.z += dt * 0.9;
      if (crystal) { const t = performance.now() / 1000; crystal.rotation.y = t * 0.8; crystal.position.copy(crystal.userData.base).addScaledVector(MP().landmark('henge').dir, Math.sin(t * 1.6) * 0.25); }
      if (beam) beam.intensity = 8 + Math.sin(performance.now() / 300) * 3;
      trackLap(lap, mgr);
    };
    L.extras.dispose = () => { stars = sails = crystal = fill = beam = lap = null; };
    return L;
  };
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  /** the lap: the top, the north arch side, the bottom, the south arch side, the top again (either way round) */
  function trackLap(lap, mgr) {
    const run = mgr.run, c = mgr.ctrl;
    if (!lap || !run || !c || !c.isPlanet || run.state !== 'active') return;
    const u = c.up, lat = Math.asin(Math.max(-1, Math.min(1, u.y))) * 180 / Math.PI;
    let at = null;
    if (lat > 78) at = 'N';
    else if (lat < -78) at = 'S';
    else if (Math.abs(lat) < 14 && Math.abs(u.x) < 0.2) at = u.z < 0 ? 'A' : 'B';
    if (!at || at === lap.at) return;
    lap.at = at;
    if (at === 'S') { lap.seen.S = true; if (!run.has('planet_bottom')) { run.setFlag('planet_bottom'); mgr.ui.caption(tr('pl.bottom'), 4); VR.Audio.play('success'); } }
    else if (at === 'A' || at === 'B') lap.seen[at] = true;
    else if (at === 'N') {
      if (lap.seen.A && lap.seen.B && lap.seen.S) {
        run.setFlag('planet_lap'); mgr.ui.caption(tr('pl.lap'), 4); VR.Audio.play('success');
        lap.laps = (lap.laps || 0) + 1;
      }
      lap.seen = {};
    }
    VR.MiniPlanet.lapState = { at, seen: Object.assign({}, lap.seen), laps: lap.laps || 0 };
  }

  // ------------------------------------------------------------------ the area
  VR.ADVENTURE.areas.planet = {
    id: 'planet', persistent: true, planet: true, noLocation: true, combat: false, weather: false, order: 40,
    environment: 'miniPlanet', view: 'tpp', viewKey: 'planetView',
    personalFlags: ['planet_bottom', 'planet_lap'],
    name: t2('Mini Planet', 'الكوكب الصغير'),
    eyebrow: t2('A tiny world in the sky', 'عالم صغير في السماء'),
    intro: t2('A planet so small you can walk all the way around it.', 'كوكب صغير لدرجة أنك تستطيع المشي حوله كله.'),
    objective: t2('Walk all the way around the planet', 'امشِ حول الكوكب كله'),
    chapters: [{ title: t2('Walk all the way around the planet', 'امشِ حول الكوكب كله'), objectives: [
      { text: t2('Walk down to the bottom of the planet (the stone circle)', 'انزل مشيًا إلى أسفل الكوكب (دائرة الحجارة)'), done: 'planet_bottom' },
      { text: t2('Follow the road all the way round, back to the start', 'اتبع الطريق حول الكوكب كله حتى نقطة البداية'), done: 'planet_lap' },
    ] }],
    hints: [], rules: [],
    entities: [{ id: 'exit', type: 'planetPortal' }],
  };
})();
