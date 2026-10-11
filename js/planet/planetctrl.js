/* =====================================================================
 * PLANET CONTROLLER — first / third person movement on the Mini Planet,
 * with gravity toward the planet's centre.
 *
 * Only the Mini Planet uses it (missions.js swaps it in for an area with
 * def.planet and back out for every other world, whose movement stays the
 * axis-aligned FirstPersonController, untouched). Same feel and numbers as
 * that controller (CONFIG.FP: speeds, acceleration, jump height and air
 * time, sprint, crouch, slide, Lemon Burst), same inputs.
 *
 * How it works
 *   up       = the direction from the planet's centre to the player (the
 *              sphere's normal there); gravity pulls along -up, always the
 *              same strength as everywhere else (8h/t²).
 *   heading  = a tangent unit vector (where "forward" points). Mouse X
 *              turns it about up; pitch is a separate angle.
 *   moving   = the tangent velocity is a world vector in the tangent plane.
 *              A step along it is a ROTATION of the position about the
 *              centre (axis up × velocity, angle distance / radius); the
 *              same rotation carries the velocity and the heading along
 *              (parallel transport), so walking over the top, down the side
 *              and across the bottom never flips the view — up turns
 *              smoothly with the ground, the heading follows the surface.
 *   radius   = height above the centre; jumping / falling only change it.
 *   ground   = the cube-sphere terrain columns and the landmark / tree
 *              boxes (VR.MiniPlanet): the support under the player's
 *              footprint (centre + 6 points 0.3 m around); a rise of ≤ 0.55 m
 *              is stepped up (terrain steps are 0.5 m), anything higher is a
 *              wall, and the move slides along the wall (forward / sideways
 *              parts tried apart). Sub-steps ≤ 0.2 m: nothing is tunnelled.
 *              The radius can never go below the ground, so there is no
 *              falling through and no falling "off the bottom".
 *   camera   = built from the local frame (right, up, -heading) then the
 *              pitch: first person at the eyes, third person behind the
 *              shoulder (pulled in by the ground and the boxes, never inside
 *              the planet). Step-ups and step-downs are smoothed for the eye.
 * ===================================================================== */
