/* =====================================================================
 * MISSION UI — minimal first-person HUD and mission screens.
 * HUD: mission name + objective (top-left), timer / journal / pause
 * (top-right), crosshair + interaction prompt (centre), captions,
 * item hotbar and Lemon Burst cooldown (bottom).
 * Screens: intro · inspect · symbol lock · journal · pause · results ·
 * failed. Touch controls appear automatically on touch screens.
 * ===================================================================== */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // text with {symbol} tokens → HTML with pixel icons
  const T = (k, v) => VR.t(k, v), L = (v) => VR.L(v);
  const rich = (t) => esc(L(t)).replace(/\n/g, '<br>').replace(/\{(\w+)\}/g, (m, s) => `<img class="mi-sym" alt="${s}" src="${VR.Symbols.dataURL(s)}">`);
  const KIND_ICON = { inspect: '◉', collect: '✋', interact: '⚙' };
  const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  /** a few lines read differently when the mission was entered from the adventure world (key + '.adv') */
  let currentMgr = null;
  const RT = (k) => (currentMgr && currentMgr.origin === 'adventure' && VR.I18N.STRINGS.en[k + '.adv'] ? T(k + '.adv') : T(k));

  class MissionUI {
    constructor(mgr) {
      this.mgr = mgr; currentMgr = mgr;
      this.root = document.getElementById('mission-ui');
      this.modal = null;
      this.toastTimer = 0; this.captionTimer = 0;
      this.build();
    }

    build() {
      this.root.innerHTML = `
        <div class="mi-hud">
          <div class="mi-objective panel">
            <div class="mi-mname" id="mi-mname"></div>
            <div class="mi-obj" id="mi-obj"></div>
            <div class="mi-step" id="mi-step"></div>
            <div class="mi-progress" id="mi-progress"></div>
          </div>
          <div class="mi-topright">
            <div class="mi-timer panel" id="mi-timer" hidden></div>
            <div class="mi-coins panel" id="mi-coins" hidden><span class="coin-ico"></span><span id="mi-coins-n">0</span></div>
            <button class="btn small mi-iconbtn" id="mi-journal-btn" data-i18n-aria="mi.journal" aria-label="${T('mi.journal')}"><span class="mi-key">J</span><span class="mi-jlabel" data-i18n="mi.journal">${T('mi.journal')}</span></button>
            <button class="btn small mi-iconbtn mi-fsbtn" id="mi-fs-btn" data-i18n-aria="fs.enter" aria-label="${T('fs.enter')}"><i class="fs-ico"></i></button>
            <button class="btn small mi-iconbtn" id="mi-pause-btn" data-i18n-aria="mi.k.pause" aria-label="${T('mi.k.pause')}"><i class="mi-pausei"></i></button>
          </div>
          <div class="mi-cross" id="mi-cross"></div>
          <div class="mi-xh xh-target" id="mi-xh"></div>
          <div class="mi-prompt" id="mi-prompt" hidden></div>
          <div class="mi-caption" id="mi-caption" hidden></div>
          <div class="mi-hotbar" id="mi-hotbar"></div>
          <div class="mi-ability panel" id="mi-ability"><span class="mi-key">Q</span><span data-i18n="mi.burst">${T('mi.burst')}</span><div class="mi-cd"><div id="mi-cd-fill"></div></div></div>
          <div class="mi-toast" id="mi-toast"></div>
          <div class="mi-lockhint" id="mi-lockhint" hidden data-i18n="mi.lookHint">${T('mi.lookHint')}</div>
        </div>
        <div class="mi-touch" id="mi-touch" hidden>
          <div class="mi-stickzone" id="mi-stickzone"><div class="mi-stick" id="mi-stick"><div class="mi-knob" id="mi-knob"></div></div></div>
          <div class="mi-lookzone" id="mi-lookzone"></div>
          <div class="mi-tbtns">
            <button class="mi-tbtn" data-act="burst" data-i18n="mi.t.burst">${T('mi.t.burst')}</button>
            <button class="mi-tbtn" data-hold="crouch" data-i18n="mi.t.crouch">${T('mi.t.crouch')}</button>
            <button class="mi-tbtn" data-act="jump" data-i18n="mi.t.jump">${T('mi.t.jump')}</button>
            <button class="mi-tbtn mi-tuse" data-act="interact" data-i18n="mi.t.use">${T('mi.t.use')}</button>
          </div>
        </div>
        <div class="mi-overlay" id="mi-overlay" hidden><div class="mi-card panel" id="mi-card"></div></div>`;
      this.el = {
        mname: $('#mi-mname'), obj: $('#mi-obj'), step: $('#mi-step'), progress: $('#mi-progress'),
        timer: $('#mi-timer'), cross: $('#mi-cross'), prompt: $('#mi-prompt'), caption: $('#mi-caption'),
        hotbar: $('#mi-hotbar'), cd: $('#mi-cd-fill'), toast: $('#mi-toast'), overlay: $('#mi-overlay'), card: $('#mi-card'),
        lockhint: $('#mi-lockhint'), touch: $('#mi-touch'), ability: $('#mi-ability'),
        coins: $('#mi-coins'), coinsN: $('#mi-coins-n'),
      };
      // the shared wallet: shown in the adventure world (every change, from anywhere)
      VR.Wallet.onChange((c) => { this.el.coinsN.textContent = c.toLocaleString('en-US'); });
      $('#mi-journal-btn').addEventListener('click', () => { VR.Audio.play('click'); this.mgr.openJournal(); });
      $('#mi-pause-btn').addEventListener('click', () => { VR.Audio.play('click'); this.mgr.pause(); });
      $('#mi-fs-btn').addEventListener('click', (e) => { e.stopPropagation(); VR.Audio.play('click'); VR.Fullscreen.toggle(); });
      window.addEventListener('keydown', (e) => this.onKey(e));
      this.buildTouch();
    }

    show(on) { this.root.hidden = !on; if (on) this.el.touch.hidden = !isTouch(); }

    // ------------------------------------------------------------ HUD
    /** the small line above a title: "Mission 2 of 5", or the area's own label */
    eyebrow(def, total) { return def.persistent ? L(def.eyebrow || def.name) : T('mi.missionOf', { n: def.order, total }); }
    setMission(def, run, total) {
      this.el.mname.textContent = def.persistent ? L(def.name) : `${T('mi.missionOf', { n: def.order, total })} · ${L(def.name)}`;
      this.el.coins.hidden = !def.persistent;
      this.el.coinsN.textContent = VR.Wallet.of().coins.toLocaleString('en-US');
      this.el.obj.textContent = L(def.objective);
      this.current = { def, run, total };
      this.refreshObjectives(run);
      this.el.timer.hidden = !(def.timeLimit || (def.secondary || []).some(s => s.type === 'time'));
      this.setInventory(run);
    }
    refreshObjectives(run) {
      const ch = run.chapter && run.chapter();
      if (ch) this.el.obj.textContent = L(ch.title);
      const steps = run.objectiveSteps();
      const cur = steps.find(s => !s.done);
      const doneN = steps.filter(s => s.done).length;
      this.el.step.innerHTML = cur ? `<span class="mi-box"></span>${esc(L(cur.text))}` : `<span class="mi-box done"></span>${T('mi.objectiveDone')}`;
      this.el.progress.innerHTML = steps.map(s => `<i class="${s.done ? 'on' : ''}"></i>`).join('') + `<span>${doneN}/${steps.length}</span>`;
    }
    setTimer(run) {
      const lim = run.def.timeLimit;
      const t = lim ? Math.max(0, lim - run.time) : run.time;
      this.el.timer.textContent = (lim ? '⏳ ' : '') + VR.Missions.fmtTime(t);
      this.el.timer.classList.toggle('warn', !!lim && t < 15);
    }
    setPrompt(p) {
      const pr = this.el.prompt;
      if (!p) { pr.hidden = true; this.el.cross.className = 'mi-cross'; return; }
      const kind = p.kind;
      pr.hidden = false;
      pr.className = 'mi-prompt kind-' + kind;
      pr.innerHTML = `<span class="mi-key">${isTouch() ? T('mi.useKey') : 'E'}</span><span class="mi-ico">${KIND_ICON[kind] || ''}</span><b>${esc(p.verb)}</b><span class="mi-label">${esc(p.label)}</span>`;
      this.el.cross.className = 'mi-cross on kind-' + kind;
    }
    setAbility(cool, max) {
      this.el.cd.style.transform = `scaleX(${cool > 0 ? 1 - cool / max : 1})`;
      this.el.ability.classList.toggle('ready', cool <= 0);
    }
    setInventory(run) {
      const hb = this.el.hotbar;
      hb.innerHTML = run.inventory.map((it, i) =>
        `<div class="mi-slot ${i === run.selected ? 'sel' : ''}" data-i="${i}"><span class="mi-key">${i + 1}</span>${esc(L(it.name))}</div>`).join('');
      hb.querySelectorAll('.mi-slot').forEach(s => s.addEventListener('click', () => run.select(+s.dataset.i)));
    }
    toast(text, ms = 1600) {
      const t = this.el.toast;
      t.textContent = text; t.classList.add('show');
      clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    }
    caption(text, sec = 2.5) {
      const c = this.el.caption; c.textContent = text; c.hidden = false;
      clearTimeout(this.captionTimer); this.captionTimer = setTimeout(() => { c.hidden = true; }, sec * 1000);
    }
    lockHint(on) { this.el.lockhint.hidden = !on || isTouch(); }

    // ------------------------------------------------------------ modals
    open(name, html, onBind) {
      this.modal = name;
      this.el.card.className = 'mi-card panel mi-' + name;
      this.el.card.innerHTML = html;
      this.el.overlay.hidden = false;
      this.mgr.onModal(true);
      if (onBind) onBind(this.el.card);
      const first = this.el.card.querySelector('[data-focus]') || this.el.card.querySelector('button');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
    close() {
      if (!this.modal) return;
      const was = this.modal;
      this.modal = null; this.el.overlay.hidden = true; this.el.card.innerHTML = '';
      this.mgr.onModal(false, was);
    }
    onKey(e) {
      if (!this.modal) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      if (this.modal === 'inspect' && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.close(); }
      else if (this.modal === 'journal' && (e.code === 'KeyJ' || e.code === 'Tab')) { e.preventDefault(); this.close(); }
      else if (this.modal === 'lock' && this.lockKeys) this.lockKeys(e);
    }

    showIntro(def, total, onStart) {
      const touch = isTouch();
      const controls = touch
        ? [[T('mi.key.left'), T('mi.k.move')], [T('mi.key.right'), T('mi.k.look')], [T('mi.t.jump'), T('mi.k.jump')], [T('mi.t.crouch'), T('mi.k.crouch')], [T('mi.t.use'), T('mi.k.interact')], [T('mi.t.burst'), T('mi.k.burst')]]
        : [[T('mi.key.wasd'), T('mi.k.move')], [T('mi.key.mouse'), T('mi.k.look')], [T('mi.key.space'), T('mi.k.jump')], ['C', T('mi.k.crouch')], ['E', T('mi.k.interact')], ['Q', T('mi.k.burst')], ['J', T('mi.k.journal')], ['Esc', T('mi.k.pause')]];
      this.open('intro', `
        <div class="mi-eyebrow">${esc(this.eyebrow(def, total))}</div>
        <h2 class="heading mi-title">${esc(L(def.name))}</h2>
        <p class="mi-intro">${esc(L(def.intro))}</p>
        <div class="mi-objline"><span class="mi-tag">${T('mi.objective')}</span>${esc(L(def.objective))}</div>
        <div class="mi-controls">${controls.map(([k, v]) => `<div><span class="mi-key">${k}</span>${v}</div>`).join('')}</div>
        <button class="btn primary" id="mi-start" data-focus>${T('mi.start')}</button>`,
        (card) => card.querySelector('#mi-start').addEventListener('click', () => { VR.Audio.play('click'); onStart(); }));
    }

    showInspect({ title, text, style }) {
      this.open('inspect', `
        <div class="mi-eyebrow">${esc(L(title))}</div>
        <div class="mi-read style-${esc(style || 'paint')}">${rich(text)}</div>
        <button class="btn" id="mi-close" data-focus>${T('mi.close')} <span class="mi-key">E</span></button>`,
        (card) => card.querySelector('#mi-close').addEventListener('click', () => this.close()));
    }

    openSymbolLock({ title, symbols, dials, hint, onTry }) {
      const sel = new Array(dials).fill(0);
      let focus = 0, done = false;
      const render = (card) => {
        card.querySelectorAll('.mi-dial').forEach((d, i) => {
          d.querySelector('img').src = VR.Symbols.dataURL(symbols[sel[i]]);
          d.querySelector('img').alt = symbols[sel[i]];
          d.classList.toggle('focus', i === focus);
        });
      };
      const spin = (i, dir, card) => { sel[i] = (sel[i] + dir + symbols.length) % symbols.length; focus = i; VR.Audio.play('button'); render(card); };
      const tryIt = (card) => {
        if (done) return;
        const res = onTry(sel.map(i => symbols[i]));
        const m = card.querySelector('#mi-lockmsg');
        m.textContent = res.text; m.className = 'mi-lockmsg ' + (res.ok ? 'good' : 'bad');
        if (res.ok) { done = true; setTimeout(() => this.close(), 900); }
        else { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      };
      this.open('lock', `
        <div class="mi-eyebrow">${esc(L(title))}</div>
        <p class="mi-small">${esc(L(hint))}</p>
        <div class="mi-dials">${sel.map((_, i) => `
          <div class="mi-dial" data-i="${i}">
            <button class="btn small mi-up" aria-label="${T('mi.lock.next', { n: i + 1 })}">▲</button>
            <img alt="">
            <button class="btn small mi-down" aria-label="${T('mi.lock.prev', { n: i + 1 })}">▼</button>
          </div>`).join('')}</div>
        <p class="mi-lockmsg" id="mi-lockmsg" role="status" aria-live="polite"></p>
        <div class="mi-row">
          <button class="btn lemon" id="mi-try" data-focus>${T('mi.lock.try')}</button>
          <button class="btn" id="mi-lclose">${T('mi.close')}</button>
        </div>
        <p class="mi-small">${T('mi.lock.keys')}</p>`,
        (card) => {
          card.querySelectorAll('.mi-dial').forEach((d, i) => {
            d.querySelector('.mi-up').addEventListener('click', () => spin(i, 1, card));
            d.querySelector('.mi-down').addEventListener('click', () => spin(i, -1, card));
          });
          card.querySelector('#mi-try').addEventListener('click', () => tryIt(card));
          card.querySelector('#mi-lclose').addEventListener('click', () => this.close());
          render(card);
          this.lockKeys = (e) => {
            const back = VR.isRTL() ? 1 : dials - 1, fwd = VR.isRTL() ? dials - 1 : 1;
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') { focus = (focus + back) % dials; render(card); }
            else if (e.code === 'ArrowRight' || e.code === 'KeyD') { focus = (focus + fwd) % dials; render(card); }
            else if (e.code === 'ArrowUp' || e.code === 'KeyW') spin(focus, 1, card);
            else if (e.code === 'ArrowDown' || e.code === 'KeyS') spin(focus, -1, card);
            else if (e.code === 'Enter') tryIt(card);
            else return;
            e.preventDefault();
          };
        });
    }

    showJournal(run) {
      const steps = run.objectiveSteps();
      const sec = run.secondaryStatus();
      const hints = run.def.hints || [];
      const html = () => `
        <div class="mi-eyebrow">${T('mi.j.title', { name: esc(L(run.def.name)) })}</div>
        <div class="mi-jcols">
          <section>
            <h3>${T('mi.j.objective')}</h3>
            <p class="mi-small"><b>${esc(L(run.def.objective))}</b></p>
            <ul class="mi-checks">${steps.map(s => `<li class="${s.done ? 'done' : ''}"><span class="mi-box ${s.done ? 'done' : ''}"></span>${esc(L(s.text))}</li>`).join('')}</ul>
            ${sec.length ? `<h3>${T('mi.j.bonus')}</h3><ul class="mi-checks">${sec.map(s => `<li class="${s.done ? 'done' : ''}"><span class="mi-box ${s.done ? 'done' : ''}"></span>${esc(L(s.text))}${s.type === 'collect' ? ` (${s.detail})` : ''}</li>`).join('')}</ul>` : ''}
            <h3>${T('mi.j.items')}</h3>
            <p class="mi-small">${run.inventory.length ? run.inventory.map(i => esc(L(i.name))).join(VR.isRTL() ? '، ' : ', ') : T('mi.j.noItems')}</p>
            <h3>${T('mi.j.hints')}</h3>
            <ol class="mi-hints">${hints.slice(0, run.hintsUsed).map(h => `<li>${esc(L(h))}</li>`).join('')}</ol>
            ${run.hintsUsed < hints.length ? `<button class="btn small" id="mi-hint">${T('mi.j.showHint', { n: hints.length - run.hintsUsed })}</button>` : ''}
          </section>
          <section>
            <h3>${T('mi.j.clues', { n: run.journal.length })}</h3>
            ${run.journal.length ? run.journal.map(j => `<div class="mi-jentry"><div class="mi-jtitle">${esc(L(j.title))}</div><div class="mi-jtext">${rich(j.text)}</div></div>`).join('')
              : `<p class="mi-small">${T('mi.j.noClues')}</p>`}
          </section>
        </div>
        <button class="btn" id="mi-jclose" data-focus>${T('mi.close')} <span class="mi-key">J</span></button>`;
      const bind = (card) => {
        card.querySelector('#mi-jclose').addEventListener('click', () => this.close());
        const hb = card.querySelector('#mi-hint');
        if (hb) hb.addEventListener('click', () => { run.hintsUsed++; VR.Audio.play('clue'); card.innerHTML = html(); bind(card); });
      };
      this.open('journal', html(), bind);
    }

    showPause(settings, handlers) {
      this.open('pause', `
        <h2 class="heading">${T('mi.p.title')}</h2>
        <button class="btn primary" id="mi-resume" data-focus>${T('mi.p.resume')}</button>
        <div class="mi-setting"><label for="mi-sens">${T('mi.p.sens')}</label><input type="range" id="mi-sens" min="0.2" max="3" step="0.1" value="${settings.sens}"><output id="mi-sens-v">${settings.sens.toFixed(1)}</output></div>
        <div class="mi-setting"><label for="mi-fov">${T('mi.p.fov')}</label><input type="range" id="mi-fov" min="90" max="105" step="1" value="${settings.fov}"><output id="mi-fov-v">${settings.fov}°</output></div>
        ${handlers.persistent ? `<p class="mi-small">${T('adv.savedNote')}</p>
        <button class="btn" id="mi-quit">${T('adv.toMenu')}</button>` : `<div class="mi-row">
          <button class="btn" id="mi-restart">${T('mi.p.restart')}</button>
          <button class="btn" id="mi-leave">${T('mi.p.leave')}</button>
        </div>
        <p class="mi-small">${RT('mi.p.leaveNote')}</p>
        <button class="btn small" id="mi-quit">${T('mi.p.quit')}</button>`}`,
        (card) => {
          card.querySelector('#mi-resume').addEventListener('click', () => { VR.Audio.play('click'); handlers.resume(); });
          if (!handlers.persistent) {
            card.querySelector('#mi-restart').addEventListener('click', () => { VR.Audio.play('click'); handlers.restart(); });
            card.querySelector('#mi-leave').addEventListener('click', () => { VR.Audio.play('click'); handlers.leave(); });
          }
          card.querySelector('#mi-quit').addEventListener('click', () => { VR.Audio.play('click'); handlers.quit(); });
          const sens = card.querySelector('#mi-sens'), fov = card.querySelector('#mi-fov');
          sens.addEventListener('input', () => { card.querySelector('#mi-sens-v').textContent = (+sens.value).toFixed(1); handlers.setting('sens', +sens.value); });
          fov.addEventListener('input', () => { card.querySelector('#mi-fov-v').textContent = fov.value + '°'; handlers.setting('fov', +fov.value); });
        });
    }

    showResults(run, summary, stats, onReturn) {
      const sec = run.secondaryStatus();
      this.open('results', `
        <div class="mi-eyebrow">${T('mi.missionOf', { n: run.def.order, total: this.current ? this.current.total : run.def.order })} · ${esc(L(run.def.name))}</div>
        <h2 class="heading mi-done">${T('mi.r.title')}</h2>
        <div class="mi-stats">
          <div><span>${T('mi.r.time')}</span><b>${VR.Missions.fmtTime(run.time)}</b></div>
          <div><span>${T('mi.r.clues')}</span><b>${stats.clues}/${stats.cluesTotal}</b></div>
          <div><span>${T('mi.r.mistakes')}</span><b>${run.mistakes}</b></div>
          <div><span>${T('mi.r.hints')}</span><b>${run.hintsUsed}</b></div>
        </div>
        ${sec.length ? `<ul class="mi-checks">${sec.map(s => `<li class="${s.done ? 'done' : ''}"><span class="mi-box ${s.done ? 'done' : ''}"></span>${esc(L(s.text))}</li>`).join('')}</ul>` : ''}
        <div class="mi-rewards">
          <h3>${T('mi.r.rewards')}</h3>
          ${summary.lines.map(l => `<div class="mi-rline"><span>${esc(l.key ? T(l.key) : L(l.text))}</span><b>${l.score ? `<span class="num">+${l.score.toLocaleString('en-US')}</span> ${T('mi.r.score')}` : ''}${l.score && l.coins ? ' · ' : ''}${l.coins ? `<span class="num">+${l.coins}</span> <span class="coin-ico"></span>` : ''}</b></div>`).join('')}
          ${summary.achievements.map(a => `<div class="mi-ach">★ ${esc(T('ach.' + a))}</div>`).join('')}
        </div>
        ${stats.items.length ? `<p class="mi-small">${T('mi.r.items', { list: stats.items.map(x => esc(L(x))).join(VR.isRTL() ? '، ' : ', ') })}</p>` : ''}
        <button class="btn primary" id="mi-return" data-focus>${RT('mi.r.return')}</button>`,
        (card) => card.querySelector('#mi-return').addEventListener('click', () => { VR.Audio.play('click'); onReturn(); }));
    }

    showFailed(run, onRetry, onReturn) {
      this.open('failed', `
        <div class="mi-eyebrow">${esc(L(run.def.name))}</div>
        <h2 class="heading">${T('mi.f.title')}</h2>
        <p class="mi-intro">${RT('mi.f.text')}</p>
        <div class="mi-row">
          <button class="btn lemon" id="mi-retry" data-focus>${T('mi.f.retry')}</button>
          <button class="btn" id="mi-fret">${RT('mi.r.return')}</button>
        </div>`,
        (card) => {
          card.querySelector('#mi-retry').addEventListener('click', () => { VR.Audio.play('click'); onRetry(); });
          card.querySelector('#mi-fret').addEventListener('click', () => { VR.Audio.play('click'); onReturn(); });
        });
    }

    // ------------------------------------------------------------ touch
    buildTouch() {
      const zone = $('#mi-stickzone'), stick = $('#mi-stick'), knob = $('#mi-knob'), look = $('#mi-lookzone');
      let sid = null, ox = 0, oy = 0, lid = null, lx = 0, ly = 0;
      zone.addEventListener('pointerdown', (e) => {
        sid = e.pointerId; ox = e.clientX; oy = e.clientY; try { zone.setPointerCapture(sid); } catch (err) { /* synthetic or ended pointer */ }
        const zr = zone.getBoundingClientRect();          // the stick lives inside the zone: draw it under the finger
        stick.style.left = (ox - zr.left) + 'px'; stick.style.top = (oy - zr.top) + 'px'; stick.classList.add('on');
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== sid) return;
        let dx = e.clientX - ox, dy = e.clientY - oy;
        const l = Math.hypot(dx, dy), R = 50;
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        VR.Input.setTouchMove(dx / R, -dy / R);
      });
      const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; stick.classList.remove('on'); stick.style.left = ''; stick.style.top = ''; VR.Input.setTouchMove(0, 0); };
      zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
      look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; try { look.setPointerCapture(lid); } catch (err) { /* ignore */ } });
      look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; VR.Input.addLook((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
      const endLook = (e) => { if (e.pointerId === lid) lid = null; };
      look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
      this.root.querySelectorAll('.mi-tbtn').forEach(b => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (b.dataset.act) VR.Input.press(b.dataset.act);
          if (b.dataset.hold) { VR.Input.hold(b.dataset.hold, true); if (b.dataset.hold === 'crouch') VR.Input.press('slide'); }
        });
        const up = () => { if (b.dataset.hold) VR.Input.hold(b.dataset.hold, false); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      });
    }
  }

  VR.MissionUI = MissionUI;
})();
