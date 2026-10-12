/* What the tests compare against tests/baseline/*.json, read from the running game.
 * Each function runs inside the page (page.evaluate). */

/** the systems on the global VR, and the functions of the main ones */
function surface() {
  const fns = (o) => {
    const out = new Set();
    for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k === 'constructor') continue;
        const d = Object.getOwnPropertyDescriptor(p, k);
        if (d && typeof d.value === 'function') out.add(k);
      }
    }
    return [...out].sort();
  };
  const g = VR.game;
  return {
    VR: Object.keys(VR).sort(),
    game: fns(g),
    modes: fns(g.modes),
    missions: fns(g.missions),
    duel: g.duel ? fns(g.duel) : [],
    mini: g.mini ? fns(g.mini) : [],
    Profiles: fns(VR.Profiles),
    Wallet: fns(VR.Wallet.of()),
  };
}

/** what the game knows about: areas, mission worlds, mission parts, missions, mini games, weapons */
function registries() {
  const keys = (o) => Object.keys(o || {}).sort();
  return {
    areas: keys(VR.ADVENTURE.areas),
    start: VR.ADVENTURE.START,
    missionEnvironments: keys(VR.MissionEnvironments),
    missionComponents: keys(VR.Missions && VR.Missions.Components),
    missions: (VR.MISSIONS || []).map((m) => m.id),
    weapons: keys(VR.WeaponKit && VR.WeaponKit.WEAPONS),
    shop: ((VR.Shop && VR.Shop.ITEMS) || []).map((i) => i.id),
    loot: keys(VR.Loot && VR.Loot.ITEMS),
    languages: keys(VR.I18N.STRINGS),
  };
}

/** the runner course built from a seed: its first chunks and their obstacles */
function runner(seed) {
  const g = VR.game, w = g.world;
  g.resetRun(seed);
  // build the whole course at once: a stand-in player far ahead (the real one is not moved)
  const far = Object.create(g.player); far.z = -1e7;
  w.update(0, far, VR.CONFIG.SPEED_START, 0, g, true);
  const out = w.chunks.map((c) => ({
    z0: Math.round(c.z0) || 0, style: c.style, biome: c.biome,
    obs: (c.obstacles || []).map((o) => [o.type || o.kind, Math.round((o.x || 0) * 10) || 0, Math.round((o.z || 0) * 10) || 0]),
  }));
  g.resetRun(seed);
  return out;
}

module.exports = { surface, registries, runner, RUNNER_SEEDS: [12345, 777, 2024] };
