/* =====================================================================
 * BILLIARDS WORLD — eight-ball against the computer (the "BILLIARDS" door
 * in the square). The physics and the rules are js/mini/poolsim.js; this
 * file is the room, the table, the cue, the controls, the camera, the
 * opponent's turns and the score panel.
 *
 * Controls (mouse, touch and keys do the same things):
 *   aim       drag on the table (left / right turns the cue); in the TOP
 *             view the cue points where you point · A / D or ← / → (Shift: fine)
 *   power     the POWER bar on the right: press, pull down, let go = shoot
 *             (back up to the top cancels) · W / S set it, Space / Enter shoots
 *   view      V or 👁: behind the cue ↔ from above · mouse wheel: closer / further
 *   ball in hand  drag the cue ball where you want it (a green area shows
 *             where it may go), let go or ✓ to put it down
 * ===================================================================== */
(function () {
  const T = THREE, P = VR.Pool8, K = VR.MiniGames.Kit;
  const tr = (k, v) => VR.t(k, v);
  const Y = 0.80;                       // the cloth's height
  const BALL_COL = { 1: 0xf2c21b, 2: 0x1f5fd1, 3: 0xd8322a, 4: 0x6a2fa0, 5: 0xf07a1a, 6: 0x1d8f3a, 7: 0x7a1f1f, 8: 0x141414 };
  const colOf = (n) => (n === 0 ? 0xf6f1e3 : BALL_COL[n > 8 ? n - 8 : n]);
  const css = (n) => '#' + colOf(n).toString(16).padStart(6, '0');
  const ME = 0xffe14a, AI = 0x9b6bff;

  Object.assign(VR.I18N.STRINGS.en, {
    'bl.title': 'BILLIARDS — 8-BALL', 'bl.goal': 'Pocket your assigned balls, then pocket the eight ball to win.',
    'bl.kAim': 'Drag on the table · A / D', 'bl.kAimW': 'Aim', 'bl.kPow': 'POWER bar: pull down, let go · W / S + Space', 'bl.kPowW': 'Shoot',
    'bl.kView': 'V · 👁 · mouse wheel', 'bl.kViewW': 'Camera', 'bl.kHand': 'Drag the cue ball, let go / ✓', 'bl.kHandW': 'Ball in hand',
    'bl.opp': 'Lemon Bot', 'bl.open': 'open table', 'bl.solid': 'SOLIDS', 'bl.stripe': 'STRIPES',
    'bl.yourTurn': 'Your shot', 'bl.oppTurn': 'Opponent\'s shot', 'bl.rolling': '…', 'bl.thinking': 'Opponent is thinking…',
    'bl.break': 'Your break! Put the cue ball behind the line, then shoot hard.', 'bl.place': 'Ball in hand: put the cue ball anywhere (green area)',
    'bl.placeK': 'Put the cue ball behind the line (green area)', 'bl.aimHint': 'Aim, then pull the POWER bar down and let go',
    'bl.f.scratch': 'Foul: the cue ball went in', 'bl.f.noHit': 'Foul: no ball was hit', 'bl.f.wrongFirst': 'Foul: wrong ball hit first',
    'bl.f.eightFirst': 'Foul: the 8 can\'t be hit first yet', 'bl.f.noRail': 'Foul: no ball reached a cushion',
    'bl.inHandMe': 'Ball in hand for you', 'bl.inHandOpp': 'Ball in hand for the opponent',
    'bl.youAre': 'You are {g}', 'bl.oppBall': 'That was the opponent\'s ball — turn over', 'bl.respot': 'The 8 on the break goes back on its spot',
    'bl.r.won8': 'You pocketed the 8 — game!', 'bl.r.lostWon8': 'The opponent cleared the table and sank the 8',
    'bl.r.eightEarly': 'The 8 went in too early', 'bl.r.eightFoul': 'The 8 went in on a foul', 'bl.r.oppEarly': 'The opponent sank the 8 too early',
    'bl.r.oppFoul': 'The opponent fouled on the 8', 'bl.left': 'Balls left — you: {a} · opponent: {b}', 'bl.place.ok': '✓ Place',
    'bl.power': 'POWER', 'bl.shots': 'Shots: {n}',
    'bl.oppBreak': '{name} breaks', 'bl.youBreak': 'Your break! Put the cue ball behind the line, then shoot hard.', 'bl.sync': 'Setting up the table…',
    'bl.oppAims': '{name} is aiming…', 'bl.r.left': 'Your opponent left — you win',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'bl.title': 'البلياردو — الكرة 8', 'bl.goal': 'أدخل كراتك المحددة، ثم أدخل الكرة 8 لتفوز.',
    'bl.kAim': 'اسحب على الطاولة · A / D', 'bl.kAimW': 'التصويب', 'bl.kPow': 'شريط القوة: اسحب لأسفل ثم اترك · W / S + مسافة', 'bl.kPowW': 'الضرب',
    'bl.kView': 'V · 👁 · عجلة الفأرة', 'bl.kViewW': 'الكاميرا', 'bl.kHand': 'اسحب الكرة البيضاء ثم اترك / ✓', 'bl.kHandW': 'الكرة في اليد',
    'bl.opp': 'روبوت الليمون', 'bl.open': 'الطاولة مفتوحة', 'bl.solid': 'السادة', 'bl.stripe': 'المخططة',
    'bl.yourTurn': 'دورك', 'bl.oppTurn': 'دور الخصم', 'bl.rolling': '…', 'bl.thinking': 'الخصم يفكّر…',
    'bl.break': 'الضربة الافتتاحية لك! ضع الكرة البيضاء خلف الخط ثم اضرب بقوة.', 'bl.place': 'الكرة في يدك: ضع البيضاء في أي مكان (المنطقة الخضراء)',
    'bl.placeK': 'ضع الكرة البيضاء خلف الخط (المنطقة الخضراء)', 'bl.aimHint': 'صوّب، ثم اسحب شريط القوة لأسفل واتركه',
    'bl.f.scratch': 'خطأ: دخلت الكرة البيضاء', 'bl.f.noHit': 'خطأ: لم تُلمس أي كرة', 'bl.f.wrongFirst': 'خطأ: لُمست كرة خاطئة أولًا',
    'bl.f.eightFirst': 'خطأ: لا يجوز ضرب الكرة 8 أولًا الآن', 'bl.f.noRail': 'خطأ: لم تصل أي كرة إلى الحافة',
    'bl.inHandMe': 'الكرة في يدك', 'bl.inHandOpp': 'الكرة في يد الخصم',
    'bl.youAre': 'كراتك: {g}', 'bl.oppBall': 'كانت كرة الخصم — انتهى دورك', 'bl.respot': 'الكرة 8 في الافتتاحية تعود إلى مكانها',
    'bl.r.won8': 'أدخلت الكرة 8 — فزت بالمباراة!', 'bl.r.lostWon8': 'الخصم أنهى كراته وأدخل الكرة 8',
    'bl.r.eightEarly': 'دخلت الكرة 8 مبكرًا', 'bl.r.eightFoul': 'دخلت الكرة 8 مع خطأ', 'bl.r.oppEarly': 'الخصم أدخل الكرة 8 مبكرًا',
    'bl.r.oppFoul': 'الخصم ارتكب خطأ على الكرة 8', 'bl.left': 'الكرات المتبقية — أنت: {a} · الخصم: {b}', 'bl.place.ok': '✓ ضعها',
    'bl.power': 'القوة', 'bl.shots': 'الضربات: {n}',
    'bl.oppBreak': '{name} يفتتح', 'bl.youBreak': 'الضربة الافتتاحية لك! ضع الكرة البيضاء خلف الخط ثم اضرب بقوة.', 'bl.sync': 'تجهيز الطاولة…',
    'bl.oppAims': '{name} يصوّب…', 'bl.r.left': 'خصمك غادر — فزت',
  });

  // sounds: ball on ball, cushion, a pocket, the cue
  VR.Audio.define('poolClack', ({ tone, noise }) => { tone(1900, 0.03, 'square', 0.1, 1300); noise(0.02, 0.08, 4200); });
  VR.Audio.define('poolRail', ({ tone, noise }) => { tone(170, 0.07, 'sine', 0.16, 95); noise(0.04, 0.07, 700); });
  VR.Audio.define('poolPocket', ({ tone, noise }) => { tone(240, 0.07, 'triangle', 0.16, 120); noise(0.1, 0.1, 450); tone(120, 0.12, 'sine', 0.14, 60, 0.07); });
  VR.Audio.define('poolCue', ({ tone, noise }) => { noise(0.03, 0.2, 2600); tone(700, 0.04, 'square', 0.08, 300); });

  /** a ball's texture: colour (or a white ball with a band), a number on both sides */
  function ballTex(n) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const c = cv.getContext('2d');
    const stripe = n > 8;
    c.fillStyle = stripe ? '#f6f1e3' : css(n); c.fillRect(0, 0, 64, 32);
    if (stripe) { c.fillStyle = css(n); c.fillRect(0, 9, 64, 14); }
    if (n) for (const u of [16, 48]) {
      c.fillStyle = '#f6f1e3'; c.beginPath(); c.arc(u, 16, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), u, 16.5);
    }
    const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  class Billiards {
    constructor(mgr) {
      this.mgr = mgr; this.scene = mgr.scene; this.cam = mgr.camera; this.game = mgr.game;
      this.sim = new P.PoolSim(); this.rules = new P.EightBall();
      this.sim.rack(); this.phase = 'idle';
      this.aim = 0; this.power = 0; this.view = VR.UI.store.get('poolView', 'aim'); this.camDist = 1.2;
      this.keys = new Set(); this.shots = [0, 0];
      this.camPos = new T.Vector3(0, Y + 2.2, 2.6); this.camLook = new T.Vector3(0, Y, 0);
      this.v = new T.Vector3(); this.ray = new T.Raycaster(); this.plane = new T.Plane(new T.Vector3(0, 1, 0), -(Y + P.R));
      this.drops = [];
      this.buildRoom(); this.buildTable(); this.buildBalls(); this.buildCue(); this.buildGuide(); this.buildBodies(); this.buildHud();
      this.bind();
      this.syncBalls(0);
      this.place(this.cam, true);
    }
    intro() {
      return { title: tr('bl.title'), goal: tr('bl.goal'),
        controls: [[tr('bl.kAim'), tr('bl.kAimW')], [tr('bl.kPow'), tr('bl.kPowW')], [tr('bl.kHand'), tr('bl.kHandW')], [tr('bl.kView'), tr('bl.kViewW')]] };
    }

    // ------------------------------------------------------------ the world
    buildRoom() {
      const s = this.scene;
      K.lights(s, 0x1c2130, 1.25, 0.6);
      s.fog = new T.Fog(0x1c2130, 9, 22);
      // floor (dark planks), walls, a skirting line
      const vox = [];
      for (let i = -6; i < 6; i++) vox.push([0, -0.1, i * 0.8 + 0.4, 12, 0.1, 0.78, i % 2 ? 0x4a3020 : 0x553722]);
      vox.push([0, 0, -5.1, 12, 3.4, 0.2, 0x2f4a3a], [0, 0, 5.1, 12, 3.4, 0.2, 0x2f4a3a], [-6.1, 0, 0, 0.2, 3.4, 10.4, 0x2a4434], [6.1, 0, 0, 0.2, 3.4, 10.4, 0x2a4434]);
      vox.push([0, 0, -4.98, 12, 0.18, 0.06, 0x7a4c28], [0, 0, 4.98, 12, 0.18, 0.06, 0x7a4c28]);
      // a cue rack on the back wall, two stools, a lemon tree in a pot
      vox.push([-2.6, 0.9, -4.95, 1.4, 0.12, 0.1, 0x5a3a20], [-2.6, 1.9, -4.95, 1.4, 0.12, 0.1, 0x5a3a20]);
      for (let i = 0; i < 6; i++) vox.push([-3.15 + i * 0.22, 0.75, -4.9, 0.035, 1.35, 0.035, i % 2 ? 0xc9955a : 0xa8743c]);
      for (const [x, z] of [[3.6, 3.6], [4.4, 3.6]]) vox.push([x, 0, z, 0.08, 0.7, 0.08, 0x333333], [x, 0.7, z, 0.45, 0.08, 0.45, 0xb8322a]);
      vox.push([-5.2, 0, 3.9, 0.6, 0.5, 0.6, 0xa0522d], [-5.2, 0.5, 3.9, 0.12, 0.9, 0.12, 0x6b4526], [-5.2, 1.3, 3.9, 0.9, 0.7, 0.9, 0x3f8a2b],
        [-4.95, 1.45, 4.15, 0.16, 0.16, 0.16, 0xffe14a], [-5.4, 1.6, 3.7, 0.16, 0.16, 0.16, 0xffe14a]);
      s.add(K.voxels(vox));
      // the lamp over the table
      const lamp = K.voxels([[0, 2.55, 0, 1.6, 0.16, 0.5, 0x1f4d2b], [0, 2.71, 0, 0.06, 0.8, 0.06, 0x222222]]);
      s.add(lamp); this.lamp = lamp;
      const glow = new T.Mesh(new T.PlaneGeometry(1.5, 0.42), K.basic(0xfff2c4));
      glow.rotation.x = Math.PI / 2; glow.position.set(0, 2.54, 0); s.add(glow);
      const l1 = new T.PointLight(0xfff0cc, 4.5, 5, 1.6); l1.position.set(-0.5, 2.4, 0);
      const l2 = new T.PointLight(0xfff0cc, 4.5, 5, 1.6); l2.position.set(0.5, 2.4, 0);
      s.add(l1, l2); this.glow = glow;
      // the score panel on the back wall
      this.boardM = K.board(3.2, 1.0, 512, 160); this.boardM.position.set(1.6, 2.15, -4.98); s.add(this.boardM);
      const sign = VR.WorldText.make({ text: '🎱 8-BALL', style: 'sign', size: 0.3, width: 3 }); sign.position.set(-2.6, 2.5, -4.9); s.add(sign);
    }
    buildTable() {
      const s = this.scene, L = P.L, W = P.W, HL = P.HL, HW = P.HW, R = P.R;
      const g = new T.Group(); s.add(g); this.table = g;
      // cloth, rails (cushions) with the pocket openings, the wooden frame, legs
      K.box(L + 0.02, 0.06, W + 0.02, 0x17603a, 0, Y - 0.03, 0, g);
      const rail = 0x114a2c, rh = 0.045, rw = 0.045;
      const segX = [[-HL + P.MOUTH_C, -P.MOUTH_S], [P.MOUTH_S, HL - P.MOUTH_C]];
      for (const sz of [-1, 1]) for (const [a, b] of segX) K.box(b - a, rh, rw, rail, (a + b) / 2, Y + rh / 2, sz * (HW + rw / 2), g);
      for (const sx of [-1, 1]) K.box(rw, rh, W - 2 * P.MOUTH_C, rail, sx * (HL + rw / 2), Y + rh / 2, 0, g);
      const wood = 0x6b3f1f, fw = 0.13;
      for (const sz of [-1, 1]) K.box(L + 2 * (rw + fw), 0.12, fw, wood, 0, Y - 0.02, sz * (HW + rw + fw / 2), g);
      for (const sx of [-1, 1]) K.box(fw, 0.12, W + 2 * rw, wood, sx * (HL + rw + fw / 2), Y - 0.02, 0, g);
      K.box(L + 0.2, 0.18, W + 0.2, 0x4a2c16, 0, Y - 0.15, 0, g);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.16, Y - 0.2, 0.16, 0x4a2c16, sx * (HL - 0.1), (Y - 0.2) / 2, sz * (HW - 0.1), g);
      // pockets: black holes on the frame corners and sides
      const hole = K.mat(0x050505);
      for (const p of P.POCKETS) {
        const m = new T.Mesh(new T.CylinderGeometry(p.k === 'c' ? 0.062 : 0.056, 0.05, 0.03, 10), hole);
        m.position.set(p.x, Y + 0.004, p.z); g.add(m);
      }
      // diamonds on the frame
      for (let i = 1; i < 8; i++) if (i !== 4) for (const sz of [-1, 1]) K.box(0.018, 0.006, 0.018, 0xf2ead2, -HL + i * L / 8, Y + 0.042, sz * (HW + rw + fw / 2), g);
      for (let i = 1; i < 4; i++) for (const sx of [-1, 1]) K.box(0.018, 0.006, 0.018, 0xf2ead2, sx * (HL + rw + fw / 2), Y + 0.042, -HW + i * W / 4, g);
      // the head string (break line) and the foot spot
      const ln = new T.Mesh(new T.PlaneGeometry(0.006, W), K.basic(0xd7f0d0, { transparent: true, opacity: 0.35 }));
      ln.rotation.x = -Math.PI / 2; ln.position.set(P.HEAD.x, Y + 0.001, 0); g.add(ln);
      const spot = new T.Mesh(new T.CircleGeometry(0.008, 8), K.basic(0xd7f0d0)); spot.rotation.x = -Math.PI / 2; spot.position.set(P.FOOT.x, Y + 0.001, 0); g.add(spot);
      // where the cue ball may go (ball in hand)
      this.zone = new T.Mesh(new T.PlaneGeometry(1, 1), K.basic(0xd8ffd0, { transparent: true, opacity: 0.22, depthWrite: false }));
      this.zone.rotation.x = -Math.PI / 2; this.zone.position.y = Y + 0.002; this.zone.visible = false; g.add(this.zone);
    }
    buildBalls() {
      const geo = new T.SphereGeometry(P.R, 14, 10);
      this.ballM = [];
      for (let n = 0; n <= 15; n++) {
        const m = new T.Mesh(geo, K.mat(0xffffff, { map: ballTex(n) }));
        m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        this.scene.add(m); this.ballM.push(m);
      }
      // a see-through cue ball shows where it will be put down
      this.ghost = new T.Mesh(geo, K.basic(0xffffff, { transparent: true, opacity: 0.55 }));
      this.ghost.visible = false; this.scene.add(this.ghost);
    }
    buildCue() {
      // tip at the origin, the stick along -z (the butt), so lookAt() points it along the shot
      const g = new T.Group();
      const part = (len, z0, r0, col) => { const m = new T.Mesh(new T.BoxGeometry(r0, r0, len), K.mat(col)); m.position.z = -(z0 + len / 2); g.add(m); };
      part(0.012, 0, 0.012, 0x5b8bd6); part(0.03, 0.012, 0.013, 0xf2ead2); part(0.95, 0.042, 0.015, 0xd9b27a); part(0.45, 0.99, 0.022, 0x3a2414); part(0.02, 1.44, 0.024, 0x111111);
      this.cue = g; this.scene.add(g); this.pull = 0;
    }
    buildGuide() {
      const mk = (col, op) => { const ln = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: col, transparent: true, opacity: op })); ln.material.userData.mini = true; this.scene.add(ln); return ln; };
      this.gLine = mk(0xffffff, 0.85); this.gObj = mk(0xffe14a, 0.9); this.gCue = mk(0x9fd7ff, 0.6);
      this.gGhost = new T.Mesh(new T.RingGeometry(P.R * 0.82, P.R, 18), K.basic(0xffffff, { transparent: true, opacity: 0.8, side: T.DoubleSide }));
      this.gGhost.rotation.x = -Math.PI / 2; this.scene.add(this.gGhost);
    }
    buildBodies() {
      const mine = VR.CHARACTERS[this.game.charIndex] || VR.CHARACTERS[0];
      const other = VR.CHARACTERS.find(c => c.id !== mine.id) || mine;
      this.bodies = [K.body(mine.id, 'white', ME), K.body(other.id, other.id === mine.id ? 'grey' : 'white', AI)];
      this.idle = [{ x: -P.HL - 0.7, z: -P.HW - 1.5 }, { x: P.HL + 0.7, z: -P.HW - 1.5 }];
      this.bodies.forEach((b, i) => { b.pos.set(this.idle[i].x, 0, this.idle[i].z); b.want = { x: this.idle[i].x, z: this.idle[i].z, yaw: 0 }; this.scene.add(b.g); });
    }
    buildHud() {
      const hud = this.mgr.el.hud, touch = this.mgr.el.touch;
      hud.innerHTML = `<div class="bl-top">
          <div class="bl-side bl-me"><b class="bl-name"></b><span class="bl-group"></span><span class="bl-balls"></span></div>
          <div class="bl-status"></div>
          <div class="bl-side bl-ai"><b class="bl-name"></b><span class="bl-group"></span><span class="bl-balls"></span></div>
        </div>
        <div class="bl-hint"></div>`;
      touch.innerHTML = `<div class="bl-power" role="slider" aria-label="power"><div class="bl-pfill"></div><b>${tr('bl.power')}</b></div>
        <div class="bl-btns"><button class="btn small" data-b="view" type="button">👁</button><button class="btn small" data-b="left" type="button">◀</button><button class="btn small" data-b="right" type="button">▶</button><button class="btn small bl-ok" data-b="place" type="button" hidden>${tr('bl.place.ok')}</button></div>`;
      const q = (s) => this.mgr.root.querySelector(s);
      this.el = { me: q('.bl-me'), ai: q('.bl-ai'), status: q('.bl-status'), hint: q('.bl-hint'), power: q('.bl-power'), fill: q('.bl-pfill'), ok: q('.bl-ok') };
      this.el.me.querySelector('.bl-name').textContent = (VR.Profiles.player().name || tr('mg.you')).slice(0, 14);
      this.el.ai.querySelector('.bl-name').textContent = tr('bl.opp');
      this.paintHud();
    }

    // ------------------------------------------------------------ input
    bind() {
      const cv = this.game.renderer.domElement;
      this.on = [];
      const add = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.on.push([el, ev, fn, opt]); };
      // the table: aim / ball in hand
      add(cv, 'pointerdown', (e) => { if (!this.live) return; this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY }; this.pointAt(e, true); });
      add(window, 'pointermove', (e) => {
        if (!this.live) return;
        if (this.ptr && e.pointerId === this.ptr.id) {
          if (this.phase === 'aim' && this.view === 'aim') { const k = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 0.0012 : 0.0042; this.aim -= (e.clientX - this.ptr.x) * k; }
          this.ptr.x = e.clientX; this.ptr.y = e.clientY;
          this.pointAt(e, true);
        } else if (e.pointerType === 'mouse' && e.target === cv) this.pointAt(e, false);
      });
      add(window, 'pointerup', (e) => {
        if (this.ptr && e.pointerId === this.ptr.id) { this.ptr = null; if (this.live && this.phase === 'place' && this.ghostOk) this.confirmPlace(); }
      });
      add(cv, 'wheel', (e) => { if (!this.live) return; this.camDist = Math.max(0.6, Math.min(2.6, this.camDist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
      // the power bar: press, pull down, let go
      const pw = this.el.power;
      add(pw, 'pointerdown', (e) => { if (!this.canShoot()) return; e.preventDefault(); e.stopPropagation(); pw.setPointerCapture(e.pointerId); this.pdrag = { id: e.pointerId, y: e.clientY, h: pw.getBoundingClientRect().height }; this.setPower(0); });
      add(pw, 'pointermove', (e) => { if (!this.pdrag || e.pointerId !== this.pdrag.id) return; this.setPower((e.clientY - this.pdrag.y) / (this.pdrag.h * 0.85)); });
      const release = (e) => { if (!this.pdrag || e.pointerId !== this.pdrag.id) return; this.pdrag = null; if (this.power > 0.03 && this.canShoot()) this.playerShoot(); else this.setPower(0); };
      add(pw, 'pointerup', release); add(pw, 'pointercancel', release);
      // buttons
      this.mgr.root.querySelectorAll('.bl-btns [data-b]').forEach(b => {
        const act = b.dataset.b;
        if (act === 'left' || act === 'right') {
          add(b, 'pointerdown', (e) => { e.preventDefault(); this.keys.add(act === 'left' ? 'ArrowLeft' : 'ArrowRight'); });
          for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) add(b, ev, () => { this.keys.delete('ArrowLeft'); this.keys.delete('ArrowRight'); });
        } else add(b, 'click', () => { VR.Audio.play('click'); if (act === 'view') this.toggleView(); else if (act === 'place' && this.phase === 'place') this.confirmPlace(); });
      });
      // keys (VR.Input is in 'mini' mode: it only reports Esc for the pause)
      add(window, 'keydown', (e) => {
        if (!this.live || e.target && e.target.tagName === 'INPUT') return;
        this.keys.add(e.code);
        if (e.code === 'KeyV') this.toggleView();
        if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
          if (this.phase === 'place') this.confirmPlace();
          else if (this.canShoot() && this.power > 0.03) this.playerShoot();
        }
      });
      add(window, 'keyup', (e) => this.keys.delete(e.code));
      add(window, 'blur', () => this.keys.clear());
    }
    unbind() { for (const [el, ev, fn, opt] of this.on || []) el.removeEventListener(ev, fn, opt); this.on = []; }
    /** a pointer on the table: aim (top view) or move the cue ball (ball in hand) */
    pointAt(e, pressed) {
      const r = this.game.renderer.domElement.getBoundingClientRect();
      const ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.cam);
      const hit = this.ray.ray.intersectPlane(this.plane, this.v); if (!hit) return;
      if (this.phase === 'place' && pressed) this.moveGhost(hit.x, hit.z);
      else if (this.phase === 'aim' && this.view === 'top' && this.rules.turn === 0) {
        const c = this.sim.cue; if (Math.hypot(hit.x - c.x, hit.z - c.z) > 0.02) this.aim = Math.atan2(hit.z - c.z, hit.x - c.x);
      }
    }
    toggleView() { this.view = this.view === 'aim' ? 'top' : 'aim'; VR.UI.store.set('poolView', this.view); }
    setPower(p) { this.power = Math.max(0, Math.min(1, p)); this.el.fill.style.height = Math.round(this.power * 100) + '%'; }
    canShoot() { return this.live && this.phase === 'aim' && this.rules.turn === 0 && !this.rules.over; }

    // ------------------------------------------------------------ the match
    start(level) {
      this.level = level;
      this.sim = new P.PoolSim(); this.sim.rack(); this.rules = new P.EightBall();
      this.shots = [0, 0]; this.drops = []; this.planner = null;
      this.ballM.forEach(m => { m.visible = true; m.scale.setScalar(1); });
      this.syncBalls(0);
      this.mgr.banner(tr('bl.break'), 'info', 2.4);
      this.beginTurn();
    }
    /**
     * Against a friend online (js/mini/mininet.js). The inviter's game is the referee: it racks,
     * it judges every shot and sends the result; both games roll each shot themselves (the same
     * strike) and the guest snaps to the referee's table when the balls stop. Side 0 is always
     * "me" on each screen: the guest sees the referee's sides swapped.
     */
    startOnline(net) {
      this.net = net; this.level = 'online';
      this.sim = new P.PoolSim(); this.rules = new P.EightBall();
      this.shots = [0, 0]; this.drops = []; this.planner = null; this.pj = null; this.pendingShot = null; this.stT = 0;
      this.ballM.forEach(m => { m.visible = true; m.scale.setScalar(1); });
      this.el.ai.querySelector('.bl-name').textContent = net.oppName.slice(0, 14);
      if (net.host) {
        this.sim.rack();
        for (const b of this.sim.balls) { b.x = +b.x.toFixed(5); b.z = +b.z.toFixed(5); }       // (exactly what the guest gets)
        net.send({ k: 'pr', b: this.sim.balls.map(b => [b.x, b.z]) });
        this.rules.turn = 0;
        this.syncBalls(0);
        this.mgr.banner(tr('bl.youBreak'), 'info', 2.4);
        this.beginTurn();
      } else {
        this.rules.turn = 1;                                 // the inviter breaks
        this.phase = 'sync'; this.hint(tr('bl.sync'));
        this.paintHud();
      }
      net.listen((d) => this.onNet(d));                     // (what came while the room was loading: now)
    }
    oppName() { return this.net ? this.net.oppName : tr('bl.opp'); }
    /** the referee's view → mine (the guest: sides swapped) */
    flip(s) { return this.net && !this.net.host ? 1 - s : s; }
    onNet(d) {
      switch (d.k) {
        case 'pr':                                            // the rack (guest)
          if (this.net.host || this.phase !== 'sync') return;
          d.b.forEach(([x, z], n) => { const b = this.sim.balls[n]; if (b) { b.x = x; b.z = z; b.on = true; b.vx = b.vz = 0; } });
          this.syncBalls(0);
          this.mgr.banner(tr('bl.oppBreak', { name: this.oppName() }), 'info', 2);
          this.beginTurn();
          break;
        case 'st':                                            // the other player aiming / placing the cue ball
          if (this.phase !== 'opp') return;
          this.oppAim = d;
          break;
        case 'ps':                                            // the other player's shot
          if (this.phase === 'opp') this.takeOppShot(d); else this.pendingShot = d;
          break;
        case 'pj':                                            // the referee's judgement (guest)
          this.pj = d;
          if (this.phase === 'judgeWait') this.applyJudge();
          break;
        case 'bye':
          if (!this.rules.over && this.phase !== 'over' && this.phase !== 'done') { this.rules.over = { winner: 0, reason: 'left' }; this.end(this.rules.over); }
          break;
      }
    }
    takeOppShot(d) {
      this.pendingShot = null;
      const c = this.sim.cue; c.x = d.cx; c.z = d.cz; c.on = true; c.vx = c.vz = 0;
      this.aim = d.a; this.setPower(Math.min(1, d.s / 6.8));
      this.strikeNow(1, d.a, d.s);
    }
    /** the opponent's turn: the computer thinks — or, online, the friend plays it */
    oppTurn() {
      if (!this.net) return this.aiTurn();
      this.phase = 'opp'; this.oppAim = null;
      this.hint(tr('bl.oppAims', { name: this.oppName() }));
      if (this.pendingShot) this.takeOppShot(this.pendingShot);
    }
    /** the table as the referee has it */
    snap() {
      const r = this.rules;
      return { b: this.sim.balls.map(b => [+b.x.toFixed(5), +b.z.toFixed(5), b.on ? 1 : 0]), turn: r.turn, groups: r.groups.slice(), isBreak: r.isBreak, inHand: r.inHand, over: r.over, potted: [...r.potted] };
    }
    /** guest: the referee's result for the shot that just stopped */
    applyJudge() {
      const { out, st } = this.pj; this.pj = null;
      const r = this.rules;
      st.b.forEach(([x, z, on], n) => { const b = this.sim.balls[n]; b.x = x; b.z = z; b.on = !!on; b.vx = b.vz = 0; });
      r.turn = this.flip(st.turn); r.groups = [st.groups[1], st.groups[0]]; r.isBreak = st.isBreak; r.inHand = st.inHand;
      r.over = st.over ? { winner: this.flip(st.over.winner), reason: st.over.reason } : null;
      r.potted = new Set(st.potted); r.shot = null;
      this.drops = this.drops.filter(dd => !this.sim.balls[dd.n].on);
      for (const b of this.sim.balls) if (b.on) { this.ballM[b.n].scale.setScalar(1); }
      const o = Object.assign({}, out); if (o.over) o.over = r.over;
      this.showJudge(o);
    }
    pause(on) {
      this.live = !on;
      if (!on) { VR.Input.setMode('mini'); VR.Input.setEnabled(false); }
      this.keys.clear(); this.ptr = null; this.pdrag = null;
    }
    /** whoever's turn it is: ball in hand first if they have it */
    beginTurn() {
      const r = this.rules, me = r.turn === 0;
      this.setPower(0);
      if (r.over) return;
      if (r.inHand) {
        if (me) {
          this.phase = 'place';
          const c = this.sim.cue;
          if (!c.on || !this.sim.freeSpot(c.x, c.z, r.inHand === 'kitchen' ? 'kitchen' : null)) { c.x = P.HEAD.x; c.z = 0; c.on = true; c.vx = c.vz = 0; if (!this.sim.freeSpot(c.x, c.z, r.inHand)) this.findFree(); }
          this.moveGhost(c.x, c.z);
          this.hint(tr(r.inHand === 'kitchen' ? 'bl.placeK' : 'bl.place'));
        } else this.oppTurn();
      } else if (me) { this.phase = 'aim'; this.hint(tr('bl.aimHint')); this.faceSomething(); }
      else this.oppTurn();
      this.paintHud();
    }
    findFree() { const c = this.sim.cue; for (let k = 0; k < 300; k++) { const x = (Math.random() - 0.5) * (P.L - 0.2), z = (Math.random() - 0.5) * (P.W - 0.2); if (this.sim.freeSpot(x, z, this.rules.inHand === 'kitchen' ? 'kitchen' : null)) { c.x = x; c.z = z; return; } } }
    /** point the cue at one of the balls I may hit (a sensible start for aiming) */
    faceSomething() {
      const t = this.rules.targets(0, this.sim), c = this.sim.cue; let best = null;
      for (const n of t) { const b = this.sim.balls[n], d = Math.hypot(b.x - c.x, b.z - c.z); if (!best || d < best.d) best = { d, b }; }
      if (best && this.rules.isBreak) best = { b: this.sim.balls.filter(b => b.on && b.n).reduce((a, b) => (b.x < a.x ? b : a)) };
      if (best) this.aim = Math.atan2(best.b.z - c.z, best.b.x - c.x);
    }
    moveGhost(x, z) {
      const r = this.rules, c = this.sim.cue, region = r.inHand === 'kitchen' ? 'kitchen' : null;
      const xm = P.HL - P.R - 0.003, zm = P.HW - P.R - 0.003;
      x = Math.max(-xm, Math.min(region ? P.HEAD.x : xm, x)); z = Math.max(-zm, Math.min(zm, z));
      this.ghostOk = this.sim.freeSpot(x, z, region);
      this.ghostAt = { x, z };
      if (this.ghostOk) { c.x = x; c.z = z; c.on = true; }
      this.ghost.position.set(x, Y + P.R, z);
      this.ghost.material.color.setHex(this.ghostOk ? 0xffffff : 0xff5a4a);
    }
    confirmPlace() {
      if (this.phase !== 'place' || !this.ghostOk) { if (this.phase === 'place') VR.Audio.play('buzz'); return; }
      const c = this.sim.cue; c.x = this.ghostAt.x; c.z = this.ghostAt.z; c.on = true; c.vx = c.vz = 0;
      this.rules.inHand = this.rules.isBreak ? 'kitchen' : null;     // (the break keeps it until the shot — harmless)
      VR.Audio.play('thud');
      this.phase = 'aim'; this.hint(tr('bl.aimHint')); this.faceSomething();
    }
    /** the speed for a power (0..1) — a full hit is a break */
    speedOf(p) { return 0.3 + Math.pow(p, 1.15) * 6.5; }
    playerShoot(angle = this.aim, power = this.power) {
      if (!this.canShoot()) return false;
      this.aim = angle; this.setPower(power);
      const speed = this.speedOf(power), c = this.sim.cue;
      if (this.net) this.net.send({ k: 'ps', a: +angle.toFixed(5), s: +speed.toFixed(4), cx: +c.x.toFixed(5), cz: +c.z.toFixed(5) });
      this.strikeNow(0, angle, speed);
      return true;
    }
    /** both players: the cue goes forward, then the cue ball rolls */
    strikeNow(side, angle, speed) {
      this.rules.inHand = null;
      this.shotPlan = { side, angle, speed };
      this.phase = 'strike'; this.strikeT = 0; this.strikeFrom = Math.max(0.05, this.pull);
      this.hint('');
    }
    launch() {
      const sp = this.shotPlan;
      this.rules.beginShot(this.sim);
      this.sim.strike(sp.angle, sp.speed);
      this.shots[sp.side]++;
      VR.Audio.play('poolCue');
      this.phase = 'roll'; this.rollT = 0;
    }
    /** the balls stopped: the rules decide what happens next */
    judge() {
      if (this.net && !this.net.host) { this.phase = 'judgeWait'; if (this.pj) this.applyJudge(); return; }   // the referee decides
      const out = this.rules.endShot(this.sim);
      if (this.net) {
        const o = Object.assign({}, out); delete o.potted;
        const st = this.snap();
        st.b.forEach(([x, z], n) => { const b = this.sim.balls[n]; b.x = x; b.z = z; });   // both tables exactly the same from here
        this.net.send({ k: 'pj', out: o, st });
      }
      this.showJudge(out);
    }
    showJudge(out) {
      const me = out.over ? null : this.rules.turn;
      const was = this.shotPlan ? this.shotPlan.side : 0;
      this.paintHud();
      if (out.over) return this.end(out.over);
      const msgs = [];
      if (out.respot8) { msgs.push(tr('bl.respot')); this.ballM[8].visible = true; this.ballM[8].scale.setScalar(1); this.drops = this.drops.filter(d => d.n !== 8); }
      if (out.foul) msgs.push(tr('bl.f.' + out.foul) + ' — ' + tr(was === 0 ? 'bl.inHandOpp' : 'bl.inHandMe'));
      else if (out.assigned) msgs.push(tr('bl.youAre', { g: tr('bl.' + this.rules.groups[0]) }));
      else if (out.msg === 'oppBall') msgs.push(tr('bl.oppBall'));
      if (msgs.length) this.mgr.banner(msgs.join(' · '), out.foul ? 'bad' : 'info', 2.6);
      else this.mgr.banner(tr(me === 0 ? 'bl.yourTurn' : 'bl.oppTurn'), me === 0 ? 'good' : '', 1.2);
      if (out.foul) VR.Audio.play('buzz');
      this.phase = 'wait'; this.waitT = msgs.length ? 1.1 : 0.5;
    }
    end(over) {
      this.phase = 'over';
      const meWin = over.winner === 0;
      const reason = over.reason === 'left' ? 'bl.r.left' : meWin ? (over.reason === 'won8' ? 'bl.r.won8' : over.reason === 'eightEarly' ? 'bl.r.oppEarly' : 'bl.r.oppFoul')
        : (over.reason === 'won8' ? 'bl.r.lostWon8' : over.reason === 'eightEarly' ? 'bl.r.eightEarly' : 'bl.r.eightFoul');
      const lines = [tr(reason), tr('bl.left', { a: this.rules.left(0, this.sim), b: this.rules.left(1, this.sim) }), tr('bl.shots', { n: this.shots[0] })];
      this.overT = 1.0; this.overOut = meWin ? 'win' : 'lose'; this.overLines = lines;
      this.mgr.banner(tr(reason), meWin ? 'good' : 'bad', 2);
    }

    // ------------------------------------------------------------ the opponent
    aiTurn() {
      this.phase = 'ai'; this.aiStep = 'think'; this.aiT = 0;
      this.planner = new P.Planner(this.sim, this.rules, 1, this.level || 'normal');
      this.hint(tr('bl.thinking'));
    }
    updateAi(dt) {
      this.aiT += dt;
      const pl = this.planner;
      if (this.aiStep === 'think') {
        if (pl.step(6) && this.aiT > 0.7) {
          this.plan = pl.final(); this.aiStep = this.plan.place ? 'place' : 'aim'; this.aiT = 0;
          this.aimFrom = this.aim;
          if (this.plan.place) this.placeFrom = { x: this.sim.cue.on ? this.sim.cue.x : P.HEAD.x, z: this.sim.cue.on ? this.sim.cue.z : 0 };
        }
      } else if (this.aiStep === 'place') {
        const k = Math.min(1, this.aiT / 0.7), e = k * k * (3 - 2 * k), c = this.sim.cue;
        c.on = true; c.x = this.placeFrom.x + (this.plan.place.x - this.placeFrom.x) * e; c.z = this.placeFrom.z + (this.plan.place.z - this.placeFrom.z) * e;
        if (k >= 1) { c.x = this.plan.place.x; c.z = this.plan.place.z; VR.Audio.play('thud'); this.aiStep = 'aim'; this.aiT = 0; this.aimFrom = this.aim; }
      } else if (this.aiStep === 'aim') {
        // turn the cue to the chosen line (the short way round)
        let d = this.plan.angle - this.aimFrom; d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = Math.min(1, this.aiT / 0.9), e = k * k * (3 - 2 * k);
        this.aim = this.aimFrom + d * e;
        if (k >= 1) { this.aim = this.plan.angle; this.aiStep = 'pull'; this.aiT = 0; }
      } else if (this.aiStep === 'pull') {
        const want = Math.min(1, this.plan.speed / 6.8);
        this.setPower(want * Math.min(1, this.aiT / 0.6));
        if (this.aiT > 0.75) { this.aiStep = null; this.hint(''); this.strikeNow(1, this.plan.angle, this.plan.speed); }
      }
    }

    // ------------------------------------------------------------ frame
    update(dt, live) {
      this.live = live;
      if (live) {
        if (this.phase === 'aim' && this.rules.turn === 0) {
          const fine = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 0.15 : 1;
          if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.aim += dt * 0.9 * fine;
          if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.aim -= dt * 0.9 * fine;
          if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) this.setPower(this.power - dt * 0.6);
          if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) this.setPower(this.power + dt * 0.6);
        }
        if (this.net && (this.phase === 'aim' || this.phase === 'place') && this.rules.turn === 0) {
          this.stT -= dt;
          if (this.stT <= 0) { this.stT = 0.1; const c = this.sim.cue; this.net.send({ k: 'st', a: +this.aim.toFixed(4), p: +this.power.toFixed(3), ph: this.phase, cx: +c.x.toFixed(4), cz: +c.z.toFixed(4) }); }
        }
        if (this.phase === 'opp' && this.oppAim) {
          const o = this.oppAim, c = this.sim.cue;
          let d = o.a - this.aim; d = Math.atan2(Math.sin(d), Math.cos(d)); this.aim += d * Math.min(1, dt * 12);
          this.setPower(this.power + (o.p - this.power) * Math.min(1, dt * 12));
          if (o.ph === 'place' || this.rules.inHand) { c.x = o.cx; c.z = o.cz; c.on = true; }
        }
        if (this.phase === 'ai') this.updateAi(dt);
        else if (this.phase === 'strike') {
          this.strikeT += dt;
          if (this.strikeT >= 0.09) this.launch();
        } else if (this.phase === 'roll') {
          this.rollT += dt;
          const ev = this.sim.step(dt);
          this.onEvents(ev);
          if (!this.sim.moving() && this.rollT > 0.3 && this.drops.every(d => d.t > 0.3)) this.judge();
        } else if (this.phase === 'wait') {
          this.waitT -= dt; if (this.waitT <= 0) this.beginTurn();
        } else if (this.phase === 'over') {
          this.overT -= dt; if (this.overT <= 0) { this.phase = 'done'; this.mgr.finish(this.overOut, this.overLines); }
        }
      }
      const placing = this.phase === 'place';
      if (this.el.ok.hidden === placing) this.el.ok.hidden = !placing;
      this.syncBalls(dt);
      this.updateCue(dt);
      this.updateGuide();
      this.updateBodies(dt);
      this.place(this.cam, false, dt);
    }
    onEvents(ev) {
      let snd = 0;
      for (const e of ev) {
        this.rules.note(e);
        if (e.t === 'pocket') { this.drops.push({ n: e.n, t: 0, x: e.x, p: e.p }); VR.Audio.play('poolPocket'); }
        else if (snd < 3 && e.v > 0.25) { snd++; VR.Audio.play(e.t === 'ball' ? 'poolClack' : 'poolRail'); }
      }
      if (ev.some(e => e.t === 'pocket')) this.paintHud();
    }
    syncBalls(dt) {
      for (const b of this.sim.balls) {
        const m = this.ballM[b.n];
        const drop = this.drops.find(d => d.n === b.n);
        if (drop) {
          drop.t += dt;
          const P0 = P.POCKETS[drop.p], k = Math.min(1, drop.t / 0.3);
          m.position.set(P0.x, Y + P.R - k * 0.09, P0.z); m.scale.setScalar(1 - k * 0.3);
          m.visible = drop.t < 0.45 || b.n === 0 && b.on;
          continue;
        }
        if (!b.on) { m.visible = false; continue; }
        m.visible = !(b.n === 0 && this.phase === 'place');
        const nx = b.x, nz = b.z, dx = nx - m.position.x, dz = nz - m.position.z, d = Math.hypot(dx, dz);
        if (d > 1e-5 && d < 0.5 && m.position.y > 0) { this.v.set(dz, 0, -dx).normalize(); m.rotateOnWorldAxis(this.v, d / P.R); }
        m.position.set(nx, Y + P.R, nz); m.scale.setScalar(1);
      }
      // a cue ball that went in comes back for the next player
      if (this.sim.cue.on) { const dd = this.drops.findIndex(d => d.n === 0); if (dd >= 0 && this.phase !== 'roll') this.drops.splice(dd, 1); }
      this.ghost.visible = this.phase === 'place';
      this.zone.visible = this.phase === 'place' || (this.phase === 'ai' && this.aiStep === 'place');
      if (this.zone.visible) {
        if (this.rules.inHand === 'kitchen') { this.zone.scale.set(P.HEAD.x + P.HL, P.W, 1); this.zone.position.x = (P.HEAD.x - P.HL) / 2; }
        else { this.zone.scale.set(P.L, P.W, 1); this.zone.position.x = 0; }
      }
    }
    updateCue(dt) {
      const c = this.sim.cue, show = c.on && ['aim', 'strike', 'ai', 'place', 'opp'].includes(this.phase) && !(this.phase === 'ai' && this.aiStep === 'think') && this.phase !== 'place';
      this.cue.visible = show;
      if (!show) return;
      let pull = 0.02 + this.power * 0.28;
      if (this.phase === 'strike') pull = this.strikeFrom * (1 - Math.min(1, this.strikeT / 0.09)) - 0.005;
      this.pull = pull;
      const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
      const tipD = P.R + 0.006 + pull;
      this.cue.position.set(c.x - dx * tipD, Y + P.R + 0.004, c.z - dz * tipD);
      this.v.set(this.cue.position.x + dx, this.cue.position.y - 0.085, this.cue.position.z + dz);
      this.cue.lookAt(this.v);
    }
    updateGuide() {
      const show = this.phase === 'aim' && this.rules.turn === 0 && this.sim.cue.on;
      for (const o of [this.gLine, this.gObj, this.gCue, this.gGhost]) o.visible = show;
      if (!show) return;
      const c = this.sim.cue, fc = P.firstContact(this.sim, this.aim), y = Y + P.R * 0.6;
      const set = (ln, ax, az, bx, bz) => { const p = ln.geometry.attributes.position; p.setXYZ(0, ax, y, az); p.setXYZ(1, bx, y, bz); p.needsUpdate = true; ln.geometry.computeBoundingSphere(); };
      set(this.gLine, c.x, c.z, fc.x, fc.z);
      this.gGhost.position.set(fc.x, Y + 0.003, fc.z);
      if (fc.n >= 0) {
        const ob = this.sim.balls[fc.n];
        set(this.gObj, ob.x, ob.z, ob.x + fc.ox * 0.3, ob.z + fc.oz * 0.3);
        // the cue ball goes off along the tangent line
        const dx = Math.cos(this.aim), dz = Math.sin(this.aim), dn = dx * fc.ox + dz * fc.oz;
        let tx = dx - dn * fc.ox, tz = dz - dn * fc.oz; const tl = Math.hypot(tx, tz);
        if (tl > 0.05) { tx /= tl; tz /= tl; set(this.gCue, fc.x, fc.z, fc.x + tx * 0.16 * tl, fc.z + tz * 0.16 * tl); } else this.gCue.visible = false;
        const legal = this.rules.targets(0, this.sim).includes(fc.n);
        this.gGhost.material.color.setHex(legal ? 0xffffff : 0xff5a4a);
      } else { this.gObj.visible = false; this.gCue.visible = false; this.gGhost.visible = false; }
    }
    /** the players walk around the table: the shooter behind the cue ball, the other one waits */
    updateBodies(dt) {
      const c = this.sim.cue, shooting = ['aim', 'strike', 'ai', 'place', 'opp'].includes(this.phase) || this.phase === 'roll' && this.rollT < 0.6;
      const side = this.phase === 'roll' || this.phase === 'strike' ? (this.shotPlan ? this.shotPlan.side : this.rules.turn) : this.rules.turn;
      this.bodies.forEach((b, i) => {
        let wx = this.idle[i].x, wz = this.idle[i].z, yaw = Math.atan2(-(0 - wx), -(0 - wz));
        if (shooting && i === side && c.on && this.phase !== 'place') {
          const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
          let sx = c.x - dx * 0.8, sz = c.z - dz * 0.8;
          // stand outside the table
          const ex = P.HL + 0.33, ez = P.HW + 0.33;
          if (Math.abs(sx) < ex && Math.abs(sz) < ez) { if (ex - Math.abs(sx) < ez - Math.abs(sz)) sx = Math.sign(sx || 1) * ex; else sz = Math.sign(sz || 1) * ez; }
          wx = sx; wz = sz; yaw = Math.atan2(-(c.x - sx), -(c.z - sz));
        }
        const dx = wx - b.pos.x, dz = wz - b.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, 2.6 * dt);
        if (d > 0.01) { b.pos.x += dx / d * step; b.pos.z += dz / d * step; }
        const dy = Math.atan2(Math.sin(yaw - b.yaw), Math.cos(yaw - b.yaw)); b.yaw += dy * Math.min(1, dt * 8);
        b.pitch = 0.35;
        VR.DuelBody.animate(b, dt);
        // my own body would stand in the camera when I aim from behind the cue
        b.g.visible = !(i === 0 && this.view === 'aim' && this.rules.turn === 0 && ['aim', 'strike'].includes(this.phase));
      });
    }
    /** the camera: behind the cue while I aim (or above the table), watching the table otherwise */
    place(cam, snap, dt = 0) {
      const c = this.sim.cue, top = this.view === 'top', aspect = cam.aspect || 1;
      const pos = new T.Vector3(), look = new T.Vector3();
      const mine = this.rules.turn === 0 && (this.phase === 'aim' || this.phase === 'strike');
      const tan = Math.tan(T.MathUtils.degToRad(cam.fov / 2));
      if (top || this.phase === 'place') {
        const wide = aspect >= 1;
        const h = Math.max((wide ? P.HL + 0.3 : P.HW + 0.3) / (tan * aspect), (wide ? P.HW + 0.3 : P.HL + 0.3) / tan);
        pos.set(0, Y + h, 0.001); look.set(0, Y, 0);
        cam.up.set(wide ? 0 : -1, 0, wide ? -1 : 0);
      } else if (mine && c.on) {
        const dx = Math.cos(this.aim), dz = Math.sin(this.aim), el = 0.52;
        pos.set(c.x - dx * this.camDist * Math.cos(el), Y + P.R + this.camDist * Math.sin(el), c.z - dz * this.camDist * Math.cos(el));
        look.set(c.x + dx * 0.55, Y, c.z + dz * 0.55);
        cam.up.set(0, 1, 0);
      } else if (c.on && (this.phase === 'opp' || this.phase === 'ai' && (this.aiStep === 'aim' || this.aiStep === 'pull') || this.phase === 'strike' && this.shotPlan && this.shotPlan.side === 1)) {
        // the opponent lines up its shot: seen from across the table, facing it
        const dx = Math.cos(this.aim), dz = Math.sin(this.aim), far = aspect < 1 ? 1.5 : 1;
        pos.set(c.x + dx * 2.1 * far, Y + 1.35 * far, c.z + dz * 2.1 * far);
        look.set(c.x - dx * 0.35, Y + 0.25, c.z - dz * 0.35);
        cam.up.set(0, 1, 0);
      } else {
        const far = aspect < 1 ? 1.7 : 1;
        pos.set(0, Y + 1.95 * far, 2.25 * far); look.set(0, Y - 0.1, -0.05);
        cam.up.set(0, 1, 0);
      }
      const k = snap ? 1 : 1 - Math.exp(-dt * (mine ? 14 : 4));
      this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
      cam.position.copy(this.camPos); cam.lookAt(this.camLook);
      // the lamp hangs at 2.6 m: hidden when the camera looks down from above it
      const over = this.camPos.y > Y + 1.65; this.lamp.visible = this.glow.visible = !over;
    }

    // ------------------------------------------------------------ HUD
    hint(t) { this.el.hint.textContent = t; this.el.hint.hidden = !t; }
    paintHud() {
      const r = this.rules, sim = this.sim;
      const side = (el, i) => {
        const g = r.groups[i];
        el.querySelector('.bl-group').textContent = g ? tr('bl.' + g) : tr('bl.open');
        const balls = [];
        if (g) { for (let k = 1; k <= 15; k++) if (P.groupOf(k) === g) balls.push(`<i class="${sim.balls[k].on ? '' : 'in'} ${k > 8 ? 'st' : ''}" style="--c:${css(k)}"></i>`); if (r.left(i, sim) === 0) balls.push(`<i class="${sim.balls[8].on ? '' : 'in'}" style="--c:#141414"></i>`); }
        el.querySelector('.bl-balls').innerHTML = balls.join('');
        el.classList.toggle('turn', r.turn === i && !r.over);
      };
      side(this.el.me, 0); side(this.el.ai, 1);
      this.el.status.textContent = r.over ? '' : tr(r.turn === 0 ? 'bl.yourTurn' : 'bl.oppTurn');
      this.el.ok.hidden = this.phase !== 'place';
      // the wall panel
      this.boardM.userData.draw((cx, w, h) => {
        cx.fillStyle = '#0e111a'; cx.fillRect(0, 0, w, h); cx.strokeStyle = '#ffe14a'; cx.lineWidth = 6; cx.strokeRect(3, 3, w - 6, h - 6);
        cx.font = 'bold 30px monospace'; cx.textBaseline = 'middle';
        const row = (y, name, col, i) => {
          cx.fillStyle = col; cx.fillRect(20, y - 12, 24, 24);
          cx.fillStyle = '#f4f1e6'; cx.textAlign = 'left'; cx.fillText(name, 56, y);
          cx.textAlign = 'right'; cx.fillText(r.groups[i] ? (r.groups[i] === 'solid' ? '● ' : '◐ ') + r.left(i, sim) : '—', w - 24, y);
          if (r.turn === i && !r.over) { cx.fillStyle = '#ffe14a'; cx.fillText('▶', w - 120, y); }
        };
        row(50, 'YOU', '#ffe14a', 0); row(110, this.net ? this.oppName().slice(0, 9).toUpperCase() : 'BOT', '#9b6bff', 1);
      });
    }
    resize() {}
    dispose() {
      this.unbind();
      this.bodies.forEach(b => this.scene.remove(b.g));
    }
  }

  VR.MiniGames.register('billiards', Billiards);
  VR.Billiards = Billiards;
})();
