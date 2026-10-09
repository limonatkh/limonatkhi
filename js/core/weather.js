/* =====================================================================
 * WEATHER — clear, cloudy, windy, rain, storm, dark. One at a time; each
 * stays for a while (100-200 s), then the next one fades in over ~15 s, so
 * the change is smooth and only breaks the routine now and then.
 *
 *   new VR.WeatherSystem({ scene, hemi, sun, camera, seed })
 *     update(dt)         advance the schedule, blend, wind, rain, sounds
 *     wind               the wind right now (Vector3, m/s, horizontal)
 *     state()            { type, next, k, … } to send to the other player
 *     follow(s)          a guest copies the host's weather
 *     set(type, now)     force a weather (tests / debugging)
 *   URL ?wx=calm  clear, no wind, no changes · ?wx=storm (any type)  hold that weather
 *     dispose()
 *
 * What it does to the world: sky and fog colour and distance, light
 * levels (dark / clouds), rain streaks around the camera (slanted by the
 * wind), dust specks carried by the wind, distant lightning in a storm,
 * and looping rain / wind sounds. Nothing is drawn over the screen: the
 * enemy is never hidden by the weather beyond a little fog.
 *
 * The WIND is real physics, used by the game: shots and arrows drift
 * (js/combat/weaponkit.js, tracePath), grenades are carried, players are
 * slowed walking into it and pushed in the air (fpcontroller `wind`),
 * bots correct their aim for it as well as their skill allows.
 * ===================================================================== */
