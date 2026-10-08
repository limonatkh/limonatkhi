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
      click('fmFighters', () => this.show('fighters'));
      click('ftGo', () => this.goFighter());
      this.fighter = VR.UI.store.get('fighterPick', 'dasher');
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
      document.getElementById('fmFightPane').hidden = mode !== 'fighters';
      if (mode === 'fighters') this.renderFighters();
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
    /** the 10 AI fighters: cards + the chosen one's details */
    renderFighters() {
      const FS = VR.Fighters, L = (v) => VR.L(v), esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      if (!FS.FIGHTERS[this.fighter]) this.fighter = 'dasher';
      const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
      const grid = document.getElementById('ftGrid');
      grid.innerHTML = FS.ORDER.map(id => { const F = FS.FIGHTERS[id]; return `<button class="ft-card ${id === this.fighter ? 'on' : ''}" data-id="${id}" type="button" style="border-bottom-color:#${F.color.toString(16).padStart(6, '0')}">
        <img alt="" src="${FS.portrait(id)}"><b>${esc(L(F.name))}</b><small class="ft-stars">${stars(F.stars)}</small></button>`; }).join('');
      grid.querySelectorAll('.ft-card').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.fighter = b.dataset.id; VR.UI.store.set('fighterPick', this.fighter); this.renderFighters(); }));
      const F = FS.FIGHTERS[this.fighter], A = FS.ABILITIES[F.ability];
      document.getElementById('ftDetail').innerHTML = `<img alt="" src="${FS.portrait(this.fighter)}"><div>
        <h4>${esc(L(F.name))}</h4><div class="ft-title">«${esc(L(F.title))}»</div>
        <div class="ft-row"><b>${VR.t('ft.ability')}:</b> ${esc(L(A.name))} · <b>${VR.t('ft.diff')}:</b> <span class="ft-stars">${stars(F.stars)}</span></div>
        <p>${esc(L(F.desc))}</p>
        <div class="ft-row"><b>${VR.t('ft.strong')}:</b> ${esc(L(F.strong))}</div>
        <div class="ft-row"><b>${VR.t('ft.weak')}:</b> ${esc(L(F.weak))}</div></div>`;
    }
    goFighter() {
      if (this.game.settings.fullscreen) VR.Fullscreen.request();
      this.close();
      this.game.duel.startBots({ fighter: this.fighter });
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
