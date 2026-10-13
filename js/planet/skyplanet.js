/* =====================================================================
 * SKY PASS — a world's own sky drawn behind it (v1.46).
 *
 * Until v1.45 this pass also hung the Mini Planet in the sky of every
 * world. Since v1.46 the Mini Planet and the five sky islands are seen ONLY
 * in their own places:
 *   - the Mini Planet: only while you stand on it (js/planet/planetworld.js
 *     builds it as real ground; no copy is ever drawn in any sky);
 *   - the sky islands: only inside the island areas (js/explore/islandworlds.js
 *     adds VR.SkyIslands there, where the sky routes point at them).
 * The main menu, the runner course, the square, the exploration world, the
 * combat maps, the mini-games and the story worlds draw neither.
 *
 * What is left is generic: a world can give its scene a sky of its own —
 *   scene.userData.skyBackdrop = a THREE.Scene (e.g. a gradient dome)
 * and install() wraps renderer.render so that sky is drawn first, with the
 * world camera's rotation and lens but none of its position (it never gets
 * closer), and the world is drawn over it with a clean depth buffer.
 * Overlay passes, off-screen renders and short-range cameras are left alone.
 * ===================================================================== */
(function () {
  const T = THREE;
  let skyCam = null;
  const _p = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color();

  const Sky = {
    enabled: true,
    /** the Mini Planet is never drawn in a sky (kept as a flag the tests read) */
    planetInSky: false,
    /** what was drawn, per world (tests): scene uuid → { name, frames, backdrop } */
    seen: new Map(), frames: 0, planetDraws: 0,
    install(renderer) {
      if (renderer.__skyPass) return;
      renderer.__skyPass = true;
      const orig = renderer.render.bind(renderer);
      renderer.render = function (scene, camera) {
        const sky = scene && scene.userData && scene.userData.skyBackdrop;
        if (!Sky.enabled || !sky || !camera || !camera.isPerspectiveCamera || camera.far < 60 || !renderer.autoClear || renderer.getRenderTarget() !== null) return orig(scene, camera);
        const bg = scene.background;
        if (bg && !bg.isColor) return orig(scene, camera);
        try { Sky.draw(renderer, orig, scene, camera, sky); }
        catch (e) { console.error('[skyPass]', e); Sky.enabled = false; renderer.autoClear = true; return orig(scene, camera); }
        scene.background = null; renderer.autoClear = false;
        try { orig(scene, camera); } finally { scene.background = bg; renderer.autoClear = true; }
      };
    },
    draw(renderer, render, scene, camera, sky) {
      if (!skyCam) skyCam = new T.PerspectiveCamera(60, 1, 0.1, 100);
      camera.updateMatrixWorld();
      camera.matrixWorld.decompose(_p, skyCam.quaternion, _s);
      skyCam.position.set(0, 0, 0);
      skyCam.projectionMatrix.copy(camera.projectionMatrix); skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      const oldC = renderer.getClearColor(_c).clone(), oldA = renderer.getClearAlpha();
      if (scene.background) renderer.setClearColor(scene.background, 1);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      render(sky, skyCam);
      renderer.clearDepth();
      renderer.setClearColor(oldC, oldA);
      Sky.frames++;
      let rec = Sky.seen.get(scene.uuid);
      if (!rec) { rec = { name: scene.name || '', frames: 0 }; Sky.seen.set(scene.uuid, rec); }
      rec.frames++; rec.t = performance.now();
    },
  };
  VR.SkyPlanet = Sky;          // (old name, still used by game.js)
  VR.SkyPass = Sky;

  /**
   * The graphics budget (v1.46): with the game's Quality set to "low", the worlds that have
   * them leave out their costly extras — sun shadows, the gradient sky dome, the far skyline
   * (the rebuilt square, the arena). Worlds register a function that applies the current
   * choice; it runs again when the setting changes (game.applySettings → VR.Gfx.changed()).
   */
  const fns = new Set();
  // the automatic step down: on "high", a world that keeps running under ~28 frames a second for a few
  // seconds turns its extras off for the rest of the session (once; a toast says so). Choosing the
  // quality yourself (settings) ends the automatic choice. (cubeexpress.gfxAuto = false: never — tests)
  let autoLite = false, userChose = false, slowT = 0, ema = 1 / 60;
  const autoOn = () => { try { return localStorage.getItem('cubeexpress.gfxAuto') !== 'false'; } catch (e) { return true; } };
  VR.Gfx = {
    get lite() { const g = VR.game; return !!(g && g.settings && g.settings.quality === 'low') || autoLite; },
    get auto() { return autoLite; },
    watch(raw, inWorld) {
      if (autoLite || userChose || !inWorld || !(raw > 0) || raw > 0.5) { slowT = 0; return; }       // (a hitch or a background tab: not counted)
      ema += (raw - ema) * 0.05;
      slowT = ema > 1 / 28 ? slowT + raw : Math.max(0, slowT - raw * 2);
      if (slowT > 4 && autoOn() && fns.size) {
        autoLite = true; VR.Gfx.changed();
        if (VR.UI && VR.UI.toast) VR.UI.toast(VR.t('gfx.auto'), 3200);
      }
    },
    userChose() { userChose = true; autoLite = false; },
    on(fn) { fns.add(fn); fn(VR.Gfx.lite); return () => fns.delete(fn); },
    changed() { for (const fn of fns) { try { fn(VR.Gfx.lite); } catch (e) { console.error('[gfx]', e); } } },
    /** shadows on / off for a scene's meshes (materials recompile once) */
    setShadows(root, on) {
      root.traverse(o => { if (!o.isMesh || o.userData.noShadow || (o.material && (o.material.transparent || o.material.isMeshBasicMaterial || o.material.isShaderMaterial))) return;
        if (o.castShadow !== on || o.receiveShadow !== on) { o.castShadow = on; o.receiveShadow = on; [].concat(o.material).forEach(m => { if (m) m.needsUpdate = true; }); } });
    },
  };
})();
