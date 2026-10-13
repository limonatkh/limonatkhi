/* =====================================================================
 * FIRST-PERSON CONTROLLER (v1.47: the movement system) + HANDS
 * ---------------------------------------------------------------------
 * One controller for every world that walks on boxes: the square, the
 * adventure areas, the story missions, the training arena and every fight
 * (js/missions/missions.js, js/duel/duel.js). The Mini Planet has its own
 * spherical controller (js/planet/planetctrl.js); the runner and the
 * mini-games have their own physics.
 *
 * Feel: fast and responsive, in the spirit of RIVALS — instant starts,
 * crisp stops, momentum that carries through slides, slide jumps and hops,
 * air strafing. Every number is in CONFIG.MOVE (js/config.js); what each
 * world allows comes from a profile (ctrl.profile: 'full' | 'parkour').
 *
 * Fixed timestep: update(dt) runs the physics in steps of MOVE.STEP
 * (120 Hz) and draws the camera between the last two steps, so speeds,
 * jump heights and distances do not depend on the frame rate.
 *
 * States (this.state) and what moves you from one to another:
 *
 *   ground ──jump──▶ air ──land──▶ ground          (a jump on landing = a hop: no friction, momentum kept)
 *   ground ──crouch, slow──▶ crouch ──stand (room above)──▶ ground
 *   ground / landing ──crouch, ≥ SLIDE_MIN_SPEED──▶ slide ──slow / time / let go──▶ crouch | ground
 *   slide ──jump──▶ air  (slide jump: the slide's speed + a little)
 *   slide ──off a ledge──▶ air (speed kept)
 *   air ──jump (profile, once, not right above the floor)──▶ air  (double jump: resets the rise, turns you)
 *   any ──dash (if enabled, cooldown)──▶ dash ──time──▶ ground | air (exit speed);  dash ──jump──▶ air
 *   ladder ◀──▶ ground / air;   launches (explosions, the Lemon Burst) ──▶ air, never slowed by air rules
 *
 * Collision: swept axis by axis against the level's boxes, step-ups up to
 * 0.45 m, sub-steps so a fast body never passes through a wall, a head bump
 * stops the rise, a floor probe for "grounded" (no double jump from a
 * missed floor). The camera's bob, tilt and landing dip are looks only:
 * shots leave from pos + eye along yaw / pitch (js/duel/duel.js eyePos).
 * ===================================================================== */
