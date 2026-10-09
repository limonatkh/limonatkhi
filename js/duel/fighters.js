/* =====================================================================
 * AI FIGHTERS — "Human player vs AI fighter" on top of the arena's
 * existing combat (js/duel/duel.js + js/duel/bots.js): the same arena,
 * hit boxes, weapons, damage, rounds, kill feed and buy screen. Only the
 * opponent is new: one of 10 fighters, each with its own
 *
 *   body       look (accessories + colour), health, speed
 *   weapons    from the arena kit (js/duel/fightkit.js)
 *   ability    a module from ABILITIES (cooldown, duration, range, damage,
 *              movement / status effect, vfx, sfx) — add a new fighter with
 *              a new ability without touching the combat
 *   brain      behaviour priorities (BRAINS): when to approach, keep
 *              distance, flank, retreat, and when to use the ability
 *
 * FAIR PLAY (the AI follows the player's rules):
 *   - it only knows where you are when it SEES you (line of sight, and in
 *     front of it) or HEARS you (your gunshots); otherwise it goes to where
 *     it last saw / heard you, then searches
 *   - reaction time ≥ 0.25 s, aim error that grows when you move, limited
 *     turn speed; it reads only what a person can see (where you look,
 *     whether you are reloading)
 *   - every ability has a real cooldown; nothing hits through walls
 *
 * Runs only on your own device (single player): VR.DuelBots calls
 * Fighters.update / hurt / render when its bots are fighters.
 * ===================================================================== */
