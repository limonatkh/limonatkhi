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

  // ---- first-person bindings (remappable: Settings → Controls) ----------
  // [action, kind, default inputs]  kind: hold (while down) · press (queued once) · toggle (crouch)
  // inputs: KeyboardEvent.code, 'Mouse0'…'Mouse4', 'WheelUp' / 'WheelDown'
  const ACTIONS = [
    ['forward', 'hold', ['KeyW', 'ArrowUp']], ['back', 'hold', ['KeyS', 'ArrowDown']],
    ['left', 'hold', ['KeyA', 'ArrowLeft']], ['right', 'hold', ['KeyD', 'ArrowRight']],
    ['jump', 'press', ['Space', null]], ['crouch', 'toggle', ['ControlLeft', 'KeyC']], ['sprint', 'hold', ['ShiftLeft', 'ShiftRight']],
    ['fire', 'hold', ['Mouse0', null]], ['aim', 'hold', ['Mouse2', null]], ['reload', 'press', ['KeyR', null]],
    ['slot1', 'press', ['Digit1', null]], ['slot2', 'press', ['Digit2', null]], ['slot3', 'press', ['Digit3', null]], ['knife', 'press', ['KeyV', null]],
    ['slotNext', 'press', ['WheelDown', null]], ['slotPrev', 'press', ['WheelUp', null]],
    ['burst', 'press', ['KeyQ', null]], ['grenade', 'press', ['KeyG', null]], ['mine', 'press', ['KeyB', null]], ['medkit', 'press', ['KeyH', null]],
    ['interact', 'press', ['KeyE', null]], ['journal', 'press', ['KeyJ', 'Tab']],
    ['ability', 'press', ['KeyX', 'Mouse3']], ['grab', 'press', ['KeyF', null]], ['view', 'press', ['KeyT', null]],
  ];
  const KIND = Object.fromEntries(ACTIONS.map(a => [a[0], a[1]]));
  const DEFAULTS = () => Object.fromEntries(ACTIONS.map(a => [a[0], a[2].slice()]));
  const loadBinds = () => {
    const out = DEFAULTS();
    try { const v = JSON.parse(localStorage.getItem('cubeexpress.keybinds') || 'null'); if (v) for (const k in out) if (Array.isArray(v[k])) out[k] = [v[k][0] || null, v[k][1] || null]; } catch (e) { /* defaults */ }
    return out;
  };
  let binds = loadBinds();
  let byInput = new Map();                // input → [actions]
  const reindex = () => { byInput = new Map(); for (const k in binds) for (const c of binds[k]) if (c) { if (!byInput.has(c)) byInput.set(c, []); byInput.get(c).push(k); } };
  reindex();
  const active = new Set();               // inputs held down right now
  let aimBlock = false;                   // aim was dropped (reload / switch): ignore the held button until it is let go
  let capture = null;                     // Settings: waiting for the next key / button
  const isHeld = (a) => binds[a].some(c => c && active.has(c));
  let crouchOn = false;                  // crouch toggles: press to crouch (or slide when running), press again to stand
  const held = active;
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

  /** an input went down (key, mouse button or wheel notch) in first person */
  function fpDown(code, repeat) {
    const acts = byInput.get(code); if (!acts) return false;
    if (!repeat) active.add(code);
    for (const a of acts) {
      const k = KIND[a];
      if (k === 'toggle') { if (!repeat) { crouchOn = !crouchOn; if (crouchOn) fpQueue.push('slide'); } }
      else if (k === 'press') { if (!repeat) { if (a === 'jump') crouchOn = false; fpQueue.push(a); } }
      else if (a === 'fire' && !repeat) fpQueue.push('fire');
      else if (a === 'sprint' && !repeat) crouchOn = false;       // Shift: up and running (a crouch toggled on ends)
    }
    return true;
  }
  function fpUp(code) { active.delete(code); }
  /** Settings → Controls: the next input goes to `capture` instead of the game */
  function captured(code) { if (!capture) return false; const cb = capture; capture = null; cb(code); return true; }

  window.addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); captured(e.code === 'Escape' ? null : e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code); return; }
    if (typing(e)) return;                       // let text fields receive every key
    if (mode === 'fp') {
      if (e.code === 'Escape' || e.code === 'KeyP') { onPause && onPause(); return; }
      if (!fpEnabled) return;
      if (fpDown(e.code, e.repeat)) e.preventDefault();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { onPause && onPause(); return; }
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (enabled && !e.repeat) queue.push(a);
  });
  window.addEventListener('keyup', (e) => { fpUp(e.code); });
  window.addEventListener('blur', () => { active.clear(); touchHold.clear(); });

  // ---- mouse look --------------------------------------------------------
  const locked = () => document.pointerLockElement === surface();
  /**
   * Captured-mouse movement. Some browsers (Chrome on Windows above all) now and then
   * deliver ONE event with a huge jump — often backwards — while the mouse moves fast
   * or in circles: the view "skips". Such an event is dropped: far bigger than any real
   * movement in one event, or a sudden reversal many times bigger than the last one.
   */
  let lastDX = 0, lastDY = 0;
  const SPIKE = 260;
  function lookDelta(dx, dy) {
    dx = dx || 0; dy = dy || 0;
    const jump = Math.abs(dx) > SPIKE || Math.abs(dy) > SPIKE;
    const flipX = Math.abs(dx) > 70 && Math.abs(lastDX) > 3 && Math.sign(dx) !== Math.sign(lastDX) && Math.abs(dx) > 8 * Math.abs(lastDX);
    const flipY = Math.abs(dy) > 70 && Math.abs(lastDY) > 3 && Math.sign(dy) !== Math.sign(lastDY) && Math.abs(dy) > 8 * Math.abs(lastDY);
    if (jump || flipX || flipY) { if (VR.Input) VR.Input.spikes = (VR.Input.spikes || 0) + 1; return; }
    lastDX = dx; lastDY = dy;
    look.x += dx; look.y += dy;
  }
  /** capture the mouse (the plain request: asking for raw movement fails on some systems and would lose the click that allowed it) */
  function lockPointer(el) { return el.requestPointerLock(); }
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'fp' || !fpEnabled) return;
    if (locked()) lookDelta(e.movementX, e.movementY);
    else if (dragLook) { look.x += e.clientX - lastMX; look.y += e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY; }
  });
  // mouse buttons and the wheel go through the same bindings (left button: only while the mouse is captured)
  window.addEventListener('mousedown', (e) => {
    if (capture) { e.preventDefault(); e.stopPropagation(); captured('Mouse' + e.button); return; }
    if (mode !== 'fp' || !fpEnabled) return;
    if (e.button === 0 && !locked()) return;          // that click captures the mouse (or drags to look)
    if (fpDown('Mouse' + e.button, false) && e.button > 2) e.preventDefault();
  }, true);
  window.addEventListener('mouseup', (e) => { fpUp('Mouse' + e.button); if (mode === 'fp' && e.button > 2) e.preventDefault(); });
  window.addEventListener('contextmenu', (e) => { if (mode === 'fp' || capture) e.preventDefault(); });
  window.addEventListener('wheel', (e) => {
    const code = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
    if (capture) { captured(code); return; }
    if (mode !== 'fp' || !fpEnabled) return;
    // a wheel notch is a quick press (a held action, e.g. jump or fire, lasts a moment)
    if (fpDown(code, false)) setTimeout(() => fpUp(code), 120);
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
          try { p = lockPointer(el); } catch (err) { wantLock = false; }
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
      touchMove.x = touchMove.y = 0; touchHold.clear(); crouchOn = false;
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
      try { const p = lockPointer(el); if (p && p.catch) p.catch(() => { wantLock = false; }); } catch (e) { wantLock = false; }
    },
    releaseLock() { wantLock = false; if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } } },
    isLocked: locked,

    // ---- first-person queries
    /** movement intent in local space: x = strafe right, y = forward. */
    moveVector() {
      let x = 0, y = 0;
      if (isHeld('forward')) y += 1;
      if (isHeld('back')) y -= 1;
      if (isHeld('right')) x += 1;
      if (isHeld('left')) x -= 1;
      x += touchMove.x; y += touchMove.y;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    aimHeld() { const k = isHeld('aim'); if (!k) aimBlock = false; return touchHold.has('aim') || (k && !aimBlock); },
    /** fire held (automatic weapons): its binding (left button while captured), or the touch FIRE button */
    fireHeld() { return touchHold.has('fire') || isHeld('fire'); },
    /** sprint: its binding (Shift) held, or the touch stick pushed all the way */
    sprintHeld() { return isHeld('sprint') || Math.hypot(touchMove.x, touchMove.y) > 0.95; },
    crouchHeld() { if (crouchOn && Math.hypot(touchMove.x, touchMove.y) > 0.95) crouchOn = false; return crouchOn || touchHold.has('crouch'); },
    /** stand up (e.g. after dying or a new round) */
    resetCrouch() { crouchOn = false; },
    takeLook() { const r = { x: look.x, y: look.y }; look.x = look.y = 0; return r; },
    nextAction() { return fpQueue.shift(); },

    // ---- hooks for touch controls (mission UI)
    press(action) { if (mode === 'fp' && fpEnabled) fpQueue.push(action); },
    hold(name, on) {
      if (on) touchHold.add(name);
      else { touchHold.delete(name); if (name === 'aim' && isHeld('aim')) aimBlock = true; }   // a held aim button must be pressed again
    },

    // ---- bindings (Settings → Controls)
    ACTIONS: ACTIONS.map(a => a[0]),
    binds() { return JSON.parse(JSON.stringify(binds)); },
    /** put `code` on action slot (0/1); '' / null clears it. The same input is taken off any other action. */
    setBind(action, slot, code) {
      if (!binds[action]) return;
      if (code) for (const k in binds) binds[k] = binds[k].map(c => (c === code ? null : c));
      binds[action][slot] = code || null;
      reindex(); active.clear();
      try { localStorage.setItem('cubeexpress.keybinds', JSON.stringify(binds)); } catch (e) { /* storage unavailable */ }
    },
    resetBinds() { binds = DEFAULTS(); reindex(); active.clear(); try { localStorage.removeItem('cubeexpress.keybinds'); } catch (e) { /* ignore */ } },
    /** wait for the next key / mouse button / wheel: cb(code) (null = cancelled with Esc, '' = cleared with Backspace) */
    captureNext(cb) { capture = cb; },
    cancelCapture() { capture = null; },
    /** a short readable name for an input */
    label(code) {
      if (!code) return '—';
      const M = { Mouse0: 'mouse.l', Mouse1: 'mouse.m', Mouse2: 'mouse.r', Mouse3: 'mouse.4', Mouse4: 'mouse.5', WheelUp: 'mouse.wu', WheelDown: 'mouse.wd' };
      if (M[code]) return VR.t(M[code]);
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit\d$/.test(code)) return code.slice(5);
      if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
      const N = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=',
        BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
      return N[code] || code;
    },
    /** is the input of an action held right now (e.g. Tab → the scoreboard) */
    actionHeld(a) { return !!binds[a] && isHeld(a); },
    touchHeld(name) { return touchHold.has(name); },
    /** the first input bound to an action, as a label (for hint texts) */
    keyFor(action) { const b = binds[action]; return this.label((b && (b[0] || b[1])) || ''); },
    setTouchMove(x, y) { touchMove.x = x; touchMove.y = y; },
    addLook(dx, dy) { if (fpEnabled) { look.x += dx; look.y += dy; } },
    /** (tests) a captured-mouse movement as the browser would deliver it */
    _mouseMove(dx, dy) { lookDelta(dx, dy); },
  };
})();
