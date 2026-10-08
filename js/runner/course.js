/* =====================================================================
 * RUNNER COURSE — the third-person runner is a FINITE course now:
 * a start, CHUNKS sections of mountain route, and a finish line.
 * ---------------------------------------------------------------------
 *  - the route is generated as before (same sections, obstacles and
 *    coins); in the last few sections before the finish it is steered
 *    back to the wide ridge, so the finish is always on open ground
 *  - section N is the FINISH: straight and empty, with an arch across
 *    the ridge; after it a few empty "run-out" sections, so the runner
 *    can slow down and stop
 *  - crossing the line ends the run: coins are paid, the time is kept
 *    (best time in the profile), then the result screen
 *  - a crash ends the run too, with the coins collected so far
 *  - no mission gates, 1v1 gates or secret-code continues on the course
 *  - in a race (js/challenge/challenge.js) both players get the same
 *    course; the FIRST to reach the finish wins and gets a coin bag
 *
 * Tuning lives here (VR.Course.CONFIG); world.js and game.js ask it.
 * ===================================================================== */
(function () {
  const T = THREE;
  const CFG = {
    CHUNKS: 30,                 // sections before the finish (× 40 m ≈ 1.15 km to the line)
    STEER_BEFORE: 4,            // sections before the finish that lead back to the wide ridge
    RUNOUT: 8,                  // empty sections after the finish (the view stays full)
    LINE_AT: 12,                // metres into the finish section
    STOP_IN: 45,                // metres to come to a stop after the line
    RACE_WIN_BAG: 50,           // extra coins for the race winner
  };

  Object.assign(VR.I18N.STRINGS.en, {
    'menu.runner': 'RUNNER COURSE', 'course.finish': 'FINISH',
    'go.title.finish': 'Finish!', 'go.title.crash': 'You crashed', 'go.time': 'Time', 'go.bestTime': 'Best time', 'go.progress': 'Course',
    'go.newBestTime': 'NEW BEST TIME!', 'toast.finishNear': 'The finish is near!',
    'ch.intro': 'Invite a friend and you both run the same course at the same time. First to the finish wins a coin bag!',
    'ch.r.finished': 'FINISHED', 'ch.r.time': 'Time', 'ch.r.bag': '+{coins} coin bag', 'ch.t.oppFinished': '{name} reached the finish!',
    'ch.r.oppFirst': '{name} reached the finish first', 'ch.r.meFirst': 'You reached the finish first',
  });
  Object.assign(VR.I18N.STRINGS.ar, {
    'menu.runner': 'مضمار الجري', 'course.finish': 'النهاية',
    'go.title.finish': 'وصلت النهاية!', 'go.title.crash': 'تعثّرت', 'go.time': 'الوقت', 'go.bestTime': 'أفضل وقت', 'go.progress': 'المضمار',
    'go.newBestTime': 'أفضل وقت جديد!', 'toast.finishNear': 'النهاية قريبة!',
    'ch.intro': 'ادعُ صديقك وتركضان على المضمار نفسه في اللحظة نفسها. أول من يصل النهاية يفوز بكيس عملات!',
    'ch.r.finished': 'وصل', 'ch.r.time': 'الوقت', 'ch.r.bag': '+{coins} كيس عملات', 'ch.t.oppFinished': '{name} وصل النهاية!',
    'ch.r.oppFirst': '{name} وصل النهاية أولًا', 'ch.r.meFirst': 'وصلت النهاية أولًا',
  });

  /** Which section leads from `profile` back to the wide ridge (W) right away. */
  function towardWide(profile) {
    if (profile === 'W') return 'ridge';
    for (const k in VR.SECTIONS) { const s = VR.SECTIONS[k]; if (s.from === profile && s.to === 'W') return k; }
    return null;
  }

  /** The finish arch: two posts and a chequered banner across the ridge. */
  function buildArch() {
    const g = new T.Group(), vb = new VR.VoxelBuilder();
    for (const s of [-1, 1]) {
      vb.addColorBox(s * 5.2, 0, 0, 0.6, 6.2, 0.6, 0x2a2f3d);
      vb.addColorBox(s * 5.2, 0, 0, 1.0, 0.5, 1.0, 0x3a3f4d);
    }
    vb.addColorBox(0, 6.2, 0, 11.0, 0.5, 0.6, 0x2a2f3d);
    // chequered banner
    for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) vb.addColorBox(-4.75 + i * 0.5, 5.1 + j * 0.5, 0, 0.5, 0.5, 0.2, (i + j) % 2 ? 0x111111 : 0xf4f4f4);
    g.add(vb.build());
    // a sign in the middle (current language)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffe14a'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#1a1a1a'; c.font = '700 84px "Cairo", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(VR.t('course.finish'), 256, 68);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    const sign = new T.Mesh(new T.PlaneGeometry(3.2, 0.8), new T.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 6.0, 0.32); g.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = -0.32; g.add(back);
    // a glowing line on the ground
    const line = new T.Mesh(new T.BoxGeometry(9.6, 0.06, 0.5), new T.MeshBasicMaterial({ color: 0xffe14a }));
    line.position.y = 0.03; g.add(line);
    return g;
  }

  function fmtTime(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  VR.Course = { CONFIG: CFG, towardWide, buildArch, fmtTime,
    /** metres from the start (player z = 0) to the finish line */
    finishDistance() { return CFG.CHUNKS * VR.CONFIG.CHUNK_LENGTH - 60 + CFG.LINE_AT; },
  };
})();
