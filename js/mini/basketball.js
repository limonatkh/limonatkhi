/* =====================================================================
 * BASKETBALL WORLD — one-on-one against the computer (the BASKETBALL
 * portal in the square). The match, the ball physics, the shot model and
 * the computer player are js/mini/hoopsim.js; this file is the arena,
 * the controls, the camera and the screen.
 *
 * Controls (the game's own key bindings, Settings → Controls):
 *   move W A S D (or the touch stick) · sprint Shift
 *   SHOOT  hold the fire button (left click / the SHOOT button) and let go
 *          when the meter is in the GREEN — early = short, late = long/wild
 *   STEAL  E (interact) or right click / the STEAL button, close to the ball
 *   JUMP   Space / the JUMP button (block a shot, reach a rebound)
 *   camera the mouse (or drag on the right side of the screen)
 * You attack the YELLOW hoop (+x); the computer attacks the PURPLE one.
 * ===================================================================== */
(function () {
  const T = THREE, H = VR.Hoops, K = VR.MiniGames.Kit;
  const tr = (k, v) => VR.t(k, v);
  const ME = 0xffe14a, AI = 0x9b6bff;
  const isTouch = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  Object.assign(VR.I18N.STRINGS.en, {
    'bb.title': 'BASKETBALL — 1 ON 1', 'bb.goal': 'Score in the YELLOW hoop, stop the bot scoring in the purple one. Most points after 90 seconds wins.',
    'bb.kMove': 'W A S D · Shift', 'bb.kMoveW': 'Move · sprint', 'bb.kShoot': 'Hold left click, let go in the green', 'bb.kShootW': 'Shoot',
    'bb.kSteal': 'E · right click', 'bb.kStealW': 'Steal', 'bb.kJump': 'Space', 'bb.kJumpW': 'Jump / block', 'bb.kCam': 'Mouse', 'bb.kCamW': 'Camera',
    'bb.shoot': 'SHOOT', 'bb.steal': 'STEAL', 'bb.jump': 'JUMP', 'bb.opp': 'Lemon Bot', 'bb.attack': 'You attack the YELLOW hoop ▶',
    'bb.go': 'GO!', 'bb.two': '+2!', 'bb.three': '+3!', 'bb.oppTwo': 'Bot +2', 'bb.oppThree': 'Bot +3', 'bb.miss': 'Missed', 'bb.steal!': 'Steal!',
    'bb.stolen': 'Stolen!', 'bb.block': 'Blocked!', 'bb.blocked': 'Your shot was blocked', 'bb.reb': 'Rebound', 'bb.oppReb': 'Bot rebound', 'bb.buzzer': 'Buzzer!',
    'bb.perfect': 'Perfect release', 'bb.early': 'Too early', 'bb.late': 'Too late', 'bb.final': 'You {a} – {b} Bot', 'bb.stats': 'Made {m}/{s} · steals {st} · rebounds {r}',
    'bb.keys': 'WASD move · Shift sprint · hold LEFT CLICK to shoot · E steal · Space jump', 'bb.youBall': 'your ball', 'bb.botBall': 'bot\'s ball',
    'bb.stealNow': 'STEAL', 'bb.dunkNow': 'DUNK!', 'bb.dunkReady': 'DUNK unlocked! Get close to the hoop and shoot', 'bb.oppDunkReady': '{name} unlocked a dunk',
    'bb.dunk': 'DUNK! +2', 'bb.oppDunk': '{name} dunks! +2', 'bb.three3': '3-POINT ZONE', 'bb.streak': '{n} in a row', 'bb.dunks': 'DUNK ×{n}',
    'bb.kStealN': 'E when STEAL shows (in front of him)', 'bb.goal2': 'Beyond the arc = 3 points. Three baskets in a row unlock a DUNK.',
    'bb.left': 'Your opponent left — you win', 'bb.oppMade': '{name} +{n}',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'bb.title': 'كرة السلة — واحد ضد واحد', 'bb.goal': 'سجّل في السلة الصفراء وامنع الروبوت من التسجيل في البنفسجية. صاحب النقاط الأكثر بعد 90 ثانية يفوز.',
    'bb.kMove': 'W A S D · Shift', 'bb.kMoveW': 'الحركة · الركض', 'bb.kShoot': 'اضغط مطوّلًا بالزر الأيسر واترك في الأخضر', 'bb.kShootW': 'التسديد',
    'bb.kSteal': 'E · الزر الأيمن', 'bb.kStealW': 'خطف الكرة', 'bb.kJump': 'مسافة', 'bb.kJumpW': 'قفز / صدّ', 'bb.kCam': 'الفأرة', 'bb.kCamW': 'الكاميرا',
    'bb.shoot': 'سدّد', 'bb.steal': 'اخطف', 'bb.jump': 'اقفز', 'bb.opp': 'روبوت الليمون', 'bb.attack': 'أنت تهاجم السلة الصفراء ◀',
    'bb.go': 'انطلق!', 'bb.two': '+2!', 'bb.three': '+3!', 'bb.oppTwo': 'الروبوت +2', 'bb.oppThree': 'الروبوت +3', 'bb.miss': 'أخطأت', 'bb.steal!': 'خطفتها!',
    'bb.stolen': 'خُطفت منك!', 'bb.block': 'صددتها!', 'bb.blocked': 'صُدّت تسديدتك', 'bb.reb': 'متابعة', 'bb.oppReb': 'متابعة للروبوت', 'bb.buzzer': 'انتهى الوقت!',
    'bb.perfect': 'تسديدة مثالية', 'bb.early': 'مبكرًا جدًا', 'bb.late': 'متأخرًا جدًا', 'bb.final': 'أنت {a} – {b} الروبوت', 'bb.stats': 'سجّلت {m}/{s} · خطف {st} · متابعات {r}',
    'bb.keys': 'WASD حركة · Shift ركض · اضغط مطوّلًا بالأيسر للتسديد · E خطف · مسافة قفز', 'bb.youBall': 'الكرة معك', 'bb.botBall': 'الكرة مع الروبوت',
    'bb.stealNow': 'اخطف', 'bb.dunkNow': 'دنك!', 'bb.dunkReady': 'فُتح الدنك! اقترب من السلة وسدّد', 'bb.oppDunkReady': '{name} فتح دنك',
    'bb.dunk': 'دنك! +2', 'bb.oppDunk': '{name} دنك! +2', 'bb.three3': 'منطقة الثلاث نقاط', 'bb.streak': '{n} متتالية', 'bb.dunks': 'دنك ×{n}',
    'bb.kStealN': 'E لما يظهر «اخطف» (وأنت قدّامه)', 'bb.goal2': 'من وراء القوس = 3 نقاط. ثلاث سلات متتالية تفتح الدنك.',
    'bb.left': 'خصمك غادر — فزت', 'bb.oppMade': '{name} +{n}',
  });
  VR.Audio.define('hoopBounce', ({ tone, noise }) => { tone(95, 0.09, 'sine', 0.2, 60); noise(0.03, 0.06, 500); });
  VR.Audio.define('hoopRim', ({ tone }) => { tone(880, 0.12, 'triangle', 0.1, 700); tone(1320, 0.08, 'sine', 0.05, 1100); });
  VR.Audio.define('hoopBoard', ({ tone, noise }) => { tone(140, 0.08, 'square', 0.1, 90); noise(0.05, 0.12, 900); });
  VR.Audio.define('swish', ({ noise }) => { noise(0.22, 0.16, 3200); });
  VR.Audio.define('whistle', ({ tone }) => { tone(2100, 0.35, 'sine', 0.12, 2300); });
  VR.Audio.define('hoopBuzzer', ({ tone }) => { tone(160, 0.8, 'square', 0.14, 150); tone(240, 0.8, 'square', 0.06, 230); });

  function ballTexture() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32; const c = cv.getContext('2d');
    c.fillStyle = '#e0702a'; c.fillRect(0, 0, 64, 32);
    c.fillStyle = '#2a1408'; c.fillRect(0, 15, 64, 2); for (const x of [0, 16, 32, 48]) c.fillRect(x, 0, 2, 32);
    for (let y = 0; y < 32; y += 4) for (let x = (y / 4) % 2 * 2; x < 64; x += 4) { c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(x, y, 2, 2); }
    const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.colorSpace = T.SRGBColorSpace; return t;
  }

  class Basketball {
    constructor(mgr) {
      this.mgr = mgr; this.scene = mgr.scene; this.cam = mgr.camera; this.game = mgr.game;
      this.m = new H.HoopMatch({ time: 90 }); this.brain = null;
      this.camYaw = -Math.PI / 2; this.camPitch = 0; this.v = new T.Vector3();
      this.camPos = new T.Vector3(-9, 4, 0); this.camLook = new T.Vector3(0, 1, 0);
      this.buildArena(); this.buildHoops(); this.buildBall(); this.buildBodies(); this.buildHud();
      this.place(true, 0);
    }
    intro() {
      return { title: tr('bb.title'), goal: tr('bb.goal') + ' ' + tr('bb.goal2'),
        controls: [[tr('bb.kMove'), tr('bb.kMoveW')], [tr('bb.kShoot'), tr('bb.kShootW')], [tr('bb.kStealN'), tr('bb.kStealW')], [tr('bb.kJump'), tr('bb.kJumpW')], [tr('bb.kCam'), tr('bb.kCamW')]] };
    }

    // ------------------------------------------------------------ the arena
    buildArena() {
      const s = this.scene, CL = H.CL, CW = H.CW, HCL = H.HCL, HCW = H.HCW;
      K.lights(s, 0x1a2234, 1.35, 1.2);
      s.fog = new T.Fog(0x1a2234, 30, 70);
      const vox = [];
      // the court: planks, and the darker floor around it
      vox.push([0, -0.12, 0, CL + 14, 0.1, CW + 16, 0x3b3f4c]);
      for (let i = 0; i < 18; i++) vox.push([0, -0.06, -HCW - 0.6 + i * (CW + 1.2) / 18 + (CW + 1.2) / 36, CL + 1.2, 0.06, (CW + 1.2) / 18 - 0.01, i % 2 ? 0xd09a5c : 0xc89052]);
      // stands on both long sides, with fans
      for (const sz of [-1, 1]) for (let r = 0; r < 4; r++) {
        const z = sz * (H.AZ + 0.9 + r * 0.9);
        vox.push([0, 0, z, CL + 6, 0.45 + r * 0.45, 0.9, r % 2 ? 0x2f3a55 : 0x37446a]);
        for (let i = 0; i < 22; i++) {
          if ((i * 7 + r * 3) % 5 === 0) continue;
          const x = -HCL - 1 + i * (CL + 2) / 21, col = [0xffe14a, 0x9b6bff, 0xe5433a, 0x5fae3a, 0xf4f1e6][(i + r) % 5];
          vox.push([x, 0.45 + r * 0.45, z, 0.32, 0.42, 0.3, col], [x, 0.87 + r * 0.45, z, 0.24, 0.24, 0.24, 0xe8c39e]);
        }
      }
      // end walls
      for (const sx of [-1, 1]) vox.push([sx * (H.AX + 0.6), 0, 0, 0.3, 4, CW + 12, 0x26304a]);
      s.add(K.voxels(vox));
      // lines
      const white = K.basic(0xf4f1e6), y = 0.003;
      const line = (w, d, x, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), white); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); s.add(m); };
      line(CL, 0.08, 0, -HCW); line(CL, 0.08, 0, HCW); line(0.08, CW, -HCL, 0); line(0.08, CW, HCL, 0); line(0.08, CW, 0, 0);
      const ring = (r, x, start, len, mat = white) => { const m = new T.Mesh(new T.RingGeometry(r - 0.05, r + 0.05, 48, 1, start, len), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.001, 0); s.add(m); };
      ring(1.8, 0, 0, Math.PI * 2);
      for (const sx of [-1, 1]) {
        const hx = sx * H.HOOP_X;
        ring(H.THREE_R, hx, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI);
        for (const sz of [-1, 1]) line(HCL - H.HOOP_X, 0.08, sx * (H.HOOP_X + HCL) / 2, sz * H.THREE_R);
        // the paint: coloured by the team that attacks this hoop (yellow = yours)
        const paint = new T.Mesh(new T.PlaneGeometry(5.8, 4.9), K.basic(sx > 0 ? 0xd9b21a : 0x6b4fc0, { transparent: true, opacity: 0.55 }));
        paint.rotation.x = -Math.PI / 2; paint.position.set(sx * (HCL - 2.9), y, 0); s.add(paint);
        line(0.08, 4.9, sx * (HCL - 5.8), 0);
        ring(1.8, sx * (HCL - 5.8), sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI);
      }
      // the centre logo: a lemon
      const logo = new T.Mesh(new T.CircleGeometry(1.0, 20), K.basic(0xffe14a)); logo.rotation.x = -Math.PI / 2; logo.position.set(0, y, 0); s.add(logo);
      // the scoreboard over the centre (four faces)
      this.board = K.board(3.2, 1.6, 320, 160);
      const cube = new T.Group(); cube.position.set(0, 7.2, 0); s.add(cube);
      for (let i = 0; i < 4; i++) { const f = i ? this.board.clone() : this.board; f.position.set(Math.sin(i * Math.PI / 2) * 1.6, 0, Math.cos(i * Math.PI / 2) * 1.6); f.rotation.y = i * Math.PI / 2; cube.add(f); }
      cube.add(K.voxels([[0, 0.8, 0, 3.3, 0.15, 3.3, 0x111111], [0, -0.95, 0, 3.3, 0.15, 3.3, 0x111111], [0, 0.95, 0, 0.1, 3, 0.1, 0x222222]]));
      const sun = new T.PointLight(0xfff2d6, 30, 40, 1.4); sun.position.set(0, 9, 0); s.add(sun);
    }
    buildHoops() {
      const s = this.scene;
      this.nets = [];
      for (const sx of [-1, 1]) {
        const hx = sx * H.HOOP_X, bx = sx * H.BOARD_X, col = sx > 0 ? ME : AI;
        const vox = [
          [sx * (H.HCL + 0.9), 0, 0, 0.3, 3.95, 0.3, 0x3a4256],                          // pole
          [(bx + sx * (H.HCL + 0.9)) / 2, 3.35, 0, Math.abs(sx * (H.HCL + 0.9) - bx), 0.16, 0.16, 0x3a4256],   // arm
          [bx + sx * 0.02, H.BOARD_Y0, 0, H.BOARD_T, H.BOARD_Y1 - H.BOARD_Y0, H.BOARD_HZ * 2, 0xf4f8ff],       // board
          [bx - sx * 0.005, H.BOARD_Y1 - 0.1, 0, 0.03, 0.1, H.BOARD_HZ * 2, col],                             // a stripe in the team colour
          [bx - sx * 0.01, 3.1, 0, 0.02, 0.05, 0.6, 0xe5433a], [bx - sx * 0.01, 3.5, 0, 0.02, 0.05, 0.6, 0xe5433a],
          [bx - sx * 0.01, 3.1, -0.28, 0.02, 0.45, 0.05, 0xe5433a], [bx - sx * 0.01, 3.1, 0.28, 0.02, 0.45, 0.05, 0xe5433a],
          [(hx + bx) / 2 + sx * 0.0, H.RIM_Y - 0.02, 0, Math.abs(bx - hx) - H.RIM_R, 0.04, 0.08, 0xff7a1a],     // rim bracket
        ];
        s.add(K.voxels(vox));
        const rim = new T.Mesh(new T.TorusGeometry(H.RIM_R, 0.02, 6, 20), K.mat(0xff7a1a)); rim.rotation.x = Math.PI / 2; rim.position.set(hx, H.RIM_Y, 0); s.add(rim);
        const net = new T.Mesh(new T.CylinderGeometry(H.RIM_R, H.RIM_R * 0.62, 0.42, 12, 3, true), K.basic(0xffffff, { wireframe: true, transparent: true, opacity: 0.8 }));
        net.position.set(hx, H.RIM_Y - 0.21, 0); s.add(net); this.nets.push({ net, sx, k: 0 });
        // the target marker over the hoop you attack
        const sign = VR.WorldText.make({ text: sx > 0 ? '▼ YOU' : '▼ BOT', style: 'sign', size: 0.4, width: 2.4 });
        sign.position.set(bx - sx * 0.1, 4.7, 0); sign.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; s.add(sign);
        const glow = new T.PointLight(col, 4, 6, 2); glow.position.set(hx - sx * 0.5, 4.2, 0); s.add(glow);
      }
    }
    buildBall() {
      this.ballM = new T.Mesh(new T.SphereGeometry(H.BALL_R, 12, 8), K.mat(0xffffff, { map: ballTexture() }));
      this.scene.add(this.ballM);
      this.shadow = new T.Mesh(new T.CircleGeometry(H.BALL_R * 1.1, 10), K.basic(0x000000, { transparent: true, opacity: 0.35, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
      this.lastBall = new T.Vector3();
    }
    buildBodies() {
      const mine = VR.CHARACTERS[this.game.charIndex] || VR.CHARACTERS[0];
      const other = VR.CHARACTERS.find(c => c.id !== mine.id) || mine;
      this.bodies = [K.body(mine.id, 'white', ME), K.body(other.id, other.id === mine.id ? 'grey' : 'white', AI)];
      this.bodies.forEach(b => this.scene.add(b.g));
      this.syncBodies(0);
    }
    buildHud() {
      const hud = this.mgr.el.hud, touch = this.mgr.el.touch;
      hud.innerHTML = `<div class="bb-top">
          <div class="bb-team bb-me"><b class="bb-n"></b><span class="bb-pos">●</span><b class="bb-s">0</b></div>
          <div class="bb-clock">1:30</div>
          <div class="bb-team bb-ai"><b class="bb-s">0</b><span class="bb-pos">●</span><b class="bb-n"></b></div>
        </div>
        <div class="bb-attack">${tr('bb.attack')}</div>
        <div class="bb-meter" hidden><i class="bb-sweet"></i><i class="bb-fill"></i></div>
        <div class="bb-chips"><span class="bb-chip bb-c3" hidden></span><span class="bb-chip bb-cs" hidden></span><span class="bb-chip bb-cd" hidden></span></div>
        <div class="bb-prompt" hidden><kbd></kbd><b></b></div>
        <div class="bb-keys">${tr('bb.keys')}</div>`;
      touch.innerHTML = isTouch() ? `<div class="mi-stick bb-stick"><div class="mi-knob"></div></div><div class="bb-look"></div>
        <div class="bb-tbtns"><button class="mi-tbtn bb-tshoot" type="button">${tr('bb.shoot')}</button><button class="mi-tbtn" data-a="steal" type="button">${tr('bb.steal')}</button><button class="mi-tbtn" data-a="jump" type="button">${tr('bb.jump')}</button></div>` : '';
      const q = (sel) => this.mgr.root.querySelector(sel);
      this.el = { me: q('.bb-me'), ai: q('.bb-ai'), clock: q('.bb-clock'), meter: q('.bb-meter'), fill: q('.bb-fill'), sweet: q('.bb-sweet'),
        c3: q('.bb-c3'), cs: q('.bb-cs'), cd: q('.bb-cd'), prompt: q('.bb-prompt') };
      this.el.c3.textContent = tr('bb.three3');
      this.el.me.querySelector('.bb-n').textContent = (VR.Profiles.player().name || tr('mg.you')).slice(0, 12);
      this.el.ai.querySelector('.bb-n').textContent = tr('bb.opp');
      // the green part of the meter
      const top = 1.3, sw0 = (H.SWEET - H.SWEET_W) / top, sw1 = (H.SWEET + H.SWEET_W) / top;
      this.el.sweet.style.bottom = (sw0 * 100) + '%'; this.el.sweet.style.height = ((sw1 - sw0) * 100) + '%';
      if (isTouch()) this.bindTouch();
      this.paintHud(true);
    }
    bindTouch() {
      const root = this.mgr.root, stick = root.querySelector('.bb-stick'), knob = stick.querySelector('.mi-knob'), look = root.querySelector('.bb-look');
      let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0; const R = 46;
      stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; stick.setPointerCapture(e.pointerId); stick.classList.add('on'); });
      stick.addEventListener('pointermove', (e) => {
        if (e.pointerId !== sid) return;
        let dx = e.clientX - sx, dy = e.clientY - sy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`; VR.Input.setTouchMove(dx / R, -dy / R);
      });
      const end = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; stick.classList.remove('on'); VR.Input.setTouchMove(0, 0); };
      stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
      look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(e.pointerId); });
      look.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; VR.Input.addLook((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2); lx = e.clientX; ly = e.clientY; });
      look.addEventListener('pointerup', (e) => { if (e.pointerId === lid) lid = null; });
      const shoot = root.querySelector('.bb-tshoot');
      shoot.addEventListener('pointerdown', (e) => { e.preventDefault(); VR.Input.hold('fire', true); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) shoot.addEventListener(ev, () => VR.Input.hold('fire', false));
      root.querySelectorAll('.bb-tbtns [data-a]').forEach(b => b.addEventListener('pointerdown', (e) => { e.preventDefault(); VR.Input.press(b.dataset.a === 'steal' ? 'interact' : 'jump'); }));
    }

    // ------------------------------------------------------------ the match
    start(level) {
      this.level = level; this.finished = false; this.endT = 0;
      this.m = new H.HoopMatch({ time: 90 });
      this.brain = new H.Brain(this.m, 1, level);
      this.camYaw = -Math.PI / 2; this.camPitch = 0;
      this.mgr.banner('3', 'big', 1);
      VR.Audio.play('whistle');
      this.paintHud(true);
    }
    /**
     * Against a friend online (js/mini/mininet.js). The inviter's game runs the match (it is the
     * HoopMatch); the guest sends what it does (its moves, where it is, steal / jump presses) and
     * gets the match 20 times a second plus every event. Each screen shows itself as team 0
     * attacking the yellow hoop: the guest's picture is the host's turned round (x, z → −x, −z).
     */
    startOnline(net) {
      this.net = net; this.level = 'online'; this.finished = false; this.endT = 0;
      this.m = new H.HoopMatch({ time: 90 }); this.brain = null;
      this.camYaw = -Math.PI / 2; this.camPitch = 0;
      this.cnt = { stl: 0, jmp: 0 }; this.seen = { stl: 0, jmp: 0 }; this.remote = null; this.snapT = 0; this.sendT = 0;
      this.el.ai.querySelector('.bb-n').textContent = net.oppName.slice(0, 12);
      net.listen((d) => this.onNet(d));
      this.mgr.banner('3', 'big', 1);
      VR.Audio.play('whistle');
      this.paintHud(true);
    }
    onNet(d) {
      const m = this.m, host = this.net.host;
      if (d.k === 'bye') { if (!m.over) { m.phase = 'over'; m.result = 'win'; this.leftWin = true; this.finished = true; this.endT = 0.6; this.mgr.banner(tr('bb.left'), 'good', 2); } return; }
      if (host && d.k === 'st') this.remote = d;
      else if (!host && d.k === 'bs') this.applySnap(d.s);
      else if (!host && d.k === 'be') this.onEvents(d.ev.map(e => (e.team === 0 || e.team === 1 ? Object.assign({}, e, { team: 1 - e.team }) : e)));
    }
    /** host: the guest's wishes this frame (its directions turned round to mine; presses = counters) */
    remoteIntent() {
      const r = this.remote; if (!r) return {};
      const it = { mx: -(r.mx || 0), mz: -(r.mz || 0), sprint: !!r.sp, shoot: !!r.sh, steal: r.stl > this.seen.stl, jump: r.jmp > this.seen.jmp };
      this.seen.stl = Math.max(this.seen.stl, r.stl || 0); this.seen.jmp = Math.max(this.seen.jmp, r.jmp || 0);
      const p = this.m.players[1];
      // where the guest says it is (it moves itself at once on its screen)
      if (this.m.phase === 'play' && !p.dunk && typeof r.x === 'number') { p.x = -r.x; p.z = -r.z; p.vx = -r.vx; p.vz = -r.vz; }
      return it;
    }
    /** host → guest: the whole match, small */
    snapshot() {
      const m = this.m, f = (v) => Math.round(v * 1000) / 1000;
      return { p: m.players.map(p => [f(p.x), f(p.z), f(p.y), f(p.vx), f(p.vz), f(p.yaw), p.charge === null ? -1 : f(p.charge), f(p.stun), p.dunk ? 1 : 0, p.streak, p.dunks, f(p.safeT), f(p.stealCD), f(p.vy)]),
        b: [f(m.ball.x), f(m.ball.y), f(m.ball.z), f(m.ball.vx), f(m.ball.vy), f(m.ball.vz), m.ball.holder, f(m.ball.phase)],
        sc: m.score.slice(), t: f(m.time), ph: m.phase, c: f(m.count), st: m.stats };
    }
    /** guest: the host's match, turned round; my own position stays mine unless it is far off */
    applySnap(s) {
      const m = this.m, flipP = (a, p, mine) => {
        const x = -a[0], z = -a[1];
        if (!mine || a[8] || m.phase !== 'play' || s.ph !== 'play' || Math.hypot(x - p.x, z - p.z) > 2.2) { p.x = x; p.z = z; p.vx = -a[3]; p.vz = -a[4]; p.yaw = a[5] + Math.PI; }
        p.y = a[2]; p.vy = a[13] || 0; p.charge = a[6] < 0 ? null : a[6]; p.stun = a[7]; p.dunk = a[8] ? (p.dunk || { t: 0 }) : null;
        p.streak = a[9]; p.dunks = a[10]; p.safeT = a[11]; p.stealCD = a[12];
      };
      flipP(s.p[1], m.players[0], true); flipP(s.p[0], m.players[1], false);
      const B = m.ball, b = s.b;
      B.holder = b[6] < 0 ? -1 : 1 - b[6];
      if (B.holder !== 0) { B.x = -b[0]; B.y = b[1]; B.z = -b[2]; B.vx = -b[3]; B.vy = b[4]; B.vz = -b[5]; }
      B.phase = b[7];
      m.score = [s.sc[1], s.sc[0]]; m.time = s.t; m.count = s.c;
      if (s.st) m.stats = { shots: [s.st.shots[1], s.st.shots[0]], made: [s.st.made[1], s.st.made[0]], steals: [s.st.steals[1], s.st.steals[0]], blocks: [s.st.blocks[1], s.st.blocks[0]], rebounds: [s.st.rebounds[1], s.st.rebounds[0]] };
      if (s.ph === 'over' && m.phase !== 'over') { m.phase = 'over'; m.result = m.score[0] > m.score[1] ? 'win' : m.score[0] < m.score[1] ? 'lose' : 'draw'; }
      else if (m.phase !== 'over') m.phase = s.ph;
      this.snapSeen = true;
    }
    /** online frame (host or guest) */
    updateOnline(dt) {
      const m = this.m, net = this.net, look = VR.Input.takeLook();
      this.camYaw -= look.x * 0.0026; this.camPitch = Math.max(-0.35, Math.min(0.5, this.camPitch + look.y * 0.0018));
      const it = this.myIntent();
      if (net.host) {
        const ev = m.over ? [] : m.step(dt, [it, this.remoteIntent()]);
        this.onEvents(ev);
        const keep = ev.filter(e => !['bounce', 'load', 'jump'].includes(e.t));
        if (keep.length) net.send({ k: 'be', ev: keep });
        this.snapT -= dt;
        if (this.snapT <= 0 || m.over) { this.snapT = 0.05; net.send({ k: 'bs', s: this.snapshot() }); }
      } else {
        // my own player moves at once here; the host is told where I am
        if (it.steal) this.cnt.stl++;
        if (it.jump) this.cnt.jmp++;
        const p = m.players[0];
        if (m.phase === 'play' && !p.dunk) m.movePlayer(p, { mx: it.mx, mz: it.mz, sprint: it.sprint }, dt, false);
        if (m.ball.holder === 0) m.syncHeld(dt);
        else if (m.ball.holder < 0 && this.snapSeen) { m.ball.x += m.ball.vx * dt; m.ball.z += m.ball.vz * dt; }
        this.sendT -= dt;
        if (this.sendT <= 0 || it.steal || it.jump) {
          this.sendT = 1 / 30;
          const f = (v) => Math.round(v * 1000) / 1000;
          net.send({ k: 'st', mx: f(it.mx), mz: f(it.mz), sp: it.sprint ? 1 : 0, sh: it.shoot ? 1 : 0, stl: this.cnt.stl, jmp: this.cnt.jmp, x: f(p.x), z: f(p.z), vx: f(p.vx), vz: f(p.vz), yaw: f(p.yaw) });
        }
      }
      if (m.over && !this.finished) { this.finished = true; this.endT = 1.2; }
    }
    pause(on) {
      this.live = !on;
      if (!on) { VR.Input.setMode('fp'); VR.Input.setFPEnabled(true); VR.Input.requestLock(); }
      else VR.Input.hold('fire', false);
    }
    /** what I want to do this frame (keys / mouse / touch → world directions) */
    myIntent() {
      const I = VR.Input, mv = I.moveVector(), it = { mx: 0, mz: 0, sprint: I.sprintHeld(), shoot: I.fireHeld(), steal: false, jump: false };
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw), rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
      it.mx = fx * mv.y + rx * mv.x; it.mz = fz * mv.y + rz * mv.x;
      let a;
      while ((a = I.nextAction())) { if (a === 'interact') it.steal = true; else if (a === 'jump') it.jump = true; }
      const aim = I.aimHeld(); if (aim && !this.aimWas) it.steal = true; this.aimWas = aim;
      if (this.forced) { Object.assign(it, this.forced); this.forced = null; }        // (tests)
      return it;
    }
    update(dt, live) {
      this.live = live;
      const m = this.m;
      if (this.net) { if (live) this.updateOnline(dt); }
      else if (live && !m.over) {
        const look = VR.Input.takeLook();
        this.camYaw -= look.x * 0.0026; this.camPitch = Math.max(-0.35, Math.min(0.5, this.camPitch + look.y * 0.0018));
        const intents = [this.myIntent(), this.brain ? this.brain.think(dt) : {}];
        const ev = m.step(dt, intents);
        this.onEvents(ev);
        if (m.over && !this.finished) { this.finished = true; this.endT = 1.2; }
      }
      if (this.finished && live) { this.endT -= dt; if (this.endT <= 0 && this.mgr.state === 'play') this.finishMatch(); }
      this.syncBall(dt); this.syncBodies(dt); this.syncNets(dt);
      this.paintHud(false);
      this.place(false, dt);
    }
    finishMatch() {
      const m = this.m, st = m.stats;
      const final = this.net ? `${tr('mg.you')} ${m.score[0]} – ${m.score[1]} ${this.net.oppName}` : tr('bb.final', { a: m.score[0], b: m.score[1] });
      this.mgr.finish(m.result, (this.leftWin ? [tr('bb.left')] : []).concat([final, tr('bb.stats', { m: st.made[0], s: st.shots[0], st: st.steals[0], r: st.rebounds[0] })]));
    }
    onEvents(ev) {
      const B = (t, cls, s) => this.mgr.banner(t, cls, s);
      for (const e of ev) {
        switch (e.t) {
          case 'count': B(String(e.n), 'big', 0.9); VR.Audio.play('tick'); break;
          case 'go': B(tr('bb.go'), 'big good', 0.9); VR.Audio.play('whistle'); break;
          case 'dunkReady': B(e.team === 0 ? tr('bb.dunkReady') : tr('bb.oppDunkReady', { name: this.oppName() }), e.team === 0 ? 'good' : '', 2.2); VR.Audio.play(e.team === 0 ? 'gem' : 'tick'); break;
          case 'dunkGo': VR.Audio.play('jump'); break;
          case 'score': if (e.dunk) { B(e.team === 0 ? tr('bb.dunk') : tr('bb.oppDunk', { name: this.oppName() }), e.team === 0 ? 'big good' : 'bad', 1.6); VR.Audio.play('hoopRim'); }
            else B(e.team === 0 ? tr(e.value === 3 ? 'bb.three' : 'bb.two') : this.net ? tr('bb.oppMade', { name: this.oppName(), n: e.value }) : tr(e.value === 3 ? 'bb.oppThree' : 'bb.oppTwo'), e.team === 0 ? 'big good' : 'bad', 1.4);
            VR.Audio.play('swish'); if (e.team === 0) VR.Audio.play('coin'); this.netHit(e.team === 0 ? 1 : -1); this.paintHud(true); break;
          case 'miss': if (e.team === 0) B(tr('bb.miss'), '', 0.9); break;
          case 'steal': B(e.team === 0 ? tr('bb.steal!') : tr('bb.stolen'), e.team === 0 ? 'good' : 'bad', 1.1); VR.Audio.play(e.team === 0 ? 'pickup' : 'buzz'); break;
          case 'stealMiss': if (e.team === 0) VR.Audio.play('dodge'); break;
          case 'block': B(e.team === 0 ? tr('bb.block') : tr('bb.blocked'), e.team === 0 ? 'good' : 'bad', 1.1); VR.Audio.play('hoopBoard'); break;
          case 'rebound': B(e.team === 0 ? tr('bb.reb') : tr('bb.oppReb'), e.team === 0 ? 'good' : '', 0.8); break;
          case 'shot': if (e.team === 0) { if (e.timing === 0) B(tr('bb.perfect'), 'good', 0.8); else B(tr(e.timing < 0 ? 'bb.early' : 'bb.late'), '', 0.8); } VR.Audio.play('jump'); break;
          case 'rim': if (e.v > 0.6) VR.Audio.play('hoopRim'); break;
          case 'board': VR.Audio.play('hoopBoard'); break;
          case 'bounce': if (e.v > 1) VR.Audio.play('hoopBounce'); break;
          case 'buzzer': B(tr('bb.buzzer'), 'big', 1.2); VR.Audio.play('hoopBuzzer'); break;
          case 'inbound': this.paintHud(true); break;
        }
      }
    }
    netHit(sx) { const n = this.nets.find(n => n.sx === sx); if (n) n.k = 1; }
    oppName() { return this.net ? this.net.oppName : tr('bb.opp'); }

    // ------------------------------------------------------------ drawing
    syncBall(dt) {
      const b = this.m.ball, M = this.ballM;
      M.position.set(b.x, b.y, b.z);
      // spin: rolling on the floor / backspin in the air / the dribble
      const d = this.v.set(b.x - this.lastBall.x, 0, b.z - this.lastBall.z), l = d.length();
      if (l > 1e-4 && l < 2) { M.rotateOnWorldAxis(this.v.set(d.z, 0, -d.x).normalize(), l / H.BALL_R); }
      else if (b.holder < 0 && Math.abs(b.vy) > 0.1) M.rotation.z += dt * 6;
      // the dribble's bounce sound
      if (b.holder >= 0 && this.live) { const low = b.y < 0.2; if (low && !this.wasLow) VR.Audio.play('hoopBounce'); this.wasLow = low; }
      this.lastBall.set(b.x, b.y, b.z);
      this.shadow.position.set(b.x, 0.006, b.z); this.shadow.scale.setScalar(Math.max(0.5, 1.6 - b.y * 0.25));
    }
    syncBodies(dt) {
      const m = this.m, B = m.ball;
      this.bodies.forEach((b, i) => {
        const p = m.players[i];
        b.pos.set(p.x, p.y, p.z); b.yaw = p.yaw; b.pitch = 0; b.air = p.y > 0.05;
        VR.DuelBody.animate(b, dt);
        const r = b.rig.parts;
        if (p.dunk) { r.armR.rotation.x = -3.1; r.armL.rotation.x = -2.6; }                          // up to the rim
        else if (p.charge !== null) { r.armL.rotation.x = -2.9; r.armR.rotation.x = -3.0; }          // ball up for the shot
        else if (B.holder === i) { r.armR.rotation.x = -0.9 - Math.abs(Math.sin(B.phase)) * 0.5; r.armL.rotation.x = -0.4; }   // dribbling
        else if (p.y > 0.1) { r.armL.rotation.x = -3.0; r.armR.rotation.x = -3.0; }                   // hands up
        else if (B.holder >= 0 && B.holder !== i) { r.armL.rotation.x = -1.2; r.armR.rotation.x = -1.6; }   // defending
        else { r.armL.rotation.x = -0.3; r.armR.rotation.x = -0.3; }
      });
    }
    syncNets(dt) { for (const n of this.nets) { n.k = Math.max(0, n.k - dt * 2); n.net.scale.set(1 - n.k * 0.15, 1 + n.k * 0.25, 1 - n.k * 0.15); n.net.position.y = H.RIM_Y - 0.21 - n.k * 0.05; } }
    /** the camera: behind me, a little above; the mouse turns it */
    place(snap, dt) {
      const p = this.m.players[0], cam = this.cam, far = (cam.aspect || 1) < 1 ? 1.35 : 1;
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      // stay inside the arena: pull in (and rise) instead of going behind a wall or a backboard
      let dist = 6.2 * far;
      const lx = H.AX - 0.3, lz = H.AZ + 0.4;
      if (Math.abs(fx) > 1e-3) { const t = (Math.sign(-fx) * lx - p.x) / -fx; if (t > 0) dist = Math.min(dist, t); }
      if (Math.abs(fz) > 1e-3) { const t = (Math.sign(-fz) * lz - p.z) / -fz; if (t > 0) dist = Math.min(dist, t); }
      dist = Math.max(2.4, dist);
      let hgt = 3.3 * far + this.camPitch * 3 + (6.2 * far - dist) * 0.45;
      const cx = p.x - fx * dist;
      if (Math.abs(cx) > H.BOARD_X - 0.8 && Math.abs(p.x) < Math.abs(cx)) hgt = Math.max(hgt, 4.7);     // look over the backboard
      const pos = this.v.set(cx, Math.max(1.2, hgt), p.z - fz * dist);
      const k = snap ? 1 : 1 - Math.exp(-dt * 10);
      this.camPos.lerp(pos, k);
      this.camLook.lerp(new T.Vector3(p.x + fx * 3.2, 1.3 + p.y * 0.4, p.z + fz * 3.2), k);
      cam.up.set(0, 1, 0); cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    }
    paintHud(full) {
      const m = this.m, t = Math.ceil(m.time), clock = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
      if (this.el.clock.textContent !== clock) { this.el.clock.textContent = clock; this.el.clock.classList.toggle('low', m.time <= 10); full = true; }
      const me = m.players[0], meter = me.charge !== null ? Math.min(1.3, me.charge / H.CHARGE) : null;
      this.el.meter.hidden = meter === null;
      if (meter !== null) { this.el.fill.style.height = (meter / 1.3 * 100) + '%'; this.el.meter.classList.toggle('ok', Math.abs(meter - H.SWEET) <= H.SWEET_W); }
      // what I can do right now: STEAL (in front of him) / DUNK (ready and close); my 3-point zone, streak, dunks
      const P = H, mp = m.players[0];
      const act = m.stealable && m.stealable(0) ? ['E', tr('bb.stealNow')] : m.canDunk && m.canDunk(mp) ? [VR.Input.keyFor ? VR.Input.keyFor('fire') || '🖱' : '🖱', tr('bb.dunkNow')] : null;
      const key = act ? act.join('|') : '';
      if (this.promptWas !== key) { this.promptWas = key; this.el.prompt.hidden = !act; if (act) { this.el.prompt.querySelector('kbd').textContent = act[0]; this.el.prompt.querySelector('b').textContent = act[1]; this.el.prompt.classList.toggle('dunk', act[1] === tr('bb.dunkNow')); } }
      const out3 = m.ball.holder === 0 && Math.hypot(P.hoopX(0) - mp.x, mp.z) > P.THREE_R;
      if (this.el.c3.hidden === out3) this.el.c3.hidden = !out3;
      const st = mp.streak > 0 ? tr('bb.streak', { n: mp.streak }) : '', dk = mp.dunks > 0 ? tr('bb.dunks', { n: mp.dunks }) : '';
      if (this.el.cs.textContent !== st) { this.el.cs.textContent = st; this.el.cs.hidden = !st; }
      if (this.el.cd.textContent !== dk) { this.el.cd.textContent = dk; this.el.cd.hidden = !dk; }
      const pos = m.ball.holder;
      if (this.posWas !== pos) { this.posWas = pos; this.el.me.classList.toggle('ball', pos === 0); this.el.ai.classList.toggle('ball', pos === 1); }
      if (!full) return;
      this.el.me.querySelector('.bb-s').textContent = m.score[0]; this.el.ai.querySelector('.bb-s').textContent = m.score[1];
      this.board.userData.draw((c, w, h) => {
        c.fillStyle = '#0e111a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffe14a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 58px monospace';
        c.fillStyle = '#ffe14a'; c.fillText(String(m.score[0]), 70, 62); c.fillStyle = '#c9b2ff'; c.fillText(String(m.score[1]), w - 70, 62);
        c.fillStyle = '#ff6b5e'; c.font = 'bold 44px monospace'; c.fillText(clock, w / 2, 62);
        c.fillStyle = '#f4f1e6'; c.font = 'bold 26px monospace'; c.fillText('YOU', 70, 125); c.fillText('BOT', w - 70, 125);
      });
    }
    resize() {}
    dispose() { VR.Input.hold('fire', false); VR.Input.setTouchMove(0, 0); this.bodies.forEach(b => this.scene.remove(b.g)); }
  }

  VR.MiniGames.register('basketball', Basketball);
  VR.Basketball = Basketball;
})();
