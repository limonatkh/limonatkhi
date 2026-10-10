/* =====================================================================
 * FIRST-PERSON CONTROLLER + HANDS
 * ---------------------------------------------------------------------
 * Movement follows the attached movement spec (numbers in config.js →
 * CONFIG.FP): fast arcade movement, quick acceleration with a little
 * momentum, a 1.2-player-height jump with limited air control, a slide
 * that keeps speed and can chain into a jump, crouch, a cooldown-limited
 * blast jump ("Lemon Burst"), and ladders.
 *
 * Collision is swept axis-by-axis against the level's AABB solids, with
 * small step-ups (≤ 0.45 m) so props and container floors never snag.
 * ===================================================================== */
(function () {
  const T = THREE;
  const F = () => VR.CONFIG.FP;
  const LN10 = Math.log(10);

  class FirstPersonController {
    constructor(camera) {
      this.camera = camera;
      camera.rotation.order = 'YXZ';
      this.pos = new T.Vector3();
      this.vel = new T.Vector3();
      this.events = [];
      this.reset({ pos: [0, 0, 0], yaw: 0 });
    }

    get walkSpeed() { return F().SPEED_UNITS * F().UNIT; }
    get gravity() { const h = F().JUMP_HEIGHT_PH * F().HEIGHT, t = F().AIR_TIME; return 8 * h / (t * t); }
    get jumpVel() { return this.gravity * F().AIR_TIME / 2; }

    reset(spawn) {
      this.pos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
      this.vel.set(0, 0, 0);
      this.yaw = spawn.yaw || 0; this.pitch = 0;
      this.grounded = true; this.coyote = 0; this.jumpBuffer = 0;
      this.height = F().HEIGHT; this.crouching = false;
      this.slideTimer = 0; this.slideQueued = 0; this.slideDir = new T.Vector3(); this.slideSpeed0 = 0;
      this.burstCooldown = 0; this.burstFov = 0; this.inBurst = false;
      this.climbing = null; this.detachTimer = 0;
      this.eye = F().EYE; this.bobPhase = 0; this.bobAmt = 0;
      this.landDip = 0; this.landDipV = 0; this.roll = 0;
      this.airTime = 0; this.events.length = 0;
      this.spawn = spawn;
    }

    // ---- actions --------------------------------------------------------
    jump() { this.jumpBuffer = 0.12; }
    slidePress() { this.slideQueued = 0.3; }
    burst(move) {
      if (this.burstCooldown > 0 || !(this.grounded || this.coyote > 0)) return false;
      const fp = F();
      const h = fp.BURST_HEIGHT_X * fp.JUMP_HEIGHT_PH * fp.HEIGHT;
      const v = Math.sqrt(2 * this.gravity * h);
      const wish = this.wishDir(move);
      const moving = wish.lengthSq() > 0.01;
      const dir = moving ? wish.normalize() : this.forward();
      const a = T.MathUtils.degToRad(moving ? fp.BURST_ANGLE_MOVING : fp.BURST_ANGLE_STILL);
      const ca = Math.abs(Math.cos(a)) < 1e-6 ? 0 : Math.cos(a);
      this.vel.set(dir.x * v * ca, v * Math.sin(a), dir.z * v * ca);
      this.grounded = false; this.coyote = 0; this.slideTimer = 0; this.climbing = null;
      this.burstCooldown = fp.BURST_COOLDOWN; this.burstFov = 9; this.inBurst = true;
      this.events.push({ type: 'burst' });
      return true;
    }

    forward() { return new T.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
    right() { return new T.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
    wishDir(move) { return this.right().multiplyScalar(move.x).add(this.forward().multiplyScalar(move.y)); }

    look(dx, dy, sens) {
      this.yaw -= dx * sens;
      this.pitch = T.MathUtils.clamp(this.pitch - dy * sens, -1.5, 1.5);
    }

    // ---- collision helpers -----------------------------------------------
    overlap(level, x, y, z, h) {
      const r = F().RADIUS;
      const list = (level.near && level.near(x, z)) || level.solids;      // big levels: only the colliders nearby
      for (const s of list) {
        if (!s.enabled) continue;
        if (x + r > s.min[0] && x - r < s.max[0] && y + h > s.min[1] && y < s.max[1] && z + r > s.min[2] && z - r < s.max[2]) return s;
      }
      return null;
    }
    moveH(level, axis, d) {
      if (!d) return;
      const r = F().RADIUS, p = this.pos;
      const i = axis === 'x' ? 0 : 2;
      p[axis] += d;
      for (let k = 0; k < 4; k++) {
        const s = this.overlap(level, p.x, p.y, p.z, this.height);
        if (!s) return;
        // step up small ledges (stairs, pallets, container floors)
        const step = s.max[1] - p.y;
        if ((this.grounded || this.climbing) && step > 0 && step <= 0.45 && !this.overlap(level, p.x, s.max[1] + 0.001, p.z, this.height)) {
          p.y = s.max[1] + 0.001; continue;
        }
        p[axis] = d > 0 ? s.min[i] - r - 1e-4 : s.max[i] + r + 1e-4;
        this.vel[axis] = 0;
      }
    }
    moveV(level, d) {
      const p = this.pos;
      p.y += d;
      const s = this.overlap(level, p.x, p.y, p.z, this.height);
      if (!s) return false;
      if (d < 0) { p.y = s.max[1] + 1e-4; return 'floor'; }
      p.y = s.min[1] - this.height - 1e-4; this.vel.y = Math.min(0, this.vel.y); return 'ceiling';
    }
    headroom(level, h) { return !this.overlap(level, this.pos.x, this.pos.y, this.pos.z, h); }

    ladderAt(level) {
      const p = this.pos;
      for (const l of level.ladders) {
        if (p.x > l.min[0] && p.x < l.max[0] && p.z > l.min[2] && p.z < l.max[2] && p.y >= l.min[1] - 0.1 && p.y < l.max[1]) return l;
      }
      return null;
    }

    // ---- main update -------------------------------------------------------
    update(dt, level, move, crouchHeld) {
      const fp = F();
      const g = this.gravity;
      const wasGrounded = this.grounded;
      const hv = new T.Vector3(this.vel.x, 0, this.vel.z);
      const speed = hv.length();
      const wish = this.wishDir(move);
      const wishLen = Math.min(1, wish.length());

      this.burstCooldown = Math.max(0, this.burstCooldown - dt);
      this.burstFov *= Math.exp(-dt * 4);
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.slideQueued = Math.max(0, this.slideQueued - dt);
      this.detachTimer = Math.max(0, this.detachTimer - dt);

      // ---- ladders
      const lad = this.ladderAt(level);
      if (lad && !this.climbing && this.detachTimer <= 0 && move.y > 0.2) { this.climbing = lad; this.slideTimer = 0; }
      if (this.climbing && !lad) this.climbing = null;

      // ---- slide start
      if (this.slideQueued > 0 && this.grounded && !this.climbing && this.slideTimer <= 0 && speed > this.walkSpeed * 0.55) {
        this.slideTimer = fp.SLIDE_TIME; this.slideQueued = 0;
        this.slideDir.copy(hv).normalize();
        this.slideSpeed0 = Math.max(speed, this.walkSpeed) * fp.SLIDE_BOOST;
        this.events.push({ type: 'slide' });
      }

      // ---- height: stand / crouch / slide
      const wantLow = this.slideTimer > 0 || (crouchHeld && (this.grounded || this.crouching));
      if (wantLow) { this.height = fp.CROUCH_HEIGHT; this.crouching = true; }
      else if (this.crouching && this.headroom(level, fp.HEIGHT)) { this.height = fp.HEIGHT; this.crouching = false; }

      // ---- horizontal velocity
      if (this.climbing) {
        const target = wish.multiplyScalar(this.walkSpeed * 0.35);
        hv.lerp(target, 1 - Math.exp(-dt / 0.06));
      } else if (this.slideTimer > 0) {
        const t = 1 - this.slideTimer / fp.SLIDE_TIME;
        const s = this.slideSpeed0 * (1 - (1 - fp.SLIDE_END_KEEP) * t);
        if (wishLen > 0.1) {                                   // gentle steering
          const w = wish.clone().normalize();
          this.slideDir.lerp(w, 1 - Math.exp(-dt * 2.2)).normalize();
        }
        hv.copy(this.slideDir).multiplyScalar(s);
        this.slideTimer -= dt;
      } else {
        // sprint: Shift (or a full stick) while moving forward
        const sprinting = this.sprint && !this.crouching && move.y > 0.3;
        this.sprinting = sprinting;
        const top = this.walkSpeed * (this.crouching ? fp.CROUCH_SPEED : sprinting ? (fp.SPRINT || 1.5) : 1) * (this.speedMul || 1);
        const target = wish.clone().multiplyScalar(top);
        // the wind (weather): walking into it is slower, with it faster; standing still it nudges you a little
        if (this.wind && this.grounded) { const wk = wishLen > 0.05 ? 0.16 : 0.04; target.x += this.wind.x * wk; target.z += this.wind.z * wk; }
        let tau;
        if (this.grounded) tau = (wishLen > 0.05 ? fp.ACCEL_TIME : fp.STOP_TIME) / LN10;
        else tau = wishLen > 0.05 ? fp.ACCEL_TIME / LN10 / fp.AIR_CONTROL : Infinity;   // air: keep momentum
        if (isFinite(tau)) {
          // in the air after a burst, never slow the launch below the steering target
          if (!this.grounded && this.inBurst && speed > top) target.setLength(Math.max(top, speed * 0.98));
          hv.lerp(target, 1 - Math.exp(-dt / tau));
        }
      }
      this.vel.x = hv.x; this.vel.z = hv.z;
      // in the air the wind pushes you along
      if (this.wind && !this.grounded && !this.climbing) { this.vel.x += this.wind.x * 0.3 * dt; this.vel.z += this.wind.z * 0.3 * dt; }   // (a 10 m/s wind: +3 m/s per second in the air)

      // ---- jump (also out of a slide, keeping its momentum)
      if (this.jumpBuffer > 0) {
        if (this.climbing) {
          const n = this.climbing.normal;
          this.vel.set(n[0] * 4, this.jumpVel * 0.6, n[1] * 4);
          this.climbing = null; this.detachTimer = 0.4; this.jumpBuffer = 0;
          this.events.push({ type: 'jump' });
        } else if ((this.grounded || this.coyote > 0) && (!this.crouching || this.headroom(level, fp.HEIGHT))) {
          this.vel.y = this.jumpVel;
          if (this.crouching) { this.height = fp.HEIGHT; this.crouching = false; }
          this.slideTimer = 0;
          this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
          this.events.push({ type: 'jump' });
        }
      }

      // ---- vertical (constant-acceleration step: frame-rate independent jump height)
      let vyMove;
      if (this.climbing) {
        this.vel.y = move.y * fp.LADDER_SPEED;
        if (this.pos.y > this.climbing.top - 0.35 && move.y > 0) this.vel.y = Math.max(this.vel.y, 3.2);
        vyMove = this.vel.y;
      } else {
        const v0 = this.vel.y;
        this.vel.y = Math.max(-35, v0 - g * dt);
        vyMove = (v0 + this.vel.y) / 2;
      }

      // ---- integrate with sub-steps
      const dist = Math.max(Math.abs(this.vel.x), Math.abs(vyMove), Math.abs(this.vel.z)) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.2));
      const sdt = dt / n;
      let landed = false;
      const fallSpeed = -this.vel.y;
      for (let i = 0; i < n; i++) {
        this.moveH(level, 'x', this.vel.x * sdt);
        this.moveH(level, 'z', this.vel.z * sdt);
        const hit = this.moveV(level, vyMove * sdt);
        if (hit === 'floor') { if (this.vel.y < 0) { landed = true; this.vel.y = 0; vyMove = 0; } }
        if (hit === 'ceiling') vyMove = Math.min(0, vyMove);
      }
      // grounded probe
      const onFloor = this.vel.y <= 0.01 && !!this.overlap(level, this.pos.x, this.pos.y - 0.06, this.pos.z, this.height);
      if (onFloor && !this.climbing) {
        if (!wasGrounded && (landed || fallSpeed > 1)) {
          this.events.push({ type: 'land', speed: fallSpeed });
          this.landDipV -= Math.min(1.2, fallSpeed * 0.035);
          if (this.slideQueued > 0 && hv.length() > this.walkSpeed * 0.55) {
            this.slideTimer = fp.SLIDE_TIME; this.slideQueued = 0;
            this.slideDir.copy(hv).normalize(); this.slideSpeed0 = Math.max(hv.length(), this.walkSpeed) * fp.SLIDE_BOOST;
            this.events.push({ type: 'slide' });
          }
        }
        this.grounded = true; this.inBurst = false; this.airTime = 0;
        if (this.vel.y < 0) this.vel.y = 0;
      } else {
        if (wasGrounded && this.vel.y <= 0) this.coyote = 0.1;
        this.grounded = false; this.airTime += dt;
      }
      // safe ground (levels with edges to fall off — the islands): remember where I last stood
      if (level.safeRespawn && this.grounded && !this.climbing) {
        this.safeT = (this.safeT || 0) + dt;
        if (this.safeT > 0.6) { this.safeT = 0; this.safe = { pos: [this.pos.x, this.pos.y + 0.05, this.pos.z], yaw: this.yaw }; }
      }
      if (this.pos.y < (level.killY !== undefined ? level.killY : -8)) {
        const keep = this.spawn;
        this.reset(level.safeRespawn && this.safe ? this.safe : this.spawn); this.spawn = keep;
        this.events.push({ type: 'respawn' });
      }

      // ---- camera
      const targetEye = (this.slideTimer > 0 ? fp.CROUCH_EYE - 0.08 : this.crouching ? fp.CROUCH_EYE : fp.EYE) * (this.scaleK || 1);   // scaleK: a shrunk player
      this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 16));
      this.landDipV += (-this.landDip * 90 - this.landDipV * 12) * dt;
      this.landDip += this.landDipV * dt;
      const moving = this.grounded && !this.climbing && this.slideTimer <= 0 && hv.length() > 0.8;
      this.bobAmt += ((moving ? Math.min(1, hv.length() / this.walkSpeed) : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
      this.bobPhase += dt * (4 + hv.length() * 1.15);
      const bobY = Math.sin(this.bobPhase * 2) * 0.03 * this.bobAmt;
      const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmt;
      const r = this.right();
      const targetRoll = this.slideTimer > 0 ? 0.05 : -move.x * 0.012;
      this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 10));
      this.camera.position.set(this.pos.x + r.x * bobX, this.pos.y + this.eye + bobY + this.landDip, this.pos.z + r.z * bobX);
      this.camera.rotation.set(this.pitch, this.yaw, this.roll);
      return this.events;
    }

    get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  }

  /* -------------------------------------------------------------------
   * HANDS — the character's own floating mitten hands, drawn in their
   * own pass so they never clip into walls. Animated from the
   * controller state: idle breathing, run bob, jump push, landing dip,
   * low slide pose, ladder climbing and an interaction reach.
   * ------------------------------------------------------------------- */
  class HandsView {
    constructor() {
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(58, 1, 0.01, 10);
      this.root = new T.Group();
      this.scene.add(this.root);
      // lights for held items (the hands themselves are flat-shaded)
      this.hemi = new T.HemisphereLight(0xffffff, 0x8a8070, 2.4);
      this.key = new T.DirectionalLight(0xffffff, 1.6); this.key.position.set(0.4, 1, 0.6);
      this.scene.add(this.hemi, this.key);
      this.mat = null;
      this.hands = [];
      this.reach = 0; this.time = 0; this.sway = new T.Vector2();
      this.held = null;
      this.build(VR.CHARACTERS[0]);
    }
    /** Use the hands of another character (rebuilds the arms). */
    setCharacter(def) {
      if (this.def === def) return;
      if (this.held) { this.socket.remove(this.held); this.held = null; }
      for (const h of this.hands) this.root.remove(h);
      this.hands = [];
      this.build(def);
    }
    /** 'white' (default) or 'grey' for two-player challenges. */
    setTone(tone) { this.tone = tone; VR.toneColor(this.mat.color, tone); this.baseColor = this.mat.color.clone(); }
    build(def) {
      this.def = def;
      // a character can give simpler arms for the first-person view (def.fpArms)
      if (def.fpArms) {
        const model = Object.assign({}, def.model);
        for (const k of ['armL', 'armR']) model[k] = { pivot: def.model[k].pivot, boxes: def.fpArms[k] };
        def = Object.assign({}, def, { model });
      }
      const rig = VR.buildCharacter(def);
      const base = new T.MeshBasicMaterial({ vertexColors: true });
      this.mat = base; this.baseColor = new T.Color(1, 1, 1);
      // line every character's hand up with the original mitten (its lowest point at -5.4 px)
      let minY = 0;
      for (const b of def.model.armR.boxes) minY = Math.min(minY, b[1]);
      const lift = 0.37 + (-5.4 - minY) * VR.CHARACTER_PX;
      for (const side of ['armL', 'armR']) {
        const arm = rig.parts[side];
        arm.parent && arm.parent.remove(arm);
        arm.position.set(0, lift, 0);
        arm.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors) o.material = base; });
        const hand = new T.Group();
        hand.add(arm);
        hand.scale.setScalar(0.52);
        this.root.add(hand);
        this.hands.push(hand);
      }
      this.socket = new T.Group(); this.socket.position.set(0, -0.02, -0.12);
      this.hands[1].add(this.socket);
    }
    resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    setBrightness(b) { this.mat.color.copy(this.baseColor).multiplyScalar(b); this.hemi.intensity = 2.4 * b; this.key.intensity = 1.6 * b; }
    hold(model) {
      if (this.held) { this.socket.remove(this.held); this.held = null; }
      if (model) { this.held = model; model.scale.setScalar(0.75); model.rotation.set(0.3, 0.6, 0); this.socket.add(model); }
    }
    pokeReach() { this.reach = 1; }

    /** arm-motion style (VR.Feedback.ARMS: normal, agile, fast, heavy, robotic, magic) */
    setStyle(name) { this.styleName = name; this.style = (VR.Feedback && VR.Feedback.ARMS[name]) || null; }
    /** a hit flinches the arms; an ability lifts the free hand */
    pokeHit(k = 1) { this.hitK = Math.max(this.hitK || 0, k); }
    pokeAbility() { this.abilityK = 1; }

    update(dt, ctrl, look) {
      this.time += dt;
      const st = this.style || ARM_NORMAL;
      this.reach = Math.max(0, this.reach - dt * 4);
      const ra = Math.sin(this.reach * Math.PI);
      // view sway lags behind mouse movement (inertia), then settles back to the centre
      const sk = Math.min(1, dt * 10 / st.lag);
      this.sway.x += (-look.x * 0.0006 * st.sway - this.sway.x) * sk;
      this.sway.y += (look.y * 0.0006 * st.sway - this.sway.y) * sk;
      // movement inertia: the arms lag behind a change of direction (in view space)
      const r = ctrl.right ? ctrl.right() : null, f = ctrl.forward ? ctrl.forward() : null;
      const lx = r ? ctrl.vel.x * r.x + ctrl.vel.z * r.z : 0, lz = f ? ctrl.vel.x * f.x + ctrl.vel.z * f.z : 0;
      const lagK = Math.min(1, dt * 6 / st.lag);
      this.lagX = (this.lagX || 0) + (T.MathUtils.clamp(-lx * 0.0045, -0.035, 0.035) - (this.lagX || 0)) * lagK;
      this.lagY = (this.lagY || 0) + (T.MathUtils.clamp(-lz * 0.0018, -0.02, 0.02) - (this.lagY || 0)) * lagK;
      // speed tiers: walk → run → sprint (leaning forward)
      const hs = Math.hypot(ctrl.vel.x, ctrl.vel.z), walk = ctrl.walkSpeed || 5;
      const sprinting = ctrl.sprint && ctrl.grounded && hs > walk * 1.05 && !(ctrl.slideTimer > 0);
      this.sprintK = (this.sprintK || 0) + ((sprinting ? 1 : 0) - (this.sprintK || 0)) * Math.min(1, dt * 7);
      // a sudden stop: the arms carry on a little, then settle
      const decel = ((this.prevSpeed || 0) - hs) / Math.max(dt, 1e-4);
      if (decel > 30 && (this.prevSpeed || 0) > walk * 0.7 && ctrl.grounded) this.settle = 1;
      this.prevSpeed = hs;
      this.settle = Math.max(0, (this.settle || 0) - dt * 2.6);
      const settle = Math.sin(this.settle * Math.PI * 2.5) * this.settle * 0.035;
      this.hitK = Math.max(0, (this.hitK || 0) - dt * 5);
      this.abilityK = Math.max(0, (this.abilityK || 0) - dt * 2.5);
      // jump up / falling / dash
      const vy = ctrl.vel.y, inAir = !ctrl.grounded && !ctrl.climbing;
      const up = inAir && vy > 0 ? Math.min(1, vy / 9) : 0, fall = inAir && vy < 0 ? Math.min(1, -vy / 14) : 0;
      const dashing = ctrl.burstFov > 2.5 || hs > walk * 2.2;          // a blast / burst push, or far faster than running
      this.dashK = (this.dashK || 0) + ((dashing ? 1 : 0) - (this.dashK || 0)) * Math.min(1, dt * 10);
      const run = ctrl.bobAmt, ph = ctrl.bobPhase * st.freq;
      const amp = st.amp * (0.7 + this.sprintK * 0.6);
      const breathe = Math.sin(this.time * 2.1) * 0.006;
      const air = inAir ? T.MathUtils.clamp(vy * 0.006, -0.05, 0.06) : 0;
      const slide = ctrl.slideTimer > 0 ? 1 : 0;
      const climb = ctrl.climbing ? 1 : 0;
      const size = Math.min(1, Math.max(0.62, this.camera.aspect / 1.2));
      const q = (v) => (st.step ? Math.round(v / st.step) * st.step : v);      // robotic: stepped motion
      this.hands.forEach((h, i) => {
        const s = i === 0 ? -1 : 1;
        h.scale.setScalar(0.52 * size);
        // opposite phase: one arm swings forward while the other goes back
        const sw = Math.sin(ph + (i ? Math.PI : 0));
        const swing = q(sw * 0.045 * run * amp), lift = q(Math.abs(sw) * 0.02 * run * amp);
        const float = st.float ? Math.sin(this.time * 2.4 + i * 1.7) * 0.012 : 0;
        const wide = Math.min(1, Math.max(0.42, this.camera.aspect / 1.5));   // keep hands on screen in portrait
        let x = s * 0.27 * wide + this.sway.x + this.lagX + Math.cos(ph) * 0.012 * run - s * this.sprintK * 0.03;
        let y = -0.27 + breathe + lift + float - air + up * -0.03 + fall * 0.07 + ctrl.landDip * 0.25 * st.weight + this.sway.y + this.lagY
          - slide * 0.07 - this.sprintK * 0.05 - settle + this.hitK * 0.03;
        let z = -0.62 + swing + this.dashK * 0.1 + this.sprintK * 0.03 - settle * 0.6;
        if (climb) { y += Math.sin(this.time * 9 + i * Math.PI) * 0.08 + 0.14; z -= 0.08; }
        if (i === 1) { z -= ra * 0.2; y += ra * 0.07; x -= ra * 0.06; }
        if (i === 0 && this.abilityK > 0) { const a = Math.sin(this.abilityK * Math.PI); z -= a * 0.16; y += a * 0.1; x += a * 0.06; }
        h.position.set(x, y, z);
        h.rotation.set(0.3 + air * 2 - ra * 0.5 - this.sprintK * 0.35 + fall * 0.4 - this.hitK * 0.3 + this.dashK * 0.2,
          -s * 0.18, s * (0.12 + slide * 0.25 + fall * 0.3) + this.lagX * 2 * st.roll);
      });
      // what the held weapon uses (a reduced share of the run motion)
      const m = this.motion || (this.motion = {});
      m.swing = Math.sin(ph) * run * amp; m.lift = Math.abs(Math.sin(ph)) * run * amp; m.sprint = this.sprintK;
      m.lagX = this.lagX; m.lagY = this.lagY; m.up = up; m.fall = fall; m.dash = this.dashK; m.settle = settle; m.hit = this.hitK;
      m.weight = st.weight; m.style = this.styleName || 'normal';
      return m;
    }
  }
  const ARM_NORMAL = { amp: 1, freq: 1, lag: 1, weight: 1, step: 0, float: 0, roll: 1, sway: 1 };

  VR.FirstPersonController = FirstPersonController;
  VR.HandsView = HandsView;
})();
