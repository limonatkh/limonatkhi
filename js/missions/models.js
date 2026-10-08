/* =====================================================================
 * MISSION MODELS — voxel props for the first-person mission worlds.
 * Every model: origin on the floor at its centre, FRONT facing +Z.
 * Moving parts are exposed on group.userData (lid, cover, leaves...).
 * ===================================================================== */
(function () {
  const T = THREE;

  // ---- extra block textures for interiors / docks -----------------------
  function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function noise(c, base, amt, r) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const f = 1 - amt + r() * amt * 2;
      const R = Math.min(255, ((base >> 16) & 255) * f), G = Math.min(255, ((base >> 8) & 255) * f), B = Math.min(255, (base & 255) * f);
      c.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`; c.fillRect(x, y, 1, 1);
    }
  }
  const reg = (k, fn) => VR.Tex.register(k, (c, r) => fn(c, r || rng(k.length * 97)));
  reg('plaster', (c, r) => { noise(c, 0xd9cfbd, 0.05, r); c.fillStyle = 'rgba(120,100,80,.15)'; c.fillRect(0, 15, 16, 1); });
  reg('plaster_dark', (c, r) => { noise(c, 0x7d7466, 0.07, r); });
  reg('floor_wood', (c, r) => {
    noise(c, 0x9a6b3c, 0.08, r); c.fillStyle = hex(0x6e4a28);
    for (let y = 0; y < 16; y += 4) c.fillRect(0, y, 16, 1);
    for (let y = 0; y < 16; y += 4) c.fillRect((y * 5) % 16, y, 1, 4);
  });
  reg('tile', (c, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = ((x >> 3) + (y >> 3)) % 2; c.fillStyle = k ? '#e8e2d2' : '#2f3a46'; c.fillRect(x, y, 1, 1);
    }
  });
  reg('stone_bricks', (c, r) => {
    noise(c, 0x8a8781, 0.08, r); c.fillStyle = hex(0x5d5a55);
    for (let y = 0; y < 16; y += 8) { c.fillRect(0, y, 16, 1); for (let x = (y % 16 ? 4 : 0); x < 16; x += 8) c.fillRect(x, y, 1, 8); }
  });
  reg('corrugated', (c, r) => {             // shipping container wall (tint with #rrggbb)
    for (let x = 0; x < 16; x++) { const k = [1, 0.86, 0.72, 0.86][x % 4]; c.fillStyle = `rgb(${235 * k | 0},${235 * k | 0},${235 * k | 0})`; c.fillRect(x, 0, 1, 16); }
    c.fillStyle = 'rgba(80,50,30,.25)'; for (let i = 0; i < 6; i++) c.fillRect((r() * 16) | 0, (r() * 16) | 0, 1, 2);
  });
  reg('plate', (c, r) => {                  // diamond plate floor
    noise(c, 0x8d939b, 0.04, r); c.fillStyle = hex(0xb7bec7);
    for (let y = 1; y < 16; y += 4) for (let x = (y % 8 === 1 ? 1 : 3); x < 16; x += 4) { c.fillRect(x, y, 2, 1); }
  });
  reg('asphalt', (c, r) => { noise(c, 0x4a4c50, 0.1, r); });
  reg('grate', (c, r) => {
    c.fillStyle = '#2b2e33'; c.fillRect(0, 0, 16, 16); c.fillStyle = '#8d939b';
    for (let i = 0; i < 16; i += 4) { c.fillRect(i, 0, 1, 16); c.fillRect(0, i, 16, 1); }
  });
  reg('cork', (c, r) => { noise(c, 0xb08454, 0.14, r); });
  reg('brass', (c, r) => { noise(c, 0xc9a24a, 0.06, r); c.fillStyle = '#f0d488'; c.fillRect(2, 2, 3, 1); });
  reg('rope', (c, r) => { noise(c, 0xc7b282, 0.08, r); c.fillStyle = '#8f7a4e'; for (let i = 0; i < 16; i += 3) c.fillRect(i, 0, 1, 16); });

  const vbGroup = (fn) => { const vb = new VR.VoxelBuilder(); fn(vb); return vb.build(); };
  const tint = (tex, col) => VR.Mat.tinted(tex, col);

  function symbolPlane(name, size, lit = true) {
    const tex = new T.CanvasTexture(VR.Symbols.canvas(name, 4));
    tex.magFilter = T.NearestFilter; tex.colorSpace = T.SRGBColorSpace;
    const mat = lit ? new T.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1 })
                    : new T.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
    return new T.Mesh(new T.PlaneGeometry(size, size), mat);
  }
  function labelPlane(text, w, h, fg = '#2a2010', bg = '#d8b45a', font = '700 72px "Cairo", sans-serif') {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * h / w);
    const c = cv.getContext('2d'); c.direction = 'ltr'; c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 8; c.strokeRect(4, 4, cv.width - 8, cv.height - 8);
    c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cv.width / 2, cv.height / 2 + 4);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: tex }));
  }
  function lampMat(color) { return new T.MeshBasicMaterial({ color }); }

  const M = {
    symbolPlane, labelPlane,

    crate(s = 1.2, shade = 0) {
      const k = shade ? (c) => tint(c, shade) : (c) => c;
      return vbGroup(vb => {
        vb.addBox(0, 0, 0, s, s, s, k('planks'));
        for (const y of [0, s - 0.1]) vb.addBox(0, y, 0, s + 0.04, 0.1, s + 0.04, k('log'));
      });
    },
    barrel(shade = 0) {
      const wood = tint('planks', shade || 0x8a5a33), band = shade ? tint('iron', shade) : 'iron';
      return vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.8, 1.1, 0.8, wood);
        vb.addBox(0, 0.05, 0, 0.92, 1.0, 0.6, wood);
        vb.addBox(0, 0.05, 0, 0.6, 1.0, 0.92, wood);
        for (const y of [0.18, 0.85]) vb.addBox(0, y, 0, 0.95, 0.07, 0.95, band);
      });
    },
    shelf(w = 3, h = 2.6, d = 0.7, levels = 4) {
      return vbGroup(vb => {
        for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) vb.addBox(x, 0, 0, 0.12, h, d, 'log');
        vb.addBox(0, 0, -d / 2 + 0.03, w, h, 0.06, tint('planks', 0x7a5530));
        for (let i = 0; i < levels; i++) vb.addBox(0, 0.15 + i * (h - 0.25) / (levels - 1), 0, w, 0.08, d, 'planks');
      });
    },
    hangingLamp(len = 0.8) {
      const g = vbGroup(vb => {
        vb.addColorBox(0, -len, 0, 0.04, len, 0.04, 0x222222);
        vb.addBox(0, -len - 0.12, 0, 0.5, 0.12, 0.5, 'iron');
      });
      const bulb = new T.Mesh(new T.BoxGeometry(0.28, 0.2, 0.28), lampMat(0xffe7a8));
      bulb.position.y = -len - 0.22; g.add(bulb);
      return g;
    },
    wallLamp() {
      const g = vbGroup(vb => { vb.addBox(0, 0, -0.05, 0.3, 0.3, 0.1, 'iron'); vb.addBox(0, 0.05, 0.08, 0.1, 0.1, 0.2, 'iron'); });
      const bulb = new T.Mesh(new T.BoxGeometry(0.24, 0.24, 0.16), lampMat(0xffe7a8)); bulb.position.set(0, 0.03, 0.22); g.add(bulb);
      return g;
    },

    chest() {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, 0, 1.3, 0.62, 0.8, tint('planks', 0x6b4526));
        for (const x of [-0.6, 0.6]) vb.addBox(x, 0, 0, 0.1, 0.62, 0.84, 'iron');
        vb.addBox(0, 0.15, 0.41, 0.36, 0.34, 0.04, 'iron');
      });
      const lid = new T.Group(); lid.position.set(0, 0.62, -0.4);
      const lidMesh = vbGroup(vb => {
        vb.addBox(0, 0, 0.4, 1.32, 0.24, 0.82, tint('planks', 0x7a5530));
        for (const x of [-0.6, 0.6]) vb.addBox(x, 0, 0.4, 0.1, 0.26, 0.86, 'iron');
        vb.addBox(0, -0.1, 0.82, 0.24, 0.18, 0.06, 'brass');
      });
      lid.add(lidMesh); g.add(lid);
      // three dial slots on the lock plate
      const dials = [];
      for (let i = 0; i < 3; i++) {
        const sp = symbolPlane('star', 0.09); sp.position.set(-0.11 + i * 0.11, 0.32, 0.435); sp.visible = false; g.add(sp); dials.push(sp);
      }
      const ico = symbolPlane('lemon', 0.14); ico.position.set(0, 0.22, 0.435); g.add(ico);
      g.userData.lid = lid; g.userData.dials = dials;
      return g;
    },
    goldenLemon(silver = false) {
      const body = silver ? 0xd6dde6 : 0xffcc33, end = silver ? 0xaab4c2 : 0xf2a91c, hi = silver ? 0xffffff : 0xfff3a8;
      const vb = new VR.VoxelBuilder();
      vb.addColorBox(0, 0, 0, 0.26, 0.24, 0.32, body);
      vb.addColorBox(0, 0.03, 0, 0.3, 0.18, 0.26, body);
      vb.addColorBox(0, 0.06, -0.19, 0.1, 0.1, 0.06, end); vb.addColorBox(0, 0.06, 0.19, 0.1, 0.1, 0.06, end);
      vb.addColorBox(-0.06, 0.17, -0.06, 0.06, 0.05, 0.08, hi);
      vb.addColorBox(0, 0.24, 0.02, 0.03, 0.06, 0.03, 0x5a3a1e); vb.addColorBox(0.05, 0.27, 0.02, 0.1, 0.02, 0.06, silver ? 0x9fb3c8 : 0x4f9e32);
      const geo = vb.buildGeometries()[0].geometry;
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true }));
      const g = new T.Group(); g.add(mesh);
      return g;
    },
    smallLemon() {
      const g = new T.Group();
      const vb = new VR.VoxelBuilder();
      VR.Props.lemon(vb, 0, 0, 0, 0.8, true);
      g.add(vb.build());
      return g;
    },

    desk(w = 2, d = 0.9) {
      return vbGroup(vb => {
        vb.addBox(0, 0.72, 0, w, 0.08, d, tint('planks', 0x8a5a33));
        for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) vb.addBox(x, 0, 0, 0.55, 0.72, d - 0.08, tint('planks', 0x6b4526));
        vb.addBox(w / 2 - 0.3, 0.45, d / 2 - 0.02, 0.4, 0.04, 0.02, 'brass');
      });
    },
    chair() {
      return vbGroup(vb => {
        vb.addBox(0, 0.42, 0, 0.5, 0.06, 0.5, 'planks');
        for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) vb.addBox(x, 0, z, 0.05, 0.42, 0.05, 'log');
        vb.addBox(0, 0.48, -0.22, 0.5, 0.55, 0.06, 'planks');
      });
    },
    cabinet() {
      return vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.6, 1.3, 0.6, tint('metal', 0x7b8a7a));
        for (const y of [0.25, 0.65, 1.05]) vb.addBox(0, y, 0.31, 0.2, 0.05, 0.03, 'brass');
      });
    },
    // ---- mission 2 sound objects (all ~0.3 m, sit on a shelf)
    mantelClock(face = 0xf2ecd8, wood = 0x6b4526, stopped = false) {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.36, 0.42, 0.18, tint('planks', wood));
        vb.addBox(0, 0.42, 0, 0.26, 0.06, 0.16, tint('planks', wood));
        vb.addBox(0, -0.0, 0, 0.42, 0.04, 0.22, 'brass');
      });
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
      c.fillStyle = hex(face); c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill();
      c.strokeStyle = '#222'; c.lineWidth = 3; c.stroke();
      c.lineWidth = 4; c.beginPath(); c.moveTo(32, 32); c.lineTo(32, stopped ? 10 : 14); c.moveTo(32, 32); c.lineTo(stopped ? 44 : 20, stopped ? 44 : 40); c.stroke();
      if (stopped) { c.strokeStyle = 'rgba(80,60,40,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(14, 20); c.lineTo(28, 34); c.stroke(); }
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      const f = new T.Mesh(new T.PlaneGeometry(0.26, 0.26), new T.MeshLambertMaterial({ map: tex })); f.position.set(0, 0.22, 0.095); g.add(f);
      return g;
    },
    radio() {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.46, 0.3, 0.2, tint('planks', 0x9c3b20));
        vb.addBox(-0.08, 0.06, 0.1, 0.22, 0.18, 0.02, 'grate');
        vb.addBox(0.15, 0.17, 0.1, 0.06, 0.06, 0.03, 'brass'); vb.addBox(0.15, 0.07, 0.1, 0.06, 0.06, 0.03, 'brass');
        vb.addColorBox(0.18, 0.3, -0.05, 0.02, 0.22, 0.02, 0xaaaaaa);
      });
      return g;
    },
    deskBell() {
      return vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.26, 0.04, 0.26, tint('planks', 0x3a2a1a));
        vb.addBox(0, 0.04, 0, 0.2, 0.08, 0.2, 'brass'); vb.addBox(0, 0.12, 0, 0.14, 0.05, 0.14, 'brass');
        vb.addBox(0, 0.17, 0, 0.03, 0.04, 0.03, 'iron');
      });
    },
    musicBox() {
      return vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.34, 0.2, 0.24, tint('planks', 0x4a2f6b));
        vb.addBox(0, 0.2, 0, 0.36, 0.04, 0.26, tint('planks', 0x5d3b86));
        vb.addBox(0, 0.08, 0.125, 0.12, 0.05, 0.01, 'brass');
        vb.addBox(0.2, 0.08, 0, 0.04, 0.04, 0.04, 'brass');        // key hole (no key)
      });
    },
    plaque(n) { return labelPlane(String(n), 0.22, 0.14, '#2a2010', '#d8b45a', '700 96px "Cairo", sans-serif'); },

    buttonPanel(symbols) {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, -0.05, 0.3 + symbols.length * 0.26, 1.0, 0.1, tint('metal', 0x5a6672));
        vb.addBox(0, 0.85, 0.01, 0.2 + symbols.length * 0.26, 0.04, 0.03, 'hazard');
      });
      const buttons = [];
      symbols.forEach((s, i) => {
        const b = new T.Group();
        b.position.set((i - (symbols.length - 1) / 2) * 0.26, 0.38, 0.0);
        const cap = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.08), new T.MeshLambertMaterial({ color: 0xe8e4d6 }));
        cap.position.z = 0.04; b.add(cap);
        const sp = symbolPlane(s, 0.16); sp.position.z = 0.081; b.add(sp);
        g.add(b); buttons.push(b);
      });
      const lamps = [];
      for (let i = 0; i < 4; i++) {
        const l = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.04), lampMat(0x333a40));
        l.position.set((i - 1.5) * 0.16, 0.7, 0.02); g.add(l); lamps.push(l);
      }
      g.userData.buttons = buttons; g.userData.lamps = lamps;
      return g;
    },
    compartment(w = 1.0, h = 0.9) {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, -0.3, w + 0.2, 0.1, 0.6, 'log');
        vb.addBox(0, h + 0.1, -0.3, w + 0.2, 0.1, 0.6, 'log');
        for (const x of [-w / 2 - 0.05, w / 2 + 0.05]) vb.addBox(x, 0, -0.3, 0.1, h + 0.2, 0.6, 'log');
        vb.addBox(0, 0.1, -0.58, w, h, 0.04, 'dark');
      });
      const cover = vbGroup(vb => {
        vb.addBox(0, 0, 0, w + 0.02, h + 0.02, 0.06, 'plaster');
        vb.addBox(0, h * 0.35, 0.035, w * 0.6, h * 0.4, 0.02, tint('planks', 0x6b4526));
      });
      cover.position.set(0, 0.09, 0.02); g.add(cover);
      g.userData.cover = cover;
      return g;
    },

    // ---- docks -------------------------------------------------------------
    container(color, { open = false, len = 6, w = 2.4, h = 2.6 } = {}) {
      const t = tint('corrugated', color);
      const edge = tint('metal', 0x6b6f75);
      return vbGroup(vb => {
        const t2 = 0.08;
        vb.addBox(0, h - t2, 0, w, t2, len, t);                       // roof
        vb.addBox(0, 0, 0, w, 0.12, len, 'plate');                     // floor
        vb.addBox(-w / 2 + t2 / 2, 0, 0, t2, h, len, t);               // sides
        vb.addBox(w / 2 - t2 / 2, 0, 0, t2, h, len, t);
        vb.addBox(0, 0, -len / 2 + t2 / 2, w, h, t2, t);                // back
        if (!open) vb.addBox(0, 0, len / 2 - t2 / 2, w, h, t2, t);      // doors
        // frame
        for (const x of [-w / 2, w / 2]) for (const z of [-len / 2, len / 2]) vb.addBox(x, 0, z, 0.16, h, 0.16, edge);
        if (!open) for (const x of [-0.35, 0.35]) vb.addBox(x, 0.2, len / 2 + 0.02, 0.06, h - 0.4, 0.04, 'iron');
        else if (open !== 'bare') for (const s of [-1, 1]) vb.addBox(s * (w / 2 + 0.55), 0, len / 2 + 0.02, 1.1, h - 0.1, 0.06, t);
      });
    },
    ladder(h) {
      return vbGroup(vb => {
        for (const x of [-0.28, 0.28]) vb.addBox(x, 0, 0, 0.06, h, 0.06, tint('metal', 0xd9a90f));
        for (let y = 0.3; y < h; y += 0.32) vb.addBox(0, y, 0, 0.56, 0.05, 0.05, tint('metal', 0xd9a90f));
      });
    },
    lampPost(h = 5) {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, 0, 0.2, h, 0.2, tint('metal', 0x3a4048));
        vb.addBox(0, h - 0.1, 0.35, 0.14, 0.12, 0.8, tint('metal', 0x3a4048));
        vb.addBox(0, 0, 0, 0.5, 0.15, 0.5, 'concrete');
      });
      const bulb = new T.Mesh(new T.BoxGeometry(0.4, 0.12, 0.3), lampMat(0xfff0c4)); bulb.position.set(0, h - 0.16, 0.65); g.add(bulb);
      g.userData.bulb = bulb;
      return g;
    },
    bollard() { return vbGroup(vb => { vb.addBox(0, 0, 0, 0.35, 0.55, 0.35, tint('metal', 0x2f3338)); vb.addBox(0, 0.55, 0, 0.45, 0.1, 0.45, tint('metal', 0x2f3338)); }); },
    pallet() { return vbGroup(vb => { for (const x of [-0.45, 0, 0.45]) vb.addBox(x, 0, 0, 0.1, 0.1, 1.2, 'planks'); vb.addBox(0, 0.1, 0, 1.2, 0.04, 1.2, 'planks'); }); },
    ropeCoil() { return vbGroup(vb => { vb.addBox(0, 0, 0, 0.7, 0.2, 0.7, 'rope'); vb.addBox(0, 0.2, 0, 0.5, 0.12, 0.5, 'rope'); }); },

    generator(n = 3) {
      const g = vbGroup(vb => {
        vb.addBox(0, 0, -0.35, 4.2, 1.6, 0.7, tint('metal', 0x4f6a5a));
        vb.addBox(0, 1.6, -0.35, 4.3, 0.1, 0.8, tint('metal', 0x3a4d42));
        vb.addBox(0, 1.05, 0.06, 3.8, 0.16, 0.14, tint('metal', 0xb87333));   // conduit, sea → gate
        vb.addBox(0, 0, 0.0, 4.2, 0.12, 0.02, 'hazard');
      });
      const sockets = [];
      for (let i = 0; i < n; i++) {
        const s = new T.Group(); s.position.set((i - (n - 1) / 2) * 1.3, 0.45, 0.02);
        const frame = vbGroup(vb => { vb.addBox(0, 0, 0.04, 0.6, 0.5, 0.08, tint('metal', 0x2b2e33)); vb.addBox(0, 0.1, 0.09, 0.36, 0.3, 0.02, 'dark'); });
        s.add(frame);
        const lamp = new T.Mesh(new T.BoxGeometry(0.16, 0.16, 0.08), lampMat(0x3a2a2a)); lamp.position.set(0, 0.85, 0.06); s.add(lamp);
        const holder = new T.Group(); holder.position.set(0, 0.25, 0.14); s.add(holder);
        g.add(s); sockets.push({ group: s, lamp, holder });
      }
      g.userData.sockets = sockets;
      return g;
    },
    lever() {
      const g = vbGroup(vb => { vb.addBox(0, 0, -0.1, 0.5, 0.7, 0.2, tint('metal', 0x2b2e33)); vb.addBox(0, 0.62, 0.02, 0.4, 0.06, 0.06, 'hazard'); });
      const arm = new T.Group(); arm.position.set(0, 0.35, 0.05);
      arm.add(vbGroup(vb => { vb.addBox(0, 0, 0, 0.06, 0.45, 0.06, 'iron'); vb.addColorBox(0, 0.45, 0, 0.14, 0.14, 0.14, 0xe5433a); }));
      arm.rotation.x = 0.7;
      g.add(arm); g.userData.arm = arm;
      return g;
    },
    fuse() {
      return vbGroup(vb => {
        vb.addColorBox(0, 0, 0, 0.12, 0.08, 0.12, 0xc8ccd2);
        vb.addColorBox(0, 0.08, 0, 0.1, 0.26, 0.1, 0x3b7fd0);
        vb.addColorBox(0, 0.34, 0, 0.12, 0.08, 0.12, 0xc8ccd2);
        vb.addColorBox(0, 0.16, 0.052, 0.04, 0.1, 0.01, 0xffffff);
      });
    },
    coil() {
      return vbGroup(vb => {
        vb.addColorBox(0, 0, 0, 0.06, 0.4, 0.06, 0x4a4f57);
        for (let i = 0; i < 5; i++) vb.addColorBox(0, 0.05 + i * 0.07, 0, 0.2, 0.045, 0.2, i % 2 ? 0xd9823b : 0xb8692c);
      });
    },
    lemonCell() {
      const g = vbGroup(vb => {
        vb.addColorBox(0, 0, 0, 0.22, 0.3, 0.22, 0xffd83a);
        vb.addColorBox(0, 0.03, 0, 0.26, 0.24, 0.26, 0xffd83a);
        vb.addColorBox(0, 0.3, 0, 0.08, 0.06, 0.08, 0xd9823b);       // copper terminal
        vb.addColorBox(0, -0.05, 0, 0.08, 0.05, 0.08, 0x8d939b);
        vb.addColorBox(-0.07, 0.2, 0.12, 0.05, 0.05, 0.03, 0xfff3a8);
        vb.addColorBox(0.06, 0.34, 0, 0.12, 0.02, 0.06, 0x4f9e32);
      });
      return g;
    },
    gate(w = 5, h = 3.4) {
      const g = vbGroup(vb => {
        for (const x of [-w / 2 - 0.3, w / 2 + 0.3]) vb.addBox(x, 0, 0, 0.6, h + 0.8, 0.6, 'concrete');
        vb.addBox(0, h + 0.4, 0, w + 1.2, 0.5, 0.5, tint('metal', 0x3a4048));
        vb.addBox(0, h + 0.4, 0.26, w * 0.6, 0.4, 0.02, 'hazard');
      });
      const leaves = [];
      for (const s of [-1, 1]) {
        const leaf = new T.Group(); leaf.position.set(s * w / 2, 0, 0);
        leaf.add(vbGroup(vb => {
          const lw = w / 2;
          vb.addBox(-s * lw / 2, 0.05, 0, lw, 0.12, 0.12, tint('metal', 0x5a6672));
          vb.addBox(-s * lw / 2, h - 0.15, 0, lw, 0.12, 0.12, tint('metal', 0x5a6672));
          for (let i = 0; i <= 6; i++) vb.addBox(-s * (i / 6) * lw, 0.05, 0, 0.08, h - 0.1, 0.08, tint('metal', 0x5a6672));
          vb.addBox(-s * lw / 2, h * 0.45, 0, lw, 0.3, 0.06, 'hazard');
        }));
        g.add(leaf); leaves.push(leaf);
      }
      const light = new T.Mesh(new T.BoxGeometry(0.4, 0.3, 0.2), lampMat(0xff3b30)); light.position.set(0, h + 0.95, 0.15); g.add(light);
      g.userData.leaves = leaves; g.userData.light = light;
      return g;
    },
    fence(len, h = 2.4) {
      return vbGroup(vb => {
        for (let x = -len / 2; x <= len / 2 + 0.01; x += 2) vb.addBox(x, 0, 0, 0.1, h, 0.1, tint('metal', 0x5a6672));
        vb.addBox(0, h - 0.05, 0, len, 0.06, 0.06, tint('metal', 0x5a6672));
        for (let x = -len / 2 + 0.25; x < len / 2; x += 0.25) vb.addBox(x, 0.1, 0, 0.02, h - 0.15, 0.02, tint('metal', 0x8d939b));
      });
    },
  };
  VR.MissionModels = M;
})();
