/* =====================================================================
 * GAME — state machine, main loop, camera, scoring, rules.
 * States: loading -> menu <-> character/settings -> playing <-> paused
 *         -> gameover -> (playing | menu)
 *         menu -> adventure (NEW GAME / CONTINUE, first person; see
 *         js/core/modes.js) -> menu
 *
 * SCORE is computed in Game.updateScore() and Game.onCoin().
 * SPEED / DIFFICULTY are computed in Game.speedAt() / Game.difficultyAt()
 * from the numbers in config.js.
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const UI = VR.UI;

  class Game {
    constructor() {
      this.state = 'loading';
      this.settings = Object.assign({ sfx: true, music: true, quality: 'high', fps: false, online: true }, UI.store.get('settings', {}));
      // coins and best score live in the player profile (js/core/profile.js, wallet.js)
      this.wallet = VR.Wallet.of();
      this.runId = VR.uid(); this.runEnds = 0;
      this.charIndex = Math.max(0, VR.CHARACTERS.findIndex(c => c.id === UI.store.get('character', 'pip')));

      this.initRenderer();
      this.powerups = new VR.PowerUpState();
      this.collect = new VR.Collectibles(this.scene);
      this.world = new VR.World(this.scene, this.collect);
      this.player = new VR.Player(this.scene);
      this.player.setCharacter(VR.CHARACTERS[this.charIndex]);
      // mission mode (first-person) lives in its own scene, driven by this loop
      this.missions = new VR.MissionManager(this);
      this.modes = new VR.ModeManager(this);           // new game / continue / adventure ↔ menu (js/core/modes.js)
      // the runner is a finite course now (js/runner/course.js): no mission gates and no
      // 1v1 gates on it. Missions are reached through doors in the adventure world.
      this.world.gateProvider = null;
      this.challenge = new VR.Challenge(this);
      // 1v1 Sniper Arena: gates beside the track, invites, the arena itself
      this.duel = new VR.DuelManager(this);
      this.world.duelGateProvider = null;
      this.fade = { value: 0, target: 0, speed: 3 };
      this.fadeEl = document.getElementById('fade');
      this.countdownEl = document.getElementById('countdown');
      this.bindUI();
      VR.SettingsX.init();                            // Settings → Controls / Crosshair
      VR.SettingsX.initName(this);                    // the player's name (Settings, and once on the menu)
      // coins an older version took away on NEW GAME come back (once)
      const back = VR.Profiles.recoverFromBackup();
      if (back > 0) setTimeout(() => { UI.toast(VR.t('save.recovered', { n: back }), 3200); UI.menuStats(this.best, this.bank); }, 1200);
      this.fightMenu = new VR.FightMenu(this);       // main menu → Fight (1v1, vs the computer, co-op)
      this.applySettings();

      this.clock = new THREE.Clock();
      this.fpsAcc = 0; this.fpsFrames = 0;
      this.shake = 0; this.camBump = 0; this.camBumpV = 0;
      this.menuTime = 0;
    }

    // ------------------------------------------------------------ setup
    initRenderer() {
      const holder = document.getElementById('game');
      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      holder.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.skyColor = new THREE.Color(0x8fd3ff);
      this.fogColor = new THREE.Color(0xb8e4ff);
      this.scene.background = this.skyColor.clone();
      this.scene.fog = new THREE.Fog(this.fogColor.clone(), 70, 200);

      this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.9);
      this.sun = new THREE.DirectionalLight(0xfff2d6, 2.1);
      this.sun.position.set(-0.6, 1, 0.45);
      this.scene.add(this.hemi, this.sun);

      this.camera = new THREE.PerspectiveCamera(C.CAMERA_FOV, 1, 0.3, 330);
      // clouds below, the valley far down, peaks on the horizon
      this.backdrop = new VR.Backdrop(this.scene);
      this.camTarget = new THREE.Vector3();
      this.camLook = new THREE.Vector3();
      // the runner camera works in path space (like the player) and is put into the
      // winding world through the track, so it follows turns, climbs and descents
      this.camPath = new THREE.Vector3(); this.lookPath = new THREE.Vector3();
      window.addEventListener('resize', () => this.resize());
      this.resize();
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const hq = this.settings.quality === 'high';
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hq ? 2 : 1));
      if (!hq && (window.devicePixelRatio || 1) > 1.5) this.renderer.setPixelRatio(0.85);
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      // portrait phones: widen the view so the route ahead stays visible
      this.portrait = w / h < 0.8;
      this.baseFov = this.portrait ? 70 : C.CAMERA_FOV;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      if (this.missions) this.missions.resize(w, h);
      if (this.duel) this.duel.resize(w, h);
    }

    applySettings() {
      const s = this.settings;
      VR.Audio.setEnabled('sfx', s.sfx);
      VR.Audio.setEnabled('music', s.music);
      C.CHUNKS_AHEAD = s.quality === 'high' ? 6 : 4;
      this.scene.fog.far = s.quality === 'high' ? 200 : 140;
      this.scene.fog.near = s.quality === 'high' ? 70 : 45;
      this.camera.far = 330; this.camera.updateProjectionMatrix();     // far peaks on the horizon
      if (this.backdrop) this.backdrop.peaks.visible = s.quality === 'high';   // low quality: no far peaks (less to draw)
      UI.setToggle('optSfx', s.sfx);
      UI.setToggle('optMusic', s.music);
      UI.setToggle('optQuality', s.quality === 'high', VR.t('high'), VR.t('low'));
      UI.setToggle('optFps', s.fps);
      UI.setToggle('optOnline', s.online);
      if (VR.Sens) VR.Sens.sync();
      if (VR.Fullscreen.supported()) UI.setToggle('optFull', VR.Fullscreen.isOn()); else UI.setToggle('optFull', false, '', VR.t('fs.na'));
      if (this.duel) VR.Online.setEnabled(!!s.online);
      const lb = document.getElementById('optLang');
      lb.textContent = VR.I18N.NAMES[VR.lang]; lb.lang = VR.lang;
      UI.fps(s.fps);
      this.resize();
      UI.store.set('settings', s);
    }

    bindUI() {
      // adventure: new game (asks first if there is a save) / continue
      UI.bind('newGameBtn', () => { if (this.modes.hasSave()) document.getElementById('newGameConfirm').hidden = false; else this.modes.newGame(); });
      UI.bind('newGameYes', () => { document.getElementById('newGameConfirm').hidden = true; this.modes.newGame(); });
      UI.bind('newGameNo', () => { document.getElementById('newGameConfirm').hidden = true; });
      UI.bind('continueBtn', () => this.modes.enterHome());
      // the result screen of a course: back into the world when it came from the portal
      UI.bind('againBtn', () => (this.courseFrom === 'adventure' ? this.modes.backFromCourse() : this.start()));
      UI.bind('charBtn', () => this.setState('character'));
      UI.bind('missionsBtn', () => this.setState('missionsList'));
      UI.bind('mlBack', () => this.setState('menu'));
      UI.bind('duelBtn', () => { VR.Audio.unlock(); this.duel.openPickerFromMenu(null, this.fightMenu.rules()); });
      UI.bind('waitBtn', () => { if (this.settings.fullscreen) VR.Fullscreen.request(); this.duel.openWaitingArena(); });
      UI.bind('charPrev', () => this.cycleChar(-1));
      UI.bind('charNext', () => this.cycleChar(1));
      UI.bind('charDone', () => { UI.store.set('character', VR.CHARACTERS[this.charIndex].id); this.setState('menu'); });
      UI.bind('settingsBtn', () => { this.settingsReturn = 'menu'; this.setState('settings'); });
      UI.bind('pauseSettings', () => { this.settingsReturn = 'paused'; this.setState('settings'); });
      UI.bind('settingsDone', () => { VR.SettingsX.close(); this.setState(this.settingsReturn || 'menu'); });
      UI.bind('pauseBtn', () => this.pause());
      UI.bind('resumeBtn', () => this.resume());
      UI.bind('pauseMenu', () => this.toMenu());
      UI.bind('goMenu', () => this.toMenu());
      // Esc on the challenge screens goes back
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.state === 'challenge') this.challenge.leave(true); });
      UI.bind('optSfx', () => { this.settings.sfx = !this.settings.sfx; this.applySettings(); });
      UI.bind('optMusic', () => {
        this.settings.music = !this.settings.music; this.applySettings();
        if (this.settings.music) VR.Audio.startMusic(); else VR.Audio.stopMusic();
      });
      UI.bind('optQuality', () => { this.settings.quality = this.settings.quality === 'high' ? 'low' : 'high'; this.applySettings(); });
      UI.bind('optFps', () => { this.settings.fps = !this.settings.fps; this.applySettings(); });
      // mouse sensitivity (first person: missions, adventure, arena)
      const sens = document.getElementById('optSens');
      sens.dataset.sens = '1'; document.getElementById('optSensV').dataset.sens = '1';
      sens.addEventListener('input', () => VR.Sens.set(+sens.value));
      // fullscreen: menu corner, settings, pause menu (+ buttons in the mission and duel HUDs)
      const fsToggle = () => { VR.Fullscreen.toggle(); this.settings.fullscreen = !VR.Fullscreen.isOn(); UI.store.set('settings', this.settings); };
      UI.bind('fsMenu', fsToggle); UI.bind('optFull', fsToggle); UI.bind('fsPause', fsToggle);
      const fsSync = () => {
        const on = VR.Fullscreen.isOn();
        document.documentElement.classList.toggle('fs-on', on);
        UI.setToggle('optFull', on);
        const pb = document.querySelector('#fsPause span'); if (pb) pb.textContent = VR.t(on ? 'fs.exit' : 'fs.enter');
        setTimeout(() => this.resize(), 60);
      };
      document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync);
      if (!VR.Fullscreen.supported()) {
        document.documentElement.classList.add('no-fs');
        const b = document.getElementById('optFull'); b.disabled = true;
        // iPhone: explain how to get a bar-free game (home-screen app)
        document.getElementById('fsIos').hidden = VR.Fullscreen.standalone();
      }
      VR.I18N.onChange(fsSync);
      UI.bind('optOnline', () => { this.settings.online = !this.settings.online; this.applySettings(); });
      UI.bind('optLang', () => { VR.I18N.toggle(); });
      VR.I18N.onChange((lang, fontsReady) => {
        this.settings.lang = lang;
        this.applySettings();
        UI.menuStats(this.best, this.bank);
        UI.setHUD(this.score || 0, this.distance || 0, this.coins || 0, this.multiplier || 1);
        UI.character(VR.CHARACTERS[this.charIndex]);
        if (fontsReady) this.world.relabelGates();
      });
      VR.Input.onPause(() => {
        if (this.state === 'duel') return this.duel.onPauseKey();
        if (this.state === 'duelPick' || this.state === 'duelEnter' || this.state === 'duelReturn') return;
        if (this.state === 'mission' || this.state === 'adventure') this.missions.onPauseKey();
        else if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume();
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        if (this.state === 'playing') this.pause();
        else if (this.state === 'mission' || this.state === 'adventure') this.missions.pause();
      });
    }

    cycleChar(d) {
      const n = VR.CHARACTERS.length;
      this.charIndex = (this.charIndex + d + n) % n;
      const def = VR.CHARACTERS[this.charIndex];
      this.player.setCharacter(def);
      UI.character(def);
    }

    // ------------------------------------------------------------ states
    setState(s) {
      // a run's last coins (collected while slowing down) are paid when its result / the menu shows
      if ((s === 'gameover' || s === 'chresult' || s === 'menu') && this.runId && this.coins > (this.banked || 0)) this.bankRun();
      this.state = s;
      const map = { adventure: null, missionsList: 'missionsList', menu: 'menu', character: 'character', settings: 'settings', paused: 'pause', gameover: 'gameover', playing: null, loading: 'loading', challenge: 'challenge', chresult: 'chresult' };
      UI.show(map[s]);
      if (s === 'settings' && VR.Sens) VR.Sens.sync();
      UI.hud(s === 'playing' || s === 'paused' || s === 'dying' || (s === 'gateEnter' && !this.missionFromMenu) || s === 'countdown' || s === 'duelPick' || s === 'duelEnter');
      if (s !== 'playing' && this.duel) this.duel.ui.showPrompt(false);
      VR.Input.setEnabled(s === 'playing');
      if (s === 'menu') { UI.menuStats(this.best, this.bank); this.refreshMenuButtons(); }
      if (s === 'missionsList') this.renderMissionList();
      if (s === 'character') {
        UI.character(VR.CHARACTERS[this.charIndex]);
        const multi = VR.CHARACTERS.length > 1;
        document.getElementById('charPrev').hidden = !multi;
        document.getElementById('charNext').hidden = !multi;
      }
    }

    boot() {
      // build every prefab once, behind the loading screen
      this.world.warmup();
      this.resetRun();
      this.world.update(0, this.player, C.SPEED_START, 0, this, true);
      this.renderer.compile(this.scene, this.camera);
      this.setState('menu');
      this.loop();
      const hadLink = /[?&]vs=/.test(location.search);
      this.challenge.boot();                       // opened from an invite link?
      // the square is home: the game opens there (the main menu stays one Esc away).
      // ?menu=1 keeps the old start on the menu (tests); an invite link opens its lobby instead.
      if (!hadLink && !/[?&]menu=1/.test(location.search) && (this.challenge.name || '').trim()) setTimeout(() => this.goHome(), 0);
    }
    /** into the square (CONTINUE, the start of the game, back from a gate) */
    goHome(at = null) {
      if (this.state !== 'menu' && this.state !== 'settings') return;
      if (!at) this.hubReturn = null;
      if (at) return this.modes.enterAdventure(at.area || VR.ADVENTURE.START, { location: at });
      this.modes.enterHome();
    }
    /**
     * A gate in the square (js/adventure/hubgates.js). `at`: where to stand when coming back.
     * fight / challenge open what the menu used to; the mini-games say they are coming.
     */
    hubAction(action, at, name) {
      if (action === 'billiards' || action === 'basketball') { VR.Audio.play('click'); this.missions.ui.caption(VR.t('hub.soon', { name }), 3.5); return; }
      this.hubReturn = at;
      this.missions.saveArea && this.missions.saveArea();
      VR.Audio.play('portal');
      this.toMenu();
      if (action === 'fight') { this.fightMenu.open(); this.fightMenu.fromHub = true; }
      else if (action === 'challenge') document.getElementById('challengeBtn').click();
    }
    /** done with what a gate opened: back in front of it */
    backToHub() {
      const at = this.hubReturn; this.hubReturn = null;
      if (this.state !== 'menu') this.toMenu();
      this.goHome(at);
    }

    /** main menu: CONTINUE only when there is an adventure to continue */
    refreshMenuButtons() {
      const has = this.modes.hasSave();
      // one button into the game: CONTINUE (to the square) or PLAY (a first game); NEW GAME is in Settings
      const cb = document.getElementById('continueBtn');
      cb.hidden = false; cb.setAttribute('data-i18n', has ? 'menu.continue' : 'menu.play'); cb.textContent = VR.t(has ? 'menu.continue' : 'menu.play');
      document.getElementById('newGameConfirm').hidden = true;
    }
    /** NEW GAME replaced the save: refresh everything that shows it */
    onProfileReplaced() {
      this.wallet = VR.Wallet.of();
      UI.menuStats(this.best, this.bank);
      if (this.state === 'menu') this.refreshMenuButtons();
    }

    // shared coins / best score of the player (profile), read by the menu and the HUD
    get bank() { return this.wallet.coins; }
    get best() { return VR.Profiles.player().stats.best; }
    set best(v) { VR.Profiles.player().stats.best = Math.floor(v); VR.Profiles.save(); }

    resetRun(seed = null) {
      this.runId = VR.uid(); this.runEnds = 0;      // every run pays its coins once (wallet txIds)
      this.courseT = 0;                            // seconds on the course (the finish time)
      this.finishing = false; this.finishT = 0;    // crossed the line: slowing down to a stop
      this.finished = false;
      this.nearToast = false; this.raceStopped = false; this.stopDecel = 0;
      this.player.reset();
      this.powerups.reset();
      this.world.reset(seed);
      this.distance = 0; this.score = 0; this.coins = 0;
      this.banked = 0; this.bankT = 0;             // coins of this run already in the wallet (paid as you go)
      this.multiplier = 1;
      this.speed = C.SPEED_START;
      this.lastBiome = null;
      this.hitCooldown = 0;
      this.deadTimer = 0;
      this.tunnelDark = 0;
      this.stumbleT = 0;
      document.body.classList.remove('vulnerable');
      this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
      this.camera.position.set(0, C.CAMERA_HEIGHT, C.CAMERA_DISTANCE);
      this.camLook.set(0, 1.4, -C.CAMERA_LOOK_AHEAD);
      this.camPath.copy(this.camera.position); this.lookPath.copy(this.camLook);   // start: path = world
      UI.clearPowerups();
      UI.setHUD(0, 0, 0, 1);
    }

    start() {
      VR.Audio.unlock();
      if (this.settings.fullscreen) VR.Fullscreen.request();      // you chose fullscreen before: back to it on PLAY
      this.resetRun();
      if (VR.Shop) VR.Shop.useStartShield(this);                 // a shield bought in the shop (solo course only)
      // start from the menu's camera position for a smooth swoop in
      this.camera.position.copy(this.menuCamPos || this.camera.position);
      this.camPath.copy(this.camera.position);
      this.setState('playing');
      if (this.settings.music) VR.Audio.startMusic();
      VR.Audio.setMusicVolume(1);
    }
    /** Challenge round: same seed as the other player, then 3-2-1 together. */
    startChallengeRun(seed) {
      VR.Audio.unlock();
      if (this.missions.active) this.missions.abort();
      this.fade.value = this.fade.target = 0; this.updateFade(0);
      this.resetRun(seed);
      this.world.update(0, this.player, C.SPEED_START, 0, this, true);
      this.camera.position.copy(this.menuCamPos || this.camera.position);
      this.camPath.copy(this.camera.position);
      this.countdown = 3; this.countdownStar = 0;
      this.countdownEl.hidden = false; this.countdownEl.textContent = '3';
      this.setState('countdown');
      VR.Audio.play('click');
      if (this.settings.music) VR.Audio.startMusic();
      VR.Audio.setMusicVolume(0.6);
    }
    pause() { if (this.state !== 'playing') return; this.setState('paused'); VR.Audio.setMusicVolume(0.3); }
    resume() { this.setState('playing'); this.clock.getDelta(); VR.Audio.setMusicVolume(1); }
    /* ---- Missions list (main menu): replay any mission you have reached. */
    renderMissionList() {
      const mgr = this.missions, prog = mgr.progress;
      let testAll = false;
      try { testAll = new URLSearchParams(location.search).get('missions') === 'all'; } catch (e) { /* no URL */ }
      const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const list = document.getElementById('mlList');
      list.innerHTML = mgr.defs.map(d => {
        const done = prog.completed[d.id];
        const open = testAll || mgr.isUnlocked(d);
        const need = (d.requires || []).map(id => mgr.byId(id)).find(r => r && !prog.completed[r.id]);
        const st = done ? VR.t('ml.done', { t: VR.Missions.fmtTime(done.best) }) : open ? VR.t('ml.open') : VR.t('ml.locked', { name: need ? VR.L(need.name) : '' });
        return `<div class="ml-row ${open ? '' : 'locked'}"><span class="ml-n">${d.order}</span>
          <span><span class="ml-name">${esc(VR.L(d.name))}</span><br><span class="ml-st ${done ? 'done' : ''}">${esc(st)}</span></span>
          ${open ? `<button class="btn small lemon ml-play" data-id="${d.id}">${VR.t('ml.play')}</button>` : ''}</div>`;
      }).join('');
      list.querySelectorAll('.ml-play').forEach(b => b.addEventListener('click', () => { VR.Audio.unlock(); VR.Audio.play('click'); this.playMissionFromMenu(b.dataset.id); }));
    }
    playMissionFromMenu(id) {
      const def = this.missions.byId(id); if (!def) return;
      if (this.settings.fullscreen) VR.Fullscreen.request();
      this.missionFromMenu = true; this.runSnapshot = null;
      this.gateDef = def; this.gateT = 0;
      this.gateFrom = this.camera.position.clone(); this.gateLookFrom = this.camLook.clone();
      this.setState('gateEnter');
      VR.Audio.play('portal');
    }

    toMenu() {
      this.missionFromMenu = false;
      this.missionFrom = null; this.missions.origin = null; this.modes.pending = null; this.courseFrom = null;
      if (this.duel.match || this.duel.pending || this.duel.pickOpen) this.duel.abort();
      if (this.challenge.active) this.challenge.leave(false);
      if (this.missions.active) this.missions.abort();
      this.fade.value = this.fade.target = 0; this.updateFade(0);
      this.countdownEl.hidden = true;
      this.resetRun();
      this.world.update(0, this.player, C.SPEED_START, 0, this, true);
      this.setState('menu');
      VR.Audio.setMusicVolume(0.5);
    }

    gameOver() {
      this.setState('dying');
      VR.Input.setEnabled(false);
      this.runEnds++;
      this.player.groundAtDeath = this.world.surfaceAt(this.player.x, this.player.z, this.player.y + 0.01, 0.3).h;
      this.player.die();
      const racing = this.challenge.inRace;
      if (racing) this.challenge.onLocalDeath();
      VR.Audio.play('crash');
      VR.Audio.setMusicVolume(0.25);
      this.shake = 0.5;
      const isBest = this.score > this.best;
      if (isBest) this.best = this.score;
      this.bankRun();
      if (!racing) VR.Rules.portal.used();           // the portal rests after every course run (js/core/rules.js)
      setTimeout(() => {
        if (this.state !== 'dying') return;                // left in the meantime
        if (racing && this.challenge.inRace) { this.challenge.showResult(); return; }
        UI.courseResult({ kind: 'crash', score: this.score, dist: this.distance, total: VR.Course.finishDistance(), coins: this.coins, best: this.best, isBest, bestTime: VR.Profiles.player().stats.bestTime, fromWorld: this.courseFrom === 'adventure' });
        this.setState('gameover');
      }, 1300);
    }

    /* ==============================================================
     * FINISH LINE (js/runner/course.js): the run ends, the runner slows
     * to a stop, the coins are paid and the result screen comes up.
     * ============================================================ */
    crossFinish() {
      if (this.finishing || this.finished) return;
      this.finishing = true; this.finishT = 0;
      this.runEnds++;
      const time = this.courseT;
      this.finishTime = time;
      const st = VR.Profiles.player().stats;
      this.newBestTime = !st.bestTime || time < st.bestTime;
      if (this.newBestTime) { st.bestTime = +time.toFixed(2); VR.Profiles.save(); }
      if (this.score > this.best) { this.best = this.score; this.newBest = true; } else this.newBest = false;
      this.bankRun();
      if (!this.challenge.inRace) VR.Rules.portal.used();
      VR.Audio.play('success');
      UI.toast(VR.t('go.title.finish'), 1400);
      if (this.challenge.inRace) this.challenge.onLocalFinish(time);
    }
    /** a race was decided while you were still running: your run stops here (coins kept) */
    stopForRaceEnd() {
      if (this.state !== 'playing' || this.finishing || this.finished) return;
      this.finishing = true; this.finishT = 0; this.raceStopped = true;
      this.runEnds++;
      this.bankRun();
    }
    showFinish() {
      this.finishing = false; this.finished = true;
      VR.Input.setEnabled(false);
      if (this.challenge.inRace || this.raceStopped) { this.raceStopped = false; this.challenge.showResult(); return; }
      UI.courseResult({ kind: 'finish', score: this.score, dist: this.distance, total: VR.Course.finishDistance(), coins: this.coins,
        best: this.best, isBest: this.newBest, time: this.finishTime, bestTime: VR.Profiles.player().stats.bestTime, isBestTime: this.newBestTime, fromWorld: this.courseFrom === 'adventure' });
      this.setState('gameover');
      VR.Audio.setMusicVolume(0.4);
    }

    /* ==============================================================
     * MODE SWITCHING — runner ⇄ first-person mission
     * gateEnter: runner frozen, camera moves into the character's eyes
     *            (TPP → FPV in 0.3 s, as the movement spec asks), fade
     * mission:   the mission manager runs; the runner is not updated
     * gateReturn: fade out of the mission world
     * countdown: runner state restored (+ rewards), 3-2-1, then play
     * ============================================================ */
    checkGates() {
      const p = this.player;
      for (const g of this.world.gates) {
        if (g.used) continue;
        if (!g.announced && p.z - g.z < 120) { g.announced = true; UI.toast(VR.t('toast.gateAhead'), 1600); }
        if (p.z <= g.z + 0.2) {
          g.used = true;
          if (Math.abs(p.x - g.x) < 1.15 && p.y < 3.6 && !p.dead) { this.enterGate(g); return true; }
        }
      }
      return false;
    }

    /** RunStatePersistence: everything needed to resume the run exactly. */
    snapshotRun() {
      const p = this.player;
      return {
        score: this.score, distance: this.distance, coins: this.coins, multiplier: this.multiplier, speed: this.speed,
        powerups: Object.assign({}, this.powerups.timers),
        player: p.snapshot(), stumbleT: this.stumbleT,
        courseT: this.courseT, hitCooldown: this.hitCooldown, lastBiome: this.lastBiome,
        world: { chunkIndex: this.world.chunkIndex, nextZ: this.world.nextZ, chunks: this.world.chunks.length, obstacles: this.world.obstacles.length },
        camPath: this.camPath.toArray(), lookPath: this.lookPath.toArray(),
      };
    }
    restoreRun(snap, rewards) {
      const p = this.player;
      this.score = snap.score; this.distance = snap.distance; this.coins = snap.coins;
      this.multiplier = snap.multiplier; this.speed = snap.speed;
      this.powerups.timers = Object.assign({}, snap.powerups);
      p.restore(snap.player); this.stumbleT = snap.stumbleT || 0;
      this.courseT = snap.courseT || 0; this.hitCooldown = snap.hitCooldown;
      // the world was frozen, so it must be exactly as we left it
      const w = this.world;
      this.restoreCheck = w.chunkIndex === snap.world.chunkIndex && w.nextZ === snap.world.nextZ && w.chunks.length === snap.world.chunks && w.obstacles.length === snap.world.obstacles;
      if (!this.restoreCheck) console.warn('[run] world changed during the mission', snap.world);
      if (rewards) { this.score += rewards.score; this.coins += rewards.coins; }
      this.camPath.fromArray(snap.camPath); this.lookPath.fromArray(snap.lookPath);
      VR.track.toWorld(this.camPath.x, this.camPath.y, this.camPath.z, this.camera.position);
      VR.track.toWorld(this.lookPath.x, this.lookPath.y, this.lookPath.z, this.camLook);
      this.camera.lookAt(this.camLook);
      UI.setHUD(this.score, this.distance, this.coins, this.multiplier);
      UI.setPowerups(this.powerups);
    }

    enterGate(gate) {
      const def = this.missions.byId(gate.missionId) || this.missions.nextForGate();
      if (!def) return;
      this.runSnapshot = this.snapshotRun();
      this.gateDef = def; this.gateT = 0;
      this.gateFrom = this.camera.position.clone();
      this.gateLookFrom = this.camLook.clone();
      this.setState('gateEnter');
      VR.Audio.play('portal'); VR.Audio.setMusicVolume(0.35);
    }
    updateGateEnter(dt) {
      this.gateT += dt;
      const p = this.player;
      const k = Math.min(1, this.gateT / 0.3);              // TPP → FPV in 0.3 s
      const e = k * k * (3 - 2 * k);
      const head = VR.track.toWorld(p.x, p.y + 1.5, p.z - 0.2);
      this.camera.position.lerpVectors(this.gateFrom, head, e);
      const look = VR.track.toWorld(p.x, p.y + 1.45, p.z - 10);
      this.camLook.lerpVectors(this.gateLookFrom, look, e);
      this.camera.lookAt(this.camLook);
      this.camera.fov = (this.portrait ? 70 : C.CAMERA_FOV) + e * 30; this.camera.updateProjectionMatrix();
      if (this.gateT > 0.12) this.fade.target = 1;
      p.rig.root.visible = this.gateT < 0.22;
      this.world.animateGates(dt);
      if (this.gateT >= 0.5 && this.fade.value >= 0.99) {
        this.resize();                                      // restore runner fov
        p.rig.root.visible = true;
        this.missions.enter(this.gateDef);
        this.setState('mission');
        this.fade.target = 0;
      }
    }
    updateMissionMode(dt) {
      this.missions.update(dt);
      if (this.state === 'gateReturn' && this.fade.value >= 0.99 && this.missionFrom === 'adventure') {
        // entered through a door in the adventure world: back to that door
        return this.modes.backFromMission(this.returnRewards);
      }
      if (this.state === 'gateReturn' && this.fade.value >= 0.99 && this.missionFromMenu) {
        // played from the missions list: no run to go back to; coins go to the bank
        this.missions.exit();
        const r = this.returnRewards;
        if (r && r.coins) this.wallet.credit(r.coins, r.txId, 'mission');
        this.toMenu(); this.fade.target = 0;
        this.setState('missionsList');
        if (r && (r.score || r.coins)) setTimeout(() => UI.toast(VR.t('toast.reward', { score: r.score.toLocaleString('en-US'), coins: r.coins }), 2200), 300);
        return;
      }
      if (this.state === 'gateReturn' && this.fade.value >= 0.99) {
        this.missions.exit();
        this.restoreRun(this.runSnapshot, this.returnRewards);
        this.runSnapshot = null;
        this.countdown = C.MISSION_RETURN_COUNTDOWN; this.countdownStar = C.MISSION_RETURN_STAR;
        this.countdownEl.hidden = false; this.countdownEl.textContent = String(Math.ceil(this.countdown));
        this.setState('countdown');
        this.fade.target = 0;
        if (this.returnRewards && (this.returnRewards.score || this.returnRewards.coins)) {
          setTimeout(() => UI.toast(VR.t('toast.reward', { score: this.returnRewards.score.toLocaleString('en-US'), coins: this.returnRewards.coins }), 2200), 300);
        }
      }
    }
    /** Called by the mission manager when the player leaves a mission. */
    onMissionReturn({ success, rewards }) {
      this.returnRewards = success ? rewards : null;
      this.lastMissionResult = { success, rewards };
      this.setState('gateReturn');
      this.fade.target = 1;
      VR.Audio.play('portal');
    }
    updateCountdown(dt) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== before && now > 0) { this.countdownEl.textContent = String(now); VR.Audio.play('click'); }
      this.updateEnvironment(dt);
      this.updateCamera(dt);
      this.player.animate(0, this.speed * 0.15);
      this.player.updateShadow(this.world);
      this.world.animateGates(dt);
      if (this.countdown <= 0) {
        this.countdownEl.hidden = true;
        if (this.countdownStar) this.powerups.timers.invincible = Math.max(this.powerups.remaining('invincible'), this.countdownStar);
        this.challenge.onRaceStart();
        this.clock.getDelta();
        this.setState('playing');
        VR.Audio.setMusicVolume(1); VR.Audio.play('powerup');
        UI.toast(VR.t('toast.go'), 800);
      }
    }
    quitFromMission() { this.toMenu(); }

    /* ==============================================================
     * 1v1 DUEL — same idea as a mission gate: save the run, eyes-in
     * camera + fade, the arena runs, then restore the run exactly.
     * ============================================================ */
    /** Closing the picker / a refused invite: 3-2-1, then run again. */
    resumeAfterPause() {
      this.countdown = 3; this.countdownStar = 0;
      this.countdownEl.hidden = false; this.countdownEl.textContent = '3';
      this.setState('countdown');
    }
    beginDuel() {
      const st = this.state;
      this.duelFromRun = st === 'playing' || st === 'paused' || st === 'duelPick';
      this.duelCam = st === 'playing' || st === 'duelPick';
      if (this.duelFromRun) this.runSnapshot = this.snapshotRun();
      this.gateT = 0;
      this.gateFrom = this.camera.position.clone();
      this.gateLookFrom = this.camLook.clone();
      this.setState('duelEnter');
      VR.Audio.play('portal'); VR.Audio.setMusicVolume(0.25);
    }
    updateDuelEnter(dt) {
      this.gateT += dt;
      if (this.duelCam) {
        const p = this.player;
        const k = Math.min(1, this.gateT / 0.3), e = k * k * (3 - 2 * k);
        this.camera.position.lerpVectors(this.gateFrom, VR.track.toWorld(p.x, p.y + 1.5, p.z - 0.2), e);
        this.camLook.lerpVectors(this.gateLookFrom, VR.track.toWorld(p.x, p.y + 1.45, p.z - 10), e);
        this.camera.lookAt(this.camLook);
        this.camera.fov = (this.portrait ? 70 : C.CAMERA_FOV) + e * 30; this.camera.updateProjectionMatrix();
        p.rig.root.visible = this.gateT < 0.22;
      }
      if (this.gateT > 0.12) this.fade.target = 1;
      if (this.gateT >= 0.5 && this.fade.value >= 0.99) {
        this.resize();
        this.player.rig.root.visible = true;
        this.setState('duel');
        this.duel.enterArena();
        this.fade.target = 0;
      }
    }
    onDuelReturn(result) {
      this.duelResult = result;
      this.setState('duelReturn');
      this.fade.target = 1;
      VR.Audio.play('portal');
    }
    updateDuelMode(dt) {
      this.duel.update(dt);
      if (this.state === 'duelReturn' && this.fade.value >= 0.99) {
        this.duel.exit();
        const r = this.duelResult || {};
        if (this.duelFromRun && this.runSnapshot) {
          this.restoreRun(this.runSnapshot, null);
          this.runSnapshot = null;
          this.countdown = C.MISSION_RETURN_COUNTDOWN; this.countdownStar = C.MISSION_RETURN_STAR;
          this.countdownEl.hidden = false; this.countdownEl.textContent = String(Math.ceil(this.countdown));
          this.setState('countdown');
        } else if (this.hubReturn) this.backToHub();       // the fight gate: back to the square
        else this.toMenu();
        this.fade.target = 0;
        if (r.reward) setTimeout(() => UI.toast(VR.t('du.reward', { coins: r.reward }), 1800), 300);
      }
    }
    updateFade(dt) {
      const f = this.fade;
      if (f.value !== f.target) {
        const step = dt * f.speed;
        f.value = f.target > f.value ? Math.min(f.target, f.value + step) : Math.max(f.target, f.value - step);
      }
      this.fadeEl.style.opacity = f.value;
      this.fadeEl.hidden = f.value <= 0.001;
    }

    // ------------------------------------------------------------ rules
    speedAt(d) { return C.SPEED_START + (C.SPEED_MAX - C.SPEED_START) * (1 - Math.exp(-d / C.SPEED_RAMP)); }
    difficultyAt(d) { return 1 - Math.exp(-d / C.DIFFICULTY_RAMP); }
    multiplierAt(d) { let m = 0; for (const s of C.MULTIPLIER_STEPS) if (d >= s) m++; return m; }

    updateScore(dm) {
      const m = this.multiplierAt(this.distance);
      if (m !== this.multiplier) { this.multiplier = m; if (m > 1) UI.toast(VR.t('toast.multiplier', { n: m })); }
      const boost = this.powerups.active('boost') ? 2 : 1;
      this.score += dm * C.POINTS_PER_METRE * this.multiplier * boost;
    }

    onCoin(n, x, y, z) {
      const dbl = this.powerups.active('double') ? 2 : 1;
      this.coins += n * dbl;
      this.score += C.COIN_POINTS * n * dbl * this.multiplier;
      VR.Audio.play('coin');
    }
    onGem(x, y, z) {
      this.coins += 5; this.score += C.GEM_POINTS * this.multiplier;
      this.collect.burst(x, y, z); VR.Audio.play('gem'); UI.toast(VR.t('toast.lemon'));
    }
    onPowerUp(type, x, y, z) {
      this.powerups.activate(type);
      this.score += C.POWERUP_POINTS * this.multiplier;
      this.collect.burst(x, y, z);
      VR.Audio.play('powerup');
      UI.toast(VR.t('pu.' + type) + '!');
    }
    /** a rock starts falling from the mountain ahead */
    onRockfall(o) { VR.Audio.play('rockfall'); }
    onRockLanded(o) { if (o.z - this.player.z > -40) { this.shake = Math.max(this.shake, 0.22); VR.Audio.play('thud'); } }
    onWallBump() { this.cameraImpulse(0.05); this.shake = Math.max(this.shake, 0.08); }
    cameraImpulse(v) { this.camBumpV += v * 6; }

    /*
     * COLLISION RULES (state machine: running -> stumbling/vulnerable -> running)
     *  - star / boost: the obstacle is smashed
     *  - a 'jump' obstacle hit head-on, or any obstacle clipped from the side:
     *      first time   -> STUMBLE: you trip, slow down for a moment and are
     *                      VULNERABLE for VULNERABLE_TIME (red ring, HUD)
     *      while vulnerable -> crash (a shield saves you once)
     *  - clipping just the EDGE of a 'block' (boulder, pillar, falling rock) or
     *    of a slide obstacle's support: the same stumble, and you are shoved off it
     *  - a 'block' or 'slide' obstacle hit full on: crash (a shield saves you
     *    once), as before
     */
    resolveCollisions() {
      if (this.hitCooldown > 0) return;
      const hit = this.world.collide(this.player);
      if (!hit) return;
      const pu = this.powerups, p = this.player;
      const o = hit.obstacle;
      if (pu.active('invincible') || pu.active('boost')) {
        this.collect.burst(o.x, 1.5, p.z - 1);
        this.world.smash(o); VR.Audio.play('shieldBreak'); this.shake = 0.12;
        return;
      }
      // clipping only the EDGE of a big rock / a pillar (less than ~half your body) is a
      // glancing hit: you trip and are pushed off it, like over a low obstacle
      const glancing = !hit.side && (o.kind === 'block' || o.kind === 'slide') && hit.overlap !== undefined && hit.overlap < 0.42;
      const trip = hit.side || glancing || o.kind === 'jump' || o.kind === 'step';
      if (trip && p.vulnerable <= 0) {
        // first hit: stumble, you don't die
        p.stumble(hit.side);
        if (glancing) {
          const hw = C.PLAYER_HALF_WIDTH + 0.08;
          p.dodgeX = p.x < (hit.bx0 + hit.bx1) / 2 ? hit.bx0 - hw : hit.bx1 + hw;     // shoved off its edge
        }
        if (!hit.side) o.tripped = true;                  // you stumble past it, it no longer blocks you
        this.stumbleT = C.STUMBLE_RECOVER;
        this.hitCooldown = 0.45;
        this.shake = 0.22;
        this.collect.burst(p.x, 0.4, p.z - 0.6);
        VR.Audio.play('stumble');
        UI.toast(VR.t('toast.stumble'), 1300);
        return;
      }
      // second hit while vulnerable, or a lethal head-on hit
      if (pu.active('shield')) { pu.consume('shield'); this.shieldHit(o); return; }
      this.gameOver();
    }
    shieldHit(o) {
      this.world.smash(o);
      this.player.flash = 1.2; this.hitCooldown = 1.2;
      this.shake = 0.25; VR.Audio.play('shieldBreak'); UI.toast(VR.t('toast.shieldBroken'));
    }

    // ------------------------------------------------------------ loop
    loop() {
      requestAnimationFrame(() => this.loop());
      const dt = Math.min(this.clock.getDelta(), 1 / 20);
      this.elapsed = (this.elapsed || 0) + dt;
      const st = this.state;
      if (st === 'playing') this.updatePlaying(dt);
      else if (st === 'dying') { this.player.update(dt, 0, this.world, this); this.updateCamera(dt); }
      else if (st === 'menu' || st === 'character' || st === 'loading' || st === 'challenge' || st === 'missionsList') this.updateMenu(dt);
      else if (st === 'settings' && this.settingsReturn !== 'paused') this.updateMenu(dt);
      else if (st === 'gateEnter') this.updateGateEnter(dt);
      else if (st === 'mission' || st === 'gateReturn') this.updateMissionMode(dt);
      else if (st === 'adventure') { this.missions.update(dt); this.modes.update(dt); }
      else if (st === 'countdown') this.updateCountdown(dt);
      else if (st === 'duelEnter') this.updateDuelEnter(dt);
      else if (st === 'duel' || st === 'duelReturn') this.updateDuelMode(dt);
      else if (st === 'duelPick') this.world.animateGates(dt);
      this.challenge.update(dt);
      this.duel.tick(dt);
      this.updateFade(dt);
      if (this.state === 'mission' || this.state === 'gateReturn' || this.state === 'adventure') this.missions.render(this.renderer);
      else if (this.state === 'duel' || this.state === 'duelReturn') this.duel.render(this.renderer);
      else {
        this.collect.fx.mesh.visible = true;
        this.backdrop.update(dt, this.camera.position);
        this.renderer.render(this.scene, this.camera);
      }

      if (this.settings.fps) {
        this.fpsAcc += dt; this.fpsFrames++;
        if (this.fpsAcc > 0.5) { UI.fps(true, Math.round(this.fpsFrames / this.fpsAcc)); this.fpsAcc = 0; this.fpsFrames = 0; }
      }
    }

    /** pay the coins collected so far into the wallet (every few seconds, and at the end),
     *  so closing / reloading the page in the middle of a run never loses them */
    bankRun() {
      const due = Math.floor(this.coins) - (this.banked || 0);
      if (due > 0) { this.wallet.credit(due, `run:${this.runId}:bank:${Math.floor(this.coins)}`, 'run'); this.banked = Math.floor(this.coins); }
    }
    updatePlaying(dt) {
      const p = this.player;
      this.bankT = (this.bankT || 0) + dt;
      if (this.bankT > 3) { this.bankT = 0; this.bankRun(); }
      let a;
      if (this.finishing) { while (VR.Input.next()); }      // past the line: no more steering
      else while ((a = VR.Input.next())) { if (a === 'interact') this.duel.onRunnerInteract(); else p.action(a, this); }

      this.powerups.update(dt);
      const boost = this.powerups.active('boost');
      let target = this.speedAt(this.distance) * (boost ? C.POWERUPS.boost.speedFactor : 1);
      if (this.finishing) {
        // ease to a stop within STOP_IN metres of the line
        this.finishT += dt;
        if (!this.stopDecel) this.stopDecel = Math.max(4, this.speed) ** 2 / (2 * VR.Course.CONFIG.STOP_IN);   // constant: stops within STOP_IN m
        this.speed = Math.max(0, this.speed - this.stopDecel * dt);
        target = this.speed;
        if (this.speed < 0.6 || this.finishT > 4) { this.speed = 0; this.showFinish(); return; }
      } else this.courseT += dt;
      // just tripped: a short slowdown that eases back
      if (this.stumbleT > 0) { this.stumbleT = Math.max(0, this.stumbleT - dt); target *= 1 - (1 - C.STUMBLE_SLOW) * (this.stumbleT / C.STUMBLE_RECOVER); }
      this.speed += (target - this.speed) * Math.min(1, dt * (this.stumbleT > 0 ? 8 : 2.5));
      const diff = this.difficultyAt(this.distance);

      const z0 = p.z;
      p.update(dt, this.speed, this.world, this);
      const dm = z0 - p.z;
      this.distance += dm;
      this.updateScore(dm);

      this.world.update(dt, p, this.speed, diff, this);
      this.world.animateGates(dt);
      this.duel.roadUpdate(p);
      if (this.checkGates()) return;
      if (this.hitCooldown > 0) this.hitCooldown -= dt;
      if (!this.finishing) this.resolveCollisions();
      if (this.state !== 'playing') return;
      // the finish line
      if (!this.finishing && this.world.finishZ !== null && p.z <= this.world.finishZ) this.crossFinish();
      if (!this.nearToast && this.world.finishZ !== null && p.z - this.world.finishZ < 160) { this.nearToast = true; UI.toast(VR.t('toast.finishNear'), 1400); }
      this.collect.update(dt, p, this);

      p.shieldMesh.visible = this.powerups.active('shield');
      p.glow.visible = this.powerups.active('invincible') || boost;      // glow, not blinking: stay visible at speed
      document.body.classList.toggle('vulnerable', p.vulnerable > 0);
      p.updateShadow(this.world);

      // keep coordinates small on very long runs
      if (p.z < -C.RECENTER_DISTANCE) {
        const dz = -p.z;
        // path coordinates only: the 3D world (and what's on screen) doesn't move
        p.z += dz; this.world.shift(dz); this.camPath.z += dz; this.lookPath.z += dz;
      }

      this.updateEnvironment(dt);
      this.updateCamera(dt);
      UI.setHUD(this.score, this.distance, this.coins, this.multiplier);
      UI.setCourse(this.distance, VR.Course.finishDistance(), this.courseT, this.challenge.oppProgress ? this.challenge.oppProgress() : null);
      UI.setPowerups(this.powerups);
    }

    updateEnvironment(dt) {
      const chunk = this.world.chunkAt(this.player.z);
      if (!chunk) return;
      const biome = VR.BIOMES[chunk.biome];
      if (chunk.biome !== this.lastBiome) {
        if (this.lastBiome) UI.biome(VR.t('biome.' + chunk.biome));
        this.lastBiome = chunk.biome;
      }
      const inTunnel = chunk.style.startsWith('tunnel');
      this.tunnelDark += ((inTunnel ? 1 : 0) - this.tunnelDark) * Math.min(1, dt * 3);
      const k = Math.min(1, dt * 1.2);
      this.skyColor.lerp(new THREE.Color(biome.sky), k);
      this.fogColor.lerp(new THREE.Color(biome.fog), k);
      const dark = this.tunnelDark;
      this.scene.background.copy(this.skyColor).lerp(TUNNEL_COLOR, dark * 0.85);
      this.scene.fog.color.copy(this.fogColor).lerp(TUNNEL_COLOR, dark * 0.9);
      this.hemi.intensity = 1.9 - dark * 1.1;
      this.sun.intensity = 2.1 - dark * 1.6;
      this.backdrop.setBiome(biome, this.fogColor);
    }

    /*
     * RUNNER CAMERA (third person). Works in path space and is put into the
     * world through the track, so it follows turns, climbs and descents.
     *  - rides at a fixed distance behind the runner (no lag along the run):
     *    at any speed the runner stays at the same place on screen; it pulls
     *    back a little and widens the view as the speed rises
     *  - sideways it keeps the runner's relative place in the route region
     *    AT ITS OWN SPOT, so behind a fork, a narrowing or a ledge it is over
     *    the walkable ground, never inside the mountain
     *  - looks ahead along the route (further at higher speed)
     *  - never rolls with the runner's lean; under tunnel roofs it stays low
     */
    updateCamera(dt) {
      const p = this.player, tr = VR.track, clamp = THREE.MathUtils.clamp;
      // spring for landing dip / bumps
      this.camBumpV += (-this.camBump * 60 - this.camBumpV * 10) * dt;
      this.camBump += this.camBumpV * dt;
      const sp = clamp((this.speed || C.SPEED_START) - C.SPEED_START, 0, 40);
      const dist = C.CAMERA_DISTANCE + (this.portrait ? 1.2 : 0) + sp * C.CAMERA_SPEED_PULL;
      const tz = p.z + dist;
      const pr = p.region(), rel = VR.Player.relAt(pr, p.x);
      // which branch the camera rides on: the runner's (by order), so behind a split it is
      // on the runner's side of the mountain; behind a merge it stays on its own branch
      const pregs = tr.regionsAt(p.z), cregs = tr.regionsAt(tz);
      let rc, bx;
      if (cregs.length < pregs.length) {
        // the route splits between the camera and the runner: stay right behind the
        // runner (absolute x), so the camera is already on the runner's side of the fork
        rc = VR.Route.pick(cregs, p.x, p.side);
        bx = clamp(p.x, rc.a + 0.3, rc.b - 0.3);
      } else {
        if (cregs.length === pregs.length) rc = cregs[Math.max(0, pregs.indexOf(VR.Route.pick(pregs, p.x, p.side)))];
        else rc = VR.Route.pick(cregs, this.camPath.x, 0);           // behind a merge: keep its own branch
        bx = VR.Player.xAt(rc, rel);
      }
      // lean a little toward the middle of the branch (more of the route in view), never across it
      const mid = (rc.a + rc.b) / 2;
      const tx = bx - clamp((bx - mid) * 0.25, -0.65, 0.65);
      let ty = C.CAMERA_HEIGHT + p.y * 0.62 + this.camBump + (this.portrait ? 2.6 : 0);
      const k = 1 - Math.exp(-dt * 6);
      const cam = this.camPath;
      // Tunnels: keep the camera under the roof while the camera, the player or the
      // stretch just ahead is inside a tunnel, so the view never ends up in the rock.
      const covered = this.tunnelCover(p.z - 12, tz + 1);
      this.tunCam = (this.tunCam || 0) + ((covered ? 1 : 0) - (this.tunCam || 0)) * Math.min(1, dt * 6);
      const cap = TUNNEL_CAM_MAX;
      if (this.tunCam > 0.001) ty = ty + (Math.min(ty, cap) - ty) * this.tunCam;
      cam.z = tz;
      // smooth, and never faster than ~16-30 m/s sideways (no jumps at splits / merges)
      const want = clamp(cam.x + (tx - cam.x) * k, rc.a + 0.3, rc.b - 0.3);   // over the ground, not in the rock
      const mx = Math.max(16, (this.speed || 0) * 0.65) * dt;
      cam.x += clamp(want - cam.x, -mx, mx);
      cam.y += (ty - cam.y) * (1 - Math.exp(-dt * (covered ? 12 : 5)));
      if (this.tunnelCover(cam.z - 0.5, cam.z + 0.5)) cam.y = Math.min(cam.y, cap);   // hard limit inside the tube
      // look ahead along the route where the runner is heading
      const look = this.lookPath;
      look.z = p.z - (C.CAMERA_LOOK_AHEAD + sp * 0.22);
      const rl = tr.regionAt(look.z, p.x, p.side);
      const lx = 0.55 * p.x + 0.45 * VR.Player.xAt(rl, rel);
      look.x += (lx - clamp(lx * 0.15, -0.4, 0.4) - look.x) * k;
      const lookY = (this.portrait ? 0.6 : 1.2) + p.y * 0.55;
      look.y += (lookY + ((this.portrait ? 1.0 : 1.2) + p.y * 0.55 - lookY) * (this.tunCam || 0) - look.y) * k;
      // sense of speed: a slightly wider view as you go faster
      const fov = this.baseFov + C.CAMERA_SPEED_FOV * clamp(sp / (C.SPEED_MAX - C.SPEED_START), 0, 1.4);
      if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 2); this.camera.updateProjectionMatrix(); }
      // path space -> world (turns, hills)
      const wc = this.camera.position;
      tr.toWorld(cam.x, cam.y, cam.z, wc);
      tr.toWorld(look.x, look.y, look.z, this.camLook);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt);
        const s = this.shake * 0.5;
        wc.x += (Math.random() - 0.5) * s; wc.y += (Math.random() - 0.5) * s;
      }
      this.camera.lookAt(this.camLook);
    }

    /** Is any part of the track between z0 (ahead) and z1 (behind) a tunnel? */
    tunnelCover(z0, z1) {
      for (const c of this.world.chunks) {
        if (!c.style.startsWith('tunnel')) continue;
        if (c.z0 >= z0 && c.z0 - C.CHUNK_LENGTH <= z1) return true;
      }
      return false;
    }

    // menu: character faces the camera, slow orbit, idle bob
    updateMenu(dt) {
      this.menuTime += dt;
      // build the rest of the mountain sections while the menu is up (no hitch later)
      if (((this.menuTime * 60) | 0) % 3 === 0) this.world.prebuildStep();
      const p = this.player, r = p.rig;
      p.object.position.set(0, 0, 0);
      p.object.rotation.y = Math.PI + Math.sin(this.menuTime * 0.5) * 0.35;
      const breathe = Math.sin(this.menuTime * 2.2);
      r.inner.rotation.set(0, 0, 0);
      r.inner.position.y = breathe * 0.02;
      r.parts.armL.rotation.set(0, 0, -0.12 - breathe * 0.04);
      r.parts.armR.rotation.set(Math.sin(this.menuTime * 3) * 0.15 - 0.2, 0, 0.12 + breathe * 0.04);
      r.parts.legL.rotation.set(0, 0, 0); r.parts.legR.rotation.set(0, 0, 0);
      r.parts.head.rotation.set(Math.sin(this.menuTime * 0.9) * 0.06, Math.sin(this.menuTime * 0.7) * 0.2, 0);
      r.root.visible = true; r.root.scale.set(1, 1, 1);
      p.shieldMesh.visible = false;
      p.updateShadow(this.world);
      const charView = this.state === 'character';
      const a = this.menuTime * 0.15;
      const radius = charView ? 4.2 : 7;
      const cx = Math.sin(a) * 1.5, cy = charView ? 1.6 : 2.0, cz = -radius;
      this.camera.position.set(cx, cy, cz);
      this.menuCamPos = this.camera.position.clone();
      // look below the character so it sits between the title and the buttons
      this.camLook.set(0, charView ? 0.2 : -0.45, 0);
      this.camera.lookAt(this.camLook);
      // also let the sky follow the first biome
      this.updateEnvironment(dt);
      p.object.rotation.y = Math.sin(this.menuTime * 0.5) * 0.35; // faces -Z → camera sits at -Z
    }
  }
  const TUNNEL_COLOR = new THREE.Color(0x1a1714);
  const TUNNEL_CAM_MAX = 4.9;           // tunnel roof is at 5.9 m

  VR.Game = Game;

  window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    VR.game = game;
    // let the loading screen paint before the heavy prefab build
    // wait (briefly) for web fonts so in-world signs render with them
    const fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
    fontsReady.then(() => requestAnimationFrame(() => setTimeout(() => {
      try { game.boot(); }
      catch (e) { document.getElementById('loadMsg').textContent = 'Could not start: ' + e.message; throw e; }
    }, 30)));
  });
})();
