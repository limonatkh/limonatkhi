/* =====================================================================
 * ADMIN — the owner's free camera (Freecam / spectator).
 *
 * Only for the game's owner: it opens with a pass phrase that is not in
 * this file — only a hash of a hash of it is (ADMIN_H). Entering the right
 * phrase once on a device keeps that device unlocked (it stores the first
 * hash, never the phrase). Nobody without the phrase can unlock it: the
 * stored value has to hash to ADMIN_H.
 *
 *   ` (the key under Esc)   locked: asks for the phrase · unlocked: free camera on / off
 *   long press (3 s) on the menu's title       the same, for phones
 *   ?admin in the address                       asks for the phrase on load
 *
 * The free camera works in every first-person world (the square and the
 * other areas, the Mini Planet, missions, the 1v1 arena): the world keeps
 * running, my player stands still (the controls belong to the camera —
 * VR.Input.setHijack), the camera flies anywhere, through walls:
 *   WASD / stick   fly where you look       Space / C (Ctrl)   up / down
 *   Shift          fast                     H                  hide / show the HUD
 *   ` again or the 🎥 button: back to the player
 * ===================================================================== */
(function () {
  const T = THREE;
  const ADMIN_H = 'd92da3259e311bc0fee3b50be669c047395149bd6e72c09e067440f878313fd5';
  const KEY = 'lm.adminKey';
  const t2 = (en, ar) => ({ en, ar });
  Object.assign(VR.I18N.STRINGS.en, { 'ad.title': 'Admin', 'ad.ph': 'Pass phrase', 'ad.ok': 'Unlock', 'ad.no': 'Wrong pass phrase', 'ad.yes': 'Admin unlocked on this device. ` = free camera',
    'ad.on': '🎥 FREECAM — WASD fly · Space/C up/down · Shift fast · H hide HUD · ` back', 'ad.where': 'The free camera works inside a world (first person)', 'ad.noCrypto': 'This page cannot check the pass phrase here (it needs https)' });
  Object.assign(VR.I18N.STRINGS.ar, { 'ad.title': 'المشرف', 'ad.ph': 'كلمة السر', 'ad.ok': 'فتح', 'ad.no': 'كلمة السر غلط', 'ad.yes': 'انفتح وضع المشرف على هذا الجهاز. ` = الكاميرا الحرة',
    'ad.on': '🎥 كاميرا حرة — WASD طيران · Space/C فوق/تحت · Shift سريع · H إخفاء الواجهة · ` رجوع', 'ad.where': 'الكاميرا الحرة تشتغل داخل عالم (منظور أول)', 'ad.noCrypto': 'الصفحة لا تقدر تتحقق من كلمة السر هنا (تحتاج https)' });

  async function sha(text) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } } };

  const Admin = {
    ok: false, freecam: false,
    pos: new T.Vector3(), yaw: 0, pitch: 0, hud: true,
    async init() {
      const k = store.get();
      if (k && window.crypto && crypto.subtle) { try { this.ok = (await sha(k)) === ADMIN_H; } catch (e) { this.ok = false; } }
      window.addEventListener('keydown', (e) => {
        const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        if (e.code === 'Backquote') { e.preventDefault(); this.key(); }
        else if (e.code === 'KeyH' && this.freecam) { this.hud = !this.hud; document.body.classList.toggle('fc-nohud', !this.hud); }
      });
      // phones: hold the menu's title for 3 s
      const title = document.querySelector('#menu .title');
      if (title) {
        let tm = null;
        title.addEventListener('pointerdown', () => { tm = setTimeout(() => this.key(), 3000); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) title.addEventListener(ev, () => clearTimeout(tm));
      }
      this.btn = document.createElement('button'); this.btn.className = 'btn small fc-btn'; this.btn.textContent = '🎥'; this.btn.hidden = true;
      this.btn.addEventListener('click', () => this.toggle()); document.body.appendChild(this.btn);
      this.chip = document.createElement('div'); this.chip.className = 'fc-chip'; this.chip.hidden = true; document.body.appendChild(this.chip);
      if (/[?&]admin\b/.test(location.search) && !this.ok) setTimeout(() => this.ask(), 800);
    },
    key() { if (!this.ok) this.ask(); else this.toggle(); },
    /** the pass phrase box */
    ask() {
      if (document.getElementById('adminBox')) return;
      const box = document.createElement('form'); box.id = 'adminBox'; box.className = 'panel admin-box';
      box.innerHTML = `<b>${VR.t('ad.title')}</b><input type="password" autocomplete="off" spellcheck="false"><div class="row"><button class="btn small lemon" type="submit">${VR.t('ad.ok')}</button><button class="btn small" type="button">✕</button></div><small></small>`;
      const inp = box.querySelector('input'), msg = box.querySelector('small');
      inp.placeholder = VR.t('ad.ph');
      box.querySelector('button[type=button]').onclick = () => box.remove();
      box.onsubmit = async (e) => {
        e.preventDefault();
        if (!(window.crypto && crypto.subtle)) { msg.textContent = VR.t('ad.noCrypto'); return; }
        const k1 = await sha('lm-admin:' + inp.value.trim());
        if ((await sha(k1)) === ADMIN_H) { store.set(k1); this.ok = true; box.remove(); VR.UI.toast(VR.t('ad.yes'), 3000); this.sync(); }
        else { msg.textContent = VR.t('ad.no'); inp.value = ''; VR.Audio.play('buzz'); }
      };
      VR.Input.releaseLock();                                 // (the mouse is free to type)
      document.body.appendChild(box); setTimeout(() => inp.focus(), 50);
    },
    /** the camera of the world being played (first person), or null */
    world() {
      const g = VR.game; if (!g) return null;
      const st = g.state;
      if ((st === 'adventure' || st === 'mission') && g.missions.active && g.missions.run) return { cam: g.missions.camera, kind: 'missions' };
      if (st === 'duel' && g.duel.match) return { cam: g.duel.camera, kind: 'duel' };
      return null;
    },
    toggle(on = !this.freecam) {
      if (!this.ok) return;
      const w = this.world();
      if (on && !w) { VR.UI.toast(VR.t('ad.where'), 2200); return; }
      this.freecam = on;
      VR.Input.setHijack(on);
      if (on) {
        const c = w.cam; c.updateMatrixWorld();
        this.pos.copy(c.getWorldPosition(new T.Vector3()));
        const f = new T.Vector3(0, 0, -1).applyQuaternion(c.getWorldQuaternion(new T.Quaternion()));
        this.yaw = Math.atan2(-f.x, -f.z); this.pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
        this.kind = w.kind;
      } else { this.hud = true; document.body.classList.remove('fc-nohud'); }
      this.sync();
    },
    sync() {
      const w = this.world();
      if (this.btn) { this.btn.hidden = !(this.ok && w); this.btn.classList.toggle('on', this.freecam); }
      if (this.chip) { this.chip.hidden = !this.freecam; this.chip.textContent = VR.t('ad.on'); }
    },
    /** game loop, after the world moved and before it is drawn */
    update(dt) {
      if (this.ok && this.btn) { const vis = !!this.world(); if (this.btn.hidden === vis) this.sync(); }
      if (!this.freecam) return;
      const w = this.world();
      if (!w || w.kind !== this.kind) { this.toggle(false); return; }
      const I = VR.Input, lk = I.rawLook(), sens = VR.CONFIG.FP.MOUSE_SENS * (VR.Sens ? VR.Sens.get() : 1);
      this.yaw -= lk.x * sens; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - lk.y * sens));
      const mv = I.rawMove(), fast = I.rawSprint() ? 4 : 1, sp = 9 * fast * dt;
      const cp = Math.cos(this.pitch);
      const fwd = new T.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp), right = new T.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.pos.addScaledVector(fwd, mv.y * sp).addScaledVector(right, mv.x * sp);
      if (I.rawKey('Space')) this.pos.y += sp;
      if (I.rawKey('KeyC') || I.rawKey('ControlLeft')) this.pos.y -= sp;
      const cam = w.cam;
      cam.position.copy(this.pos);
      cam.quaternion.setFromEuler(new T.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      cam.updateMatrixWorld();
    },
  };
  VR.Admin = Admin;
  window.addEventListener('DOMContentLoaded', () => Admin.init());
})();
