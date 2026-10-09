/* =====================================================================
 * FIGHT KIT — the arena's weapons, the buy screen's catalogue, and the
 * loadout (what you carry in one match).
 * ---------------------------------------------------------------------
 *   WEAPONS   arena numbers (health is 100): body / head damage per hit
 *             ads: aiming down the iron sights zooms the view to this × FOV
 *             (and shots spread 35 % as much); scope: a real scope instead
 *             (shotgun: per pellet), fire rate, magazine, reload, spread,
 *             range (damage falls to `fall` × at the end of it)
 *   BUY       budget per match (the same for everyone; real coins are not
 *             touched) and prices. The pistol is always free.
 *   Loadout   two weapon slots + impulse grenades, ammo, reload, switch.
 *             Reserve ammo is unlimited in the arena: only the magazine
 *             and the reload time matter.
 *   damage(id, part, dist)   what one hit/pellet does
 *
 * Used by the 1v1 duel, the matches against the computer and the co-op
 * matches (js/duel/duel.js, js/duel/bots.js).
 * ===================================================================== */
(function () {
  const WEAPONS = {
    pistol:  { ads: 0.82, body: 20, head: 40, rate: 0.30, auto: false, mag: 12, reload: 1.1, spread: 0.008, pellets: 1, range: 50, fall: 0.6, sound: 'pistol', kick: 0.5 },
    shotgun: { ads: 0.85, body: 11, head: 16, rate: 0.90, auto: false, mag: 6, reload: 1.9, spread: 0.06, pellets: 8, range: 18, fall: 0.3, sound: 'shotgun', kick: 1.2 },
    smg:     { ads: 0.72, body: 10, head: 18, rate: 0.09, auto: true, mag: 30, reload: 1.6, spread: 0.022, pellets: 1, range: 35, fall: 0.55, sound: 'smg', kick: 0.25 },
    sniper:  { body: 55, head: 150, rate: 1.00, auto: false, mag: 5, reload: 1.9, spread: 0.012, airSpread: 0.004, scopedSpread: 0, pellets: 1, range: 200, fall: 1, sound: 'sniper', kick: 1, scope: true },
    // ---- unlocked in the Lemon Shop (real coins), then they can be picked on the buy screen
    revolver: { ads: 0.78, body: 42, head: 90, rate: 0.6, auto: false, mag: 6, reload: 1.7, spread: 0.006, pellets: 1, range: 60, fall: 0.7, sound: 'revolver', kick: 0.9 },
    rifle:   { ads: 0.66, body: 17, head: 34, rate: 0.12, auto: true, mag: 25, reload: 1.8, spread: 0.014, pellets: 1, range: 70, fall: 0.6, sound: 'rifle', kick: 0.35 },
    dmr:     { body: 38, head: 85, rate: 0.38, auto: false, mag: 10, reload: 2.0, spread: 0.01, airSpread: 0.02, scopedSpread: 0.002, pellets: 1, range: 120, fall: 0.85, sound: 'dmr', kick: 0.7, scope: true },
    lmg:     { ads: 0.72, body: 13, head: 22, rate: 0.075, auto: true, mag: 60, reload: 3.2, spread: 0.035, pellets: 1, range: 50, fall: 0.55, sound: 'lmg', kick: 0.3 },
    // a spear: melee with a long reach (3.4 m), slower than the knife
    spear:   { body: 60, head: 110, rate: 0.75, auto: false, mag: 1, reload: 0, spread: 0, pellets: 1, range: 3.4, fall: 1, sound: 'spear', kick: 0.5, melee: true, slot: true },
    // a bow: one arrow at a time (nocked again after each shot), a real flying arrow, hard-hitting at range
    bow:     { ads: 0.8, body: 48, head: 115, rate: 0.3, auto: false, mag: 1, reload: 0.6, spread: 0.004, pellets: 1, range: 90, fall: 0.8, sound: 'bow', kick: 0.4, arrow: true, arrowSpeed: 70 },
    // the knife: always carried (slot 3), melee only (reach `range` metres)
    knife:   { body: 50, head: 100, rate: 0.55, auto: false, mag: 1, reload: 0, spread: 0, pellets: 1, range: 2.3, fall: 1, sound: 'knife', kick: 0.3, melee: true },
  };
  const NAMES = {
    pistol: { en: 'Lemon pistol', ar: 'مسدس الليمون' }, shotgun: { en: 'Scatter shotgun', ar: 'بندقية الرشّ' },
    smg: { en: 'Light SMG', ar: 'الرشّاش الخفيف' }, sniper: { en: 'Sniper', ar: 'القنّاصة' }, nades: { en: 'Impulse grenades', ar: 'قنابل الدفع' },
    knife: { en: 'Knife', ar: 'سكّين' }, mines: { en: 'Mines ×2', ar: 'ألغام ×2' },
    revolver: { en: 'Revolver', ar: 'المسدس الدوّار' }, rifle: { en: 'Assault rifle', ar: 'البندقية الهجومية' },
    dmr: { en: 'Marksman rifle', ar: 'بندقية الرامي' }, lmg: { en: 'Heavy machine gun', ar: 'الرشّاش الثقيل' },
    spear: { en: 'Spear', ar: 'الرمح' }, bow: { en: 'Bow', ar: 'القوس' },
  };
  const BUY = {
    BUDGET: 1000,
    TIME: 25,                       // seconds to buy before a match (then: ready with what you have)
    PRICES: { pistol: 0, shotgun: 350, smg: 400, sniper: 550, nades: 250, mines: 200, revolver: 300, rifle: 450, dmr: 500, lmg: 500, spear: 250, bow: 300 },   // e.g. sniper + SMG fits, sniper + SMG + grenades does not
    ORDER: ['pistol', 'shotgun', 'smg', 'sniper', 'revolver', 'rifle', 'dmr', 'lmg', 'spear', 'bow', 'nades', 'mines'],
    // weapons you must first buy in the Lemon Shop (js/adventure/shop.js, kind 'arena')
    LOCKED: ['revolver', 'rifle', 'dmr', 'lmg'],
    MINES: 2,                       // mines per round when bought
  };

  /** damage of one hit (or one shotgun pellet) at distance `dist` */
  function damage(id, part, dist) {
    const w = WEAPONS[id]; if (!w) return 0;
    const base = part === 'head' ? w.head : w.body;
    const k = 1 - (1 - w.fall) * Math.min(1, Math.max(0, dist) / w.range);
    return base * k;
  }
  /** cost of a pick { weapons: [ids], nades: bool } */
  function cost(pick) {
    let c = 0;
    for (const id of pick.weapons) c += BUY.PRICES[id] || 0;
    if (pick.nades) c += BUY.PRICES.nades;
    if (pick.mines) c += BUY.PRICES.mines;
    return c;
  }
  /** a legal pick: at most 2 weapons (dearest first), known ids, within budget; else the free pistol */
  function sanitize(pick) {
    const ws = [...new Set((pick && pick.weapons || []).filter(id => WEAPONS[id] && id !== 'knife' && (!WEAPONS[id].melee || WEAPONS[id].slot)))].slice(0, 2);
    ws.sort((a, b) => BUY.PRICES[b] - BUY.PRICES[a]);              // the bought weapon in hand first, the pistol second
    const p = { weapons: ws.length ? ws : ['pistol'], nades: !!(pick && pick.nades), mines: !!(pick && pick.mines) };
    return cost(p) <= BUY.BUDGET ? p : { weapons: ['pistol'], nades: false, mines: false };
  }

  class Loadout {
    constructor(pick, nadeMax = 2) {
      pick = sanitize(pick);
      this.pick = pick;
      this.slots = pick.weapons.map(id => ({ id, mag: WEAPONS[id].mag }));
      this.slots.push({ id: 'knife', mag: 1 });                      // everyone carries a knife (last slot)
      this.mines = { has: !!pick.mines, left: pick.mines ? BUY.MINES : 0 };
      this.cur = 0;
      this.nades = { has: pick.nades, charges: pick.nades ? nadeMax : 0, max: nadeMax, rechargeT: 0 };
      this.coolT = 0; this.reloadT = 0; this.switchT = 0;
    }
    get slot() { return this.slots[this.cur]; }
    get id() { return this.slot.id; }
    get def() { return WEAPONS[this.slot.id]; }
    get knifeSlot() { return this.slots.length - 1; }
    has(id) { return this.slots.some(s => s.id === id); }
    ready() { return this.coolT <= 0 && this.switchT <= 0 && this.reloadT <= 0; }
    switchTo(i) {
      if (i < 0 || i >= this.slots.length || i === this.cur) return false;
      this.cur = i; this.switchT = 0.25; this.reloadT = 0;
      return true;
    }
    next() { return this.switchTo((this.cur + 1) % this.slots.length); }
    startReload() {
      if (this.def.melee || this.reloadT > 0 || this.slot.mag >= this.def.mag) return false;
      this.reloadT = this.def.reload;
      return true;
    }
    /** spend a round; returns the weapon def, or null (not ready / empty → starts reloading) */
    shoot() {
      if (!this.ready()) return null;
      if (this.def.melee) { this.coolT = this.def.rate; return this.def; }
      if (this.slot.mag <= 0) { this.startReload(); return null; }
      this.slot.mag--; this.coolT = this.def.rate;
      return this.def;
    }
    refill() { this.mines.left = this.mines.has ? BUY.MINES : 0; for (const s of this.slots) s.mag = WEAPONS[s.id].mag; this.reloadT = 0; this.coolT = 0; this.switchT = 0; this.nades.charges = this.nades.has ? this.nades.max : 0; this.nades.rechargeT = 0; }
    update(dt, recharge) {
      this.coolT = Math.max(0, this.coolT - dt);
      this.switchT = Math.max(0, this.switchT - dt);
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.slot.mag = this.def.mag; } }
      // an empty magazine reloads by itself
      if (this.slot.mag <= 0 && this.reloadT <= 0 && this.coolT <= 0 && this.switchT <= 0) this.startReload();
      const n = this.nades;
      if (n.has && n.charges < n.max) { n.rechargeT -= dt; if (n.rechargeT <= 0) { n.charges++; n.rechargeT = n.charges < n.max ? recharge : 0; } }
    }
    useMine() { if (this.mines.left < 1) return false; this.mines.left--; return true; }
    useNade(recharge) {
      const n = this.nades;
      if (!n.has || n.charges < 1) return false;
      n.charges--; if (n.rechargeT <= 0) n.rechargeT = recharge;
      return true;
    }
  }

  /** shop weapons not bought yet (they show locked on the buy screen). In a match against
   *  another player (1v1 or co-op) everything is open for both, so it is always fair. */
  function locked(type) {
    if (type === 'pvp' || type === 'coop') return [];
    return BUY.LOCKED.filter(id => !(VR.Shop && VR.Shop.ownsArena(id)));
  }

  VR.FightKit = { WEAPONS, NAMES, BUY, damage, cost, sanitize, locked, Loadout };
})();
