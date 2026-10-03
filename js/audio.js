/* =====================================================================
 * AUDIO
 * All sounds are synthesised with WebAudio so the game ships with no
 * audio files. To use real files later:
 *     VR.Audio.useFile('coin', 'sounds/coin.mp3');
 *     VR.Audio.useMusicFile('sounds/theme.mp3');
 * and the synth version for that name is replaced automatically.
 * ===================================================================== */
(function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null;
  const files = {};          // name -> AudioBuffer (loaded replacements)
  const settings = { sfx: true, music: true };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    applySettings();
    return ctx;
  }
  function applySettings() {
    if (!ctx) return;
    sfxBus.gain.value = settings.sfx ? 1 : 0;
    musicBus.gain.value = settings.music ? 0.32 : 0;
  }

  // --- tiny synth helpers ---------------------------------------------
  function tone(freq, dur, type = 'square', vol = 0.25, slideTo = null, when = 0, bus = sfxBus) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, vol = 0.3, filterFreq = 1200, when = 0, bus = sfxBus) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur);
  }

  // --- the synth sound library (name -> function) ---------------------
  let coinStep = 0, coinStepTime = 0;
  const SYNTH = {
    step() { noise(0.05, 0.08, 700); },
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
    rockfall() { noise(0.9, 0.22, 400); tone(70, 0.8, 'triangle', 0.16, 45); },   // rumble of a falling rock
    thud() { noise(0.25, 0.35, 300); tone(60, 0.25, 'sine', 0.3, 35); },

    // ---- mission mode -------------------------------------------------
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
    // chord roots (semitones from A2) per bar and a 16-step melody pattern
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

  VR.Audio = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    play(name) {
      if (!ensure() || !settings.sfx) return;
      if (files[name]) {
        const s = ctx.createBufferSource(); s.buffer = files[name]; s.connect(sfxBus); s.start();
      } else if (SYNTH[name]) SYNTH[name]();
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
    /** Add or replace a synth sound: VR.Audio.define('name', ({tone, noise}) => {...}) */
    define(name, fn) { SYNTH[name] = () => fn({ tone, noise }); },
  };
})();
