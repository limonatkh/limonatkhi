/* =====================================================================
 * DUEL UI — everything on screen for the 1v1 arena:
 *   - the road prompt next to a 1v1 gate
 *   - opponent picker, "waiting for acceptance" panel
 *   - the invite pop-up the other player gets (Accept / Decline + timer)
 *   - arena HUD: names & round wins, round timer, health, weapon/ammo,
 *     impulse-grenade charges, crosshair, hit marker, kill feed, scope
 *   - touch controls, pause (forfeit) and the final result card
 * ===================================================================== */
(function () {
  const T = (k, v) => VR.t(k, v);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  Object.assign(VR.I18N.STRINGS.en, {
    'settings.online': 'Online challenges',
    'du.mode': '1v1 Sniper Arena', 'du.gateSign': '1v1 DUEL', 'du.prompt': 'Challenge a player', 'du.promptSub': '1v1 Sniper Arena',
    'du.pickTitle': 'Pick an opponent', 'du.friend': 'Friend in your room', 'du.online': 'Online now',
    'du.none': 'Nobody is free right now. Invite a friend from "Challenge a friend", or try again later.',
    'du.offline': 'Online challenges are switched off in Settings.', 'du.connecting': 'Connecting…',
    'du.challenge': 'CHALLENGE', 'du.close': 'BACK TO THE RUN', 'du.free': 'Free',
    'du.why.mission': 'in a mission', 'du.why.duel': 'in another duel', 'du.why.race': 'in a race', 'du.why.busy': 'busy', 'du.why.cooldown': 'wait a moment before inviting again', 'du.why.offline': 'offline',
    'du.waitTitle': 'Waiting for acceptance…', 'du.cancel': 'CANCEL', 'du.exit': 'EXIT',
    'du.declined': '{name} declined the duel.', 'du.timeout': '{name} didn\'t answer.', 'du.unavailable': '{name} can\'t play now ({why}).', 'du.lost': 'Lost contact with {name}.',
    'du.inviteFrom': '{name} challenges you!', 'du.accept': 'ACCEPT', 'du.decline': 'DECLINE',
    'du.sniper': 'Sniper', 'du.nade': 'Impulse grenade', 'du.hp': 'Health', 'du.reloading': 'Reloading…',
    'du.round': 'Round {n}', 'du.roundWon': 'ROUND WON', 'du.roundLost': 'ROUND LOST', 'du.roundDraw': 'DRAW', 'du.fight': 'FIGHT!',
    'du.headshot': 'HEADSHOT!', 'du.kill': '{a} took out {b}', 'du.timeUp': 'Time\'s up', 'du.firstTo': 'First to {n}',
    'du.pauseTitle': 'The duel goes on', 'du.pauseNote': 'A live duel can\'t be paused: your opponent is still playing.', 'du.resume': 'RESUME', 'du.forfeit': 'FORFEIT (LOSE)',
    'du.youWin': 'You won the duel!', 'du.youLose': 'You lost the duel', 'du.draw': 'Draw', 'du.winner': 'Winner', 'du.loser': 'Loser',
    'du.rounds': '{n} rounds', 'du.continue': 'BACK TO THE RUN ({n})', 'du.continueMenu': 'CONTINUE ({n})', 'du.oppLeft': '{name} left the duel: the win is yours.', 'du.reward': '+{coins} coins',
    'du.waitingOpp': 'Waiting for your opponent…', 'du.you': 'You',
    'du.t.fire': 'FIRE', 'du.t.aim': 'SCOPE', 'du.t.nade': 'PUSH', 'du.t.swap': 'SWAP', 'du.t.jump': 'Jump', 'du.t.crouch': 'Slide',
    'du.keys': 'Left click fire · Right click scope · Q impulse grenade · 1 / 2 switch · R reload · Space jump · C slide',
    'du.keyHint': 'Y accept · N decline',
    'menu.wait': 'WAIT FOR A PLAYER', 'menu.waitSub': '1v1 Sniper Arena',
    'du.lobbyTitle': 'Waiting for another player…', 'du.lobbySub': 'Practise moving and sniping. The duel starts from round 1 as soon as someone joins.',
    'du.lobbyOnline': '{n} online now', 'du.lobbyConnecting': 'Connecting…', 'du.found': '{name} joined! The duel begins',
    'du.leave': 'LEAVE THE ARENA', 'du.pauseSolo': 'Waiting room', 'du.pauseSoloNote': 'You can leave any time; nobody is playing against you yet.',
    'du.why.wait': 'waiting in the arena', 'du.onlineOn': 'Online challenges turned on',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'settings.online': 'التحديات الأونلاين',
    'du.mode': 'ساحة القنص 1v1', 'du.gateSign': 'تحدي 1v1', 'du.prompt': 'تحدَّ لاعبًا', 'du.promptSub': 'ساحة القنص 1v1',
    'du.pickTitle': 'اختر منافسًا', 'du.friend': 'صديقك في الغرفة', 'du.online': 'متصلون الآن',
    'du.none': 'لا يوجد أحد متاح الآن. ادعُ صديقًا من «تحدَّ صديقًا» أو حاول لاحقًا.',
    'du.offline': 'التحديات الأونلاين مطفأة من الإعدادات.', 'du.connecting': 'نتصل…',
    'du.challenge': 'تحدَّ', 'du.close': 'العودة إلى الطريق', 'du.free': 'متاح',
    'du.why.mission': 'في مهمة', 'du.why.duel': 'في تحدٍّ آخر', 'du.why.race': 'في سباق', 'du.why.busy': 'مشغول', 'du.why.cooldown': 'انتظر قليلًا قبل دعوته مجددًا', 'du.why.offline': 'غير متصل',
    'du.waitTitle': 'بانتظار القبول…', 'du.cancel': 'إلغاء', 'du.exit': 'خروج',
    'du.declined': '{name} رفض التحدي.', 'du.timeout': 'لم يردّ {name}.', 'du.unavailable': '{name} لا يستطيع اللعب الآن ({why}).', 'du.lost': 'انقطع الاتصال بـ{name}.',
    'du.inviteFrom': '{name} يتحدّاك!', 'du.accept': 'قبول', 'du.decline': 'رفض',
    'du.sniper': 'القنّاصة', 'du.nade': 'قنبلة الدفع', 'du.hp': 'الصحة', 'du.reloading': 'تلقيم…',
    'du.round': 'الجولة {n}', 'du.roundWon': 'فزت بالجولة', 'du.roundLost': 'خسرت الجولة', 'du.roundDraw': 'تعادل', 'du.fight': 'قاتل!',
    'du.headshot': 'ضربة رأس!', 'du.kill': '{a} أقصى {b}', 'du.timeUp': 'انتهى الوقت', 'du.firstTo': 'أول من يصل إلى {n}',
    'du.pauseTitle': 'المواجهة مستمرة', 'du.pauseNote': 'لا يمكن إيقاف مواجهة مباشرة: خصمك ما زال يلعب.', 'du.resume': 'متابعة', 'du.forfeit': 'انسحاب (خسارة)',
    'du.youWin': 'فزت بالتحدي!', 'du.youLose': 'خسرت التحدي', 'du.draw': 'تعادل', 'du.winner': 'الفائز', 'du.loser': 'الخاسر',
    'du.rounds': '{n} جولات', 'du.continue': 'العودة إلى الطريق ({n})', 'du.continueMenu': 'متابعة ({n})', 'du.oppLeft': '{name} غادر المواجهة: الفوز لك.', 'du.reward': '+{coins} عملة',
    'du.waitingOpp': 'بانتظار المنافس…', 'du.you': 'أنت',
    'du.t.fire': 'إطلاق', 'du.t.aim': 'منظار', 'du.t.nade': 'دفع', 'du.t.swap': 'تبديل', 'du.t.jump': 'قفز', 'du.t.crouch': 'انزلاق',
    'du.keys': 'زر الفأرة الأيسر: إطلاق · الأيمن: منظار · Q: قنبلة الدفع · 1 / 2: تبديل · R: تلقيم · Space: قفز · C: انزلاق',
    'du.keyHint': 'Y قبول · N رفض',
    'menu.wait': 'انتظار لاعب', 'menu.waitSub': 'ساحة القنص 1v1',
    'du.lobbyTitle': 'بانتظار لاعب آخر…', 'du.lobbySub': 'تدرّب على الحركة والقنص. يبدأ التحدي من الجولة الأولى فور وصول لاعب.',
    'du.lobbyOnline': 'متصلون الآن: {n}', 'du.lobbyConnecting': 'نتصل…', 'du.found': '{name} وصل! يبدأ التحدي',
    'du.leave': 'الخروج من الساحة', 'du.pauseSolo': 'ساحة الانتظار', 'du.pauseSoloNote': 'يمكنك الخروج متى شئت، لا أحد يلعب ضدك بعد.',
    'du.why.wait': 'ينتظر في الساحة', 'du.onlineOn': 'تم تشغيل التحديات الأونلاين',
  });

  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  class DuelUI {
    constructor(mgr) {
      this.mgr = mgr;
      // ---- road prompt + picker + popup live outside the arena HUD
      const extra = document.createElement('div');
      extra.innerHTML = `
        <button id="duPrompt" class="du-prompt panel" hidden><span class="du-key">E</span><span class="du-ptxt"><b></b><small></small></span></button>
        <section id="duPick" class="screen dim" hidden><div class="card panel du-pickcard" id="duPickCard"></div></section>
        <div id="duInvite" class="du-invite panel" hidden role="alertdialog" aria-live="assertive"></div>`;
      while (extra.firstChild) document.body.appendChild(extra.firstChild);
      this.root = document.getElementById('duel-ui');
      this.root.innerHTML = `
        <div class="du-top">
          <div class="du-side du-me"><span class="du-sw"></span><b class="du-name"></b><span class="du-pips"></span></div>
          <div class="du-mid"><div class="du-timer num">45</div><div class="du-roundlbl"></div></div>
          <div class="du-side du-opp"><span class="du-sw"></span><b class="du-name"></b><span class="du-pips"></span></div>
        </div>
        <div class="du-waitbar panel" hidden><b class="du-wt"></b><span class="du-wo"></span><small class="du-ws"></small>
          <button class="btn small du-wexit" type="button"></button></div>
        <div class="du-cross"><i></i><i></i><i></i><i></i></div>
        <div class="du-hit" hidden><i></i><i></i><i></i><i></i></div>
        <div class="du-scope" hidden></div>
        <div class="du-dmg"></div>
        <div class="du-big" hidden></div>
        <div class="du-feed"></div>
        <div class="du-bottom">
          <div class="du-hp panel"><span class="du-lbl"></span><div class="du-bar"><div></div></div><b class="num">100</b></div>
          <div class="du-weapons">
            <div class="du-w du-wsn panel"><span class="du-key">1</span><span class="du-wname"></span><b class="num du-ammo">5/5</b><div class="du-rl"><div></div></div></div>
            <div class="du-w du-wnd panel"><span class="du-key">Q</span><span class="du-wname"></span><span class="du-charges"></span></div>
          </div>
        </div>
        <div class="du-keys"></div>
        <div class="du-touch" hidden>
          <div class="mi-stickzone du-stickzone"><div class="mi-stick"><div class="mi-knob"></div></div></div>
          <div class="mi-lookzone du-lookzone"></div>
          <div class="du-tbtns">
            <button class="mi-tbtn" data-act="burst" data-k="du.t.nade"></button>
            <button class="mi-tbtn" data-hold="aim" data-k="du.t.aim"></button>
            <button class="mi-tbtn" data-hold="crouch" data-k="du.t.crouch"></button>
            <button class="mi-tbtn" data-act="jump" data-k="du.t.jump"></button>
            <button class="mi-tbtn du-tfire" data-act="fire" data-k="du.t.fire"></button>
          </div>
        </div>
        <div class="du-overlay" hidden><div class="card panel du-card"></div></div>`;
      const q = (s) => this.root.querySelector(s);
      this.el = {
        me: q('.du-me'), opp: q('.du-opp'), timer: q('.du-timer'), roundlbl: q('.du-roundlbl'),
        cross: q('.du-cross'), hit: q('.du-hit'), scope: q('.du-scope'), dmg: q('.du-dmg'), big: q('.du-big'), feed: q('.du-feed'),
        hp: q('.du-hp'), hpbar: q('.du-hp .du-bar div'), hpnum: q('.du-hp b'), wsn: q('.du-wsn'), wnd: q('.du-wnd'), ammo: q('.du-ammo'),
        rl: q('.du-rl div'), charges: q('.du-charges'), keys: q('.du-keys'), touch: q('.du-touch'), overlay: q('.du-overlay'), card: q('.du-card'),
      };
      this.prompt = document.getElementById('duPrompt');
      this.prompt.addEventListener('click', () => { VR.Audio.play('click'); this.mgr.openPicker(); });
      // "Waiting for a player": a real way out (back to the main menu)
      this.root.querySelector('.du-wexit').addEventListener('click', (e) => { e.stopPropagation(); VR.Audio.play('click'); this.mgr.exitWaiting(); });
      this.root.querySelector('.du-wexit').addEventListener('pointerdown', (e) => e.stopPropagation());
      this.buildTouch();
      this.relabel();
      VR.I18N.onChange(() => this.relabel());
    }

    relabel() {
      this.el.hp.querySelector('.du-lbl').textContent = T('du.hp');
      this.el.wsn.querySelector('.du-wname').textContent = T('du.sniper');
      this.el.wnd.querySelector('.du-wname').textContent = T('du.nade');
      this.el.keys.textContent = T('du.keys');
      this.root.querySelectorAll('[data-k]').forEach(b => { b.textContent = T(b.dataset.k); });
      this.prompt.querySelector('b').textContent = T('du.prompt');
      this.prompt.querySelector('small').textContent = T('du.promptSub');
      this.prompt.querySelector('.du-key').textContent = isTouch() ? '⚔' : 'E';
      if (this.mgr.refreshOpen) this.mgr.refreshOpen();
    }

    // ------------------------------------------------------------ road prompt
    showPrompt(on) { if (this.prompt.hidden === on) this.prompt.hidden = !on; }

    // ------------------------------------------------------------ picker
    showPicker(data, handlers) {
      this.pickHandlers = handlers;
      const card = document.getElementById('duPickCard');
      const row = (c) => `
        <div class="du-row ${c.st === 'free' ? '' : 'busy'}">
          <span class="du-dot ${c.st}"></span>
          <span class="du-pname">${esc(c.name)}</span>
          <span class="du-pst">${c.st === 'free' ? esc(c.freeText || T('du.free')) : esc(c.whyText)}</span>
          <button class="btn small du-go" data-id="${esc(c.key)}" ${c.st === 'free' ? '' : 'disabled'}>${T('du.challenge')}</button>
        </div>`;
      let body = '';
      if (data.friend) body += `<h3 class="du-h">${T('du.friend')}</h3>` + row(data.friend);
      if (data.onlineOn) {
        body += `<h3 class="du-h">${T('du.online')}</h3>`;
        if (!data.connected) body += `<p class="du-note busy">${T('du.connecting')}</p>`;
        else if (!data.online.length) body += `<p class="du-note">${T('du.none')}</p>`;
        else body += `<div class="du-list">${data.online.map(row).join('')}</div>`;
      } else if (!data.friend) body += `<p class="du-note">${T('du.offline')}</p>`;
      card.innerHTML = `
        <h2 class="heading">${T('du.pickTitle')}</h2>
        <p class="du-sub">${T('du.mode')} · ${T('du.firstTo', { n: data.firstTo })}</p>
        ${body}
        <p class="ch-status ${data.noticeKind || ''}" id="duNotice">${esc(data.notice || '')}</p>
        <button class="btn" id="duPickClose">${T('du.close')}</button>`;
      card.querySelectorAll('.du-go').forEach(b => b.addEventListener('click', () => { VR.Audio.play('click'); handlers.pick(b.dataset.id); }));
      card.querySelector('#duPickClose').addEventListener('click', () => { VR.Audio.play('click'); handlers.close(); });
      document.getElementById('duPick').hidden = false;
    }
    showWaiting(name, left, total, onCancel) {
      const card = document.getElementById('duPickCard');
      if (!card.querySelector('.du-wait')) {
        card.innerHTML = `
          <div class="du-wait">
            <h2 class="heading">${T('du.waitTitle')}</h2>
            <div class="ch-vs"><b>${esc(this.mgr.myName())}</b><span>${T('ch.vs')}</span><b>${esc(name)}</b></div>
            <p class="du-sub">${T('du.mode')}</p>
            <div class="du-wbar"><div></div></div>
            <div class="du-wnum num"></div>
            <button class="btn" id="duWaitCancel">${T('du.cancel')}</button>
          </div>`;
        card.querySelector('#duWaitCancel').addEventListener('click', () => { VR.Audio.play('click'); onCancel(); });
      }
      card.querySelector('.du-wbar div').style.transform = `scaleX(${Math.max(0, left / total)})`;
      card.querySelector('.du-wnum').textContent = Math.ceil(left);
      document.getElementById('duPick').hidden = false;
    }
    hidePicker() { document.getElementById('duPick').hidden = true; document.getElementById('duPickCard').innerHTML = ''; }

    // ------------------------------------------------------------ invite pop-up
    showInvite(name, left, total, onAccept, onDecline) {
      const el = document.getElementById('duInvite');
      if (el.hidden || el.dataset.name !== name) {
        el.dataset.name = name;
        el.innerHTML = `
          <div class="du-ititle"><span class="du-ico">⚔</span><b>${esc(T('du.inviteFrom', { name }))}</b></div>
          <div class="du-isub">${T('du.mode')}</div>
          <div class="du-wbar"><div></div></div>
          <div class="du-ibtns"><button class="btn small lemon du-acc">${T('du.accept')}</button><button class="btn small du-dec">${T('du.decline')}</button></div>
          <div class="du-ikeys">${isTouch() ? '' : T('du.keyHint')}</div>`;
        el.querySelector('.du-acc').addEventListener('click', () => { VR.Audio.play('click'); onAccept(); });
        el.querySelector('.du-dec').addEventListener('click', () => { VR.Audio.play('click'); onDecline(); });
        el.hidden = false;
        VR.Audio.play('gem');
      }
      el.querySelector('.du-wbar div').style.transform = `scaleX(${Math.max(0, left / total)})`;
    }
    hideInvite() { const el = document.getElementById('duInvite'); el.hidden = true; el.dataset.name = ''; }

    // ------------------------------------------------------------ arena HUD
    show(on) { this.root.hidden = !on; this.el.touch.hidden = !(on && isTouch()); this.el.keys.hidden = isTouch(); if (!on) this.closeOverlay(); }
    setPlayers(me, opp, colMe, colOpp, firstTo) {
      for (const [el, name, col] of [[this.el.me, me, colMe], [this.el.opp, opp, colOpp]]) {
        el.querySelector('.du-name').textContent = name;
        el.style.setProperty('--team', hex(col));
        el.querySelector('.du-pips').innerHTML = '<i></i>'.repeat(firstTo);
      }
      this.root.style.setProperty('--me', hex(colMe));
    }
    setScore(mine, theirs) {
      const fill = (el, n) => el.querySelectorAll('.du-pips i').forEach((p, i) => p.classList.toggle('on', i < n));
      fill(this.el.me, mine); fill(this.el.opp, theirs);
    }
    setTimer(sec, round) {
      const s = Math.max(0, Math.ceil(sec));
      const txt = String(s);
      if (this.el.timer.textContent !== txt) this.el.timer.textContent = txt;
      this.el.timer.classList.toggle('low', s <= 10);
      const r = T('du.round', { n: round });
      if (this.el.roundlbl.textContent !== r) this.el.roundlbl.textContent = r;
    }
    setHP(hp) {
      this.el.hpbar.style.transform = `scaleX(${Math.max(0, hp) / 100})`;
      this.el.hpnum.textContent = Math.max(0, Math.round(hp));
      this.el.hp.classList.toggle('low', hp <= 45);
    }
    setWeapon(w, ammo, mag, reloadK, charges, maxCharges, rechargeK) {
      this.el.wsn.classList.toggle('on', w === 'sniper');
      this.el.wnd.classList.toggle('on', w === 'nade');
      const a = reloadK > 0 ? T('du.reloading') : `${ammo}/${mag}`;
      if (this.el.ammo.textContent !== a) this.el.ammo.textContent = a;
      this.el.rl.style.transform = `scaleX(${reloadK > 0 ? 1 - reloadK : 0})`;
      let h = '';
      for (let i = 0; i < maxCharges; i++) h += `<i class="${i < charges ? 'on' : i === charges ? 'chg' : ''}" style="${i === charges ? `--k:${rechargeK}` : ''}"></i>`;
      if (this.el.charges.dataset.h !== h) { this.el.charges.innerHTML = h; this.el.charges.dataset.h = h; }
    }
    big(text, cls = '', ms = 1200) {
      const b = this.el.big;
      b.textContent = text; b.className = 'du-big ' + cls; b.hidden = false;
      b.animate([{ transform: 'translate(-50%,-50%) scale(1.35)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 180 });
      clearTimeout(this.bigT);
      if (ms) this.bigT = setTimeout(() => { b.hidden = true; }, ms);
    }
    hideBig() { this.el.big.hidden = true; clearTimeout(this.bigT); }
    feed(text, cls = '') {
      const d = document.createElement('div'); d.className = 'du-fi ' + cls; d.textContent = text;
      this.el.feed.prepend(d);
      while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
      setTimeout(() => d.remove(), 3500);
    }
    hitmarker(head) {
      const h = this.el.hit; h.hidden = false; h.className = 'du-hit' + (head ? ' head' : '');
      h.animate([{ transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 380 });
      clearTimeout(this.hitT); this.hitT = setTimeout(() => { h.hidden = true; }, 380);
    }
    damage(k) { this.el.dmg.style.opacity = Math.min(0.85, k); }
    scope(on) { this.el.scope.hidden = !on; this.el.cross.hidden = on; }

    // ------------------------------------------------------------ overlays
    get modal() { return !this.el.overlay.hidden; }
    closeOverlay() { this.el.overlay.hidden = true; this.el.card.innerHTML = ''; }
    setSolo(on) {
      this.root.classList.toggle('solo', on);
      this.root.querySelector('.du-waitbar').hidden = !on;
      const b = this.root.querySelector('.du-wexit');
      b.textContent = T('du.exit') + (VR.Input.touchFirst && VR.Input.touchFirst() ? '' : ' (Esc)');
    }
    setWaitText(title, online, sub) {
      const w = this.root.querySelector('.du-waitbar');
      w.querySelector('.du-wt').textContent = title; w.querySelector('.du-wo').textContent = online; w.querySelector('.du-ws').textContent = sub;
    }
    showPause(onResume, onForfeit, solo) {
      this.el.card.innerHTML = `
        <h2 class="heading">${T(solo ? 'du.pauseSolo' : 'du.pauseTitle')}</h2>
        <p class="du-sub">${T(solo ? 'du.pauseSoloNote' : 'du.pauseNote')}</p>
        <button class="btn primary" id="duResume">${T('du.resume')}</button>
        <button class="btn fs-wide du-fsbtn" id="duFs"><i class="fs-ico"></i> ${VR.Fullscreen.isOn() ? T('fs.exit') : T('fs.enter')}</button>
        <button class="btn" id="duForfeit">${T(solo ? 'du.leave' : 'du.forfeit')}</button>`;
      this.el.card.querySelector('#duFs').addEventListener('click', (e) => { VR.Audio.play('click'); VR.Fullscreen.toggle(); e.currentTarget.lastChild.textContent = ' ' + (VR.Fullscreen.isOn() ? T('fs.enter') : T('fs.exit')); });
      this.el.card.querySelector('#duResume').addEventListener('click', () => { VR.Audio.play('click'); onResume(); });
      this.el.card.querySelector('#duForfeit').addEventListener('click', () => { VR.Audio.play('click'); onForfeit(); });
      this.el.overlay.hidden = false;
    }
    showResult(r, onContinue) {
      const title = r.win === true ? T('du.youWin') : r.win === false ? T('du.youLose') : T('du.draw');
      const cls = r.win === true ? 'win' : r.win === false ? 'lose' : '';
      const p = (name, score, tag, col) => `
        <div class="result cr-player ${tag === 'win' ? 'lead' : ''}" style="--team:${hex(col)}">
          <div class="lbl"><span class="du-sw"></span>${esc(name)} <span class="cr-state ${tag === 'win' ? 'live' : ''}">${tag === 'win' ? T('du.winner') : tag === 'lose' ? T('du.loser') : ''}</span></div>
          <div class="val">${score}</div></div>`;
      this.el.card.innerHTML = `
        <h2 class="heading ${cls}" id="duResTitle">${title}</h2>
        <p class="du-sub">${T('du.mode')} · ${T('du.rounds', { n: r.rounds })}</p>
        <div class="cr-grid">
          ${p(r.me + ' · ' + T('du.you'), r.sc[0], r.win === true ? 'win' : r.win === false ? 'lose' : '', r.colMe)}
          ${p(r.opp, r.sc[1], r.win === false ? 'win' : r.win === true ? 'lose' : '', r.colOpp)}
        </div>
        ${r.note ? `<p class="ch-status">${esc(r.note)}</p>` : ''}
        ${r.reward ? `<p class="ch-status good">${esc(T('du.reward', { coins: r.reward }))}</p>` : ''}
        <button class="btn primary" id="duContinue"></button>`;
      const b = this.el.card.querySelector('#duContinue');
      b.addEventListener('click', () => { VR.Audio.play('click'); onContinue(); });
      this.el.overlay.hidden = false;
      this.setContinue(r.fromRun, r.autoLeft);
    }
    setContinue(fromRun, left) {
      const b = this.el.card.querySelector('#duContinue'); if (!b) return;
      b.textContent = T(fromRun ? 'du.continue' : 'du.continueMenu', { n: Math.max(0, Math.ceil(left)) });
    }

    // ------------------------------------------------------------ touch
    buildTouch() {
      const zone = this.root.querySelector('.du-stickzone'), stick = zone.querySelector('.mi-stick'), knob = zone.querySelector('.mi-knob'), look = this.root.querySelector('.du-lookzone');
      let sid = null, ox = 0, oy = 0, lid = null, lx = 0, ly = 0;
      zone.addEventListener('pointerdown', (e) => {
        sid = e.pointerId; ox = e.clientX; oy = e.clientY; try { zone.setPointerCapture(sid); } catch (err) { /* ignore */ }
        const zr = zone.getBoundingClientRect();          // the stick lives inside the zone: draw it under the finger
        stick.style.left = (ox - zr.left) + 'px'; stick.style.top = (oy - zr.top) + 'px'; stick.classList.add('on');
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== sid) return;
        let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy), R = 50;
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`; VR.Input.setTouchMove(dx / R, -dy / R);
      });
      const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; stick.classList.remove('on'); stick.style.left = ''; stick.style.top = ''; VR.Input.setTouchMove(0, 0); };
      zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
      look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; try { look.setPointerCapture(lid); } catch (err) { /* ignore */ } });
      look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; const k = VR.Input.aimHeld() ? 0.8 : 2.2; VR.Input.addLook((e.clientX - lx) * k, (e.clientY - ly) * k); lx = e.clientX; ly = e.clientY; });
      const endLook = (e) => { if (e.pointerId === lid) lid = null; };
      look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
      this.root.querySelectorAll('.du-tbtns .mi-tbtn').forEach(b => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (b.dataset.act) VR.Input.press(b.dataset.act);
          if (b.dataset.hold === 'aim') { VR.Input.hold('aim', !VR.Input.aimHeld()); b.classList.toggle('on', VR.Input.aimHeld()); return; }
          if (b.dataset.hold) { VR.Input.hold(b.dataset.hold, true); if (b.dataset.hold === 'crouch') VR.Input.press('slide'); }
        });
        const up = () => { if (b.dataset.hold && b.dataset.hold !== 'aim') VR.Input.hold(b.dataset.hold, false); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      });
    }
    resetTouch() { this.root.querySelectorAll('.du-tbtns .mi-tbtn').forEach(b => b.classList.remove('on')); }
  }

  VR.DuelUI = DuelUI;
})();
