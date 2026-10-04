/* =====================================================================
 * MISSION MANAGER — runs the first-person mission mode inside the
 * game's single loop (game.js calls update() and render()).
 *
 *  enter(def)        build the world, show the intro (state ENTERING)
 *  startActive()     player takes control (ACTIVE)
 *  complete()        success flag reached → rewards → results screen
 *  fail() / retry()  time limit, or restart from the pause menu
 *  finish(success)   RETURNING → hands control back to game.js, which
 *                    fades to the runner and restores the saved run
 *  exit()            tear the mission world down (COMPLETED / ENDED)
 *
 * PERSISTENT AREAS (def.persistent, the adventure world — js/adventure/):
 * the same machinery, but the area is never "completed": its flags are
 * restored from the save when you enter and saved on every change, items
 * you carry stay with the player, and where you stand is saved (so
 * CONTINUE brings you back there). See enterArea() / saveArea().
 * ===================================================================== */
(function () {
  const T = THREE;
  const FP = () => VR.CONFIG.FP;
  const MS = () => VR.Missions;

  class MissionManager {
    constructor(game) {
      this.game = game;
      this.defs = VR.MISSIONS.slice().sort((a, b) => a.order - b.order);
      this.validate();
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(FP().FOV, 1, 0.05, 220);
      this.ctrl = new VR.FirstPersonController(this.camera);
      this.hands = new VR.HandsView();
      this.ui = new VR.MissionUI(this);
      this.settings = Object.assign({ sens: 1, fov: FP().FOV }, VR.UI.store.get('fpSettings', {}));
      this.run = null; this.level = null;
      this.entities = []; this.interactables = []; this.lockables = [];
      this.levelLights = []; this.poweredBulbs = [];
      this.active = false; this.paused = false;
      this.replayIdx = 0; this.stepAcc = 0; this.target = null;
      this.ray = new T.Raycaster();
      this._v = new T.Vector3(); this._p = new T.Vector3();
    }

    validate() {
      const ids = new Set();
      for (const d of this.defs) {
        for (const k of ['id', 'name', 'environment', 'objective', 'success', 'entities']) if (!d[k]) console.warn(`[mission ${d.id}] missing "${k}"`);
        if (ids.has(d.id)) console.warn('[mission] duplicate id', d.id); ids.add(d.id);
        if (!VR.MissionEnvironments[d.environment]) console.warn(`[mission ${d.id}] unknown environment ${d.environment}`);
        for (const e of d.entities || []) if (!VR.Missions.Components[e.type]) console.warn(`[mission ${d.id}] unknown entity type ${e.type}`);
      }
    }
    /** mission progress lives in the player profile (a NEW GAME replaces it) */
    get progress() { return MS().Progress.load(); }
    byId(id) { return this.defs.find(d => d.id === id) || null; }
    isUnlocked(def) { return (def.requires || []).every(id => this.progress.completed[id]); }
    /** Which mission the next gate on the railway should lead to. */
    nextForGate() {
      const fresh = this.defs.find(d => !this.progress.completed[d.id] && this.isUnlocked(d));
      if (fresh) return fresh;
      const rep = this.defs.filter(d => d.repeatable && this.progress.completed[d.id]);
      if (!rep.length) return null;
      return rep[(this.replayIdx++) % rep.length];
    }
    resize(w, h) {
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.hands.resize(w / h);
    }

    // ------------------------------------------------------------ lifecycle
    enter(def, opts = {}) {
      this.active = true; this.paused = false; this.frozen = false;
      this.run = new (MS().MissionRun)(def, this);
      this.run.go('entering');
      if (def.persistent) this.restoreArea(this.run);
      this.hands.hold(null);
      this.hands.setCharacter(VR.CHARACTERS[this.game.charIndex]);
      this.hands.setTone('white');
      this.buildWorld(def, opts.location);
      VR.Input.setMode('fp'); VR.Input.setFPEnabled(false);
      this.ui.show(true);
      this.ui.setMission(def, this.run, this.defs.length);
      if (def.persistent) { this.onInventory(this.run); this.saveArea(); }
      if (opts.intro === false) this.startActive();
      else this.ui.showIntro(def, this.defs.length, () => this.startActive());
    }
    /** Enter a saved area of the adventure world (see the header). */
    enterArea(def, { location = null, intro = false } = {}) { this.enter(def, { location, intro }); }

    // ---- saving a persistent area
    // Flags about the WORLD (a door opened) are saved with the world, so later
    // every player in it shares them; flags about YOU (coins and items you
    // picked up, notes you read) are saved with the player.
    static personalFlag(f) { return /^(got_|coin_|read_|inspected_|heard_)/.test(f); }
    restoreArea(run) {
      const id = run.def.id, P = VR.Profiles;
      const mine = (P.player().progress.areas[id] || {}).flags || [];
      const world = P.world(id).flags || [];
      for (const f of [...world, ...mine]) run.flags.add(f);
      // progress made in OTHER areas: done_<mission> for every completed mission (derived, never saved)
      for (const mid in this.progress.completed) run.flags.add('done_' + mid);
      run.inventory = (P.player().inventory.tools || []).filter(it => it.area === id).map(it => Object.assign({}, it));
      run.selected = 0;
    }
    saveArea(withLocation = true) {
      const run = this.run;
      if (!run || !run.def.persistent) return;
      const id = run.def.id, P = VR.Profiles, p = P.player();
      const flags = [...run.flags].filter(f => !f.startsWith('done_'));
      p.progress.areas[id] = Object.assign(p.progress.areas[id] || {}, { flags: flags.filter(MissionManager.personalFlag) });
      P.world(id).flags = flags.filter(f => !MissionManager.personalFlag(f));
      if (this.combat) this.combat.save();
      p.inventory.tools = (p.inventory.tools || []).filter(it => it.area !== id).concat(run.inventory.map(it => Object.assign({}, it, { area: id })));
      if (withLocation && this.ctrl && run.state !== 'entering') {
        const q = this.ctrl.pos;
        p.location = { area: id, pos: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)], yaw: +this.ctrl.yaw.toFixed(3), t: Date.now() };
      } else if (!p.location) p.location = { area: id, pos: null, yaw: 0, t: Date.now() };
      P.save();
    }
    startActive() {
      // "Start mission" is a tap: a good moment to go fullscreen if you chose it
      if (this.game.settings.fullscreen) VR.Fullscreen.request();
      this.ui.close();
      if (this.run.state === 'entering') this.run.go('active');
      VR.Input.setFPEnabled(true); VR.Input.requestLock();
    }
    retry() {
      const run = this.run;
      if (!run.go('retry')) return;           // leave ACTIVE first so closing the menu does not re-grab the mouse
      this.paused = false; this.ui.close();
      Object.assign(run, { flags: new Set(), inventory: [], selected: 0, journal: [], time: 0, mistakes: 0, hintsUsed: 0, rewarded: false });
      run.go('entering');
      this.hands.hold(null);
      this.buildWorld(run.def);
      this.ui.setMission(run.def, run, this.defs.length);
      this.ui.showIntro(run.def, this.defs.length, () => this.startActive());
    }
    complete() {
      const run = this.run;
      if (!run.go('objective_completed')) return;
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.ui.setPrompt(null);
      const summary = MS().Rewards.grant(run, this.progress, this.defs);
      VR.Audio.play('success');
      const stats = {
        clues: run.journal.length,
        cluesTotal: run.def.entities.filter(e => e.type === 'text' && e.inspect !== false).length,
        items: run.def.entities.filter(e => e.type === 'item' && !e.bonus && run.has('got_' + (e.item || e.id))).map(e => e.name),
      };
      setTimeout(() => { if (this.run === run) this.ui.showResults(run, summary, stats, () => this.finish(true)); }, 700);
    }
    fail() {
      const run = this.run;
      if (!run.go('failed')) return;
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      VR.Audio.play('crash');
      this.ui.showFailed(run, () => this.retry(), () => this.finish(false));
    }
    leave() {
      if (!this.run.go('cancelled')) return;
      this.paused = false; this.ui.close();
      this.finish(false);
    }
    finish(success) {
      const run = this.run;
      if (!run.go('returning')) return;
      this.ui.close();
      VR.Input.setFPEnabled(false); VR.Input.releaseLock();
      this.game.onMissionReturn({ success, missionId: run.def.id, rewards: success ? run.rewardSummary : null });
    }
    /** Called by game.js once the screen has faded out. */
    exit() {
      if (!this.run) return;
      if (this.run.state === 'returning') this.run.go(this.run.rewarded ? 'completed' : 'ended');
      this.lastRun = this.run;
      this.clearWorld();
      this.ui.close(); this.ui.show(false);
      VR.Input.setMode('runner');
      this.active = false; this.paused = false; this.run = null;
    }
    /** Hard exit (quit to main menu). */
    abort() {
      if (!this.run) return;
      if (this.run.def.persistent) this.saveArea();
      if (['active', 'entering'].includes(this.run.state)) this.run.go('cancelled');
      if (['cancelled', 'failed', 'objective_completed'].includes(this.run.state)) this.run.go('returning');
      this.exit();
    }

    // ------------------------------------------------------------ pause / modals
    onPauseKey() {
      if (!this.run || this.frozen) return;
      const m = this.ui.modal;
      if (m === 'pause') return this.resume();
      if (m === 'intro' || m === 'results' || m === 'failed') return;
      if (m) return this.ui.close();
      this.pause();
    }
    pause() {
      if (!this.run || this.run.state !== 'active' || (this.paused && this.ui.modal === 'pause')) return;
      if (this.ui.modal) this.ui.close();
      this.paused = true;
      if (this.run.def.persistent) this.saveArea();
      this.ui.showPause(this.settings, {
        persistent: !!this.run.def.persistent,
        resume: () => this.resume(),
        restart: () => this.retry(),
        leave: () => this.leave(),
        quit: () => { this.ui.close(); this.paused = false; this.game.quitFromMission(); },
        setting: (k, v) => { this.settings[k] = v; VR.UI.store.set('fpSettings', this.settings); },
      });
    }
    resume() { this.paused = false; this.ui.close(); }
    /** stop taking input for a moment (fading out through a door) */
    freeze(on) {
      this.frozen = !!on;
      if (on) { this.ui.close(); this.ui.setPrompt(null); VR.Input.setFPEnabled(false); VR.Input.releaseLock(); }
    }
    onModal(open) {
      if (open) { VR.Input.setFPEnabled(false); VR.Input.releaseLock(); this.ui.setPrompt(null); return; }
      if (this.run && this.run.state === 'active' && !this.paused) { VR.Input.setFPEnabled(true); VR.Input.requestLock(); }
    }
    openJournal() {
      if (!this.run || this.run.state !== 'active' || (this.paused && this.ui.modal === 'pause')) return;
      if (this.ui.modal === 'journal') return this.ui.close();
      if (this.ui.modal) return;
      this.ui.showJournal(this.run);
    }

    // ------------------------------------------------------------ flags / events
    onState() {}
    onFlag(run) {
      if (run !== this.run) return;
      for (const e of this.entities) e.sync && e.sync(run);
      for (const r of run.def.rules || []) {
        if (r.set && !run.has(r.set) && MS().evalCond(run, r.when)) { run.setFlag(r.set); if (r.say) this.ui.caption(r.say, 3); }
      }
      for (const l of this.lockables) if (run.has(l.flag)) l.ent.lock();
      this.ui.refreshObjectives(run);
      if (run.def.persistent) { this.saveArea(false); return; }
      if (run.state === 'active' && MS().evalCond(run, run.def.success)) this.complete();
    }
    onInventory(run) {
      this.ui.setInventory(run);
      if (run.def.persistent && run === this.run) this.saveArea(false);
      const it = run.selectedItem();
      if (this.combat && this.combat.armed) return;          // the weapon is in your hands
      this.hands.hold(it ? this.itemModel(it.model) : null);
    }
    registerLockable(flag, ent) { if (flag) this.lockables.push({ flag, ent }); }
    itemModel(name) { const M = VR.MissionModels; return M[name] ? M[name]() : M.smallLemon(); }

    // ------------------------------------------------------------ world
    buildWorld(def, location = null) {
      this.clearWorld();
      const L = VR.MissionEnvironments[def.environment]();
      this.level = L;
      const sc = this.scene;
      sc.add(L.group);
      sc.background = new T.Color(L.ambient.background);
      sc.fog = L.ambient.fog ? new T.Fog(L.ambient.fog[0], L.ambient.fog[1], L.ambient.fog[2]) : null;
      const hemi = new T.HemisphereLight(L.ambient.sky, L.ambient.ground, L.ambient.intensity * 2.2);
      sc.add(hemi);
      if (L.sun) {
        const s = new T.DirectionalLight(L.sun.color, L.sun.intensity * 2);
        s.position.set(...L.sun.dir); sc.add(s);
      }
      this.levelLights = L.lights.map(def => {
        const l = new T.PointLight(def.color, def.intensity, def.distance, 2);
        l.position.set(...def.pos); sc.add(l);
        return { def, light: l };
      });
      this.poweredBulbs = [];
      // single-player combat (areas with `combat: true`): weapons, health, enemies (js/combat/)
      if (def.combat && VR.CombatSystem) this.combat = new VR.CombatSystem(this);
      const ctx = { level: L, scene: sc, mgr: this, run: this.run };
      this.entities = []; this.interactables = []; this.lockables = [];
      for (const ed of def.entities) {
        const comp = VR.Missions.Components[ed.type];
        if (!comp) continue;
        const ent = comp.build(ed, ctx);
        this.entities.push(ent);
        if (ent.kind) this.interactables.push(ent);
        if (ent.children) for (const c of ent.children) { c.parent = ent; this.interactables.push(c); this.entities.push(c); }
      }
      for (const e of this.entities) e.sync && e.sync(this.run);
      this.solidBoxes = L.solids.map(s => ({ s, box: new T.Box3(new T.Vector3(...s.min), new T.Vector3(...s.max)) }));
      this.ctrl.reset(L.spawn);
      if (location && location.pos) {               // CONTINUE: back where you were (the spawn stays the respawn point)
        this.ctrl.reset({ pos: location.pos, yaw: location.yaw || 0 });
        this.ctrl.spawn = L.spawn;
      }
      this.ctrl.update(0.016, L, { x: 0, y: 0 }, false);
      this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
      this.stepAcc = 0; this.target = null;
      this.game.renderer.compile(sc, this.camera);
    }
    clearWorld() {
      if (this.combat) { this.combat.dispose(); this.combat = null; }
      const sc = this.scene;
      for (const child of [...sc.children]) {
        sc.remove(child);
        child.traverse(o => {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
          if (o.material && o.material.userData && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        });
      }
      this.entities = []; this.interactables = []; this.levelLights = []; this.level = null; this.target = null;
    }

    // ------------------------------------------------------------ frame
    update(dt) {
      if (!this.active || !this.run) return;
      const run = this.run, ctrl = this.ctrl, L = this.level;
      const cb = this.combat;
      const playing = run.state === 'active' && !this.paused && !this.ui.modal && !this.frozen && !(cb && cb.dead);
      let look = { x: 0, y: 0 };
      if (playing) {
        const move = VR.Input.moveVector();
        let a;
        while ((a = VR.Input.nextAction())) {
          if (cb && cb.action(a)) continue;           // fire, reload, weapon slots, grenade
          if (a === 'jump') ctrl.jump();
          else if (a === 'slide') ctrl.slidePress();
          else if (a === 'burst') { if (ctrl.burst(move)) VR.Audio.play('burst'); else if (ctrl.burstCooldown > 0) this.ui.caption(VR.t('c.burstCharging'), 1); }
          else if (a === 'interact') this.interact();
          else if (a === 'journal') { this.openJournal(); break; }
          else if (a === 'slotNext' || a === 'slotPrev') { const n = run.inventory.length; if (n) run.select((run.selected + (a === 'slotNext' ? 1 : n - 1)) % n); }
          else if (a.startsWith('slot')) run.select(+a.slice(4) - 1);
        }
        look = VR.Input.takeLook();
        ctrl.look(look.x, look.y, FP().MOUSE_SENS * this.settings.sens * (cb && cb.scoped ? 0.35 : 1));
        const evs = ctrl.update(dt, L, move, VR.Input.crouchHeld());
        for (const e of evs) {
          if (e.type === 'jump') VR.Audio.play('jump');
          else if (e.type === 'land' && e.speed > 7) VR.Audio.play('land');
          else if (e.type === 'slide') VR.Audio.play('slide');
          else if (e.type === 'respawn') this.ui.caption(VR.t('c.fell'), 2);
        }
        evs.length = 0;
        if (ctrl.grounded && ctrl.speed > 2 && !ctrl.slideTimer) {
          this.stepAcc += ctrl.speed * dt;
          if (this.stepAcc > 2.1) { this.stepAcc = 0; VR.Audio.play('fpStep'); }
        }
        this.updateTarget();
        this.ui.lockHint(!VR.Input.isLocked());
      } else {
        VR.Input.takeLook();
        if (cb && cb.dead) ctrl.update(dt, L, { x: 0, y: 0 }, false);   // keep falling / standing while down
      }
      if (cb) cb.update(dt, playing, look);
      if (run.state === 'active' && !this.paused) {
        run.time += dt;
        if (run.def.persistent && (this.saveT = (this.saveT || 0) + dt) > 3) { this.saveT = 0; this.saveArea(); }
        if (run.def.timeLimit && run.time >= run.def.timeLimit) this.fail();
      }
      for (const e of this.entities) e.update && e.update(dt, run);
      this.hands.update(dt, ctrl, look);
      this.hands.setBrightness(this.lightLevel());
      const fov = (cb && cb.scoped ? 32 : this.settings.fov) + ctrl.burstFov;
      if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.ui.setTimer(run);
      this.ui.setAbility(ctrl.burstCooldown, FP().BURST_COOLDOWN);
    }

    lightLevel() {
      const L = this.level; if (!L) return 1;
      const p = this._p.copy(this.ctrl.pos); p.y += this.ctrl.eye;
      let sum = 0;
      for (const { light } of this.levelLights) {
        if (light.intensity <= 0) continue;
        const d = light.position.distanceTo(p);
        if (light.distance && d > light.distance) continue;
        const w = light.distance ? Math.pow(Math.max(0, 1 - Math.pow(d / light.distance, 4)), 2) : 1;
        sum += light.intensity * w / (d * d + 1);
      }
      return T.MathUtils.clamp(0.22 + L.ambient.intensity * 0.7 + sum * 0.16, 0.22, 1);
    }

    updateTarget() {
      const cam = this.camera;
      const origin = cam.getWorldPosition(this._v.set(0, 0, 0)).clone();
      const dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const ray = new T.Ray(origin, dir);
      const reach = FP().REACH;
      let best = null, bestD = reach;
      const pt = new T.Vector3();
      for (const e of this.interactables) {
        if (!e.hit || !e.kind) continue;
        if (e.obj && !visibleChain(e.obj)) continue;
        const p = e.prompt(this.run);
        if (!p) continue;
        if (!ray.intersectBox(e.hit, pt)) continue;
        const d = pt.distanceTo(origin);
        if (d < bestD) { bestD = d; best = { e, p }; }
      }
      if (best) {
        const owner = best.e.parent ? best.e.parent.id : best.e.id;
        for (const { s, box } of this.solidBoxes) {
          if (!s.enabled || s.owner === owner || s.owner === best.e.id || s.seeThrough) continue;
          if (box.containsPoint(origin)) continue;
          if (ray.intersectBox(box, pt) && pt.distanceTo(origin) < bestD - 0.15) { best = null; break; }
        }
      }
      this.target = best;
      this.ui.setPrompt(best ? { kind: best.p.kindOverride || best.e.kind, verb: best.p.verb, label: best.p.label } : null);
    }
    interact() {
      if (!this.target) return;
      this.hands.pokeReach();
      this.target.e.use(this.run);
      this.ui.refreshObjectives(this.run);
    }

    render(renderer) {
      renderer.render(this.scene, this.camera);
      if (this.run && this.run.state !== 'entering' && !(this.combat && this.combat.scoped)) {
        const ac = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.hands.scene, this.hands.camera);
        renderer.autoClear = ac;
      }
    }
  }

  function visibleChain(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }

  VR.MissionManager = MissionManager;
})();
