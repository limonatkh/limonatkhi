/* =====================================================================
 * THE SECRET CAVE — the hidden way from the runner course into the
 * exploration world (js/explore/explore.js).
 *
 * Once per solo course, somewhere in its middle part, a rock outcrop
 * stands on a pillar BESIDE the route (the same kind of spot the old 1v1
 * gates used: never on the route, never in the way). A dark opening, a
 * faint cold glow inside. No marker, no toast: only when you run in the
 * lane next to it, a small "E" appears; press E (or tap it) and you go
 * in — the run ends there (the coins you collected are kept) and you
 * arrive in the mountains on foot. Ignore it and the run goes on exactly
 * as before.
 *
 * The runner itself is untouched: this wraps the world's side-gate spawn
 * (after it has run), places its own meshes (pooled like the gates) and
 * uses Math.random, never the course's seeded random — a seeded course is
 * the same with or without the cave. Not in races (both players must get
 * the same course).
 * ===================================================================== */
(function () {
  const T = THREE;
  const tr = (k, v) => VR.t(k, v);
  Object.assign(VR.I18N.STRINGS.en, { 'sc.prompt': 'A dark opening in the rock…', 'sc.enter': 'Go in' });
  Object.assign(VR.I18N.STRINGS.ar, { 'sc.prompt': 'فتحة مظلمة في الصخر…', 'sc.enter': 'ادخل' });

  const FROM = 9, TO = 18;                     // the course sections it may appear in

  /** the outcrop: rock, a dark recessed opening facing the route, a faint glow deep inside */
  function buildCave(side) {
    const vb = new VR.VoxelBuilder();
    const f = -side;                             // the route is on this side (x direction of the opening)
    vb.addBox(0, 0, 0, 4.0, 3.6, 4.2, 'stone');
    vb.addBox(side * 0.6, 3.6, 0.3, 3.0, 1.4, 3.2, 'cobble');
    vb.addBox(side * 0.4, 0, -2.4, 2.4, 2.2, 1.4, 'cobble');                 // a boulder half hiding it
    vb.addBox(f * 1.95, 0.02, 0, 0.3, 2.2, 1.6, 'dark');                    // the opening
    vb.addBox(f * 1.4, 0.02, 0, 0.9, 2.1, 1.4, 'dark');
    vb.addBox(f * 0.85, 0.3, 0, 0.12, 1.4, 0.9, 'lamp#7fe8ff');             // the cold glow, deep inside
    vb.addBox(f * 2.0, -0.02, 1.4, 0.6, 0.9, 0.6, VR.Mat.tinted('leaves', 0x4f8a32));   // a bush by it
    return vb;
  }

  const Cave = {
    cave: null, game: null, entering: false, promptEl: null,
    /** called once by game.js */
    setup(game) {
      this.game = game;
      const w = game.world, orig = w.maybeSpawnDuelGate.bind(w);
      w.maybeSpawnDuelGate = (chunk, sec, z0) => { orig(chunk, sec, z0); this.maybePlace(chunk, sec, z0); };
      const el = document.createElement('button'); el.type = 'button'; el.id = 'secretPrompt'; el.hidden = true;
      el.innerHTML = `<b>E</b><span></span>`;
      el.addEventListener('click', () => this.interact(game));
      document.body.appendChild(el); this.promptEl = el;
      const reset = game.resetRun.bind(game);
      game.resetRun = (seed) => { this.cave = null; this.target = FROM + ((Math.random() * (TO - FROM)) | 0); this.hide(); return reset(seed); };
    },
    allowed() { const g = this.game; return !!g && !(g.challenge && (g.challenge.inRace || g.challenge.active)); },
    maybePlace(chunk, sec, z0) {
      if (this.cave || !this.allowed() || chunk.id < (this.target || FROM) || chunk.id > TO || !sec.gateable) return;
      const sides = [-1, 1].filter(s => sec.sides[s < 0 ? 0 : 1] !== 'wall');
      if (!sides.length) return;
      const w = this.game.world, side = sides[(Math.random() * sides.length) | 0];
      const key = 'secretcave_' + side;
      w.lazyPool(key, () => buildCave(side));
      const u = 24, regs = sec.route.regions(u);
      const edge = side < 0 ? regs[0].a : regs[regs.length - 1].b;
      const x = edge + side * (VR.GATE_PEDESTAL_OFFSET + (sec.sides[side < 0 ? 0 : 1] === 'shoulder' ? 2 : 0));
      const z = z0 - u;
      const obj = w.track.place(w.pool.get(key), x, 0, z);
      const ped = w.track.place(w.pool.get('pedestal_' + side), x, 0, z);
      chunk.parts.push(obj, ped);                    // released with the chunk, like the gates
      this.cave = { chunk: chunk.id, x, z, side };
    },
    /** every running frame: show the small E only when you run in the lane next to it, just before it */
    roadUpdate(game) {
      const c = this.cave, p = game.player;
      if (!c || !game.world.chunks.some(ch => ch.id === c.chunk)) { if (c && c.z > p.z + 50) this.cave = null; this.hide(); return; }
      const ahead = p.z - c.z;
      const near = ahead > -1 && ahead < 26 && p.x * c.side > 0.6 && game.state === 'playing';
      if (near) this.show(); else this.hide();
      c.near = near;
    },
    show() { const el = this.promptEl; if (el && el.hidden) { el.querySelector('span').textContent = tr('sc.prompt'); el.hidden = false; } },
    hide() { if (this.promptEl && !this.promptEl.hidden) this.promptEl.hidden = true; },
    /** E (or the tap) near the cave: in we go. Returns true when it used the key. */
    interact(game) {
      const c = this.cave;
      if (!c || !c.near || this.entering || game.state !== 'playing') return false;
      this.entering = true; this.hide();
      game.bankRun();                                // the coins of this run are kept
      game.setState('secretEnter');
      game.fade.target = 1;
      VR.Audio.play('portal'); VR.Audio.setMusicVolume(0.25);
      return true;
    },
    /** game loop while fading into the cave */
    updateEnter(game, dt) {
      if (game.fade.value < 0.99) return;
      this.entering = false; this.cave = null;
      game.courseFrom = null;
      game.modes.arrive('explore');
    },
    /** tests: put the cave right ahead of the runner */
    debugPlaceAhead(game, dist = 20) {
      const p = game.player, side = p.x >= 0 ? 1 : -1;
      const w = game.world, ch = w.chunkAt(p.z - dist) || w.chunkAt(p.z) || w.chunks[w.chunks.length - 1];
      this.cave = { chunk: ch.id, x: side * 6, z: p.z - dist, side };
    },
  };
  VR.SecretCave = Cave;
})();
