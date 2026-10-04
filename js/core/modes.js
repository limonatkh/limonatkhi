/* =====================================================================
 * MODE MANAGER — which kind of play is running, and how you move
 * between them. The game has one loop (game.js); this decides what it
 * drives:
 *
 *   menu         main menu (game.js)
 *   adventure    first-person world: the start area and, later, the
 *                other areas (missions.js runs it, js/adventure/ defines it)
 *   runner       the third-person course (game.js 'playing')
 *   mission      a mission played from the missions list
 *   duel         the 1v1 arena
 *
 *   newGame()        replace the save with a blank one (a copy is kept),
 *                    then enter the start area with its intro
 *   continueGame()   back into the adventure where you left it
 *   enterAdventure() enter an area (location: where to stand)
 *   quitToMenu()     save and go back to the main menu
 *
 * The player's place is saved in the profile (`location`), so CONTINUE
 * works after closing the browser.
 * ===================================================================== */
(function () {
  class ModeManager {
    constructor(game) { this.game = game; }

    get mode() {
      const st = this.game.state;
      if (st === 'adventure') return 'adventure';
      if (st === 'mission' || st === 'gateEnter' || st === 'gateReturn') return 'mission';
      if (st.startsWith('duel')) return 'duel';
      if (['playing', 'paused', 'dying', 'gameover', 'countdown'].includes(st)) return 'runner';
      return 'menu';
    }
    hasSave() { return VR.Profiles.hasAdventure(); }

    newGame() {
      VR.Profiles.newGame();
      this.game.onProfileReplaced();
      this.enterAdventure(VR.ADVENTURE.START, { intro: true, location: null });
    }
    continueGame() {
      const loc = VR.Profiles.player().location;
      if (!loc) return this.newGame();
      const area = VR.ADVENTURE.areas[loc.area] ? loc.area : VR.ADVENTURE.START;
      this.enterAdventure(area, { intro: false, location: area === loc.area ? loc : null });
    }
    enterAdventure(areaId, { intro = false, location = null } = {}) {
      const g = this.game, def = VR.ADVENTURE.areas[areaId];
      if (!def) { console.warn('[modes] unknown area', areaId); return; }
      VR.Audio.unlock();
      if (g.settings.fullscreen) VR.Fullscreen.request();
      if (g.missions.active) g.missions.abort();
      g.fade.value = g.fade.target = 0; g.updateFade(0);
      g.setState('adventure');
      g.missions.enterArea(def, { intro, location });
      VR.Audio.setMusicVolume(0.35);
    }
    quitToMenu() { this.game.toMenu(); }
  }

  VR.ModeManager = ModeManager;
})();
