/* =====================================================================
 * SINGLE-PLAYER COMBAT — the player's weapons in the adventure world,
 * and the pieces a level uses to set up a fight.
 * ---------------------------------------------------------------------
 * VR.CombatSystem (one per area whose definition has `combat: true`;
 * created by the mission manager):
 *   loadout   two weapon slots + impulse grenades, saved in the profile
 *             (inventory.weapons, inventory.consumables.nade)
 *   health    100, regenerates after 4 s without damage
 *   enemies   VR.EnemySystem (js/combat/enemies.js)
 *   death     a short fade, then back at the area's respawn point with
 *             full health; a running fight resets (no penalty)
 *
 * Controls: left click fire (hold for the SMG) · right click aim (sniper
 * scope) · R reload · 1 / 2 or mouse wheel weapon · G grenade · E pick
 * up / swap a weapon on the ground. Touch: on-screen buttons.
 *
 * Components (used in area definitions):
 *   weaponPickup  { weapon }   a weapon lying on the ground. Empty slot:
 *                 take it. Same weapon: take its ammo. Both slots full:
 *                 swap — your current weapon is left in its place.
 *                 ('nade' gives the impulse grenades.)
 *   ammoCrate     refills every weapon's reserve and the grenades
 *                 (then needs a short while to fill up again)
 *   encounter     a fight in waves, started by walking into a zone (first
 *                 time) or by its bell (again, for practice). While it
 *                 runs it sets the flag `<id>_fight` (a gate can close on
 *                 it); when cleared it sets `flag` and pays `reward` once.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const K = () => VR.WeaponKit;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const AR_NUM = (n) => (VR.lang === 'ar' ? String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]) : String(n));

  Object.assign(VR.I18N.STRINGS.en, {
    'cb.take': 'Take', 'cb.swap': 'Swap', 'cb.ammo': 'Take ammo', 'cb.full': 'Ammo full', 'cb.refill': 'Refill ammo', 'cb.crate': 'Ammo crate',
    'cb.crateEmpty': 'The crate is refilling…', 'cb.refilled': 'Ammo refilled', 'cb.got': 'Picked up: {name}', 'cb.swapped': 'Left {old}, took {name}',
    'cb.reload': 'Reloading…', 'cb.noAmmo': 'No ammo', 'cb.down': 'You went down', 'cb.downSub': 'Back to the entrance…',
    'cb.wave': 'Wave {n}/{total}', 'cb.cleared': 'Cleared!', 'cb.reward': '+{coins} coins', 'cb.bell': 'Start the fight', 'cb.bellName': 'Training bell',
    'cb.running': 'The fight is on', 'cb.left': '{n} left', 'cb.nades': 'Grenades',
    'cb.t.fire': 'FIRE', 'cb.t.aim': 'AIM', 'cb.t.reload': 'R', 'cb.t.swap': '⇄', 'cb.t.nade': 'G',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'cb.take': 'خذ', 'cb.swap': 'بدّل', 'cb.ammo': 'خذ الذخيرة', 'cb.full': 'الذخيرة ممتلئة', 'cb.refill': 'املأ الذخيرة', 'cb.crate': 'صندوق ذخيرة',
    'cb.crateEmpty': 'الصندوق يمتلئ من جديد…', 'cb.refilled': 'امتلأت الذخيرة', 'cb.got': 'أخذت: {name}', 'cb.swapped': 'تركت {old} وأخذت {name}',
    'cb.reload': 'إعادة تعبئة…', 'cb.noAmmo': 'لا ذخيرة', 'cb.down': 'سقطت', 'cb.downSub': 'العودة إلى المدخل…',
    'cb.wave': 'الموجة {n}/{total}', 'cb.cleared': 'تم التطهير!', 'cb.reward': '+{coins} عملة', 'cb.bell': 'ابدأ القتال', 'cb.bellName': 'جرس التدريب',
    'cb.running': 'القتال جارٍ', 'cb.left': 'بقي {n}', 'cb.nades': 'قنابل',
    'cb.t.fire': 'أطلق', 'cb.t.aim': 'صوّب', 'cb.t.reload': 'R', 'cb.t.swap': '⇄', 'cb.t.nade': 'G',
  });

  const NADE_ICON = '◆';

  /* ==================================================================
   * COMBAT SYSTEM
   * ================================================================ */
  class CombatSystem {
    constructor(mgr) {
      this.mgr = mgr;
      this.fx = new VR.DuelFx(mgr.scene);
      this.enemies = new VR.EnemySystem(mgr.scene, mgr.level, this.fx, () => mgr.solidBoxes || []);
      const up = (id) => (VR.Shop ? VR.Shop.level(id) : 0);                // shop upgrades (js/adventure/shop.js)
      this.health = new VR.Health(100 + 20 * up('hp'), up('regen') ? { regenDelay: 2.5, regen: 18 } : { regenDelay: 4, regen: 12 });
      this.health.onChange((hp, d) => this.hud && this.setHP());
      this.ray = new T.Ray();
      const inv = VR.Profiles.player().inventory;
      this.slots = (inv.weapons || []).filter(w => K().WEAPONS[w.id]).slice(0, 2).map(w => ({ id: w.id, mag: w.mag | 0, reserve: w.reserve | 0 }));
      this.cur = Math.min(inv.weaponSlot | 0, Math.max(0, this.slots.length - 1));
      const nd = (inv.consumables && inv.consumables.nade) || null;
      this.nades = nd ? { has: true, charges: nd.charges !== undefined ? nd.charges : this.nadeMax(), rechargeT: 0 } : { has: false, charges: 0, rechargeT: 0 };
      this.flying = [];
      this.coolT = 0; this.reloadT = 0; this.switchT = 0; this.kick = 0; this.shake = 0; this.dmgFlash = 0;
      this.scoped = false; this.dead = false; this.deadT = 0;
      this.gunHolder = new T.Group(); mgr.hands.root.add(this.gunHolder);
      this.gunModels = {};
      this.respawnAt = null;                    // set by the area (anchor) or the level spawn
      this.buildHud();
      this.refreshGun();
    }
    get armed() { return this.slots.length > 0; }
    /** carried ammo limit (shop: +25 % per ammo-belt level) */
    maxReserve(id) { return Math.round(K().WEAPONS[id].reserve * (1 + 0.25 * (VR.Shop ? VR.Shop.level('ammo') : 0))); }
    /** grenade charges (shop: +1) */
    nadeMax() { return K().NADE.max + (VR.Shop ? VR.Shop.level('nades') : 0); }
    /** shop upgrades bought while in the world: apply them now */
    applyUpgrades() {
      const up = (id) => (VR.Shop ? VR.Shop.level(id) : 0);
      const max = 100 + 20 * up('hp');
      if (max !== this.health.max) { const add = max - this.health.max; this.health.max = max; this.health.hp = Math.min(max, this.health.hp + Math.max(0, add)); }
      if (up('regen')) { this.health.regenDelay = 2.5; this.health.regen = 18; }
      this.setHP(); this.setAmmo();
    }
    /** a medkit from the shop (H): +50 health */
    useMedkit() {
      const inv = VR.Profiles.player().inventory, c = inv.consumables || (inv.consumables = {});
      if (!(c.medkit > 0) || this.dead) return false;
      if (this.health.hp >= this.health.max) { this.mgr.ui.caption(VR.t('shop.fullHp'), 1.4); return true; }
      c.medkit--; this.health.heal(50); VR.Profiles.save(); this.setAmmo();
      VR.Audio.play('powerup');
      return true;
    }
    get weapon() { return this.slots[this.cur] || null; }
    get wdef() { return this.weapon ? K().WEAPONS[this.weapon.id] : null; }

    // ------------------------------------------------------------ saving
    save() {
      const inv = VR.Profiles.player().inventory;
      inv.weapons = this.slots.map(s => ({ id: s.id, mag: s.mag, reserve: s.reserve }));
      inv.weaponSlot = this.cur;
      inv.consumables = inv.consumables || {};
      if (this.nades.has) inv.consumables.nade = { charges: this.nades.charges }; else delete inv.consumables.nade;
      VR.Profiles.save();
    }

    // ------------------------------------------------------------ loadout
    /** take a weapon from the ground. Returns what is left on the ground (a weapon id, or null). */
    takeWeapon(id) {
      const W = K().WEAPONS;
      if (id === 'nade') {
        if (this.nades.has && this.nades.charges >= this.nadeMax()) return 'nade';
        this.nades.has = true; this.nades.charges = this.nadeMax(); this.save(); this.setAmmo();
        this.mgr.ui.toast(tr('cb.got', { name: L(K().NADE.name) })); VR.Audio.play('pickup');
        return null;
      }
      const w = W[id]; if (!w) return id;
      const same = this.slots.find(s => s.id === id);
      if (same) {                                     // same weapon: take its ammo
        if (same.reserve >= this.maxReserve(id)) return id;
        same.reserve = this.maxReserve(id); this.save(); this.setAmmo();
        this.mgr.ui.toast(tr('cb.refilled')); VR.Audio.play('pickup');
        return null;
      }
      const fresh = { id, mag: w.mag, reserve: Math.round(this.maxReserve(id) * 0.5) };
      let dropped = null;
      if (this.slots.length < 2) { this.slots.push(fresh); this.cur = this.slots.length - 1; this.mgr.ui.toast(tr('cb.got', { name: L(w.name) })); }
      else {
        dropped = this.slots[this.cur].id;
        this.slots[this.cur] = fresh;
        this.mgr.ui.toast(tr('cb.swapped', { old: L(W[dropped].name), name: L(w.name) }));
      }
      this.reloadT = 0; this.switchT = 0.3; this.scoped = false;
      VR.Audio.play('pickup');
      this.save(); this.refreshGun();
      this.mgr.onInventory(this.mgr.run);
      return dropped;
    }
    /** what using a pickup of this weapon would do: 'take' | 'swap' | 'ammo' | 'full' */
    pickupMode(id) {
      if (id === 'nade') return this.nades.has && this.nades.charges >= this.nadeMax() ? 'full' : this.nades.has ? 'ammo' : 'take';
      const same = this.slots.find(s => s.id === id);
      if (same) return same.reserve >= this.maxReserve(id) ? 'full' : 'ammo';
      return this.slots.length < 2 ? 'take' : 'swap';
    }
    refill() {
      let any = false;
      for (const s of this.slots) { const mx = this.maxReserve(s.id); if (s.reserve < mx) { s.reserve = mx; any = true; } }
      if (this.nades.has && this.nades.charges < this.nadeMax()) { this.nades.charges = this.nadeMax(); any = true; }
      if (any) { this.save(); this.setAmmo(); }
      return any;
    }
    switchTo(i) {
      if (i < 0 || i >= this.slots.length || i === this.cur) return;
      this.cur = i; this.switchT = 0.3; this.reloadT = 0; this.scoped = false;
      VR.Audio.play('click');
      this.refreshGun(); this.save();
    }
    refreshGun() {
      for (const k in this.gunModels) this.gunModels[k].visible = false;
      const w = this.weapon;
      if (w) {
        if (!this.gunModels[w.id]) {
          const m = K().model(w.id); m.scale.setScalar(w.id === 'sniper' ? 0.62 : 0.8);
          this.gunHolder.add(m); this.gunModels[w.id] = m;
        }
        this.gunModels[w.id].visible = true;
        if (this.mgr.hands.held) this.mgr.hands.hold(null);
      }
      this.gunHolder.visible = !!w;
      this.setAmmo();
      if (this.hud) this.hud.root.hidden = !this.armed && !this.nades.has;
      this.touchSync();
    }

    // ------------------------------------------------------------ input
    /** an input action; true when combat used it (otherwise the area handles it) */
    action(a) {
      if (this.dead) return true;
      if (a === 'grenade') { if (this.nades.has) this.throwNade(); return this.nades.has; }
      if (a === 'medkit') return this.useMedkit();
      if (!this.armed) return false;
      if (a === 'fire') { this.fire(); return true; }
      if (a === 'reload') { this.startReload(); return true; }
      if (a === 'slot1') { this.switchTo(0); return true; }
      if (a === 'slot2') { this.switchTo(1); return true; }
      if (a === 'slotNext' || a === 'slotPrev' || a === 'swap') { this.switchTo((this.cur + 1) % this.slots.length); return true; }
      return false;
    }

    // ------------------------------------------------------------ shooting
    eyePos(out) { const c = this.mgr.ctrl; return out.set(c.pos.x, c.pos.y + c.eye, c.pos.z); }
    aimDir(out) { const c = this.mgr.ctrl, cp = Math.cos(c.pitch); return out.set(-Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp); }
    muzzleWorld() {
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      if (this.scoped) return o.addScaledVector(d, 0.6).add(new T.Vector3(0, -0.08, 0));
      return o.addScaledVector(d, 0.7).addScaledVector(this.mgr.ctrl.right(), 0.17).add(new T.Vector3(0, -0.15, 0));
    }
    solids() { return this.mgr.solidBoxes || []; }
    fire() {
      const s = this.weapon, w = this.wdef;
      if (!s || this.coolT > 0 || this.switchT > 0 || this.reloadT > 0) return;
      if (s.mag <= 0) { VR.Audio.play('empty'); this.coolT = 0.25; this.startReload(); return; }
      s.mag--; this.coolT = w.rate;
      const o = this.eyePos(new T.Vector3());
      const targets = this.enemies.targets();
      const hits = new Map();
      const muzzle = this.muzzleWorld();
      const spread = this.scoped ? (w.scopedSpread || 0) : w.spread * (this.mgr.ctrl.grounded ? 1 : 1.6);
      for (let i = 0; i < w.pellets; i++) {
        const d = this.aimDir(new T.Vector3());
        if (spread) { d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize(); }
        const r = K().traceParts(this.ray, this.solids(), o, d, targets, w.range * 1.5);
        if (r.ref) {
          const fall = 1 - 0.6 * Math.min(1, r.dist / w.range);
          const base = s.id === 'sniper' && r.hit === 'head' ? 99999 : w.dmg * fall * (r.hit === 'head' ? w.head : 1);   // sniper headshot: always a kill
          const res = r.ref.hurt(base, r.hit, this.enemies);
          const h = hits.get(r.ref) || { dmg: 0, head: false, weak: false, armored: false, killed: false };
          h.dmg += res.dmg; h.head = h.head || r.hit === 'head'; h.weak = h.weak || r.hit === 'weak'; h.armored = h.armored || res.armored; h.killed = h.killed || res.killed;
          hits.set(r.ref, h);
        } else if (i < 3) this.fx.puff(r.end, 0xd8ccb0, 3);
        if (i < 3) this.fx.tracer(muzzle, r.end, w.pellets > 1 ? 0xff9a4a : 0xffe14a);
      }
      this.fx.flash(muzzle);
      this.enemies.noise(o, 20);
      this.kick = Math.min(1.4, this.kick + w.kick); this.shake = Math.max(this.shake, 0.03 * w.kick);
      VR.Audio.play(w.sound);
      if (hits.size) {
        let head = false, weak = false, armored = false;
        for (const h of hits.values()) { head = head || h.head; weak = weak || h.weak; armored = armored || (h.armored && !h.weak && !h.head); }
        this.hitmarker(head || weak ? 'crit' : armored ? 'armor' : '');
        VR.Audio.play(head || weak ? 'headshot' : 'hitmark');
      }
      this.setAmmo();
    }
    startReload() {
      const s = this.weapon, w = this.wdef;
      if (!s || this.reloadT > 0 || s.mag >= w.mag) return;
      if (s.reserve <= 0) { this.mgr.ui.caption(tr('cb.noAmmo'), 1.4); return; }
      this.reloadT = w.reload; this.scoped = false; this.reloadOf = s;
      VR.Input.hold('aim', false);                  // reloading drops the scope: aim again afterwards
      document.querySelectorAll('.mi-tbtn.on[data-hold="aim"]').forEach(b => b.classList.remove('on'));
      VR.Audio.play('reload');
    }
    finishReload() {
      const s = this.reloadOf, w = s && K().WEAPONS[s.id];
      this.reloadT = 0; this.reloadOf = null;
      if (!s || s !== this.weapon) return;
      const n = Math.min(w.mag - s.mag, s.reserve);
      s.mag += n; s.reserve -= n;
      this.setAmmo();
    }

    // ------------------------------------------------------------ grenades
    throwNade() {
      const N = K().NADE;
      if (!this.nades.has || this.nades.charges < 1 || this.dead) return;
      this.nades.charges--;
      if (this.nades.rechargeT <= 0) this.nades.rechargeT = N.recharge;
      const c = this.mgr.ctrl;
      const o = this.eyePos(new T.Vector3()), d = this.aimDir(new T.Vector3());
      const p = o.addScaledVector(d, 0.5).addScaledVector(c.right(), -0.12);
      const v = d.multiplyScalar(N.speed).add(new T.Vector3(0, 2.5, 0)).addScaledVector(c.vel, 0.4);
      const obj = K().model('nade'); obj.scale.setScalar(1.6); obj.position.copy(p);
      this.mgr.scene.add(obj);
      this.flying.push({ obj, pos: p.clone(), vel: v, t: 0 });
      this.mgr.hands.pokeReach();
      VR.Audio.play('throw');
      this.setAmmo(); this.save();
    }
    updateNades(dt) {
      const N = K().NADE;
      if (this.nades.has && this.nades.charges < this.nadeMax()) {
        this.nades.rechargeT -= dt;
        if (this.nades.rechargeT <= 0) { this.nades.charges++; this.nades.rechargeT = this.nades.charges < this.nadeMax() ? N.recharge : 0; this.setAmmo(); }
      }
      for (let i = this.flying.length - 1; i >= 0; i--) {
        const n = this.flying[i];
        n.t += dt;
        let boom = K().stepNade(n, dt, this.solids());
        n.obj.position.copy(n.pos);
        VR.nadeSpin(n, dt);                                // lands, then goes off 1 s later
        if (boom) {
          this.mgr.scene.remove(n.obj); this.flying.splice(i, 1);
          this.fx.wave(boom); VR.Audio.play('burst');
          const hit = this.enemies.blast(boom, N.R, N.dmg, N.push);
          if (hit.length) { this.hitmarker(''); VR.Audio.play('hitmark'); }
          if (K().impulse(this.mgr.ctrl, boom, N.R, N.push)) this.shake = Math.max(this.shake, 0.22);   // no self-damage: it is a jump tool too
          this.enemies.noise(boom, 20);
        }
      }
    }

    // ------------------------------------------------------------ getting hurt
    get playerView() {
      const c = this.mgr.ctrl, self = this;
      return { id: VR.Profiles.activeId(), pos: c.pos, vel: c.vel, health: this.health, hurt: (dmg, from) => self.hurt(dmg, from) };
    }
    hurt(dmg, from) {
      if (this.dead || this.mgr.paused || this.mgr.ui.modal) return;
      const took = this.health.damage(dmg, from);
      if (!took) return;
      this.dmgFlash = Math.min(1, this.dmgFlash + 0.35 + dmg / 40); this.shake = Math.max(this.shake, 0.12);
      VR.Audio.play('hurt');
      if (from && from.pos) this.showDirection(from.pos);
      if (this.health.dead) this.die();
    }
    die() {
      this.dead = true; this.deadT = 0; this.scoped = false;
      this.mgr.ui.caption(tr('cb.down') + ' — ' + tr('cb.downSub'), 2.2);
      VR.Audio.play('crash');
    }
    respawn() {
      const m = this.mgr, at = this.respawnAt || m.level.spawn;
      m.ctrl.reset(at); m.ctrl.spawn = m.level.spawn;
      this.health.reset(); this.health.invuln = 2;
      this.dead = false; this.dmgFlash = 0;
      for (const n of this.flying) m.scene.remove(n.obj);
      this.flying = [];
      for (const e of m.entities) if (e.onPlayerDeath) e.onPlayerDeath();
      this.refill();                                  // a fresh start: reserves back up
      for (const s of this.slots) s.mag = K().WEAPONS[s.id].mag;
      this.setAmmo(); this.save();
    }

    // ------------------------------------------------------------ frame
    update(dt, playing, look) {
      const m = this.mgr;
      this.coolT = Math.max(0, this.coolT - dt);
      this.switchT = Math.max(0, this.switchT - dt);
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
      if (this.dead) {
        this.deadT += dt;
        m.game.fade.target = this.deadT > 0.8 ? 1 : 0.6;
        if (this.deadT > 1.8) { this.respawn(); m.game.fade.target = 0; }
      }
      if (playing && !this.dead) {
        // an empty magazine reloads by itself once the last shot is done
        const cur = this.weapon;
        if (cur && cur.mag <= 0 && cur.reserve > 0 && this.reloadT <= 0 && this.coolT <= 0 && this.switchT <= 0) this.startReload();
        // automatic weapons fire while the button is held
        const w = this.wdef;
        if (w && w.auto && VR.Input.fireHeld()) this.fire();
        const wantScope = !!(w && w.scope) && VR.Input.aimHeld() && this.reloadT <= 0 && this.switchT <= 0;
        if (wantScope !== this.scoped) { this.scoped = wantScope; if (wantScope) VR.Audio.play('scope'); }
        this.health.update(dt);
      } else if (!playing) this.scoped = false;
      if (playing || this.dead) this.enemies.update(dt, this.playerView);
      this.updateNades(dt);
      this.fx.update(dt);
      // the gun in the hands (same feel as the duel)
      const c = m.ctrl, H = m.hands;
      this.kick = Math.max(0, this.kick - dt * 6);
      const wide = Math.min(1, Math.max(0.42, H.camera.aspect / 1.5));
      const sw = this.switchT > 0 ? Math.sin((this.switchT / 0.3) * Math.PI) : 0;
      const rlT = this.wdef ? this.wdef.reload : 1;
      const rl = this.reloadT > 0 ? Math.sin((1 - this.reloadT / rlT) * Math.PI) : 0;
      const bob = Math.sin(c.bobPhase) * 0.012 * c.bobAmt;
      this.gunHolder.position.set(0.17 * wide + H.sway.x, -0.2 + H.sway.y - sw * 0.25 - rl * 0.1 + bob + c.landDip * 0.2, -0.46 + this.kick * 0.07);
      this.gunHolder.rotation.set(this.kick * 0.18 + rl * 0.5, 0.04, -rl * 0.5);
      // camera shake / recoil on the mission camera
      this.shake = Math.max(0, this.shake - dt * 1.5);
      if (this.shake > 0 || this.kick > 0) {
        m.camera.rotation.x += this.kick * 0.012 + (Math.random() - 0.5) * this.shake * 0.05;
        m.camera.rotation.y += (Math.random() - 0.5) * this.shake * 0.05;
      }
      this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.6);
      this.updateHud(dt);
    }
    dispose() {
      this.enemies.clear(); this.fx.clear();
      for (const n of this.flying) this.mgr.scene.remove(n.obj);
      this.flying = [];
      this.mgr.hands.root.remove(this.gunHolder);
      if (this.hud) { this.hud.root.remove(); this.hud.touch.remove(); this.hud.over.remove(); }
      this.hud = null;
    }

    // ------------------------------------------------------------ HUD
    buildHud() {
      const hudRoot = document.querySelector('#mission-ui .mi-hud');
      const root = document.createElement('div'); root.className = 'cb-hud';
      root.innerHTML = `<div class="cb-hp panel"><div class="cb-hpbar"><i></i></div><span class="cb-hpn">100</span></div>
        <div class="cb-ammo panel"><b class="cb-wname"></b><span class="cb-mag">0</span><span class="cb-res">/ 0</span><div class="cb-slots"></div><div class="cb-nades"></div></div>
        <div class="cb-banner" hidden></div><div class="cb-left" hidden></div>`;
      hudRoot.appendChild(root);
      const over = document.createElement('div'); over.className = 'cb-over';
      over.innerHTML = `<div class="du-dmg cb-dmg"></div><div class="du-scope cb-scope" hidden></div><div class="du-hit cb-hit" hidden><i></i><i></i><i></i><i></i></div><div class="cb-dir"></div>`;
      hudRoot.prepend(over);
      const touch = document.createElement('div'); touch.className = 'cb-tbtns';
      touch.innerHTML = `<button class="mi-tbtn cb-tfire" data-hold="fire" data-act="fire">${tr('cb.t.fire')}</button>
        <button class="mi-tbtn" data-hold="aim">${tr('cb.t.aim')}</button>
        <button class="mi-tbtn" data-act="reload">${tr('cb.t.reload')}</button>
        <button class="mi-tbtn" data-act="swap">${tr('cb.t.swap')}</button>
        <button class="mi-tbtn" data-act="grenade">${tr('cb.t.nade')}</button>
        <button class="mi-tbtn" data-act="medkit">✚</button>`;
      document.getElementById('mi-touch').appendChild(touch);
      touch.querySelectorAll('button').forEach(b => {
        const down = (e) => { e.preventDefault(); e.stopPropagation(); if (b.dataset.hold) VR.Input.hold(b.dataset.hold, true); if (b.dataset.act) VR.Input.press(b.dataset.act); };
        const up = (e) => { e.preventDefault(); if (b.dataset.hold) VR.Input.hold(b.dataset.hold, false); };
        b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
        b.addEventListener('mousedown', down); b.addEventListener('mouseup', up);
      });
      const q = (s, r = root) => r.querySelector(s);
      this.hud = { root, over, touch, hpbar: q('.cb-hpbar i'), hpn: q('.cb-hpn'), wname: q('.cb-wname'), mag: q('.cb-mag'), res: q('.cb-res'), slots: q('.cb-slots'), nades: q('.cb-nades'),
        banner: q('.cb-banner'), left: q('.cb-left'), dmg: q('.cb-dmg', over), scope: q('.cb-scope', over), hit: q('.cb-hit', over), dir: q('.cb-dir', over) };
      root.hidden = !this.armed && !this.nades.has;
      this.setHP(); this.setAmmo(); this.touchSync();
    }
    touchSync() { if (this.hud) this.hud.touch.hidden = !this.armed && !this.nades.has; }
    setHP() {
      const h = this.hud; if (!h) return;
      const f = Math.max(0, this.health.frac);
      h.hpbar.style.transform = `scaleX(${f})`; h.hpbar.parentNode.classList.toggle('low', f < 0.35);
      h.hpn.textContent = Math.ceil(this.health.hp);
    }
    setAmmo() {
      const h = this.hud; if (!h) return;
      const s = this.weapon, w = this.wdef;
      h.wname.textContent = w ? L(w.name) : '';
      h.mag.textContent = s ? s.mag : '–'; h.res.textContent = s ? `/ ${s.reserve}` : '';
      h.mag.classList.toggle('low', !!s && s.mag <= Math.ceil(w.mag * 0.25));
      h.slots.innerHTML = this.slots.map((x, i) => `<i class="${i === this.cur ? 'on' : ''}">${i + 1} ${VR.L(K().WEAPONS[x.id].name)}</i>`).join('');
      const meds = ((VR.Profiles.player().inventory.consumables || {}).medkit) | 0;
      h.nades.innerHTML = (meds ? `<span class="cb-med">✚ ${meds} <small>H</small></span> ` : '') + (this.nades.has ? `${tr('cb.nades')} <b>${NADE_ICON.repeat(this.nades.charges)}<s>${NADE_ICON.repeat(this.nadeMax() - this.nades.charges)}</s></b>` : '');
    }
    hitmarker(kind) {
      const el = this.hud && this.hud.hit; if (!el) return;
      el.hidden = false; el.className = 'du-hit cb-hit' + (kind === 'crit' ? ' head' : kind === 'armor' ? ' armor' : '');
      el.animate([{ transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 320 });
      clearTimeout(this.hitTm); this.hitTm = setTimeout(() => { el.hidden = true; }, 320);
    }
    /** a red arc on the side the damage came from */
    showDirection(from) {
      const c = this.mgr.ctrl;
      const ang = Math.atan2(from.x - c.pos.x, from.z - c.pos.z);         // world
      const rel = ang - Math.atan2(-Math.sin(c.yaw), -Math.cos(c.yaw));
      const el = this.hud && this.hud.dir; if (!el) return;
      el.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700 });
    }
    banner(text, ms = 1600) {
      const b = this.hud && this.hud.banner; if (!b) return;
      b.textContent = text; b.hidden = false;
      clearTimeout(this.bannerTm); this.bannerTm = setTimeout(() => { b.hidden = true; }, ms);
    }
    setLeft(n) { const el = this.hud && this.hud.left; if (!el) return; el.hidden = n === null; if (n !== null) el.textContent = tr('cb.left', { n: AR_NUM(n) }); }
    updateHud() {
      const h = this.hud; if (!h) return;
      h.dmg.style.opacity = Math.min(0.85, this.dmgFlash);
      h.scope.hidden = !this.scoped;
      document.getElementById('mi-cross').style.visibility = this.scoped ? 'hidden' : '';
      if (this.reloadT > 0) h.mag.textContent = '…';
    }
  }
  VR.CombatSystem = CombatSystem;

  /* ==================================================================
   * COMPONENTS
   * ================================================================ */
  const pickupState = (area) => { const w = VR.Profiles.world(area); return w.pickups || (w.pickups = {}); };

  MS.Components.weaponPickup = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const area = ctx.mgr.run.def.id;
      const holder = new T.Group(); holder.position.copy(pos); holder.rotation.y = yaw;
      const stand = new T.Mesh(new T.BoxGeometry(0.9, 0.08, 0.5), new T.MeshLambertMaterial({ color: 0x3a3f4d }));
      stand.material.userData.own = true; stand.geometry.userData.own = true;
      holder.add(stand);
      const ring = new T.Mesh(new T.BoxGeometry(0.95, 0.02, 0.55), new T.MeshBasicMaterial({ color: 0xffe14a }));
      ring.material.userData.own = true; ring.geometry.userData.own = true; ring.position.y = 0.05; holder.add(ring);
      ctx.scene.add(holder);
      let model = null, t = Math.random() * 6;
      const st = () => { const s = pickupState(area); return s[def.id] !== undefined ? s[def.id] : def.weapon; };
      const show = () => {
        if (model) holder.remove(model);
        const w = st();
        model = w ? K().model(w) : null;
        stand.visible = ring.visible = !!w;                // nothing left here: no stand either
        if (model) { model.scale.setScalar(w === 'nade' ? 2.2 : 1.35); model.position.y = 0.45; model.rotation.y = Math.PI / 2; holder.add(model); }
        e.hit = new T.Box3(new T.Vector3(pos.x - 0.6, pos.y, pos.z - 0.6), new T.Vector3(pos.x + 0.6, pos.y + 1.0, pos.z + 0.6));
      };
      const name = (w) => L(w === 'nade' ? K().NADE.name : K().WEAPONS[w].name);
      const e = {
        id: def.id, def, obj: holder, kind: 'collect',
        prompt: () => {
          const w = st(), cb = ctx.mgr.combat; if (!w || !cb) return null;
          const mode = cb.pickupMode(w);
          if (mode === 'swap') return { verb: tr('cb.swap'), label: `${L(cb.wdef.name)} ⇄ ${name(w)}` };
          if (mode === 'ammo') return { verb: tr('cb.ammo'), label: name(w) };
          if (mode === 'full') return { verb: tr('cb.full'), label: name(w), kindOverride: 'inspect' };
          return { verb: tr('cb.take'), label: name(w) };
        },
        use: (run) => {
          const w = st(), cb = ctx.mgr.combat; if (!w || !cb) return;
          if (cb.pickupMode(w) === 'full') { VR.Audio.play('buzz'); return; }
          const left = cb.takeWeapon(w);
          pickupState(area)[def.id] = left;
          VR.Profiles.save();
          run.setFlag('got_weapon_' + w);
          show();
        },
        update: (dt) => { t += dt; if (model) { model.position.y = 0.45 + Math.sin(t * 2) * 0.04; model.rotation.y = Math.PI / 2 + Math.sin(t * 0.8) * 0.4; } },
        sync: () => {},
      };
      show();
      return e;
    },
  };

  MS.Components.ammoCrate = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const m = VR.MissionModels.crate(0.9, 0x3f6b3a); m.position.copy(pos); m.rotation.y = yaw;
      const band = new T.Mesh(new T.BoxGeometry(0.94, 0.12, 0.94), new T.MeshBasicMaterial({ color: 0xffe14a }));
      band.material.userData.own = true; band.geometry.userData.own = true; band.position.y = 0.6; m.add(band);
      ctx.scene.add(m);
      ctx.level.solids.push(Object.assign({ min: [pos.x - 0.45, pos.y, pos.z - 0.45], max: [pos.x + 0.45, pos.y + 0.9, pos.z + 0.45], enabled: true, owner: def.id }));
      let cool = 0;
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        hit: new T.Box3(new T.Vector3(pos.x - 0.5, pos.y, pos.z - 0.5), new T.Vector3(pos.x + 0.5, pos.y + 1.0, pos.z + 0.5)),
        prompt: () => (ctx.mgr.combat && (ctx.mgr.combat.armed || ctx.mgr.combat.nades.has) ? { verb: cool > 0 ? tr('v.inspect') : tr('cb.refill'), label: tr('cb.crate'), kindOverride: cool > 0 ? 'inspect' : null } : null),
        use: () => {
          const cb = ctx.mgr.combat; if (!cb) return;
          if (cool > 0) { ctx.mgr.ui.caption(tr('cb.crateEmpty'), 1.6); return; }
          if (cb.refill()) { cool = def.cooldown || 20; ctx.mgr.ui.toast(tr('cb.refilled')); VR.Audio.play('reload'); }
          else ctx.mgr.ui.caption(tr('cb.full'), 1.4);
        },
        update: (dt) => { cool = Math.max(0, cool - dt); band.material.color.setHex(cool > 0 ? 0x555555 : 0xffe14a); },
        sync: () => {},
      };
      return e;
    },
  };

  /**
   * encounter: { id, zone: { at, offset, size }, bellAt, respawn (anchor), waves: [[{ type, at: [x, z], yaw }]],
   *              flag, reward }
   */
  MS.Components.encounter = {
    build(def, ctx) {
      const mgr = ctx.mgr, run = mgr.run;
      const fightFlag = def.id + '_fight';
      run.flags.delete(fightFlag);                       // never stuck "in a fight" after a reload
      const zp = MS.resolveAt(ctx.level, def.zone).pos, s = def.zone.size;
      const box = new T.Box3(new T.Vector3(zp.x - s[0] / 2, zp.y, zp.z - s[2] / 2), new T.Vector3(zp.x + s[0] / 2, zp.y + s[1], zp.z + s[2] / 2));
      const resp = def.respawn ? ctx.level.anchors[def.respawn] : null;
      // the bell (start again for practice)
      const bp = MS.resolveAt(ctx.level, { at: def.bellAt });
      const bell = new T.Group();
      const post = new T.Mesh(new T.BoxGeometry(0.15, 1.3, 0.15), new T.MeshLambertMaterial({ color: 0x5a3a22 })); post.position.y = 0.65; bell.add(post);
      const cup = new T.Mesh(new T.BoxGeometry(0.42, 0.36, 0.42), new T.MeshLambertMaterial({ color: 0xd9a90f })); cup.position.y = 1.45; bell.add(cup);
      for (const o of [post, cup]) { o.material.userData.own = true; o.geometry.userData.own = true; }
      bell.position.copy(bp.pos); ctx.scene.add(bell);
      const st = { state: 'idle', wave: -1, gap: 0 };
      const cb = () => mgr.combat;
      const start = () => {
        if (st.state !== 'idle' || !cb()) return;
        st.state = 'active'; st.wave = -1; st.gap = 0.6;
        run.setFlag(fightFlag);
        if (resp) cb().respawnAt = { pos: resp.pos, yaw: resp.yaw };
        cb().banner(tr('cb.running'), 1200);
        VR.Audio.play('powerOn');
      };
      const stop = () => { st.state = 'idle'; st.wave = -1; cb() && cb().enemies.clear(); cb() && cb().setLeft(null); run.clearFlag(fightFlag); };
      const e = {
        id: def.id, def, obj: bell, kind: 'interact',
        hit: new T.Box3(new T.Vector3(bp.pos.x - 0.35, bp.pos.y, bp.pos.z - 0.35), new T.Vector3(bp.pos.x + 0.35, bp.pos.y + 1.7, bp.pos.z + 0.35)),
        state: st,
        prompt: () => (st.state === 'idle' && cb() && cb().armed ? { verb: tr('cb.bell'), label: tr('cb.bellName') } : null),
        use: () => { VR.Audio.play('bell'); start(); },
        onPlayerDeath: () => { if (st.state === 'active') stop(); },
        update: (dt, r) => {
          if (r.state !== 'active') return;
          const c = cb(); if (!c) return;
          if (st.state === 'idle') {
            // the first time: walking in starts it (only when you have a weapon)
            if (!r.has(def.flag) && c.armed && box.containsPoint(mgr.ctrl.pos.clone().setY(mgr.ctrl.pos.y + 0.5))) start();
            return;
          }
          if (st.state !== 'active') return;
          const alive = c.enemies.alive;
          c.setLeft(alive);
          if (alive > 0) return;
          st.gap -= dt;
          if (st.gap > 0) return;
          st.wave++;
          if (st.wave >= def.waves.length) {
            st.state = 'idle';
            c.setLeft(null); c.enemies.clear();
            const first = !r.has(def.flag);
            r.setFlag(def.flag); r.clearFlag(fightFlag);
            let paid = false;
            // the reward goes to every player who took part (only the local one today); one txId per player wallet
            if (first && def.reward) paid = VR.Wallet.of().credit(def.reward, `encounter:${r.def.id}:${def.id}`, 'combat');
            c.banner(tr('cb.cleared') + (paid ? '  ' + tr('cb.reward', { coins: def.reward }) : ''), 2600);
            VR.Audio.play('success');
            return;
          }
          for (const sp of def.waves[st.wave]) c.enemies.spawn(sp.type, sp.at, { yaw: sp.yaw || 0, aware: st.wave > 0 });
          c.banner(tr('cb.wave', { n: AR_NUM(st.wave + 1), total: AR_NUM(def.waves.length) }), 1500);
          st.gap = 2.0;
        },
        sync: () => {},
      };
      return e;
    },
  };

  VR.Audio.define('bell', ({ tone }) => { tone(880, 0.6, 'triangle', 0.12); tone(1320, 0.5, 'sine', 0.06, null, 0.02); });
})();
