/* =====================================================================
 * MINI-GAMES — worlds behind the gates in the square (js/adventure/
 * hubgates.js): BILLIARDS (js/mini/billiards.js) and BASKETBALL
 * (js/mini/basketball.js). The runner course keeps its own portal.
 *
 * One shared loop for every mini-game:
 *   gate in the square → fade → the world → intro (goal, controls,
 *   difficulty) → the match → result (win / lose / draw) + coins →
 *   "Return to Lemonat" → back in front of the same gate.
 *   Esc (or ⏸) pauses: resume, or leave the match (abandoned: 0 coins).
 *
 * Game states (js/game.js): 'miniEnter' (fading out of the square),
 * 'mini' (in the world), 'miniReturn' (fading back).
 *
 * ONLINE (v1.38): the start screen's "PLAY A FRIEND ONLINE" opens the 1v1's list of
 * players (the friend in your challenge room, whoever is online) with a billiards /
 * basketball invite; an accepted invite brings both players into the same world
 * (from the square, the menu or a mini-game's start screen) and starts the match at
 * once — js/mini/mininet.js. Pausing does not stop an online match; leaving it, or the
 * other player leaving, ends it (the one who stays wins).
 *
 * COINS use the shared wallet (js/core/wallet.js): one transaction id per
 * match ('mini:<game>:<matchId>'), so the result screen, a second click on
 * the return button or a reload can never pay twice; an abandoned match
 * pays nothing; nothing is ever taken away on entering. The amounts live in
 * VR.MiniGames.REWARDS (change them there).
 *
 * A mini-game is a class registered with VR.MiniGames.register(id, Class):
 *   new Class(mgr)               build the world into mgr.scene
 *   intro()                      { title, goal, controls: [[key, what]…] }
 *   start(level)                 a new match (level: 'easy' | 'normal' | 'hard')
 *   update(dt, live)             live = false while a screen is open (only animate)
 *   pause(on)                    stop / restart its input
 *   dispose()
 * and calls mgr.finish(outcome, lines) once the result is final
 * (outcome: 'win' | 'lose' | 'draw').
 * ===================================================================== */
