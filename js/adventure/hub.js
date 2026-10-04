/* =====================================================================
 * ADVENTURE — START AREA (hub). The first place a NEW GAME puts you in,
 * in first person. It teaches the basics in order:
 *
 *   start yard   → read the welcome sign                 (interaction)
 *   corridor     → a line of coins, a low wall to jump    (movement, coins)
 *   courtyard    → three numbered marks on the walls, a chest with symbol
 *                  dials, a key, a keyhole by the gate     (a simple puzzle)
 *   plaza        → the big square behind the gate, with the doors that
 *                  will lead to the other areas (closed for now)
 *
 * The area is a PERSISTENT mission definition (def.persistent): it uses
 * the same components, flags and UI as missions m1-m5, but it is never
 * "completed" — its state is saved and restored (missions.js).
 *
 * New component
 *   coins     coins floating in the world; walking through one pays it
 *             into the shared wallet once (txId world:<area>:<id>)
 * New environment
 *   hub       the geometry above (VR.MissionEnvironments.hub)
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const tint = (t, c) => VR.Mat.tinted(t, c);
  const PI = Math.PI;

  // ------------------------------------------------------------------ text
  Object.assign(VR.I18N.STRINGS.en, {
    'menu.newGame': 'NEW GAME', 'menu.continue': 'CONTINUE', 'menu.runner': 'RUNNER COURSE',
    'menu.runnerNote': 'The runner course is reached from here for now; later it opens from a portal in the world.',
    'adv.confirmTitle': 'Start a new game?', 'adv.confirmText': 'Your saved adventure, coins and progress will be replaced. A copy of the old save is kept on this device.',
    'adv.confirmYes': 'START NEW GAME', 'adv.confirmNo': 'CANCEL',
    'adv.savedNote': 'Your progress and position are saved automatically.', 'adv.toMenu': 'SAVE AND GO TO MAIN MENU',
    't.coin': '+{n} coin', 'adv.area': 'Adventure',
    'adv.enter': 'Enter', 'adv.doorNeeds': 'Locked. Finish «{name}» first.', 'adv.allDone': 'Everything here is done for now',
    'mi.r.return.adv': 'BACK TO THE SQUARE', 'mi.p.leaveNote.adv': 'Leaving takes you back to the square without a reward. The door stays open.',
    'mi.f.text.adv': 'The mission failed. Try again, or go back to the square (no reward).',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'menu.newGame': 'لعبة جديدة', 'menu.continue': 'متابعة', 'menu.runner': 'مضمار الجري',
    'menu.runnerNote': 'مضمار الجري متاح من هنا مؤقتًا؛ لاحقًا يُفتح من بوابة داخل العالم.',
    'adv.confirmTitle': 'بدء لعبة جديدة؟', 'adv.confirmText': 'سيُستبدل تقدّمك المحفوظ وعملاتك. تبقى نسخة من الحفظ القديم على هذا الجهاز.',
    'adv.confirmYes': 'ابدأ لعبة جديدة', 'adv.confirmNo': 'إلغاء',
    'adv.savedNote': 'يُحفظ تقدّمك ومكانك تلقائيًا.', 'adv.toMenu': 'احفظ وارجع للقائمة الرئيسية',
    't.coin': '+{n} عملة', 'adv.area': 'المغامرة',
    'adv.enter': 'ادخل', 'adv.doorNeeds': 'مقفل. أكمل «{name}» أولًا.', 'adv.allDone': 'أنجزت كل شيء هنا حاليًا',
    'mi.r.return.adv': 'العودة إلى الساحة', 'mi.p.leaveNote.adv': 'المغادرة تعيدك إلى الساحة بلا مكافأة. يبقى الباب مفتوحًا.',
    'mi.f.text.adv': 'فشلت المهمة. حاول مجددًا، أو عُد إلى الساحة (بلا مكافأة).',
  });

  /* ==================================================================
   * COMPONENT: coins
   *   { id, type: 'coins', points: [[x,y,z], …], value: 1 }
   * Each coin has its own flag (coin_<id>_<i>) and wallet txId, so it is
   * paid once and stays gone after a reload.
   * ================================================================ */
  let coinGeo = null;
  const areaSave = (area) => { const a = VR.Profiles.player().progress.areas; return a[area] || (a[area] = {}); };
  const wasTaken = (area, key) => (areaSave(area).coins || []).includes(key);
  const markTaken = (area, key) => { const s = areaSave(area); (s.coins || (s.coins = [])).push(key); };
  MS.Components.coins = {
    build(def, ctx) {
      if (!coinGeo) { coinGeo = new T.BoxGeometry(0.42, 0.42, 0.08); coinGeo.userData.shared = true; }
      const mat = VR.Mat.get('coin');
      const area = ctx.mgr.run.def.id;
      const coins = def.points.map((p, i) => {
        const m = new T.Mesh(coinGeo, mat);
        m.position.set(p[0], p[1], p[2]);
        ctx.scene.add(m);
        return { m, i, key: `${def.id}_${i}`, flag: `coin_${def.id}_${i}`, tx: `world:${area}:${def.id}_${i}`, taken: false, y: p[1] };
      });
      let t = Math.random() * 6;
      return {
        id: def.id, def, obj: null, kind: null, hit: null, prompt: () => null, use: () => {},
        coins,
        sync: (run) => { for (const c of coins) { if (run.has(c.flag) || wasTaken(area, c.key)) c.taken = true; c.m.visible = !c.taken; } },
        update: (dt, run) => {
          t += dt;
          const ctrl = ctx.mgr.ctrl, p = ctrl.pos;
          const playing = run.state === 'active';
          for (const c of coins) {
            if (c.taken) continue;
            c.m.rotation.y = t * 2.4 + c.i * 0.5;
            c.m.position.y = c.y + Math.sin(t * 2 + c.i) * 0.05;
            if (!playing) continue;
            const dx = c.m.position.x - p.x, dz = c.m.position.z - p.z;
            const dy = c.m.position.y - p.y;
            if (dx * dx + dz * dz < 0.7 * 0.7 && dy > -0.3 && dy < ctrl.height + 0.15) {
              c.taken = true; c.m.visible = false;
              const value = def.value || 1;
              markTaken(area, c.key);                      // remembered by the player (also inside missions, whose flags reset)
              VR.Wallet.of().credit(value, c.tx, 'world');
              VR.Audio.play('coin');
              run.setFlag(c.flag);
            }
          }
        },
      };
    },
  };

  /* ==================================================================
   * COMPONENT: areaDoor — a door to another area (a mission)
   *   { id, type: 'areaDoor', at, mission: 'm1', name }
   * The lamp above it: red = locked, yellow = open, green = done.
   * Using an open door fades out, plays the mission and brings you back
   * to the same door (js/core/modes.js). Locked: says what opens it.
   * ================================================================ */
  MS.Components.areaDoor = {
    build(def, ctx) {
      const { pos } = MS.resolveAt(ctx.level, def);
      const mgr = ctx.mgr;
      const lampMat = new T.MeshBasicMaterial({ color: 0x333333 }); lampMat.userData.own = true;
      const lamp = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.12), lampMat);
      lamp.position.set(pos.x, 3.0, pos.z + 0.08);
      ctx.scene.add(lamp);
      const mission = () => mgr.byId(def.mission);
      const state = () => {
        const m = mission(); if (!m) return 'locked';
        if (mgr.progress.completed[m.id]) return 'done';
        return mgr.isUnlocked(m) ? 'open' : 'locked';
      };
      const COL = { locked: 0xe5433a, open: 0xffd23c, done: 0x5fdc5f };
      const e = {
        id: def.id, def, obj: lamp, kind: 'interact',
        hit: new T.Box3(new T.Vector3(pos.x - 1.0, 0, pos.z - 0.1), new T.Vector3(pos.x + 1.0, 2.8, pos.z + 0.18)),
        prompt: () => {
          const st = state();
          if (st === 'locked') return { verb: tr('v.inspect'), label: L(def.name), kindOverride: 'inspect' };
          return { verb: tr('adv.enter'), label: L(def.name) + (st === 'done' ? ' ✓' : '') };
        },
        use: (run) => {
          if (state() === 'locked') {
            const m = mission();
            const need = m && (m.requires || []).map(id => mgr.byId(id)).find(r => r && !mgr.progress.completed[r.id]);
            VR.Audio.play('buzz');
            mgr.ui.caption(need ? tr('adv.doorNeeds', { name: L(need.name) }) : tr('c.gateLocked'), 3);
            return;
          }
          mgr.game.modes.enterMission(def.mission, { area: run.def.id, pos: [pos.x, 0, pos.z + 2.2], yaw: PI });
        },
        sync: () => { lampMat.color.setHex(COL[state()]); },
      };
      return e;
    },
  };

  /* ==================================================================
   * ENVIRONMENT: hub
   * North is -Z (yaw 0 looks north). Walls carry tall invisible colliders
   * so a burst jump never leaves the area.
   * ================================================================ */
  function hub() {
    const L = new VR.MissionLevel('hub');
    const M = VR.MissionModels;
    L.ambient = { sky: 0xcfe4ff, ground: 0x6a5a40, intensity: 0.95, background: 0x9cc8ee, fog: [0x9cc8ee, 45, 130] };
    L.sun = { color: 0xfff0d2, intensity: 0.95, dir: [0.5, 1, 0.35] };
    const STONE = 'stone_bricks', TOP = 40;
    /** a wall: visible block of height h, collider up to TOP */
    const wall = (x0, z0, x1, z1, h = 3.4, mat = STONE) => {
      L.box(x0, 0, z0, x1, h, z1, mat, false);
      L.box(x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.25, z1 + 0.05, 'cobble', false);   // cap
      L.collider(x0, -1, z0, x1, TOP, z1);
    };
    const floor = (x0, z0, x1, z1, mat) => L.box(x0, -0.5, z0, x1, 0, z1, mat);

    // ---- start yard (x -4..4, z -1..8)
    floor(-4, -1, 4, 8, 'grass_top');
    wall(-4.4, -1, -4, 8.4); wall(4, -1, 4.4, 8.4); wall(-4.4, 8, 4.4, 8.4);
    wall(-4.4, -1.4, -1.6, -1); wall(1.6, -1.4, 4.4, -1);                    // north side, corridor opening
    L.place(M.barrel(), -3.3, 0, 7.2); L.place(M.crate(1.0), 3.2, 0, 7.1, 0.3);
    L.place(M.lampPost(4), 3.3, 0, 2.5, -PI / 2, true, 0.12);
    L.light(2.7, 3.7, 2.5, 0xffe6b8, 10, 9);
    L.anchor('welcome', -2.9, 1.75, -0.95, 0);
    L.spawn = { pos: [0, 0, 5.5], yaw: 0 };

    // ---- corridor (x -1.6..1.6, z -15..-1) with a low wall to jump
    floor(-1.6, -15, 1.6, -1, 'cobble');
    wall(-2.0, -15, -1.6, -1, 3.2); wall(1.6, -15, 2.0, -1, 3.2);
    L.box(-1.6, 0, -9.0, 1.6, 1.3, -8.4, 'brick');                             // 1.3 m: needs a jump
    L.box(-1.6, 0.0, -8.25, 1.6, 0.02, -8.15, tint('concrete', 0xf2c230), false);   // painted line before it
    L.anchor('wallSign', 0, 0.75, -8.38, 0);
    L.light(0, 2.8, -5, 0xffe2a8, 8, 7); L.light(0, 2.8, -12, 0xffe2a8, 8, 7);

    // ---- courtyard (x -8..8, z -31..-15)
    floor(-8, -31.4, 8, -15, 'cobble');
    wall(-8.4, -15.4, -1.6, -15, 4); wall(1.6, -15.4, 8.4, -15, 4);
    // west wall with a LOW GAP (1.05 m: crouch or slide) into a hidden nook, half hidden by crates
    wall(-8.4, -31, -8, -19.6, 4); wall(-8.4, -18.4, -8, -15.4, 4); wall(8, -31, 8.4, -15.4, 4);
    L.box(-8.4, 1.05, -19.6, -8, 4, -18.4, STONE, false); L.collider(-8.4, 1.05, -19.6, -8, TOP, -18.4);
    // the nook (x -12..-8.4, z -21..-17), roofed
    floor(-12, -21, -8.4, -17, 'planks');
    wall(-12.4, -21.4, -12, -16.6, 2.4); wall(-12.4, -21.4, -8.4, -21, 2.4); wall(-12.4, -17, -8.4, -16.6, 2.4);
    L.box(-12.4, 2.4, -21.4, -8.0, 2.7, -16.6, 'planks', false); L.collider(-12.4, 2.4, -21.4, -8.0, TOP, -16.6);
    L.place(M.crate(1.0), -11.4, 0, -20.4, 0.2); L.place(M.barrel(), -11.5, 0, -17.6);
    L.place(M.hangingLamp(0.5), -10.2, 2.4, -19, 0, false);
    L.light(-10.2, 1.8, -19, 0xffc880, 7, 5);
    L.anchor('nookNote', -11.97, 1.4, -19, PI / 2);
    floor(-8.4, -19.6, -8, -18.4, 'cobble');                                  // under the gap
    wall(-8.4, -31.4, -2.5, -31, 4.4); wall(2.5, -31.4, 8.4, -31, 4.4);       // north wall, gate gap 5 m
    L.box(-2.7, 3.4, -31.4, 2.7, 4.4, -31, STONE, false);                      // lintel over the gate
    L.anchor('gate', 0, 0, -31.2, 0);
    // three numbered marks (east, west, north walls)
    L.anchor('mark1', 7.95, 1.9, -18.5, -PI / 2);
    L.anchor('mark2', -7.95, 1.9, -25.5, PI / 2);
    L.anchor('mark3', -5.3, 1.9, -30.95, 0);
    // chest + its note, keyhole beside the gate
    L.anchor('chest', 5.4, 0, -27.6, 0);
    L.box(3.9, 0, -29.0, 6.9, 0.25, -26.4, 'planks', false);                   // a little platform
    L.anchor('chestNote', 5.4, 1.65, -30.95, 0);
    L.box(4.6, 0.9, -31.0, 6.2, 2.4, -30.97, 'planks', false);                 // board behind the note
    L.anchor('keyhole', 3.3, 1.3, -30.95, 0);
    // props: low cover and a tree
    L.place(M.crate(1.2), -5.6, 0, -18.2, 0.2); L.place(M.crate(1.2), -6.2, 0, -18.6, 0.6);
    L.place(M.barrel(), 6.9, 0, -16.3); L.place(M.barrel(), 6.1, 0, -16.2);
    L.box(-4.3, 0, -24.3, -3.7, 2.6, -23.7, 'log');                            // tree trunk
    L.box(-5.4, 2.6, -25.4, -2.6, 4.6, -22.6, 'leaves', false);
    L.collider(-5.4, 2.6, -25.4, -2.6, 4.6, -22.6);
    for (const [x, z, yaw] of [[-7.4, -21, PI / 2], [7.4, -24, -PI / 2]]) {
      L.place(M.lampPost(4.2), x, 0, z, yaw, true, 0.12);
      L.light(x + Math.sin(yaw) * 0.6, 3.9, z + Math.cos(yaw) * 0.6, 0xffe6b8, 14, 11);
    }

    // ---- plaza (x -14..14, z -55..-31), behind the gate
    floor(-14, -55, 14, -31.4, 'grass_top');
    L.box(-2.2, -0.01, -45, 2.2, 0.005, -31.4, 'cobble', false);              // path to the fountain
    wall(-14.4, -31.4, -8.4, -31, 4); wall(8.4, -31.4, 14.4, -31, 4);
    // west wall: the gate to the training arena
    wall(-14.4, -55, -14, -44.5, 4.4); wall(-14.4, -41.5, -14, -31.4, 4.4);
    L.box(-14.4, 3.2, -44.7, -14, 4.4, -41.3, STONE, false); L.collider(-14.4, 3.2, -44.7, -14, TOP, -41.3);
    floor(-14.4, -44.5, -14, -41.5, 'cobble');
    L.anchor('arenaGate', -14.2, 0, -43, PI / 2);
    L.anchor('shop', 8.4, 0, -37.6, 0);                                      // the shop stall, facing the gate
    L.anchor('arenaSign', -13.95, 3.75, -43, -PI / 2);
    L.anchor('arenaRespawn', -11.8, 0, -43, PI / 2);
    L.anchor('pistolRack', -12.4, 0, -38.6, PI / 2);
    L.box(-13.2, 0, -39.4, -11.6, 0.6, -37.8, 'planks');                     // a little table for the first weapon
    L.anchor('arenaNote', -13.97, 1.7, -36.4, -PI / 2);
    arena(L, wall, floor, TOP);
    // east wall with a hidden gate (opens with the symbol panel) to the garden
    wall(14, -55, 14.4, -44.5, 4.4); wall(14, -41.5, 14.4, -31.4, 4.4);
    L.box(14, 3.2, -44.7, 14.4, 4.4, -41.3, STONE, false); L.collider(14, 3.2, -44.7, 14.4, TOP, -41.3);
    L.anchor('gardenGate', 14.2, 0, -43, PI / 2);
    floor(14, -44.5, 14.4, -41.5, 'cobble');                                  // under the garden gate
    L.anchor('panel', 13.92, 1.15, -39.2, -PI / 2);
    L.box(13.9, 0.6, -40.2, 14.0, 2.6, -36.2, 'planks', false);                // board for the panel and its note
    L.anchor('panelNote', 13.88, 1.6, -37.0, -PI / 2);
    // the garden (x 14.4..24, z -50..-36)
    floor(14.4, -50, 24, -36, 'grass_top');
    wall(24, -50.4, 24.4, -35.6, 3.6); wall(14.4, -50.4, 24.4, -50, 3.6); wall(14.4, -36, 24.4, -35.6, 3.6);
    for (const [x, z] of [[17, -38.2], [21.6, -47.6], [21.8, -38.4]]) {
      L.box(x - 0.3, 0, z - 0.3, x + 0.3, 2.2, z + 0.3, 'log');
      L.box(x - 1.3, 2.2, z - 1.3, x + 1.3, 3.8, z + 1.3, tint('leaves', 0x8fd04a), false);
    }
    L.box(19.6, 0, -44.2, 21.4, 0.5, -41.8, 'sandstone');                      // pedestal
    L.anchor('gardenPrize', 20.5, 0.5, -43, -PI / 2);
    L.anchor('gardenNote', 23.95, 1.6, -45.6, -PI / 2);
    L.light(20.5, 3, -43, 0xfff2b0, 10, 10);
    wall(-14.4, -55.4, 14.4, -55, 5);
    // fountain
    L.box(-2.6, 0, -47.6, 2.6, 0.7, -42.4, 'sandstone');
    L.box(-2.2, 0.5, -47.2, 2.2, 0.62, -42.8, 'water', false);
    L.box(-0.4, 0.7, -45.4, 0.4, 2.2, -44.6, 'sandstone');
    L.light(0, 3.2, -45, 0xcfe8ff, 10, 9);
    // five doors in the north wall (the other areas; closed for now)
    L.extras.doors = [];
    [-10, -5, 0, 5, 10].forEach((x, i) => {
      L.box(x - 1.35, 0, -55.0, x + 1.35, 3.2, -54.75, 'log', false);          // frame
      L.box(x - 1.0, 0, -54.78, x + 1.0, 2.8, -54.7, tint('planks', 0x6a4424), false);   // door leaf
      L.box(x + 0.6, 1.25, -54.72, x + 0.75, 1.4, -54.62, 'iron', false);       // handle
      L.anchor('door' + (i + 1), x, 0, -54.74, 0);
      L.anchor('doorMark' + (i + 1), x, 2.15, -54.66, 0);
      L.anchor('doorSign' + (i + 1), x, 3.75, -54.7, 0);
      L.extras.doors.push({ x, z: -54.7 });
    });
    for (const [x, z] of [[-12.5, -34], [12.5, -34], [-12.5, -52], [12.5, -52]]) {
      L.place(M.lampPost(4.6), x, 0, z, x < 0 ? PI / 2 : -PI / 2, true, 0.12);
      L.light(x + (x < 0 ? 0.6 : -0.6), 4.3, z, 0xffe6b8, 16, 13);
    }
    return L.finish();
  }
  /* ---- the training arena (x -40..-14.4, z -54..-32), west of the square */
  function arena(L, wall, floor, TOP) {
    const M = VR.MissionModels;
    floor(-40, -54, -14.4, -32, 'gravel');
    wall(-40.4, -54.4, -14.4, -54, 5); wall(-40.4, -32, -14.4, -31.6, 5); wall(-40.4, -54, -40, -32, 5);
    const low = (x0, z0, x1, z1, h = 1.1) => L.box(x0, 0, z0, x1, h, z1, 'brick');
    low(-24.3, -47.5, -23.7, -44.5); low(-24.3, -41.5, -23.7, -38.5);              // low cover near the middle
    low(-31, -52, -28, -51.4); low(-31, -34.6, -28, -34);
    for (const [x, z] of [[-30, -38.5], [-30, -47.5], [-33, -43]]) L.box(x - 0.6, 0, z - 0.6, x + 0.6, 3.2, z + 0.6, 'stone_bricks');   // pillars
    L.place(M.crate(1.2), -19.5, 0, -40.2, 0.2); L.place(M.crate(1.2), -19.4, 0, -46.0, 0.5);
    L.place(M.crate(1.2), -35.6, 0, -50.8, 0.3); L.place(M.barrel(), -26.5, 0, -33.2); L.place(M.barrel(), -26.5, 0, -52.8);
    // sniper platform (north-west) with steps
    L.box(-39.6, 0, -36.2, -35.4, 2.0, -32.4, 'planks');
    for (let i = 0; i < 5; i++) L.box(-35.4 + i * 0.5, 0, -35.6, -34.9 + i * 0.5, 2.0 - i * 0.4, -34.0, 'planks');
    L.box(-39.6, 2.0, -36.3, -35.4, 2.9, -36.2, 'iron', false); L.collider(-39.6, 2.0, -36.3, -35.4, 2.9, -36.2);   // railing
    L.anchor('sniperSpot', -37.6, 2.0, -34.2, -PI / 2);
    L.anchor('shotgunSpot', -20.6, 0, -50.4, -PI / 2);
    L.anchor('smgSpot', -20.6, 0, -35.6, -PI / 2);
    L.anchor('nadeSpot', -27.0, 0, -50.2, -PI / 2);
    L.anchor('ammo1', -16.0, 0, -52.6, 0); L.anchor('ammo2', -16.0, 0, -33.4, 0);
    L.anchor('arenaZone', -20.5, 0, -43, 0);
    L.anchor('bell', -16.4, 0, -47.6, 0);
    for (const [x, z] of [[-17, -34], [-17, -52], [-38, -52], [-38, -40]]) {
      L.place(M.lampPost(4.6), x, 0, z, x < -30 ? -PI / 2 : PI / 2, true, 0.12);
      L.light(x + (x < -30 ? 0.6 : -0.6), 4.3, z, 0xffe6b8, 16, 14);
    }
  }
  VR.MissionEnvironments.hub = hub;

  /* ==================================================================
   * AREA DEFINITION
   * ================================================================ */
  // the five doors lead to the five missions; their names come from the mission data
  const DOOR_NAMES = [1, 2, 3, 4, 5].map(n => { const m = VR.MISSIONS.find(d => d.id === 'm' + n); return m ? m.name : { en: 'Door ' + n, ar: 'الباب ' + n }; });
  const AR_NUM = ['١', '٢', '٣', '٤', '٥'];
  const DOOR_MARKS = ['leaf', 'sun', 'moon', 'drop', 'star'];     // shown on a door once its area is done

  const HUB = {
    id: 'hub', persistent: true, combat: true, order: 0, environment: 'hub',
    name: { en: 'Lemon Square', ar: 'ساحة الليمون' },
    eyebrow: { en: 'Adventure', ar: 'المغامرة' },
    intro: {
      en: 'You wake up in a small yard. A corridor leads north to a closed gate, and behind it a big square with doors. Look around, read what is written, and find a way through.',
      ar: 'تصحو في ساحة صغيرة. ممرّ يقود شمالًا إلى بوابة مغلقة، وخلفها ساحة كبيرة فيها أبواب. تفقّد المكان، اقرأ ما هو مكتوب، وجد طريقك للعبور.',
    },
    objective: { en: 'Open the gate to the big square', ar: 'افتح البوابة إلى الساحة الكبرى' },
    chapters: [{ title: { en: 'Open the gate to the big square', ar: 'افتح البوابة إلى الساحة الكبرى' }, objectives: [
      { text: { en: 'Read the sign in the yard', ar: 'اقرأ اللوحة في الساحة' }, done: 'read_welcome' },
      { text: { en: 'Get over the low wall in the corridor', ar: 'اعبر الجدار المنخفض في الممر' }, done: 'crossed_wall' },
      { text: { en: 'Find the three numbered marks', ar: 'جد العلامات الثلاث المرقّمة' }, done: ['read_mark1', 'read_mark2', 'read_mark3'] },
      { text: { en: 'Open the chest', ar: 'افتح الصندوق' }, done: 'hub_chest_open' },
      { text: { en: 'Take the key', ar: 'خذ المفتاح' }, done: 'got_hub_key' },
      { text: { en: 'Unlock the gate', ar: 'افتح قفل البوابة' }, done: 'plaza_open' },
      { text: { en: 'Enter the big square', ar: 'ادخل الساحة الكبرى' }, done: 'in_plaza' },
    ] }, {
      title: { en: 'Training arena', ar: 'ساحة التدريب' },
      objectives: [
        { text: { en: 'Take the pistol by the arena gate', ar: 'خذ المسدس عند بوابة الساحة' }, done: 'got_weapon_pistol' },
        { text: { en: 'Clear the training arena', ar: 'طهّر ساحة التدريب' }, done: 'arena_clear' },
      ],
    }, {
      title: { en: 'Go through the five doors', ar: 'اعبر الأبواب الخمسة' },
      objectives: DOOR_NAMES.map((n, i) => ({ text: { en: `Door ${i + 1}: ${n.en}`, ar: `الباب ${AR_NUM[i]}: ${n.ar}` }, done: 'done_m' + (i + 1) })),
    }, {
      title: { en: 'The doors remember', ar: 'الأبواب تتذكّر' },
      objectives: [
        { text: { en: 'Open the hidden gate in the square', ar: 'افتح البوابة المخفية في الساحة' }, done: 'garden_open' },
        { text: { en: 'Enter the garden', ar: 'ادخل الحديقة' }, done: 'in_garden' },
        { text: { en: 'Take the garden lemon', ar: 'خذ ليمونة الحديقة' }, done: 'got_gardenLemon' },
      ],
    }],
    hints: [],
    entities: [
      { id: 'welcome', type: 'text', at: 'welcome', style: 'chalk', size: 0.15, width: 2.0,
        title: { en: 'Sign', ar: 'لوحة' },
        text: { en: 'Welcome to Lemon Square.\nGo north, jump the low wall, collect the coins.\nThe gate opens for whoever reads the walls.',
                ar: 'أهلًا في ساحة الليمون.\nاتجه شمالًا، اقفز فوق الجدار المنخفض واجمع العملات.\nالبوابة تنفتح لمن يقرأ الجدران.' } },
      { id: 'wallSign', type: 'text', at: 'wallSign', style: 'stencil', size: 0.16, width: 2.6, inspect: false,
        text: { en: 'JUMP', ar: 'اقفز' } },
      { id: 'c_corridor', type: 'coins', points: [[0, 1.0, -2.5], [0, 1.0, -4], [0, 1.0, -5.5], [0, 1.0, -7]] },
      { id: 'c_wall', type: 'coins', points: [[0, 2.15, -7.9], [0, 2.5, -8.7], [0, 2.15, -9.5]] },
      { id: 'c_after', type: 'coins', points: [[0, 1.0, -11], [0, 1.0, -12.5], [0, 1.0, -14]] },
      { id: 'crossedWall', type: 'zone', at: 'wallSign', offset: [0, -0.75, -2.6], size: [3.2, 3, 1.4], flag: 'crossed_wall' },
      { id: 'mark1', type: 'text', at: 'mark1', style: 'paint', size: 0.42, width: 1.8,
        title: { en: 'Mark 1', ar: 'العلامة ١' }, text: { en: '1  {star}', ar: '١  {star}' } },
      { id: 'mark2', type: 'text', at: 'mark2', style: 'paint', size: 0.42, width: 1.8,
        title: { en: 'Mark 2', ar: 'العلامة ٢' }, text: { en: '2  {drop}', ar: '٢  {drop}' } },
      { id: 'mark3', type: 'text', at: 'mark3', style: 'paint', size: 0.42, width: 1.8,
        title: { en: 'Mark 3', ar: 'العلامة ٣' }, text: { en: '3  {lemon}', ar: '٣  {lemon}' } },
      { id: 'chestNote', type: 'text', at: 'chestNote', style: 'paper', size: 0.075, width: 1.3,
        title: { en: 'Note', ar: 'ورقة' },
        text: { en: 'The marks are numbered.\nRead them in order.', ar: 'العلامات مرقّمة.\nاقرأها بالترتيب.' } },
      { id: 'chest', type: 'symbolLock', at: 'chest', offset: [0, 0.25, 0], name: { en: 'Locked chest', ar: 'صندوق مقفل' },
        symbols: ['lemon', 'moon', 'leaf', 'star', 'sun', 'drop'], solution: ['star', 'drop', 'lemon'], opens: 'hub_chest_open',
        lockText: { en: 'Three dials, numbered 1, 2, 3.', ar: 'ثلاثة أقراص مرقّمة ١، ٢، ٣.' } },
      { id: 'hubKey', type: 'item', at: 'chest', offset: [0, 0.75, 0], item: 'hub_key', model: 'starKey',
        name: { en: 'Gate key', ar: 'مفتاح البوابة' }, showWhen: 'hub_chest_open' },
      { id: 'keyhole', type: 'keyhole', at: 'keyhole', item: 'hub_key', flag: 'plaza_open',
        name: { en: 'Gate lock', ar: 'قفل البوابة' },
        emptyText: { en: 'The gate lock. It needs a key.', ar: 'قفل البوابة. يحتاج مفتاحًا.' },
        okText: { en: 'The lock turns. The gate opens.', ar: 'دار القفل. انفتحت البوابة.' } },
      { id: 'gate', type: 'gate', at: 'gate', w: 5, h: 3.4, openWhen: 'plaza_open', name: { en: 'Gate', ar: 'البوابة' },
        closedText: { en: 'Locked. There is a keyhole beside it.', ar: 'مقفلة. بجانبها قفل.' } },
      { id: 'inPlaza', type: 'zone', at: 'gate', offset: [0, 0, -3.2], size: [10, 4, 3], flag: 'in_plaza', requires: 'plaza_open' },
      { id: 'c_court', type: 'coins', points: [[-6.6, 1.8, -18.6], [-3.0, 1.0, -21], [3.0, 1.0, -21], [0, 1.0, -26]] },
      { id: 'c_plaza', type: 'coins', points: [[-3.6, 1.0, -45], [3.6, 1.0, -45], [0, 1.0, -41.4], [0, 1.0, -48.6], [-10, 1.0, -38], [11.6, 1.0, -38]] },
      ...DOOR_NAMES.map((n, i) => ({
        id: 'doorSign' + (i + 1), type: 'text', at: 'doorSign' + (i + 1), style: 'sign', size: 0.21, width: 3.4, inspect: false,
        text: { en: `${i + 1} · ${n.en}`, ar: `${AR_NUM[i]} · ${n.ar}` },
      })),
      ...DOOR_NAMES.map((n, i) => ({ id: 'door' + (i + 1), type: 'areaDoor', at: 'door' + (i + 1), mission: 'm' + (i + 1), name: n })),
      // a door you have been through shows a sign: the clue for the hidden gate
      ...DOOR_MARKS.map((sym, i) => ({
        id: 'doorMark' + (i + 1), type: 'text', at: 'doorMark' + (i + 1), style: 'paint', size: 0.62, width: 1.4,
        title: { en: `Sign on door ${i + 1}`, ar: `علامة الباب ${AR_NUM[i]}` }, text: `{${sym}}`, showWhen: 'done_m' + (i + 1),
      })),
      { id: 'panelNote', type: 'text', at: 'panelNote', style: 'paper', size: 0.07, width: 1.3,
        title: { en: 'Note by the panel', ar: 'ورقة بجانب اللوحة' },
        text: { en: 'The doors remember who went through them.\nPress the signs of doors 1, 2 and 3, in order.',
                ar: 'الأبواب تتذكّر من عبرها.\nاضغط علامات الأبواب ١ ثم ٢ ثم ٣ بالترتيب.' } },
      { id: 'panel', type: 'buttonPanel', at: 'panel', symbols: ['lemon', 'moon', 'leaf', 'star', 'sun', 'drop'],
        solution: DOOR_MARKS.slice(0, 3), flag: 'garden_open' },
      { id: 'gardenGate', type: 'gate', at: 'gardenGate', w: 3, h: 3.2, openWhen: 'garden_open', name: { en: 'Old gate', ar: 'بوابة قديمة' },
        closedText: { en: 'An old gate without a lock. Maybe the panel beside it…', ar: 'بوابة قديمة بلا قفل. ربما اللوحة بجانبها…' } },
      { id: 'inGarden', type: 'zone', at: 'gardenGate', offset: [0, 0, 2.6], size: [3, 4, 3], flag: 'in_garden', requires: 'garden_open' },
      { id: 'gardenLemon', type: 'item', at: 'gardenPrize', offset: [0, 0.35, 0], name: { en: 'Garden lemon', ar: 'ليمونة الحديقة' },
        model: 'goldenLemon', bonus: true },
      { id: 'c_garden', type: 'coins', value: 5, points: [[17, 1.0, -41], [17, 1.0, -45], [22.5, 1.0, -43]] },
      { id: 'gardenNote', type: 'text', at: 'gardenNote', style: 'chalk', size: 0.12, width: 1.8,
        title: { en: 'Garden board', ar: 'لوحة الحديقة' },
        text: { en: 'You found the hidden garden.\nMore of the world opens soon.', ar: 'وجدت الحديقة المخفية.\nأجزاء أخرى من العالم تُفتح قريبًا.' } },
      // ---- the shop stall in the square (js/adventure/shop.js)
      { id: 'shop', type: 'shopkeeper', at: 'shop' },
      // ---- training arena: the first weapon outside, the rest inside, and a fight in three waves
      { id: 'arenaSignTxt', type: 'text', at: 'arenaSign', style: 'sign', size: 0.21, width: 3.0, inspect: false,
        text: { en: 'Training arena', ar: 'ساحة التدريب' } },
      { id: 'arenaNote', type: 'text', at: 'arenaNote', style: 'paper', size: 0.07, width: 1.4,
        title: { en: 'Arena rules', ar: 'قواعد الساحة' },
        text: { en: 'Take the pistol and walk in.\nGuards keep their distance, runners rush you,\nand the heavy one is weak only on its back.\nG throws an impulse grenade.',
                ar: 'خذ المسدس وادخل.\nالحرّاس يبقون على مسافة، والعدّاؤون يندفعون نحوك،\nأما الثقيل فنقطة ضعفه في ظهره فقط.\nG ترمي قنبلة دفع.' } },
      { id: 'pistolRack', type: 'weaponPickup', at: 'pistolRack', offset: [0, 0.6, 0], weapon: 'pistol' },
      { id: 'shotgunPick', type: 'weaponPickup', at: 'shotgunSpot', weapon: 'shotgun' },
      { id: 'smgPick', type: 'weaponPickup', at: 'smgSpot', weapon: 'smg' },
      { id: 'sniperPick', type: 'weaponPickup', at: 'sniperSpot', weapon: 'sniper' },
      { id: 'nadePick', type: 'weaponPickup', at: 'nadeSpot', weapon: 'nade' },
      { id: 'ammo1', type: 'ammoCrate', at: 'ammo1' }, { id: 'ammo2', type: 'ammoCrate', at: 'ammo2' },
      { id: 'arenaGate', type: 'gate', at: 'arenaGate', w: 3, h: 3.2, openWhen: ['plaza_open', '!arena_fight'], closes: true,
        name: { en: 'Arena gate', ar: 'بوابة الساحة' }, closedText: { en: 'Closed until the fight is over.', ar: 'مغلقة حتى ينتهي القتال.' } },
      { id: 'arena', type: 'encounter', zone: { at: 'arenaZone', size: [3, 4, 8] }, bellAt: 'bell', respawn: 'arenaRespawn',
        flag: 'arena_clear', reward: 60,
        waves: [
          [{ type: 'normal', at: [-34, -38.6], yaw: -PI / 2 }, { type: 'normal', at: [-34, -47.4], yaw: -PI / 2 }],
          [{ type: 'fast', at: [-37, -50], yaw: -PI / 2 }, { type: 'fast', at: [-37, -38], yaw: -PI / 2 }, { type: 'normal', at: [-36.5, -43], yaw: -PI / 2 }],
          [{ type: 'heavy', at: [-36.5, -43], yaw: -PI / 2 }, { type: 'fast', at: [-34, -52.4], yaw: -PI / 2 }, { type: 'normal', at: [-32, -33.4], yaw: -PI / 2 }],
        ] },
      // the hidden nook behind the courtyard's low gap
      { id: 'c_nook', type: 'coins', value: 2, points: [[-9.6, 0.6, -18.2], [-10.4, 0.6, -19.0], [-9.6, 0.6, -19.8]] },
      { id: 'nookNote', type: 'text', at: 'nookNote', style: 'paper', size: 0.07, width: 1.2,
        title: { en: 'Scribbled note', ar: 'ورقة مخربشة' },
        text: { en: 'Not every door is a door.\nIn the big square, the east wall has a gate without a lock.',
                ar: 'ليس كل باب بابًا.\nفي الساحة الكبرى، في الجدار الشرقي بوابة بلا قفل.' } },
    ],
    rules: [],
  };

  // a few coins in each mission area too, near where you arrive (paid once per player)
  const MISSION_COINS = {
    m1: [[-5.51, 1, 1.96], [-4.71, 1, -1.14], [-4.32, 1, -2.69], [-3.92, 1, -4.24]],
    m2: [[0, 1, 1.6], [1.2, 1, -1.6], [0, 1, -3.2]],
    m3: [[-13.14, 1, 10.04], [-12.05, 1, 8.87], [-10.96, 1, 7.7], [-9.86, 1, 6.52]],
    m4: [[-4.64, 1, 4.34], [-3.55, 1, 3.17], [-2.46, 1, 2], [-1.36, 1, 0.82]],
    m5: [[0, 1, 3.2], [0, 1, 1.6], [0, 1, 0], [0, 1, -1.6]],
  };
  for (const id in MISSION_COINS) {
    const d = VR.MISSIONS.find(m => m.id === id);
    if (d && !d.entities.some(e => e.id === 'c_arrival')) d.entities.push({ id: 'c_arrival', type: 'coins', points: MISSION_COINS[id] });
  }

  VR.ADVENTURE = Object.assign(VR.ADVENTURE || {}, { areas: { hub: HUB }, START: 'hub' });
})();