(function () {
  const T = THREE;
  const t2 = (en, ar) => ({ en, ar });
  /**
   * THE SWITCH. The weather is turned OFF: no weather object is made anywhere (no sky change,
   * rain, dust, sounds or wind HUD), the wind is nil, and shots fly straight like before
   * (js/combat/weaponkit.js asks VR.WEATHER_ON). Everything below is kept as it is.
   * To bring it back: set this to true — or open the game with ?weather=1 to try it.
   */
  VR.WEATHER_ON = typeof location !== 'undefined' && /[?&]weather=1/.test(location.search);
  //            cloud: grey sky · dark: less light · rain 0-1 · wind m/s (+ gusts) · fog: × fog distance · dust specks
  const TYPES = {
    clear:  { name: t2('Clear', 'صافي'), icon: '☀', cloud: 0, dark: 0, rain: 0, wind: 1.5, gust: 1, fog: 1, dust: 0, w: 0.3 },
    cloudy: { name: t2('Cloudy', 'غائم'), icon: '☁', cloud: 0.65, dark: 0.22, rain: 0, wind: 3.5, gust: 2, fog: 0.8, dust: 0, w: 0.2 },
    windy:  { name: t2('Windy', 'رياح'), icon: '💨', cloud: 0.35, dark: 0.12, rain: 0, wind: 10, gust: 4, fog: 0.85, dust: 1, w: 0.17 },
    rain:   { name: t2('Rain', 'مطر'), icon: '🌧', cloud: 0.85, dark: 0.38, rain: 0.7, wind: 4, gust: 2, fog: 0.6, dust: 0, w: 0.15 },
    storm:  { name: t2('Storm', 'عاصفة'), icon: '⛈', cloud: 1, dark: 0.55, rain: 1, wind: 13, gust: 5, fog: 0.5, dust: 0.4, w: 0.07, lightning: 1 },
    dark:   { name: t2('Gloomy', 'معتم'), icon: '🌑', cloud: 0.9, dark: 0.68, rain: 0, wind: 2, gust: 1, fog: 0.55, dust: 0, w: 0.11 },
  };
  const ORDER = ['clear', 'cloudy', 'windy', 'rain', 'storm', 'dark'];
  const KEYS = ['cloud', 'dark', 'rain', 'wind', 'gust', 'fog', 'dust'];
  const DUR = [100, 200], FADE = 15;
  const GREY = new T.Color(0x6b7280);

  Object.assign(VR.I18N.STRINGS.en, { 'wx.now': 'Weather: {name}', 'wx.wind': 'Wind' });
  Object.assign(VR.I18N.STRINGS.ar, { 'wx.now': 'الطقس: {name}', 'wx.wind': 'الريح' });

  // a small seeded random (both players can make the same weather)
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

  class WeatherSystem {
    constructor(o) {
      this.scene = o.scene; this.hemi = o.hemi; this.sun = o.sun; this.camera = o.camera;
      this.rand = rng(o.seed || (Math.random() * 1e9) | 0);
      this.base = { bg: o.scene.background ? o.scene.background.clone() : new T.Color(0x8fd3ff), hemi: o.hemi ? o.hemi.intensity : 1, sun: o.sun ? o.sun.intensity : 1,
        fog: o.scene.fog ? { c: o.scene.fog.color.clone(), near: o.scene.fog.near, far: o.scene.fog.far } : null };
      if (!this.base.fog) { o.scene.fog = new T.Fog(this.base.bg.getHex(), 120, 400); this.base.fog = { c: this.base.bg.clone(), near: 120, far: 400 }; }
      this.time = 0;
      // ?wx=calm → clear and still air, no changes (debugging / tests); ?wx=<type> → that weather, held
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('wx') : null;
      this.calm = q === 'calm'; this.fixed = TYPES[q] ? q : null;
      this.type = this.calm ? 'clear' : this.fixed || o.start || this.pick(null);
      this.next = null; this.k = 0;                                     // blend towards `next` (0..1)
      this.left = DUR[0] + this.rand() * (DUR[1] - DUR[0]);
      this.dir = this.rand() * Math.PI * 2; this.dirTo = this.dir;      // where the wind blows to
      this.p = {}; this.blend();
      this.wind = new T.Vector3();
      this.flash = 0; this.boltT = 6 + this.rand() * 8;
      this.onChange = o.onChange || null;
      this.buildRain(); this.buildDust();
      this.sndRain = VR.Audio.ambient ? VR.Audio.ambient(2600) : null;
      this.sndWind = VR.Audio.ambient ? VR.Audio.ambient(420) : null;
      this.apply(0);
    }
    pick(not) {
      let tot = 0; for (const k of ORDER) if (k !== not) tot += TYPES[k].w;
      let r = this.rand() * tot;
      for (const k of ORDER) { if (k === not) continue; r -= TYPES[k].w; if (r <= 0) return k; }
      return 'clear';
    }
    blend() {
      const A = TYPES[this.type], B = this.next ? TYPES[this.next] : A, k = this.k * this.k * (3 - 2 * this.k);   // smooth step
      for (const key of KEYS) this.p[key] = (A[key] || 0) + ((B[key] || 0) - (A[key] || 0)) * k;
      this.p.lightning = (A.lightning || 0) * (1 - k) + (B.lightning || 0) * k;
    }
    /** force a weather: now (no fade) or as the next one */
    set(type, now = true) {
      if (!TYPES[type]) return;
      this.calm = false; this.fixed = null;                              // forcing a weather ends ?wx= holding
      if (now) { this.type = type; this.next = null; this.k = 0; } else { this.next = type; this.k = 0; }
      this.left = DUR[0] + this.rand() * (DUR[1] - DUR[0]);
      this.blend(); this.apply(0);
      if (this.onChange) this.onChange(type);
    }
    /** host → guest */
    state() { return { ty: this.type, nx: this.next, k: +this.k.toFixed(3), l: Math.round(this.left), t: +this.time.toFixed(1), d: +this.dir.toFixed(3), dt: +this.dirTo.toFixed(3) }; }
    follow(s) {
      if (!s || !TYPES[s.ty]) return;
      const changed = (s.nx || s.ty) !== (this.next || this.type);
      this.type = s.ty; this.next = TYPES[s.nx] ? s.nx : null; this.k = +s.k || 0; this.left = +s.l || 60;
      if (Math.abs((+s.t || 0) - this.time) > 2) this.time = +s.t || 0;
      this.dir = +s.d || 0; this.dirTo = +s.dt || this.dir; this.following = true;
      if (changed && this.onChange) this.onChange(this.next || this.type);
    }

    update(dt) {
      this.time += dt;
      // the schedule (a guest follows the host's messages and only blends between them)
      if (!this.next) {
        if (!this.calm && !this.fixed) this.left -= dt;
        if (this.left <= 0 && !this.following) {
          this.next = this.pick(this.type); this.k = 0;
          this.dirTo = this.dir + (this.rand() - 0.5) * 1.6;               // the wind turns a little with the weather
          if (this.onChange) this.onChange(this.next);
        }
      } else {
        this.k = Math.min(1, this.k + dt / FADE);
        if (this.k >= 1) { this.type = this.next; this.next = null; this.k = 0; this.left = DUR[0] + this.rand() * (DUR[1] - DUR[0]); }
      }
      this.dir += (this.dirTo - this.dir) * Math.min(1, dt * 0.08);
      this.blend();
      // wind: steady part + smooth gusts (the same on both screens: it depends only on time)
      const t = this.time, P = this.p;
      const gust = Math.sin(t * 0.37) * 0.6 + Math.sin(t * 1.13 + 1.7) * 0.3 + Math.sin(t * 2.9 + 0.4) * 0.1;
      const speed = Math.max(0, P.wind + P.gust * gust * 0.5);
      const swing = Math.sin(t * 0.21) * 0.12;                           // the direction wanders a little
      this.wind.set(Math.sin(this.dir + swing) * speed, 0, Math.cos(this.dir + swing) * speed);
      if (this.calm) this.wind.set(0, 0, 0);
      this.apply(dt);
    }
    get speed() { return Math.hypot(this.wind.x, this.wind.z); }
    get name() { return VR.L(TYPES[this.next && this.k > 0.5 ? this.next : this.type].name); }
    get icon() { return TYPES[this.next && this.k > 0.5 ? this.next : this.type].icon; }

    // ------------------------------------------------------------ the look of the world
    apply(dt) {
      const P = this.p, sc = this.scene, B = this.base;
      // lightning: a distant flash of the sky (never a screen flash), thunder a moment later
      if (P.lightning > 0.3) {
        this.boltT -= dt;
        if (this.boltT <= 0) { this.boltT = 6 + this.rand() * 10; this.flash = 1; const d = 400 + this.rand() * 1600; setTimeout(() => VR.Audio.play('thunder'), d); }
      }
      this.flash = Math.max(0, this.flash - dt * 4);
      const fl = this.flash * (this.flash > 0.5 ? 1 : 0.4);
      const sky = (sc.background && sc.background.isColor) ? sc.background : (sc.background = new T.Color());
      sky.copy(B.bg).lerp(GREY, P.cloud * 0.75).multiplyScalar(1 - P.dark * 0.6).lerp(new T.Color(0xdde4ff), fl * 0.5);
      if (sc.fog) {
        sc.fog.color.copy(B.fog.c).lerp(GREY, P.cloud * 0.75).multiplyScalar(1 - P.dark * 0.6);
        sc.fog.near = B.fog.near * (0.35 + 0.65 * P.fog); sc.fog.far = B.fog.far * (0.45 + 0.55 * P.fog);
      }
      if (this.hemi) this.hemi.intensity = B.hemi * (1 - P.dark * 0.5 - P.cloud * 0.12) + fl * B.hemi * 0.6;
      if (this.sun) this.sun.intensity = B.sun * Math.max(0.08, 1 - P.cloud * 0.7 - P.dark * 0.35);
      this.updateRain(dt); this.updateDust(dt);
      const gate = VR.Audio.settings && VR.Audio.settings.sfx;
      if (this.sndRain) this.sndRain.set(gate ? P.rain * 0.16 : 0);
      if (this.sndWind) this.sndWind.set(gate ? Math.min(1, this.speed / 14) * 0.12 : 0, 300 + this.speed * 40);
    }
    // rain: short streaks in a box around the camera, falling and slanted by the wind
    buildRain() {
      const N = 1400; this.rainN = N;
      const pos = new Float32Array(N * 6); this.drops = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { this.drops[i * 3] = (this.rand() - 0.5) * 50; this.drops[i * 3 + 1] = this.rand() * 22; this.drops[i * 3 + 2] = (this.rand() - 0.5) * 50; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.LineBasicMaterial({ color: 0xb8cce0, transparent: true, opacity: 0.5, depthWrite: false });
      this.rain = new T.LineSegments(g, m); this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 3;
      this.scene.add(this.rain);
    }
    updateRain(dt) {
      const P = this.p, R = this.rain;
      const n = Math.round(this.rainN * P.rain);
      R.visible = n > 0 && !!this.camera;
      if (!R.visible) return;
      R.material.opacity = 0.32 + 0.22 * P.rain;
      const c = this.camera.position, fall = 22, wx = this.wind.x * 0.9, wz = this.wind.z * 0.9;
      const a = R.geometry.attributes.position.array, D = this.drops, L = 0.045;    // streak = 45 ms of travel
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        D[k] += wx * dt; D[k + 1] -= fall * dt; D[k + 2] += wz * dt;
        if (D[k + 1] < -2) { D[k + 1] += 22; }
        // keep it in a 50 × 50 box that moves with the camera
        let x = D[k] - c.x, z = D[k + 2] - c.z;
        if (x > 25) D[k] -= 50; else if (x < -25) D[k] += 50;
        if (z > 25) D[k + 2] -= 50; else if (z < -25) D[k + 2] += 50;
        const y = c.y - 6 + D[k + 1];
        const j = i * 6;
        a[j] = D[k]; a[j + 1] = y; a[j + 2] = D[k + 2];
        a[j + 3] = D[k] - wx * L; a[j + 4] = y + fall * L; a[j + 5] = D[k + 2] - wz * L;
      }
      R.geometry.setDrawRange(0, n * 2);
      R.geometry.attributes.position.needsUpdate = true;
    }
    // dust: specks carried by the wind (they show which way and how hard it blows)
    buildDust() {
      const N = 260; this.dustN = N;
      const pos = new Float32Array(N * 3); this.specks = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { this.specks[i * 3] = (this.rand() - 0.5) * 40; this.specks[i * 3 + 1] = this.rand() * 6; this.specks[i * 3 + 2] = (this.rand() - 0.5) * 40; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.PointsMaterial({ color: 0xd8ccb0, size: 0.08, transparent: true, opacity: 0.6, depthWrite: false });
      this.dust = new T.Points(g, m); this.dust.frustumCulled = false; this.dust.visible = false;
      this.scene.add(this.dust);
    }
    updateDust(dt) {
      const P = this.p, D = this.dust, amount = Math.max(P.dust, Math.min(1, (this.speed - 4) / 8));
      const n = Math.round(this.dustN * amount);
      D.visible = n > 0 && !!this.camera;
      if (!D.visible) return;
      const c = this.camera.position, S = this.specks, a = D.geometry.attributes.position.array, t = this.time;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        S[k] += this.wind.x * 1.1 * dt; S[k + 2] += this.wind.z * 1.1 * dt;
        S[k + 1] += Math.sin(t * 3 + i) * 0.4 * dt;
        let x = S[k] - c.x, z = S[k + 2] - c.z;
        if (x > 20) S[k] -= 40; else if (x < -20) S[k] += 40;
        if (z > 20) S[k + 2] -= 40; else if (z < -20) S[k + 2] += 40;
        a[k] = S[k]; a[k + 1] = 0.2 + ((S[k + 1] % 6) + 6) % 6; a[k + 2] = S[k + 2];
      }
      D.geometry.setDrawRange(0, n);
      D.geometry.attributes.position.needsUpdate = true;
    }
    dispose() {
      for (const o of [this.rain, this.dust]) { if (!o) continue; this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      if (this.sndRain) this.sndRain.stop(); if (this.sndWind) this.sndWind.stop();
    }
  }
  if (VR.Audio && VR.Audio.define) VR.Audio.define('thunder', ({ tone, noise }) => { noise(1.8, 0.35, 260); tone(48, 1.6, 'sine', 0.25, 30); noise(0.6, 0.2, 700, 0.15); });

  VR.WeatherSystem = WeatherSystem;
  VR.Weather = { TYPES, ORDER, FADE, DUR };
})();
