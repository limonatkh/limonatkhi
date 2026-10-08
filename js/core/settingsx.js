/* =====================================================================
 * SETTINGS EXTRAS — two cards opened from Settings:
 *
 *   Controls   every first-person action with two inputs each. Click a
 *              slot, then press any key, mouse button (left / middle /
 *              right / side buttons) or turn the wheel (up / down).
 *              Esc cancels, Backspace clears. Saved on this device
 *              (VR.Input bindings, 'cubeexpress.keybinds').
 *   Crosshair  style (cross, cross + dot, dot, circle, T), colour, size,
 *              gap, thickness, outline — with a live preview. Used by
 *              the arena and the adventure / missions (VR.Crosshair).
 * ===================================================================== */
(function () {
  const T = (k, v) => VR.t(k, v);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  Object.assign(VR.I18N.STRINGS.en, {
    'kb.title': 'Controls', 'kb.sub': 'Click a box, then press a key, a mouse button or turn the wheel. Esc cancels, Backspace clears.',
    'kb.press': 'Press…', 'kb.reset': 'RESET TO DEFAULT', 'kb.open': '🎮 Controls', 'xh.open': '⌖ Crosshair',
    'kb.forward': 'Forward', 'kb.back': 'Back', 'kb.left': 'Left', 'kb.right': 'Right', 'kb.jump': 'Jump', 'kb.crouch': 'Crouch / slide (on/off)',
    'kb.sprint': 'Sprint', 'kb.fire': 'Fire', 'kb.aim': 'Aim / scope', 'kb.reload': 'Reload', 'kb.slot1': 'Weapon 1', 'kb.slot2': 'Weapon 2',
    'kb.slot3': 'Weapon 3', 'kb.knife': 'Knife', 'kb.slotNext': 'Next weapon', 'kb.slotPrev': 'Previous weapon', 'kb.burst': 'Lemon Burst / impulse grenade',
    'kb.grenade': 'Grenade', 'kb.mine': 'Mine', 'kb.medkit': 'Medkit', 'kb.interact': 'Use', 'kb.journal': 'Journal',
    'mouse.l': 'Left click', 'mouse.m': 'Middle click', 'mouse.r': 'Right click', 'mouse.4': 'Mouse 4', 'mouse.5': 'Mouse 5', 'mouse.wu': 'Wheel up', 'mouse.wd': 'Wheel down',
    'xh.title': 'Crosshair', 'xh.style': 'Style', 'xh.color': 'Colour', 'xh.size': 'Length', 'xh.gap': 'Gap', 'xh.thick': 'Thickness', 'xh.outline': 'Outline',
    'xh.s.cross': 'Cross', 'xh.s.crossdot': 'Cross + dot', 'xh.s.dot': 'Dot', 'xh.s.circle': 'Circle', 'xh.s.tee': 'T',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'kb.title': 'التحكم بالأزرار', 'kb.sub': 'اضغط على خانة، ثم اضغط أي زر في لوحة المفاتيح أو الماوس أو حرّك العجلة. Esc للإلغاء، Backspace للمسح.',
    'kb.press': 'اضغط زرًا…', 'kb.reset': 'إرجاع الافتراضي', 'kb.open': '🎮 التحكم بالأزرار', 'xh.open': '⌖ الكروسهير',
    'kb.forward': 'للأمام', 'kb.back': 'للخلف', 'kb.left': 'يسار', 'kb.right': 'يمين', 'kb.jump': 'قفز', 'kb.crouch': 'انخفاض / انزلاق (تشغيل/إيقاف)',
    'kb.sprint': 'ركض سريع', 'kb.fire': 'إطلاق', 'kb.aim': 'تصويب / منظار', 'kb.reload': 'تلقيم', 'kb.slot1': 'السلاح 1', 'kb.slot2': 'السلاح 2',
    'kb.slot3': 'السلاح 3', 'kb.knife': 'السكّين', 'kb.slotNext': 'السلاح التالي', 'kb.slotPrev': 'السلاح السابق', 'kb.burst': 'قفزة الليمون / قنبلة الدفع',
    'kb.grenade': 'قنبلة', 'kb.mine': 'لغم', 'kb.medkit': 'إسعاف', 'kb.interact': 'استخدام', 'kb.journal': 'الدفتر',
    'mouse.l': 'زر الماوس الأيسر', 'mouse.m': 'زر العجلة', 'mouse.r': 'زر الماوس الأيمن', 'mouse.4': 'زر الماوس 4', 'mouse.5': 'زر الماوس 5', 'mouse.wu': 'العجلة لأعلى', 'mouse.wd': 'العجلة لأسفل',
    'xh.title': 'الكروسهير', 'xh.style': 'الشكل', 'xh.color': 'اللون', 'xh.size': 'الطول', 'xh.gap': 'الفراغ', 'xh.thick': 'السماكة', 'xh.outline': 'إطار أسود',
    'xh.s.cross': 'صليب', 'xh.s.crossdot': 'صليب + نقطة', 'xh.s.dot': 'نقطة', 'xh.s.circle': 'دائرة', 'xh.s.tee': 'T',
  });

  /* ------------------------------------------------------------------ crosshair */
  const XH_DEF = { style: 'cross', color: '#ffffff', size: 7, gap: 4, thick: 2, outline: true };
  const COLORS = ['#ffffff', '#ffe14a', '#5fdc5f', '#4ae0ff', '#ff4a4a', '#ff7ae0'];
  const STYLES = ['cross', 'crossdot', 'dot', 'circle', 'tee'];
  let xh = Object.assign({}, XH_DEF, VR.UI.store.get('crosshair', {}));
  const Crosshair = {
    get() { return Object.assign({}, xh); },
    set(patch) { xh = Object.assign({}, xh, patch); VR.UI.store.set('crosshair', xh); this.apply(); },
    reset() { xh = Object.assign({}, XH_DEF); VR.UI.store.set('crosshair', xh); this.apply(); },
    /** the crosshair as an inline SVG */
    svg(c = xh) {
      const t = +c.thick, g = +c.gap, L = +c.size, pad = 3;
      const R = c.style === 'dot' ? t * 1.6 : c.style === 'circle' ? g + L / 2 + t : g + L;
      const S = Math.ceil(2 * (R + pad)), m = S / 2;
      const line = c.outline ? `stroke="rgba(0,0,0,.7)" stroke-width="1" paint-order="stroke"` : '';
      const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.color}" ${line}/>`;
      const dot = (r) => `<circle cx="${m}" cy="${m}" r="${r}" fill="${c.color}" ${line}/>`;
      let body = '';
      if (c.style === 'cross' || c.style === 'crossdot' || c.style === 'tee') {
        if (c.style !== 'tee') body += rect(m - t / 2, m - g - L, t, L);       // top
        body += rect(m - t / 2, m + g, t, L);                                  // bottom
        body += rect(m - g - L, m - t / 2, L, t);                              // left
        body += rect(m + g, m - t / 2, L, t);                                  // right
        if (c.style === 'crossdot') body += dot(Math.max(1, t * 0.7));
      } else if (c.style === 'dot') body += dot(t * 1.6);
      else {
        const r = g + L / 2;
        if (c.outline) body += `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="rgba(0,0,0,.7)" stroke-width="${t + 2}"/>`;
        body += `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${c.color}" stroke-width="${t}"/>` + dot(Math.max(1, t * 0.6));
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">${body}</svg>`;
    },
    /** draw it into every crosshair on the page */
    apply() { const s = this.svg(); document.querySelectorAll('.xh-target').forEach(el => { el.innerHTML = s; }); },
  };
  VR.Crosshair = Crosshair;

  /* ------------------------------------------------------------------ the two cards */
  const SettingsX = {
    init() {
      $('optControls').addEventListener('click', () => { VR.Audio.play('click'); this.openControls(); });
      $('optCrosshair').addEventListener('click', () => { VR.Audio.play('click'); this.openCrosshair(); });
      $('kbBack').addEventListener('click', () => { VR.Audio.play('click'); this.close(); });
      $('kbReset').addEventListener('click', () => { VR.Audio.play('click'); VR.Input.resetBinds(); this.renderControls(); });
      $('xhBack').addEventListener('click', () => { VR.Audio.play('click'); this.close(); });
      $('xhReset').addEventListener('click', () => { VR.Audio.play('click'); Crosshair.reset(); this.renderCrosshair(); });
      VR.I18N.onChange(() => { if (!$('kbScreen').hidden) this.renderControls(); if (!$('xhScreen').hidden) this.renderCrosshair(); });
      Crosshair.apply();
    },
    close() { VR.Input.cancelCapture(); $('kbScreen').hidden = true; $('xhScreen').hidden = true; },

    openControls() { this.close(); $('kbScreen').hidden = false; this.renderControls(); },
    renderControls() {
      const b = VR.Input.binds();
      const row = (a) => `<div class="kb-row"><span class="kb-name">${esc(T('kb.' + a))}</span>
        ${[0, 1].map(i => `<button class="btn small kb-key" type="button" data-a="${a}" data-i="${i}">${esc(VR.Input.label(b[a][i]))}</button>`).join('')}</div>`;
      $('kbList').innerHTML = VR.Input.ACTIONS.map(row).join('');
      $('kbList').querySelectorAll('.kb-key').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        VR.Audio.play('click');
        $('kbList').querySelectorAll('.kb-key.wait').forEach(x => x.classList.remove('wait'));
        btn.classList.add('wait'); btn.textContent = T('kb.press');
        // wait a tick so this very click is not taken as the new input
        setTimeout(() => VR.Input.captureNext((code) => {
          if (code !== null) VR.Input.setBind(btn.dataset.a, +btn.dataset.i, code);
          this.renderControls();
        }), 0);
      }));
    },

    openCrosshair() { this.close(); $('xhScreen').hidden = false; this.renderCrosshair(); },
    renderCrosshair() {
      const c = Crosshair.get();
      const slider = (k, min, max, step) => `<div class="xh-set"><label>${T('xh.' + k)}</label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${c[k]}"><output>${c[k]}</output></div>`;
      $('xhBody').innerHTML = `
        <div class="xh-preview"><div class="xh-target"></div></div>
        <div class="xh-set"><label>${T('xh.style')}</label><div class="xh-opts">${STYLES.map(s => `<button class="btn small xh-style ${c.style === s ? 'on' : ''}" data-s="${s}" type="button">${T('xh.s.' + s)}</button>`).join('')}</div></div>
        <div class="xh-set"><label>${T('xh.color')}</label><div class="xh-opts">${COLORS.map(col => `<button class="xh-col ${c.color === col ? 'on' : ''}" data-c="${col}" type="button" style="background:${col}" aria-label="${col}"></button>`).join('')}</div></div>
        ${slider('size', 2, 20, 1)}${slider('gap', 0, 14, 1)}${slider('thick', 1, 6, 1)}
        <div class="xh-set"><label>${T('xh.outline')}</label><button class="btn toggle xh-out" type="button" aria-pressed="${c.outline}">${c.outline ? T('on') : T('off')}</button></div>`;
      const body = $('xhBody');
      body.querySelectorAll('.xh-style').forEach(b => b.addEventListener('click', () => { Crosshair.set({ style: b.dataset.s }); this.renderCrosshair(); }));
      body.querySelectorAll('.xh-col').forEach(b => b.addEventListener('click', () => { Crosshair.set({ color: b.dataset.c }); this.renderCrosshair(); }));
      body.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => { Crosshair.set({ [r.dataset.k]: +r.value }); r.nextElementSibling.textContent = r.value; }));
      body.querySelector('.xh-out').addEventListener('click', () => { Crosshair.set({ outline: !Crosshair.get().outline }); this.renderCrosshair(); });
      Crosshair.apply();
    },
  };
  VR.SettingsX = SettingsX;
})();
