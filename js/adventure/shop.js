/* =====================================================================
 * SHOP — spend the shared coins (VR.Wallet) on upgrades, supplies and
 * weapons. The stall stands in the big square of the adventure world.
 * ---------------------------------------------------------------------
 *   VR.Shop.ITEMS        the catalogue (prices live here — one table)
 *   VR.Shop.level(id)    bought level of an upgrade (profile.upgrades)
 *   VR.Shop.count(id)    supplies carried (profile.inventory.consumables)
 *   VR.Shop.buy(id, ctx) → 'ok' | 'max' | 'poor' | 'owned'
 *
 * Every purchase goes through the wallet with a transaction id, so a
 * double click can never charge twice: an upgrade level is
 * `shop:<id>:<level>` (one per level, ever), a supply or weapon
 * `shop:<id>:<unique>`.
 *
 * Effects are read where they matter: combat (js/combat/encounter.js:
 * health, regeneration, ammo, grenades, medkits), the course
 * (js/collectibles.js magnet time, js/game.js starting shield).
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ------------------------------------------------------------------
   * CATALOGUE  (kind: upgrade = levels, supply = carried up to max,
   *             weapon = goes into your weapon slots)
   * ---------------------------------------------------------------- */
  const ITEMS = [
    { id: 'hp', kind: 'upgrade', prices: [90, 180, 300], icon: '♥',
      name: { en: 'Lemon heart', ar: 'قلب الليمون' }, desc: { en: '+20 max health per level', ar: '+20 صحة قصوى لكل مستوى' } },
    { id: 'regen', kind: 'upgrade', prices: [120], icon: '✿',
      name: { en: 'Quick breath', ar: 'نَفَس سريع' }, desc: { en: 'Health comes back sooner (2.5 s) and faster', ar: 'تعود الصحة أبكر (2.5 ث) وأسرع' } },
    { id: 'ammo', kind: 'upgrade', prices: [70, 150], icon: '▤',
      name: { en: 'Ammo belt', ar: 'حزام الذخيرة' }, desc: { en: '+25% ammo carried per level', ar: '+25% ذخيرة تحملها لكل مستوى' } },
    { id: 'nades', kind: 'upgrade', prices: [160], icon: '◆',
      name: { en: 'Grenade pouch', ar: 'جيب القنابل' }, desc: { en: '+1 impulse grenade charge', ar: '+1 شحنة قنبلة دفع' } },
    { id: 'magnet', kind: 'upgrade', prices: [200], icon: '⊃',
      name: { en: 'Strong magnet', ar: 'مغناطيس أقوى' }, desc: { en: 'Course magnet lasts 50% longer', ar: 'المغناطيس في المضمار يدوم أطول بـ 50%' } },
    { id: 'medkit', kind: 'supply', price: 25, max: 3, icon: '✚',
      name: { en: 'Medkit', ar: 'حقيبة إسعاف' }, desc: { en: '+50 health, press H', ar: '+50 صحة، اضغط H' } },
    { id: 'startShield', kind: 'supply', price: 35, max: 3, icon: '◎',
      name: { en: 'Starting shield', ar: 'درع البداية' }, desc: { en: 'Your next solo course starts with a 20 s shield', ar: 'مضمارك الفردي التالي يبدأ بدرع لـ 20 ث' } },
    { id: 'shotgun', kind: 'weapon', price: 120, icon: '⁂',
      name: { en: 'Scatter shotgun', ar: 'بندقية الرشّ' }, desc: { en: 'Strong up close', ar: 'قوية من قريب' } },
    { id: 'smg', kind: 'weapon', price: 160, icon: '≡',
      name: { en: 'Light SMG', ar: 'الرشّاش الخفيف' }, desc: { en: 'Automatic, hold to fire', ar: 'آلي، اضغط مطوّلًا' } },
    { id: 'sniper', kind: 'weapon', price: 220, icon: '⌖',
      name: { en: 'Sniper', ar: 'القنّاصة' }, desc: { en: 'Right click to scope', ar: 'الزر الأيمن للمنظار' } },
  ];
  const byId = (id) => ITEMS.find(i => i.id === id) || null;

  Object.assign(VR.I18N.STRINGS.en, {
    'shop.title': 'Lemon Shop', 'shop.talk': 'Shop', 'shop.keeper': 'Lemon Shop', 'shop.buy': 'BUY', 'shop.max': 'MAX', 'shop.owned': 'OWNED',
    'shop.level': 'Level {n}/{max}', 'shop.have': 'You have {n}/{max}', 'shop.poor': 'Not enough coins', 'shop.bought': 'Bought: {name}',
    'shop.replace': 'Replaces {name} in your hands', 'shop.close': 'CLOSE', 'shop.fullHp': 'Health is already full',
    'shop.upgrades': 'Upgrades', 'shop.supplies': 'Supplies', 'shop.weapons': 'Weapons', 'shop.shieldOn': 'Starting shield on!',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'shop.title': 'متجر الليمون', 'shop.talk': 'تسوّق', 'shop.keeper': 'متجر الليمون', 'shop.buy': 'اشترِ', 'shop.max': 'الأقصى', 'shop.owned': 'معك',
    'shop.level': 'المستوى {n}/{max}', 'shop.have': 'معك {n}/{max}', 'shop.poor': 'العملات لا تكفي', 'shop.bought': 'اشتريت: {name}',
    'shop.replace': 'يحلّ محلّ {name} الذي بيدك', 'shop.close': 'إغلاق', 'shop.fullHp': 'الصحة ممتلئة',
    'shop.upgrades': 'ترقيات', 'shop.supplies': 'مؤن', 'shop.weapons': 'أسلحة', 'shop.shieldOn': 'درع البداية يعمل!',
  });

  const P = () => VR.Profiles.player();
  const Shop = {
    ITEMS,
    level(id) { return (P().upgrades || {})[id] | 0; },
    count(id) { return ((P().inventory.consumables || {})[id]) | 0; },
    /** price of the next purchase (null = nothing more to buy) */
    price(id) {
      const it = byId(id); if (!it) return null;
      if (it.kind === 'upgrade') { const lv = this.level(id); return lv < it.prices.length ? it.prices[lv] : null; }
      if (it.kind === 'supply') return this.count(id) < it.max ? it.price : null;
      return it.price;
    },
    /** state for the UI: 'buy' | 'max' | 'owned' | 'poor' */
    state(id, combat) {
      const it = byId(id), pr = this.price(id);
      if (pr === null) return 'max';
      if (it.kind === 'weapon' && this.hasWeapon(id, combat)) return 'owned';
      return VR.Wallet.of().canAfford(pr) ? 'buy' : 'poor';
    },
    hasWeapon(id, combat) {
      if (combat) return combat.slots.some(s => s.id === id);
      return (P().inventory.weapons || []).some(w => w.id === id);
    },
    buy(id, { combat = null } = {}) {
      const it = byId(id); if (!it) return 'max';
      const st = this.state(id, combat);
      if (st !== 'buy') return st;
      const price = this.price(id);
      const tx = it.kind === 'upgrade' ? `shop:${id}:${this.level(id) + 1}` : `shop:${id}:${VR.uid()}`;
      if (!VR.Wallet.of().debit(price, tx, 'shop:' + id)) return 'poor';
      const p = P();
      if (it.kind === 'upgrade') { p.upgrades = p.upgrades || {}; p.upgrades[id] = this.level(id) + 1; }
      else if (it.kind === 'supply') { const c = p.inventory.consumables || (p.inventory.consumables = {}); c[id] = (c[id] | 0) + 1; }
      else if (it.kind === 'weapon') {
        if (combat) combat.takeWeapon(id);
        else {
          const W = VR.WeaponKit.WEAPONS[id], ws = p.inventory.weapons || (p.inventory.weapons = []);
          const fresh = { id, mag: W.mag, reserve: Math.round(W.reserve * 0.5) };
          if (ws.length < 2) ws.push(fresh); else ws[p.inventory.weaponSlot | 0] = fresh;
        }
      }
      VR.Profiles.save();
      if (combat) combat.applyUpgrades();
      return 'ok';
    },
    /** course: the magnet lasts longer with the upgrade (never in a race: same rules for both) */
    powerupFactor(type) {
      if (type !== 'magnet' || (VR.game && VR.game.challenge && VR.game.challenge.inRace)) return 1;
      return 1 + 0.5 * this.level('magnet');
    },
    /** course start (solo): use one starting shield, if you have one */
    useStartShield(game) {
      if (game.challenge && game.challenge.inRace) return false;
      const c = P().inventory.consumables || {};
      if (!(c.startShield > 0)) return false;
      c.startShield--; VR.Profiles.save();
      game.powerups.timers.shield = 20;
      setTimeout(() => VR.UI.toast(tr('shop.shieldOn'), 1400), 600);
      return true;
    },

    // ------------------------------------------------------------ UI (a mission-UI modal)
    open(mgr) {
      const render = (note = '', noteKind = '') => {
        const cb = mgr.combat, w = VR.Wallet.of();
        const card = (it) => {
          const st = this.state(it.id, cb), pr = this.price(it.id);
          let sub = '';
          if (it.kind === 'upgrade') sub = tr('shop.level', { n: this.level(it.id), max: it.prices.length });
          else if (it.kind === 'supply') sub = tr('shop.have', { n: this.count(it.id), max: it.max });
          else if (st === 'buy' && cb && cb.slots.length >= 2) sub = tr('shop.replace', { name: L(cb.wdef.name) });
          const btn = st === 'max' ? `<span class="sh-tag">${tr('shop.max')}</span>`
            : st === 'owned' ? `<span class="sh-tag">${tr('shop.owned')}</span>`
            : `<button class="btn small ${st === 'buy' ? 'lemon' : ''} sh-buy" data-id="${it.id}" ${st === 'buy' ? '' : 'disabled'}><span class="coin-ico"></span>${pr}</button>`;
          return `<div class="sh-item ${st}"><span class="sh-ico">${it.icon}</span><span class="sh-txt"><b>${esc(L(it.name))}</b><small>${esc(L(it.desc))}</small>${sub ? `<i>${esc(sub)}</i>` : ''}</span>${btn}</div>`;
        };
        const group = (kind, title) => `<div class="sh-group">${tr(title)}</div>` + ITEMS.filter(i => i.kind === kind).map(card).join('');
        const html = `<div class="sh-head"><h2 class="heading">${tr('shop.title')}</h2><span class="sh-coins"><span class="coin-ico"></span><b id="sh-coins">${w.coins.toLocaleString('en-US')}</b></span></div>
          <div class="sh-note ${noteKind}">${esc(note)}</div>
          <div class="sh-list">${group('upgrade', 'shop.upgrades')}${group('supply', 'shop.supplies')}${group('weapon', 'shop.weapons')}</div>
          <button class="btn" id="sh-close" data-focus>${tr('shop.close')}</button>`;
        const bind = (c) => {
          c.querySelector('#sh-close').addEventListener('click', () => { VR.Audio.play('click'); mgr.ui.close(); });
          c.querySelectorAll('.sh-buy').forEach(b => b.addEventListener('click', () => {
            const it = byId(b.dataset.id), r = this.buy(it.id, { combat: cb });
            if (r === 'ok') { VR.Audio.play('coin'); render(tr('shop.bought', { name: L(it.name) }), 'good'); }
            else { VR.Audio.play('buzz'); render(tr('shop.poor'), 'bad'); }
          }));
        };
        if (mgr.ui.modal === 'shop') { mgr.ui.el.card.innerHTML = html; bind(mgr.ui.el.card); }
        else mgr.ui.open('shop', html, bind);
      };
      render();
    },
  };
  VR.Shop = Shop;

  /* ------------------------------------------------------------------
   * COMPONENT: shopkeeper — the stall in the square
   *   { id, type: 'shopkeeper', at }
   * ---------------------------------------------------------------- */
  function stallModel() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    vb.addColorBox(0, 0, 0.55, 3.0, 1.05, 0.5, 0x6b4526);                 // counter (front = +Z)
    vb.addColorBox(0, 1.05, 0.55, 3.1, 0.08, 0.6, 0x8a5a32);
    for (const x of [-1.45, 1.45]) vb.addColorBox(x, 0, -0.6, 0.15, 2.9, 0.15, 0x5a3a22);   // posts
    for (let i = 0; i < 6; i++) vb.addColorBox(-1.3 + i * 0.52, 2.9, 0.1, 0.52, 0.18, 1.6, i % 2 ? 0xf4f4f4 : 0xf2c230);   // awning
    // the keeper: a lemon-head
    vb.addColorBox(0, 0, -0.3, 0.6, 1.0, 0.36, 0x3f6b3a);
    vb.addColorBox(0, 1.0, -0.3, 0.7, 0.55, 0.4, 0x4f9a3a);
    vb.addColorBox(0, 1.55, -0.3, 0.52, 0.5, 0.5, 0xf2d43a);
    vb.addColorBox(-0.12, 1.78, -0.04, 0.08, 0.08, 0.02, 0x1a1a1a); vb.addColorBox(0.12, 1.78, -0.04, 0.08, 0.08, 0.02, 0x1a1a1a);
    // goods on the counter
    vb.addColorBox(-0.9, 1.13, 0.55, 0.3, 0.25, 0.3, 0xd8463a); vb.addColorBox(0.85, 1.13, 0.55, 0.35, 0.18, 0.3, 0x3f6b3a);
    g.add(vb.build());
    return g;
  }
  MS.Components.shopkeeper = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const m = stallModel(); m.position.copy(pos); m.rotation.y = yaw;
      ctx.scene.add(m);
      m.updateMatrixWorld(true);
      const b = new T.Box3().setFromObject(m);
      ctx.level.solids.push({ min: [b.min.x, 0, b.min.z], max: [b.max.x, 2.0, b.max.z], enabled: true, owner: def.id });
      const sign = VR.WorldText.make({ text: L(def.title || { en: 'Lemon Shop', ar: 'متجر الليمون' }), style: 'sign', size: 0.2, width: 2.4 });
      const f = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      sign.position.copy(pos).addScaledVector(f, 0.92).add(new T.Vector3(0, 3.25, 0)); sign.rotation.y = yaw;
      ctx.scene.add(sign);
      const e = {
        id: def.id, def, obj: m, kind: 'interact',
        hit: b.clone().expandByScalar(0.05),
        prompt: () => ({ verb: tr('shop.talk'), label: tr('shop.keeper') }),
        use: (run) => { VR.Audio.play('click'); Shop.open(ctx.mgr); run.setFlag('visited_shop'); },
        update: () => {}, sync: () => {},
      };
      return e;
    },
  };
})();
