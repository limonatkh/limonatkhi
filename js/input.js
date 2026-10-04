/* =====================================================================
 * INPUT — the game's single input system, with two modes:
 *
 *  'runner' (default) : keyboard + touch swipes → 4 queued actions
 *                       'left' | 'right' | 'jump' | 'slide'
 *  'fp'  (missions)   : held movement keys, mouse look (pointer lock,
 *                       or drag-to-look when the browser refuses it),
 *                       queued one-shot actions and touch controls.
 *
 * Mission code never reads the DOM events itself; it asks VR.Input for
 * the current move vector, look delta and actions. Touch buttons call
 * VR.Input.press()/hold(), so mobile support never touches mission logic.
 * ===================================================================== */
(function () {
  const queue = [];              // runner actions
  let enabled = false;
  let onPause = null;
  let mode = 'runner';

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'slide', KeyS: 'slide',
    KeyE: 'interact',                    // 1v1 gate beside the track
  };

  // ---- first-person bindings -----------------------------------------
  const FP_ACTIONS = {
    Space: 'jump', KeyC: 'slide', ControlLeft: 'slide', ControlRight: 'slide',
    KeyE: 'interact', KeyF: 'interact', KeyQ: 'burst',
    KeyJ: 'journal', Tab: 'journal', KeyR: 'reload',
    Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', KeyG: 'grenade', KeyH: 'medkit',
  };
  const FP_HOLD = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'ControlLeft', 'ControlRight', 'ShiftLeft']);
  const held = new Set();
  const fpQueue = [];
  const look = { x: 0, y: 0 };
  const touchMove = { x: 0, y: 0 };      // virtual stick, -1..1
  const touchHold = new Set();           // e.g. 'crouch' held from a touch button
  let fpEnabled = false;
  let dragLook = false, lastMX = 0, lastMY = 0;
  let wantLock = false;

  // phones/tablets: no mouse to capture. Asking for pointer lock there (e.g. together with
  // fullscreen) could grab and drop it at once, which reads as "Esc" and paused the room.
  const touchFirst = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };

  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;                       // let text fields receive every key
    if (mode === 'fp') {
      if (e.code === 'Escape' || e.code === 'KeyP') { onPause && onPause(); return; }
      if (!fpEnabled) return;
      if (FP_HOLD.has(e.code)) { held.add(e.code); e.preventDefault(); }
      const a = FP_ACTIONS[e.code];
      if (a) { e.preventDefault(); if (!e.repeat) fpQueue.push(a); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { onPause && onPause(); return; }
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (enabled && !e.repeat) queue.push(a);
  });
  window.addEventListener('keyup', (e) => { held.delete(e.code); });
  window.addEventListener('blur', () => { held.clear(); touchHold.clear(); });

  // ---- mouse look --------------------------------------------------------
  const locked = () => document.pointerLockElement === surface();
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'fp' || !fpEnabled) return;
    if (locked()) { look.x += e.movementX; look.y += e.movementY; }
    else if (dragLook) { look.x += e.clientX - lastMX; look.y += e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY; }
  });
  // mouse buttons (1v1 arena): left = fire while the mouse is captured, right = aim/scope
  window.addEventListener('mousedown', (e) => {
    if (mode !== 'fp' || !fpEnabled) return;
    if (e.button === 0 && locked()) { fpQueue.push('fire'); touchHold.add('fire'); }
    if (e.button === 2) touchHold.add('aim');
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) touchHold.delete('aim'); if (e.button === 0) touchHold.delete('fire'); });
  window.addEventListener('contextmenu', (e) => { if (mode === 'fp') e.preventDefault(); });
  window.addEventListener('wheel', (e) => {
    if (mode === 'fp' && fpEnabled) fpQueue.push(e.deltaY > 0 ? 'slotNext' : 'slotPrev');
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    // a lock granted after we stopped wanting it (e.g. a menu opened meanwhile): give it back
    if (locked() && (!wantLock || !fpEnabled || mode !== 'fp')) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } return; }
    // the browser releases the lock on Esc: treat that as "pause"
    if (mode === 'fp' && wantLock && !locked() && fpEnabled && !touchFirst()) { wantLock = false; onPause && onPause(); }
    else if (!locked()) wantLock = false;
  });

  // --- swipes (runner) ----------------------------------------------------
  let sx = 0, sy = 0, tracking = false, fired = false;
  const MIN = 28; // px
  function start(x, y) { sx = x; sy = y; tracking = true; fired = false; }
  function move(x, y) {
    if (!tracking || fired) return;
    const dx = x - sx, dy = y - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN) return;
    fired = true; // fire as soon as the swipe is recognised (feels snappier)
    if (enabled) queue.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'slide' : 'jump'));
  }
  function end() { tracking = false; }

  const surface = () => document.getElementById('game');
  window.addEventListener('DOMContentLoaded', () => {
    const el = surface();
    el.addEventListener('touchstart', (e) => { if (mode !== 'runner') return; const t = e.changedTouches[0]; start(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (mode !== 'runner') return; const t = e.changedTouches[0]; move(t.clientX, t.clientY); if (enabled) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (mode === 'fp') {
        if (!fpEnabled) return;
        // try pointer lock; if the page may not lock, drag to look instead
        if (!locked()) {
          wantLock = true;
          let p;
          try { p = el.requestPointerLock(); } catch (err) { wantLock = false; }
          if (p && p.catch) p.catch(() => { wantLock = false; });
          dragLook = true; lastMX = e.clientX; lastMY = e.clientY;
        }
        return;
      }
      start(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && mode === 'runner') move(e.clientX, e.clientY); });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { end(); dragLook = false; } });
  });

  VR.Input = {
    // ---- runner API (unchanged)
    setEnabled(v) { enabled = v; if (!v) queue.length = 0; },
    next() { return queue.shift(); },
    clear() { queue.length = 0; },
    onPause(fn) { onPause = fn; },
    touchFirst,

    // ---- mode switching
    setMode(m) {
      mode = m;
      held.clear(); fpQueue.length = 0; queue.length = 0; look.x = look.y = 0;
      touchMove.x = touchMove.y = 0; touchHold.clear();
      if (m !== 'fp') this.releaseLock();
    },
    get mode() { return mode; },
    setFPEnabled(v) {
      fpEnabled = v;
      if (!v) { held.clear(); fpQueue.length = 0; look.x = look.y = 0; dragLook = false; touchMove.x = touchMove.y = 0; touchHold.clear(); }
    },
    requestLock() {
      const el = surface();
      if (!el || locked() || touchFirst()) return;
      wantLock = true;
      try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => { wantLock = false; }); } catch (e) { wantLock = false; }
    },
    releaseLock() { wantLock = false; if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } } },
    isLocked: locked,

    // ---- first-person queries
    /** movement intent in local space: x = strafe right, y = forward. */
    moveVector() {
      let x = 0, y = 0;
      if (held.has('KeyW') || held.has('ArrowUp')) y += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      x += touchMove.x; y += touchMove.y;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    aimHeld() { return touchHold.has('aim'); },
    /** fire button held (automatic weapons): left mouse button while captured, or the touch FIRE button */
    fireHeld() { return touchHold.has('fire'); },
    crouchHeld() { return held.has('KeyC') || held.has('ControlLeft') || held.has('ControlRight') || touchHold.has('crouch'); },
    takeLook() { const r = { x: look.x, y: look.y }; look.x = look.y = 0; return r; },
    nextAction() { return fpQueue.shift(); },

    // ---- hooks for touch controls (mission UI)
    press(action) { if (mode === 'fp' && fpEnabled) fpQueue.push(action); },
    hold(name, on) { if (on) touchHold.add(name); else touchHold.delete(name); },
    setTouchMove(x, y) { touchMove.x = x; touchMove.y = y; },
    addLook(dx, dy) { if (fpEnabled) { look.x += dx; look.y += dy; } },
  };
})();
