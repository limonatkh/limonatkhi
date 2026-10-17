/* =====================================================================
 * MAP CHOICE (v1.44.3) — which square and which combat map are used.
 *
 *   hub    1 = the square as it always was (default)
 *          2 = Lemon Square rebuilt (js/adventure/hubworld.js)
 *          Settings → "Square map". It changes where things stand (gates,
 *          portals, the sky-island gates…), so it is read once when the
 *          game loads: changing it reloads the game (from the menu), or
 *          waits until you are back in the menu.
 *   arena  1 = the arena as it always was (default)
 *          2 = Lemon Works (js/duel/arena2.js)
 *          Fight menu → "Map". Read when a match starts; in an online match
 *          the inviter's map is used by both players.
 * Saved on this device.
 * ===================================================================== */
(function () {
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* private window */ } };
  const KH = 'cubeexpress.mapHub', KA = 'cubeexpress.mapArena';
  const q = (n) => { try { const m = location.search.match(new RegExp('[?&]' + n + '=(\\d)')); return m ? +m[1] : 0; } catch (e) { return 0; } };
  const pick = (v) => (+v === 2 ? 2 : 1);
  const M = VR.MapChoice = {
    hub: pick(q('hubmap') || get(KH)),            // fixed for this visit (see above)
    arena: pick(q('arenamap') || get(KA)),
    wantHub: null,                                // a change waiting for the menu
    setArena(v) { this.arena = pick(v); set(KA, this.arena); },
    setHub(v) { v = pick(v); set(KH, v); this.wantHub = v === this.hub ? null : v; },
    /** the hub's next value (what the setting shows) */
    get nextHub() { return this.wantHub || this.hub; },
  };
  Object.assign(VR.I18N.STRINGS.en, { 'settings.hubMap': 'Square map', 'map.one': 'MAP 1', 'map.two': 'MAP 2',
    'map.hubLater': 'The square changes when you are back in the main menu.', 'fm.map': 'Map:', 'fm.map1': 'Map 1', 'fm.map2': 'Map 2 · Lemon Works' });
  Object.assign(VR.I18N.STRINGS.ar, { 'settings.hubMap': 'خريطة الساحة', 'map.one': 'ماب ١', 'map.two': 'ماب ٢',
    'map.hubLater': 'الساحة بتتغيّر لما ترجع للقائمة الرئيسية.', 'fm.map': 'الخريطة:', 'fm.map1': 'ماب ١', 'fm.map2': 'ماب ٢ · مصنع الليمون' });

  /** the settings button: MAP 1 / MAP 2 */
  function paint() {
    const b = document.getElementById('optHubMap'); if (!b) return;
    const two = M.nextHub === 2;
    b.textContent = VR.t(two ? 'map.two' : 'map.one'); b.setAttribute('aria-pressed', two ? 'true' : 'false');
  }
  /** the game is not inside a world (the main menu, or Settings opened from it): reload now */
  function inMenu(g) { return g && (g.state === 'menu' || (g.state === 'settings' && g.settingsReturn === 'menu')); }
  function reload() { try { VR.Profiles && VR.Profiles.save && VR.Profiles.save(); } catch (e) { /* ignore */ } location.reload(); }
  window.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('optHubMap'); if (!b) return;
    paint();
    if (VR.I18N.onChange) VR.I18N.onChange(paint);
    b.addEventListener('click', () => {
      if (VR.Audio) VR.Audio.play('click');
      M.setHub(M.nextHub === 2 ? 1 : 2);
      paint();
      if (M.wantHub && !inMenu(VR.game)) VR.UI.toast(VR.t('map.hubLater'), 2200);
    });
  });
  // the square a saved place belongs to: the map the square was last entered with
  const KL = 'cubeexpress.mapHubLast';
  M.hubChanged = () => pick(get(KL) || 1) !== M.hub;
  M.hubEntered = () => set(KL, M.hub);
  /** game.js calls this when it shows the main menu */
  M.menuShown = function () { if (M.wantHub) setTimeout(reload, 0); };
})();