(function () {
  const T = THREE;
  const F = () => VR.CONFIG.FP;
  const M = () => VR.CONFIG.MOVE;
  const _w = new T.Vector3(), _h = new T.Vector3(), _n = new T.Vector3();

  /** turn horizontal vector v toward unit direction d by at most `ang` radians (length kept) */
  function turnToward(v, d, ang) {
    const len = Math.hypot(v.x, v.z); if (len < 1e-4 || ang <= 0) return v;
    const a0 = Math.atan2(v.x, v.z), a1 = Math.atan2(d.x, d.z);
    let da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    da = Math.max(-ang, Math.min(ang, da));
    const a = a0 + da; v.x = Math.sin(a) * len; v.z = Math.cos(a) * len;
    return v;
  }

  class FirstPersonController {
    constructor(camera) {
      this.camera = camera;
      camera.rotation.order = 'YXZ';
      this.pos = new T.Vector3();
      this.vel = new T.Vector3();
      this.prev = new T.Vector3();
      this.renderPos = new T.Vector3();
      this.events = [];
      this.profile = 'full';
      this.reset({ pos: [0, 0, 0], yaw: 0 });
    }

    get walkSpeed() { return F().SPEED_UNITS * F().UNIT; }
    get gravity() { const h = F().JUMP_HEIGHT_PH * F().HEIGHT, t = F().AIR_TIME; return 8 * h / (t * t); }
    get jumpVel() { return this.gravity * F().AIR_TIME / 2; }
    get doubleJumpVel() { return Math.sqrt(2 * this.gravity * M().DOUBLE_JUMP_HEIGHT); }
    get rules() { const P = M().PROFILES; return P[this.profile] || P.full; }
    get sliding() { return this.state === 'slide'; }

    reset(spawn) {
      this.pos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
      this.prev.copy(this.pos); this.renderPos.copy(this.pos);
      this.vel.set(0, 0, 0);
      this.yaw = spawn.yaw || 0; this.pitch = 0;
      this.state = 'ground';
      this.grounded = true; this.coyote = 0; this.jumpBuffer = 0; this.jumpPressed = false; this.jumpHeld = false;
      this.height = F().HEIGHT; this.crouching = false;
      this.slideTimer = 0; this.slideQueued = 0; this.slideDir = new T.Vector3(); this.slideSpeed = 0; this.slideT = 0; this.slideCd = 0; this.slideBoostT = 0;
      this.burstCooldown = 0; this.burstFov = 0; this.inBurst = false; this.burstAir = false;
      this.dashQueued = 0; this.dashT = 0; this.dashCd = 0; this.dashDir = new T.Vector3(); this.dashIn = 0; this.airDashes = 0;
      this.canDouble = true; this.groundT = 1; this.rise = false;
      this.climbing = null; this.detachTimer = 0;
      this.eye = F().EYE; this.bobPhase = 0; this.bobAmt = 0;
      this.landDip = 0; this.landDipV = 0; this.roll = 0; this.speedFov = 0;
      this.airTime = 0; this.events.length = 0; this.acc = 0;
      this.spawn = spawn;
    }

    // ---- actions (queued; the next physics step uses them) ---------------
    jump() { this.jumpBuffer = M().JUMP_BUFFER; this.jumpPressed = true; }
    slidePress() { this.slideQueued = 0.3; }
    dash() { if (M().DASH.ENABLED) this.dashQueued = 0.1; }
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
      this.grounded = false; this.coyote = 0; this.slideTimer = 0; this.climbing = null; this.state = 'air';
      this.burstCooldown = fp.BURST_COOLDOWN; this.burstFov = 9; this.inBurst = true; this.burstAir = true;
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
      if (!d) return false;
      const r = F().RADIUS, p = this.pos;
      const i = axis === 'x' ? 0 : 2;
      p[axis] += d;
      for (let k = 0; k < 4; k++) {
        const s = this.overlap(level, p.x, p.y, p.z, this.height);
        if (!s) return false;
        // step up small ledges (stairs, pallets, container floors)
        const step = s.max[1] - p.y;
        if ((this.grounded || this.climbing) && step > 0 && step <= 0.45 && !this.overlap(level, p.x, s.max[1] + 0.001, p.z, this.height)) {
          p.y = s.max[1] + 0.001; continue;
        }
        p[axis] = d > 0 ? s.min[i] - r - 1e-4 : s.max[i] + r + 1e-4;
        this.vel[axis] = 0;
        return true;
      }
      return true;
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
    /** the top of the highest floor within `d` below the feet (null: none) */
    floorBelow(level, d) {
      const r = F().RADIUS, p = this.pos, list = (level.near && level.near(p.x, p.z)) || level.solids;
      let best = null;
      for (const s of list) {
        if (!s.enabled || s.max[1] > p.y + 1e-3 || s.max[1] < p.y - d) continue;
        if (p.x + r > s.min[0] && p.x - r < s.max[0] && p.z + r > s.min[2] && p.z - r < s.max[2] && (best === null || s.max[1] > best)) best = s.max[1];
      }
      return best;
    }
    /** the floor within `d` below the feet (a jump pressed this close to it waits for the landing) */
    nearFloor(level, d) { return !!this.overlap(level, this.pos.x, this.pos.y - d, this.pos.z, Math.max(0.05, d)); }

    ladderAt(level) {
      const p = this.pos;
      for (const l of level.ladders) {
        if (p.x > l.min[0] && p.x < l.max[0] && p.z > l.min[2] && p.z < l.max[2] && p.y >= l.min[1] - 0.1 && p.y < l.max[1]) return l;
      }
      return null;
    }

    // ---- the frame: fixed physics steps, then the camera between the last two -------
    update(dt, level, move, crouchHeld) {
      const H = M().STEP;
      this.acc += Math.min(Math.max(dt, 0), 0.1);
      let n = 0;
      while (this.acc >= H - 1e-7 && n < 14) { this.prev.copy(this.pos); this.step(H, level, move, crouchHeld); this.acc -= H; n++; }
      if (n === 14) this.acc = 0;
      const a = Math.max(0, Math.min(1, this.acc / H));
      if (this.prev.distanceToSquared(this.pos) > 4) this.prev.copy(this.pos);          // (a teleport: no blend)
      this.renderPos.copy(this.prev).lerp(this.pos, a);
      this.updateCamera(dt, move);
      return this.events;
    }

    /** one physics step */
    step(h, level, move, crouchHeld) {
      const fp = F(), C = M(), R = this.rules;
      if (this.state === 'slide' && this.slideTimer <= 0) this.endSlide();          // (something outside ended it: a launch)
      const g = this.gravity;
      const wasGrounded = this.grounded;
      const hv = _h.set(this.vel.x, 0, this.vel.z);
      const speed = hv.length();
      const wish = this.wishDir(move);
      const wishLen = Math.min(1, wish.length());
      const wishN = _w.copy(wish); if (wishLen > 1e-3) wishN.normalize();
      // direction speeds: backwards and sideways a little slower (no extra speed on diagonals: the wish is ≤ 1)
      const ax = Math.abs(move.x), ay = Math.abs(move.y), dirK = ax + ay > 1e-3 ? (ax * C.SIDE_SPEED + ay * (move.y < 0 ? C.BACK_SPEED : 1)) / (ax + ay) : 1;

      this.burstCooldown = Math.max(0, this.burstCooldown - h);
      this.burstFov *= Math.exp(-h * 4);
      this.coyote = Math.max(0, this.coyote - h);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - h);
      this.slideQueued = Math.max(0, this.slideQueued - h);
      this.detachTimer = Math.max(0, this.detachTimer - h);
      this.slideCd = Math.max(0, this.slideCd - h);
      this.slideBoostT = Math.max(0, this.slideBoostT - h);
      this.dashCd = Math.max(0, this.dashCd - h);
      this.dashQueued = Math.max(0, this.dashQueued - h);
      if (C.AUTO_HOP && this.jumpHeld && this.grounded) this.jumpBuffer = Math.max(this.jumpBuffer, h * 2);

      // ---- ladders
      const lad = this.ladderAt(level);
      if (lad && !this.climbing && this.detachTimer <= 0 && move.y > 0.2) { this.climbing = lad; this.endSlide(); this.dashT = 0; this.state = 'ladder'; }
      if (this.climbing && !lad) { this.climbing = null; this.state = this.grounded ? 'ground' : 'air'; }

      // ---- dash start (optional)
      const D = C.DASH;
      if (this.dashQueued > 0 && D.ENABLED && this.dashCd <= 0 && !this.climbing && (this.grounded || this.airDashes < D.AIR)) {
        const dir = wishLen > 0.1 ? wishN.clone() : this.forward();
        this.dashDir.copy(dir); this.dashT = D.TIME; this.dashIn = speed; this.dashCd = D.COOLDOWN; this.dashQueued = 0;
        if (!this.grounded) this.airDashes++;
        this.endSlide(); this.state = 'dash'; this.vel.y = Math.max(0, this.vel.y);
        this.events.push({ type: 'dash' });
      }

      // ---- slide start: crouch while running (or on landing with crouch pressed / held)
      if (this.slideQueued > 0 && this.grounded && !this.climbing && this.state !== 'slide' && this.state !== 'dash' && this.slideCd <= 0 && speed >= C.SLIDE_MIN_SPEED) this.startSlide(hv, speed);

      // ---- height: stand / crouch / slide
      const wantLow = this.state === 'slide' || (crouchHeld && (this.grounded || this.crouching));
      if (wantLow) { this.height = fp.CROUCH_HEIGHT; this.crouching = true; }
      else if (this.crouching && this.headroom(level, fp.HEIGHT)) { this.height = fp.HEIGHT; this.crouching = false; }

      // ---- horizontal velocity, by state
      const sprinting = this.sprint && !this.crouching && move.y > 0.3;
      this.sprinting = sprinting;
      const top = this.walkSpeed * (this.crouching ? fp.CROUCH_SPEED : sprinting ? (fp.SPRINT || 1.5) : 1) * (this.speedMul || 1) * dirK;
      if (this.state === 'dash') {
        hv.copy(this.dashDir).multiplyScalar(D.SPEED);
        this.dashT -= h;
        if (this.dashT <= 0) {           // the exit: a bit faster than running, never slower than you came in
          hv.copy(this.dashDir).multiplyScalar(Math.max(this.dashIn, this.walkSpeed * (fp.SPRINT || 1.5) * D.EXIT));
          this.state = this.grounded ? 'ground' : 'air';
        }
      } else if (this.climbing) {
        hv.lerp(_n.copy(wish).multiplyScalar(this.walkSpeed * 0.35), 1 - Math.exp(-h / 0.06));
      } else if (this.state === 'slide') {
        this.slideT += h;
        let v = this.slideSpeed * Math.exp(-C.SLIDE_FRICTION * h) - C.SLIDE_DECEL * h;
        if (wishLen > 0.1) turnToward(this.slideDir, wishN, C.SLIDE_STEER * h * wishLen);
        this.slideSpeed = v;
        hv.copy(this.slideDir).multiplyScalar(Math.max(0, v));
        this.slideTimer = Math.max(0.0001, C.SLIDE_MAX_TIME - this.slideT);
        if (v < C.SLIDE_END_SPEED || this.slideT > C.SLIDE_MAX_TIME || (!crouchHeld && this.slideT > C.SLIDE_CANCEL_AFTER)) this.endSlide();
      } else if (this.grounded) {
        // the wind (weather) moves the ground frame a little: walking into it is slower, with it faster, standing it nudges you
        const wk = this.wind ? (wishLen > 0.05 ? 0.16 : 0.04) : 0, wx = this.wind ? this.wind.x * wk : 0, wz = this.wind ? this.wind.z * wk : 0;
        hv.x -= wx; hv.z -= wz;
        const speed = hv.length();
        // friction — none for a moment after landing when you are faster than you could run (a hop keeps its speed)
        if (!(this.groundT < C.BHOP_GRACE && speed > top)) {
          const drop = Math.max(speed, C.STOP_SPEED) * C.FRICTION * h;
          const ns = Math.max(0, speed - drop);
          if (speed > 0) hv.multiplyScalar(ns / speed);
        }
        // accelerate toward the wished direction (Quake style: the gain stops at the wished speed)
        if (wishLen > 0.01) {
          const wishSpeed = top * wishLen, cur = hv.dot(wishN), add = wishSpeed - cur;
          if (add > 0) hv.addScaledVector(wishN, Math.min(add, (this.crouching ? C.CROUCH_ACCEL : C.GROUND_ACCEL) * wishSpeed * h));
        }
        hv.x += wx; hv.z += wz;
      } else if (R.classicAir || this.burstAir) {
        // the v1.44 air steering: the island routes, the exploration world, the missions were built and tested with it,
        // and so is the Lemon Burst everywhere (its gaps were measured this way). Explosions use the new air (speed kept).
        if (wishLen > 0.05) {
          const tau = fp.ACCEL_TIME / Math.log(10) / fp.AIR_CONTROL, before = hv.length();
          _n.copy(wish).multiplyScalar(top);
          if (this.inBurst && before > top) _n.setLength(Math.max(top, before * 0.98));    // after a burst: never slowed below the steering target
          hv.lerp(_n, 1 - Math.exp(-h / tau));
        }
      } else {
        this.airMove(hv, wishN, wishLen, top, h, R);
      }
      this.vel.x = hv.x; this.vel.z = hv.z;
      if (this.wind && !this.grounded && !this.climbing) { this.vel.x += this.wind.x * 0.3 * h; this.vel.z += this.wind.z * 0.3 * h; }   // (a 10 m/s wind: +3 m/s per second in the air)

      // ---- jumps
      if (this.jumpBuffer > 0) {
        if (this.climbing) {
          const nn = this.climbing.normal;
          this.vel.set(nn[0] * 4, this.jumpVel * 0.6, nn[1] * 4);
          this.climbing = null; this.detachTimer = 0.4; this.jumpBuffer = 0; this.jumpPressed = false; this.state = 'air';
          this.events.push({ type: 'jump' });
        } else if ((this.grounded || this.coyote > 0) && (!this.crouching || this.state === 'slide' || this.headroom(level, fp.HEIGHT))) {
          let kind = 'jump';
          if (this.state === 'slide') {                 // slide jump: the slide's speed carries on (+ a little)
            const v = Math.min(Math.max(this.slideSpeed, top) + C.SLIDE_JUMP_BOOST, Math.max(R.bhopCap, this.slideSpeed));
            this.vel.x = this.slideDir.x * v; this.vel.z = this.slideDir.z * v; kind = 'slideJump';
            this.endSlide(true);
          } else if (this.state === 'dash') {           // dash jump: the dash's exit speed carries on
            const v = Math.max(this.dashIn, this.walkSpeed * (fp.SPRINT || 1.5) * D.EXIT);
            this.vel.x = this.dashDir.x * v; this.vel.z = this.dashDir.z * v; this.dashT = 0; kind = 'dashJump';
          } else if (this.groundT < C.BHOP_GRACE && wasGrounded) {    // a hop: the landing speed kept
            this.vel.x *= C.BHOP_RETENTION; this.vel.z *= C.BHOP_RETENTION; kind = 'hop';
          }
          this.vel.y = this.jumpVel; this.rise = true;
          if (this.crouching && this.headroom(level, fp.HEIGHT)) { this.height = fp.HEIGHT; this.crouching = false; }
          this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.jumpPressed = false; this.state = 'air'; this.airTime = 0;
          this.events.push({ type: 'jump', kind });
        }
      }
      if (this.jumpPressed && !this.grounded && this.coyote <= 0 && !this.climbing && R.doubleJump && this.canDouble && this.airTime >= C.DOUBLE_JUMP_MIN_AIR
          && !(this.vel.y <= 0 && this.nearFloor(level, C.GROUND_NEAR))) {
        // double jump: the rise starts again (never stacked), the speed turns toward the keys
        this.vel.y = Math.max(this.vel.y, this.doubleJumpVel); this.rise = true;
        const hs = Math.hypot(this.vel.x, this.vel.z);
        if (wishLen > 0.1) {
          const v = Math.max(hs, top * 0.85);
          _n.set(this.vel.x, 0, this.vel.z); if (hs < 1e-3) _n.copy(wishN).multiplyScalar(1e-3);
          turnToward(_n, wishN, Math.PI * C.DOUBLE_JUMP_STEER); _n.setLength(v);
          this.vel.x = _n.x; this.vel.z = _n.z;
        }
        this.canDouble = false; this.jumpBuffer = 0; this.dashT = 0; this.state = 'air';
        this.events.push({ type: 'jump', kind: 'double' });
      }
      this.jumpPressed = false;
      if (C.VARIABLE_JUMP && this.rise && !this.jumpHeld && this.vel.y > 0) { this.vel.y *= C.JUMP_CUT; this.rise = false; }
      if (this.vel.y <= 0) this.rise = false;

      // ---- vertical (constant-acceleration step: exact arcs)
      let vyMove;
      if (this.climbing) {
        this.vel.y = move.y * fp.LADDER_SPEED;
        if (this.pos.y > this.climbing.top - 0.35 && move.y > 0) this.vel.y = Math.max(this.vel.y, 3.2);
        vyMove = this.vel.y;
      } else if (this.state === 'dash') {
        this.vel.y = Math.max(0, this.vel.y); vyMove = this.vel.y;          // a dash holds you level
      } else {
        const v0 = this.vel.y, gg = g * (v0 < 0 ? C.FALL_GRAVITY : 1);
        this.vel.y = Math.max(-35, v0 - gg * h);
        vyMove = (v0 + this.vel.y) / 2;
      }

      // ---- integrate with sub-steps (never more than 0.2 m at a time: no tunnelling at any speed)
      const y0 = this.pos.y;
      const dist = Math.max(Math.abs(this.vel.x), Math.abs(vyMove), Math.abs(this.vel.z)) * h;
      const n = Math.max(1, Math.ceil(dist / 0.2));
      const sdt = h / n;
      let landed = false;
      const fallSpeed = -this.vel.y;
      for (let i = 0; i < n; i++) {
        this.moveH(level, 'x', this.vel.x * sdt);
        this.moveH(level, 'z', this.vel.z * sdt);
        const hit = this.moveV(level, vyMove * sdt);
        if (hit === 'floor') { if (this.vel.y < 0) { landed = true; this.vel.y = 0; vyMove = 0; } }
        if (hit === 'ceiling') { vyMove = Math.min(0, vyMove); this.rise = false; }
      }
      // grounded probe — and walking / sliding down a step keeps you on the ground (no hop off every stair)
      let onFloor = this.vel.y <= 0.01 && !!this.overlap(level, this.pos.x, this.pos.y - 0.06, this.pos.z, this.height);
      if (!onFloor && wasGrounded && this.vel.y <= 0 && !this.climbing && this.state !== 'dash') {
        const top = this.floorBelow(level, 0.46);
        if (top !== null) { this.pos.y = top + 1e-4; this.vel.y = 0; onFloor = true; }
      }
      if (onFloor && !this.climbing) {
        if (!wasGrounded && (landed || fallSpeed > 1)) {
          this.events.push({ type: 'land', speed: fallSpeed });
          this.landDipV -= Math.min(C.CAM_LAND_MAX, fallSpeed * C.CAM_LAND);
          this.groundT = 0;
          const hs = Math.hypot(this.vel.x, this.vel.z);
          if ((this.slideQueued > 0 || (crouchHeld && hs >= C.SLIDE_MIN_SPEED * 1.2)) && hs >= C.SLIDE_MIN_SPEED && this.slideCd <= 0 && this.jumpBuffer <= 0) this.startSlide(_n.set(this.vel.x, 0, this.vel.z), hs);
        } else this.groundT += h;
        this.grounded = true; this.inBurst = false; this.burstAir = false; this.airTime = 0; this.canDouble = true; this.airDashes = 0;
        if (this.state === 'air' || this.state === 'ladder') this.state = this.crouching ? 'crouch' : 'ground';
        if (this.state === 'ground' && this.crouching) this.state = 'crouch';
        if (this.state === 'crouch' && !this.crouching) this.state = 'ground';
        if (this.vel.y < 0) this.vel.y = 0;
        // a slide down a step gains speed, up a step loses it (energy)
        if (this.state === 'slide') {
          const dy = this.pos.y - y0;
          if (Math.abs(dy) > 1e-3) this.slideSpeed = Math.sqrt(Math.max(0, this.slideSpeed * this.slideSpeed - 2 * g * dy * C.SLIDE_SLOPE));
        }
      } else {
        if (wasGrounded && this.vel.y <= 0) this.coyote = C.COYOTE;
        if (this.state === 'slide') this.endSlide(true);      // off a ledge: the slide's speed goes on in the air
        this.grounded = false; this.airTime += h;
        if (this.state !== 'dash' && !this.climbing) this.state = 'air';
      }
      // safe ground (levels with edges to fall off — the islands): remember where I last stood
      if (level.safeRespawn && this.grounded && !this.climbing && !(level.unsafeAt && level.unsafeAt(this.pos))) {   // (the sky routes' rocks are not safe ground)
        this.safeT = (this.safeT || 0) + h;
        if (this.safeT > 0.6) { this.safeT = 0; this.safe = { pos: [this.pos.x, this.pos.y + 0.05, this.pos.z], yaw: this.yaw }; }
      }
      if (this.pos.y < (level.killY !== undefined ? level.killY : -8)) {
        const keep = this.spawn, prof = this.profile;
        this.reset(level.safeRespawn && this.safe ? this.safe : this.spawn); this.spawn = keep; this.profile = prof;
        this.events.push({ type: 'respawn' });
      }
    }

    /** the air: strafing gains speed (capped), the keys steer, the opposite key brakes; launches are never cut */
    airMove(hv, wishN, wishLen, top, h, R) {
      const C = M(), before = hv.length();
      if (wishLen > 0.05) {
        const along = before > 1e-3 ? (hv.x * wishN.x + hv.z * wishN.z) / before : 1;
        if (before > 0.5 && along < -0.35) {
          const ns = Math.max(0, before - C.AIR_BRAKE * wishLen * h); hv.multiplyScalar(ns / before);
        } else {
          const wishSpeed = top * wishLen, capped = Math.min(wishSpeed, C.AIR_WISH_CAP);
          const cur = hv.dot(wishN), add = capped - cur;
          if (add > 0) hv.addScaledVector(wishN, Math.min(add, C.AIR_ACCEL * wishSpeed * h));
          if (hv.lengthSq() > 0.09) turnToward(hv, wishN, C.AIR_TURN * h * wishLen);
          const target = top * C.AIR_PUSH_FRAC * wishLen, cur2 = hv.dot(wishN);
          if (cur2 < target) hv.addScaledVector(wishN, Math.min(C.AIR_PUSH * h, target - cur2));
        }
      }
      if (C.AIR_FRICTION > 0) hv.multiplyScalar(Math.exp(-C.AIR_FRICTION * h));
      const after = hv.length(), cap = R.bhopCap || C.BHOP_CAP;
      if (after > before && after > cap) hv.setLength(Math.max(before, cap));     // gains stop at the cap; a launch above it is kept
    }

    startSlide(hv, speed) {
      const C = M();
      const boost = this.slideBoostT <= 0 ? C.SLIDE_BOOST : 0;
      this.slideBoostT = C.SLIDE_BOOST_COOLDOWN;
      this.slideSpeed = Math.min(Math.max(C.SLIDE_MAX, speed), Math.max(speed, this.walkSpeed) + boost);
      this.slideDir.set(hv.x, 0, hv.z).normalize();
      this.slideT = 0; this.slideTimer = C.SLIDE_MAX_TIME; this.slideQueued = 0;
      this.state = 'slide';
      this.events.push({ type: 'slide' });
    }
    endSlide(keepState) {
      if (this.state !== 'slide') return;
      this.slideTimer = 0; this.slideCd = M().SLIDE_COOLDOWN;
      if (!keepState) this.state = this.grounded ? (this.crouching ? 'crouch' : 'ground') : 'air';
    }

    // ---- camera: looks only (bob, strafe tilt, landing dip, speed FOV) ------------
    updateCamera(dt, move) {
      const fp = F(), C = M();
      const hs = Math.hypot(this.vel.x, this.vel.z);
      const sliding = this.state === 'slide';
      const targetEye = (sliding ? fp.CROUCH_EYE - 0.08 : this.crouching ? fp.CROUCH_EYE : fp.EYE) * (this.scaleK || 1);   // scaleK: a shrunk player
      this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 16));
      this.landDipV += (-this.landDip * 90 - this.landDipV * 12) * dt;
      this.landDip += this.landDipV * dt;
      const moving = this.grounded && !this.climbing && !sliding && hs > 0.8;
      this.bobAmt += ((moving ? Math.min(1, hs / this.walkSpeed) : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
      this.bobPhase += dt * (4 + hs * 1.15);
      const bobY = Math.sin(this.bobPhase * 2) * C.CAM_BOB * this.bobAmt;
      const bobX = Math.cos(this.bobPhase) * C.CAM_BOB_SIDE * this.bobAmt;
      const r = this.right();
      const targetRoll = sliding ? C.CAM_SLIDE_TILT : -move.x * C.CAM_TILT;
      this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 10));
      const sprint = this.walkSpeed * (fp.SPRINT || 1.5), cap = this.rules.bhopCap || C.BHOP_CAP;
      const fovT = C.CAM_SPEED_FOV * Math.max(0, Math.min(1, (hs - sprint) / Math.max(0.5, cap - sprint)));
      this.speedFov += (fovT - this.speedFov) * (1 - Math.exp(-dt * 6));
      const p = this.renderPos;
      this.camera.position.set(p.x + r.x * bobX, p.y + this.eye + bobY + this.landDip, p.z + r.z * bobX);
      this.camera.rotation.set(this.pitch, this.yaw, this.roll);
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
