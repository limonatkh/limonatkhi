/* =====================================================================
 * FEEDBACK — the effects layer on top of the arena's systems (it does not
 * replace the player, the camera or the weapons; it reacts to them).
 *
 *   VR.Feedback            the static part
 *     PROFILES / profile(id) / register(id, partial)
 *                          per character feedback: colours, matter,
 *                          element, death style, crit effect, run trail,
 *                          first-person arm style, weapon sway, steps,
 *                          landing weight, camera shake, screen tint.
 *                          A new character = a new profile, nothing else
 *                          (an AI fighter can also carry its own `fx`).
 *     ELEMENTS             fire / electric / ice / poison / energy /
 *                          mechanical / shadow / nature / blast: colour AND
 *                          motion, density and sound
 *     ARMS                 arm-motion styles (normal / agile / fast /
 *                          heavy / robotic / magic) used by VR.HandsView
 *     settings / set()     accessibility: camera shake, screen flashes,
 *                          speed effects, slow motion, damage numbers,
 *                          effect quality — saved on this device
 *     causeOf(w, head)     what a hit / kill message's weapon id means
 *
 *   new VR.FeedbackLayer(scene, camera, hudRoot)   one per arena
 *     eliminate(o)         elimination VFX (A core burst, B dust poof,
 *                          C progressive disintegration, D shockwave ring,
 *                          E debris by matter, F explosive by element,
 *                          G fall), intensity from headshot / damage /
 *                          ability / round end, body hidden or dissolved
 *     hit(pos, type, o)    hit particles: normal / crit / armor / ability
 *     muzzle / tracerColor / impact(pos, surface, normal)
 *     ability(stage, o)    charge / launch / trail / area / impact / end
 *     footstep / land / slideTrail / dashTrail / watchBody (remote bodies)
 *     damageFrom / tint / flash / speedLines → the screen overlay
 *     sfx(name, gap)       throttled sounds
 *
 * Everything is pooled (instanced voxel particles, rings, sprites, two
 * lights), has a maximum lifetime, is cleaned up automatically, scales
 * with distance (LOD) and quality, and gives hit confirmation and
 * eliminations priority over cosmetic particles.
 * ===================================================================== */
