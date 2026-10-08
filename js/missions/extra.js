/* =====================================================================
 * MISSIONS 4 & 5 — extra models, components and environments.
 * Built on the same pieces as missions 1-3 (Level, anchors, flags,
 * components); nothing in the existing missions changes.
 *
 * New components
 *   videoScreen   a TV in the room; using it plays a channel clip (video.js)
 *   floorTiles    a floor of tiles; one hides something. Wrong tiles stay put
 *                 (and count as a mistake once each).
 *   keyhole       uses an inventory item to set a flag (e.g. a vault key)
 *   cupboard      small cupboard with doors that open (cards inside it,
 *                 on top of it, or fallen off it are ordinary `text` entities)
 * New environments
 *   starhall      Mission 4: tiled hall, sunrise / sunset paintings, vault
 *   wordroom      Mission 5: classroom with four coloured cupboards
 * ===================================================================== */
(function () {
  const T = THREE;
  const MM = VR.MissionModels;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const tint = (t, c) => VR.Mat.tinted(t, c);

  Object.assign(VR.I18N.STRINGS.en, {
    'n.tile': 'Floor tile', 'v.lift': 'Try to lift', 'v.open': 'Open', 'v.use': 'Use',
    'c.tileStuck': 'The tile is stuck fast.', 'c.tileLoose': 'The tile comes loose! Something is underneath.',
    'c.keyholeEmpty': 'A star-shaped keyhole. It needs a key.',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'n.tile': 'بلاطة', 'v.lift': 'حاول رفع', 'v.open': 'افتح', 'v.use': 'استخدم',
    'c.tileStuck': 'البلاطة ثابتة في مكانها.', 'c.tileLoose': 'البلاطة تتحرّك! هناك شيء تحتها.',
    'c.keyholeEmpty': 'ثقب مفتاح على شكل نجمة. يحتاج إلى مفتاح.',
  });

  // ------------------------------------------------------------------ models
  function vbGroup(fn) { const vb = new VR.VoxelBuilder(); fn(vb); const g = new T.Group(); g.add(vb.build()); return g; }

  /** TV on a low cabinet. Front (+Z) shows the channel card on the screen. */
  MM.tvSet = function (title) {
    const g = vbGroup(vb => {
      vb.addBox(0, 0, 0, 1.6, 0.6, 0.55, tint('planks', 0x5a3a22));          // cabinet
      vb.addBox(0, 0.6, 0, 0.3, 0.12, 0.25, 'iron');                          // stand
      vb.addBox(0, 0.72, 0, 1.5, 0.92, 0.14, tint('iron', 0x24262b));        // TV body
    });
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300;
    const c = cv.getContext('2d');
    const grd = c.createLinearGradient(0, 0, 0, 300); grd.addColorStop(0, '#203047'); grd.addColorStop(1, '#0e111a');
    c.fillStyle = grd; c.fillRect(0, 0, 512, 300);
    c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(256, 112, 52, 0, Math.PI * 2); c.fill();             // play button
    c.fillStyle = '#0e111a'; c.beginPath(); c.moveTo(240, 86); c.lineTo(240, 138); c.lineTo(284, 112); c.closePath(); c.fill();
    c.fillStyle = '#ffe14a'; c.font = '700 34px "Cairo", sans-serif'; c.textAlign = 'center'; c.direction = 'rtl';
    c.fillText('قناة ليمونات', 256, 210);
    if (title) { c.fillStyle = '#f4f1e6'; c.font = '700 26px "Cairo", sans-serif'; c.fillText(title, 256, 254, 480); }
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.MeshBasicMaterial({ map: tex }); mat.toneMapped = false; mat.userData.own = true;
    const screen = new T.Mesh(new T.PlaneGeometry(1.36, 0.8), mat);
    screen.position.set(0, 1.18, 0.075); g.add(screen);
    g.userData.screen = screen;
    return g;
  };
  /** Small cupboard with two doors. Inside shelf at 0.42 m, top at 1.1 m. */
  MM.cupboard = function (color) {
    const W = 1.0, H = 1.1, D = 0.6;
    const wood = tint('plaster', color), dark = tint('planks', 0x2a1d12);     // painted wood: clear, bright colours
    const g = vbGroup(vb => {
      vb.addBox(0, 0, 0, W, 0.08, D, wood);                                  // bottom
      vb.addBox(0, H - 0.08, 0, W + 0.06, 0.08, D + 0.04, wood);            // top
      for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) vb.addBox(x, 0, 0, 0.08, H, D, wood);
      vb.addBox(0, 0, -D / 2 + 0.03, W, H, 0.06, dark);                     // back
      vb.addBox(0, 0.38, 0, W - 0.1, 0.04, D - 0.08, wood);                 // shelf
      vb.addBox(0, 0.08, 0, W - 0.16, 0.3, D - 0.12, dark);                 // shadow under the shelf
    });
    const doors = [];
    for (const s of [-1, 1]) {
      const pivot = new T.Group(); pivot.position.set(s * (W / 2 - 0.02), 0.08, D / 2);
      const door = vbGroup(vb => {
        vb.addBox(-s * 0.24, 0, 0.02, 0.47, H - 0.18, 0.04, wood);
        vb.addBox(-s * 0.4, 0.45, 0.05, 0.05, 0.12, 0.04, 'brass');
      });
      pivot.add(door); g.add(pivot); doors.push({ pivot, s });
    }
    g.userData.doors = doors;
    return g;
  };
  MM.starKey = function () {
    const g = vbGroup(vb => {
      vb.addBox(0, 0, 0, 0.05, 0.05, 0.34, 'brass');
      vb.addBox(0, 0, 0.12, 0.05, 0.1, 0.04, 'brass');
      vb.addBox(0, 0, 0.06, 0.05, 0.07, 0.04, 'brass');
    });
    const st = MM.symbolPlane('star', 0.2); st.position.set(0, 0.03, -0.24); st.rotation.y = Math.PI / 2; g.add(st);
    const st2 = MM.symbolPlane('star', 0.2); st2.position.set(0, 0.03, -0.24); st2.rotation.y = -Math.PI / 2; g.add(st2);
    return g;
  };
  MM.starPlate = function () {
    const g = vbGroup(vb => { vb.addBox(0, 0, 0, 0.62, 0.62, 0.08, 'brass'); vb.addBox(0, 0.1, 0.03, 0.42, 0.42, 0.06, tint('iron', 0x2a2a30)); });
    const st = MM.symbolPlane('star', 0.36); st.position.set(0, 0.31, 0.065); g.add(st);
    return g;
  };
  MM.lectern = function () {
    return vbGroup(vb => {
      vb.addBox(0, 0, 0, 0.5, 0.06, 0.4, 'log');
      vb.addBox(0, 0.06, 0, 0.12, 0.95, 0.12, 'log');
      vb.addBox(0, 1.0, 0, 0.7, 0.06, 0.5, tint('planks', 0x6b4526));
    });
  };

  // ------------------------------------------------------------------ components
  const C = MS.Components;
  const { resolveAt, evalCond } = MS;
  function boxOf(obj, pad = 0.05) {
    let root = obj; while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    return new T.Box3().setFromObject(obj).expandByScalar(pad);
  }

  // ---- a TV that plays a channel clip
  C.videoScreen = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const vid = VR.VIDEOS[def.video];
      if (!vid) console.warn('[mission] unknown video', def.video);
      const m = MM.tvSet(vid ? L(vid.title) : ''); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      ctx.level.solids.push(Object.assign(solidOf(m), { owner: def.id }));
      let glow = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        prompt: () => ({ verb: tr('v.watch'), label: L(def.name) || tr('n.screen') }),
        use: (run) => {
          if (!vid) return;
          run.setFlag('watched_' + def.id);
          run.addJournal({ id: 'vid_' + def.id, title: { en: VR.t('vid.watched', { title: vid.title.en }), ar: VR.t('vid.watched', { title: vid.title.ar }) },
            text: { en: `${VR.VideoUtil.mmss(vid.start)} – ${VR.VideoUtil.mmss(vid.end)}`, ar: `${VR.VideoUtil.mmss(vid.start)} – ${VR.VideoUtil.mmss(vid.end)}` }, style: 'note' });
          ctx.mgr.ui.showVideo(vid, {
            name: def.name,
            // can't play → the description joins the journal, so the mission stays solvable
            onFallback: (clue, at) => run.addJournal({ id: 'clue_' + def.id, title: { en: 'Clip description (' + at + ')', ar: 'وصف المقطع (' + at + ')' }, text: clue, style: 'note' }),
          });
        },
        update: (dt) => { glow += dt; m.userData.screen.material.color.setScalar(0.85 + Math.sin(glow * 2) * 0.08); },
        sync: () => {},
      };
      e.hit = boxOf(m, 0.08);
      return e;
    },
  };
  function solidOf(obj) { const b = boxOf(obj, 0); return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], enabled: true }; }

  // ---- a floor of tiles; one of them comes loose
  C.floorTiles = {
    build(def, ctx) {
      const { pos } = resolveAt(ctx.level, def);
      const s = def.size || 1, nx = def.nx, nz = def.nz;
      const cx = (i) => pos.x + (i - (nx - 1) / 2) * s, cz = (j) => pos.z + (j - (nz - 1) / 2) * s;
      const A = tint('concrete', 0xeadcbf), B = tint('concrete', 0xd6c4a0);
      const matOf = (i, j) => ((i + j) % 2 ? A : B);
      // every tile but the loose one is one merged mesh; the loose one looks exactly the same
      const vb = new VR.VoxelBuilder();
      vb.addBox(pos.x, -0.02, pos.z, nx * s + 0.1, 0.02, nz * s + 0.1, tint('stone', 0x6d6658));     // grout
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (i === def.target[0] && j === def.target[1]) continue;
        vb.addBox(cx(i), 0, cz(j), s - 0.06, 0.035, s - 0.06, matOf(i, j));
      }
      const g = new T.Group(); g.add(vb.build()); ctx.scene.add(g);
      const loose = vbGroup(v => v.addBox(0, 0, 0, s - 0.06, 0.035, s - 0.06, matOf(def.target[0], def.target[1])));
      loose.position.set(cx(def.target[0]), 0, cz(def.target[1])); ctx.scene.add(loose);
      const hole = vbGroup(v => v.addBox(0, -0.02, 0, s - 0.1, 0.025, s - 0.1, tint('dark', 0x222018)));
      hole.position.copy(loose.position); hole.visible = false; ctx.scene.add(hole);
      // the lemon mark on the start tile
      if (def.start) {
        const mark = MM.symbolPlane(def.mark || 'lemon', s * 0.62);
        mark.rotation.x = -Math.PI / 2; mark.position.set(cx(def.start[0]), 0.04, cz(def.start[1])); ctx.scene.add(mark);
      }
      let found = false, t = 0;
      const tried = new Set();
      const ent = { id: def.id, def, obj: g, kind: null, hit: new T.Box3(), prompt: () => null, use: () => {}, children: [],
        sync: (run) => { if (run.has(def.flag) && !found) { found = true; hole.visible = true; } },
        update: (dt) => {
          if (found && t < 1) {
            t = Math.min(1, t + dt * 1.4);
            loose.position.y = Math.sin(t * Math.PI) * 0.35;
            loose.position.x = cx(def.target[0]) + t * s * 0.9;
            loose.rotation.z = -t * 0.25;
          }
        },
      };
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const isTarget = i === def.target[0] && j === def.target[1];
        const key = i + ',' + j;
        const near = (def.nearMiss || []).find(n => n.tile[0] === i && n.tile[1] === j);
        const child = {
          id: def.id + ':' + key, def, obj: null, kind: 'inspect',
          hit: new T.Box3(new T.Vector3(cx(i) - s / 2 + 0.03, -0.02, cz(j) - s / 2 + 0.03), new T.Vector3(cx(i) + s / 2 - 0.03, 0.07, cz(j) + s / 2 - 0.03)),
          prompt: () => ((isTarget && found) ? null : { verb: tr('v.lift'), label: tr('n.tile') }),
          use: (run) => {
            if (isTarget) {
              if (found) return;
              run.setFlag(def.flag); VR.Audio.play('lid'); ctx.mgr.ui.caption(tr('c.tileLoose'), 3);
              return;
            }
            VR.Audio.play('silence');
            if (!tried.has(key)) { tried.add(key); run.mistakes++; }
            ctx.mgr.ui.caption(near ? tr('c.tileStuck') + ' ' + L(near.say) : tr('c.tileStuck'), near ? 3.6 : 1.8);
          },
          update: () => {}, sync: () => {},
        };
        ent.children.push(child);
      }
      return ent;
    },
  };

  // ---- keyhole: use an inventory item to set a flag
  C.keyhole = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM[def.model || 'starPlate'](); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      let done = false;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        prompt: (run) => {
          if (done) return null;
          const has = run.inventory.some(it => it.id === def.item);
          return has ? { verb: tr('v.use'), label: L(def.name) } : { verb: tr('v.inspect'), label: L(def.name), kindOverride: 'inspect' };
        },
        use: (run) => {
          if (done) return;
          if (!run.inventory.some(it => it.id === def.item)) { VR.Audio.play('buzz'); ctx.mgr.ui.caption(L(def.emptyText) || tr('c.keyholeEmpty'), 2.6); return; }
          run.removeItem(def.item); done = true;
          VR.Audio.play('unlock');
          setTimeout(() => { run.setFlag(def.flag); if (def.okText) ctx.mgr.ui.caption(L(def.okText), 3); }, 300);
        },
        update: () => {}, sync: (run) => { if (run.has(def.flag)) done = true; },
      };
      e.hit = boxOf(m, 0.08);
      return e;
    },
  };

  // ---- a small cupboard whose doors open
  C.cupboard = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM.cupboard(def.color); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      // solid for walking, but "see-through" for the aim ray so cards inside/on top can be read
      ctx.level.solids.push(Object.assign(solidOf(m), { owner: def.id, seeThrough: true }));
      const flag = 'opened_' + def.id;
      let open = false, t = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        prompt: () => (open ? null : { verb: tr('v.open'), label: L(def.name) }),
        use: (run) => { if (open) return; open = true; run.setFlag(flag); VR.Audio.play('lid'); },
        update: (dt) => {
          if (open && t < 1) { t = Math.min(1, t + dt * 2); for (const d of m.userData.doors) d.pivot.rotation.y = d.s * 1.9 * (1 - Math.pow(1 - t, 3)); }
        },
        sync: (run) => { if (run.has(flag)) open = true; },
      };
      e.hit = boxOf(m, 0.04);
      return e;
    },
  };

  // ------------------------------------------------------------------ environments
  const Level = VR.MissionLevel;
  function room(L, x0, z0, x1, z1, h, floor, wall, ceil, t = 0.4) {
    L.box(x0 - t, -0.4, z0 - t, x1 + t, 0, z1 + t, floor);
    if (ceil) L.box(x0 - t, h, z0 - t, x1 + t, h + 0.3, z1 + t, ceil);
    L.box(x0 - t, 0, z0 - t, x1 + t, h, z0, wall);
    L.box(x0 - t, 0, z1, x1 + t, h, z1 + t, wall);
    L.box(x0 - t, 0, z0, x0, h, z1, wall);
    L.box(x1, 0, z0, x1 + t, h, z1, wall);
  }
  /** Half sun on the horizon, painted on a wall. side = +1 east wall (faces -X), -1 west wall (faces +X). */
  function sunPainting(L, x, zc, sky, sea) {
    const s = Math.sign(x), fx = x - s * 0.02, d = 0.04;
    const box = (z0, y0, z1, y1, mat) => L.box(Math.min(fx, fx - s * d), y0, z0, Math.max(fx, fx - s * d), y1, z1, mat, false);
    box(zc - 2.2, 1.0, zc + 2.2, 3.4, tint('concrete', sky));                  // sky
    box(zc - 2.2, 1.0, zc + 2.2, 1.7, tint('concrete', sea));                  // sea
    const sx = x - s * 0.06;
    const layer = (w, y0, y1, col) => L.box(Math.min(sx, sx - s * 0.03), y0, zc - w / 2, Math.max(sx, sx - s * 0.03), y1, zc + w / 2, tint('concrete', col), false);
    layer(1.8, 1.7, 1.95, 0xffb52e); layer(1.6, 1.95, 2.2, 0xffc23a); layer(1.25, 2.2, 2.45, 0xffd04a); layer(0.7, 2.45, 2.65, 0xffde5a);
    for (const [dz, y] of [[-1.6, 2.3], [1.6, 2.3], [-1.0, 2.85], [1.0, 2.85], [0, 3.0]]) L.box(Math.min(sx, sx - s * 0.03), y, zc + dz - 0.12, Math.max(sx, sx - s * 0.03), y + 0.12, zc + dz + 0.12, tint('concrete', 0xffd04a), false);
    // frame
    L.box(Math.min(fx, fx - s * 0.1), 0.9, zc - 2.35, Math.max(fx, fx - s * 0.1), 1.0, zc + 2.35, 'log', false);
    L.box(Math.min(fx, fx - s * 0.1), 3.4, zc - 2.35, Math.max(fx, fx - s * 0.1), 3.5, zc + 2.35, 'log', false);
  }

  /* ======================================================================
   * STAR HALL — Mission 4. A tiled hall: 15 × 9 tiles of 1 m. The lemon
   * tile is in the middle. Paintings: sunrise on the east wall, sunset on
   * the west wall. TV on the south wall, star vault on the north wall.
   * ==================================================================== */
  function starhall() {
    const L = new Level('starhall');
    const H = 5;
    L.ambient = { sky: 0xc8d4e8, ground: 0x6a5a44, intensity: 0.75, background: 0x0e111a };
    room(L, -9.5, -7, 9.5, 7, H, tint('stone', 0x8a8274), 'sandstone', tint('planks', 0x5a3a22));
    for (let x = -6; x <= 6; x += 4) L.box(x - 0.2, H - 0.4, -7, x + 0.2, H, 7, 'log', false);
    L.anchor('tiles', 0, 0, 0);
    // pillars in the corners of the tiled area (cover nothing, just frame it)
    for (const [x, z] of [[-8.6, -6.1], [8.6, -6.1], [-8.6, 6.1], [8.6, 6.1]]) L.box(x - 0.4, 0, z - 0.4, x + 0.4, H, z + 0.4, 'sandstone');
    // paintings
    sunPainting(L, 9.5, 0, 0xf2b8a0, 0x3a6a9a);       // east: dawn sky
    sunPainting(L, -9.5, 0, 0xd8805a, 0x2f4f78);      // west: dusk sky
    L.anchor('eastSign', 9.44, 3.85, 0, -Math.PI / 2);
    L.anchor('westSign', -9.44, 3.85, 0, Math.PI / 2);
    // south wall: TV + note on a lectern
    L.anchor('tv', 0, 0, 6.6, Math.PI);
    L.anchor('lectern', -3.2, 0, 5.6, Math.PI);
    L.anchor('note', -3.2, 1.07, 5.6, Math.PI);
    L.anchor('poster', 3.2, 1.8, 6.95, Math.PI);
    // north wall: vault (wall hatch) + star keyhole
    L.anchor('vault', 0, 1.0, -6.4, 0);
    L.anchor('vaultItem', 0, 1.2, -6.72, 0);
    L.anchor('keyhole', 1.45, 1.2, -6.96, 0);
    L.anchor('vaultSign', 0, 2.55, -6.95, 0);
    L.spawn = { pos: [-6, 0, 5.8], yaw: -0.75 };   // looking across the hall toward the vault
    // lights
    for (const [x, z] of [[-5, -3], [5, -3], [-5, 3.5], [5, 3.5], [0, 0]]) {
      L.place(MM.hangingLamp(0.6), x, H, z, 0, false);
      L.light(x, H - 1, z, 0xffe2b0, 16, 11);
    }
    return L.finish();
  }

  /* ======================================================================
   * WORD ROOM — Mission 5. A classroom: blackboard (west wall), TV
   * (north wall), the word cabinet in the middle, and four small
   * cupboards: red (NW), blue (NE), green (SW), lemon-yellow (SE).
   * ==================================================================== */
  function wordroom() {
    const L = new Level('wordroom');
    const H = 4.4;
    L.ambient = { sky: 0xd0d8e8, ground: 0x5a4a38, intensity: 0.8, background: 0x0e111a };
    room(L, -8, -6.5, 8, 6.5, H, 'floor_wood', 'plaster', 'plaster');
    L.box(-8, 0, -6.5, 8, 0.9, -6.4, tint('planks', 0x6b4526), false);          // wainscot
    L.box(-8, 0, 6.4, 8, 0.9, 6.5, tint('planks', 0x6b4526), false);
    // bookshelves on the east wall
    for (const z of [-2.2, 1.6]) L.place(MM.shelf(3, 2.6, 0.6, 4), 7.6, 0, z, -Math.PI / 2, true, 0.02);
    // desks for the room's look
    for (const [x, z] of [[-2.6, 2.6], [2.6, 2.6]]) { L.place(MM.desk(1.6, 0.8), x, 0, z, Math.PI, true, 0.02); L.place(MM.chair(), x, 0, z + 0.9, Math.PI, true, 0.05); }
    L.anchor('tv', 0, 0, -6.0, 0);
    L.anchor('board', -7.93, 1.9, -0.2, Math.PI / 2);
    L.anchor('cabinet', 0, 0, -1.6, 0);
    L.anchor('cabinetNote', 0, 1.05, -2.35, 0);
    L.anchor('noteStand', 0, 0, -2.35, 0);
    L.anchor('prize', 0, 0.25, -1.6, 0);
    const cup = { red: [-6.2, -4.9, 0], blue: [6.2, -4.9, 0], green: [-6.2, 5.0, Math.PI], yellow: [6.2, 5.0, Math.PI] };
    for (const k in cup) {
      const [x, z, yaw] = cup[k];
      L.anchor('cup_' + k, x, 0, z, yaw);
      const f = Math.cos(yaw);               // +1 faces south (+Z), -1 faces north (-Z)
      L.anchor('cup_' + k + '_on', x, 1.112, z, yaw);
      L.anchor('cup_' + k + '_in', x, 0.425, z + f * 0.02, yaw);
      // "fallen off": on the floor a little away from the cupboard, toward the room
      L.anchor('cup_' + k + '_off', x + (x < 0 ? 0.75 : -0.75), 0.006, z + f * 1.0, yaw);
    }
    L.spawn = { pos: [0, 0, 5.2], yaw: 0 };
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) { L.place(MM.hangingLamp(0.5), x, H, z, 0, false); L.light(x, H - 0.9, z, 0xffe8c0, 14, 10); }
    return L.finish();
  }

  Object.assign(VR.MissionEnvironments, { starhall, wordroom });
})();
