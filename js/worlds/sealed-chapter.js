/* =====================================================================
 * SEALED CHAPTER — a story chapter behind the square's locked door.
 * (This file is copied as-is to the public game: js/worlds/sealed-chapter.js)
 *
 * Map 2 (Lemon Square, js/adventure/hubworld.js) has two sealed places in
 * the hall of chapter doors, signed "Chapter soon". The east one becomes a
 * locked door: using it asks for a password.
 *
 * The chapter is NOT in the public repository in a readable form. It is
 * js/story/sealed-chapter.data.js, encrypted (AES-GCM; the key comes from
 * the password by PBKDF2-SHA-256). The right password opens the chapter
 * (decrypts it and runs it: it registers its own area, map and parts) and
 * travels into it. The password is not stored anywhere in the code. This
 * device then remembers the KEY (localStorage, beside the save, not in it),
 * so the door and CONTINUE open the chapter again without asking.
 *
 *   component  rdSealedDoor  { id, type: 'rdSealedDoor', chapter: 'c1', sign: 'soonSignE' }
 *              on map 1 (no such door) it is inert
 *   data       VR.SEALED_CHAPTERS[chapter] = { v, kdf, iter, salt, iv, data }   (base64)
 *              the decrypted chapter sets VR.SEALED_CHAPTERS[chapter].area
 *
 * Built from the private source repository by tools/seal-chapter.mjs.
 * ===================================================================== */
