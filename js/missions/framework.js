/* =====================================================================
 * MISSION FRAMEWORK
 * ---------------------------------------------------------------------
 *  MissionRun        one attempt at a mission: state machine, flags,
 *                    inventory, journal, timer, mistakes
 *  MissionStates     NOT_STARTED → ENTERING → ACTIVE → OBJECTIVE_COMPLETED
 *                    → RETURNING → COMPLETED, plus FAILED / CANCELLED /
 *                    RETRY (→ ENTERING) and ENDED (left without success)
 *  Components        reusable interactable building blocks, looked up by
 *                    the `type` of each entity in mission data:
 *                    text · item · prop · symbolLock · soundObject ·
 *                    buttonPanel · compartment · generator (sockets) ·
 *                    lever · gate · zone · powerLights
 *  Interaction       centre-screen ray → nearest interactable in reach,
 *                    blocked by walls; prompt kind = inspect | collect |
 *                    interact (each drawn differently in the UI)
 *  Rewards/Progress  first-completion rewards, explicit repeat rewards,
 *                    secondary objectives, achievements, unlocks (saved)
 *
 * Flags are the glue: components set flags ("chest_open"), and entities
 * react to flags (showWhen / openWhen / requires). Mission data can add
 * `rules: [{ when: ['a','b'], set: 'c', say: 'text' }]` for extra logic.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MM = () => VR.MissionModels;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ------------------------------------------------------------------ states
  const S = {
    NOT_STARTED: 'not_started', ENTERING: 'entering', ACTIVE: 'active',
    OBJECTIVE_COMPLETED: 'objective_completed', RETURNING: 'returning', COMPLETED: 'completed',
    FAILED: 'failed', CANCELLED: 'cancelled', RETRY: 'retry', ENDED: 'ended',
  };
  const ALLOWED = {
    not_started: ['entering'],
    entering: ['active', 'cancelled'],
    active: ['objective_completed', 'failed', 'cancelled', 'retry'],
    objective_completed: ['returning'],
    failed: ['retry', 'returning'],
    cancelled: ['returning'],
    retry: ['entering'],
    returning: ['completed', 'ended'],
    completed: [], ended: [],
  };

  // ------------------------------------------------------------------ helpers
  const yawDir = (yaw) => new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  function resolveAt(level, def) {
    const a = def.at ? level.anchors[def.at] : null;
    if (def.at && !a) console.warn('[mission] unknown anchor', def.at);
    const pos = new T.Vector3(...(a ? a.pos : def.pos || [0, 0, 0]));
    const yaw = def.yaw !== undefined ? def.yaw : a ? a.yaw : 0;
    if (def.offset) {
      // offset is in the anchor's local frame: x = right, y = up, z = out of the wall
      const f = yawDir(yaw), r = new T.Vector3(f.z, 0, -f.x);
      pos.addScaledVector(r, def.offset[0]).add(new T.Vector3(0, def.offset[1], 0)).addScaledVector(f, def.offset[2]);
    }
    return { pos, yaw };
  }
  function model(name, def) {
    const M = MM();
    if (typeof name === 'function') return name(def);
    if (!M[name]) { console.warn('[mission] unknown model', name); return M.crate(0.4); }
    return M[name](...(def.modelArgs || []));
  }
  function boxOf(obj, pad = 0.05) {
    let root = obj; while (root.parent) root = root.parent;
    root.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(obj);
    return b.expandByScalar(pad);
  }
  const evalCond = (run, cond) => {
    if (!cond) return true;
    const list = Array.isArray(cond) ? cond : [cond];
    return list.every(c => (c[0] === '!' ? !run.flags.has(c.slice(1)) : run.flags.has(c)));
  };

  /* ==================================================================
   * COMPONENTS
   * Each: build(def, ctx) → entity. ctx = { run, level, scene, mgr }.
   * entity: { id, def, obj, hit (Box3), kind, prompt(), use(), update(),
   *           sync() (re-evaluate flag-driven state) }
   * ================================================================ */
  const C = {};

  // ---- readable text (walls, paper, chalk, signs, glow paint)
  C.text = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const mesh = VR.WorldText.make({ text: L(def.text), style: def.style, width: def.width, size: def.size, align: def.align });
      mesh.position.copy(pos); mesh.rotation.y = yaw;
      if (def.flat) { mesh.rotation.order = 'YXZ'; mesh.rotation.set(-Math.PI / 2, yaw, 0); }
      ctx.scene.add(mesh);
      const e = {
        id: def.id, def, obj: mesh, kind: def.inspect === false ? null : 'inspect',
        hit: null,
        prompt: () => ({ verb: tr('v.read'), label: L(def.title) || tr('n.writing') }),
        use: (run) => {
          ctx.mgr.ui.showInspect({ title: def.title || tr('n.writing'), text: def.text, style: def.style || 'paint' });
          VR.Audio.play('page');
          run.addJournal({ id: def.id, title: def.title || { en: 'Writing', ar: 'كتابة' }, text: def.text, style: def.style });
          run.setFlag('read_' + def.id);
        },
        sync: (run) => { mesh.visible = evalCond(run, def.showWhen); },
      };
      e.hit = boxOf(mesh, 0.12);
      return e;
    },
  };

  // ---- collectible item (mission items, components, bonus pickups)
  C.item = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const holder = new T.Group(); holder.position.copy(pos); holder.rotation.y = yaw;
      const m = model(def.model || 'smallLemon', def);
      holder.add(m); ctx.scene.add(holder);
      const glow = new T.Mesh(new T.BoxGeometry(0.06, 0.06, 0.06), new T.MeshBasicMaterial({ color: 0xfff2a0 }));
      glow.visible = false;
      let t = Math.random() * 6;
      const e = {
        id: def.id, def, obj: holder, kind: 'collect', taken: false,
        prompt: () => ({ verb: tr('v.pickup'), label: L(def.name) || tr('n.item') }),
        use: (run) => {
          e.taken = true; holder.visible = false;
          VR.Audio.play(def.bonus ? 'gem' : 'pickup');
          if (def.bonus) { run.setFlag('got_' + def.id); ctx.mgr.ui.toast(tr('t.found', { name: L(def.name) })); }
          else {
            run.addItem({ id: def.item || def.id, name: def.name, model: def.model || 'smallLemon', kind: def.itemKind || 'item', description: def.description });
            run.setFlag('got_' + (def.item || def.id));
            ctx.mgr.ui.toast(tr('t.pickedUp', { name: L(def.name) }));
          }
        },
        update: (dt) => {
          if (!holder.visible) return;
          t += dt;
          if (def.spin !== false) { m.rotation.y = t * 1.2; m.position.y = Math.sin(t * 2) * 0.03 + (def.float || 0); }
        },
        sync: (run) => { holder.visible = !e.taken && evalCond(run, def.showWhen); e.hit = boxOf(holder, 0.18); },
      };
      e.hit = boxOf(holder, 0.18);
      return e;
    },
  };

  // ---- decorative prop, optionally inspectable
  C.prop = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = model(def.model, def); m.position.copy(pos); m.rotation.y = yaw;
      if (def.rotX) m.rotation.x = def.rotX;
      ctx.scene.add(m);
      if (def.solid) ctx.level.solids.push(Object.assign(solidFrom(m), { owner: def.id }));
      const e = {
        id: def.id, def, obj: m, kind: def.inspect ? 'inspect' : null,
        prompt: () => ({ verb: tr('v.inspect'), label: L(def.inspect.title) }),
        use: (run) => { ctx.mgr.ui.showInspect({ title: def.inspect.title, text: def.inspect.text, style: 'note' }); run.setFlag('inspected_' + def.id); },
        sync: (run) => { m.visible = evalCond(run, def.showWhen); },
      };
      e.hit = boxOf(m, 0.08);
      return e;
    },
  };
  function solidFrom(obj) {
    const b = boxOf(obj, 0);
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], enabled: true };
  }

  // ---- locked container with symbol dials
  C.symbolLock = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = model(def.model || 'chest', def); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      const solid = Object.assign(solidFrom(m), { owner: def.id }); ctx.level.solids.push(solid);
      let openT = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'interact', open: false,
        prompt: () => (e.open ? null : { verb: tr('v.unlock'), label: L(def.name) || tr('n.locked') }),
        use: (run) => {
          ctx.mgr.ui.openSymbolLock({
            title: L(def.name) || tr('n.locked'),
            symbols: def.symbols, dials: def.solution.length,
            hint: L(def.lockText) || tr('mi.lock.default'),
            onTry: (seq) => {
              if (seq.join('|') === def.solution.join('|')) {
                e.open = true; run.setFlag(def.opens);
                VR.Audio.play('unlock'); setTimeout(() => VR.Audio.play('lid'), 250);
                return { ok: true, text: tr('mi.lock.ok') };
              }
              run.mistakes++; VR.Audio.play('buzz');
              return { ok: false, text: tr('mi.lock.bad') };
            },
          });
        },
        update: (dt) => {
          if (e.open && openT < 1) { openT = Math.min(1, openT + dt * 1.6); if (m.userData.lid) m.userData.lid.rotation.x = -1.9 * (1 - Math.pow(1 - openT, 3)); }
        },
        sync: () => {},
      };
      e.hit = boxOf(m, 0.1);
      return e;
    },
  };

  // ---- object that makes a sound when used (and may hide something)
  C.soundObject = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = model(def.model, def); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      const home = pos.clone();
      let lift = 0, moved = false;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        prompt: () => ({ verb: moved ? tr('v.listen') : tr('v.pickup'), label: L(def.name) }),
        use: (run) => {
          VR.Audio.play(def.sound || 'silence');
          ctx.mgr.ui.caption(L(def.caption) || tr('c.noSound'), 2.6);
          run.setFlag('heard_' + def.id);
          lift = 1;
          if (!moved) {
            moved = true;
            if (def.reveals) { run.setFlag(def.reveals); setTimeout(() => ctx.mgr.ui.toast(tr('t.underneath')), 500); }
            else setTimeout(() => ctx.mgr.ui.caption(tr('c.nothingUnder'), 1.6), 1200);
          }
        },
        update: (dt) => {
          lift = Math.max(0, lift - dt * 0.9);
          const side = moved ? 1 : 0;
          const f = yawDir(yaw), r = new T.Vector3(f.z, 0, -f.x);
          m.position.copy(home).addScaledVector(r, side * (def.moveAside || 0.4));
          m.position.y += Math.sin(lift * Math.PI) * 0.22;
          m.rotation.z = Math.sin(lift * Math.PI) * 0.25;
          e.hit = boxOf(m, 0.08);
        },
        sync: () => {},
      };
      e.hit = boxOf(m, 0.08);
      return e;
    },
  };

  // ---- symbol button panel: press buttons in the right order
  C.buttonPanel = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM().buttonPanel(def.symbols); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      const lamps = m.userData.lamps;
      const input = [];
      let solved = false, flash = 0, flashColor = 0;
      const setLamps = () => lamps.forEach((l, i) => {
        if (i >= def.solution.length) { l.visible = false; return; }
        l.material.color.setHex(solved ? 0x5fdc5f : flash > 0 ? flashColor : i < input.length ? 0xffc93c : 0x333a40);
      });
      setLamps();
      const panel = { id: def.id, def, obj: m, kind: null, prompt: () => null, use: () => {}, hit: new T.Box3(), sync: () => {}, children: [],
        update: (dt) => {
          if (flash > 0) { flash -= dt; if (flash <= 0) setLamps(); }
          m.userData.buttons.forEach(b => { b.position.z += (0 - b.position.z) * Math.min(1, dt * 12); });
        },
      };
      m.userData.buttons.forEach((b, i) => {
        const sym = def.symbols[i];
        const child = {
          id: def.id + ':' + sym, def, obj: b, kind: 'interact',
          prompt: () => (solved ? null : { verb: tr('v.press'), label: tr('n.button', { sym: VR.Symbols.name(sym) }) }),
          use: (run) => {
            if (solved) return;
            b.position.z = -0.05;
            VR.Audio.play('button');
            input.push(sym); setLamps();
            if (input.length === def.solution.length) {
              const ok = input.join('|') === def.solution.join('|');
              input.length = 0;
              if (ok) {
                solved = true; setLamps(); run.setFlag(def.flag);
                VR.Audio.play('unlock'); ctx.mgr.ui.caption(tr('c.panelOk'), 3);
              } else {
                run.mistakes++; flash = 0.9; flashColor = 0xe5433a; setLamps();
                VR.Audio.play('buzz'); ctx.mgr.ui.caption(tr('c.panelBad'), 2.2);
              }
            }
          },
          update: () => {}, sync: () => {},
        };
        child.hit = boxOf(b, 0.03);
        panel.children.push(child);
      });
      return panel;
    },
  };

  // ---- hidden compartment (opens on a flag)
  C.compartment = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM().compartment(def.w || 1.0, def.h || 0.9); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      let t = 0, open = false;
      const cover = m.userData.cover;
      const e = {
        id: def.id, def, obj: m, kind: 'inspect',
        prompt: () => (open ? null : { verb: tr('v.inspect'), label: L(def.name) || tr('n.wallPanel') }),
        use: () => { VR.Audio.play('silence'); ctx.mgr.ui.caption(L(def.closedText) || tr('c.hollow'), 2.8); },
        update: (dt) => {
          if (open && t < 1) { t = Math.min(1, t + dt * 0.8); cover.position.y = 0.09 + t * ((def.h || 0.9) + 0.15); }
        },
        sync: (run) => { if (!open && evalCond(run, def.openWhen)) { open = true; VR.Audio.play('gate'); } },
      };
      e.hit = boxOf(m, 0.05);
      return e;
    },
  };

  // ---- generator with sockets for components
  C.generator = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM().generator(def.sockets.length); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      const gen = { id: def.id, def, obj: m, kind: null, hit: new T.Box3(), prompt: () => null, use: () => {}, update: () => {}, sync: () => {}, children: [], locked: false };
      const state = def.sockets.map(() => null);
      const refresh = (run) => {
        const all = def.sockets.every((s, i) => state[i] && state[i].id === s.correct);
        if (all) run.setFlag(def.flag); else run.clearFlag(def.flag);
      };
      def.sockets.forEach((sd, i) => {
        const sock = m.userData.sockets[i];
        const child = {
          id: sd.id, def: sd, obj: sock.group, kind: 'interact',
          prompt: (run) => {
            if (gen.locked) return null;
            if (state[i]) return { verb: tr('v.remove'), label: L(state[i].name) };
            const sel = run.selectedItem();
            if (sel && sel.kind === 'component') return { verb: tr('v.install'), label: tr('n.installInto', { item: L(sel.name), socket: L(sd.label) }) };
            return { verb: tr('v.inspect'), label: L(sd.label), kindOverride: 'inspect' };
          },
          use: (run) => {
            if (gen.locked) return;
            if (state[i]) {
              run.addItem(state[i]); sock.holder.clear(); state[i] = null;
              sock.lamp.material.color.setHex(0x3a2a2a); VR.Audio.play('pickup'); refresh(run); return;
            }
            const sel = run.selectedItem();
            if (!sel || sel.kind !== 'component') {
              ctx.mgr.ui.caption(L(sd.emptyText) || cap(tr('c.socketEmpty', { socket: L(sd.label) })), 2.6); return;
            }
            run.removeItem(sel.id); state[i] = sel;
            const mdl = model(sel.model, {}); mdl.scale.setScalar(0.9); sock.holder.add(mdl);
            const ok = sel.id === sd.correct;
            sock.lamp.material.color.setHex(ok ? 0x5fdc5f : 0xff3b30);
            VR.Audio.play(ok ? 'install' : 'spark');
            ctx.mgr.ui.caption(ok ? tr('c.installed', { item: L(sel.name) }) : tr('c.wrongSocket', { item: L(sel.name), socket: L(sd.label) }), 3);
            if (!ok) run.mistakes++;
            refresh(run);
          },
          update: () => {}, sync: () => {},
        };
        child.hit = boxOf(sock.group, 0.06);
        gen.children.push(child);
      });
      gen.lock = () => { gen.locked = true; };
      ctx.mgr.registerLockable(def.lockWhen, gen);
      return gen;
    },
  };

  // ---- lever / switch
  C.lever = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM().lever(); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      let pulled = false, t = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        prompt: () => (pulled ? null : { verb: tr('v.pull'), label: L(def.name) || tr('n.lever') }),
        use: (run) => {
          if (!evalCond(run, def.requires)) {
            VR.Audio.play('lever'); setTimeout(() => VR.Audio.play('buzz'), 120);
            ctx.mgr.ui.caption(L(def.failText) || tr('c.nothing'), 3); return;
          }
          pulled = true; VR.Audio.play('lever');
          setTimeout(() => { run.setFlag(def.flag); VR.Audio.play('powerOn'); if (def.successText) ctx.mgr.ui.caption(L(def.successText), 3.5); }, 250);
        },
        update: (dt) => { if (pulled && t < 1) { t = Math.min(1, t + dt * 4); m.userData.arm.rotation.x = 0.7 - 1.4 * t; } },
        sync: () => {},
      };
      e.hit = boxOf(m, 0.1);
      return e;
    },
  };

  // ---- gate / door (blocks until a flag opens it)
  C.gate = {
    build(def, ctx) {
      const { pos, yaw } = resolveAt(ctx.level, def);
      const m = MM().gate(def.w || 5, def.h || 3.4); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      const f = yawDir(yaw), r = new T.Vector3(f.z, 0, -f.x);
      const hw = (def.w || 5) / 2;
      const a = pos.clone().addScaledVector(r, -hw).addScaledVector(f, -0.2), b = pos.clone().addScaledVector(r, hw).addScaledVector(f, 0.2);
      const solid = { min: [Math.min(a.x, b.x), 0, Math.min(a.z, b.z)], max: [Math.max(a.x, b.x), (def.h || 3.4) + 1, Math.max(a.z, b.z)], enabled: true, owner: def.id };
      ctx.level.solids.push(solid);
      let open = false, t = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'inspect',
        prompt: () => (open ? null : { verb: tr('v.inspect'), label: L(def.name) || tr('n.gate') }),
        use: () => { ctx.mgr.ui.caption(L(def.closedText) || tr('c.gateLocked'), 2.6); VR.Audio.play('buzz'); },
        update: (dt) => {
          if (open && t < 1) {
            t = Math.min(1, t + dt * 0.45);
            const k = 1 - Math.pow(1 - t, 3);
            m.userData.leaves[0].rotation.y = -1.7 * k; m.userData.leaves[1].rotation.y = 1.7 * k;
          }
        },
        sync: (run) => {
          if (!open && evalCond(run, def.openWhen)) {
            open = true; solid.enabled = false; VR.Audio.play('gate');
            m.userData.light.material.color.setHex(0x5fdc5f);
          }
        },
      };
      e.hit = boxOf(m, 0.05);
      return e;
    },
  };

  // ---- trigger volume
  C.zone = {
    build(def, ctx) {
      const { pos } = resolveAt(ctx.level, def);
      const s = def.size || [4, 4, 4];
      const box = new T.Box3(new T.Vector3(pos.x - s[0] / 2, pos.y, pos.z - s[2] / 2), new T.Vector3(pos.x + s[0] / 2, pos.y + s[1], pos.z + s[2] / 2));
      let fired = false;
      return {
        id: def.id, def, obj: null, kind: null, hit: null, prompt: () => null, use: () => {}, sync: () => {},
        update: (dt, run) => {
          if (fired || !evalCond(run, def.requires)) return;
          if (box.containsPoint(ctx.mgr.ctrl.pos.clone().add(new T.Vector3(0, 0.5, 0)))) { fired = true; run.setFlag(def.flag); }
        },
      };
    },
  };

  // ---- level lights marked `powered` fade in on a flag
  C.powerLights = {
    build(def, ctx) {
      let on = false, t = 0;
      return {
        id: def.id, def, obj: null, kind: null, hit: null, prompt: () => null, use: () => {},
        sync: (run) => { if (!on && evalCond(run, def.when)) on = true; },
        update: (dt) => {
          if (!on || t >= 1) return;
          t = Math.min(1, t + dt * 1.5);
          for (const L of ctx.mgr.levelLights) if (L.def.powered) L.light.intensity = L.def.powered * t * (0.85 + Math.random() * 0.15 * (1 - t));
          for (const b of ctx.mgr.poweredBulbs) b.material.color.setHex(t > 0.5 ? 0xffffff : 0x666666);
        },
      };
    },
  };

  /* ==================================================================
   * MISSION RUN
   * ================================================================ */
  class MissionRun {
    constructor(def, mgr) {
      this.def = def; this.mgr = mgr;
      this.state = S.NOT_STARTED;
      this.flags = new Set();
      this.inventory = []; this.selected = 0;
      this.journal = [];
      this.time = 0; this.mistakes = 0; this.hintsUsed = 0;
      this.history = [S.NOT_STARTED];
      this.rewarded = false;
      this.uid = VR.uid();                                 // pays its rewards once (wallet txId)
    }
    go(next) {
      const ok = (ALLOWED[this.state] || []).includes(next);
      if (!ok) { console.warn(`[mission] illegal transition ${this.state} → ${next}`); return false; }
      this.state = next; this.history.push(next);
      this.mgr.onState(this, next);
      return true;
    }
    has(f) { return this.flags.has(f); }
    setFlag(f) {
      if (!f || this.flags.has(f)) return;
      this.flags.add(f);
      this.mgr.onFlag(this, f);
    }
    clearFlag(f) { if (this.flags.delete(f)) this.mgr.onFlag(this, null); }
    // ---- inventory
    addItem(it) { this.inventory.push(it); this.selected = this.inventory.length - 1; this.mgr.onInventory(this); }
    removeItem(id) {
      const i = this.inventory.findIndex(x => x.id === id);
      if (i >= 0) this.inventory.splice(i, 1);
      this.selected = Math.max(0, Math.min(this.selected, this.inventory.length - 1));
      this.mgr.onInventory(this);
    }
    selectedItem() { return this.inventory[this.selected] || null; }
    select(i) { if (i >= 0 && i < this.inventory.length) { this.selected = i; this.mgr.onInventory(this); } }
    // ---- journal
    addJournal(entry) {
      if (this.journal.some(j => j.id === entry.id)) return;
      this.journal.push(entry);
      this.mgr.ui.toast(tr('t.journal'));
      VR.Audio.play('clue');
    }
    objectiveSteps() { return (this.def.objectives || []).map(o => ({ text: o.text, done: evalCond(this, o.done) })); }
    secondaryStatus() {
      return (this.def.secondary || []).map(s => {
        let done = false, detail = '';
        if (s.type === 'collect') {
          const n = [...this.flags].filter(f => f.startsWith('got_' + s.prefix)).length;
          done = n >= s.count; detail = `${Math.min(n, s.count)}/${s.count}`;
        } else if (s.type === 'time') { done = this.time <= s.seconds; detail = fmtTime(s.seconds); }
        else if (s.type === 'noMistakes') { done = this.mistakes === 0; }
        else if (s.type === 'flag') { done = this.flags.has(s.flag); }
        return { ...s, done, detail };
      });
    }
  }
  function fmtTime(t) { t = Math.max(0, Math.floor(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

  /* ==================================================================
   * PROGRESS + REWARDS (saved between sessions)
   * ================================================================ */
  const Progress = {
    // mission progress is part of the player profile (js/core/profile.js)
    load() { return VR.Profiles.player().progress.missions; },
    save(p) { VR.Profiles.player().progress.missions = p; VR.Profiles.save(); },
  };
  const ACHIEVEMENTS = {
    first_mission: 'First Gate: complete a mission',
    all_missions: 'Lemon Detective: complete all missions',
    flawless: 'Flawless: complete a mission without a mistake',
  };
  const Rewards = {
    /** Decide and record rewards for a completed run. Returns a summary. */
    grant(run, progress, allDefs) {
      if (run.rewarded) return run.rewardSummary;
      const def = run.def;
      const first = !progress.completed[def.id];
      const out = { score: 0, coins: 0, lines: [], achievements: [], firstTime: first, txId: 'mission:' + run.uid };
      if (first) {
        out.score += def.rewards.score || 0; out.coins += def.rewards.coins || 0;
        out.lines.push({ key: 'rw.complete', score: def.rewards.score || 0, coins: def.rewards.coins || 0 });
      } else if (def.repeatable && def.repeatReward) {
        out.score += def.repeatReward.score || 0; out.coins += def.repeatReward.coins || 0;
        out.lines.push({ key: 'rw.replay', score: def.repeatReward.score || 0, coins: def.repeatReward.coins || 0 });
      } else out.lines.push({ key: 'rw.none', score: 0, coins: 0 });
      for (const s of run.secondaryStatus()) {
        const key = def.id + ':' + s.id;
        if (s.done && !progress.secondary[key] && s.reward) {
          out.score += s.reward.score || 0; out.coins += s.reward.coins || 0;
          out.lines.push({ text: s.text, score: s.reward.score || 0, coins: s.reward.coins || 0 });
          progress.secondary[key] = true;
        }
      }
      // record + achievements
      const prev = progress.completed[def.id];
      progress.completed[def.id] = { best: prev ? Math.min(prev.best, run.time) : run.time, times: (prev ? prev.times : 0) + 1 };
      const unlock = (id) => { if (!progress.achievements.includes(id)) { progress.achievements.push(id); out.achievements.push(id); } };
      unlock('first_mission');
      if (allDefs.every(d => progress.completed[d.id])) unlock('all_missions');
      if (run.mistakes === 0) unlock('flawless');
      if (def.achievement) unlock(def.achievement);
      Progress.save(progress);
      run.rewarded = true; run.rewardSummary = out;
      return out;
    },
  };

  VR.Missions = Object.assign(VR.Missions || {}, {
    States: S, Components: C, MissionRun, Progress, Rewards, ACHIEVEMENTS, evalCond, resolveAt, fmtTime,
  });
})();
