/* =====================================================================
 * SKY PLANET — the Mini Planet hanging in the sky of EVERY world.
 *
 * One generic mechanism instead of a copy per map: the game has a single
 * WebGLRenderer (game.js), and every world — the main menu and runner
 * course, the square / exploration / sky islands / missions (missions.js),
 * the 1v1 arena (duel.js), the mini-games (minigame.js), and any world added
 * later — draws through renderer.render(scene, camera). install() wraps
 * that call: before a world is drawn, the sky is cleared to the world's own
 * sky colour and the far planet is drawn into it (its own tiny scene, its
 * own lights, the world camera's rotation and lens but none of its
 * position); then the world is drawn over it. So the planet:
 *   - is a real 3D sphere (the playable planet's own heights, trees and
 *     landmarks, fewer blocks — VR.MiniPlanet.lodGeometry), lit and shaded;
 *   - sits at a fixed direction in each world's sky like a moon: walking
 *     never brings it closer, turning the camera moves it across the view;
 *   - is always BEHIND everything of the world (mountains, walls, roofs and
 *     the sky islands cover it), never clips into anything, needs no room in
 *     a world's camera range and costs one small extra draw.
 *
 * Where it hangs and how big / hazy it looks is per world:
 *   scene.userData.skyPlanet = { az, el, ang, haze }   or a function (camera) → that | null
 *   (az: around you, 0 = north (-z), +π/2 = east (+x); el: above the horizon;
 *    ang: apparent diameter, radians; haze: 0..1 mixed with the sky colour)
 * A world that says nothing gets DEFAULT; null / false = not here (the
 * Mini Planet itself — you are standing on it). Overlay passes (the
 * first-person hands), off-screen renders and short-range cameras are left
 * alone. Inside the sky routes' cloud (js/explore/skyroutes.js) it hides
 * with the other sky objects.
 * ===================================================================== */
