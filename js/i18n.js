/* =====================================================================
 * LANGUAGE — Arabic / English.
 * ---------------------------------------------------------------------
 *  VR.t('key', {vars})   interface strings from the tables below
 *  VR.L(value)           mission data fields: a plain string, or
 *                        { en: '…', ar: '…' } (falls back to English)
 *  VR.I18N.set('ar'|'en') switches everything live and remembers it.
 *
 * Static HTML uses data-i18n="key" (text) and data-i18n-aria="key"
 * (aria-label). Code that builds UI calls VR.t() when it renders, and
 * listens with VR.I18N.onChange(fn) to re-render.
 *
 * TO ADD A LANGUAGE: add a table to STRINGS with the same keys, add its
 * name to NAMES, and give mission data a field for it.
 * ===================================================================== */
(function () {
  const STRINGS = {
    en: {
      'app.subtitle': 'Endless Block Runner',
      'loading': 'Placing blocks…',
      'menu.best': 'Best', 'menu.play': 'PLAY', 'menu.character': 'CHARACTER', 'menu.settings': 'SETTINGS',
      'menu.hint': '<kbd>A</kbd><kbd>D</kbd> or arrows to dodge sideways · <kbd>W</kbd>/<kbd>Space</kbd> jump · <kbd>S</kbd> slide · swipe on mobile',
      'char.prev': 'Previous character', 'char.next': 'Next character', 'char.select': 'SELECT',
      'char.hero.name': 'Hero', 'char.hero.tag': 'Your original character',
      'settings.title': 'Settings', 'settings.sfx': 'Sound effects', 'settings.music': 'Music', 'settings.quality': 'Graphics',
      'settings.fps': 'Show FPS', 'settings.lang': 'Language', 'settings.back': 'BACK',
      'menu.missions': 'MISSIONS', 'ml.title': 'Missions', 'ml.sub': 'Replay a mission you have reached. New missions open by completing the one before (or at gates along the mountain route).',
      'ml.play': 'PLAY', 'ml.done': 'Completed · best {t}', 'ml.open': 'Ready to play', 'ml.locked': 'Locked: complete «{name}» first', 'ml.back': 'BACK',
      'settings.full': 'Fullscreen', 'fs.enter': 'Fullscreen', 'fs.exit': 'Exit fullscreen', 'fs.na': 'N/A',
      'fs.ios': 'On iPhone: tap Share, then "Add to Home Screen", and open the game from there to play without the browser bars.',
      'on': 'ON', 'off': 'OFF', 'high': 'HIGH', 'low': 'LOW',
      'hud.score': 'Score', 'hud.distance': 'Distance', 'hud.coins': 'Coins', 'hud.pause': 'Pause', 'unit.m': 'm',
      'pause.title': 'Paused', 'pause.resume': 'RESUME', 'pause.settings': 'SETTINGS', 'pause.menu': 'MAIN MENU',
      'go.title': 'Game Over', 'go.newBest': 'NEW BEST!', 'go.final': 'Final score', 'go.distance': 'Distance', 'go.coins': 'Coins',
      'go.best': 'Best score', 'go.again': 'PLAY AGAIN', 'go.menu': 'MAIN MENU',
      'toast.multiplier': 'Multiplier x{n}', 'toast.stumble': 'You tripped! Careful: the next hit ends the run', 'toast.shieldBroken': 'Shield broken!',
      'toast.lemon': '+5 Lemon', 'toast.gateAhead': 'Mission gate ahead!', 'toast.go': 'Go!', 'toast.reward': '+{score} score · +{coins} coins',
      'pu.magnet': 'Magnet', 'pu.shield': 'Shield', 'pu.boost': 'Boost', 'pu.double': '2x Coins', 'pu.invincible': 'Star',
      'biome.grassland': 'Alpine Meadows', 'biome.forest': 'Pine Heights', 'biome.desert': 'Red Canyons', 'biome.snow': 'Snowy Summits', 'biome.village': 'Lemon Terraces', 'biome.mountains': 'Rocky Peaks',
      'gate.sign': 'MISSION {n}',
      // ---- missions: HUD
      'mi.missionOf': 'Mission {n} of {total}', 'mi.journal': 'Journal', 'mi.burst': 'Lemon Burst', 'mi.lookHint': 'Click to look around',
      'mi.objectiveDone': 'Objective complete', 'mi.useKey': 'Use',
      'mi.k.move': 'Move', 'mi.k.look': 'Look', 'mi.k.jump': 'Jump', 'mi.k.crouch': 'Crouch / slide', 'mi.k.interact': 'Interact',
      'mi.k.burst': 'Lemon Burst', 'mi.k.journal': 'Journal', 'mi.k.pause': 'Pause',
      'mi.key.wasd': 'W A S D', 'mi.key.mouse': 'Mouse', 'mi.key.space': 'Space', 'mi.key.left': 'Left side', 'mi.key.right': 'Right side',
      'mi.t.jump': 'Jump', 'mi.t.crouch': 'Crouch', 'mi.t.use': 'Use', 'mi.t.burst': 'Burst',
      // ---- missions: screens
      'mi.objective': 'Objective', 'mi.start': 'START MISSION', 'mi.close': 'CLOSE',
      'mi.lock.try': 'TRY THE LOCK', 'mi.lock.keys': 'Keys: ← → pick a dial · ↑ ↓ turn it · Enter tries',
      'mi.lock.default': 'Turn the dials, then try the lock.', 'mi.lock.next': 'Next symbol on dial {n}', 'mi.lock.prev': 'Previous symbol on dial {n}',
      'mi.lock.ok': 'Click! The lock opens.', 'mi.lock.bad': 'The lock does not move.',
      'mi.j.title': 'Journal · {name}', 'mi.j.objective': 'Objective', 'mi.j.bonus': 'Bonus', 'mi.j.items': 'Items', 'mi.j.noItems': 'Nothing carried yet.',
      'mi.j.hints': 'Hints', 'mi.j.showHint': 'SHOW A HINT ({n} left)', 'mi.j.clues': 'Clues found ({n})', 'mi.j.noClues': 'Read writing in the world (E) and it is copied here.',
      'mi.p.title': 'Paused', 'mi.p.resume': 'RESUME', 'mi.p.sens': 'Look sensitivity', 'mi.p.fov': 'Field of view',
      'mi.p.restart': 'RESTART MISSION', 'mi.p.leave': 'LEAVE MISSION', 'mi.p.leaveNote': 'Leaving returns you to your run without a reward. You can find this mission again at a later gate.',
      'mi.p.quit': 'QUIT TO MAIN MENU',
      'mi.r.title': 'Mission complete', 'mi.r.time': 'Time', 'mi.r.clues': 'Clues found', 'mi.r.mistakes': 'Mistakes', 'mi.r.hints': 'Hints used',
      'mi.r.rewards': 'Rewards', 'mi.r.score': 'score', 'mi.r.items': 'Items: {list}', 'mi.r.return': 'RETURN TO THE RUN',
      'mi.f.title': 'Time\'s up', 'mi.f.text': 'The mission failed. Try again, or go back to your run (no reward).', 'mi.f.retry': 'RETRY',
      'rw.complete': 'Mission complete', 'rw.replay': 'Mission replayed', 'rw.none': 'Already completed: no reward',
      'ach.first_mission': 'First Gate: complete a mission', 'ach.all_missions': 'Lemon Detective: complete all missions',
      'ach.flawless': 'Flawless: complete a mission without a mistake', 'ach.electrician': 'Electrician: restore the power at the docks',
      // ---- missions: prompts, captions, toasts
      'v.read': 'Read', 'v.pickup': 'Pick up', 'v.inspect': 'Inspect', 'v.unlock': 'Unlock', 'v.press': 'Press', 'v.listen': 'Listen',
      'v.install': 'Install', 'v.remove': 'Remove', 'v.pull': 'Pull',
      'n.writing': 'Writing', 'n.item': 'Item', 'n.locked': 'Locked container', 'n.button': '{sym} button', 'n.wallPanel': 'Wall panel',
      'n.lever': 'Lever', 'n.gate': 'Gate', 'n.installInto': '{item} → {socket}',
      't.journal': 'Added to journal', 't.pickedUp': 'Picked up: {name}', 't.found': '{name} found', 't.underneath': 'Something was underneath',
      'c.nothingUnder': 'Nothing underneath.', 'c.noSound': '[no sound]', 'c.burstCharging': 'Lemon Burst is recharging…', 'c.fell': 'You fell. Back to the start.',
      'c.panelOk': 'The lamps turn green. Something slides open nearby.', 'c.panelBad': 'Wrong order. The panel resets.',
      'c.hollow': 'A plaster panel. It sounds hollow when you knock on it.',
      'c.socketEmpty': '{socket}: an empty socket. A part is missing.',
      'c.installed': '{item} installed. The lamp glows green.', 'c.wrongSocket': 'The lamp flashes red. The {item} does not belong in {socket}.',
      'c.nothing': 'Nothing happens.', 'c.gateLocked': 'Locked. There is no power.',
    },
    ar: {
      'app.subtitle': 'عدّاء المكعّبات اللانهائي',
      'loading': 'نرتّب المكعّبات…',
      'menu.best': 'الأفضل', 'menu.play': 'العب', 'menu.character': 'الشخصية', 'menu.settings': 'الإعدادات',
      'menu.hint': '<kbd>A</kbd><kbd>D</kbd> أو الأسهم للتحرّك يمينًا ويسارًا · <kbd>W</kbd>/<kbd>Space</kbd> قفز · <kbd>S</kbd> انزلاق · اسحب على الجوال',
      'char.prev': 'الشخصية السابقة', 'char.next': 'الشخصية التالية', 'char.select': 'اختيار',
      'char.hero.name': 'البطل', 'char.hero.tag': 'شخصيتك الأصلية',
      'settings.title': 'الإعدادات', 'settings.sfx': 'المؤثرات الصوتية', 'settings.music': 'الموسيقى', 'settings.quality': 'الرسومات',
      'settings.fps': 'عرض الإطارات', 'settings.lang': 'اللغة', 'settings.back': 'رجوع',
      'menu.missions': 'المهمات', 'ml.title': 'المهمات', 'ml.sub': 'أعِد لعب أي مهمة وصلت إليها. تُفتح المهمات الجديدة بإكمال التي قبلها (أو من البوابات على الطريق الجبلي).',
      'ml.play': 'العب', 'ml.done': 'مكتملة · أفضل وقت {t}', 'ml.open': 'جاهزة للعب', 'ml.locked': 'مقفلة: أكمل «{name}» أولًا', 'ml.back': 'رجوع',
      'settings.full': 'ملء الشاشة', 'fs.enter': 'ملء الشاشة', 'fs.exit': 'إلغاء ملء الشاشة', 'fs.na': 'غير مدعوم',
      'fs.ios': 'على الآيفون: اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية»، وافتح اللعبة من هناك لتلعب بدون أشرطة المتصفح.',
      'on': 'تشغيل', 'off': 'إيقاف', 'high': 'عالية', 'low': 'منخفضة',
      'hud.score': 'النقاط', 'hud.distance': 'المسافة', 'hud.coins': 'العملات', 'hud.pause': 'إيقاف مؤقت', 'unit.m': 'م',
      'pause.title': 'إيقاف مؤقت', 'pause.resume': 'متابعة', 'pause.settings': 'الإعدادات', 'pause.menu': 'القائمة الرئيسية',
      'go.title': 'انتهت اللعبة', 'go.newBest': 'رقم قياسي جديد!', 'go.final': 'النتيجة النهائية', 'go.distance': 'المسافة', 'go.coins': 'العملات',
      'go.best': 'أفضل نتيجة', 'go.again': 'العب مرة أخرى', 'go.menu': 'القائمة الرئيسية',
      'toast.multiplier': 'المضاعف ×{n}', 'toast.stumble': 'تعثّرت! انتبه: الاصطدام التالي يُنهي الجولة', 'toast.shieldBroken': 'انكسر الدرع!',
      'toast.lemon': '+5 ليمونة', 'toast.gateAhead': 'بوابة مهمة أمامك!', 'toast.go': 'انطلق!', 'toast.reward': '+{score} نقطة · +{coins} عملة',
      'pu.magnet': 'مغناطيس', 'pu.shield': 'درع', 'pu.boost': 'تسارع', 'pu.double': 'عملات ×2', 'pu.invincible': 'نجمة',
      'biome.grassland': 'المراعي العالية', 'biome.forest': 'مرتفعات الصنوبر', 'biome.desert': 'الأخاديد الحمراء', 'biome.snow': 'القمم الثلجية', 'biome.village': 'مدرّجات الليمون', 'biome.mountains': 'القمم الصخرية',
      'gate.sign': 'مهمة {n}',
      'mi.missionOf': 'المهمة {n} من {total}', 'mi.journal': 'المفكّرة', 'mi.burst': 'قفزة الليمون', 'mi.lookHint': 'انقر لتنظر حولك',
      'mi.objectiveDone': 'اكتمل الهدف', 'mi.useKey': 'استخدم',
      'mi.k.move': 'الحركة', 'mi.k.look': 'النظر', 'mi.k.jump': 'قفز', 'mi.k.crouch': 'انحناء / انزلاق', 'mi.k.interact': 'تفاعل',
      'mi.k.burst': 'قفزة الليمون', 'mi.k.journal': 'المفكّرة', 'mi.k.pause': 'إيقاف مؤقت',
      'mi.key.wasd': 'W A S D', 'mi.key.mouse': 'الفأرة', 'mi.key.space': 'Space', 'mi.key.left': 'الجهة اليسرى', 'mi.key.right': 'الجهة اليمنى',
      'mi.t.jump': 'قفز', 'mi.t.crouch': 'انحناء', 'mi.t.use': 'استخدم', 'mi.t.burst': 'قفزة',
      'mi.objective': 'الهدف', 'mi.start': 'ابدأ المهمة', 'mi.close': 'إغلاق',
      'mi.lock.try': 'جرّب القفل', 'mi.lock.keys': 'المفاتيح: ← → اختيار القرص · ↑ ↓ تدويره · Enter للتجربة',
      'mi.lock.default': 'أدِر الأقراص، ثم جرّب القفل.', 'mi.lock.next': 'الرمز التالي في القرص {n}', 'mi.lock.prev': 'الرمز السابق في القرص {n}',
      'mi.lock.ok': 'طق! انفتح القفل.', 'mi.lock.bad': 'القفل لا يتحرّك.',
      'mi.j.title': 'المفكّرة · {name}', 'mi.j.objective': 'الهدف', 'mi.j.bonus': 'إضافي', 'mi.j.items': 'الأغراض', 'mi.j.noItems': 'لا تحمل شيئًا بعد.',
      'mi.j.hints': 'تلميحات', 'mi.j.showHint': 'اعرض تلميحًا (بقي {n})', 'mi.j.clues': 'الأدلّة التي وجدتها ({n})', 'mi.j.noClues': 'اقرأ الكتابات في المكان (E) وستُنسخ هنا.',
      'mi.p.title': 'إيقاف مؤقت', 'mi.p.resume': 'متابعة', 'mi.p.sens': 'حساسية النظر', 'mi.p.fov': 'مجال الرؤية',
      'mi.p.restart': 'إعادة المهمة', 'mi.p.leave': 'مغادرة المهمة', 'mi.p.leaveNote': 'المغادرة تعيدك إلى جولتك بلا مكافأة. يمكنك إيجاد هذه المهمة مجددًا عند بوابة لاحقة.',
      'mi.p.quit': 'الخروج إلى القائمة الرئيسية',
      'mi.r.title': 'اكتملت المهمة', 'mi.r.time': 'الوقت', 'mi.r.clues': 'الأدلّة', 'mi.r.mistakes': 'الأخطاء', 'mi.r.hints': 'التلميحات',
      'mi.r.rewards': 'المكافآت', 'mi.r.score': 'نقطة', 'mi.r.items': 'الأغراض: {list}', 'mi.r.return': 'العودة إلى الجولة',
      'mi.f.title': 'انتهى الوقت', 'mi.f.text': 'فشلت المهمة. حاول مجددًا، أو عُد إلى جولتك (بلا مكافأة).', 'mi.f.retry': 'حاول مجددًا',
      'rw.complete': 'اكتملت المهمة', 'rw.replay': 'إعادة لعب المهمة', 'rw.none': 'مكتملة سابقًا: لا مكافأة',
      'ach.first_mission': 'البوابة الأولى: أكمل مهمة', 'ach.all_missions': 'محقّق الليمون: أكمل كل المهمات',
      'ach.flawless': 'بلا أخطاء: أكمل مهمة دون أي خطأ', 'ach.electrician': 'الكهربائي: أعِد الكهرباء إلى الميناء',
      'v.read': 'اقرأ', 'v.pickup': 'التقط', 'v.inspect': 'افحص', 'v.unlock': 'افتح', 'v.press': 'اضغط', 'v.listen': 'استمع',
      'v.install': 'ركّب', 'v.remove': 'انزع', 'v.pull': 'اسحب',
      'n.writing': 'كتابة', 'n.item': 'غرض', 'n.locked': 'صندوق مقفل', 'n.button': 'زر {sym}', 'n.wallPanel': 'لوح في الجدار',
      'n.lever': 'ذراع', 'n.gate': 'بوابة', 'n.installInto': '{item} ← {socket}',
      't.journal': 'أُضيف إلى المفكّرة', 't.pickedUp': 'التقطت: {name}', 't.found': 'وجدت {name}', 't.underneath': 'كان هناك شيء تحته',
      'c.nothingUnder': 'لا شيء تحته.', 'c.noSound': '[لا صوت]', 'c.burstCharging': 'قفزة الليمون تُشحن…', 'c.fell': 'سقطت. عدت إلى البداية.',
      'c.panelOk': 'أضاءت المصابيح بالأخضر. شيء ما انفتح قريبًا.', 'c.panelBad': 'ترتيب خاطئ. اللوحة عادت من البداية.',
      'c.hollow': 'لوح من الجبس. يبدو مجوّفًا حين تطرق عليه.',
      'c.socketEmpty': '{socket}: مقبس فارغ. هناك قطعة ناقصة.',
      'c.installed': 'تم تركيب {item}. المصباح يضيء بالأخضر.', 'c.wrongSocket': 'المصباح يومض بالأحمر. {item} لا يناسب {socket}.',
      'c.nothing': 'لا شيء يحدث.', 'c.gateLocked': 'مقفلة. لا توجد كهرباء.',
    },
  };
  const NAMES = { ar: 'العربية', en: 'English' };
  const listeners = [];

  function initial() {
    try {
      const s = JSON.parse(localStorage.getItem('cubeexpress.settings') || '{}');
      if (s.lang && STRINGS[s.lang]) return s.lang;
    } catch (e) { /* storage unavailable */ }
    return 'ar';                                   // the game's home language
  }

  VR.lang = initial();
  VR.t = function (key, vars) {
    let s = (STRINGS[VR.lang] && STRINGS[VR.lang][key]);
    if (s === undefined) s = STRINGS.en[key];
    if (s === undefined) { console.warn('[i18n] missing', key); return key; }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  };
  VR.L = function (v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v[VR.lang] !== undefined ? v[VR.lang] : v.en;
    return v;
  };
  VR.isRTL = () => VR.lang === 'ar';

  function applyDOM() {
    const root = document.documentElement;
    root.lang = VR.lang; root.dir = VR.isRTL() ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = VR.t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = VR.t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = VR.t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', VR.t(el.dataset.i18nAria)); });
  }

  VR.I18N = {
    STRINGS, NAMES,
    get lang() { return VR.lang; },
    set(lang) {
      if (!STRINGS[lang] || lang === VR.lang) return;
      VR.lang = lang;
      applyDOM();
      // make sure the Arabic faces are ready before in-world text is drawn
      if (document.fonts && document.fonts.load) {
        Promise.all(['700 32px "Reem Kufi"', '500 32px "Reem Kufi"', '700 32px "Tajawal"', '500 32px "Tajawal"'].map(f => document.fonts.load(f).catch(() => {})))
          .then(() => listeners.forEach(fn => fn(lang, true)));
      }
      listeners.forEach(fn => fn(lang, false));
    },
    toggle() { this.set(VR.lang === 'ar' ? 'en' : 'ar'); },
    onChange(fn) { listeners.push(fn); },
    apply: applyDOM,
  };
  document.addEventListener('DOMContentLoaded', applyDOM);
})();
