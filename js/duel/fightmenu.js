/* =====================================================================
 * FIGHT MENU — main menu → «القتال / Fight». Three ways to fight:
 *   friend vs friend               → the online picker / waiting arena
 *   me vs the computer             → 1-3 bots, 4 difficulties (local)
 *   me + a friend vs the computer  → same settings, then invite a player
 * The choice of bots and difficulty is remembered on this device.
 * ===================================================================== */
(function () {
  Object.assign(VR.I18N.STRINGS.en, { 'fm.menuSub': 'Friend vs friend · Me vs the computer',
    'fm.rounds': 'Rounds:', 'fm.firstToN': 'first to {n}', 'fm.usual': 'usual', 'fm.kind': 'Rounds type:', 'fm.kindBuy': 'buy weapons',
    'fm.firstTo': 'first to {n}', 'fm.onlyW': '{w} only' });
  Object.assign(VR.I18N.STRINGS.ar, { 'fm.menuSub': 'صديق ضد صديق · أنا ضد الكمبيوتر',
    'fm.rounds': 'الجولات:', 'fm.firstToN': 'الفوز بـ {n}', 'fm.usual': 'العادي', 'fm.kind': 'نوع الجولات:', 'fm.kindBuy': 'شراء أسلحة',
    'fm.firstTo': 'الفوز بـ {n}', 'fm.onlyW': '{w} فقط' });

  class FightMenu {
    constructor(game) {
      this.game = game;
      const $ = (id) => document.getElementById(id);
      this.el = { root: $('fightMenu'), modes: $('fmModes'), pvp: $('fmPvpPane'), bots: $('fmBotPane'), go: $('fmGo'), count: $('fmCount'), diff: $('fmDiff') };
      const saved = VR.UI.store.get('fightBots', null) || {};
      this.n = [1, 2, 3].includes(saved.n) ? saved.n : 1;
      this.diff = VR.DuelBots.DIFF[saved.diff] ? saved.diff : 'normal';
      this.mode = null;
      // rules before a match: rounds to win and "one weapon" rounds (remembered on this device)
      const rs = VR.UI.store.get('fightRules', null) || {};
      this.firstTo = [1, 2, 3, 5, 7].includes(rs.firstTo) ? rs.firstTo : 0;            // 0 = the mode's usual
      this.oneWeapon = VR.FightKit.ONE_WEAPON.includes(rs.weapon) ? rs.weapon : null;
      const click = (id, fn) => $(id).addEventListener('click', () => { VR.Audio.unlock(); VR.Audio.play('click'); fn(); });
      click('fightBtn', () => this.open());
      click('fmPvp', () => this.show('pvp'));
      click('fmBots', () => this.show('bots'));
      click('fmCoop', () => this.show('coop'));
      click('fmFighters', () => this.show('fighters'));
      click('fmLoot', () => this.show('loot'));
      click('ftGo', () => this.goFighter());
      // AI fighters: up to three opponents, one level, and (optional) the fighter I play as
      const fp = VR.UI.store.get('fighterPick2', null) || {};
      this.picks = Array.isArray(fp.ids) && fp.ids.length ? fp.ids.slice(0, 3) : [VR.UI.store.get('fighterPick', 'dasher')];
      this.fighter = this.picks[0];
      this.level = fp.level || 'medium'; this.playAs = fp.as || null;
      click('fmBack', () => (this.mode ? this.show(null) : this.close()));
      click('fmGo', () => this.go());
      click('fmShop', () => this.show('shop'));
      // the 1v1 buttons (bound in game.js) leave this screen
      for (const id of ['duelBtn', 'waitBtn']) $(id).addEventListener('click', () => { this.starting = true; this.close(); });
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
    close() {
      this.el.root.hidden = true; this.mode = null;
      if (this.fromHub) { this.fromHub = false; if (!this.starting) this.game.backToHub(); }
      this.starting = false;
    }
    show(mode) {
      this.mode = mode;
      this.el.modes.hidden = !!mode;
      this.el.pvp.hidden = mode !== 'pvp';
      this.el.bots.hidden = mode !== 'bots' && mode !== 'coop' && mode !== 'loot';
      document.getElementById('fmFightPane').hidden = mode !== 'fighters';
      if (mode === 'fighters') this.renderFighters();
      this.renderRules();
      const shop = document.getElementById('fmShopPane');
      document.getElementById('fmShop').hidden = !!mode;
      shop.hidden = mode !== 'shop';
      if (mode === 'shop') VR.Shop.openArena(shop, () => { VR.UI.menuStats(this.game.best, this.game.bank); this.show(null); });
      else if (shop.innerHTML) { shop.innerHTML = ''; VR.UI.menuStats(this.game.best, this.game.bank); }
      this.paint();
    }
    save() { VR.UI.store.set('fightBots', { n: this.n, diff: this.diff }); }
    /** what the next match is played with */
    rules() {
      const local = this.mode === 'bots' || this.mode === 'fighters';
      // against the computer a shop weapon must be bought first; with a friend everything is open
      const w = this.oneWeapon && this.mode !== 'loot' && !(local && VR.FightKit.locked('bots').includes(this.oneWeapon)) ? this.oneWeapon : null;
      return this.firstTo || w ? { firstTo: this.firstTo || null, weapon: w } : null;
    }
    renderRules() {
      const el = document.getElementById('fmRules'), m = this.mode;
      el.hidden = !['pvp', 'bots', 'coop', 'fighters', 'loot'].includes(m);
      if (el.hidden) return;
      const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const locked = m === 'pvp' || m === 'coop' ? [] : VR.FightKit.locked('bots');
      const fts = [0, 1, 2, 3, 5, 7];
      let h = `<div class="fm-rrow"><b>${esc(VR.t('fm.rounds'))}</b>${fts.map(n => `<button class="btn small ${n === this.firstTo ? 'on' : ''}" data-ft="${n}" type="button">${n ? esc(VR.t('fm.firstToN', { n })) : esc(VR.t('fm.usual'))}</button>`).join('')}</div>`;
      if (m !== 'loot') {
        h += `<div class="fm-rrow"><b>${esc(VR.t('fm.kind'))}</b><button class="btn small ${!this.oneWeapon ? 'on' : ''}" data-ow="" type="button">${esc(VR.t('fm.kindBuy'))}</button>`
          + VR.FightKit.ONE_WEAPON.map(id => `<button class="btn small ${id === this.oneWeapon ? 'on' : ''} ${locked.includes(id) ? 'locked' : ''}" data-ow="${id}" type="button" ${locked.includes(id) ? 'disabled' : ''}>${locked.includes(id) ? '🔒 ' : ''}${esc(VR.L(VR.FightKit.NAMES[id]))}</button>`).join('') + '</div>';
      }
      el.innerHTML = h;
      const save = () => VR.UI.store.set('fightRules', { firstTo: this.firstTo, weapon: this.oneWeapon });
      el.querySelectorAll('[data-ft]').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.firstTo = +b.dataset.ft; save(); this.renderRules(); }));
      el.querySelectorAll('[data-ow]').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.oneWeapon = b.dataset.ow || null; save(); this.renderRules(); }));
    }
    paint() {
      this.el.count.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.n === this.n));
      this.el.diff.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === this.diff));
      this.el.go.textContent = VR.t(this.mode === 'coop' ? 'fm.invite' : 'fm.start');
    }
    /** the 10 AI fighters: cards + the chosen one's details */
    renderFighters() {
      const FS = VR.Fighters, L = (v) => VR.L(v), esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      this.picks = this.picks.filter(id => FS.FIGHTERS[id]); if (!this.picks.length) this.picks = ['dasher'];
      if (!FS.FIGHTERS[this.fighter]) this.fighter = this.picks[0];
      const savePick = () => VR.UI.store.set('fighterPick2', { ids: this.picks, level: this.level, as: this.playAs });
      const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
      const grid = document.getElementById('ftGrid');
      grid.innerHTML = FS.ORDER.map(id => { const F = FS.FIGHTERS[id], k = this.picks.indexOf(id); return `<button class="ft-card ${k >= 0 ? 'on' : ''} ${id === this.fighter ? 'view' : ''}" data-id="${id}" type="button" style="border-bottom-color:#${F.color.toString(16).padStart(6, '0')}">
        ${k >= 0 ? `<i class="ft-n">${k + 1}</i>` : ''}<img alt="" src="${FS.portrait(id)}"><b>${esc(L(F.name))}</b><small class="ft-stars">${stars(F.stars)}</small></button>`; }).join('');
      // a click adds / removes an opponent (one to three), and shows its details
      grid.querySelectorAll('.ft-card').forEach(b => b.addEventListener('click', () => {
        VR.Audio.play('click'); const id = b.dataset.id, k = this.picks.indexOf(id);
        if (k >= 0 && this.fighter === id && this.picks.length > 1) this.picks.splice(k, 1);
        else if (k < 0) { if (this.picks.length >= 3) this.picks.shift(); this.picks.push(id); }
        this.fighter = id; VR.UI.store.set('fighterPick', this.picks[0]); savePick(); this.renderFighters();
      }));
      document.getElementById('ftCount').textContent = VR.t('ft.count', { n: this.picks.length });
      const lv = document.getElementById('ftLevel');
      lv.innerHTML = FS.LEVEL_ORDER.map(k => `<button class="btn small ${k === this.level ? 'on' : ''}" data-l="${k}" type="button">${esc(VR.t('bot.diff.' + k))}</button>`).join('');
      lv.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.level = b.dataset.l; savePick(); this.renderFighters(); }));
      const as = document.getElementById('ftAs');
      as.innerHTML = [null].concat(FS.ORDER).map(id => `<button class="btn small ${id === this.playAs ? 'on' : ''}" data-a="${id || ''}" type="button">${id ? esc(L(FS.FIGHTERS[id].name)) : esc(VR.t('ft.asMe'))}</button>`).join('');
      as.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); this.playAs = b.dataset.a || null; savePick(); this.renderFighters(); }));
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
      this.starting = true; this.close();
      this.game.duel.startBots({ fighters: this.picks.slice(0, 3), level: this.level, playAs: this.playAs, rules: this.rules() });
    }
    go() {
      const opts = { bots: this.n, diff: this.diff, rules: this.rules() };
      if (this.mode === 'bots' || this.mode === 'loot') {
        if (this.mode === 'loot') opts.loot = true;
        if (this.game.settings.fullscreen) VR.Fullscreen.request();
        this.starting = true; this.close();
        this.game.duel.startBots(opts);
      } else if (this.mode === 'coop') {
        this.starting = true; this.close();
        this.game.duel.openPickerFromMenu({ type: 'coop', ...opts });
      }
    }
  }
  VR.FightMenu = FightMenu;
})();