(function () {
  const T = THREE;
  const L = (v) => VR.L(v), tr = (k, v) => VR.t(k, v);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** coins per result — change here (abandon = leaving before the end) */
  const REWARDS = {
    billiards: { win: 100, lose: 10, abandon: 0 },
    basketball: { win: 120, lose: 10, draw: 30, abandon: 0 },
  };
  const CLASSES = {};

  Object.assign(VR.I18N.STRINGS.en, {
    'mg.start': 'START', 'mg.level': 'Opponent', 'mg.easy': 'Easy', 'mg.normal': 'Normal', 'mg.hard': 'Hard',
    'mg.controls': 'Controls', 'mg.win': 'YOU WIN', 'mg.lose': 'YOU LOSE', 'mg.draw': 'DRAW',
    'mg.coins': '+{n} coins', 'mg.noCoins': 'No coins this time', 'mg.balance': 'Balance: {n}',
    'mg.again': 'PLAY AGAIN', 'mg.return': 'RETURN TO LEMONAT', 'mg.paused': 'PAUSED', 'mg.resume': 'RESUME',
    'mg.leave': 'LEAVE MATCH', 'mg.leaveNote': 'Leaving before the end pays 0 coins.', 'mg.rewards': 'Win {w} · Lose {l}',
    'mg.rewardsD': 'Win {w} · Draw {d} · Lose {l}', 'mg.you': 'You',
    'mg.online': '🌐 PLAY A FRIEND ONLINE', 'mg.vsComputer': 'or against the computer:', 'mg.onlineNote': 'The match goes on while this is open.',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'mg.start': 'ابدأ', 'mg.level': 'الخصم', 'mg.easy': 'سهل', 'mg.normal': 'عادي', 'mg.hard': 'صعب',
    'mg.controls': 'التحكم', 'mg.win': 'فزت!', 'mg.lose': 'خسرت', 'mg.draw': 'تعادل',
    'mg.coins': '+{n} عملة', 'mg.noCoins': 'لا عملات هذه المرة', 'mg.balance': 'رصيدك: {n}',
    'mg.again': 'العب مجددًا', 'mg.return': 'ارجع إلى ليمونات', 'mg.paused': 'إيقاف مؤقت', 'mg.resume': 'تابع',
    'mg.leave': 'غادر المباراة', 'mg.leaveNote': 'المغادرة قبل النهاية = 0 عملات.', 'mg.rewards': 'الفوز {w} · الخسارة {l}',
    'mg.rewardsD': 'الفوز {w} · التعادل {d} · الخسارة {l}', 'mg.you': 'أنت',
    'mg.online': '🌐 العب ضد صديق أونلاين', 'mg.vsComputer': 'أو ضد الكمبيوتر:', 'mg.onlineNote': 'المباراة مستمرة وهذه النافذة مفتوحة.',
  });

  class MiniManager {
    constructor(game) {
      this.game = game;
      this.state = null;                 // null | 'entering' | 'intro' | 'play' | 'paused' | 'result' | 'leaving'
      this.id = null; this.cur = null; this.matchId = null; this.paid = false; this.result = null;
      this.level = VR.UI.store.get('miniLevel', 'normal');
      this.camera = new T.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 200);
      this.scene = null;
      const root = document.createElement('div'); root.id = 'mini-ui'; root.hidden = true;
      root.innerHTML = `<div class="mg-hud"></div><div class="mg-touch"></div>
        <button class="mg-pause btn small" type="button" aria-label="pause">⏸</button>
        <div class="mg-banner" hidden></div>
        <div class="mg-overlay" hidden><div class="card panel mg-card"></div></div>`;
      document.body.appendChild(root);
      this.root = root;
      this.el = { hud: root.querySelector('.mg-hud'), touch: root.querySelector('.mg-touch'), banner: root.querySelector('.mg-banner'),
        overlay: root.querySelector('.mg-overlay'), card: root.querySelector('.mg-card'), pause: root.querySelector('.mg-pause') };
      this.el.pause.addEventListener('click', () => { VR.Audio.play('click'); if (this.state === 'play') this.pause(); });
      this.bannerT = 0;
    }
    get active() { return !!this.cur; }
    /**
     * An accepted online invite (js/duel/duel.js → startMini): into this world, the match starts
     * at once. From the square (back to where I stood afterwards), the menu, or a mini-game's start screen.
     */
    enterOnline(id, s) {
      const g = this.game;
      if (!CLASSES[id]) { s.close(true); return false; }
      this.online = s;
      if (this.cur && g.state === 'mini') {
        if (this.id === id && this.state === 'intro') { this.startOnline(); return true; }
        this.teardown(true); this.online = s;
      } else if (g.state === 'adventure') {
        const c = g.missions.ctrl, r = g.missions.run;
        if (r && c) g.hubReturn = { area: r.def.id, pos: [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)], yaw: +c.yaw.toFixed(3) };
        g.missions.saveArea && g.missions.saveArea();
      } else if (g.state !== 'menu') { s.close(true); this.online = null; return false; }
      this.id = id; this.state = 'entering'; this.enterT = 0;
      this.inputOff();
      VR.Audio.play('portal');
      g.setState('miniEnter');
      g.fade.target = 1;
      return true;
    }
    startOnline() {
      if (!this.cur || !this.online) return;
      this.closeCard();
      this.matchId = 'net-' + this.online.did; this.paid = false; this.result = null;
      this.state = 'play';
      this.cur.startOnline(this.online);
      this.cur.pause && this.cur.pause(false);
    }
    get rewards() { return REWARDS[this.id] || { win: 0, lose: 0, draw: 0, abandon: 0 }; }

    // ------------------------------------------------------------ in / out
    /** a gate in the square: fade out, then the world */
    enter(id) {
      if (!CLASSES[id] || this.cur || this.game.state !== 'adventure') return false;
      this.id = id; this.state = 'entering'; this.enterT = 0;
      this.inputOff();                                     // the square stops listening while it fades
      VR.Audio.play('portal');
      this.game.missions.saveArea && this.game.missions.saveArea();
      this.game.setState('miniEnter');
      this.game.fade.target = 1;
      return true;
    }
    /** called by the game loop while fading out of the square */
    updateEnter(dt) {
      this.enterT += dt;
      if (this.game.fade.value < 0.99 || this.enterT < 0.35) return;
      const g = this.game;
      if (g.missions.active) g.missions.abort();          // the square is saved and closed
      this.scene = new T.Scene();
      this.camera.up.set(0, 1, 0);                           // (a world may have turned it for a top view)
      this.cur = new CLASSES[this.id](this);
      this.root.hidden = false; this.root.dataset.game = this.id;
      g.setState('mini');
      this.resize(window.innerWidth, window.innerHeight);
      if (this.online) this.startOnline(); else this.showIntro();
      g.fade.target = 0;
    }
    /** RETURN TO LEMONAT (or leaving): back in front of the gate */
    leave() {
      if (!this.cur || this.state === 'leaving') return;
      if (this.online) { this.online.close(true); this.online = null; }
      if (this.state === 'result') this.payOnce();          // (already paid when the result was final — the txId keeps it once)
      this.state = 'leaving'; this.closeCard();
      this.inputOff();
      VR.Audio.play('portal');
      this.game.setState('miniReturn');
      this.game.fade.target = 1;
    }
    updateReturn() {
      if (this.game.fade.value < 0.99) return;
      this.teardown();
      this.game.backToHub();
      this.game.fade.target = 0;
      if (this.result && this.result.paid > 0) setTimeout(() => VR.UI.toast(tr('mg.coins', { n: this.result.paid }), 2000), 400);
    }
    /** drop everything (also when the game is forced back to the menu) */
    teardown(keepNet) {
      this.inputOff();
      if (this.online && !keepNet) { this.online.close(true); this.online = null; }
      if (this.cur) { try { this.cur.dispose(); } catch (e) { console.error(e); } }
      if (this.scene) disposeScene(this.scene);
      this.cur = null; this.scene = null; this.state = null;
      this.closeCard(); this.el.hud.innerHTML = ''; this.el.touch.innerHTML = ''; this.el.banner.hidden = true;
      this.root.hidden = true;
    }
    abort() { this.teardown(); }

    // ------------------------------------------------------------ screens
    showIntro() {
      this.state = 'intro';
      const it = this.cur.intro(), R = this.rewards;
      const rw = R.draw !== undefined ? tr('mg.rewardsD', { w: R.win, d: R.draw, l: R.lose }) : tr('mg.rewards', { w: R.win, l: R.lose });
      const lv = ['easy', 'normal', 'hard'];
      this.card(`<h2 class="heading mg-title">${esc(it.title)}</h2>
        <p class="mg-goal">${esc(it.goal)}</p>
        <div class="mg-keys"><b>${esc(tr('mg.controls'))}</b>${it.controls.map(([k, w]) => `<div class="mg-key"><kbd>${esc(k)}</kbd><span>${esc(w)}</span></div>`).join('')}</div>
        <div class="mg-level"><b>${esc(tr('mg.level'))}</b>${lv.map(l => `<button class="btn small ${l === this.level ? 'on' : ''}" data-lv="${l}" type="button">${esc(tr('mg.' + l))}</button>`).join('')}</div>
        <p class="mg-reward"><span class="coin-ico"></span> ${esc(rw)}</p>
        <button class="btn primary mg-go" type="button">${esc(tr('mg.start'))}</button>
        <button class="btn mg-net" type="button">${esc(tr('mg.online'))}</button>
        <button class="btn small mg-back" type="button">${esc(tr('mg.return'))}</button>`);
      this.el.card.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => {
        VR.Audio.play('click'); this.level = b.dataset.lv; VR.UI.store.set('miniLevel', this.level);
        this.el.card.querySelectorAll('[data-lv]').forEach(x => x.classList.toggle('on', x === b));
      }));
      this.el.card.querySelector('.mg-go').addEventListener('click', () => { VR.Audio.unlock(); VR.Audio.play('click'); this.startMatch(); });
      this.el.card.querySelector('.mg-back').addEventListener('click', () => { VR.Audio.play('click'); this.leave(); });
      this.el.card.querySelector('.mg-net').addEventListener('click', () => { VR.Audio.unlock(); VR.Audio.play('click'); this.game.duel.openPickerMini(this.id); });
    }
    /** a new match: a new id, nothing paid yet */
    startMatch(level = this.level) {
      if (!this.cur) return;
      this.closeCard();
      this.matchId = VR.uid(); this.paid = false; this.result = null;
      this.state = 'play';
      this.cur.start(level);
      this.cur.pause && this.cur.pause(false);
    }
    pause() {
      if (this.state !== 'play') return;
      this.state = 'paused';
      if (!this.online) this.cur.pause && this.cur.pause(true);           // (online: the match goes on)
      this.card(`<h2 class="heading">${esc(tr('mg.paused'))}</h2>${this.online ? `<p class="mg-note">${esc(tr('mg.onlineNote'))}</p>` : ''}
        <button class="btn primary mg-res" type="button">${esc(tr('mg.resume'))}</button>
        <button class="btn mg-quit" type="button">${esc(tr('mg.leave'))}</button>
        <p class="mg-note">${esc(tr('mg.leaveNote'))}</p>`);
      this.el.card.querySelector('.mg-res').addEventListener('click', () => { VR.Audio.play('click'); this.resume(); });
      this.el.card.querySelector('.mg-quit').addEventListener('click', () => { VR.Audio.play('click'); this.abandon(); });
    }
    resume() {
      if (this.state !== 'paused') return;
      this.closeCard(); this.state = 'play';
      this.cur.pause && this.cur.pause(false);
    }
    /** left before the end: the abandon reward (0 by default), then home */
    abandon() {
      if (!this.cur) return;
      const amount = this.state === 'result' ? 0 : this.rewards.abandon || 0;
      if (this.online) { this.online.close(true); this.online = null; }        // the other player wins
      if (this.state !== 'result' && this.matchId) {
        this.result = { outcome: 'abandon', paid: 0 };
        if (amount > 0) this.result.paid = VR.Wallet.of().credit(amount, `mini:${this.id}:${this.matchId}`, 'mini:' + this.id) ? amount : 0;
        this.paid = true;
      }
      this.leave();
    }
    onPauseKey() {
      if (this.state === 'play') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    /** the match is over and its result final: pay once, show the result */
    finish(outcome, lines = []) {
      if (!this.cur || this.state !== 'play') return;
      this.state = 'result';
      this.cur.pause && this.cur.pause(true);
      this.result = { outcome, lines, amount: this.rewards[outcome] || 0, paid: 0 };
      this.payOnce();
      const r = this.result, head = { win: 'mg.win', lose: 'mg.lose', draw: 'mg.draw' }[outcome];
      VR.Audio.play(outcome === 'win' ? 'success' : outcome === 'draw' ? 'bell' : 'buzz');
      this.card(`<h2 class="heading mg-res-${outcome}">${esc(tr(head))}</h2>
        ${lines.map(l => `<p class="mg-line">${esc(l)}</p>`).join('')}
        <p class="mg-coins">${r.amount > 0 ? `<span class="coin-ico"></span> ${esc(tr('mg.coins', { n: r.amount }))}` : esc(tr('mg.noCoins'))}</p>
        <p class="mg-note">${esc(tr('mg.balance', { n: VR.Wallet.of().coins.toLocaleString('en-US') }))}</p>
        <button class="btn primary mg-home" type="button">${esc(tr('mg.return'))}</button>
        ${this.online ? '' : `<button class="btn mg-again" type="button">${esc(tr('mg.again'))}</button>`}`);
      this.el.card.querySelector('.mg-home').addEventListener('click', () => { VR.Audio.play('click'); this.leave(); });
      const again = this.el.card.querySelector('.mg-again');
      if (again) again.addEventListener('click', () => { VR.Audio.play('click'); this.startMatch(); });
      if (this.online) { this.online.close(false); this.online = null; }          // the match is over: the link can go
    }
    /** credit this match's reward; the wallet ignores a txId it has already seen */
    payOnce() {
      const r = this.result;
      if (!r || !this.matchId || r.outcome === 'abandon') return;
      if (r.amount > 0 && VR.Wallet.of().credit(r.amount, `mini:${this.id}:${this.matchId}`, 'mini:' + this.id)) r.paid = r.amount;
      this.paid = true;
    }

    card(html) {
      this.el.card.innerHTML = html; this.el.overlay.hidden = false;
      this.inputOff();
    }
    closeCard() { this.el.overlay.hidden = true; this.el.card.innerHTML = ''; }
    inputOff() { VR.Input.setFPEnabled(false); VR.Input.releaseLock(); }
    /** a short line in the middle of the screen (fouls, baskets, steals…) */
    banner(text, cls = '', secs = 1.8) {
      const b = this.el.banner; b.textContent = text; b.className = 'mg-banner ' + cls; b.hidden = false; this.bannerT = secs;
    }

    // ------------------------------------------------------------ loop
    update(dt) {
      const st = this.game.state;
      if (st === 'miniEnter') return this.updateEnter(dt);
      if (st === 'miniReturn') { if (this.cur) this.cur.update(dt, false); return this.updateReturn(); }
      if (this.online) this.online.update(dt);
      if (!this.cur) return;
      if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.hidden = true; }
      this.cur.update(dt, this.state === 'play' || (!!this.online && this.state === 'paused'));
    }
    render(renderer) {
      if (this.game.state === 'miniEnter') { if (this.game.missions.active) this.game.missions.render(renderer); return; }
      if (this.scene) renderer.render(this.scene, this.camera);
    }
    resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.cur && this.cur.resize) this.cur.resize(w, h); }
  }

  /** free what a mini-game world made (geometries / materials / canvas textures) */
  function disposeScene(scene) {
    const seen = new Set();
    const walk = (o) => {
      if (o.userData.keep) return;                     // characters: shared rigs, not ours to free
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m && !seen.has(m) && m.userData && m.userData.mini) { seen.add(m); if (m.map) m.map.dispose(); m.dispose(); }
      for (const c of o.children) walk(c);
    };
    walk(scene);
  }

  // ---------------------------------------------------------------- shared helpers for the worlds
  const Kit = {
    /** a flat-coloured material that is freed with the world */
    mat(color, opts = {}) { const m = new T.MeshLambertMaterial(Object.assign({ color }, opts)); m.userData.mini = true; return m; },
    basic(color, opts = {}) { const m = new T.MeshBasicMaterial(Object.assign({ color }, opts)); m.userData.mini = true; return m; },
    box(w, h, d, color, x = 0, y = 0, z = 0, parent = null) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), typeof color === 'number' ? Kit.mat(color) : color);
      m.position.set(x, y, z); if (parent) parent.add(m); return m;
    },
    /** voxels merged into one mesh: list of [cx, y0, cz, w, h, d, color] */
    voxels(list) { const vb = new VR.VoxelBuilder(); for (const v of list) vb.addColorBox(...v); return vb.build(); },
    /** a canvas texture board (scoreboards); draw(ctx, w, h) */
    board(w, h, pxW, pxH) {
      const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
      const tex = new T.CanvasTexture(cv); tex.magFilter = T.NearestFilter; tex.colorSpace = T.SRGBColorSpace;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), Kit.basic(0xffffff, { map: tex }));
      m.userData.draw = (fn) => { const c = cv.getContext('2d'); fn(c, pxW, pxH); tex.needsUpdate = true; };
      return m;
    },
    /** a character from the game (same rigs as everywhere), tone 'white' | 'grey', ring colour */
    body(charId, tone, col) {
      const b = VR.DuelBody.build(charId, tone, col, null);
      b.g.userData.keep = true;
      return b;
    },
    lights(scene, sky = 0x2a2f3d, hemiI = 1.5, sunI = 1.6) {
      scene.background = new T.Color(sky);
      const hemi = new T.HemisphereLight(0xffffff, 0x6a5a48, hemiI), sun = new T.DirectionalLight(0xfff2d6, sunI);
      sun.position.set(-0.5, 1, 0.35); scene.add(hemi, sun);
      return { hemi, sun };
    },
  };

  VR.MiniGames = {
    REWARDS, Kit,
    register(id, Cls) { CLASSES[id] = Cls; },
    has(id) { return !!CLASSES[id]; },
    Manager: MiniManager,
  };
})();
