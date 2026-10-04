/* =====================================================================
 * RUNNER PORTAL — the way from the adventure world (first person) into
 * the runner course (third person), and back.
 * ---------------------------------------------------------------------
 *   { id, type: 'runnerPortal', at }
 *
 * The rule for when it works is in js/core/rules.js (unlocked by the
 * start area's first puzzle; a 2-minute real-time rest after each run).
 * Using it: fade out, the course starts (js/core/modes.js enterCourse);
 * the return point is saved in front of the portal; after the result
 * screen ("Back to the square") you are back there, first person.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v);

  Object.assign(VR.I18N.STRINGS.en, {
    'portal.name': 'Runner course', 'portal.enter': 'Run', 'portal.locked': 'The portal is asleep. Solve the start area\'s puzzle first.',
    'portal.wait': 'Resting… ready in {t}', 'portal.ready': 'RUNNER COURSE', 'portal.back': 'BACK TO THE SQUARE',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'portal.name': 'مضمار الجري', 'portal.enter': 'اركض', 'portal.locked': 'البوابة نائمة. حلّ لغز منطقة البداية أولًا.',
    'portal.wait': 'تستريح… جاهزة بعد {t}', 'portal.ready': 'مضمار الجري', 'portal.back': 'العودة إلى الساحة',
  });
  const mmss = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function frame() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    for (const x of [-1.6, 1.6]) vb.addColorBox(x, 0, 0, 0.5, 3.6, 0.6, 0x4a4f5d);
    vb.addColorBox(0, 3.6, 0, 3.7, 0.5, 0.6, 0x4a4f5d);
    vb.addColorBox(0, 0, 0, 3.7, 0.12, 1.2, 0x2a2f3d);
    for (const x of [-1.6, 1.6]) vb.addColorBox(x, 3.0, 0.31, 0.3, 0.3, 0.02, 0xffe14a);
    g.add(vb.build());
    return g;
  }

  MS.Components.runnerPortal = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const m = frame(); m.position.copy(pos); m.rotation.y = yaw; ctx.scene.add(m);
      const curMat = new T.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false });
      curMat.userData.own = true; curMat.toneMapped = false;
      const curtain = new T.Mesh(new T.PlaneGeometry(2.7, 3.45), curMat); curtain.geometry.userData.own = true;
      curtain.position.set(0, 1.85, 0); m.add(curtain);
      const glow = new T.PointLight(0xffe14a, 8, 6, 2); glow.position.set(0, 1.8, 0.8); m.add(glow);
      // posts are solid, the opening is "used", not walked through
      const f = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new T.Vector3(f.z, 0, -f.x);
      const solid = (side) => {
        const c = pos.clone().addScaledVector(r, side * 1.6);
        const hw = Math.abs(r.x) * 0.25 + Math.abs(f.x) * 0.3 + 0.01, hd = Math.abs(r.z) * 0.25 + Math.abs(f.z) * 0.3 + 0.01;
        ctx.level.solids.push({ min: [c.x - hw, 0, c.z - hd], max: [c.x + hw, 4.1, c.z + hd], enabled: true, owner: def.id });
      };
      solid(-1); solid(1);
      ctx.level.solids.push({ min: [Math.min(pos.x - r.x * 1.4, pos.x + r.x * 1.4) - Math.abs(f.x) * 0.08, 0, Math.min(pos.z - r.z * 1.4, pos.z + r.z * 1.4) - Math.abs(f.z) * 0.08],
        max: [Math.max(pos.x - r.x * 1.4, pos.x + r.x * 1.4) + Math.abs(f.x) * 0.08, 3.6, Math.max(pos.z - r.z * 1.4, pos.z + r.z * 1.4) + Math.abs(f.z) * 0.08], enabled: true, owner: def.id, seeThrough: true });
      let sign = null, signText = '', t = 0, tick = 0;
      const setSign = (text) => {
        if (text === signText) return;
        signText = text;
        if (sign) { m.remove(sign); sign.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); }); }
        sign = VR.WorldText.make({ text, style: 'sign', size: 0.2, width: 3.2 });
        sign.position.set(0, 4.45, 0.32); m.add(sign);
      };
      const state = () => VR.Rules.portal.state(ctx.mgr.run);
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        hit: new T.Box3().setFromCenterAndSize(pos.clone().add(new T.Vector3(0, 1.8, 0)), new T.Vector3(Math.abs(r.x) * 3 + 0.6, 3.6, Math.abs(r.z) * 3 + 0.6)),
        state,
        prompt: () => {
          const s = state();
          if (s.open) return { verb: tr('portal.enter'), label: tr('portal.name') };
          return { verb: tr('v.inspect'), label: tr('portal.name'), kindOverride: 'inspect' };
        },
        use: (run) => {
          const s = state();
          if (s.locked) { VR.Audio.play('buzz'); ctx.mgr.ui.caption(tr('portal.locked'), 3); return; }
          if (!s.open) { VR.Audio.play('buzz'); ctx.mgr.ui.caption(tr('portal.wait', { t: mmss(s.wait) }), 2.4); return; }
          run.setFlag('used_portal');
          // come back just in front of the portal, facing away from it
          const back = pos.clone().addScaledVector(f, 2.0);
          ctx.mgr.game.modes.enterCourse({ area: run.def.id, pos: [+back.x.toFixed(2), 0, +back.z.toFixed(2)], yaw: +(yaw + Math.PI).toFixed(3) });
        },
        update: (dt) => {
          t += dt; tick -= dt;
          if (tick > 0) return;
          tick = 0.25;
          const s = state();
          curtain.visible = !s.locked;
          curMat.color.setHex(s.open ? 0xffe14a : 0x8a8f9a);
          curMat.opacity = s.open ? 0.62 + Math.sin(t * 3) * 0.12 : 0.35;
          glow.intensity = s.open ? 8 : 0;
          setSign(s.locked ? tr('portal.name') : s.open ? tr('portal.ready') : tr('portal.wait', { t: mmss(s.wait) }));
        },
        sync: () => {},
      };
      e.update(0.3);
      return e;
    },
  };
})();
