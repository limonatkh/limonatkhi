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
 *   enterMission(id, returnTo)   a door in the world: fade out, play the
 *                    mission, then come back to the door (backFromMission)
 *   enterCourse(returnTo)        the runner portal: fade out, the runner
 *                    course (third person); after its result screen
 *                    backFromCourse() returns to the portal (first person)
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
    /**
     * Home: the square (once you have reached it), else where you left off; a first game starts the start area.
     */
    /** PLAY / CONTINUE: the first time after opening the game → the square (home);
     *  later in the same session (quit a mission, the runner, the pause menu) → back where you were */
    enterHome() {
      if (!this.hasSave()) return this.newGame();
      if (this.entered) return this.continueGame();
      const P = VR.Profiles, p = P.player(), A = VR.ADVENTURE.START;
      const mine = ((p.progress.areas[A] || {}).flags || []), world = (P.world(A).flags || []);
      if (mine.includes('in_plaza') && world.includes('plaza_open')) {
        const H = VR.ADVENTURE.HOME || { pos: [0, 0.05, -34.5], yaw: 0 };
        return this.enterAdventure(A, { intro: false, location: { area: A, pos: H.pos.slice(), yaw: H.yaw } });
      }
      return this.continueGame();
    }
    continueGame() {
      const loc = VR.Profiles.player().location;
      if (!loc) return this.newGame();
      const area = VR.ADVENTURE.areas[loc.area] ? loc.area : VR.ADVENTURE.START;
      this.enterAdventure(area, { intro: false, location: area === loc.area ? loc : null });
    }
    enterAdventure(areaId, { intro = false, location = null, fadeIn = false } = {}) {
      const g = this.game, def = VR.ADVENTURE.areas[areaId];
      if (!def) { console.warn('[modes] unknown area', areaId); return; }
      this.entered = true;
      VR.Audio.unlock();
      if (g.settings.fullscreen && !fadeIn) VR.Fullscreen.request();
      if (g.missions.active) g.missions.abort();
      g.fade.value = fadeIn ? 1 : 0; g.fade.target = 0; g.updateFade(0);
      this.pending = null;
      g.setState('adventure');
      g.missions.enterArea(def, { intro, location });
      VR.Audio.setMusicVolume(0.35);
    }
    quitToMenu() { this.game.toMenu(); }

    // ---- doors: adventure → mission → back to the same door
    enterCourse(returnTo) {
      const g = this.game;
      if (this.pending || g.state !== 'adventure') return false;
      this.pending = { course: true, returnTo };
      g.missions.freeze(true);
      g.fade.target = 1;
      VR.Audio.play('portal');
      return true;
    }
    /** the course's result screen: "Back to the square" */
    backFromCourse() {
      const g = this.game;
      g.courseFrom = null;
      const loc = VR.Profiles.player().location;
      this.enterAdventure(loc && VR.ADVENTURE.areas[loc.area] ? loc.area : VR.ADVENTURE.START, { location: loc, fadeIn: true });
    }
    enterMission(missionId, returnTo) {
      const g = this.game, def = g.missions.byId(missionId);
      if (!def || this.pending || g.state !== 'adventure') return false;
      this.pending = { def, returnTo };
      g.missions.freeze(true);
      g.fade.target = 1;
      VR.Audio.play('portal');
      return true;
    }
    /** every frame while in the adventure (game loop) */
    update() {
      const g = this.game, pd = this.pending;
      if (!pd || g.fade.value < 0.99) return;
      this.pending = null;
      g.missions.abort();                              // saves the area…
      const p = VR.Profiles.player();                  // …then: come back in front of the door
      p.location = Object.assign({ t: Date.now() }, pd.returnTo);
      VR.Profiles.save();
      if (pd.course) {                                 // the runner course, then back here
        g.courseFrom = 'adventure';
        g.start();
        g.fade.target = 0;
        return;
      }
      g.missionFrom = 'adventure';
      g.missions.origin = 'adventure';
      g.missions.enter(pd.def);
      g.setState('mission');
      g.fade.target = 0;
    }
    /** the mission ended (results, leave or fail): pay, then back into the world */
    backFromMission(rewards) {
      const g = this.game;
      g.missionFrom = null;
      g.missions.exit();
      g.missions.origin = null;
      if (rewards && rewards.coins) g.wallet.credit(rewards.coins, rewards.txId, 'mission');
      const loc = VR.Profiles.player().location;
      this.enterAdventure(loc && VR.ADVENTURE.areas[loc.area] ? loc.area : VR.ADVENTURE.START, { location: loc, fadeIn: true });
      if (rewards && (rewards.score || rewards.coins)) {
        setTimeout(() => g.missions.ui.toast(VR.t('toast.reward', { score: (rewards.score || 0).toLocaleString('en-US'), coins: rewards.coins || 0 }), 2600), 400);
      }
    }
  }

  VR.ModeManager = ModeManager;
})();