(function () {
  const T = THREE;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ settings
  const KEY = 'cubeexpress.fx';
  const DEFAULTS = { shake: 1, flashes: true, speed: true, slowmo: true, numbers: true, quality: 'auto' };
  let S = Object.assign({}, DEFAULTS);
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
  function setSettings(patch) {
    Object.assign(S, patch);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  function quality() {
    if (S.quality !== 'auto') return S.quality;
    const g = VR.game && VR.game.settings;
    return g && g.quality === 'low' ? 'low' : 'high';
  }
  const QK = { low: 0.4, medium: 0.7, high: 1 };

  // ------------------------------------------------------------------ elements
  // colour is only half of it: each one moves, sounds and fills space differently
  const ELEMENTS = {
    energy:     { col: [0xffe14a, 0xfff6b0], glow: true, grav: 0, drag: 3, rise: 0, jitter: 0, density: 1, spin: 0, sound: 'fbEnergy' },
    fire:       { col: [0xff5a1a, 0xffb02a, 0xffe08a], glow: true, grav: -4, drag: 2.2, rise: 2.5, jitter: 2, density: 1.3, spin: 0, sound: 'fbFire' },
    electric:   { col: [0x7fd8ff, 0xffffff], glow: true, grav: 0, drag: 6, rise: 0, jitter: 14, density: 0.8, spin: 0, sound: 'fbZap' },
    ice:        { col: [0x8fe6ff, 0xe8fbff, 0x5fb8e8], glow: false, grav: 12, drag: 0.5, rise: 0, jitter: 0, density: 0.9, spin: 9, sound: 'fbIce' },
    poison:     { col: [0x7cdc3a, 0xb6ff5a, 0x3e8a1e], glow: false, grav: -0.8, drag: 3.5, rise: 0.6, jitter: 1, density: 1.1, spin: 1, sound: 'fbPoison', grow: 2.2 },
    mechanical: { col: [0x9aa4b8, 0x5d6676, 0xffcf6a], glow: false, grav: 16, drag: 0.3, rise: 0, jitter: 0, density: 1, spin: 12, sound: 'fbMetal' },
    shadow:     { col: [0x2a2a34, 0xb26bff, 0x6b4aa8], glow: false, grav: -0.6, drag: 3, rise: 0.8, jitter: 0, density: 1.1, spin: 2, sound: 'fbShadow', grow: 1.6 },
    nature:     { col: [0x5fdc5f, 0xc8ffb0, 0xffffff], glow: true, grav: -2, drag: 2, rise: 1.6, jitter: 0, density: 0.9, spin: 0, sound: 'fbNature' },
    magic:      { col: [0xd59bff, 0xffffff, 0x9b6bff], glow: true, grav: -1, drag: 3, rise: 1, jitter: 3, density: 1, spin: 0, sound: 'fbMagic' },
    blast:      { col: [0xff7a2a, 0xffd23a, 0xffffff], glow: true, grav: 4, drag: 2, rise: 0, jitter: 0, density: 1.4, spin: 0, sound: 'fbBlast' },
  };

  // ------------------------------------------------------------------ arm styles
  // amp: swing size, freq: swing speed, lag: inertia (higher = heavier), weight: landing
  // compression, step: quantised (robotic) motion, float: magic hover, roll: side tilt
  const ARMS = {
    normal:  { amp: 1, freq: 1, lag: 1, weight: 1, step: 0, float: 0, roll: 1, sway: 1 },
    agile:   { amp: 1.1, freq: 1.1, lag: 0.8, weight: 0.9, step: 0, float: 0, roll: 1.4, sway: 1.05 },
    fast:    { amp: 1.25, freq: 1.3, lag: 0.6, weight: 0.7, step: 0, float: 0, roll: 1.1, sway: 0.9 },
    heavy:   { amp: 0.8, freq: 0.8, lag: 1.7, weight: 1.7, step: 0, float: 0, roll: 0.7, sway: 1.3 },
    robotic: { amp: 0.9, freq: 0.95, lag: 1.1, weight: 1.4, step: 0.012, float: 0, roll: 0.5, sway: 0.8 },
    magic:   { amp: 0.85, freq: 0.9, lag: 1.2, weight: 0.6, step: 0, float: 1, roll: 1, sway: 1.1 },
  };

  // ------------------------------------------------------------------ profiles
  const BASE = {
    id: 'default', colors: { main: 0xffe14a, accent: 0xffffff, glow: 0xfff6b0, hit: 0xffd23a },
    matter: 'organic',            // organic | robotic | armored | magic
    element: 'energy',            // its ability / special-death element
    death: 'dust',                // core | dust | disintegrate | shockwave | debris | explode
    crit: 'star',                 // star | sparks | shards
    trail: 'speed',               // none | speed | sparks | afterimage | magic
    arms: 'normal', sway: 1, steps: 'soft', weight: 1, shake: 1, tint: null,
  };
  const PROFILES = {};
  function merge(base, p) {
    const o = Object.assign({}, base, p);
    o.colors = Object.assign({}, base.colors, p.colors || {});
    return o;
  }
  function register(id, partial, from) {
    const base = from && PROFILES[from] ? PROFILES[from] : BASE;
    PROFILES[id] = merge(base, Object.assign({}, partial, { id }));
    return PROFILES[id];
  }
  register('default', {});
  // the two characters
  register('hero', { colors: { main: 0xffe14a, accent: 0x6bcf3f, glow: 0xfff6b0, hit: 0xffd23a }, matter: 'organic', element: 'energy', death: 'dust', crit: 'star', trail: 'speed', arms: 'agile', steps: 'soft', weight: 1 });
  register('fridge', { colors: { main: 0xdfe8f0, accent: 0x7fd4ff, glow: 0xbff0ff, hit: 0x9fdcff }, matter: 'robotic', element: 'mechanical', death: 'debris', crit: 'sparks', trail: 'sparks', arms: 'robotic', steps: 'metal', weight: 1.5, shake: 1.2 });
  // the AI fighters (js/duel/fighters.js) — 'f_<id>'
  register('f_dasher', { colors: { main: 0x4ae0ff, accent: 0xffffff, glow: 0x9ef4ff, hit: 0x9ef4ff }, element: 'electric', death: 'shockwave', crit: 'sparks', trail: 'afterimage', arms: 'fast' }, 'hero');
  register('f_flash', { colors: { main: 0xd59bff, accent: 0xffffff, glow: 0xe9c8ff, hit: 0xd59bff }, matter: 'magic', element: 'magic', death: 'disintegrate', trail: 'magic', arms: 'magic' }, 'fridge');
  register('f_tank', { colors: { main: 0x8a96a8, accent: 0x7fd4ff, glow: 0xbfe6ff, hit: 0xc8d0dc }, matter: 'armored', element: 'mechanical', death: 'debris', crit: 'shards', arms: 'heavy', weight: 2, shake: 1.5 }, 'fridge');
  register('f_blaster', { colors: { main: 0xff9a3a, accent: 0xffe14a, glow: 0xffc27a, hit: 0xffb04a }, element: 'fire', death: 'core' }, 'hero');
  register('f_bomber', { colors: { main: 0xff5a3a, accent: 0xffd23a, glow: 0xffa07a, hit: 0xff8a5a }, element: 'blast', death: 'explode', weight: 1.3 }, 'fridge');
  register('f_healer', { colors: { main: 0x5fdc5f, accent: 0xffffff, glow: 0xc8ffb0, hit: 0x9eff9e }, matter: 'magic', element: 'nature', death: 'disintegrate', trail: 'magic', arms: 'magic' }, 'hero');
  register('f_freezer', { colors: { main: 0x8fe6ff, accent: 0xffffff, glow: 0xe8fbff, hit: 0xbff4ff }, matter: 'magic', element: 'ice', death: 'debris', crit: 'shards' }, 'fridge');
  register('f_berserker', { colors: { main: 0xd8302a, accent: 0xff9a3a, glow: 0xff6a4a, hit: 0xff5a3a }, element: 'fire', death: 'explode', arms: 'heavy', weight: 1.6, shake: 1.4 }, 'hero');
  register('f_trickster', { colors: { main: 0xb26bff, accent: 0x2a2a34, glow: 0xd59bff, hit: 0xc99bff }, matter: 'magic', element: 'shadow', death: 'dust', trail: 'magic', arms: 'magic' }, 'fridge');
  register('f_ninja', { colors: { main: 0x2a2a34, accent: 0xb26bff, glow: 0x9b6bff, hit: 0xb26bff }, element: 'shadow', death: 'disintegrate', trail: 'afterimage', arms: 'agile' }, 'hero');

  function profile(id) {
    if (id && PROFILES[id]) return PROFILES[id];
    // a fighter defined later can bring its own feedback profile (FIGHTERS[id].fx)
    const fid = id && id.startsWith('f_') ? id.slice(2) : id;
    const F = VR.Fighters && VR.Fighters.FIGHTERS && VR.Fighters.FIGHTERS[fid];
    if (F) {
      const ch = VR.CHARACTERS[(F.char || 0) % VR.CHARACTERS.length].id;
      const A = VR.Fighters.ABILITIES && VR.Fighters.ABILITIES[F.ability];
      return register('f_' + fid, Object.assign({ colors: { main: F.color, glow: F.color, hit: F.color }, element: (A && A.elem) || 'energy' }, F.fx || {}), PROFILES[ch] ? ch : 'hero');
    }
    return PROFILES.default;
  }

  // ------------------------------------------------------------------ causes
  // the weapon id carried by every hit / kill message → what killed (synced for free)
  function causeOf(w, head) {
    if (w === 'fall') return { kind: 'fall' };
    if (w === 'mine' || w === 'bomb' || w === 'nade') return { kind: 'explosion', elem: 'blast', w };
    if (w === 'knife' || w === 'strike') return { kind: 'melee', w, elem: w === 'strike' ? 'shadow' : null };
    const A = VR.Fighters && VR.Fighters.ABILITIES && VR.Fighters.ABILITIES[w];
    if (A) return { kind: 'ability', elem: A.elem || 'energy', w, color: A.color };
    return { kind: head ? 'head' : 'gun', w: w || '' };
  }

  // ------------------------------------------------------------------ weapons
  const MUZZLE = {       // class, size, smoke, colour
    pistol: ['small', 0.32, 0, 0xfff1a8], revolver: ['heavy', 0.5, 3, 0xffd27a], shotgun: ['heavy', 0.75, 6, 0xffb04a],
    smg: ['small', 0.3, 0, 0xfff6c0], rifle: ['small', 0.4, 1, 0xffe14a], lmg: ['heavy', 0.55, 3, 0xffb84a],
    dmr: ['precise', 0.3, 1, 0xc9ffef], sniper: ['precise', 0.38, 2, 0x9ef4ff],
  };
  const TRACER = { pistol: 0xfff1a8, revolver: 0xffd27a, shotgun: 0xff9a4a, smg: 0xfff6c0, rifle: 0xffe14a, lmg: 0xffb84a, dmr: 0xc9ffef, sniper: 0x9ef4ff };

  // ------------------------------------------------------------------ surfaces
  const SURF = { planks: 'wood', wood: 'wood', hay: 'wood', log: 'wood', crate: 'wood', stone: 'stone', cobble: 'stone', stone_bricks: 'stone', sandstone: 'stone', concrete: 'stone', brick: 'stone', bricks: 'stone',
    metal: 'metal', iron: 'metal', steel: 'metal', grass: 'dirt', dirt: 'dirt', sand: 'dirt', gravel: 'dirt', mud: 'dirt', snow: 'snow', ice: 'snow', water: 'water', lemon: 'energy', neon: 'energy', glass: 'energy' };
  function surfaceOfMat(mat) {
    if (!mat) return 'stone';
    const b = String(mat).split('#')[0];
    if (SURF[b]) return SURF[b];
    if (/metal|steel|iron|pipe/.test(b)) return 'metal';
    if (/wood|plank|log/.test(b)) return 'wood';
    if (/snow|ice/.test(b)) return 'snow';
    if (/water/.test(b)) return 'water';
    if (/grass|dirt|sand|mud|soil/.test(b)) return 'dirt';
    if (/neon|glow|energy|lemon/.test(b)) return 'energy';
    return 'stone';
  }
  /** the solid a point sits on (its surface and the face normal) */
  function surfaceAt(level, p, eps = 0.1) {
    let best = null, bd = Infinity;
    for (const s of level ? level.solids : []) {
      if (s.enabled === false) continue;
      if (p.x < s.min[0] - eps || p.x > s.max[0] + eps || p.y < s.min[1] - eps || p.y > s.max[1] + eps || p.z < s.min[2] - eps || p.z > s.max[2] + eps) continue;
      const faces = [[p.x - s.min[0], -1, 0, 0], [s.max[0] - p.x, 1, 0, 0], [p.y - s.min[1], 0, -1, 0], [s.max[1] - p.y, 0, 1, 0], [p.z - s.min[2], 0, 0, -1], [s.max[2] - p.z, 0, 0, 1]];
      for (const f of faces) { const d = Math.abs(f[0]); if (d < bd) { bd = d; best = { surface: surfaceOfMat(s.mat), normal: new T.Vector3(f[1], f[2], f[3]), solid: s }; } }
    }
    return best || { surface: 'stone', normal: new T.Vector3(0, 1, 0), solid: null };
  }
  function groundAt(level, pos) {
    let top = null;
    for (const s of level ? level.solids : []) {
      if (s.enabled === false) continue;
      if (pos.x < s.min[0] || pos.x > s.max[0] || pos.z < s.min[2] || pos.z > s.max[2]) continue;
      if (Math.abs(s.max[1] - pos.y) < 0.35 && (!top || s.max[1] > top.max[1])) top = s;
    }
    return surfaceOfMat(top && top.mat);
  }
  const STEP_COL = { stone: [0xd8ccb0, 0xb8ad94], wood: [0xb98a52, 0x8a6236], metal: [0xffd27a, 0xffffff], dirt: [0xb89a6a, 0x8a7350], snow: [0xffffff, 0xe6f2ff], water: [0x8fd3ff, 0xe0f6ff], energy: [0xffe14a, 0xfff6b0] };

  // ------------------------------------------------------------------ sounds
  const A = VR.Audio;
  if (A && A.define) {
    A.define('fbDieCore', ({ tone, noise }) => { tone(880, 0.25, 'sine', 0.18, 220); noise(0.3, 0.25, 5000); tone(1760, 0.12, 'triangle', 0.08, 3500, 0.02); });
    A.define('fbDieDust', ({ tone, noise }) => { noise(0.35, 0.3, 1200); tone(200, 0.2, 'triangle', 0.1, 90); });
    A.define('fbDieDisint', ({ tone, noise }) => { for (let i = 0; i < 6; i++) tone(1200 + i * 260, 0.08, 'triangle', 0.05, null, i * 0.07); noise(0.6, 0.12, 6000); });
    A.define('fbDieMetal', ({ tone, noise }) => { noise(0.25, 0.4, 7000); tone(520, 0.3, 'square', 0.1, 140); tone(1300, 0.08, 'square', 0.06, null, 0.06); tone(900, 0.06, 'square', 0.05, null, 0.14); });
    A.define('fbDieAsh', ({ tone, noise }) => { noise(0.5, 0.22, 900); tone(160, 0.4, 'sine', 0.12, 60); });
    A.define('fbDieBlast', ({ tone, noise }) => { noise(0.7, 0.55, 1400); tone(120, 0.6, 'sawtooth', 0.24, 35); });
    A.define('fbDieFall', ({ tone }) => { tone(900, 0.7, 'sine', 0.14, 120); tone(600, 0.6, 'triangle', 0.06, 80, 0.05); });
    A.define('fbShock', ({ tone, noise }) => { tone(70, 0.5, 'sine', 0.3, 40); noise(0.4, 0.2, 600); });
    A.define('fbKill', ({ tone }) => { tone(1600, 0.06, 'square', 0.11); tone(2200, 0.08, 'square', 0.1, null, 0.05); tone(3000, 0.14, 'triangle', 0.08, null, 0.1); });
    A.define('fbArmor', ({ tone, noise }) => { noise(0.08, 0.3, 8000); tone(2600, 0.06, 'square', 0.06, 1800); });
    A.define('fbAbilityHit', ({ tone }) => { tone(1100, 0.08, 'triangle', 0.12, 1700); });
    A.define('fbStepStone', ({ noise }) => { noise(0.045, 0.07, 650); });
    A.define('fbStepSoft', ({ noise }) => { noise(0.06, 0.06, 380); });
    A.define('fbStepWood', ({ tone, noise }) => { noise(0.04, 0.06, 900); tone(190, 0.05, 'triangle', 0.06, 150); });
    A.define('fbStepMetal', ({ tone, noise }) => { noise(0.03, 0.06, 3000); tone(620, 0.06, 'square', 0.03, 540); });
    A.define('fbStepWater', ({ noise }) => { noise(0.1, 0.07, 2200); });
    A.define('fbStepRobot', ({ tone, noise }) => { noise(0.04, 0.08, 1800); tone(140, 0.07, 'square', 0.06, 100); });
    A.define('fbLand1', ({ tone, noise }) => { noise(0.07, 0.15, 600); tone(130, 0.06, 'sine', 0.14, 70); });
    A.define('fbLand2', ({ tone, noise }) => { noise(0.12, 0.25, 500); tone(100, 0.12, 'sine', 0.22, 50); });
    A.define('fbLand3', ({ tone, noise }) => { noise(0.25, 0.4, 420); tone(70, 0.25, 'sine', 0.32, 35); tone(55, 0.3, 'triangle', 0.15, 30, 0.03); });
    A.define('fbSwitch', ({ tone, noise }) => { noise(0.05, 0.12, 2500); tone(700, 0.04, 'square', 0.05, null, 0.06); });
    A.define('fbImpMetal', ({ tone, noise }) => { noise(0.05, 0.16, 7000); tone(2400 + Math.random() * 800, 0.06, 'square', 0.04, 1500); });
    A.define('fbImpWood', ({ tone, noise }) => { noise(0.06, 0.14, 1500); tone(260, 0.05, 'triangle', 0.06, 180); });
    A.define('fbImpStone', ({ noise }) => { noise(0.06, 0.15, 2600); });
    A.define('fbImpSoft', ({ noise }) => { noise(0.08, 0.1, 700); });
    A.define('fbImpEnergy', ({ tone }) => { tone(1400, 0.1, 'sine', 0.08, 2600); });
    A.define('fbCharge', ({ tone }) => { tone(220, 0.45, 'sine', 0.12, 880); });
    A.define('fbAbEnd', ({ tone }) => { tone(880, 0.2, 'sine', 0.08, 300); });
    A.define('fbEnergy', ({ tone, noise }) => { tone(660, 0.18, 'square', 0.08, 1320); noise(0.12, 0.1, 5000); });
    A.define('fbFire', ({ tone, noise }) => { noise(0.4, 0.28, 1100); tone(110, 0.3, 'sawtooth', 0.08, 70); });
    A.define('fbZap', ({ tone, noise }) => { for (let i = 0; i < 4; i++) tone(1800 + Math.random() * 1200, 0.03, 'square', 0.06, null, i * 0.035); noise(0.15, 0.15, 8000); });
    A.define('fbIce', ({ tone, noise }) => { tone(2600, 0.12, 'triangle', 0.08, 1800); tone(3300, 0.1, 'triangle', 0.06, null, 0.05); noise(0.2, 0.12, 9000); });
    A.define('fbPoison', ({ tone, noise }) => { noise(0.5, 0.14, 500); tone(180, 0.4, 'sine', 0.06, 140); });
    A.define('fbMetal', ({ tone, noise }) => { noise(0.2, 0.25, 5000); tone(400, 0.2, 'square', 0.06, 200); });
    A.define('fbShadow', ({ tone, noise }) => { noise(0.4, 0.16, 400); tone(90, 0.4, 'sine', 0.12, 60); });
    A.define('fbNature', ({ tone }) => { [0, 4, 7].forEach((s, i) => tone(880 * Math.pow(2, s / 12), 0.14, 'triangle', 0.07, null, i * 0.05)); });
    A.define('fbMagic', ({ tone }) => { tone(660, 0.3, 'sine', 0.1, 1980); tone(990, 0.2, 'triangle', 0.06, null, 0.08); });
    A.define('fbBlast', ({ tone, noise }) => { noise(0.5, 0.45, 1600); tone(90, 0.45, 'sawtooth', 0.2, 35); });
    A.define('fbWhoosh', ({ noise }) => { noise(0.22, 0.14, 3500); });
  }

  // ------------------------------------------------------------------ the pooled voxel particles
  // one instanced cube mesh for solid particles and one additive one for glowing particles
  class Pool {
    constructor(scene, cap, glow) {
      this.cap = cap;
      const mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: glow, depthWrite: !glow, blending: glow ? T.AdditiveBlending : T.NormalBlending });
      mat.toneMapped = false;
      this.mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, cap);
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = glow ? 5 : 0;
      scene.add(this.mesh);
      const f = (n) => new Float32Array(cap * n);
      this.p = f(3); this.v = f(3); this.life = f(1); this.max = f(1); this.s0 = f(1); this.s1 = f(1);
      this.g = f(1); this.drag = f(1); this.spin = f(1); this.rot = f(1); this.jit = f(1); this.floor = f(1);
      this.prio = new Uint8Array(cap); this.free = []; for (let i = cap - 1; i >= 0; i--) this.free.push(i);
      this.alive = 0; this.top = 0; this.ring = 0;
      this._m = new T.Matrix4(); this._q = new T.Quaternion(); this._e = new T.Euler(); this._s = new T.Vector3(); this._p = new T.Vector3(); this._c = new T.Color();
    }
    slot(prio) {
      if (this.free.length) return this.free.pop();
      if (!prio) return -1;
      // full: a priority effect takes the place of a cosmetic one
      for (let n = 0; n < this.cap; n++) {
        const i = (this.ring = (this.ring + 1) % this.cap);
        if (this.prio[i] < prio) { this.alive--; return i; }
      }
      return -1;
    }
    spawn(x, y, z, vx, vy, vz, o) {
      const i = this.slot(o.prio || 0); if (i < 0) return -1;
      const k = i * 3;
      this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
      this.life[i] = this.max[i] = o.life || 0.6; this.s0[i] = o.size || 0.08; this.s1[i] = o.end != null ? o.end : 0;
      this.g[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.spin[i] = o.spin || 0; this.rot[i] = Math.random() * 6; this.jit[i] = o.jitter || 0;
      this.floor[i] = o.floor != null ? o.floor : -99; this.prio[i] = o.prio || 0;
      this._c.setHex(o.color || 0xffffff); this.mesh.instanceColor.setXYZ(i, this._c.r, this._c.g, this._c.b);
      this.alive++; if (i >= this.top) this.top = i + 1;
      return i;
    }
    update(dt) {
      if (!this.alive) { if (this.mesh.count) { this.mesh.count = 0; } return; }
      let top = 0;
      for (let i = 0; i < this.top; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        const k = i * 3;
        if (this.life[i] <= 0) {
          this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this._m);
          this.free.push(i); this.alive--; continue;
        }
        top = i + 1;
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        this.v[k] *= dr; this.v[k + 2] *= dr; this.v[k + 1] = this.v[k + 1] * dr - this.g[i] * dt;
        if (this.jit[i]) { this.v[k] += (Math.random() - 0.5) * this.jit[i]; this.v[k + 1] += (Math.random() - 0.5) * this.jit[i]; this.v[k + 2] += (Math.random() - 0.5) * this.jit[i]; }
        this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
        if (this.p[k + 1] < this.floor[i]) { this.p[k + 1] = this.floor[i]; this.v[k + 1] *= -0.3; this.v[k] *= 0.6; this.v[k + 2] *= 0.6; }
        const t = this.life[i] / this.max[i];
        const s = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
        this.rot[i] += this.spin[i] * dt;
        this._e.set(this.rot[i], this.rot[i] * 0.7, 0); this._q.setFromEuler(this._e);
        this._s.setScalar(Math.max(0.0001, s)); this._p.set(this.p[k], this.p[k + 1], this.p[k + 2]);
        this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
      }
      this.top = Math.max(top, 0);
      this.mesh.count = this.top;
      this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    }
    clear() {
      this._m.makeScale(0, 0, 0);
      for (let i = 0; i < this.cap; i++) { if (this.life[i] > 0) { this.life[i] = 0; this.free.push(i); } this.mesh.setMatrixAt(i, this._m); }
      this.alive = 0; this.top = 0; this.mesh.count = 0; this.mesh.instanceMatrix.needsUpdate = true;
    }
    dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  }

  // a soft round sprite texture (flashes, cores)
  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowTex = new T.CanvasTexture(c); return glowTex;
  }

  // ------------------------------------------------------------------ the layer (one per arena)
  class FeedbackLayer {
    constructor(scene, camera, hudRoot) {
      this.scene = scene; this.camera = camera;
      const q = quality(); this.q = q; this.qk = QK[q] || 1;
      const cap = q === 'low' ? 260 : q === 'medium' ? 520 : 900;
      this.solid = new Pool(scene, cap, false);
      this.glow = new Pool(scene, Math.round(cap * 0.8), true);
      // rings (shockwaves, landing dust, shield ripples) and sprites (flashes, cores): small pools
      this.rings = []; this.sprites = []; this.lights = [];
      const ringGeo = new T.RingGeometry(0.82, 1, 40);
      for (let i = 0; i < 12; i++) {
        const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
        m.material.toneMapped = false; m.visible = false; m.renderOrder = 6; scene.add(m);
        this.rings.push({ m, t: 0, max: 0 });
      }
      for (let i = 0; i < 10; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        s.material.toneMapped = false; s.visible = false; s.renderOrder = 7; scene.add(s);
        this.sprites.push({ s, t: 0, max: 0 });
      }
      // two lights, always in the scene (lights added and removed per shot would recompile shaders)
      for (let i = 0; i < 2; i++) { const l = new T.PointLight(0xffffff, 0, 9, 2); scene.add(l); this.lights.push({ l, t: 0, max: 0, I: 0 }); }
      this.tasks = [];
      this.sound = {}; this.soundN = 0; this.soundT = 0;
      this.log = [];                  // what was shown (tests, debugging)
      this.screen = new Screen(hudRoot);
      this.fovKick = 0; this.slowT = 0; this.slowK = 1;
      this.watch = new WeakMap();
      this._v = new T.Vector3();
    }
    dispose() {
      this.clear();
      this.solid.dispose(); this.glow.dispose();
      for (const r of this.rings) { this.scene.remove(r.m); r.m.material.dispose(); }
      if (this.rings[0]) this.rings[0].m.geometry.dispose();
      for (const s of this.sprites) { this.scene.remove(s.s); s.s.material.dispose(); }
      for (const l of this.lights) this.scene.remove(l.l);
      this.screen.dispose();
    }
    clear() {
      this.solid.clear(); this.glow.clear();
      for (const r of this.rings) { r.t = 0; r.m.visible = false; }
      for (const s of this.sprites) { s.t = 0; s.s.visible = false; }
      for (const l of this.lights) { l.t = 0; l.l.intensity = 0; }
      for (const t of this.tasks) t.end && t.end();
      this.tasks.length = 0; this.slowT = 0; this.slowK = 1;
      this.screen.clear();
    }
    note(e) { e.t = performance.now(); this.log.push(e); if (this.log.length > 200) this.log.shift(); }
    stats() { return { solid: this.solid.alive, glow: this.glow.alive, rings: this.rings.filter(r => r.t > 0).length, sprites: this.sprites.filter(s => s.t > 0).length, tasks: this.tasks.length }; }

    // ---- level of detail: fewer cosmetic particles far away and on lower quality
    lod(pos, n, prio) {
      const d = pos.distanceTo(this.camera.position);
      if (!prio && d > 45) return 0;
      let k = this.qk * (d > 22 ? 0.5 : 1);
      if (prio) k = Math.max(k, 0.5);
      return Math.max(prio ? 1 : 0, Math.round(n * k));
    }
    // ---- primitives
    burst(pos, o) {
      const n = this.lod(pos, o.n || 10, o.prio || 0); if (!n) return;
      const pool = o.glow ? this.glow : this.solid, cols = o.colors || [0xffffff];
      for (let i = 0; i < n; i++) {
        let vx = rnd(-1, 1), vy = rnd(-1, 1) * (o.flatY != null ? o.flatY : 1), vz = rnd(-1, 1);
        const l = Math.hypot(vx, vy, vz) || 1, sp = (o.speed || 3) * rnd(0.4, 1);
        vx = vx / l * sp; vy = vy / l * sp + (o.up || 0); vz = vz / l * sp;
        if (o.dir) { vx += o.dir.x * (o.push || 0); vy += o.dir.y * (o.push || 0); vz += o.dir.z * (o.push || 0); }
        const r = o.spread || 0;
        pool.spawn(pos.x + rnd(-r, r), pos.y + rnd(-r, r) * (o.spreadY != null ? o.spreadY : 1), pos.z + rnd(-r, r), vx, vy, vz, {
          life: (o.life || 0.6) * rnd(0.7, 1.15), size: (o.size || 0.08) * rnd(0.7, 1.3), end: o.end != null ? o.end * rnd(0.7, 1.3) : 0,
          grav: o.grav || 0, drag: o.drag || 0, spin: o.spin ? rnd(-o.spin, o.spin) : 0, jitter: o.jitter || 0,
          floor: o.floor, prio: o.prio || 0, color: cols[(Math.random() * cols.length) | 0],
        });
      }
    }
    /** particles spread over a body-shaped column (a dissolving silhouette) */
    column(pos, h, o) {
      const n = this.lod(pos, o.n || 20, o.prio || 0); if (!n) return;
      const pool = o.glow ? this.glow : this.solid, cols = o.colors || [0xffffff];
      for (let i = 0; i < n; i++) {
        const y = rnd(o.y0 || 0, h), w = y > h * 0.78 ? 0.22 : 0.32;
        pool.spawn(pos.x + rnd(-w, w), pos.y + y, pos.z + rnd(-w, w), rnd(-1, 1) * (o.speed || 0.6), rnd(0, 1) * (o.up || 0.5), rnd(-1, 1) * (o.speed || 0.6), {
          life: (o.life || 0.8) * rnd(0.6, 1.2), size: (o.size || 0.09) * rnd(0.7, 1.3), end: o.end || 0, grav: o.grav || 0, drag: o.drag || 1,
          spin: o.spin ? rnd(-o.spin, o.spin) : 0, jitter: o.jitter || 0, prio: o.prio || 0, floor: o.floor, color: cols[(Math.random() * cols.length) | 0],
        });
      }
    }
    ring(pos, o) {
      const r = this.rings.find(x => x.t <= 0) || this.rings.reduce((a, b) => (a.t < b.t ? a : b));
      r.t = r.max = o.life || 0.45; r.r0 = o.r0 || 0.2; r.r1 = o.radius || 2.5; r.a = o.alpha || 0.9;
      r.m.material.color.setHex(o.color || 0xffffff);
      r.m.material.blending = o.solid ? T.NormalBlending : T.AdditiveBlending;
      r.m.position.copy(pos); r.m.visible = true;
      if (o.normal) r.m.lookAt(this._v.copy(pos).add(o.normal)); else if (o.vertical) { r.m.rotation.set(0, o.yaw || 0, 0); } else r.m.rotation.set(-Math.PI / 2, 0, 0);
      r.m.scale.setScalar(r.r0);
      return r;
    }
    sprite(pos, o) {
      const s = this.sprites.find(x => x.t <= 0) || this.sprites.reduce((a, b) => (a.t < b.t ? a : b));
      s.t = s.max = o.life || 0.12; s.z0 = o.size || 0.5; s.z1 = o.end != null ? o.end : s.z0 * 1.6; s.a = o.alpha || 1;
      s.s.material.color.setHex(o.color || 0xffffff); s.s.position.copy(pos); s.s.visible = true; s.s.scale.setScalar(s.z0);
      return s;
    }
    light(pos, color, I, life) {
      const l = this.lights.find(x => x.t <= 0) || this.lights.reduce((a, b) => (a.t < b.t ? a : b));
      l.t = l.max = life; l.I = I; l.l.color.setHex(color); l.l.position.copy(pos); l.l.intensity = I;
    }
    task(dur, fn, end) { const t = { t: 0, dur, fn, end }; this.tasks.push(t); return t; }
    shakeNear(pos, amount) {
      const d = pos.distanceTo(this.camera.position);
      if (d < 14) this.cameraShake = Math.max(this.cameraShake || 0, amount * (1 - d / 14));
    }
    sfx(name, gap = 0.05) {
      const now = performance.now() / 1000;
      if (now - (this.sound[name] || -9) < gap) return false;
      if (now - this.soundT > 0.05) { this.soundT = now; this.soundN = 0; }
      if (++this.soundN > 6) return false;                     // never more than 6 sounds in 50 ms
      this.sound[name] = now; VR.Audio.play(name); return true;
    }
    /** an element's own burst (colour + motion + density) */
    elementBurst(pos, elem, n, o = {}) {
      const E = ELEMENTS[elem] || ELEMENTS.energy;
      this.burst(pos, Object.assign({ n: Math.round(n * E.density), colors: E.col, glow: E.glow, speed: 4, up: E.rise, grav: E.grav, drag: E.drag, jitter: E.jitter, spin: E.spin, life: 0.6, size: 0.09, end: E.grow ? 0.09 * E.grow : 0 }, o));
    }

    // ================================================================ eliminations
    /**
     * o = { pos, low, prof (id), cause {kind, elem}, head, dmg, roundEnd, body (group to hide/dissolve) }
     * returns the style used
     */
    eliminate(o) {
      const P = typeof o.prof === 'object' ? o.prof : profile(o.prof), cause = o.cause || { kind: 'gun' };
      let I = 1 + (o.head ? 0.45 : 0) + ((o.dmg || 0) >= 60 ? 0.3 : 0) + (cause.kind === 'ability' ? 0.3 : 0) + (o.roundEnd ? 0.5 : 0);
      I = Math.min(2.2, I);
      const base = o.pos.clone(), c = base.clone(); c.y += o.low ? 0.6 : 1.0;
      const h = o.low ? 1.2 : 1.9, floor = base.y + 0.02, cols = [P.colors.main, P.colors.accent, P.colors.glow];
      let style;
      if (cause.kind === 'fall') style = 'fall';
      else if (cause.kind === 'explosion') style = 'explode';
      else if (cause.kind === 'ability') style = cause.elem === 'blast' || cause.elem === 'fire' ? 'explode' : 'core';
      else if (cause.kind === 'head') style = 'core';
      else if (cause.kind === 'melee') style = P.matter === 'robotic' || P.matter === 'armored' ? 'debris' : 'disintegrate';
      else style = P.death;
      const prio = 2;
      const elem = cause.elem || P.element;
      switch (style) {
        case 'core': {                                               // A. radiant core burst
          const col = cause.kind === 'ability' ? (ELEMENTS[elem] || ELEMENTS.energy).col[0] : P.colors.glow;
          this.sprite(c, { color: 0xffffff, size: 0.4, end: 2.6 * I, life: 0.22 });
          this.sprite(c, { color: col, size: 0.8, end: 3.4 * I, life: 0.32, alpha: 0.85 });
          this.light(c, col, 45 * I, 0.3);
          this.burst(c, { n: 26 * I, colors: [col, 0xffffff, P.colors.main], glow: true, speed: 7 * I, drag: 3.2, life: 0.55, size: 0.1, prio });
          if (cause.kind === 'ability') this.elementBurst(c, elem, 18 * I, { prio, speed: 5 });
          this.column(base, h, { n: 12, colors: cols, glow: false, speed: 1.2, up: 1.5, life: 0.5, size: 0.08, prio, floor });
          this.sfx('fbDieCore', 0.02); break;
        }
        case 'dust': {                                               // B. dust poof dissolve
          this.column(base, h, { n: 34 * I, colors: [0xd8ccb0, 0xb8ad94, P.colors.main, 0xeee4cc], speed: 0.9, up: 1.2, life: 0.9, size: 0.12, end: 0.2, drag: 2.2, prio, floor });
          this.burst(new T.Vector3(base.x, base.y + 0.15, base.z), { n: 14 * I, colors: [0xd8ccb0, 0xc4b48a], speed: 3, flatY: 0.15, up: 0.3, drag: 3, life: 0.7, size: 0.1, end: 0.16, prio, floor });
          this.ring(new T.Vector3(base.x, base.y + 0.04, base.z), { color: 0xe6dcc2, radius: 1.6 * I, life: 0.45, alpha: 0.6, solid: true });
          this.sfx('fbDieDust', 0.02); break;
        }
        case 'disintegrate': {                                       // C. progressive particle disintegration
          const E = ELEMENTS[elem] || ELEMENTS.energy;
          const body = o.body, dur = 0.75;
          this.task(dur, (k, dt) => {
            const y = h * k;                                         // a band rising from the feet to the head
            this.column(base, Math.min(h, y + 0.25), { y0: Math.max(0, y - 0.25), n: 5 * I, colors: [P.colors.glow, P.colors.main, E.col[0]], glow: true, speed: 0.4, up: 2.2, grav: -1.5, drag: 1.5, life: 0.7, size: 0.07, prio });
            if (body) { body.scale.y = Math.max(0.02, 1 - k); body.scale.x = body.scale.z = 1 + 0.25 * k; }
          }, () => { if (body) { body.visible = false; body.scale.set(1, 1, 1); } });
          this.light(c, P.colors.glow, 18 * I, dur);
          this.sfx('fbDieDisint', 0.02); break;
        }
        case 'shockwave': {                                          // D. death shockwave ring
          this.ring(new T.Vector3(base.x, base.y + 0.06, base.z), { color: P.colors.glow, radius: 4 * I, life: 0.55 });
          this.ring(c, { color: P.colors.main, radius: 2.4 * I, life: 0.4, vertical: true, yaw: Math.random() * Math.PI });
          this.burst(c, { n: 18 * I, colors: cols, glow: true, speed: 6, flatY: 0.3, drag: 2.5, life: 0.5, size: 0.08, prio });
          this.column(base, h, { n: 16, colors: cols, speed: 1, up: 1, life: 0.6, size: 0.09, prio, floor });
          this.sfx('fbShock', 0.02); break;
        }
        case 'debris': {                                             // E. death debris by matter
          if (P.matter === 'robotic' || P.matter === 'armored' || elem === 'ice') {
            const shards = elem === 'ice' ? ELEMENTS.ice.col : [P.colors.main, 0x9aa4b8, 0x5d6676, P.colors.accent];
            this.burst(c, { n: 22 * I, colors: shards, speed: 6, up: 3, grav: 16, drag: 0.4, spin: 14, life: 1.1, size: 0.12, prio, floor, spread: 0.3 });
            this.burst(c, { n: 20 * I, colors: elem === 'ice' ? [0xffffff, 0xbff4ff] : [0xffcf6a, 0xffffff, 0xff9a3a], glow: true, speed: 9, grav: 10, drag: 1.2, life: 0.45, size: 0.045, prio });
            this.sfx(elem === 'ice' ? 'fbIce' : 'fbDieMetal', 0.02);
          } else {
            this.column(base, h, { n: 26 * I, colors: [0x2a2622, 0x4a4038, 0x6b5e52], speed: 0.6, up: 1.4, grav: -0.6, drag: 1.6, life: 1.2, size: 0.07, end: 0.04, prio });
            this.column(base, h, { n: 14 * I, colors: [P.colors.glow, 0xffffff], glow: true, speed: 0.5, up: 2.2, grav: -1, drag: 1.2, life: 0.9, size: 0.05, prio });
            this.burst(c, { n: 10 * I, colors: [0x8a8a8a, 0xb0b0b0], speed: 1.5, up: 1, drag: 2, life: 1, size: 0.16, end: 0.32, prio });
            this.sfx('fbDieAsh', 0.02);
          }
          this.light(c, P.colors.glow, 14 * I, 0.25); break;
        }
        case 'explode': {                                            // F. character-specific explosive elimination
          const E = ELEMENTS[elem] || ELEMENTS.blast;
          this.sprite(c, { color: 0xffffff, size: 0.6, end: 3.4 * I, life: 0.18 });
          this.sprite(c, { color: E.col[0], size: 1, end: 4 * I, life: 0.35, alpha: 0.9 });
          this.light(c, E.col[0], 60 * I, 0.35);
          this.ring(new T.Vector3(base.x, base.y + 0.06, base.z), { color: E.col[0], radius: 4.5 * I, life: 0.5 });
          this.elementBurst(c, elem, 30 * I, { prio, speed: 8 * I, life: 0.7 });
          this.burst(c, { n: 14 * I, colors: [0x6a6a6a, 0x8a8a8a, 0x4a4a4a], speed: 2, up: 1.2, drag: 2, life: 1.3, size: 0.18, end: 0.42, prio });   // smoke
          this.column(base, h, { n: 12, colors: cols, speed: 2, up: 2, grav: 9, life: 0.8, size: 0.1, prio, floor, spin: 8 });
          this.sfx('fbDieBlast', 0.02); this.shakeNear(c, 0.35); break;
        }
        case 'fall': {                                               // G. fall elimination
          this.burst(new T.Vector3(base.x, base.y + 1, base.z), { n: 16, colors: [P.colors.main, 0xffffff], glow: true, speed: 0.6, up: -9, drag: 0.5, life: 0.6, size: 0.06, prio });
          this.ring(new T.Vector3(base.x, base.y + 0.5, base.z), { color: P.colors.glow, radius: 2.2, life: 0.6 });
          this.sfx('fbDieFall', 0.02); break;
        }
      }
      // the last elimination of a round (or a headshot): an extra shockwave
      if ((o.roundEnd || o.head) && style !== 'shockwave' && style !== 'fall') {
        this.ring(new T.Vector3(base.x, base.y + 0.06, base.z), { color: o.head ? 0xffd23a : P.colors.glow, radius: 3.2 * I, life: 0.5 });
        if (o.roundEnd) this.sfx('fbShock', 0.02);
      }
      // the body: hidden (or dissolving — handled above), never left standing
      if (o.body && style !== 'disintegrate') {
        const hideAt = style === 'shockwave' ? 0.6 : style === 'fall' ? 0.3 : 0.08, body = o.body;
        this.task(hideAt, null, () => { body.visible = false; });
      }
      this.note({ type: 'elim', style, I: +I.toFixed(2), prof: P.id, cause: cause.kind, elem });
      return style;
    }

    // ================================================================ hits
    /** where a shot landed on someone: type normal / crit / armor / ability */
    hit(pos, type, o = {}) {
      const P = profile(o.prof);
      if (type === 'crit') {
        if (P.crit === 'sparks') this.burst(pos, { n: 14, colors: [0xffcf6a, 0xffffff, P.colors.hit], glow: true, speed: 7, grav: 9, drag: 1, life: 0.35, size: 0.04, prio: 1 });
        else if (P.crit === 'shards') this.burst(pos, { n: 10, colors: [P.colors.main, 0xffffff], speed: 5, grav: 12, spin: 12, life: 0.5, size: 0.07, prio: 1 });
        else this.burst(pos, { n: 12, colors: [0xffd23a, 0xffffff, P.colors.hit], glow: true, speed: 5, drag: 4, life: 0.35, size: 0.07, prio: 1 });
        this.sprite(pos, { color: 0xffd23a, size: 0.25, end: 0.9, life: 0.12 });
      } else if (type === 'armor') {
        this.burst(pos, { n: 12, colors: [0xffffff, 0xc8d0dc, 0xffcf6a], glow: true, speed: 6, grav: 10, drag: 1, life: 0.3, size: 0.04, prio: 1 });
        this.ring(pos, { color: 0x7fd4ff, radius: 0.9, life: 0.25, normal: o.dir ? o.dir.clone().negate() : null });
        this.sfx('fbArmor', 0.06);
      } else if (type === 'ability') {
        this.elementBurst(pos, o.elem || P.element, 10, { prio: 1, speed: 3, life: 0.4 });
      } else {
        this.burst(pos, { n: 6, colors: [P.colors.hit, P.colors.main], glow: P.matter !== 'organic', speed: 3, grav: 6, drag: 1.5, life: 0.3, size: 0.05, prio: 1 });
      }
      this.note({ type: 'hit', kind: type, prof: P.id });
    }

    // ================================================================ weapons
    tracerColor(wid) { return TRACER[wid] || 0xffe14a; }
    muzzle(pos, dir, wid, color) {
      const M = MUZZLE[wid] || ['small', 0.35, 0, color || 0xfff1a8];
      const [cls, size, smoke] = M, col = color || M[3];
      if (cls === 'precise') {
        // thin and long: a streak along the barrel
        for (let i = 1; i <= 4; i++) this.sprite(this._v.copy(pos).addScaledVector(dir, i * 0.12), { color: col, size: size * (1 - i * 0.18), end: size * 0.4, life: 0.05 });
      } else this.sprite(pos, { color: col, size, end: size * (cls === 'heavy' ? 1.9 : 1.4), life: cls === 'heavy' ? 0.08 : 0.05 });
      if (cls === 'heavy') this.burst(pos, { n: 5, colors: [0xffd27a, 0xffffff], glow: true, speed: 4, dir, push: 4, drag: 4, life: 0.12, size: 0.035 });
      if (smoke) this.burst(pos, { n: smoke, colors: [0xcfcfcf, 0xa8a8a8], speed: 0.4, dir, push: 1.2, up: 0.5, drag: 2, life: 0.7, size: 0.06, end: 0.2 });
      this.light(pos, col, cls === 'heavy' ? 30 : 18, 0.06);
    }
    /** a bullet hits a surface: by material */
    impact(pos, surface, normal) {
      const n = normal || new T.Vector3(0, 1, 0);
      const out = this._v.copy(n);
      switch (surface) {
        case 'metal':
          this.burst(pos, { n: 10, colors: [0xffcf6a, 0xffffff, 0xff9a3a], glow: true, speed: 7, dir: out, push: 3, grav: 12, drag: 0.8, life: 0.35, size: 0.035 });
          this.sprite(pos, { color: 0xffd27a, size: 0.15, end: 0.4, life: 0.06 }); this.sfx('fbImpMetal', 0.04); break;
        case 'wood':
          this.burst(pos, { n: 7, colors: [0xb98a52, 0x8a6236, 0xd8b07a], speed: 3, dir: out, push: 2.5, grav: 12, spin: 14, life: 0.6, size: 0.05 }); this.sfx('fbImpWood', 0.04); break;
        case 'energy':
          this.ring(pos, { color: 0xffe14a, radius: 0.6, life: 0.25, normal: n });
          this.burst(pos, { n: 6, colors: [0xffe14a, 0xffffff], glow: true, speed: 2, dir: out, push: 1, drag: 3, life: 0.3, size: 0.05 }); this.sfx('fbImpEnergy', 0.05); break;
        case 'dirt': case 'snow': case 'water': {
          const C = STEP_COL[surface];
          this.burst(pos, { n: 8, colors: C, speed: surface === 'water' ? 3 : 1.5, dir: out, push: surface === 'water' ? 3 : 1.5, grav: surface === 'water' ? 10 : 2, drag: 2, life: 0.55, size: 0.07, end: surface === 'water' ? 0 : 0.12 });
          this.sfx('fbImpSoft', 0.04); break;
        }
        default:                                                     // stone: chips + dust
          this.burst(pos, { n: 6, colors: [0x9a9a9a, 0x7a7a7a, 0xc4b48a], speed: 3, dir: out, push: 2.5, grav: 14, spin: 10, life: 0.5, size: 0.05 });
          this.burst(pos, { n: 4, colors: [0xd8ccb0, 0xe6dcc2], speed: 0.6, dir: out, push: 0.8, drag: 2, life: 0.5, size: 0.06, end: 0.14 });
          this.sfx('fbImpStone', 0.04);
      }
      this.note({ type: 'impact', surface });
    }

    // ================================================================ abilities
    /**
     * One interface for every ability's visuals. stage: charge | launch | trail | area | impact | end
     * o = { pos, dir, elem, color, radius, prof, me (it affects me: screen tint) }
     */
    ability(stage, o) {
      const E = ELEMENTS[o.elem] || ELEMENTS.energy, col = o.color || E.col[0], pos = o.pos;
      switch (stage) {
        case 'charge': {      // particles pulled in
          const n = this.lod(pos, 16 * E.density, 1);
          for (let i = 0; i < n; i++) {
            const d = new T.Vector3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.8, 1.4));
            this.glow.spawn(pos.x + d.x, pos.y + d.y, pos.z + d.z, -d.x * 3, -d.y * 3, -d.z * 3, { life: 0.35, size: 0.06, color: E.col[i % E.col.length], prio: 1 });
          }
          this.light(pos, col, 14, 0.35); this.sfx('fbCharge', 0.2); break;
        }
        case 'launch':
          this.sprite(pos, { color: col, size: 0.4, end: 1.2, life: 0.12 });
          this.elementBurst(pos, o.elem, 10, { dir: o.dir, push: 3, speed: 2.5, life: 0.35, prio: 1 });
          this.light(pos, col, 25, 0.12); this.sfx(E.sound, 0.08); break;
        case 'trail':
          this.elementBurst(pos, o.elem, 2, { speed: 0.6, life: 0.35, size: 0.06 }); break;
        case 'area':
          this.ring(new T.Vector3(pos.x, pos.y + 0.08, pos.z), { color: col, radius: o.radius || 2, r0: (o.radius || 2) * 0.2, life: 0.6, alpha: 0.7 });
          this.elementBurst(new T.Vector3(pos.x, pos.y + 0.1, pos.z), o.elem, 14, { spread: (o.radius || 2) * 0.6, spreadY: 0, speed: 0.5, up: 2, life: 0.7 }); break;
        case 'impact':
          this.sprite(pos, { color: col, size: 0.5, end: 2 * (o.radius ? o.radius / 2 : 1), life: 0.2 });
          this.elementBurst(pos, o.elem, 18 * (o.big ? 2 : 1), { speed: o.big ? 7 : 4, prio: 1 });
          if (o.radius) this.ring(new T.Vector3(pos.x, pos.y + 0.06, pos.z), { color: col, radius: o.radius, life: 0.45 });
          this.light(pos, col, o.big ? 50 : 22, 0.25); this.sfx(E.sound, 0.06);
          if (o.big) this.shakeNear(pos, 0.3);
          break;
        case 'end':
          this.elementBurst(pos, o.elem, 8, { speed: 1.2, life: 0.45 }); this.sfx('fbAbEnd', 0.15); break;
      }
      if (o.me && (stage === 'impact' || stage === 'area')) this.screen.tint(col, 0.6);
      this.note({ type: 'ability', stage, elem: o.elem || 'energy' });
    }

    // ================================================================ movement
    footstep(pos, surface, prof, side) {
      const P = profile(prof), C = STEP_COL[surface] || STEP_COL.stone;
      const n = surface === 'metal' ? 3 : surface === 'water' ? 5 : 4;
      const p = this._v.set(pos.x + (side || 0) * 0.12, pos.y + 0.03, pos.z);
      if (surface === 'metal' || P.matter === 'robotic') this.burst(p, { n: 2, colors: [0xffcf6a, 0xffffff], glow: true, speed: 2.5, up: 1.5, grav: 10, life: 0.2, size: 0.025 });
      this.burst(p, { n, colors: surface === 'energy' ? ELEMENTS.energy.col : C, glow: surface === 'energy', speed: 0.7, flatY: 0.3, up: surface === 'water' ? 1.8 : 0.4, grav: surface === 'water' ? 9 : 0.4, drag: 2.5, life: 0.45, size: 0.05, end: surface === 'water' ? 0 : 0.09, floor: pos.y });
      if (P.trail === 'magic') this.burst(p, { n: 2, colors: [P.colors.glow, P.colors.main], glow: true, speed: 0.3, up: 0.8, life: 0.5, size: 0.04 });
      this.note({ type: 'step', surface, prof: P.id });
    }
    stepSound(surface, prof) {
      const P = profile(prof);
      const name = P.steps === 'metal' ? (surface === 'metal' ? 'fbStepMetal' : 'fbStepRobot') : surface === 'metal' ? 'fbStepMetal' : surface === 'wood' ? 'fbStepWood' : surface === 'water' ? 'fbStepWater' : surface === 'dirt' || surface === 'snow' ? 'fbStepSoft' : 'fbStepStone';
      this.sfx(name, 0.12);
      return name;
    }
    /** landing: dust ring, particles, a sound by weight; returns the camera pulse (0..1) */
    land(pos, speed, surface, prof) {
      // an ordinary jump lands at ~10 m/s; a fall from a high perch at 25+
      const P = profile(prof), k = clamp((speed - 9) / 16, 0, 1) * P.weight;
      if (speed < 6) return 0;
      const C = STEP_COL[surface] || STEP_COL.stone, base = new T.Vector3(pos.x, pos.y + 0.04, pos.z);
      this.ring(base, { color: C[1] || C[0], radius: 0.8 + 1.6 * k, life: 0.35 + 0.15 * k, alpha: 0.75, solid: true });
      this.burst(base, { n: 6 + 14 * k, colors: C, speed: 2 + 3 * k, flatY: 0.15, up: 0.4, drag: 3, life: 0.5, size: 0.07, end: 0.12, floor: pos.y });
      if (surface === 'metal' || P.matter === 'robotic' || P.matter === 'armored') this.burst(base, { n: 4 + 8 * k, colors: [0xffcf6a, 0xffffff], glow: true, speed: 4, up: 2, grav: 12, life: 0.3, size: 0.03 });
      this.sfx(k > 0.65 ? 'fbLand3' : k > 0.25 ? 'fbLand2' : 'fbLand1', 0.1);
      this.note({ type: 'land', k: +k.toFixed(2), surface });
      return Math.min(1, k);
    }
    slideTrail(pos, dir, surface, prof) {
      const P = profile(prof), C = STEP_COL[surface] || STEP_COL.stone, p = this._v.set(pos.x, pos.y + 0.05, pos.z);
      this.burst(p, { n: 2, colors: C, speed: 0.6, flatY: 0.2, up: 0.5, drag: 2, life: 0.5, size: 0.06, end: 0.12, floor: pos.y });
      if (surface === 'metal' || P.matter === 'robotic' || P.matter === 'armored') this.burst(p, { n: 2, colors: [0xffcf6a, 0xffffff], glow: true, speed: 3, dir: dir ? dir.clone().negate() : null, push: 2, up: 1, grav: 10, life: 0.25, size: 0.03 });
      this.note({ type: 'slide', surface });
    }
    /** dash: an afterimage of glowing voxels where the body was */
    dashTrail(pos, prof, color) {
      const P = profile(prof), col = color || P.colors.glow;
      if (P.trail === 'none') return;
      this.column(pos, 1.8, { n: 8, colors: [col, P.colors.main], glow: true, speed: 0.1, up: 0.1, drag: 3, life: 0.28, size: 0.11, end: 0.02 });
      this.note({ type: 'dash', prof: P.id });
    }
    /**
     * Bodies I only see (the other player, bots): steps, landings and slides from how they move,
     * so the effects show on both screens without new messages.
     */
    watchBody(a, dt, prof, level) {
      let w = this.watch.get(a);
      if (!w) { w = { y: a.pos.y, vy: 0, air: false, stepAcc: 0, prev: a.pos.clone(), slideT: 0 }; this.watch.set(a, w); return; }
      if (!a.g.visible || dt <= 0) { w.prev.copy(a.pos); w.y = a.pos.y; return; }
      const vy = (a.pos.y - w.y) / dt; w.y = a.pos.y;
      const hs = Math.hypot(a.pos.x - w.prev.x, a.pos.z - w.prev.z) / dt; w.prev.copy(a.pos);
      if (hs > 30) return;                                                 // a teleport (respawn, blink)
      const air = a.air || a.pos.y > 0.25 && Math.abs(vy) > 0.5;
      if (w.air && !air && w.vyMin < -4) this.land(a.pos, -w.vyMin, groundAt(level, a.pos), prof);
      if (air) w.vyMin = Math.min(w.air ? w.vyMin : 0, vy); w.air = air;
      if (!air && !a.low && hs > 2) { w.stepAcc += hs * dt; if (w.stepAcc > 1.9) { w.stepAcc = 0; this.footstep(a.pos, groundAt(level, a.pos), prof, Math.random() < 0.5 ? -1 : 1); } }
      if (a.slide && hs > 3) { w.slideT -= dt; if (w.slideT <= 0) { w.slideT = 0.04; this.slideTrail(a.pos, null, groundAt(level, a.pos), prof); } }
      if (hs > 14 && !air) this.dashTrail(a.pos, prof);
    }

    // ================================================================ time
    /** a very short slow motion (allowed only where it changes nothing for anyone else) */
    slowmo(dur = 0.3, k = 0.35) { if (!S.slowmo) return false; this.slowT = dur; this.slowK = k; this.note({ type: 'slowmo' }); return true; }
    scaleDt(dt) {
      if (this.slowT <= 0) return dt;
      this.slowT -= dt;                                  // real time
      return dt * this.slowK;
    }

    // ================================================================ per frame
    update(dt, view) {
      this.solid.update(dt); this.glow.update(dt);
      for (const r of this.rings) {
        if (r.t <= 0) continue;
        r.t -= dt; const k = Math.max(0, r.t / r.max), e = 1 - k * k;
        r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); r.m.material.opacity = r.a * k;
        if (r.t <= 0) r.m.visible = false;
      }
      for (const s of this.sprites) {
        if (s.t <= 0) continue;
        s.t -= dt; const k = Math.max(0, s.t / s.max);
        s.s.scale.setScalar(s.z1 + (s.z0 - s.z1) * k); s.s.material.opacity = s.a * k;
        if (s.t <= 0) s.s.visible = false;
      }
      for (const l of this.lights) { if (l.t <= 0) continue; l.t -= dt; l.l.intensity = l.t > 0 ? l.I * l.t / l.max : 0; }
      for (let i = this.tasks.length - 1; i >= 0; i--) {
        const t = this.tasks[i]; t.t += dt;
        if (t.fn) t.fn(Math.min(1, t.t / t.dur), dt);
        if (t.t >= t.dur) { this.tasks.splice(i, 1); t.end && t.end(); }
      }
      this.screen.update(dt, view || {});
    }
  }

  // ------------------------------------------------------------------ the screen overlay
  // speed lines, damage direction, element tints, team flashes — one small canvas
  class Screen {
    constructor(anchor) {
      this.dirs = []; this.tintT = 0; this.tintMax = 0; this.tintCol = '#fff'; this.dirty = false;
      if (!anchor || !anchor.parentNode) return;
      // drawn just under the HUD's damage layer (so cards and the HUD stay on top)
      const cv = document.createElement('canvas'); cv.className = 'fb-screen';
      anchor.parentNode.insertBefore(cv, anchor); this.cv = cv; this.g = cv.getContext('2d');
    }
    dispose() { if (this.cv) this.cv.remove(); this.cv = null; }
    clear() { this.dirs.length = 0; this.tintT = 0; if (this.g) this.g.clearRect(0, 0, this.cv.width, this.cv.height); }
    /** a hit from a direction (world yaw of the source seen from me) */
    damageFrom(ang, k = 1) { this.dirs.push({ ang, t: 1.1, k }); if (this.dirs.length > 6) this.dirs.shift(); }
    tint(color, dur = 0.5) { if (!S.flashes) return; this.tintCol = '#' + color.toString(16).padStart(6, '0'); this.tintT = this.tintMax = dur; }
    update(dt, v) {
      if (!this.cv) return;
      const W = Math.max(1, Math.round(this.cv.clientWidth * 0.5)), H = Math.max(1, Math.round(this.cv.clientHeight * 0.5));
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      const g = this.g, speed = S.speed ? (v.speed || 0) : 0;
      this.tintT = Math.max(0, this.tintT - dt);
      for (const d of this.dirs) d.t -= dt;
      this.dirs = this.dirs.filter(d => d.t > 0);
      const busy = speed > 0.02 || this.dirs.length || this.tintT > 0;
      if (!busy && !this.dirty) return;
      g.clearRect(0, 0, W, H); this.dirty = busy;
      const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
      if (this.tintT > 0) { g.globalAlpha = 0.22 * this.tintT / this.tintMax; g.fillStyle = this.tintCol; g.fillRect(0, 0, W, H); }
      if (speed > 0.02) {
        // speed lines: more, longer and brighter the faster you go
        // (a dark edge under each white streak, so they read on bright walls and sky too)
        const n = Math.round(14 + 22 * speed);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r0 = R * (0.55 + Math.random() * 0.3), len = R * (0.1 + 0.28 * speed * Math.random());
          const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a) * (r0 + len), y1 = cy + Math.sin(a) * (r0 + len);
          const al = 0.25 + 0.45 * speed * Math.random();
          g.globalAlpha = al * 0.45; g.strokeStyle = '#1a1d26'; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          g.globalAlpha = al; g.strokeStyle = '#ffffff'; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
      }
      if (this.dirs.length) {
        // damage direction: a red arc around the crosshair pointing at the shooter
        const rr = Math.min(W, H) * 0.3;
        g.lineWidth = Math.max(3, Math.min(W, H) * 0.018); g.lineCap = 'round';
        for (const d of this.dirs) {
          const rel = d.ang - (v.yaw || 0), a = -Math.PI / 2 - rel;      // screen angle (0 = straight ahead = up)
          g.globalAlpha = Math.min(1, d.t * 1.4) * 0.85 * d.k; g.strokeStyle = '#ff3a28';
          g.beginPath(); g.arc(cx, cy, rr, a - 0.32, a + 0.32); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
  }

  VR.Feedback = { PROFILES, ELEMENTS, ARMS, MUZZLE, TRACER, register, profile, causeOf, surfaceOfMat, surfaceAt, groundAt, quality,
    get settings() { return S; }, set: setSettings, DEFAULTS };
  VR.FeedbackLayer = FeedbackLayer;
})();