(function () {
  const T = THREE;
  const F = () => VR.CONFIG.FP;
  const LN10 = Math.log(10);
  const STEP_UP = 0.55, AIR_STEP = 0.12, SNAP_DOWN = 0.6;
  const MP = () => VR.MiniPlanet;

  const _a = new T.Vector3(), _b = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4();
  const QX = new T.Quaternion(), QZ = new T.Quaternion(), AX = new T.Vector3(1, 0, 0), AZ = new T.Vector3(0, 0, 1);

  class PlanetController {
    constructor(camera) {
      this.camera = camera;
      this.pos = new T.Vector3(0, 46, 0);
      this.up = new T.Vector3(0, 1, 0);
      this.fwd = new T.Vector3(0, 0, -1);
      this.rightW = new T.Vector3(1, 0, 0);
      this.vt = new T.Vector3();              // tangent velocity (world)
      this.vr = 0;                            // radial velocity (+ = away from the centre)
      this._vel = new T.Vector3();
      this.qBody = new T.Quaternion(); this.qView = new T.Quaternion();
      this.events = [];
      this.isPlanet = true;
      this.reset({ pos: [0, 46, 0], yaw: 0 });
    }
    get walkSpeed() { return F().SPEED_UNITS * F().UNIT; }
    get gravity() { const h = F().JUMP_HEIGHT_PH * F().HEIGHT, t = F().AIR_TIME; return 8 * h / (t * t); }
    get jumpVel() { return this.gravity * F().AIR_TIME / 2; }
    get speed() { return this.vt.length(); }
    get radius() { return this.pos.length(); }
    /** the hands / HUD read a velocity in the player's own frame: x right, y up, z back */
    get vel() { return this._vel.set(this.vt.dot(this.rightW), this.vr, -this.vt.dot(this.fwd)); }
    right() { return new T.Vector3(1, 0, 0); }        // (in the player's frame — see vel)
    forward() { return new T.Vector3(0, 0, -1); }
    /** the heading as an angle from the local "north" (yaw 0 at the top of the planet looks along -z, as in other worlds) */
    get yaw() { const n = refNorth(this.up, _a); return Math.atan2(_b.crossVectors(n, this.fwd).dot(this.up), n.dot(this.fwd)); }

    reset(spawn) {
      const p = spawn.pos || [0, 46, 0];
      this.pos.set(p[0], p[1], p[2]);
      if (this.pos.lengthSq() < 1) this.pos.set(0, MP().R + 1, 0);
      this.up.copy(this.pos).normalize();
      this.fwd.copy(refNorth(this.up, _a)); if (spawn.yaw) this.fwd.applyAxisAngle(this.up, spawn.yaw);
      this.vt.set(0, 0, 0); this.vr = 0; this.pitch = 0;
      this.grounded = true; this.coyote = 0; this.jumpBuffer = 0;
      this.height = F().HEIGHT; this.crouching = false;
      this.slideTimer = 0; this.slideQueued = 0; this.slideDir = new T.Vector3(); this.slideSpeed0 = 0;
      this.burstCooldown = 0; this.burstFov = 0; this.inBurst = false;
      this.climbing = null; this.eye = F().EYE; this.bobPhase = 0; this.bobAmt = 0;
      this.landDip = 0; this.landDipV = 0; this.roll = 0; this.stepSmooth = 0;
      this.airTime = 0; this.events.length = 0; this.flips = 0;
      this.spawn = spawn;
      this.frame();
      // stand on the ground under the spawn point
      const s = this.support(this.up, this.radius + 50);
      this.setRadius(Math.max(s, MP().R));
      this.frame();
    }
    jump() { this.jumpBuffer = 0.12; }
    slidePress() { this.slideQueued = 0.3; }
    burst(move) {
      if (this.burstCooldown > 0 || !(this.grounded || this.coyote > 0)) return false;
      const fp = F(), h = fp.BURST_HEIGHT_X * fp.JUMP_HEIGHT_PH * fp.HEIGHT;
      this.vr = Math.sqrt(2 * this.gravity * h);       // straight up from the ground (90°, as in other worlds)
      this.grounded = false; this.coyote = 0; this.slideTimer = 0;
      this.burstCooldown = fp.BURST_COOLDOWN; this.burstFov = 9; this.inBurst = true;
      this.events.push({ type: 'burst' });
      return true;
    }
    look(dx, dy, sens) {
      this.fwd.applyAxisAngle(this.up, -dx * sens);
      this.pitch = T.MathUtils.clamp(this.pitch - dy * sens, -1.5, 1.5);
      this.frame();
    }
    wishDir(move) { return new T.Vector3().addScaledVector(this.rightW, move.x).addScaledVector(this.fwd, move.y); }

    // ---- the local frame -------------------------------------------------
    frame() {
      const up = this.up;
      this.fwd.addScaledVector(up, -this.fwd.dot(up));
      if (this.fwd.lengthSq() < 1e-8) this.fwd.copy(refNorth(up, _a));
      this.fwd.normalize();
      this.rightW.crossVectors(this.fwd, up).normalize();
      this.vt.addScaledVector(up, -this.vt.dot(up));
      _m.makeBasis(this.rightW, up, _a.copy(this.fwd).negate());
      const prev = _q.copy(this.qBody);
      this.qBody.setFromRotationMatrix(_m);
      if (prev.dot(this.qBody) < 0) this.qBody.set(-this.qBody.x, -this.qBody.y, -this.qBody.z, -this.qBody.w);   // (same rotation; keeps slerps short)
      QX.setFromAxisAngle(AX, this.pitch);
      this.qView.copy(this.qBody).multiply(QX);
    }
    setRadius(r) { this.pos.setLength(r); }

    // ---- ground queries --------------------------------------------------
    /** the footprint: the centre and 6 points 0.3 m around it, as unit directions */
    samples(up, r) {
      const out = this._smp || (this._smp = Array.from({ length: 7 }, () => new T.Vector3()));
      const rad = F().RADIUS, k = rad / r;
      out[0].copy(up);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, c = Math.cos(a) * k, s = Math.sin(a) * k;
        out[i + 1].copy(up).addScaledVector(this.rightW, c).addScaledVector(this.fwd, s).normalize();
      }
      return out;
    }
    /** the highest ground / box top under the footprint that is no higher than `top` */
    support(up, top) {
      const P = MP(); let best = -Infinity;
      for (const d of this.samples(up, Math.max(top, P.R))) {
        const t = P.terrainR(d); if (t <= top && t > best) best = t;
        for (const b of P.boxesNear(d)) if (b.r1 <= top && b.r1 > best && P.inBox(b, d)) best = b.r1;
      }
      return best;
    }
    /** standing at radius r over `up`: what is too high to step onto (a wall) — and the support */
    probe(up, r, step) {
      const P = MP(); let best = -Infinity, wall = false;
      const head = r + this.height;
      for (const d of this.samples(up, r)) {
        const t = P.terrainR(d);
        if (t > r + step) wall = true; else if (t > best) best = t;
        for (const b of P.boxesNear(d)) {
          if (!P.inBox(b, d)) continue;
          if (b.r1 <= r + step) { if (b.r1 > best) best = b.r1; }
          else if (b.r0 < head - 0.02) wall = true;        // (an arch's bar over your head is not a wall)
        }
      }
      return { wall, sup: best };
    }
    ceiling(up, r, rNext) {
      const P = MP(); let c = Infinity;
      for (const d of this.samples(up, r)) for (const b of P.boxesNear(d)) {
        if (b.r0 >= r + this.height - 0.02 && b.r0 < rNext + this.height && P.inBox(b, d)) c = Math.min(c, b.r0);
      }
      return c;
    }

    // ---- moving along the surface -----------------------------------------
    /** one tangent step (a rotation about the centre); false = blocked */
    tryMove(d) {
      const len = d.length(); if (len < 1e-7) return true;
      const r = this.radius;
      const axis = _a.crossVectors(this.up, d).normalize();
      const q = new T.Quaternion().setFromAxisAngle(axis, len / r);
      const np = this.pos.clone().applyQuaternion(q), nu = np.clone().normalize();
      const pr = this.probe(nu, r, this.grounded ? STEP_UP : AIR_STEP);
      if (pr.wall) return false;
      this.pos.copy(np); this.up.copy(nu);
      this.vt.applyQuaternion(q); this.fwd.applyQuaternion(q); this.slideDir.applyQuaternion(q);
      this.frame();
      if (pr.sup > r) { this.setRadius(pr.sup); this.stepSmooth -= pr.sup - r; }       // a step up
      return true;
    }
    moveT(d) {
      if (this.tryMove(d)) return;
      const a = d.dot(this.fwd), b = d.dot(this.rightW);
      // blocked: try the forward and the sideways parts apart, and stop the part that hits (sliding along walls)
      if (!this.tryMove(this.fwd.clone().multiplyScalar(a))) this.vt.addScaledVector(this.fwd, -this.vt.dot(this.fwd));
      if (!this.tryMove(this.rightW.clone().multiplyScalar(b))) this.vt.addScaledVector(this.rightW, -this.vt.dot(this.rightW));
    }

    // ---- main update (same shape as FirstPersonController.update) ---------
    update(dt, level, move, crouchHeld) {
      const fp = F(), g = this.gravity, wasGrounded = this.grounded;
      this.frame();
      const hv = this.vt.clone(), speed = hv.length();
      const wish = this.wishDir(move), wishLen = Math.min(1, wish.length());
      this.burstCooldown = Math.max(0, this.burstCooldown - dt);
      this.burstFov *= Math.exp(-dt * 4);
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.slideQueued = Math.max(0, this.slideQueued - dt);

      // slide start
      if (this.slideQueued > 0 && this.grounded && this.slideTimer <= 0 && speed > this.walkSpeed * 0.55) {
        this.slideTimer = fp.SLIDE_TIME; this.slideQueued = 0;
        this.slideDir.copy(hv).normalize(); this.slideSpeed0 = Math.max(speed, this.walkSpeed) * fp.SLIDE_BOOST;
        this.events.push({ type: 'slide' });
      }
      // stand / crouch / slide
      const wantLow = this.slideTimer > 0 || (crouchHeld && (this.grounded || this.crouching));
      if (wantLow) { this.height = fp.CROUCH_HEIGHT; this.crouching = true; }
      else if (this.crouching && this.headroom(fp.HEIGHT)) { this.height = fp.HEIGHT; this.crouching = false; }

      // tangent velocity
      if (this.slideTimer > 0) {
        const t = 1 - this.slideTimer / fp.SLIDE_TIME, s = this.slideSpeed0 * (1 - (1 - fp.SLIDE_END_KEEP) * t);
        this.slideDir.addScaledVector(this.up, -this.slideDir.dot(this.up)).normalize();
        if (wishLen > 0.1) this.slideDir.lerp(wish.clone().normalize(), 1 - Math.exp(-dt * 2.2)).normalize();
        hv.copy(this.slideDir).multiplyScalar(s);
        this.slideTimer -= dt;
      } else {
        const sprinting = this.sprint && !this.crouching && move.y > 0.3;
        this.sprinting = sprinting;
        const top = this.walkSpeed * (this.crouching ? fp.CROUCH_SPEED : sprinting ? (fp.SPRINT || 1.5) : 1) * (this.speedMul || 1);
        const target = wish.clone().multiplyScalar(top);
        let tau;
        if (this.grounded) tau = (wishLen > 0.05 ? fp.ACCEL_TIME : fp.STOP_TIME) / LN10;
        else tau = wishLen > 0.05 ? fp.ACCEL_TIME / LN10 / fp.AIR_CONTROL : Infinity;
        if (isFinite(tau)) {
          if (!this.grounded && this.inBurst && speed > top) target.setLength(Math.max(top, speed * 0.98));
          hv.lerp(target, 1 - Math.exp(-dt / tau));
        }
      }
      this.vt.copy(hv);

      // jump
      let jumped = false;
      if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && (!this.crouching || this.headroom(fp.HEIGHT))) {
        this.vr = this.jumpVel; jumped = true;
        if (this.crouching) { this.height = fp.HEIGHT; this.crouching = false; }
        this.slideTimer = 0; this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
        this.events.push({ type: 'jump' });
      }
      // radial: constant acceleration toward the centre (frame-rate independent jump height)
      const v0 = this.vr; this.vr = Math.max(-35, v0 - g * dt);
      let vrMove = (v0 + this.vr) / 2;

      // integrate in sub-steps of ≤ 0.2 m
      const dist = Math.max(this.vt.length(), Math.abs(vrMove)) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.2)), sdt = dt / n;
      let landed = false; const fallSpeed = -this.vr;
      for (let i = 0; i < n; i++) {
        this.moveT(this.vt.clone().multiplyScalar(sdt));
        const r = this.radius;
        let rn = r + vrMove * sdt;
        if (vrMove > 0) { const c = this.ceiling(this.up, r, rn); if (rn + this.height > c) { rn = c - this.height - 1e-3; this.vr = Math.min(0, this.vr); vrMove = 0; } }
        const s = this.support(this.up, Math.max(r, rn) + 0.05);
        if (rn <= s) { rn = s; if (this.vr < 0) { landed = true; this.vr = 0; vrMove = 0; } }
        this.setRadius(rn);
      }
      // walking down a step: stay on the ground (no hop off every terrace)
      let s = this.support(this.up, this.radius + 0.05);
      if (wasGrounded && !jumped && this.vr <= 0 && this.radius - s > 0.06 && this.radius - s <= SNAP_DOWN) { this.stepSmooth += this.radius - s; this.setRadius(s); }
      // never under the surface (safety: the ground is the floor of the world)
      s = this.support(this.up, this.radius + 0.05);
      if (!(this.radius >= s - 0.01) || !isFinite(this.radius)) { if (isFinite(s)) this.setRadius(s); else this.reset(this.spawn); }
      const onFloor = this.vr <= 0.01 && this.radius - s <= 0.06;
      if (onFloor) {
        if (!wasGrounded && (landed || fallSpeed > 1)) {
          this.events.push({ type: 'land', speed: fallSpeed });
          this.landDipV -= Math.min(1.2, fallSpeed * 0.035);
          if (this.slideQueued > 0 && hv.length() > this.walkSpeed * 0.55) {
            this.slideTimer = fp.SLIDE_TIME; this.slideQueued = 0; this.slideDir.copy(this.vt).normalize(); this.slideSpeed0 = Math.max(this.vt.length(), this.walkSpeed) * fp.SLIDE_BOOST;
            this.events.push({ type: 'slide' });
          }
        }
        this.grounded = true; this.inBurst = false; this.airTime = 0;
        if (this.vr < 0) this.vr = 0;
      } else {
        if (wasGrounded && this.vr <= 0) this.coyote = 0.1;
        this.grounded = false; this.airTime += dt;
      }

      // ---- camera (first person; third person is placed by tpp())
      const targetEye = (this.slideTimer > 0 ? fp.CROUCH_EYE - 0.08 : this.crouching ? fp.CROUCH_EYE : fp.EYE) * (this.scaleK || 1);
      this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 16));
      this.stepSmooth *= Math.exp(-dt * 14); if (Math.abs(this.stepSmooth) < 1e-3) this.stepSmooth = 0;
      this.landDipV += (-this.landDip * 90 - this.landDipV * 12) * dt;
      this.landDip += this.landDipV * dt;
      const hs = this.vt.length();
      const moving = this.grounded && this.slideTimer <= 0 && hs > 0.8;
      this.bobAmt += ((moving ? Math.min(1, hs / this.walkSpeed) : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
      this.bobPhase += dt * (4 + hs * 1.15);
      const bobY = Math.sin(this.bobPhase * 2) * 0.03 * this.bobAmt, bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmt;
      const targetRoll = this.slideTimer > 0 ? 0.05 : -move.x * 0.012;
      this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 10));
      this.frame();
      // (tests) the view never turns over: up and the camera's up stay together
      const cam = this.camera;
      cam.position.copy(this.pos).addScaledVector(this.up, this.eye + bobY + this.landDip + this.stepSmooth).addScaledVector(this.rightW, bobX);
      QZ.setFromAxisAngle(AZ, this.roll);
      cam.quaternion.copy(this.qView).multiply(QZ);
      return this.events;
    }
    headroom(h) { const c = this.ceiling(this.up, this.radius, this.radius + h - this.height + 0.01); return !(this.radius + h > c); }
    /** my eyes (third person: where reach is measured from) */
    eyeWorld(out = new T.Vector3()) { return out.copy(this.pos).addScaledVector(this.up, this.eye + this.stepSmooth); }

    /** third person: behind my right shoulder along the view, pulled in so it never goes into the ground or a box */
    tpp(cam, dt) {
      const P = MP();
      const look = _b.set(0, 0, -1).applyQuaternion(this.qView);
      const head = this.pos.clone().addScaledVector(this.up, this.eye + 0.3 + this.stepSmooth);
      let side = 0.55;
      for (let k = 1; k <= 5; k++) { const p = head.clone().addScaledVector(this.rightW, side * k / 5); if (P.solidAt(p, 0.2)) { side = Math.max(0, side * (k - 1) / 5 - 0.1); break; } }
      const shoulder = head.addScaledVector(this.rightW, side);
      let free = 3.5;
      for (let d = 0.25; d <= 3.5; d += 0.25) { const p = shoulder.clone().addScaledVector(look, -d); if (P.solidAt(p, 0.3)) { free = d; break; } }
      const want = Math.max(0.6, Math.min(3.2, free - 0.3));
      this.tppDist = this.tppDist === undefined ? want : want < this.tppDist ? want : this.tppDist + (want - this.tppDist) * Math.min(1, dt * 4);
      cam.position.copy(shoulder).addScaledVector(look, -this.tppDist);
      cam.quaternion.copy(this.qView);
      // last guard: the camera is never inside the planet
      const r = cam.position.length(), ground = P.terrainR(_a.copy(cam.position).normalize());
      if (r < ground + 0.25) cam.position.setLength(ground + 0.25);
    }
  }
  /** "north" in the tangent plane at up: toward -z where that makes sense (so the top of the planet matches the flat worlds' yaw 0), else toward +y */
  function refNorth(up, out) {
    out.set(0, 0, -1).addScaledVector(up, up.z);
    if (out.lengthSq() < 1e-4) out.set(0, 1, 0).addScaledVector(up, -up.y);
    return out.normalize();
  }

  VR.PlanetController = PlanetController;
})();