(function () {
  const T = THREE;
  const DEFAULT = { az: 2.15, el: 0.5, ang: 0.17, haze: 0.18, halo: 0.5 };
  // the worlds' own places for it (same idea as the sky islands: learnable, "it is over there")
  const PLACES = {
    menu: { az: Math.PI + 0.42, el: 0.1, ang: 0.17, haze: 0.12 },       // main menu: over the right shoulder of the view, above the peaks
    runner: { az: -0.42, el: 0.32, ang: 0.15, haze: 0.2 },             // the course: ahead and to the left (clear of the sky islands)
    hub: { az: 2.15, el: 0.52, ang: 0.19, haze: 0.1 },
    explore: { az: 2.15, el: 0.45, ang: 0.15, haze: 0.22 },
    island: { az: 2.15, el: 0.4, ang: 0.26, haze: 0.08 },              // up in the sky: closer and clearer
    mission: { az: 2.15, el: 0.5, ang: 0.14, haze: 0.25 },
    duel: { az: 2.15, el: 0.42, ang: 0.21, haze: 0.14 },
    billiards: { az: Math.PI, el: 0.62, ang: 0.3, haze: 0.05 },        // over the back wall (a room with no roof, at night)
    basketball: { az: Math.PI / 2 + 0.5, el: 0.15, ang: 0.22, haze: 0.05 },  // over the court's far end, at the top of the view (clear of the score)
  };

  let skyScene = null, skyCam = null, holder = null, spin = null, mat = null, halo = null, sun = null, hemi = null;
  const _p = new T.Vector3(), _s = new T.Vector3(), _d = new T.Vector3(), _l = new T.Vector3(), _c = new T.Color(), _bg = new T.Color();
  const UP = new T.Vector3(0, 1, 0);

  function init() {
    skyScene = new T.Scene(); skyScene.name = 'skyPlanet';
    skyCam = new T.PerspectiveCamera(60, 1, 0.1, 100);
    holder = new T.Group(); spin = new T.Group(); holder.add(spin);
    holder.rotation.z = 0.32; holder.rotation.x = -0.18;                      // a tilted axis
    mat = new T.MeshLambertMaterial({ vertexColors: true });
    const mesh = new T.Mesh(VR.MiniPlanet.lodGeometry(), mat);
    spin.add(mesh);
    // a soft halo of air around it (a sprite behind the sphere: only its rim shows)
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 36, 64, 64, 64);
    gr.addColorStop(0, 'rgba(200,235,255,0.9)'); gr.addColorStop(0.35, 'rgba(170,220,255,0.35)'); gr.addColorStop(1, 'rgba(150,200,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    halo = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    skyScene.add(holder, halo);
    hemi = new T.HemisphereLight(0xffffff, 0x5a6488, 1.25);
    sun = new T.DirectionalLight(0xfff4dc, 2.4);
    skyScene.add(hemi, sun, sun.target);
  }

  function configFor(scene, camera) {
    let c = scene.userData.skyPlanet;
    if (c === false || c === null) return null;
    if (typeof c === 'function') { c = c(camera); if (!c) return null; }
    if (typeof c === 'string') c = PLACES[c];
    return Object.assign({}, DEFAULT, c || {});
  }
  function dirOf(cfg, out) { const ce = Math.cos(cfg.el); return out.set(Math.sin(cfg.az) * ce, Math.sin(cfg.el), -Math.cos(cfg.az) * ce); }

  const Sky = {
    enabled: true, PLACES, DEFAULT,
    /** what was drawn, per world (tests): scene uuid → { name, frames, dir, ang } */
    seen: new Map(), frames: 0,
    configFor, dirOf,
    /** the adventure / mission worlds (one scene for all of them, missions.js): where it hangs in each */
    forArea(def) {
      if (!def) return 'mission';
      if (def.planet) return null;                                  // standing on it
      if (def.skyPlanet) return def.skyPlanet;
      if (def.id === 'hub') return 'hub';
      if (def.id === 'explore') return 'explore';
      if (/^isl\d/.test(def.id)) return 'island';
      return 'mission';
    },
    install(renderer) {
      if (renderer.__skyPlanet) return;
      renderer.__skyPlanet = true;
      const orig = renderer.render.bind(renderer);
      renderer.render = function (scene, camera) {
        if (!Sky.enabled || !scene || !camera || !camera.isPerspectiveCamera || camera.far < 60 || !renderer.autoClear || renderer.getRenderTarget() !== null) return orig(scene, camera);
        const bg = scene.background;
        if (bg && !bg.isColor) return orig(scene, camera);
        if (scene.userData.skyHideK > 0.55) return orig(scene, camera);
        const cfg = configFor(scene, camera);
        if (!cfg) return orig(scene, camera);
        try { Sky.draw(renderer, orig, scene, camera, cfg); }
        catch (e) { console.error('[skyPlanet]', e); Sky.enabled = false; renderer.autoClear = true; return orig(scene, camera); }
        scene.background = null; renderer.autoClear = false;
        try { orig(scene, camera); } finally { scene.background = bg; renderer.autoClear = true; }
      };
    },
    /** clear to the world's sky, draw the far planet into it, leave the depth clean for the world */
    draw(renderer, render, scene, camera, cfg) {
      if (!skyScene) init();
      camera.updateMatrixWorld();
      camera.matrixWorld.decompose(_p, skyCam.quaternion, _s);
      skyCam.position.set(0, 0, 0);
      skyCam.projectionMatrix.copy(camera.projectionMatrix); skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      const D = camera.far * 0.5, dir = dirOf(cfg, _d);
      const rad = D * Math.tan(cfg.ang / 2), s = rad / (VR.MiniPlanet.R + 2);
      holder.position.copy(dir).multiplyScalar(D); holder.scale.setScalar(s);
      spin.rotation.y = (performance.now() / 1000) * 0.012;
      halo.position.copy(dir).multiplyScalar(D + rad * 1.2); halo.scale.setScalar(rad * 2.9); halo.material.opacity = cfg.halo;
      // lit from above and a little from the side: a bright face, a shaded rim (it reads as a sphere)
      const side = _l.crossVectors(dir, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      sun.position.copy(holder.position).addScaledVector(dir, -D * 0.5).addScaledVector(UP, D * 0.6).addScaledVector(side, D * 0.65);
      sun.target.position.copy(holder.position);
      // the world's air in front of it
      if (scene.background) _bg.copy(scene.background); else renderer.getClearColor(_bg);
      mat.color.setScalar(1 - cfg.haze); mat.emissive.copy(_bg).multiplyScalar(cfg.haze * 0.9);
      const oldC = renderer.getClearColor(_c).clone(), oldA = renderer.getClearAlpha();
      if (scene.background) renderer.setClearColor(scene.background, 1);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      if (scene.userData.skyBackdrop) { render(scene.userData.skyBackdrop, skyCam); renderer.clearDepth(); }   // a world's own sky (the square's gradient dome)
      if (!Sky.hidePlanet) render(skyScene, skyCam);         // (tests: hidePlanet = the same sky without the planet)
      renderer.clearDepth();
      renderer.setClearColor(oldC, oldA);
      // (tests) what was drawn where
      Sky.frames++;
      let rec = Sky.seen.get(scene.uuid);
      if (!rec) { rec = { name: scene.name || '', frames: 0 }; Sky.seen.set(scene.uuid, rec); }
      rec.frames++; rec.dir = dir.toArray(); rec.ang = cfg.ang; rec.t = performance.now();
      Sky.last = { scene, camera, dir: dir.clone(), ang: cfg.ang };
    },
    /** where the planet's centre is on screen for this camera (NDC; null when behind) */
    screenOf(camera, dirArr) {
      const d = dirArr ? _d.fromArray(dirArr) : (Sky.last && Sky.last.dir); if (!d) return null;
      camera.updateMatrixWorld();
      const fwd = _s.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new T.Quaternion()));
      if (fwd.dot(d) <= 0) return null;
      const p = camera.getWorldPosition(new T.Vector3()).addScaledVector(d, 10).project(camera);
      return { x: p.x, y: p.y };
    },
  };
  VR.SkyPlanet = Sky;
})();
