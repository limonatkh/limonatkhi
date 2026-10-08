/* =====================================================================
 * FIGHT MENU — main menu → «القتال / Fight». Three ways to fight:
 *   friend vs friend               → the online picker / waiting arena
 *   me vs the computer             → 1-3 bots, 4 difficulties (local)
 *   me + a friend vs the computer  → same settings, then invite a player
 * The choice of bots and difficulty is remembered on this device.
 * ===================================================================== */
(function () {
  Object.assign(VR.I18N.STRINGS.en, { 'fm.menuSub': 'Friend vs friend · Me vs the computer' });
  Object.assign(VR.I18N.STRINGS.ar, { 'fm.menuSub': 'صديق ضد صديق · أنا ضد الكمبيوتر' });

  class FightMenu {
    constructor(game) {
      this.game = game;
      const $ = (id) => document.getElementById(id);
      this.el = { root: $('fightMenu'), modes: $('fmModes'), pvp: $('fmPvpPane'), bots: $('fmBotPane'), go: $('fmGo'), count: $('fmCount'), diff: $('fmDiff') };
      const saved = VR.UI.store.get('fightBots', null) || {};
      this.n = [1, 2, 3].includes(saved.n) ? saved.n : 1;
      this.diff = VR.DuelBots.DIFF[saved.diff] ? saved.diff : 'normal';
      this.mode = null;
      const click = (id, fn) => $(id).addEventListener('click', () => { VR.Audio.unlock(); VR.Audio.play('click'); fn(); });
      click('fightBtn', () => this.open());
      click('fmPvp', () => this.show('pvp'));
      click('fmBots', () => this.show('bots'));
      click('fmCoop', () => this.show('coop'));
      click('fmBack', () => (this.mode ? this.show(null) : this.close()));
      click('fmGo', () => this.go());
      click('fmShop', () => this.show('shop'));
      // the 1v1 buttons (bound in game.js) leave this screen
      for (const id of ['duelBtn', 'waitBtn']) $(id).addEventListener('click', () => this.close());
      this.el.count.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.n = +b.dataset.n; this.save(); this.paint(); }));
      this.el.diff.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.diff = b.dataset.d; this.save(); this.paint(); }));
      VR.I18N.onChange(() => this.paint());
    }
    get isOpen() { return !this.el.root.hidden; }
    open() {
      if (this.game.state !== 'menu') return;
      this.show(null);
      this.el.root.hidden = false;
    }
    close() { this.el.root.hidden = true; this.mode = null; }
    show(mode) {
      this.mode = mode;
      this.el.modes.hidden = !!mode;
      this.el.pvp.hidden = mode !== 'pvp';
      this.el.bots.hidden = mode !== 'bots' && mode !== 'coop';
      const shop = document.getElementById('fmShopPane');
      document.getElementById('fmShop').hidden = !!mode;
      shop.hidden = mode !== 'shop';
      if (mode === 'shop') VR.Shop.openArena(shop, () => { VR.UI.menuStats(this.game.best, this.game.bank); this.show(null); });
      else if (shop.innerHTML) { shop.innerHTML = ''; VR.UI.menuStats(this.game.best, this.game.bank); }
      this.paint();
    }
    save() { VR.UI.store.set('fightBots', { n: this.n, diff: this.diff }); }
    paint() {
      this.el.count.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.n));
      this.el.diff.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === this.diff));
      this.el.go.textContent = VR.t(this.mode === 'coop' ? 'fm.invite' : 'fm.start');
    }
    go() {
      const opts = { bots: this.n, diff: this.diff };
      if (this.mode === 'bots') {
        if (this.game.settings.fullscreen) VR.Fullscreen.request();
        this.close();
        this.game.duel.startBots(opts);
      } else if (this.mode === 'coop') {
        this.close();
        this.game.duel.openPickerFromMenu({ type: 'coop', ...opts });
      }
    }
  }
  VR.FightMenu = FightMenu;
})();