(function () {
  const T = THREE;
  const FK = () => VR.FightKit, WK = () => VR.WeaponKit;
  const WALK = () => VR.CONFIG.FP.SPEED_UNITS * VR.CONFIG.FP.UNIT;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const L = (v) => VR.L(v);

  /* ------------------------------------------------------------------
   * ABILITIES (modular): data + use(f, ctx) + update(f, dt, ctx)
   *   f = the fighter (bot record), ctx = { sys, tgt, sees, dist, players }
   * ---------------------------------------------------------------- */
  const ABILITIES = {
    dash: { elem: 'electric', name: { en: 'Dash', ar: 'الاندفاع' }, cooldown: 3.2, duration: 0.24, range: 6, damage: 0, movement: 'burst', status: null, vfx: 'trail', sfx: 'slide',
      use(f, ctx, dir) { f.fx.dash = { dir: dir.clone().setY(0).normalize(), t: this.duration, speed: this.range / this.duration }; vfx(ctx.sys, 'launch', f, this, { pos: f.pos.clone().setY(0.9), dir }); VR.Audio.play(this.sfx); } },
    flash: { elem: 'magic', name: { en: 'Flash', ar: 'الوميض' }, cooldown: 5.5, duration: 0, range: 8, damage: 0, movement: 'teleport', status: null, vfx: 'flash', sfx: 'portal',
      use(f, ctx, to) { vfx(ctx.sys, 'end', f, this, { pos: f.pos.clone().setY(0.9) }); f.pos.set(to.x, f.pos.y, to.z); vfx(ctx.sys, 'impact', f, this, { pos: f.pos.clone().setY(0.9) }); VR.Audio.play(this.sfx); } },
    shield: { elem: 'energy', name: { en: 'Heavy Shield', ar: 'الدرع الثقيل' }, cooldown: 9, duration: 3, range: 0, damage: 0, movement: null, status: { dmgTaken: 0.35 }, vfx: 'bubble', sfx: 'shieldBreak',
      use(f, ctx) { f.fx.shieldT = this.duration; f.body.shield.visible = true; vfx(ctx.sys, 'charge', f, this, { pos: f.pos.clone().setY(1) }); VR.Audio.play('powerup'); } },
    energy: { elem: 'fire', name: { en: 'Energy Shot', ar: 'الطلقة الطاقية' }, cooldown: 0.9, charges: 4, recharge: 1.6, duration: 0, range: 40, damage: 22, speed: 30, movement: null, status: null, vfx: 'orb', sfx: 'sniperFar', color: 0xff9a3a,
      use(f, ctx, dir) { ctx.sys.shoot(f, this, dir, 'energy'); } },
    bomb: { elem: 'blast', name: { en: 'Bomb', ar: 'القنبلة' }, cooldown: 3.4, duration: 1.1, range: 22, damage: 48, radius: 3.3, movement: null, status: null, vfx: 'zone', sfx: 'throw',
      use(f, ctx, at) { ctx.sys.bomb(f, this, at); } },
    heal: { elem: 'nature', name: { en: 'Self Heal', ar: 'العلاج الذاتي' }, cooldown: 14, duration: 1.4, range: 0, damage: -45, movement: 'root', status: null, vfx: 'sparkles', sfx: 'gem',
      use(f, ctx) { f.fx.healT = this.duration; f.body.healRing.visible = true; vfx(ctx.sys, 'area', f, this, { pos: f.pos.clone(), radius: 1.2 }); VR.Audio.play('gem'); } },
    freeze: { elem: 'ice', name: { en: 'Freeze Blast', ar: 'الطلقة المجمِّدة' }, cooldown: 5.5, duration: 2.0, range: 30, damage: 8, speed: 24, movement: null, status: { slow: 0.5 }, vfx: 'orb', sfx: 'scope', color: 0x8fe6ff,
      use(f, ctx, dir) { ctx.sys.shoot(f, this, dir, 'freeze'); } },
    rage: { elem: 'fire', name: { en: 'Rage', ar: 'الغضب' }, cooldown: 999, duration: 7, range: 0, damage: 0, movement: 'fast', status: { speed: 1.45, dmg: 1.4, rate: 0.75 }, vfx: 'aura', sfx: 'crash',
      use(f, ctx) { f.fx.rageT = this.duration; f.fx.raged = true; f.body.aura.visible = true; vfx(ctx.sys, 'charge', f, this, { pos: f.pos.clone().setY(1) }); VR.Audio.play('crash'); } },
    decoy: { elem: 'shadow', name: { en: 'Decoy', ar: 'النسخة الوهمية' }, cooldown: 9, duration: 5, range: 0, damage: 0, movement: null, status: null, vfx: 'clone', sfx: 'portal',
      use(f, ctx) { ctx.sys.decoy(f, this, ctx); } },
    strike: { elem: 'shadow', name: { en: 'Shadow Strike', ar: 'ضربة الظل' }, cooldown: 6, duration: 0.3, range: 11, damage: 62, movement: 'burst', status: null, vfx: 'trail', sfx: 'knife',
      use(f, ctx, dir) { f.fx.strike = { dir: dir.clone().setY(0).normalize(), t: this.duration, speed: Math.max(10, (ctx.dist - 1.4) / this.duration), hit: false }; vfx(ctx.sys, 'launch', f, this, { pos: f.pos.clone().setY(0.8), dir }); VR.Audio.play('slide'); } },
    // passive: it starts 3x bigger and half as fast; every hit makes it 30 % smaller and twice as fast
    // (down to a tiny, very fast fighter) — and the smaller it is, the less its shots hurt:
    // damage × (size / start size)^dmgPow, so each hit cuts its damage more than the one before
    shrink: { elem: 'poison', name: { en: 'Shrink', ar: 'التقلّص' }, cooldown: 0, duration: 0, range: 0, damage: 0, movement: 'passive', status: { factor: 0.7, speedUp: 2, minScale: 0.24, maxSpeed: 5.5, startScale: 3, startSpeed: 0.5, dmgPow: 1.6 }, vfx: 'shrink', sfx: 'pickup', color: 0x7cdc3a, passive: true,
      use() {} },
  };

  /**
   * An ability's visuals go through the feedback layer's one interface (charge / launch / trail / area /
   * impact / end) with the ability's element; without it, the plain arena effects.
   */
  function vfx(sys, stage, f, A, o) {
    const fb = sys.mgr.fb;
    if (fb) return fb.ability(stage, Object.assign({ elem: A.elem, color: A.color || (f.f && f.f.color) }, o));
    const fx = sys.mgr.fx, col = A.color || (f.f && f.f.color) || 0xffffff;
    if (stage === 'impact' || stage === 'launch') fx.flash(o.pos, col);
    fx.puff(o.pos, col, stage === 'trail' ? 2 : 10);
  }

  /* ------------------------------------------------------------------
   * THE 10 FIGHTERS
   * aim: react (s, ≥ .25), err (rad), turn (rad/s), fireMul (× weapon delay), head (chance)
   * look: band (head), chest, extra accessory id
   * ---------------------------------------------------------------- */
  const t = (en, ar) => ({ en, ar });
  const FIGHTERS = {
    dasher: { name: t('DASHER', 'داشر'), title: t('Speed Fighter', 'مقاتل السرعة'), ability: 'dash', stars: 2, color: 0x4ae0ff, char: 0,
      hp: 90, speed: 1.3, weapons: ['smg'], range: [2.5, 7], strafe: 1, aim: { react: 0.34, err: 0.04, turn: 8, fireMul: 1.15, head: 0.12 },
      desc: t('Fast and aggressive. Uses dashes to close distance and escape.', 'سريع وهجومي. يندفع ليقترب منك ثم يهرب.'),
      strong: t('Speed and dodging', 'السرعة والمراوغة'), weak: t('Weak once the dash is spent or read', 'ضعيف إذا توقعت اندفاعه أو انتهى'), look: { band: 0x4ae0ff, extra: 'scarf' } },
    flash: { name: t('FLASH', 'فلاش'), title: t('Blink Fighter', 'مقاتل الوميض'), ability: 'flash', stars: 3, color: 0xd59bff, char: 1,
      hp: 95, speed: 1.05, weapons: ['shotgun', 'pistol'], range: [2, 6], strafe: 0.7, aim: { react: 0.32, err: 0.035, turn: 9, fireMul: 1.1, head: 0.15 },
      desc: t('Blinks a few metres to appear beside or behind you, strikes, then leaves.', 'ينتقل بومضة قصيرة ليظهر بجانبك أو خلفك، يضرب ثم يختفي.'),
      strong: t('Surprise and repositioning', 'المفاجأة وتغيير المكان'), weak: t('Long cooldown after a blink', 'ينتظر طويلًا بعد كل وميض'), look: { band: 0xd59bff, extra: 'bolt' } },
    tank: { name: t('TANK', 'تانك'), title: t('Heavy Fighter', 'المقاتل الثقيل'), ability: 'shield', stars: 2, color: 0x8a96a8, char: 1,
      hp: 180, speed: 0.62, weapons: ['lmg'], range: [3, 12], strafe: 0.15, aim: { react: 0.42, err: 0.04, turn: 4, fireMul: 1.1, head: 0.08 },
      desc: t('Slow but very tough. Keeps walking at you behind a heavy shield.', 'بطيء لكنه قوي جدًا. يتقدم نحوك باستمرار خلف درعه الثقيل.'),
      strong: t('High health and defence', 'صحة عالية ودفاع قوي'), weak: t('Very slow, easy to dodge and flank', 'بطيء جدًا وسهل المراوغة والالتفاف'), look: { band: 0x8a96a8, extra: 'armor' } },
    blaster: { name: t('BLASTER', 'بلاستر'), title: t('Long-range Fighter', 'المقاتل بعيد المدى'), ability: 'energy', stars: 3, color: 0xff9a3a, char: 0,
      hp: 85, speed: 1.1, weapons: ['pistol'], range: [13, 24], strafe: 0.8, aim: { react: 0.36, err: 0.03, turn: 6, fireMul: 1.2, head: 0.1 },
      desc: t('Keeps away and fires energy blasts across the arena. Runs when you get close.', 'يبقى بعيدًا ويطلق طلقات طاقة عبر الساحة، ويهرب إذا اقتربت.'),
      strong: t('Controls the distance', 'السيطرة على المسافة'), weak: t('Very weak up close', 'ضعيف جدًا من قريب'), look: { band: 0xff9a3a, extra: 'visor' } },
    bomber: { name: t('BOMBER', 'بومبر'), title: t('Zone Fighter', 'مقاتل المنطقة'), ability: 'bomb', stars: 3, color: 0xff5a3a, char: 1,
      hp: 100, speed: 0.95, weapons: ['revolver'], range: [9, 16], strafe: 0.5, aim: { react: 0.4, err: 0.04, turn: 5.5, fireMul: 1.2, head: 0.1 },
      desc: t('Lobs bombs where you are going. The red circle shows where it will blow.', 'يرمي قنابل حيث تتجه. الدائرة الحمراء تُريك مكان الانفجار.'),
      strong: t('Controls the arena space', 'التحكم في مساحة الساحة'), weak: t('Must guess where you will be', 'يحتاج أن يتوقع مكانك'), look: { band: 0xff5a3a, extra: 'pack' } },
    healer: { name: t('HEALER', 'هيلر'), title: t('Sustain Fighter', 'المقاتل المعالِج'), ability: 'heal', stars: 2, color: 0x5fdc5f, char: 0,
      hp: 100, speed: 1.0, weapons: ['smg'], range: [6, 12], strafe: 0.8, aim: { react: 0.38, err: 0.04, turn: 6, fireMul: 1.15, head: 0.12 },
      desc: t('Hits and backs off. When hurt it hides and heals itself — catch it then.', 'يضرب ويبتعد. إذا تأذّى يختبئ ويعالج نفسه — اهجم عليه حينها.'),
      strong: t('Comes back after taking damage', 'يعود للقتال بعد تلقي الضرر'), weak: t('Stands still and exposed while healing', 'يقف مكشوفًا أثناء العلاج'), look: { band: 0x5fdc5f, extra: 'cross' } },
    freezer: { name: t('FREEZER', 'فريزر'), title: t('Control Fighter', 'مقاتل التحكم'), ability: 'freeze', stars: 3, color: 0x8fe6ff, char: 1,
      hp: 95, speed: 1.0, weapons: ['shotgun'], range: [6, 12], strafe: 0.6, aim: { react: 0.36, err: 0.035, turn: 6.5, fireMul: 1.1, head: 0.12 },
      desc: t('Slows you with an icy blast, then rushes in with the shotgun.', 'يبطئك بطلقة جليدية ثم يندفع إليك بالبندقية.'),
      strong: t('Controls your movement', 'السيطرة على حركتك'), weak: t('Weak when the blast misses', 'ضعيف إذا أخطأت طلقته'), look: { band: 0x8fe6ff, extra: 'ice' } },
    berserker: { name: t('BERSERKER', 'بيرسيركر'), title: t('Rage Fighter', 'المقاتل الغاضب'), ability: 'rage', stars: 3, color: 0xd8302a, char: 0,
      hp: 115, speed: 1.0, weapons: ['shotgun'], range: [2, 6], strafe: 0.4, aim: { react: 0.36, err: 0.04, turn: 7, fireMul: 1.1, head: 0.12 },
      desc: t('Normal at first. Hurt badly, it goes into a rage: faster and harder-hitting.', 'عادي في البداية. إذا تأذّى كثيرًا يغضب: أسرع وضرباته أقوى.'),
      strong: t('Deadly at the end of a fight', 'خطير جدًا في نهاية المعركة'), weak: t('Predictable and reckless in rage', 'يصبح متوقعًا ومتهورًا وهو غاضب'), look: { band: 0xd8302a, extra: 'horns' } },
    trickster: { name: t('TRICKSTER', 'تريكستر'), title: t('Deceiver', 'المقاتل المخادع'), ability: 'decoy', stars: 4, color: 0xb26bff, char: 1,
      hp: 90, speed: 1.15, weapons: ['smg', 'pistol'], range: [5, 11], strafe: 1, aim: { react: 0.34, err: 0.035, turn: 7, fireMul: 1.15, head: 0.14 },
      desc: t('Sends out a fake copy of itself and attacks from another side.', 'يُطلق نسخة وهمية من نفسه ويهاجم من جهة أخرى.'),
      strong: t('Deception and distraction', 'الخداع والتشتيت'), weak: t('The copy never shoots — spot it', 'النسخة لا تطلق أبدًا — اكتشفها'), look: { band: 0xb26bff, extra: 'mask' } },
    ninja: { name: t('NINJA', 'نينجا'), title: t('Complete Fighter', 'المقاتل المتكامل'), ability: 'strike', stars: 5, color: 0x2a2a34, char: 0,
      hp: 100, speed: 1.15, weapons: ['rifle'], range: [8, 15], strafe: 0.9, aim: { react: 0.3, err: 0.028, turn: 8.5, fireMul: 1.05, head: 0.18 },
      desc: t('Fast, patient and balanced. Waits for your mistakes, then strikes from the shadows.', 'سريع وصبور ومتوازن. ينتظر أخطاءك ثم يضرب من الظل.'),
      strong: t('Balanced in everything', 'متوازن في كل شيء'), weak: t('No huge edge like the specialists', 'لا يملك تفوقًا كبيرًا مثل المتخصصين'), look: { band: 0x15151c, extra: 'tails' } },
    shrinker: { name: t('SHRINKER', 'المتقلّص'), title: t('Shrinking Fighter', 'المقاتل المتقلّص'), ability: 'shrink', stars: 4, color: 0x7cdc3a, char: 0,
      hp: 130, speed: 1.0, weapons: ['smg'], range: [3, 8], strafe: 1, dmgMul: 0.45, aim: { react: 0.34, err: 0.045, turn: 9, fireMul: 1.0, head: 0.08 },
      desc: t('Starts 3× bigger and half as fast. Every hit makes it 30% smaller and twice as fast — and the smaller it gets, the weaker its shots, faster and faster.', 'يبدأ أكبر ٣ أضعاف وأبطأ بالنص. كل ما ياكل إصابة يصغر ٣٠٪ ويصير أسرع الضعف — وكل ما يصغر يضعف ضربه أكثر فأكثر.'),
      strong: t('Harder to hit with every hit', 'كل ما تضربه يصير أصعب تصيبه'), weak: t('Low damage; hit it hard early', 'ضربه ضعيف؛ اضربه بقوة من البداية'), look: { band: 0x7cdc3a, extra: 'leaf' }, fx: { death: 'dust', arms: 'fast', element: 'poison' } },
  };
  const ORDER = ['dasher', 'flash', 'tank', 'blaster', 'bomber', 'healer', 'freezer', 'berserker', 'trickster', 'ninja', 'shrinker'];

  /**
   * LEVELS: every fighter at four levels (its numbers above are "medium").
   *   err / react / turn / fireMul / head scale the aim, cd the ability cooldown,
   *   hp its health, speed its movement, reward the coins for beating it.
   */
  const LEVELS = {
    normal:     { wind: 0.4, err: 1.9, react: 0.3, turn: 0.6, fireMul: 1.45, head: 0.4, cd: 1.5, hp: 0.85, speed: 0.9, reward: 0.6 },
    medium:     { wind: 0.7, err: 1, react: 0, turn: 1, fireMul: 1, head: 1, cd: 1, hp: 1, speed: 1, reward: 1 },
    hard:       { wind: 0.85, err: 0.6, react: -0.06, turn: 1.4, fireMul: 0.88, head: 1.6, cd: 0.8, hp: 1.15, speed: 1.06, reward: 1.6 },
    impossible: { wind: 0.97, err: 0.3, react: -0.12, turn: 2.2, fireMul: 0.78, head: 2.6, cd: 0.6, hp: 1.3, speed: 1.12, reward: 2.5 },
  };
  const LEVEL_ORDER = ['normal', 'medium', 'hard', 'impossible'];
  /** "f_dasher+tank@hard" ↔ { ids: ['dasher', 'tank'], level: 'hard' } */
  function parseKey(key) {
    if (typeof key !== 'string' || !key.startsWith('f_')) return null;
    const [list, lv] = key.slice(2).split('@');
    const ids = list.split('+').filter(id => FIGHTERS[id]).slice(0, 3);
    return ids.length ? { ids, level: LEVELS[lv] ? lv : 'medium' } : null;
  }
  const makeKey = (ids, level) => 'f_' + ids.join('+') + '@' + (LEVELS[level] ? level : 'medium');

  /* ------------------------------------------------------------------
   * LOOK: accessories on the arena body (so each fighter is recognisable)
   * ---------------------------------------------------------------- */
  function boxMesh(w, h, d, color, x, y, z, opts = {}) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial(Object.assign({ color }, opts)));
    m.material.userData.own = true; m.geometry.userData.own = true; m.position.set(x, y, z); return m;
  }
  function dress(body, F) {
    const g = body.g, lk = F.look || {};
    const head = new T.Group(); head.position.set(0, 0, 0); g.add(head);
    head.add(boxMesh(0.66, 0.1, 0.66, lk.band, 0, 1.78, 0));                        // headband in the fighter's colour
    head.add(boxMesh(0.42, 0.42, 0.06, lk.band, 0, 1.05, -0.24));                   // chest plate (front is -Z)
    const x = lk.extra;
    if (x === 'scarf') head.add(boxMesh(0.12, 0.12, 0.5, lk.band, 0.2, 1.5, 0.4));
    if (x === 'bolt') { head.add(boxMesh(0.08, 0.3, 0.08, 0xffe14a, 0, 2.02, 0)); head.add(boxMesh(0.2, 0.08, 0.08, 0xffe14a, 0.06, 2.12, 0)); }
    if (x === 'armor') { head.add(boxMesh(0.95, 0.22, 0.7, 0x6b7586, 0, 1.36, 0)); head.add(boxMesh(0.7, 0.5, 0.75, 0x6b7586, 0, 0.75, 0)); }
    if (x === 'visor') head.add(boxMesh(0.6, 0.1, 0.08, 0xff9a3a, 0, 1.62, -0.32, { emissive: 0x803000 }));
    if (x === 'pack') { head.add(boxMesh(0.42, 0.5, 0.25, 0x3a3a3a, 0, 0.95, 0.32)); head.add(boxMesh(0.16, 0.16, 0.16, 0xff3a2a, 0, 1.5, 0.32, { emissive: 0x801010 })); }
    if (x === 'cross') { head.add(boxMesh(0.08, 0.26, 0.04, 0xffffff, 0, 1.05, -0.28)); head.add(boxMesh(0.26, 0.08, 0.04, 0xffffff, 0, 1.05, -0.28)); }
    if (x === 'ice') { for (const s of [-1, 1]) head.add(boxMesh(0.1, 0.24, 0.1, 0xbff4ff, s * 0.38, 1.4, 0, { emissive: 0x2a6070 })); }
    if (x === 'horns') { for (const s of [-1, 1]) head.add(boxMesh(0.09, 0.26, 0.09, 0xf1e6c8, s * 0.27, 1.95, 0)); }
    if (x === 'mask') head.add(boxMesh(0.62, 0.14, 0.06, 0x1a1a1a, 0, 1.6, -0.33));
    if (x === 'leaf') { head.add(boxMesh(0.08, 0.2, 0.08, 0x3f8a2b, 0, 2.0, 0)); head.add(boxMesh(0.22, 0.06, 0.14, 0x7cdc3a, 0.08, 2.1, 0)); }
    if (x === 'tails') head.add(boxMesh(0.08, 0.08, 0.55, 0x15151c, 0.1, 1.76, 0.42));
    // ability visuals (hidden until used)
    const bubble = new T.Mesh(new T.SphereGeometry(1.1, 14, 10), new T.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.28, depthWrite: false }));
    bubble.material.userData.own = true; bubble.geometry.userData.own = true; bubble.position.y = 1; bubble.visible = false; g.add(bubble); body.shield = bubble;
    const ring = new T.Mesh(new T.RingGeometry(0.7, 0.95, 24), new T.MeshBasicMaterial({ color: 0x5fdc5f, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
    ring.material.userData.own = true; ring.geometry.userData.own = true; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false; g.add(ring); body.healRing = ring;
    const aura = new T.PointLight(0xff3020, 6, 4, 2); aura.position.y = 1.2; aura.visible = false; g.add(aura); body.aura = aura;
    if (F.hp > 150) body.rig.root.scale.set(1.12, 1.06, 1.12);                     // the tank is bigger
  }
  /** a small picture of a fighter (for the selection cards), rendered once */
  const portraits = {};
  function portrait(id) {
    if (portraits[id]) return portraits[id];
    try {
      const F = FIGHTERS[id];
      // drawn with the game's own renderer into an off-screen target (no second WebGL context)
      const r = VR.game.renderer, W = 120, H = 140;
      const rt = Fighters._rt || (Fighters._rt = new T.WebGLRenderTarget(W, H, { samples: 4 }));
      rt.texture.colorSpace = T.SRGBColorSpace;
      const sc = new T.Scene(), cam = new T.PerspectiveCamera(32, 120 / 140, 0.1, 30);
      sc.add(new T.HemisphereLight(0xffffff, 0x6a6050, 2.6)); const d = new T.DirectionalLight(0xffffff, 1.4); d.position.set(1, 2, 2); sc.add(d);
      const body = VR.DuelBody.build(VR.CHARACTERS[F.char % VR.CHARACTERS.length].id, 'white', F.color, null);
      dress(body, F); body.pos.set(0, 0, 0); body.yaw = Math.PI - 0.5; VR.DuelBody.setGun(body, F.weapons[0]); VR.DuelBody.animate(body, 0);
      sc.add(body.g); cam.position.set(0, 1.25, 5.2); cam.lookAt(0, 1.0, 0);
      const prevRT = r.getRenderTarget(), prevClear = r.getClearAlpha(), prevCol = r.getClearColor(new T.Color());
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
      const buf = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      r.setRenderTarget(prevRT); r.setClearColor(prevCol, prevClear);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx2 = cv.getContext('2d'), img = ctx2.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // flip rows
      ctx2.putImageData(img, 0, 0);
      portraits[id] = cv.toDataURL('image/png');
      sc.traverse(o => { if (o.geometry && o.geometry.userData && o.geometry.userData.own) o.geometry.dispose(); });
    } catch (e) { portraits[id] = ''; }
    return portraits[id];
  }

  /* ------------------------------------------------------------------
   * BRAINS: behaviour priorities per fighter.
   *   s = { f, tgt, sees, dist, hpK, underAim, tReloading, abilityReady }
   *   returns { move: 'approach'|'retreat'|'hold'|'flank'|'circle', range?, ability?: args | true }
   * ---------------------------------------------------------------- */
  const away = (f, tgt) => new T.Vector3(f.pos.x - tgt.pos.x, 0, f.pos.z - tgt.pos.z).normalize();
  const toward = (f, tgt) => new T.Vector3(tgt.pos.x - f.pos.x, 0, tgt.pos.z - f.pos.z).normalize();
  const BRAINS = {
    dasher(s) {
      const { f, tgt, sees, dist } = s;
      if (s.hpK < 0.3 && sees) return { move: 'retreat', ability: s.ready && dist < 8 ? away(f, tgt) : null };          // low: pull back
      if (sees && s.underAim && s.ready && dist < 14) {                                              // being aimed at: dodge sideways
        const side = toward(f, tgt); return { move: 'circle', ability: new T.Vector3(side.z, 0, -side.x).multiplyScalar(f.strafe) };
      }
      if (sees && dist > 9 && s.ready) return { move: 'approach', ability: toward(f, tgt) };           // far: dash in
      if (sees && f.mem.hitT > 0 && dist < 5 && s.ready) return { move: 'retreat', ability: away(f, tgt) };   // hit & run
      return { move: 'approach' };
    },
    flash(s) {
      const { f, tgt, sees, dist } = s;
      if (sees && s.ready && dist > 4 && dist < 11) {                                                 // close enough: blink beside / behind you
        const spot = s.sys.flankSpot(f, tgt, ABILITIES.flash.range);
        if (spot) return { move: 'approach', ability: spot };
      }
      if (f.mem.engageT > 3 && sees) return { move: 'retreat' };                                      // no long fights
      return { move: sees ? 'approach' : 'approach' };
    },
    tank(s) {
      const { f, sees } = s;
      if (s.ready && (f.mem.recentDmg > 18 || (sees && s.underAim && s.dist < 12))) return { move: 'approach', ability: true };
      return { move: 'approach' };                                                                    // always pushes in
    },
    blaster(s) {
      const { f, tgt, sees, dist } = s;
      if (sees && dist < 12) return { move: 'retreat', ability: s.charges > 1 && s.aligned ? s.aimDir : null };   // too close: back off (firing)
      if (sees && dist <= 30 && s.charges > 0 && s.aligned) return { move: 'circle', ability: s.aimDir };
      return { move: dist > 22 ? 'approach' : 'circle' };
    },
    bomber(s) {
      const { f, tgt, sees, dist } = s;
      // lead the throw a little: where you are going (what a person would do)
      if (s.ready && (sees || f.lastSeen) && dist < ABILITIES.bomb.range) {
        const p = sees ? tgt.pos.clone().addScaledVector(tgt.vel || new T.Vector3(), rnd(0.4, 0.9)) : f.lastSeen.clone();
        p.x += rnd(-1, 1); p.z += rnd(-1, 1);
        return { move: dist < 8 ? 'retreat' : 'circle', ability: p };
      }
      return { move: dist < 8 ? 'retreat' : dist > 16 ? 'approach' : 'circle' };
    },
    healer(s) {
      const { f, sees, hpK } = s;
      if (f.fx.healT > 0) return { move: 'hold' };
      if (hpK < 0.5) {
        if (!sees && f.mem.unseenT > 0.8 && s.ready) return { move: 'hold', ability: true };          // safe now: heal
        return { move: 'retreat' };                                                                    // get away first
      }
      if (f.mem.engageT > 2.5 && sees) return { move: 'retreat' };                                    // hit, then step back
      return { move: 'approach' };
    },
    freezer(s) {
      const { f, sees, dist } = s;
      if (f.mem.frozeT > 0) return { move: 'approach', range: [1.5, 4] };                              // you are slow: rush in
      if (sees && s.ready && dist < 22 && s.aligned) return { move: 'circle', ability: s.aimDir };
      return { move: dist > 12 ? 'approach' : 'circle' };
    },
    berserker(s) {
      const { f, hpK } = s;
      if (!f.fx.raged && hpK < 0.45 && s.ready) return { move: 'approach', ability: true };            // rage at low health
      if (f.fx.rageT > 0) return { move: 'approach', range: [1, 3] };                                  // reckless
      return { move: 'approach' };
    },
    trickster(s) {
      const { f, sees, dist } = s;
      if (sees && s.ready && (dist < 12 || f.mem.recentDmg > 10)) return { move: 'flank', ability: true };
      if (f.mem.flankT > 0) return { move: 'flank' };
      return { move: sees ? 'circle' : 'approach' };
    },
    shrinker(s) {
      const { f, sees, dist } = s;
      // the smaller (and faster) it gets, the closer and more erratic it circles you
      const k = f.shrink || 1;
      if (sees && s.underAim && f.mem.dodgeCd <= 0) { f.mem.dodgeCd = 0.4 + k * 0.6; f.strafe *= -1; }
      return { move: dist > 9 ? 'approach' : 'circle', range: k < 0.6 ? [1.5, 4] : [3, 8] };
    },
    ninja(s) {
      const { f, tgt, sees, dist } = s;
      if (f.fx.strike) return { move: 'hold' };
      if (f.mem.retreatT > 0) return { move: 'retreat' };
      // strike when you can't answer well: reloading, switching, or very close; or when in reach and it's ready
      const opening = s.tReloading || dist < 5 || (f.mem.seenT > 1.5 && Math.random() < 0.02);
      if (sees && s.ready && dist > 2.5 && dist < ABILITIES.strike.range && opening) return { move: 'hold', ability: toward(f, tgt) };
      if (sees && s.underAim && f.mem.dodgeCd <= 0) { f.mem.dodgeCd = 0.9; f.strafe *= -1; }           // sidestep your aim
      if (s.hpK < 0.35 && sees) return { move: 'retreat' };
      return { move: 'circle' };
    },
  };

  /* ------------------------------------------------------------------
   * THE SYSTEM (one per arena: DuelBots owns it when its bots are fighters)
   * ---------------------------------------------------------------- */
  class Fighters {
    constructor(bots) { this.bots = bots; this.mgr = bots.mgr; this.projectiles = []; this.zones = []; this.decoys = []; this.events = []; }
    get list() { return this.bots.list; }
    /** turn a bot record into a fighter */
    equip(b, id, level = 'medium') {
      const F = FIGHTERS[id], LV = LEVELS[level] || LEVELS.medium;
      b.f = F; b.fid = id; b.level = level; b.maxHp = Math.round(F.hp * LV.hp);
      // this fighter at this level: its own aim, cooldowns and speed
      b.aim = { react: Math.max(0.22, F.aim.react + LV.react), err: F.aim.err * LV.err, turn: F.aim.turn * LV.turn, fireMul: F.aim.fireMul * LV.fireMul, head: Math.min(0.6, F.aim.head * LV.head) };
      b.cdMul = LV.cd; b.spd = F.speed * LV.speed; b.windSkill = LV.wind;
      b.name = L(F.name) + (level !== 'medium' ? ' · ' + VR.t('bot.diff.' + level) : '');
      dress(b.body, F);
      b.lo = new (FK().Loadout)({ weapons: F.weapons, nades: false });
      b.fx = {}; b.mem = {}; b.cd = 0; b.charges = ABILITIES[F.ability].charges || 0;
      b.strafe = Math.random() < 0.5 ? -1 : 1;
    }
    resetRound() {
      for (const p of this.projectiles) this.mgr.scene.remove(p.mesh);
      for (const z of this.zones) this.mgr.scene.remove(z.mesh);
      for (const d of this.decoys) this.mgr.scene.remove(d.body.g);
      this.projectiles = []; this.zones = []; this.decoys = []; this.events = [];
      for (const b of this.list) {
        if (!b.f) continue;
        const S0 = b.f.ability === 'shrink' ? ABILITIES.shrink.status : null;
        b.shrink = S0 ? S0.startScale : 1; b.spdMul = S0 ? S0.startSpeed : 1;
        if (b.body && b.body.rig) { if (S0) b.body.rig.root.scale.setScalar(b.shrink); else if (b.f.hp > 150) b.body.rig.root.scale.set(1.12, 1.06, 1.12); else b.body.rig.root.scale.setScalar(1); }
      b.hp = b.maxHp; b.fx = {}; b.cd = 1.5; b.charges = ABILITIES[b.f.ability].charges || 0; b.rechargeT = 0;
        b.mem = { hitT: 0, engageT: 0, unseenT: 9, recentDmg: 0, frozeT: 0, flankT: 0, retreatT: 0, dodgeCd: 0, seenT: 0, aimT: 0 };
        b.body.shield.visible = false; b.body.healRing.visible = false; b.body.aura.visible = false;
      }
    }
    log(b, type, extra) { this.events.push(Object.assign({ t: performance.now(), f: b.fid, type }, extra || {})); if (this.events.length > 400) this.events.shift(); }

    /** damage taken: shield, heal interrupted, memory */
    hurt(b, dmg) {
      let d = dmg;
      if (b.f.ability === 'shrink' && b.alive && b.hp - dmg > 0) this.shrink(b);
      if (b.fx.shieldT > 0) d *= ABILITIES.shield.status.dmgTaken;
      if (b.fx.healT > 0) { b.fx.healT = 0; b.body.healRing.visible = false; this.log(b, 'healBroken'); }
      b.mem.recentDmg = (b.mem.recentDmg || 0) + d;
      b.mem.unseenT = 0;
      return d;
    }

    /** SHRINKER: how hard its shots hit at its size now (1 at the start, falling faster than the size) */
    shrinkDmg(b) {
      if (!b.f || b.f.ability !== 'shrink') return 1;
      const S = ABILITIES.shrink.status;
      return Math.pow((b.shrink || S.startScale) / S.startScale, S.dmgPow);
    }
    /** SHRINKER: smaller (hit boxes too) and faster after every hit */
    shrink(b) {
      const S = ABILITIES.shrink.status;
      const k0 = b.shrink || 1;
      b.shrink = Math.max(S.minScale, k0 * S.factor);
      b.spdMul = Math.min(S.maxSpeed, (b.spdMul || 1) * S.speedUp);
      if (b.shrink !== k0) {
        b.body.rig.root.scale.setScalar(b.shrink);
        vfx(this, 'impact', b, ABILITIES.shrink, { pos: b.pos.clone().setY(b.pos.y + 0.8 * b.shrink) });
      }
      this.log(b, 'shrunk', { k: +b.shrink.toFixed(2), speed: +b.spdMul.toFixed(2) });
    }
    // ---- perception (fair): sees = line of sight AND in front of it (or very close); hears gunshots (bots.hear)
    perceive(b, players, dt) {
      const eye = new T.Vector3(b.pos.x, b.pos.y + 1.55 * (b.shrink || 1), b.pos.z);
      let best = null, bd = Infinity;
      for (const p of players) {
        if (!p.alive) continue;
        const chest = new T.Vector3(p.pos.x, p.pos.y + (p.low ? 0.6 : 1.15), p.pos.z);
        const to = chest.clone().sub(eye), d = to.length();
        const ang = Math.abs(wrap(Math.atan2(-to.x, -to.z) - b.yaw));
        const inView = ang < 1.35 || d < 3;                                    // ~155° field of view
        if (inView && this.bots.los(eye, chest) && d < bd) { bd = d; best = p; }
      }
      return best;
    }

    update(dt, players) {
      const sys = this;
      for (const b of this.list) {
        b.lo.update(dt, VR.DUEL.NADE_RECHARGE);
        if (!b.alive || !b.f || b.held) continue;                      // a hostage does nothing
        const F = b.f, A = ABILITIES[F.ability], m = b.mem, fx = b.fx;
        b.cd = Math.max(0, b.cd - dt);
        for (const k of ['hitT', 'frozeT', 'flankT', 'retreatT', 'dodgeCd']) m[k] = Math.max(0, (m[k] || 0) - dt);
        m.recentDmg = Math.max(0, (m.recentDmg || 0) - dt * 12);
        if (A.charges) { if (b.charges < A.charges) { b.rechargeT = (b.rechargeT || 0) + dt; if (b.rechargeT >= A.recharge) { b.rechargeT = 0; b.charges++; } } }
        // timed effects
        if (fx.shieldT > 0) { fx.shieldT -= dt; if (fx.shieldT <= 0) b.body.shield.visible = false; }
        if (fx.rageT > 0) { fx.rageT -= dt; b.body.aura.intensity = 4 + Math.sin(performance.now() / 80) * 2; if (fx.rageT <= 0) b.body.aura.visible = false; }
        if (fx.healT > 0) {
          const k = Math.min(fx.healT, dt) / A.duration;
          b.hp = Math.min(b.maxHp, b.hp + (-A.damage) * k); fx.healT -= dt;
          b.body.healRing.rotation.z += dt * 3;
          if (Math.random() < 0.3) vfx(this, 'trail', b, A, { pos: b.pos.clone().add(new T.Vector3(rnd(-0.4, 0.4), rnd(0.4, 1.8), rnd(-0.4, 0.4))) });
          if (fx.healT <= 0) { b.body.healRing.visible = false; vfx(this, 'end', b, A, { pos: b.pos.clone().setY(1) }); this.log(b, 'healed', { hp: Math.round(b.hp) }); }
        }
        // perception: what it sees, what it remembers
        const tgt = this.perceive(b, players, dt);
        const sees = !!tgt;
        if (sees) { m.seenT += dt; m.unseenT = 0; b.lastSeen = tgt.pos.clone(); m.engageT += dt; } else { m.seenT = 0; m.unseenT += dt; m.engageT = Math.max(0, m.engageT - dt * 2); }
        const ref = tgt || players.find(p => p.alive);
        const goal = sees ? tgt.pos : this.bots.goalFor(b);
        const dist = sees ? Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z) : Math.hypot(goal.x - b.pos.x, goal.z - b.pos.z);
        const eye = new T.Vector3(b.pos.x, b.pos.y + 1.55 * (b.shrink || 1), b.pos.z);
        // where the player looks (a person can see that): is it aiming at me?
        let underAim = false;
        if (sees && tgt.yaw !== undefined) {
          const look = new T.Vector3(-Math.sin(tgt.yaw), 0, -Math.cos(tgt.yaw)), me = new T.Vector3(b.pos.x - tgt.pos.x, 0, b.pos.z - tgt.pos.z).normalize();
          underAim = look.dot(me) > 0.985;
          m.aimT = underAim ? m.aimT + dt : 0;
          underAim = m.aimT > 0.3;                                         // noticed after a human-like moment
        }
        // aim (same limits as the other bots)
        b.errT = (b.errT || 0) - dt;
        if (b.errT <= 0) { b.errT = rnd(0.25, 0.5); b.headPick = Math.random() < b.aim.head; b.aimErr.set(gauss(), gauss()); }
        const chest = sees ? new T.Vector3(tgt.pos.x, tgt.pos.y + (tgt.low ? 0.6 : 1.15), tgt.pos.z) : null;
        const aimPt = sees ? (b.headPick ? new T.Vector3(tgt.pos.x, tgt.pos.y + (tgt.low ? 0.75 : 1.5), tgt.pos.z) : chest) : null;
        const to = sees ? aimPt.clone().sub(eye) : new T.Vector3(goal.x - b.pos.x, 0, goal.z - b.pos.z);
        const wantYaw = Math.atan2(-to.x, -to.z), wantPitch = sees ? Math.atan2(to.y, Math.hypot(to.x, to.z)) : 0;
        const turn = b.aim.turn * dt;
        b.yaw += Math.max(-turn, Math.min(turn, wrap(wantYaw - b.yaw)));
        b.pitch += Math.max(-turn, Math.min(turn, wantPitch - b.pitch));
        const aligned = sees && Math.abs(wrap(wantYaw - b.yaw)) < 0.1 && m.seenT >= b.aim.react;
        const aimDir = sees ? new T.Vector3(-Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), -Math.cos(b.yaw) * Math.cos(b.pitch)) : null;
        // the brain decides
        const rooted = fx.healT > 0;
        // an ability is ready when its cooldown (and charges) allow it — and, against you, only after
        // the same reaction time as its gun (no instant reflexes)
        const ready = b.cd <= 0 && (!A.charges || b.charges > 0) && (!sees || m.seenT >= b.aim.react);
        const plan = (fx.dash || fx.strike) ? { move: 'hold' } : BRAINS[b.fid]({
          f: b, tgt: sees ? tgt : { pos: goal, vel: new T.Vector3() }, sees, dist, hpK: b.hp / b.maxHp, underAim, tReloading: !!(sees && tgt.reloading),
          ready, aligned, aimDir, charges: b.charges, sys,
        });
        if (plan.ability && !rooted) this.useAbility(b, A, plan.ability, { sys, tgt, sees, dist, players });
        // fire the weapon (rage: faster and harder)
        const rage = fx.rageT > 0 ? ABILITIES.rage.status : null;
        if (aligned && !rooted && !fx.dash && !fx.strike && (!b.lo.def.melee || dist <= b.lo.def.range - 0.2)) {
          const w = b.lo.shoot();
          if (w) { b.lo.coolT *= b.aim.fireMul * (rage ? rage.rate : 1); b.dmgMul = (rage ? rage.dmg : 1) * (F.dmgMul || 1) * this.shrinkDmg(b); this.bots.fire(b, eye, aimPt, tgt, w, players); m.hitT = 0.6; }
        }
        // movement
        this.moveFighter(b, dt, plan, sees ? tgt : null, goal, dist, rage, rooted);
        // dash / strike in progress
        this.burst(b, dt, players);
      }
      this.updateProjectiles(dt, players);
      this.updateZones(dt, players);
      this.updateDecoys(dt, players);
    }

    useAbility(b, A, arg, ctx) {
      if (b.cd > 0 || (A.charges && b.charges < 1)) return false;
      if (b.f.ability === 'rage' && b.fx.raged) return false;
      const dir = arg instanceof T.Vector3 ? arg : null;
      A.use(b, ctx, dir || arg);
      b.cd = A.cooldown * (b.cdMul || 1); if (A.charges) b.charges--;
      this.log(b, 'ability', { a: b.f.ability });
      return true;
    }
    /** a free spot `r` m from the target, beside / behind where it looks; null if none */
    flankSpot(b, tgt, r) {
      const look = tgt.yaw !== undefined ? tgt.yaw : 0;
      const tries = [Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2, -Math.PI / 2, Math.PI];
      for (const a of tries) {
        const ang = look + a, x = tgt.pos.x - Math.sin(ang) * 3.2, z = tgt.pos.z - Math.cos(ang) * 3.2;
        if (Math.hypot(x - b.pos.x, z - b.pos.z) > r) continue;               // short blinks only (≤ range)
        if (!this.free(x, z)) continue;
        const from = new T.Vector3(x, 1.5, z), at = new T.Vector3(tgt.pos.x, 1.3, tgt.pos.z);
        if (!this.bots.los(from, at)) continue;
        return new T.Vector3(x, 0, z);
      }
      return null;
    }
    free(x, z) {
      const B = this.mgr.level.extras.bounds;
      if (Math.abs(x) > B.W - 0.9 || Math.abs(z) > B.LEN - 0.9) return false;
      return !this.mgr.level.solids.some(s => s.max[1] > 0.4 && s.min[1] < 1.9 && x + 0.45 > s.min[0] && x - 0.45 < s.max[0] && z + 0.45 > s.min[2] && z - 0.45 < s.max[2]);
    }

    moveFighter(b, dt, plan, tgt, goal, dist, rage, rooted) {
      if (rooted || plan.move === 'hold' || b.fx.dash || b.fx.strike) { b.vel.set(0, 0, 0); return; }
      const F = b.f, m = b.mem;
      const range = plan.range || b.rangeOverride || F.range;
      const dir = new T.Vector3(goal.x - b.pos.x, 0, goal.z - b.pos.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
      let fwd = 0, side = 0;
      const mv = tgt ? plan.move : 'approach';
      if (mv === 'approach') fwd = !tgt || dist > range[1] ? 1 : dist < range[0] ? -0.6 : 0.3;
      else if (mv === 'retreat') fwd = -1;
      else if (mv === 'circle') fwd = dist > range[1] ? 0.7 : dist < range[0] ? -0.7 : 0;
      else if (mv === 'flank') { fwd = 0.6; side = 1; }
      b.strafeT = (b.strafeT || 0) - dt;
      if (b.strafeT <= 0) { b.strafeT = rnd(0.5, 1.3) / Math.max(0.3, F.strafe); b.strafe *= -1; }
      if (tgt && mv !== 'flank') side = F.strafe * b.strafe * (mv === 'circle' ? 1 : 0.6);
      if (mv === 'flank') side *= b.strafe;
      const slowK = 1;
      const sp = WALK() * (b.spd || F.speed) * (b.spdMul || 1) * (rage ? rage.speed : 1) * slowK;
      let mx = dir.x * fwd + dir.z * side, mz = dir.z * fwd - dir.x * side;
      if (b.detourT > 0) { b.detourT -= dt; mx = dir.z * b.strafe + dir.x * 0.3; mz = -dir.x * b.strafe + dir.z * 0.3; }
      const l = Math.hypot(mx, mz);
      if (l < 0.01) { b.vel.set(0, 0, 0); return; }
      mx *= sp / l; mz *= sp / l;
      const got = this.bots.move(b, mx * dt, mz * dt);
      b.stuckT = got < sp * dt * 0.3 ? (b.stuckT || 0) + dt : 0;
      if (b.stuckT > 0.35) { b.stuckT = 0; b.detourT = 0.9; b.strafe *= -1; }
      b.vel.set(mx, 0, mz);
    }
    /** a dash / a shadow strike in progress */
    burst(b, dt, players) {
      const d = b.fx.dash || b.fx.strike; if (!d) return;
      const step = Math.min(dt, d.t);
      this.bots.move(b, d.dir.x * d.speed * step, d.dir.z * d.speed * step);
      const AB = ABILITIES[b.fx.strike ? 'strike' : 'dash'];
      if (this.mgr.fb) this.mgr.fb.dashTrail(b.pos.clone(), 'f_' + b.fid, AB.color || b.f.color);
      if (Math.random() < 0.6) vfx(this, 'trail', b, AB, { pos: b.pos.clone().setY(0.7) });
      d.t -= step;
      if (b.fx.strike && !d.hit) {
        // reached you: the strike (a knife hit, only if really in reach and in sight)
        for (const p of players) {
          if (!p.alive) continue;
          const dist = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
          if (dist < 2.3 && this.bots.los(new T.Vector3(b.pos.x, 1.4, b.pos.z), new T.Vector3(p.pos.x, 1.2, p.pos.z))) {
            d.hit = true; this.mgr.botHitPlayer(p.id, ABILITIES.strike.damage, false, b.i, 'strike'); VR.Audio.play('knife'); this.log(b, 'strikeHit');
            d.t = Math.min(d.t, 0.02);
          }
        }
      }
      if (d.t <= 0) {
        if (b.fx.strike) { b.mem.retreatT = 1.6; b.strafe *= -1; this.log(b, 'strikeEnd', { hit: d.hit }); }
        b.fx.dash = null; b.fx.strike = null;
      }
    }

    // ---- projectiles (energy, freeze): real flying shots, blocked by walls, dodgeable
    shoot(b, A, dir, kind) {
      const err = (b.aim || b.f.aim).err * 1.4;
      const d = dir.clone().add(new T.Vector3(gauss() * err, gauss() * err * 0.6, gauss() * err)).normalize();
      const mesh = new T.Mesh(new T.SphereGeometry(kind === 'freeze' ? 0.22 : 0.18, 10, 8), new T.MeshBasicMaterial({ color: A.color }));
      mesh.material.userData.own = true; mesh.geometry.userData.own = true; mesh.material.toneMapped = false;
      const p = new T.Vector3(b.pos.x - Math.sin(b.yaw) * 0.5, b.pos.y + 1.45, b.pos.z - Math.cos(b.yaw) * 0.5);
      mesh.position.copy(p); this.mgr.scene.add(mesh);
      this.projectiles.push({ b, A, kind, pos: p, vel: d.multiplyScalar(A.speed), life: A.range / A.speed, mesh });
      vfx(this, 'launch', b, A, { pos: p.clone(), dir: d.clone().normalize() }); VR.Audio.play(A.sfx);
      this.bots.mgr.markShot(b.pos);
      this.log(b, 'shot', { kind });
    }
    updateProjectiles(dt, players) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        const wind = this.mgr.windNow && this.mgr.windNow();
        if (wind) { pr.vel.x += wind.x * 0.5 * dt; pr.vel.z += wind.z * 0.5 * dt; }     // slow orbs drift with the wind
        const step = pr.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
        let done = false;
        // walls
        const wd = this.mgr.wallDist(pr.pos, dir, len);
        // players (body box grown by the orb)
        for (const p of players) {
          if (!p.alive || done) continue;
          const bx = WK().boxesAt(p.pos, p.low, p.scale || 1), box = bx.body.clone().union(bx.head).expandByScalar(0.18);
          const ray = new T.Ray(pr.pos, dir), hit = ray.intersectBox(box, new T.Vector3());
          if (hit && hit.distanceTo(pr.pos) <= Math.min(len, wd)) {
            done = true;
            this.mgr.botHitPlayer(p.id, pr.A.damage, false, pr.b.i, pr.kind);
            if (pr.kind === 'freeze' && p.id === this.mgr.match.me && !this.mgr.hostage.held) { this.mgr.statusSlow(pr.A.status.slow, pr.A.duration); pr.b.mem.frozeT = 2.6; this.log(pr.b, 'froze'); }
            else this.log(pr.b, 'shotHit', { kind: pr.kind });
            vfx(this, 'impact', pr.b, pr.A, { pos: hit.clone(), me: p.id === this.mgr.match.me });
          }
        }
        if (!done && wd < len) { done = true; vfx(this, 'impact', pr.b, pr.A, { pos: pr.pos.clone().addScaledVector(dir, wd) }); }
        pr.pos.add(step); pr.mesh.position.copy(pr.pos); pr.life -= dt;
        pr.trailT = (pr.trailT || 0) - dt;
        if (!done && pr.trailT <= 0) { pr.trailT = 0.03; vfx(this, 'trail', pr.b, pr.A, { pos: pr.pos.clone() }); }
        if (done || pr.life <= 0) { this.mgr.scene.remove(pr.mesh); this.projectiles.splice(i, 1); }
      }
    }

    // ---- bombs: a red circle shows where, then the blast (area damage, walls block it)
    bomb(b, A, at) {
      const R = A.radius;
      const mesh = new T.Mesh(new T.RingGeometry(0.1, R, 32), new T.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide }));
      mesh.material.userData.own = true; mesh.geometry.userData.own = true; mesh.rotation.x = -Math.PI / 2; mesh.position.set(at.x, 0.07, at.z);
      const edge = new T.Mesh(new T.RingGeometry(R - 0.12, R, 32), new T.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide }));
      edge.material.userData.own = true; edge.geometry.userData.own = true; mesh.add(edge); edge.position.z = 0.01;
      this.mgr.scene.add(mesh);
      this.zones.push({ b, A, at: new T.Vector3(at.x, 0, at.z), t: A.duration, mesh });
      vfx(this, 'area', b, A, { pos: new T.Vector3(at.x, 0, at.z), radius: R });
      VR.Audio.play('throw'); this.log(b, 'bomb');
    }
    updateZones(dt, players) {
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i]; z.t -= dt;
        z.mesh.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(z.t * 14));
        if (z.t > 0) continue;
        this.mgr.scene.remove(z.mesh); this.zones.splice(i, 1);
        const me = this.mgr.match && players.some(p => p.id === this.mgr.match.me && p.alive && Math.hypot(p.pos.x - z.at.x, p.pos.z - z.at.z) < z.A.radius);
        if (this.mgr.fb) vfx(this, 'impact', z.b, z.A, { pos: z.at.clone().setY(0.5), radius: z.A.radius, big: true, me });
        else { this.mgr.fx.wave(z.at.clone().setY(0.4)); this.mgr.fx.puff(z.at.clone().setY(0.6), 0xff6a2a, 18); }
        VR.Audio.play('crash');
        for (const p of players) {
          if (!p.alive) continue;
          const d = Math.hypot(p.pos.x - z.at.x, p.pos.z - z.at.z);
          if (d > z.A.radius) continue;
          if (!this.bots.los(new T.Vector3(z.at.x, 0.6, z.at.z), new T.Vector3(p.pos.x, 0.9, p.pos.z))) continue;
          this.mgr.botHitPlayer(p.id, z.A.damage * (1 - 0.5 * d / z.A.radius), false, z.b.i, 'bomb');
          this.log(z.b, 'bombHit');
        }
      }
    }

    // ---- decoys: a copy that walks and strafes but never shoots; any hit pops it
    decoy(b, A, ctx) {
      const F = b.f, body = VR.DuelBody.build(VR.CHARACTERS[F.char % VR.CHARACTERS.length].id, 'grey', VR.DuelArena.COLORS.g, null);
      dress(body, F); this.mgr.scene.add(body.g);
      body.pos.copy(b.pos); body.yaw = b.yaw; VR.DuelBody.setGun(body, b.lo.id);
      const toT = ctx.tgt ? new T.Vector3(ctx.tgt.pos.x - b.pos.x, 0, ctx.tgt.pos.z - b.pos.z).normalize() : new T.Vector3(0, 0, 1);
      const side = Math.random() < 0.5 ? -1 : 1;
      this.decoys.push({ body, owner: b, t: A.duration, dir: new T.Vector3(toT.x + toT.z * side * 0.8, 0, toT.z - toT.x * side * 0.8).normalize(), alive: true, pos: body.pos, i: -1 });
      b.strafe = -side; b.mem.flankT = 2.5;                                       // the real one goes the other way
      vfx(this, 'impact', b, A, { pos: b.pos.clone().setY(1) }); VR.Audio.play('portal'); this.log(b, 'decoy');
    }
    updateDecoys(dt) {
      for (let i = this.decoys.length - 1; i >= 0; i--) {
        const d = this.decoys[i]; d.t -= dt;
        if (d.alive && d.t > 0) {
          const sp = WALK() * (d.owner.spd || d.owner.f.speed);
          const fake = { pos: d.pos };
          const moved = this.bots.move(fake, d.dir.x * sp * dt, d.dir.z * sp * dt);
          if (moved < sp * dt * 0.3) d.dir.set(-d.dir.z, 0, d.dir.x);
          d.body.yaw = Math.atan2(-d.dir.x, -d.dir.z);
          VR.DuelBody.animate(d.body, dt);
        }
        if (!d.alive || d.t <= 0) {
          vfx(this, 'end', d.owner, ABILITIES.decoy, { pos: d.pos.clone().setY(1) });
          this.mgr.scene.remove(d.body.g); this.decoys.splice(i, 1);
        }
      }
    }
    /** shots can hit decoys too (they pop) */
    decoyTargets() { return this.decoys.filter(d => d.alive).map(d => { const bx = WK().boxesAt(d.pos, false); return { parts: { head: bx.head, body: bx.body }, ref: d }; }); }
    popDecoy(d) { if (!d.alive) return; d.alive = false; this.log(d.owner, 'decoyPopped'); this.mgr.ui.feed(VR.t('ft.decoyPopped'), 'good'); }

    /** status line for the HUD: name · ability ready / seconds */
    status() {
      const one = (b) => {
        const A = ABILITIES[b.f.ability];
        if (!b.alive) return `${L(b.f.name)} ☠`;
        if (A.passive) return `${L(b.f.name)} ${Math.round((b.shrink || 1) * 100)}%`;
        const st = A.charges ? `${b.charges}/${A.charges}` : b.f.ability === 'rage' && b.fx.raged ? (b.fx.rageT > 0 ? '🔥' : '—') : b.cd > 0 ? Math.ceil(b.cd) + 's' : '✓';
        return this.list.length > 1 ? `${L(b.f.name)} ${st}` : `${L(b.f.name)} · ${L(A.name)} ${st}`;
      };
      return this.list.filter(b => b.f).map(one).join('  |  ');
    }
  }

  Object.assign(VR.I18N.STRINGS.en, {
    'ft.mode': 'AI fighters', 'ft.modeSub': '10 opponents, each with its own ability and style', 'ft.pick': 'Choose your opponent', 'ft.fight': 'FIGHT!',
    'ft.level': 'Level', 'ft.playAs': 'I play as', 'ft.asMe': 'Myself', 'ft.count': '{n}/3 opponents chosen — click to add, click again to remove', 'ft.ability': 'Ability', 'ft.diff': 'Difficulty', 'ft.strong': 'Strength', 'ft.weak': 'Weakness', 'ft.decoyPopped': 'That was a decoy!', 'ft.slowed': '❄ SLOWED',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'ft.mode': 'مقاتلو الذكاء', 'ft.modeSub': '10 خصوم، لكلٍّ قدرته وأسلوبه', 'ft.pick': 'اختر خصمك', 'ft.fight': 'قاتل!',
    'ft.level': 'المستوى', 'ft.playAs': 'ألعب بشخصية', 'ft.asMe': 'أنا (بلا قدرة)', 'ft.count': 'اخترت {n}/3 خصوم — اضغط لتضيف، واضغط مرة ثانية لتشيل', 'ft.ability': 'القدرة', 'ft.diff': 'الصعوبة', 'ft.strong': 'القوة', 'ft.weak': 'الضعف', 'ft.decoyPopped': 'كانت نسخة وهمية!', 'ft.slowed': '❄ مُبطَّأ',
  });

  Fighters.FIGHTERS = FIGHTERS; Fighters.ABILITIES = ABILITIES; Fighters.BRAINS = BRAINS; Fighters.ORDER = ORDER;
  Fighters.portrait = portrait; Fighters.dress = dress;
  /** coins for beating a fighter */
  /** coins for beating one fighter (at a level) or a team of them */
  Fighters.reward = (id, level = 'medium') => Math.round(40 * ((FIGHTERS[id] && FIGHTERS[id].stars) || 1) * (LEVELS[level] || LEVELS.medium).reward);
  Fighters.teamReward = (ids, level) => ids.reduce((s, id) => s + Fighters.reward(id, level), 0);
  Fighters.LEVELS = LEVELS; Fighters.LEVEL_ORDER = LEVEL_ORDER; Fighters.parseKey = parseKey; Fighters.makeKey = makeKey;
  VR.Fighters = Fighters;
})();
