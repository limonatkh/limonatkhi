/* =====================================================================
 * AUDIO (v1.46: the sound engine for a competitive game)
 * All sounds are synthesised with WebAudio, so the game ships with no
 * audio files (nothing to license). To use real files later:
 *     VR.Audio.useFile('coin', 'sounds/coin.mp3');
 *     VR.Audio.useMusicFile('sounds/theme.mp3');
 * and the synth version for that name is replaced automatically.
 *
 * The mix:
 *   master ← limiter (a compressor: no clipping, even levels)
 *     ← combat   shots, hits, damage, reloads, kills        (priority 3)
 *     ← move     steps, jumps, landings, slides            (priority 2)
 *     ← sfx      everything else in play (coins, power-ups) (priority 2)
 *     ← ui       buttons, menus, notices                   (priority 1)
 *     ← world    portals, gates, ambience                  (priority 1)  ← ducked by combat
 *     ← music                                                              ← ducked by combat
 * A shot or a hit lowers the music and the ambience for a moment, so the
 * fight is always heard first.
 *
 * Fast and light:
 *   - every synth sound is rendered ONCE into a buffer (OfflineAudioContext,
 *     in the background, the first time it is played; until then the live
 *     synth plays it), then each play is a single buffer source with a tiny
 *     random pitch change (the same shot never sounds machine-identical);
 *   - at most VOICES sounds at once and a few of the same name; when full, a
 *     new sound replaces the oldest of a lower priority, or is dropped;
 *   - the same name within MIN_GAP seconds is merged (no stacking).
 *
 * Where a sound comes from (opponents' shots and steps, impacts, enemies):
 *   VR.Audio.play(name, { at: worldPos })   with   VR.Audio.setEar(camera)
 * called by the world each frame: left/right pan and distance (quieter and
 * duller further away; steps fade out by ~24 m, shots carry ~60 m).
 * ===================================================================== */
