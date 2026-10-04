/* =====================================================================
 * PLAYER PROFILE — everything that belongs to the PLAYER, saved in one
 * place, separate from the state of any world and from any single run.
 * ---------------------------------------------------------------------
 *   VR.Profiles.player()      the active player's data:
 *     wallet      { coins, ledger }        shared coins (see wallet.js)
 *     inventory   { weapons, tools, consumables }
 *     upgrades    { id: level }
 *     progress    { missions, areas, flags }
 *     location    where to continue: { area, pos, yaw } (mode manager)
 *     stats       { best, duel }
 *   VR.Profiles.world(areaId)  saved state of one area of the world
 *                               (open doors, defeated enemies…), shared by
 *                               whoever plays in that world
 *
 * Saved as `cubeexpress.profiles` with a VERSION. Players are kept in a
 * map by id (only 'p1' is used now), so more than one player can have
 * their own data later without touching anyone else's.
 *
 * MIGRATION: the first time, the old separate keys (`bank`, `best`,
 * `missions`, `duelStats`) are copied in. The old keys are left as they
 * were, so older versions of the game still open with their data.
 *
 * Device preferences (settings, character, language, player name,
 * first-person settings) are not player progress and stay where they are.
 * ===================================================================== */
(function () {
  const VERSION = 1;
  const KEY = 'profiles';
  const PREFIX = 'cubeexpress.';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  VR.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function blankPlayer(id) {
    return {
      id, uid: VR.uid(), created: Date.now(),            // uid: stable identity for a future network game
      wallet: { coins: 0, ledger: [] },
      inventory: { weapons: [], tools: [], consumables: {} },
      upgrades: {},
      progress: { missions: { completed: {}, secondary: {}, achievements: [], plays: {} }, areas: {}, flags: [] },
      location: null,
      stats: { best: 0, duel: { w: 0, l: 0, d: 0 } },
    };
  }
  /** fill in anything missing (older / partial saves) without touching what's there */
  function complete(p, id) {
    const b = blankPlayer(id);
    for (const k in b) if (p[k] === undefined) p[k] = b[k];
    for (const k of ['wallet', 'inventory', 'progress', 'stats']) for (const kk in b[k]) if (p[k][kk] === undefined) p[k][kk] = b[k][kk];
    const m = p.progress.missions;
    for (const kk in b.progress.missions) if (m[kk] === undefined) m[kk] = b.progress.missions[kk];
    return p;
  }
  /** copy the old separate keys into a new player (first run of this version) */
  function migrateLegacy(p) {
    const bank = store.get('bank', null), best = store.get('best', null);
    const missions = store.get('missions', null), duel = store.get('duelStats', null);
    if (typeof bank === 'number' && bank > 0) p.wallet.coins = Math.floor(bank);
    if (typeof best === 'number') p.stats.best = Math.floor(best);
    if (missions && typeof missions === 'object') {
      p.progress.missions = {
        completed: missions.completed || {}, secondary: missions.secondary || {},
        achievements: missions.achievements || [], plays: missions.plays || {},
      };
    }
    if (duel && typeof duel === 'object') p.stats.duel = { w: duel.w | 0, l: duel.l | 0, d: duel.d | 0 };
    return { bank: bank !== null, best: best !== null, missions: !!missions, duel: !!duel };
  }

  const Profiles = {
    VERSION,
    data: null,
    load() {
      if (this.data) return this.data;
      let d = store.get(KEY, null);
      if (!d || typeof d !== 'object' || !d.players) {
        d = { version: VERSION, active: 'p1', players: {}, world: {} };
        const p = blankPlayer('p1');
        d.migrated = migrateLegacy(p);
        d.players.p1 = p;
        this.data = d;
        this.save();
      } else {
        // later versions migrate here (d.version < VERSION)
        d.version = VERSION;
        d.world = d.world || {};
        d.active = d.players[d.active] ? d.active : Object.keys(d.players)[0] || 'p1';
        if (!d.players[d.active]) d.players[d.active] = blankPlayer(d.active);
        for (const id in d.players) complete(d.players[id], id);
        this.data = d;
      }
      return this.data;
    },
    save() { return store.set(KEY, this.load()); },
    /** the active player (or a given one) */
    player(id) { const d = this.load(); return d.players[id || d.active]; },
    /** id of the player playing on this device */
    activeId() { return this.load().active; },
    /** list of players kept in this save */
    playerIds() { return Object.keys(this.load().players); },
    /** add a player with their own wallet / inventory / progress (the world stays shared) */
    addPlayer(id) {
      const d = this.load();
      if (!d.players[id]) { d.players[id] = blankPlayer(id); this.save(); }
      return d.players[id];
    },
    /** switch who plays on this device (e.g. a second profile); the game refreshes what it shows */
    setActive(id) {
      const d = this.load();
      if (!d.players[id]) return false;
      d.active = id; this.save();
      if (VR.game && VR.game.onProfileReplaced) VR.game.onProfileReplaced();
      return true;
    },
    /** the saved state of one area of the world (created on first use) */
    world(areaId) { const d = this.load(); return d.world[areaId] || (d.world[areaId] = {}); },
    /** for tests: forget everything in memory and storage (the next load migrates the old keys again) */
    resetAll() { this.data = null; try { localStorage.removeItem(PREFIX + KEY); } catch (e) { /* unavailable */ } },
    /** NEW GAME: keep a copy of the current save (`profiles.backup`), then start a
     *  blank player and a blank world (with other players in the save: only the
     *  active player starts over). The old separate keys are not copied in again. */
    newGame() {
      const old = this.load();
      store.set(KEY + '.backup', Object.assign({}, old, { backedUp: Date.now() }));
      const id = old.active || 'p1';
      if (Object.keys(old.players).length > 1) {
        // other players share this save: only the active player starts over (their world stays)
        old.players[id] = blankPlayer(id);
        this.data = old;
      } else this.data = { version: VERSION, active: id, players: { [id]: blankPlayer(id) }, world: {}, migrated: 'new-game' };
      this.save();
      return this.data;
    },
    /** is there a game in progress to continue? (the adventure has been started) */
    hasAdventure(id) { const p = this.player(id); return !!(p && p.location); },
  };

  VR.Profiles = Profiles;
})();