(function () {
  const T = THREE;
  const MS = VR.Missions;
  const PI = Math.PI;
  const tr = (k) => VR.t(k);

  Object.assign(VR.I18N.STRINGS.en, {
    'rd.lock.door': 'Chapter soon', 'rd.lock.unlock': 'Unlock', 'rd.lock.enter': 'Enter',
    'rd.lock.title': 'A sealed chapter', 'rd.lock.ask': 'Enter the password', 'rd.lock.open': 'OPEN', 'rd.lock.cancel': 'CANCEL',
    'rd.lock.wrong': 'Wrong password', 'rd.lock.wait': 'Opening…', 'rd.lock.noCrypto': 'This page can\'t open the chapter here (it needs https or a local file).',
    'rd.lock.show': 'Show',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'rd.lock.door': 'فصل قادم', 'rd.lock.unlock': 'افتح', 'rd.lock.enter': 'ادخل',
    'rd.lock.title': 'فصل مختوم', 'rd.lock.ask': 'أدخل كلمة السر', 'rd.lock.open': 'افتح', 'rd.lock.cancel': 'إلغاء',
    'rd.lock.wrong': 'كلمة السر غير صحيحة', 'rd.lock.wait': 'جارٍ الفتح…', 'rd.lock.noCrypto': 'لا يمكن فتح الفصل من هنا (يلزم https أو ملف محلي).',
    'rd.lock.show': 'إظهار',
  });

  // ------------------------------------------------------------------ the lock
  const KEY = (id) => 'cubeexpress.sealed.' + id;
  const store = {
    get(id) { try { return localStorage.getItem(KEY(id)); } catch (e) { return null; } },
    set(id, v) { try { localStorage.setItem(KEY(id), v); } catch (e) { /* private window: asks again next time */ } },
    del(id) { try { localStorage.removeItem(KEY(id)); } catch (e) { /* ignore */ } },
  };
  const b64d = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64e = (u) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  /** the same text however it was typed: no diacritics, one form of alef, single spaces */
  const norm = (s) => String(s).normalize('NFC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  const subtle = () => (window.crypto && window.crypto.subtle) || null;

  async function deriveKey(pw, S) {
    const enc = new TextEncoder(), c = subtle();
    const base = await c.importKey('raw', enc.encode(norm(pw)), 'PBKDF2', false, ['deriveBits']);
    const bits = await c.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(S.salt), iterations: S.iter }, base, 256);
    return new Uint8Array(bits);
  }
  async function decrypt(raw, S) {
    const c = subtle();
    const key = await c.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const pt = await c.decrypt({ name: 'AES-GCM', iv: b64d(S.iv) }, key, b64d(S.data));
    return new TextDecoder().decode(pt);
  }
  const state = {};                   // chapter id → { open, area, busy }
  const S = (id) => (VR.SEALED_CHAPTERS || {})[id];
  /** run the opened chapter once (it registers itself) */
  function run(id, code) {
    const st = state[id] || (state[id] = {});
    if (st.open) return true;
    (0, eval)(code);                  // (global scope, like a script tag)
    st.open = true; st.area = S(id).area;
    // the way back from the chapter: in front of this door (map 2) / home (map 1)
    if (VR.RD) {
      const two = VR.MapChoice && VR.MapChoice.hub === 2, H = VR.ADVENTURE.HOME || { pos: [0, 0.05, -34.5], yaw: 0 };
      VR.RD.HUB_SPOTS = two && st.back ? [{ pos: st.back.pos.slice(), yaw: st.back.yaw }] : two ? [{ pos: [18, 0.05, -72.1], yaw: PI }] : [{ pos: H.pos.slice(), yaw: H.yaw }];
    }
    return true;
  }
  /** try a password; true when the chapter is open */
  async function unlock(id, pw) {
    const D = S(id); if (!D || !subtle()) return false;
    const raw = await deriveKey(pw, D);
    let code;
    try { code = await decrypt(raw, D); } catch (e) { return false; }      // (a wrong password fails the authentication)
    run(id, code); store.set(id, b64e(raw));
    return true;
  }
  /** this device opened it before: open it again (at load, so CONTINUE finds the chapter) */
  async function reopen(id) {
    const D = S(id), k = store.get(id);
    if (!D || !k || !subtle()) return false;
    try { run(id, await decrypt(b64d(k), D)); return true; }
    catch (e) { store.del(id); return false; }                             // (the chapter was rebuilt with another key)
  }
  const ready = {};
  for (const id in VR.SEALED_CHAPTERS || {}) ready[id] = reopen(id).catch(e => { console.error('[sealed]', e); return false; });

  // ------------------------------------------------------------------ the password box
  function ensureStyles() {
    if (document.getElementById('rdk-style')) return;
    const st = document.createElement('style'); st.id = 'rdk-style';
    st.textContent = `
      .rdk-back { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(10,12,20,.55); }
      .rdk { width: min(420px, 92vw); padding: 18px 20px; display: grid; gap: 10px; text-align: center; }
      .rdk h3 { margin: 0; font-family: var(--display); color: var(--lemon); font-size: 22px; }
      .rdk p { margin: 0; color: var(--text); font-size: 15px; }
      .rdk-row { display: flex; gap: 6px; }
      .rdk-row input { flex: 1; min-width: 0; font: 17px var(--body); padding: 9px 10px; border: 3px solid var(--ink); background: #f7f4ea; color: #161616; }
      .rdk-row button { font: 13px var(--body); padding: 0 10px; border: 3px solid var(--ink); background: #d9dde6; cursor: pointer; }
      .rdk-err { color: #ff7a6c !important; font-weight: 700; }
      .rdk-btns { display: flex; gap: 8px; justify-content: center; }
      .rdk.shake { animation: rdkShake .35s; }
      @keyframes rdkShake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
    `;
    document.head.appendChild(st);
  }
  /** ask for the password: resolves true once the chapter is open, false if cancelled */
  function ask(id, mgr) {
    ensureStyles();
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'rdk-back';
      back.innerHTML = `<form class="rdk panel" dir="${VR.isRTL() ? 'rtl' : 'ltr'}">
          <h3>🔒 ${tr('rd.lock.title')}</h3><p>${tr('rd.lock.ask')}</p>
          <div class="rdk-row"><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" dir="auto"><button type="button" class="rdk-eye">${tr('rd.lock.show')}</button></div>
          <p class="rdk-err" hidden></p>
          <div class="rdk-btns"><button type="submit" class="btn">${tr('rd.lock.open')}</button><button type="button" class="btn small rdk-cancel">${tr('rd.lock.cancel')}</button></div>
        </form>`;
      document.body.appendChild(back);
      const form = back.firstElementChild, input = form.querySelector('input'), err = form.querySelector('.rdk-err'), ok = form.querySelector('[type=submit]');
      mgr.freeze(true);                                         // (no moving or looking while typing)
      setTimeout(() => input.focus(), 30);
      if (!subtle()) { err.textContent = tr('rd.lock.noCrypto'); err.hidden = false; ok.disabled = true; }
      const close = (opened) => {
        back.remove(); mgr.freeze(false);
        if (!opened) mgr.onModal(false);                       // (back to playing: a click or a key, so the mouse can be taken again)
        resolve(opened);
      };
      form.querySelector('.rdk-eye').addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); });
      form.querySelector('.rdk-cancel').addEventListener('click', () => close(false));
      back.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(false); } });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!input.value.trim() || ok.disabled) return;
        ok.disabled = true; err.hidden = false; err.textContent = tr('rd.lock.wait');
        let opened = false;
        try { opened = await unlock(id, input.value); } catch (x) { console.error('[sealed]', x); }
        if (opened) { VR.Audio.play('unlock'); close(true); return; }
        ok.disabled = false; err.textContent = tr('rd.lock.wrong'); VR.Audio.play('buzz');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        input.select();
      });
    });
  }

  // ------------------------------------------------------------------ the door
  MS.Components.rdSealedDoor = {
    build(def, ctx) {
      const id = def.chapter || 'c1', A = ctx.level.anchors[def.sign || 'soonSignE'];
      const inert = { id: def.id, def, obj: null, kind: null, hit: null, prompt: () => null, use: () => {}, update: () => {}, sync: () => {} };
      if (!A || !S(id)) return inert;                           // (map 1 has no such door)
      const x = A.pos[0], z = A.pos[2] + 0.06;                 // the face of the sealed leaf
      // a lock plate on the leaf: a red light while sealed, green once this device has opened it
      const g = new T.Group(), vb = new VR.VoxelBuilder();
      vb.addColorBox(0, 0, 0, 0.42, 0.56, 0.06, 0x2f3542); vb.addColorBox(0, 0.06, 0.04, 0.3, 0.3, 0.04, 0xf2c230);
      vb.addColorBox(0, 0.16, 0.07, 0.08, 0.12, 0.03, 0x161616); vb.addColorBox(0, 0.1, 0.07, 0.04, 0.08, 0.03, 0x161616);
      g.add(vb.build());
      const lm = new T.MeshBasicMaterial({ color: 0xff4a3a }); lm.userData.own = true; lm.toneMapped = false;
      const led = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.04), lm); led.position.set(0, 0.46, 0.05); g.add(led);
      g.position.set(x + 0.7, 0.85, z); ctx.scene.add(g);
      const st = state[id] || (state[id] = {});
      st.back = { pos: [+x.toFixed(2), 0.05, +(z + 3.6).toFixed(2)], yaw: PI };
      const go = () => {
        if (VR.RD) VR.RD.cameFrom = { pos: st.back.pos.slice(), yaw: st.back.yaw };
        ctx.mgr.game.modes.travel(st.area || S(id).area);
      };
      let t = 0;
      return {
        id: def.id, def, obj: g, kind: 'interact',
        hit: new T.Box3().setFromCenterAndSize(new T.Vector3(x, 1.45, z + 0.25), new T.Vector3(2.2, 2.9, 0.6)),
        prompt: () => (st.busy ? null : { verb: st.open ? tr('rd.lock.enter') : '🔒 ' + tr('rd.lock.unlock'), label: tr('rd.lock.door') }),
        use: () => {
          if (st.busy) return;
          if (st.open) { go(); return; }
          st.busy = true;
          Promise.resolve(ready[id]).then(() => (st.open ? true : ask(id, ctx.mgr))).then((opened) => { st.busy = false; if (opened) go(); });
        },
        update: (dt) => { t += dt; lm.color.setHex(st.open ? 0x5be37a : (Math.sin(t * 3) > 0 ? 0xff4a3a : 0x9a2a22)); },
        sync: () => {},
      };
    },
  };

  // the door stands in the square (js/adventure/hub.js's area; map 2 places it, map 1 has none)
  const hub = VR.ADVENTURE && VR.ADVENTURE.areas && VR.ADVENTURE.areas.hub;
  if (hub && !hub.entities.some(e => e.type === 'rdSealedDoor')) hub.entities.push({ id: 'sealedDoorE', type: 'rdSealedDoor', chapter: 'c1', sign: 'soonSignE' });
  VR.SealedChapters = { state, unlock, ready, norm };
})();