(function () {
  let ctx = null, master = null, limiter = null, musicBus = null, musicDuck = null, worldDuck = null;
  const bus = {};                 // category → GainNode
  const files = {};               // name -> AudioBuffer (loaded replacements)
  const baked = {};               // name -> [AudioBuffer…] (rendered synth)
  const baking = new Set(), bakeQueue = [];
  const settings = { sfx: true, music: true };
  const LEVEL = { combat: 1.0, move: 0.85, sfx: 0.9, ui: 0.7, world: 0.75 };
  const PRIO = { combat: 3, move: 2, sfx: 2, ui: 1, world: 1 };
  const VOICES = 28, PER_NAME = 4, MIN_GAP = 0.022;
  const UI = new Set(['click', 'button', 'buzz', 'page', 'clue', 'fbSwitch', 'uiOpen', 'uiClose', 'uiConfirm', 'uiNotice', 'uiHover', 'uiWhoosh']);
  const WORLD = new Set(['portal', 'gate', 'thunder', 'bell', 'powerOn', 'radio', 'tick', 'rockfall', 'lever', 'lid', 'unlock', 'install', 'spark', 'silence', 'zoneEnter', 'portalHum']);
  const MOVE = /^(step|jump|land|slide|dodge|fpStep|fbStep|runStep|fbLand|fbWhoosh)/;
  const SFX = new Set(['coin', 'gem', 'powerup', 'shieldBreak', 'stumble', 'crash', 'thud', 'pickup', 'success', 'burst', 'hoopBounce', 'hoopRim', 'hoopBoard', 'swish', 'whistle', 'hoopBuzzer', 'poolClack', 'poolRail', 'poolPocket', 'poolCue', 'roundWin', 'roundLose', 'matchWin', 'matchLose', 'roundStart', 'countTick']);
  const LIVE = new Set(['coin']);            // sounds that change with what came before (the coin streak): never baked
  const catOf = (n) => (UI.has(n) ? 'ui' : WORLD.has(n) ? 'world' : MOVE.test(n) ? 'move' : SFX.has(n) ? 'sfx' : 'combat');
  const RANGE = { move: 24, combat: 60, sfx: 40, ui: 40, world: 50 };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.15;
    limiter.connect(master); master.connect(ctx.destination);
    worldDuck = ctx.createGain(); worldDuck.connect(limiter);
    for (const c of Object.keys(LEVEL)) { bus[c] = ctx.createGain(); bus[c].connect(c === 'world' ? worldDuck : limiter); }
    musicDuck = ctx.createGain(); musicDuck.connect(limiter);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(musicDuck);
    applySettings();
    return ctx;
  }
  function applySettings() {
    if (!ctx) return;
    for (const c in bus) bus[c].gain.value = settings.sfx ? LEVEL[c] : 0;
    musicBus.gain.value = settings.music ? 0.32 : 0;
  }

  // --- tiny synth helpers (they play into `out`: a voice's own gain node) ----
  let out = null;
  function tone(freq, dur, type = 'square', vol = 0.25, slideTo = null, when = 0, dest = out) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noiseBuffer(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function noise(dur, vol = 0.3, filterFreq = 1200, when = 0, dest = out, type = 'lowpass') {
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t + dur);
  }
  /** a short bright snap of high noise (the attack of a shot, a click) */
  const snap = (vol = 0.3, when = 0, freq = 3500, dur = 0.025) => noise(dur, vol, freq, when, out, 'highpass');
  /** a low body thump (a pitch drop) */
  const thump = (freq = 120, vol = 0.3, dur = 0.12, when = 0) => tone(freq, dur, 'sine', vol, Math.max(30, freq * 0.4), when);
  /** a band of noise (a mechanical texture) */
  const band = (dur, vol, freq, when = 0) => noise(dur, vol, freq, when, out, 'bandpass');
  const KIT = { tone, noise, snap, thump, band };

  // --- the synth sound library (name -> function) ---------------------
  let coinStep = 0, coinStepTime = 0;
  const SYNTH = {
    step() { noise(0.06, 0.13, 800); tone(90, 0.05, 'sine', 0.08, 60); },
    jump() { tone(260, 0.16, 'square', 0.12, 620); },
    land() { noise(0.09, 0.2, 500); tone(110, 0.08, 'sine', 0.2, 60); },
    slide() { noise(0.28, 0.12, 2500); },
    dodge() { noise(0.07, 0.07, 3000); },
    coin() {
      // rising pitch when collecting a streak of coins
      const now = ctx.currentTime;
      coinStep = now - coinStepTime < 0.35 ? Math.min(coinStep + 1, 10) : 0;
      coinStepTime = now;
      const f = 880 * Math.pow(2, coinStep / 24);
      tone(f, 0.07, 'square', 0.08); tone(f * 1.5, 0.12, 'square', 0.07, null, 0.05);
    },
    gem() { [0, 4, 7, 12].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 0.12, 'triangle', 0.14, null, i * 0.05)); },
    powerup() { [0, 4, 7, 12, 16].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 0.14, 'square', 0.1, null, i * 0.06)); },
    shieldBreak() { noise(0.35, 0.3, 4000); tone(700, 0.3, 'sawtooth', 0.12, 150); },
    stumble() { tone(180, 0.2, 'sawtooth', 0.18, 90); noise(0.15, 0.2, 900); },
    crash() { noise(0.6, 0.5, 900); tone(160, 0.6, 'sawtooth', 0.25, 40); },
    click() { tone(520, 0.05, 'square', 0.08); },
    rockfall() { noise(0.9, 0.22, 400); tone(70, 0.8, 'triangle', 0.16, 45); },
    thud() { noise(0.25, 0.35, 300); tone(60, 0.25, 'sine', 0.3, 35); },
    portal() { tone(220, 0.6, 'sine', 0.2, 880); noise(0.6, 0.12, 3000); [0, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.3, 'triangle', 0.1, null, 0.15 + i * 0.08)); },
    fpStep() { noise(0.04, 0.06, 500); },
    burst() { noise(0.35, 0.3, 1800); tone(140, 0.35, 'sawtooth', 0.15, 520); },
    tick() { for (let i = 0; i < 6; i++) { tone(2400, 0.02, 'square', 0.05, null, i * 0.5); tone(1800, 0.02, 'square', 0.04, null, i * 0.5 + 0.25); } },
    radio() { noise(1.6, 0.35, 5000); tone(180, 1.4, 'sawtooth', 0.04, 160); },
    bell() { tone(1568, 1.4, 'sine', 0.3); tone(2350, 1.0, 'sine', 0.12); tone(3136, 0.6, 'sine', 0.06); },
    silence() { noise(0.03, 0.04, 400); },
    pickup() { tone(660, 0.08, 'square', 0.1); tone(990, 0.12, 'square', 0.08, null, 0.06); },
    button() { tone(420, 0.05, 'square', 0.1); noise(0.03, 0.08, 2000); },
    buzz() { tone(110, 0.35, 'sawtooth', 0.18); tone(116, 0.35, 'sawtooth', 0.14); },
    unlock() { noise(0.08, 0.2, 3000); [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.16, 'triangle', 0.14, null, 0.1 + i * 0.07)); },
    lid() { noise(0.4, 0.2, 700); tone(90, 0.3, 'triangle', 0.18, 60); },
    install() { noise(0.06, 0.2, 2500); tone(880, 0.1, 'square', 0.08, null, 0.05); },
    spark() { noise(0.25, 0.35, 6000); tone(1200, 0.2, 'sawtooth', 0.06, 300); },
    lever() { noise(0.18, 0.25, 900); tone(160, 0.15, 'square', 0.12, 90); },
    powerOn() { tone(55, 1.6, 'sawtooth', 0.18, 110); tone(110, 1.6, 'triangle', 0.12, 220); [0, 4, 7, 12, 16].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.22, 'square', 0.07, null, 0.6 + i * 0.08)); },
    gate() { noise(1.2, 0.18, 500); tone(70, 1.2, 'sawtooth', 0.1, 50); },
    success() { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.2, 'square', 0.09, null, i * 0.1)); },
    clue() { tone(784, 0.12, 'triangle', 0.1); tone(1175, 0.2, 'triangle', 0.08, null, 0.08); },
    page() { noise(0.12, 0.1, 4000); },
  };

  // --- background music: tiny step sequencer --------------------------
  const MUSIC = {
    bpm: 132,
    bass: [0, 0, 5, 5, 3, 3, 7, 7],
    lead: [12, -1, 15, -1, 19, 17, 15, -1, 12, -1, 10, 12, -1, 15, -1, -1],
    lead2: [17, -1, 19, -1, 22, 20, 19, -1, 17, -1, 15, 17, -1, 19, 22, -1],
  };
  let musicTimer = null, nextNoteTime = 0, step = 0, musicSource = null;
  const A2 = 110;
  function schedule() {
    const spb = 60 / MUSIC.bpm / 4;
    while (nextNoteTime < ctx.currentTime + 0.12) {
      const when = nextNoteTime - ctx.currentTime;
      const bar = Math.floor(step / 16) % MUSIC.bass.length;
      const s = step % 16;
      const root = MUSIC.bass[bar];
      if (s % 4 === 0) tone(A2 * Math.pow(2, root / 12), spb * 3, 'triangle', 0.35, null, when, musicBus);
      if (s % 4 === 2) tone(A2 * Math.pow(2, (root + 12) / 12), spb, 'triangle', 0.18, null, when, musicBus);
      const pat = Math.floor(step / 64) % 2 ? MUSIC.lead2 : MUSIC.lead;
      const n = pat[s];
      if (n >= 0) tone(A2 * 2 * Math.pow(2, (n + root) / 12), spb * 1.6, 'square', 0.07, null, when, musicBus);
      if (s % 8 === 4) noise(0.06, 0.12, 6000, when, musicBus);
      if (s % 8 === 0) tone(90, 0.12, 'sine', 0.4, 45, when, musicBus);
      step++;
      nextNoteTime += spb;
    }
  }

  // --- baking: a synth sound into a buffer, once, in the background ----------
  const VARIANTS = (fn) => (/Math\.random/.test(fn.src || String(fn)) ? 3 : 1);     // (a sound with randomness: three takes)
  function bake(name) {
    if (baking.has(name) || baked[name] || LIVE.has(name) || !SYNTH[name] || typeof OfflineAudioContext === 'undefined') return;
    baking.add(name); bakeQueue.push(name);
    if (bakeQueue.length === 1) setTimeout(bakeNext, 0);
  }
  function bakeNext() {
    const name = bakeQueue[0]; if (!name) return;
    const fn = SYNTH[name], n = VARIANTS(fn), sr = ctx.sampleRate, list = [];
    const next = () => { bakeQueue.shift(); baking.delete(name); if (bakeQueue.length) setTimeout(bakeNext, 0); };
    let k = 0;
    const one = () => {
      if (k >= n) { if (SYNTH[name] === fn) baked[name] = list; return next(); }
      k++;
      let off;
      try { off = new OfflineAudioContext(1, Math.round(sr * 3), sr); } catch (e) { return next(); }
      const keepCtx = ctx, keepOut = out;
      ctx = off; out = off.destination;
      try { fn(); } catch (e) { ctx = keepCtx; out = keepOut; return next(); } finally { ctx = keepCtx; out = keepOut; }
      off.startRendering().then((buf) => { list.push(trim(buf)); one(); }).catch(next);
    };
    one();
  }
  /** cut the silence at the end of a rendered sound */
  function trim(buf) {
    const d = buf.getChannelData(0); let end = d.length - 1;
    while (end > 0 && Math.abs(d[end]) < 2e-4) end--;
    const len = Math.max(64, Math.min(d.length, end + Math.round(buf.sampleRate * 0.01)));
    if (len >= d.length - 8) return buf;
    const b = ctx.createBuffer(1, len, buf.sampleRate); b.getChannelData(0).set(d.subarray(0, len));
    return b;
  }

  // --- voices: how many play, which one gives way -----------------------------
  const voices = [];            // { name, prio, end, node, src }
  const lastAt = {};
  const stats = { played: 0, merged: 0, dropped: 0, stolen: 0, baked: 0, live: 0, positional: 0 };
  function admit(name, prio, now) {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
    const same = voices.filter(v => v.name === name);
    if (same.length >= PER_NAME) { stop(same[0]); stats.stolen++; }
    if (voices.length >= VOICES) {
      let w = null;
      for (const v of voices) if (v.prio <= prio && (!w || v.prio < w.prio || (v.prio === w.prio && v.start < w.start))) w = v;
      if (!w) { stats.dropped++; return false; }
      stop(w); stats.stolen++;
    }
    return true;
  }
  function stop(v) {
    const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
    try { v.node.gain.setTargetAtTime(0, ctx.currentTime, 0.01); if (v.src) v.src.stop(ctx.currentTime + 0.05); } catch (e) { /* already stopped */ }
    setTimeout(() => { try { v.node.disconnect(); } catch (e) { /* gone */ } }, 120);
  }
  // --- where I listen from --------------------------------------------------
  const ear = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, set: false };
  function spatial(at, cat) {
    if (!ear.set || !at) return null;
    const dx = at.x - ear.x, dy = at.y - ear.y, dz = at.z - ear.z, d = Math.hypot(dx, dy, dz);
    const R = RANGE[cat] || 40;
    if (d > R * 1.1) return { gain: 0 };
    const k = Math.max(0, 1 - d / R);
    const gain = Math.min(1, 1 / (1 + d / 9)) * (0.35 + 0.65 * k) + (d < 2 ? 0.15 : 0);
    const pan = d < 0.6 ? 0 : Math.max(-1, Math.min(1, (dx * ear.rx + dz * ear.rz) / d)) * 0.8;
    return { gain: Math.min(1, gain), pan, cut: d > 6 ? Math.max(1800, 16000 - d * 260) : 0 };
  }
  // --- ducking: the fight first ----------------------------------------------
  function duck() {
    const t = ctx.currentTime;
    for (const [g, low] of [[musicDuck, 0.4], [worldDuck, 0.55]]) {
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(low, t, 0.02); g.gain.setTargetAtTime(1, t + 0.25, 0.3);
    }
  }

  VR.Audio = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    /**
     * Play a sound by name. opts: { at: {x,y,z} } heard from there; { vol } 0..1.
     * Returns false when it was merged, dropped or muted.
     */
    play(name, opts) {
      if (!ensure() || !settings.sfx) return false;
      const fileBuf = files[name], synth = SYNTH[name];
      if (!fileBuf && !synth) return false;
      const now = ctx.currentTime, clock = performance.now() / 1000, cat = catOf(name), prio = PRIO[cat];   // (the clock: bookkeeping, also while the audio is still locked)
      const at = opts && opts.at, key = at ? name + '@' : name;
      if (clock - (lastAt[key] || -9) < MIN_GAP) { stats.merged++; return false; }
      const sp = spatial(at, cat);
      if (sp && sp.gain <= 0.01) return false;            // too far to hear
      if (!admit(name, prio, clock)) return false;
      lastAt[key] = clock;
      // the voice: gain (+ distance) → pan → (far: duller) → its bus
      const node = ctx.createGain(); node.gain.value = (opts && opts.vol != null ? opts.vol : 1) * (sp ? sp.gain : 1);
      let tail = node;
      if (sp && sp.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; tail.connect(p); tail = p; }
      if (sp && sp.cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = sp.cut; tail.connect(f); tail = f; }
      tail.connect(bus[cat]);
      if (sp) stats.positional++;
      const buf = fileBuf || (baked[name] && baked[name][(Math.random() * baked[name].length) | 0]);
      let src = null, dur = 0.6;
      if (buf) {
        src = ctx.createBufferSource(); src.buffer = buf;
        if (!fileBuf && cat !== 'ui') src.playbackRate.value = 0.975 + Math.random() * 0.05;
        src.connect(node); src.start(now); dur = buf.duration / src.playbackRate.value;
        src.onended = () => { try { node.disconnect(); } catch (e) { /* gone */ } };
        stats.baked++;
      } else {
        const keep = out; out = node;
        try { synth(); } finally { out = keep; }
        stats.live++;
        bake(name);
        setTimeout(() => { try { node.disconnect(); } catch (e) { /* gone */ } }, 3200);
      }
      voices.push({ name, prio, start: clock, end: clock + dur, node, src });
      stats.played++;
      if (cat === 'combat') duck();
      return true;
    },
    /** the listener: the world's camera (call every frame before playing positional sounds) */
    setEar(cam) {
      if (!cam) { ear.set = false; return; }
      const e = cam.matrixWorld.elements;
      ear.x = e[12]; ear.y = e[13]; ear.z = e[14];
      const l = Math.hypot(e[0], e[2]) || 1; ear.rx = e[0] / l; ear.rz = e[2] / l;
      ear.set = true;
    },
    startMusic() {
      if (!ensure()) return;
      if (files.__music) {
        if (musicSource) return;
        musicSource = ctx.createBufferSource(); musicSource.buffer = files.__music; musicSource.loop = true;
        musicSource.connect(musicBus); musicSource.start();
        return;
      }
      if (musicTimer) return;
      nextNoteTime = ctx.currentTime + 0.05; step = 0;
      musicTimer = setInterval(schedule, 40);
    },
    stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (musicSource) { musicSource.stop(); musicSource = null; }
    },
    setMusicVolume(v) { if (musicBus && settings.music) musicBus.gain.setTargetAtTime(0.32 * v, ctx.currentTime, 0.1); },
    setEnabled(kind, on) { settings[kind] = on; applySettings(); },
    settings,
    // Replace a synth sound with a real audio file
    async useFile(name, url) {
      if (!ensure()) return;
      const buf = await fetch(url).then(r => r.arrayBuffer());
      files[name] = await ctx.decodeAudioData(buf);
    },
    async useMusicFile(url) { await this.useFile('__music', url); },
    /**
     * A looping ambient sound (rain, wind, a hall's hum): filtered noise whose loudness can be changed every frame.
     * Returns { set(gain, freq?), stop() }. Silent until the audio is unlocked. (On the world bus: the fight ducks it.)
     */
    ambient(freq = 1200, type = 'lowpass') {
      let src = null, f = null, g = null;
      const start = () => {
        if (src || !ensure()) return false;
        const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), dd = b.getChannelData(0);
        for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
        src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
        f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
        g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(bus.world); src.start();
        return true;
      };
      return {
        set(gain, fr) {
          if (!ctx || ctx.state !== 'running') return;
          if (!src && gain > 0.001) start();
          if (!g) return;
          g.gain.setTargetAtTime(settings.sfx ? gain : 0, ctx.currentTime, 0.25);
          if (fr) f.frequency.setTargetAtTime(fr, ctx.currentTime, 0.3);
        },
        stop() { if (src) { try { src.stop(); } catch (e) { /* already */ } src.disconnect(); src = null; g = null; f = null; } },
      };
    },
    /** Add or replace a synth sound: VR.Audio.define('name', ({tone, noise, snap, thump, band}) => {...}) */
    define(name, fn) { const w = () => fn(KIT); w.src = String(fn); SYNTH[name] = w; delete baked[name]; },
    has(name) { return !!(SYNTH[name] || files[name]); },
    /** (tests) what the engine did, and its mix */
    stats() { return Object.assign({ voices: voices.length, bakedNames: Object.keys(baked).length, queue: bakeQueue.length, ctx: ctx ? ctx.state : null }, stats); },
    categoryOf: catOf,
    get context() { return ctx; },
  };
})();
