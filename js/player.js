/* =====================================================================
 * PLAYER CONTROLLER
 * ---------------------------------------------------------------------
 * Moving across the route (no lanes): the runner has a continuous
 * sideways position x. It lives in the walkable REGION under it (route.js)
 * and keeps its relative place in that region, so it flows with the route
 * when the ridge narrows, bends, splits or merges, never snapping.
 * A swipe moves DODGE_STEP metres sideways, clamped to the region; a
 * swipe toward rock, a gorge or the void is refused (bump).
 *
 * States: running -> STUMBLING (vulnerable for VULNERABLE_TIME; see
 * game.js resolveCollisions) -> recovered.
 *
 * Visual: the body faces along the local route (heading), leans into
 * turns (smooth, limited, from speed x curvature) and into sideways
 * moves; the camera is separate (game.js).
 * ===================================================================== */
(function () {
  const C = VR.CONFIG;
  const M = C.ROUTE_MARGIN;
  const clamp = THREE.MathUtils.clamp;

  class Player {
    constructor(scene) {
      this.scene = scene;
      this.object = new THREE.Group();
      scene.add(this.object);

      // soft square "blob" shadow — cheaper than real shadows
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
      );
      sh.rotation.order = 'YXZ';
      this.shadow = sh; scene.add(sh);

      // shield bubble
      const sg = new THREE.BoxGeometry(1.5, 2.2, 1.5);
      this.shieldMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.22, depthWrite: false }));
      this.shieldEdges = new THREE.LineSegments(new THREE.EdgesGeometry(sg), new THREE.LineBasicMaterial({ color: 0xbff0ff }));
      this.shieldMesh.add(this.shieldEdges);
      this.shieldMesh.position.y = 1.0;
      this.shieldMesh.visible = false;
      this.object.add(this.shieldMesh);

      // star / boost: a golden glow frame instead of blinking (the runner stays visible)
      const gg = new THREE.BoxGeometry(1.25, 2.0, 1.25);
      this.glow = new THREE.LineSegments(new THREE.EdgesGeometry(gg), new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 }));
      this.glow.position.y = 1.0; this.glow.visible = false;
      this.object.add(this.glow);

      // vulnerable: a pulsing red ring at the feet
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 4, 1), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.position.y = 0.06; ring.visible = false;
      this.vRing = ring; this.object.add(ring);

      this.rig = null;
      this.reset();
    }

    setCharacter(def) {
      if (this.rig) this.object.remove(this.rig.root);
      this.rig = VR.buildCharacter(def);
      this.object.add(this.rig.root);
    }

    reset() {
      this.x = 0; this.y = 0; this.z = 0;
      this.rel = 0.5;              // relative place in the current region (0 left edge … 1 right edge)
      this.dodgeX = null;          // a swipe in progress: target x
      this.side = 1;               // last sideways direction (decides a fork when you're in the middle)
      this.regionW = 0;
      this.vy = 0;
      this.grounded = true;
      this.slideTimer = 0;
      this.pendingSlide = false;
      this.runPhase = 0;
      this.stumbleAnim = 0;
      this.vulnerable = 0;         // seconds left of the stumble / vulnerable state
      this.landSquash = 0;
      this.dead = false;
      this.deathTimer = 0;
      this.onTopOf = null;
      this.stepAcc = 0;
      this.flash = 0;
      this.lean = 0; this.tilt = 0; this.yawOff = 0;
      this.lateralVel = 0; this.prevX = 0;
      this.object.position.set(0, 0, 0);
      this.object.rotation.set(0, 0, 0);
      this.vRing.visible = false; this.glow.visible = false;
      if (this.rig) { this.rig.inner.rotation.set(0, 0, 0); this.rig.inner.position.set(0, 0, 0); this.rig.root.visible = true; }
    }

    get sliding() { return this.slideTimer > 0; }
    get height() { return this.sliding ? C.PLAYER_SLIDE_HEIGHT : C.PLAYER_HEIGHT; }

    // ------------------------------------------------------------ the route under the runner
    region(z = this.z, x = this.x) { return VR.track ? VR.track.regionAt(z, x, this.side) : { a: -4.4, b: 4.4 }; }
    static span(r) { const a = r.a + M, b = r.b - M; return b < a ? [(r.a + r.b) / 2, (r.a + r.b) / 2] : [a, b]; }
    /** the x for a relative place in region r */
    static xAt(r, rel) { const [a, b] = Player.span(r); return a + (b - a) * rel; }
    static relAt(r, x) { const [a, b] = Player.span(r); return b - a < 0.01 ? 0.5 : clamp((x - a) / (b - a), 0, 1); }

    action(a, game) {
      if (this.dead) return;
      switch (a) {
        case 'left':
        case 'right': {
          const dir = a === 'left' ? -1 : 1;
          this.side = dir;
          const r = this.region();
          const [lo, hi] = Player.span(r);
          const from = this.dodgeX !== null ? this.dodgeX : this.x;
          const to = clamp(from + dir * C.DODGE_STEP, lo, hi);
          // rock, a gorge or the void that way: refused, no passing through the mountain
          if ((to - from) * dir < 0.3) { game.onWallBump(); return; }
          this.dodgeX = to;
          VR.Audio.play('dodge');
          break;
        }
        case 'jump':
          if (this.grounded) {
            this.vy = C.JUMP_VELOCITY; this.grounded = false; this.slideTimer = 0;
            VR.Audio.play('jump');
          }
          break;
        case 'slide':
          if (this.grounded) { this.slideTimer = C.SLIDE_TIME; VR.Audio.play('slide'); }
          else { this.vy = Math.min(this.vy, C.FAST_FALL_VELOCITY); this.pendingSlide = true; }
          break;
      }
    }

    /** trip over an obstacle: stumble animation + the vulnerable timer */
    stumble(fromSide) {
      this.stumbleAnim = 0.6;
      this.vulnerable = C.VULNERABLE_TIME;
      // knocked back out of a sideways hit
      if (fromSide && this.prevX !== undefined && Math.abs(this.x - this.prevX) > 1e-4) this.dodgeX = this.prevX - Math.sign(this.x - this.prevX) * 0.4;
    }

    update(dt, speed, world, game) {
      if (this.dead) { this.animateDeath(dt); return; }

      // forward
      this.z -= speed * dt;

      // sideways: follow the region (it may narrow, move, split or merge)
      const r = this.region();
      const w = r.b - r.a;
      if (Math.abs(w - this.regionW) > 0.8 || this.x < r.a - 0.05 || this.x > r.b + 0.05) this.rel = Player.relAt(r, this.x);   // a new region (split / merge)
      this.regionW = w;
      const [lo, hi] = Player.span(r);
      let target, vmax;
      if (this.dodgeX !== null) {
        target = clamp(this.dodgeX, lo, hi); this.dodgeX = target;
        vmax = C.DODGE_STEP / C.DODGE_TIME;
      } else { target = Player.xAt(r, this.rel); vmax = C.FOLLOW_SPEED; }
      const step = vmax * dt, dx = target - this.x;
      this.prevX = this.x;
      this.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
      if (this.dodgeX !== null && Math.abs(this.dodgeX - this.x) < 0.01) { this.dodgeX = null; this.rel = Player.relAt(r, this.x); }
      // never off the ground (the route can shrink faster than you follow it)
      this.x = clamp(this.x, r.a + 0.2, r.b - 0.2);
      this.lateralVel = (this.x - this.prevX) / Math.max(dt, 1e-4);

      // vertical
      this.vy -= C.GRAVITY * dt;
      const newY = this.y + this.vy * dt;
      const ground = world.surfaceAt(this.x, this.z, Math.max(this.y, newY), C.PLAYER_HALF_WIDTH);
      if (newY <= ground.h) {
        const wasAir = !this.grounded;
        this.y = ground.h;
        if (this.vy < -2 && wasAir) this.onLand(game);
        this.vy = 0; this.grounded = true;
        this.onTopOf = ground.obj;
      } else {
        this.y = newY;
        if (this.grounded && newY > ground.h + 0.05 && this.vy <= 0) this.grounded = false;     // walked off a shelf
        if (this.vy > 0) this.grounded = false;
      }

      if (this.slideTimer > 0) this.slideTimer -= dt;
      if (this.vulnerable > 0) this.vulnerable = Math.max(0, this.vulnerable - dt);

      // footstep sounds
      if (this.grounded && !this.sliding) {
        this.stepAcc += dt * speed;
        if (this.stepAcc > 3.2) { this.stepAcc = 0; VR.Audio.play('step'); }
      }

      this.animate(dt, speed);
    }

    onLand(game) {
      VR.Audio.play('land');
      this.landSquash = 1;
      game.cameraImpulse(-0.18);
      if (this.pendingSlide) { this.slideTimer = C.SLIDE_TIME; this.pendingSlide = false; VR.Audio.play('slide'); }
    }

    animate(dt, speed) {
      const r = this.rig; if (!r) return;
      const p = r.parts;

      this.runPhase += dt * (6 + speed * 0.42);
      const s = Math.sin(this.runPhase);
      const k = 1 - Math.exp(-dt * 18);  // smoothing factor

      let legL = 0, legR = 0, armL = 0, armR = 0, pitch = 0, bob = 0, innerY = 0;
      if (this.sliding) {
        pitch = 1.25; legL = -1.3; legR = -1.1; armL = -2.4; armR = -2.2; innerY = 0.1;
      } else if (!this.grounded) {
        const t = clamp(this.vy / C.JUMP_VELOCITY, -1, 1);
        legL = -0.9 + t * 0.3; legR = 0.6; armL = -2.6; armR = -2.4 - t * 0.2; pitch = -0.12;
      } else {
        legL = s * 1.0; legR = -s * 1.0; armL = -s * 0.95; armR = s * 0.95;
        bob = Math.abs(Math.cos(this.runPhase)) * 0.09; pitch = -0.14;
      }
      // stumble: pitched forward, arms thrown out, wobbling, then recovering
      if (this.stumbleAnim > 0) {
        this.stumbleAnim = Math.max(0, this.stumbleAnim - dt);
        const a = this.stumbleAnim / 0.6;
        pitch += 0.55 * Math.sin(a * Math.PI) + Math.sin(a * 26) * 0.12 * a;
        armL = -1.6 - a * 1.2; armR = -0.4 - a * 1.6;
      }

      p.legL.rotation.x += (legL - p.legL.rotation.x) * k;
      p.legR.rotation.x += (legR - p.legR.rotation.x) * k;
      p.armL.rotation.x += (armL - p.armL.rotation.x) * k;
      p.armR.rotation.x += (armR - p.armR.rotation.x) * k;
      p.armL.rotation.z = -0.12 - (this.stumbleAnim > 0 ? 0.6 : 0); p.armR.rotation.z = 0.12 + (this.stumbleAnim > 0 ? 0.6 : 0);
      r.inner.rotation.x += (pitch - r.inner.rotation.x) * k;
      r.inner.position.y += (bob + innerY - r.inner.position.y) * k;

      // LEAN, kept apart from the heading:
      //  into turns: from speed² × curvature (sideways acceleration), limited and eased
      //  into sideways moves: a little tilt toward where you're going
      const kk = VR.track ? VR.track.curvature(this.z) : 0;
      const turnLean = clamp(-speed * speed * kk * 0.03, -0.2, 0.2);
      this.lean += (turnLean - this.lean) * (1 - Math.exp(-dt * 3.5));
      const tilt = clamp(-this.lateralVel * 0.016, -0.3, 0.3);
      this.tilt += (tilt - this.tilt) * k;
      r.inner.rotation.z = this.lean + this.tilt + (this.stumbleAnim > 0 ? Math.sin(this.stumbleAnim * 30) * 0.15 : 0);
      p.head.rotation.y = this.tilt * 0.8;
      // heading follows the route; turned slightly toward a sideways move
      const yaw = clamp(-Math.atan2(this.lateralVel, Math.max(6, speed)) * 0.55, -0.22, 0.22);
      this.yawOff += (yaw - this.yawOff) * (1 - Math.exp(-dt * 6));
      this.place();

      // landing squash
      if (this.landSquash > 0) {
        this.landSquash = Math.max(0, this.landSquash - dt * 6);
        const q = Math.sin(this.landSquash * Math.PI) * 0.12;
        r.root.scale.set(1 + q, 1 - q, 1 + q);
      } else r.root.scale.set(1, 1, 1);

      // blink only right after a hit (short); star / boost show the glow frame instead
      if (this.flash > 0) {
        this.flash -= dt;
        r.root.visible = Math.floor(this.flash * 16) % 2 === 0 || this.flash <= 0;
      } else r.root.visible = true;

      // vulnerable ring
      this.vRing.visible = this.vulnerable > 0;
      if (this.vRing.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(this.runPhase * 1.4);
        this.vRing.material.opacity = 0.45 + pulse * 0.45;
        this.vRing.scale.setScalar(1 + pulse * 0.18);
      }
      this.glow.rotation.y += dt * 2;

      this.shieldMesh.rotation.y += dt * 1.5;
      this.shieldMesh.scale.setScalar(1 + Math.sin(this.runPhase * 0.5) * 0.03);
    }

    /** put the model into the world at the path position, facing along the route */
    place() {
      if (VR.track) VR.track.place(this.object, this.x, this.y, this.z, this.yawOff || 0);
      else { this.object.position.set(this.x, this.y, this.z); this.object.rotation.set(0, 0, 0); }
    }

    updateShadow(world) {
      const g = world.surfaceAt(this.x, this.z, this.y + 0.01, C.PLAYER_HALF_WIDTH).h;
      VR.track.toWorld(this.x, g + 0.04, this.z, this.shadow.position);
      this.shadow.rotation.set(-Math.PI / 2, -VR.track.heading(this.z), 0);
      const hgt = Math.max(0, this.y - g);
      const sc = Math.max(0.35, 1 - hgt * 0.2);
      this.shadow.scale.set(sc * 1.05, sc * 0.9, 1);
      this.shadow.material.opacity = 0.3 * sc;
    }

    // bring the player back after a secret-code continue
    revive(d) {
      this.dead = false; this.deathTimer = 0;
      this.x = d.x; this.y = d.y; this.z = d.z;
      const r = this.region();
      this.x = clamp(this.x, ...Player.span(r)); this.prevX = this.x;
      this.rel = Player.relAt(r, this.x); this.regionW = r.b - r.a; this.dodgeX = null;
      this.vy = 0; this.grounded = false; this.slideTimer = 0; this.pendingSlide = false;
      this.stumbleAnim = 0; this.vulnerable = 0;
      this.flash = 1.5;
      const rig = this.rig;
      rig.inner.rotation.set(0, 0, 0); rig.inner.position.set(0, 0, 0);
      for (const k in rig.parts) rig.parts[k].rotation.set(0, 0, 0);
      this.place();
    }

    /** the run state that must survive a mission / duel (game.js snapshotRun) */
    snapshot() {
      return { x: this.x, y: this.y, z: this.z, rel: this.rel, side: this.side, regionW: this.regionW, vulnerable: this.vulnerable };
    }
    restore(s) {
      Object.assign(this, { x: s.x, y: s.y, z: s.z, rel: s.rel, side: s.side, regionW: s.regionW, vulnerable: s.vulnerable || 0,
        dodgeX: null, vy: 0, grounded: true, slideTimer: 0, pendingSlide: false, prevX: s.x, lateralVel: 0, stumbleAnim: 0 });
      this.place();
    }

    die() {
      this.dead = true; this.deathTimer = 0;
      this.deathVy = 6;
      this.vRing.visible = false; this.glow.visible = false;
    }
    animateDeath(dt) {
      this.deathTimer += dt;
      const r = this.rig;
      // knocked backwards, then flop
      this.deathVy -= 30 * dt;
      this.y = Math.max(this.groundAtDeath || 0, this.y + this.deathVy * dt);
      this.z += dt * Math.max(0, 5 - this.deathTimer * 8);
      this.place();
      r.inner.rotation.x += (1.45 - r.inner.rotation.x) * Math.min(1, dt * 8);
      r.parts.armL.rotation.x = -2.8; r.parts.armR.rotation.x = -2.6;
      r.parts.legL.rotation.x = -0.4; r.parts.legR.rotation.x = 0.3;
    }
  }

  VR.Player = Player;
})();
