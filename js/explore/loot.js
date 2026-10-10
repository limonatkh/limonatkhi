/* =====================================================================
 * LOOT — what you find exploring (the exploration world, the five sky
 * islands) and the secret ways between places.
 *
 *  VR.Loot  the player's finds, saved in the profile (inventory.loot):
 *     items     { id: count }   materials, keys / artifacts, relics, armour
 *     opened    { '<area>:<id>': true }   chests / pickups already taken
 *     unlocked  { '<portal id>': true }   secret portals already opened
 *   Everything is per player and survives going in and out of a place:
 *   a chest opened once stays open, a unique reward is given once.
 *
 *  Loot in a chest:  { coins: n } · { medkit: n } · { nade: true } ·
 *                    { ammo: true } · { item: id, n } (incl. armour)
 *   coins go to the shared wallet (txId loot:<area>:<chest>), medkits and
 *   grenades to the combat inventory, the rest to VR.Loot.
 *   Weapons lie on the ground with the existing weaponPickup component.
 *   ARMOUR plates: each one adds +10 maximum health for good
 *   (js/combat/encounter.js asks VR.Loot.armorBonus()).
 *
 *  Components
 *   lootChest     { id, pos|at, yaw, style: chest|urn|crate|cache|crystal, loot: [...], needs?: item, hidden? }
 *   lootItem      { id, pos|at, item, n } — one find lying there, glowing (a key, a relic…)
 *   secretPortal  { id, pos|at, yaw, to: area, toAt?: {pos,yaw}, style, name, hint,
 *                   needs?: { items: [...], consume? }, dormant?: style shown before it is opened,
 *                   openOnUse?: opens for good the first time you use it (pull the vines aside),
 *                   openFlag?: opens for good when this area's flag is set (a puzzle beside it),
 *                   scale? }
 *     Before it is opened it looks like part of the place (vines, a dry
 *     fountain stone, a cracked wall…) and only says what it is when you
 *     look closely; with what it needs, E opens it for good; then E goes.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const tr = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const t2 = (en, ar) => ({ en, ar });

  Object.assign(VR.I18N.STRINGS.en, {
    'lt.open': 'Open', 'lt.take': 'Take', 'lt.got': 'Found: {list}', 'lt.empty': 'Empty — you took this already', 'lt.needs': 'Locked. It needs: {item}',
    'lt.coins': '{n} coins', 'lt.medkit': 'Medkit ×{n}', 'lt.nade': 'Impulse grenades', 'lt.ammo': 'Ammo refilled', 'lt.armor': '+10 max health',
    'lt.treasures': 'Treasures', 'lt.none': 'Nothing yet — explore!', 'lt.enter': 'Enter', 'lt.use': 'Use', 'lt.inspect': 'Look',
    'lt.opened': 'Something opens…', 'lt.dest': '{name}', 'lt.portalTo': 'Portal: {name}',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'lt.open': 'افتح', 'lt.take': 'خذ', 'lt.got': 'وجدت: {list}', 'lt.empty': 'فارغ — أخذت ما فيه من قبل', 'lt.needs': 'مقفل. يحتاج: {item}',
    'lt.coins': '{n} عملة', 'lt.medkit': 'حقيبة إسعاف ×{n}', 'lt.nade': 'قنابل دفع', 'lt.ammo': 'امتلأت الذخيرة', 'lt.armor': '+10 للصحة القصوى',
    'lt.treasures': 'الكنوز', 'lt.none': 'لا شيء بعد — استكشف!', 'lt.enter': 'ادخل', 'lt.use': 'استخدم', 'lt.inspect': 'تفحّص',
    'lt.opened': 'شيء ما ينفتح…', 'lt.dest': '{name}', 'lt.portalTo': 'بوابة: {name}',
  });

  /** everything that can be found (name, what kind, colour for its model / icon) */
  const ITEMS = {
    // materials
    lemon_ore:     { kind: 'material', name: t2('Lemon ore', 'خام الليمون'), color: 0xffd23c },
    sky_crystal:   { kind: 'material', name: t2('Sky crystal', 'كريستال السماء'), color: 0x8fd8ff },
    frost_crystal: { kind: 'material', name: t2('Frost crystal', 'كريستال الصقيع'), color: 0xd8f4ff },
    sun_glass:     { kind: 'material', name: t2('Sun glass', 'زجاج الشمس'), color: 0xffa64a },
    void_stone:    { kind: 'material', name: t2('Void stone', 'حجر الفراغ'), color: 0x8a5cff },
    old_coin:      { kind: 'collectible', name: t2('Ancient coin', 'عملة قديمة'), color: 0xd9a90f },
    citadel_sigil: { kind: 'artifact', name: t2('Citadel sigil', 'ختم القلعة'), color: 0xffd23c, desc: t2('One of three. The citadel\'s top chest wants all of them.', 'واحد من ثلاثة. صندوق قمة القلعة يريدها كلها.') },
    // keys / artifacts (open secret ways)
    frost_shard:   { kind: 'artifact', name: t2('Frost shard', 'شظية الصقيع'), color: 0xbfeaff, desc: t2('Cold to the touch. Something in the square wants it.', 'باردة الملمس. شيء ما في الساحة يريدها.') },
    crystal_key:   { kind: 'artifact', name: t2('Crystal key', 'مفتاح الكريستال'), color: 0x9b6bff, desc: t2('A key cut from crystal.', 'مفتاح منحوت من الكريستال.') },
    // the four relics (together they open the Broken Citadel)
    relic_ruins:   { kind: 'relic', name: t2('Relic of the Ruins', 'أثر الأطلال'), color: 0x5fae3a },
    relic_frost:   { kind: 'relic', name: t2('Relic of the Summit', 'أثر القمة'), color: 0xd8f4ff },
    relic_desert:  { kind: 'relic', name: t2('Relic of the Fortress', 'أثر الحصن'), color: 0xe39a6a },
    relic_crystal: { kind: 'relic', name: t2('Relic of the Caverns', 'أثر الكهوف'), color: 0x9b6bff },
    citadel_crown: { kind: 'unique', name: t2('Crown of the Citadel', 'تاج القلعة'), color: 0xffe14a, desc: t2('The unique reward of the Broken Citadel.', 'الجائزة الفريدة للقلعة المكسورة.') },
    // armour (each: +10 max health)
    plate_peak:    { kind: 'armor', name: t2('Peak plate', 'درع القمة'), color: 0x9aa4b0 },
    plate_ruins:   { kind: 'armor', name: t2('Mossy plate', 'درع الطحلب'), color: 0x6a9a4a },
    plate_frost:   { kind: 'armor', name: t2('Ice plate', 'درع الجليد'), color: 0xbfe6ff },
    plate_desert:  { kind: 'armor', name: t2('Sandstone plate', 'درع الحجر الرملي'), color: 0xd9a070 },
    plate_crystal: { kind: 'armor', name: t2('Crystal plate', 'درع الكريستال'), color: 0xa98cff },
    plate_citadel: { kind: 'armor', name: t2('Citadel plate', 'درع القلعة'), color: 0xffd23c },
  };

  const Loot = {
    ITEMS,
    data() {
      const inv = VR.Profiles.player().inventory;
      const d = inv.loot || (inv.loot = {});
      d.items = d.items || {}; d.opened = d.opened || {}; d.unlocked = d.unlocked || {};
      return d;
    },
    count(id) { return this.data().items[id] | 0; },
    has(id, n = 1) { return this.count(id) >= n; },
    add(id, n = 1) { const d = this.data(); d.items[id] = (d.items[id] | 0) + n; VR.Profiles.save(); },
    take(id, n = 1) { const d = this.data(); if ((d.items[id] | 0) < n) return false; d.items[id] -= n; if (!d.items[id]) delete d.items[id]; VR.Profiles.save(); return true; },
    isOpened(key) { return !!this.data().opened[key]; },
    markOpened(key) { this.data().opened[key] = true; VR.Profiles.save(); },
    isUnlocked(id) { return !!this.data().unlocked[id]; },
    unlock(id) { this.data().unlocked[id] = true; VR.Profiles.save(); },
    name(id) { return ITEMS[id] ? L(ITEMS[id].name) : id; },
    /** +10 max health per armour plate found */
    armorBonus() { let n = 0; for (const id in this.data().items) if (ITEMS[id] && ITEMS[id].kind === 'armor') n += this.count(id); return n * 10; },
    /** give a list of loot; returns what to show */
    grant(list, key, mgr) {
      const out = [], cb = mgr && mgr.combat;
      for (const l of list || []) {
        if (l.coins) { VR.Wallet.of().credit(l.coins, 'loot:' + key + ':coins', 'loot'); out.push(tr('lt.coins', { n: l.coins })); }
        if (l.medkit) { const c = VR.Profiles.player().inventory.consumables || (VR.Profiles.player().inventory.consumables = {}); c.medkit = (c.medkit | 0) + l.medkit; out.push(tr('lt.medkit', { n: l.medkit })); }
        if (l.nade) { if (cb) cb.takeWeapon('nade'); else { const c = VR.Profiles.player().inventory.consumables; c.nade = { charges: 2 }; } out.push(tr('lt.nade')); }
        if (l.ammo) { if (cb) cb.refill(); out.push(tr('lt.ammo')); }
        if (l.item) {
          this.add(l.item, l.n || 1);
          const it = ITEMS[l.item];
          out.push((l.n > 1 ? l.n + '× ' : '') + this.name(l.item) + (it && it.kind === 'armor' ? ' (' + tr('lt.armor') + ')' : ''));
          if (it && it.kind === 'armor' && cb && cb.applyUpgrades) cb.applyUpgrades();
        }
      }
      VR.Profiles.save();
      if (cb) cb.setAmmo && cb.setAmmo();
      return out;
    },
    /** the journal's "Treasures" part */
    journalHtml() {
      const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const items = Object.keys(this.data().items).filter(id => ITEMS[id]);
      const body = items.length ? items.map(id => `<span class="lt-chip" style="--c:#${ITEMS[id].color.toString(16).padStart(6, '0')}">${esc(this.name(id))}${this.count(id) > 1 ? ' ×' + this.count(id) : ''}</span>`).join(' ') : esc(tr('lt.none'));
      return `<h3>${esc(tr('lt.treasures'))}</h3><p class="mi-small lt-list">${body}</p>`;
    },
  };
  VR.Loot = Loot;

  // ------------------------------------------------------------------ models
  const own = (m) => { m.userData.own = true; return m; };
  function glowGem(color, s = 0.22) {
    const g = new T.Group();
    const m = new T.Mesh(new T.OctahedronGeometry(s, 0), own(new T.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55 })));
    m.geometry.userData.own = true; g.add(m); g.userData.spin = m;
    return g;
  }
  function container(style) {
    const vb = new VR.VoxelBuilder();
    if (style === 'urn') { vb.addBox(0, 0, 0, 0.6, 0.15, 0.6, 'sandstone'); vb.addBox(0, 0.15, 0, 0.8, 0.55, 0.8, VR.Mat.tinted('terracotta', 0xc8703a)); vb.addBox(0, 0.7, 0, 0.5, 0.18, 0.5, 'sandstone'); }
    else if (style === 'crate') { vb.addBox(0, 0, 0, 0.9, 0.8, 0.9, VR.Mat.tinted('planks', 0x8a6a40)); vb.addBox(0, 0.8, 0, 0.94, 0.06, 0.94, 'iron'); }
    else if (style === 'cache') { vb.addBox(0, 0, 0, 1.0, 0.45, 0.7, 'cobble'); vb.addBox(0, 0.45, 0, 1.04, 0.1, 0.74, 'stone'); }
    else if (style === 'crystal') { vb.addBox(0, 0, 0, 0.9, 0.3, 0.9, 'stone'); }
    const g = new T.Group(); g.add(vb.build());
    if (style === 'crystal') for (const [x, z, h] of [[0, 0, 1.1], [0.22, 0.15, 0.7], [-0.2, -0.12, 0.8]]) {
      const c = new T.Mesh(new T.ConeGeometry(0.16, h, 5), own(new T.MeshLambertMaterial({ color: 0xa98cff, emissive: 0x6a3cff, emissiveIntensity: 0.45 })));
      c.geometry.userData.own = true; c.position.set(x, 0.3 + h / 2, z); g.add(c);
    }
    return g;
  }

  // ------------------------------------------------------------------ lootChest
  MS.Components.lootChest = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const area = ctx.mgr.run.def.id, key = area + ':' + def.id;
      const style = def.style || 'chest';
      const m = style === 'chest' ? VR.MissionModels.chest() : container(style);
      if (style === 'chest' && m.userData.dials) for (const d of m.userData.dials) d.visible = false;
      m.position.copy(pos); m.rotation.y = yaw; ctx.scene.add(m);
      const lid = m.userData.lid;
      const sparkle = glowGem(0xffe14a, 0.07); sparkle.position.set(pos.x, pos.y + 1.1, pos.z); ctx.scene.add(sparkle);
      ctx.level.solids.push({ min: [pos.x - 0.55, pos.y, pos.z - 0.55], max: [pos.x + 0.55, pos.y + 0.62, pos.z + 0.55], enabled: true, owner: def.id });
      let open = Loot.isOpened(key), t = Math.random() * 6, lidK = open ? 1 : 0;
      const needText = () => tr('lt.needs', { item: (def.needsN > 1 ? `${Loot.count(def.needs)}/${def.needsN} ` : '') + Loot.name(def.needs) });
      const e = {
        id: def.id, def, obj: m, kind: 'collect',
        hit: new T.Box3(new T.Vector3(pos.x - 0.75, pos.y, pos.z - 0.75), new T.Vector3(pos.x + 0.75, pos.y + 1.2, pos.z + 0.75)),
        prompt: () => (open ? { verb: tr('lt.inspect'), label: tr('lt.empty'), kindOverride: 'inspect' }
          : def.needs && !Loot.has(def.needs, def.needsN || 1) ? { verb: tr('lt.inspect'), label: needText(), kindOverride: 'inspect' }
          : { verb: tr('lt.open'), label: def.name ? L(def.name) : tr('lt.treasures') }),
        use: () => {
          if (open) { ctx.mgr.ui.caption(tr('lt.empty'), 1.5); return; }
          if (def.needs && !Loot.has(def.needs, def.needsN || 1)) { VR.Audio.play('buzz'); ctx.mgr.ui.caption(needText(), 2.4); return; }
          open = true; Loot.markOpened(key);
          const got = Loot.grant(def.loot, key, ctx.mgr);
          VR.Audio.play('lid'); setTimeout(() => VR.Audio.play('success'), 250);
          ctx.mgr.ui.toast(tr('lt.got', { list: got.join(' · ') }), 3200);
          if (ctx.mgr.lootLog) ctx.mgr.lootLog.push({ id: def.id, got });
        },
        update: (dt) => {
          t += dt;
          if (lid) { lidK += ((open ? 1 : 0) - lidK) * Math.min(1, dt * 6); lid.rotation.x = -lidK * 1.9; }
          sparkle.visible = !open; sparkle.position.y = pos.y + 1.0 + Math.sin(t * 2.4) * 0.08; sparkle.rotation.y = t * 2;
          if (style !== 'chest' && open) m.scale.y = Math.max(0.6, m.scale.y - dt * 2);
        },
        sync: () => {},
      };
      return e;
    },
  };

  // ------------------------------------------------------------------ lootItem
  MS.Components.lootItem = {
    build(def, ctx) {
      const { pos } = MS.resolveAt(ctx.level, def);
      const area = ctx.mgr.run.def.id, key = area + ':' + def.id;
      const it = ITEMS[def.item] || { color: 0xffffff };
      const g = glowGem(it.color, it.kind === 'relic' || it.kind === 'unique' ? 0.3 : 0.2); g.position.copy(pos); ctx.scene.add(g);
      const light = { visible: true };                    // (no real light: the gem glows by itself — lights are costly on phones)
      let taken = Loot.isOpened(key), t = Math.random() * 6;
      g.visible = !taken; light.visible = !taken;
      const e = {
        id: def.id, def, obj: g, kind: 'collect',
        hit: new T.Box3(new T.Vector3(pos.x - 0.6, pos.y - 0.6, pos.z - 0.6), new T.Vector3(pos.x + 0.6, pos.y + 0.6, pos.z + 0.6)),
        prompt: () => (taken ? null : { verb: tr('lt.take'), label: Loot.name(def.item) }),
        use: () => {
          if (taken) return;
          taken = true; Loot.markOpened(key); g.visible = light.visible = false;
          const got = Loot.grant([{ item: def.item, n: def.n || 1 }].concat(def.extra || []), key, ctx.mgr);
          VR.Audio.play('pickup'); VR.Audio.play('success');
          ctx.mgr.ui.toast(tr('lt.got', { list: got.join(' · ') }), 3200);
          if (it.desc) setTimeout(() => ctx.mgr.ui.caption(L(it.desc), 3.5), 600);
          if (ctx.mgr.lootLog) ctx.mgr.lootLog.push({ id: def.id, got });
        },
        update: (dt) => { t += dt; if (!taken) { g.userData.spin.rotation.y = t * 1.8; g.position.y = pos.y + Math.sin(t * 2) * 0.1; } },
        sync: () => {},
      };
      return e;
    },
  };

  // ------------------------------------------------------------------ secretPortal
  const STYLE = {
    vine:    { frame: 'log', glow: 0x6fe04a, dormant: 'vines' },
    ice:     { frame: 'ice', glow: 0xbfeaff, dormant: 'frost' },
    sand:    { frame: 'sandstone', glow: 0xffb04a, dormant: 'wall' },
    crystal: { frame: 'stone', glow: 0xa98cff, dormant: 'crystal' },
    citadel: { frame: 'stone_bricks', glow: 0xffe14a, dormant: 'sockets' },
    cave:    { frame: 'stone', glow: 0x7fe8ff, dormant: null },
    home:    { frame: 'stone_bricks', glow: 0xfff2b0, dormant: null },
  };
  function portalFrame(st) {
    const vb = new VR.VoxelBuilder();
    for (const x of [-1.25, 1.25]) vb.addBox(x, 0, 0, 0.45, 3.2, 0.5, st.frame);
    vb.addBox(0, 3.2, 0, 2.95, 0.45, 0.5, st.frame);
    vb.addBox(0, -0.02, 0, 2.95, 0.1, 1.0, st.frame);
    const g = new T.Group(); g.add(vb.build()); return g;
  }
  function dormantModel(kind, st) {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    if (kind === 'vines') { for (let i = 0; i < 9; i++) vb.addBox(-1.1 + i * 0.27, 0.2 + (i % 3) * 0.3, 0.3, 0.16, 2.6 - (i % 3) * 0.4, 0.08, VR.Mat.tinted('leaves', 0x5f9a3a)); }
    else if (kind === 'frost') { vb.addBox(0, 0, 0, 0.7, 1.2, 0.7, 'ice'); vb.addBox(0, 1.2, 0, 0.3, 0.3, 0.3, 'snow'); }
    else if (kind === 'wall') { vb.addBox(0, 0, 0.1, 2.9, 3.4, 0.35, VR.Mat.tinted('sandstone', 0xd9b27a)); vb.addBox(0, 1.4, 0.3, 0.35, 0.35, 0.04, VR.Mat.tinted('sandstone', 0x9a6a3a)); }
    else if (kind === 'crystal') { vb.addBox(0, 0, 0, 1.0, 0.3, 1.0, 'cobble'); }
    else if (kind === 'sockets') { vb.addBox(0, 0, 0, 1.2, 1.1, 1.2, 'stone_bricks'); for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) vb.addBox(x, 1.1, z, 0.22, 0.06, 0.22, 'iron'); }
    g.add(vb.build());
    if (kind === 'crystal') { const c = glowGem(0x6a5a8a, 0.3); c.position.set(0, 0.7, 0); g.add(c); g.userData.gem = c; }
    if (kind === 'sockets') { g.userData.sockets = []; [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].forEach(([x, z]) => { const s = glowGem(0x555555, 0.09); s.position.set(x, 1.3, z); g.add(s); g.userData.sockets.push(s); }); }
    return g;
  }
  MS.Components.secretPortal = {
    build(def, ctx) {
      const { pos, yaw } = MS.resolveAt(ctx.level, def);
      const st = STYLE[def.style] || STYLE.home, mgr = ctx.mgr;
      const always = !def.needs && !st.dormant;                 // a plain portal (home / the cave) is always open
      const isOpen = () => always || Loot.isUnlocked(def.id);
      const root = new T.Group(); root.position.copy(pos); root.rotation.y = yaw; ctx.scene.add(root);
      if (def.scale) root.scale.setScalar(def.scale);                  // (a low room: a smaller frame)
      const frame = portalFrame(st); root.add(frame);
      const curtainMat = own(new T.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false }));
      curtainMat.toneMapped = false;
      const curtain = new T.Mesh(new T.PlaneGeometry(2.05, 3.15), curtainMat); curtain.geometry.userData.own = true; curtain.position.set(0, 1.62, 0); root.add(curtain);
      const glow = new T.PointLight(st.glow, 5, 7, 2); glow.position.set(0, 1.8, 0.8); root.add(glow);
      const dormant = st.dormant ? dormantModel(st.dormant, st) : null;
      if (dormant) root.add(dormant);
      const f = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      let t = Math.random() * 6;
      const show = () => {
        const o = isOpen();
        frame.visible = curtain.visible = glow.visible = o;
        if (dormant) {
          dormant.visible = !o;
          if (dormant.userData.sockets && def.needs) dormant.userData.sockets.forEach((s, i) => { const id = def.needs.items[i]; const c = id && Loot.has(id) ? ITEMS[id].color : 0x444444; s.userData.spin.material.color.setHex(c); s.userData.spin.material.emissive.setHex(c); });
        }
      };
      const missing = () => (def.needs ? def.needs.items.filter(id => !Loot.has(id)) : []);
      const destName = () => { const d = VR.ADVENTURE.areas[def.to]; return d ? L(d.name) : def.to; };
      const e = {
        id: def.id, def, obj: root, kind: 'interact',
        hit: new T.Box3().setFromCenterAndSize(pos.clone().add(new T.Vector3(0, 1.5, 0)).addScaledVector(f, 0.3), new T.Vector3(Math.abs(f.z) * 2.6 + 1.0, 3.2, Math.abs(f.x) * 2.6 + 1.0)),
        prompt: () => {
          if (isOpen()) return { verb: tr('lt.enter'), label: destName() };
          if (missing().length) return { verb: tr('lt.inspect'), label: L(def.name), kindOverride: 'inspect' };
          return { verb: tr('lt.use'), label: L(def.name) };
        },
        use: (run) => {
          if (!isOpen()) {
            const miss = missing();
            if (miss.length || (!def.needs && !def.openOnUse)) {     // (needs nothing: opened by a flag elsewhere — or just look)
              VR.Audio.play('click');
              mgr.ui.caption(L(def.hint || def.name) + (miss.length ? '  (' + miss.map(id => Loot.name(id)).join(', ') + ')' : ''), 4);
              return;
            }
            if (def.needs && def.needs.consume) for (const id of def.needs.items) Loot.take(id);
            Loot.unlock(def.id); show();
            VR.Audio.play('unlock'); VR.Audio.play('portal');
            mgr.ui.caption(tr('lt.opened'), 2.5);
            return;
          }
          // through: stand in front of it when you come back
          const back = pos.clone().addScaledVector(f, 2.2);
          const here = { area: run.def.id, pos: [+back.x.toFixed(2), +(pos.y + 0.05).toFixed(2), +back.z.toFixed(2)], yaw: +(yaw).toFixed(3) };
          mgr.game.modes.travel(def.to, def.toAt || null, here);
        },
        update: (dt, run) => {
          t += dt; curtainMat.opacity = 0.5 + Math.sin(t * 2.4) * 0.14; if (dormant && dormant.userData.gem) dormant.userData.gem.userData.spin.rotation.y = t;
          // opened by a puzzle here (its flag): for good
          if (def.openFlag && !isOpen() && run && run.has(def.openFlag)) { Loot.unlock(def.id); show(); VR.Audio.play('portal'); mgr.ui.caption(tr('lt.opened'), 2.5); }
        },
        sync: () => show(),
      };
      show();
      return e;
    },
  };
  /** open a secret portal from elsewhere (a puzzle, a lever…) */
  Loot.openPortal = (id) => Loot.unlock(id);
})();
