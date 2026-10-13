/* =====================================================================
 * SOUND BANK (v1.46) — the game's sound identity, in one place.
 * ---------------------------------------------------------------------
 * Modern, clean, competitive: every sound is short, has a clear attack (a
 * snap of high noise), a body (a pitch-dropping thump or a filtered noise)
 * and, for the big ones, a short tail. All original, synthesised in the
 * browser (js/audio.js): no files, nothing to license.
 *
 * Loaded after every module that defines its own first sounds, so the
 * names stay the same everywhere (the game code did not change: only how
 * each name sounds). Families:
 *   weapons    pistol revolver smg rifle dmr lmg shotgun sniper sniperFar knife bow spear enemyShot
 *   handling   reload empty scope throw fbSwitch
 *   hits       hitmark headshot fbKill fbArmor hurt enemyDown
 *   impacts    fbImpStone fbImpMetal fbImpWood fbImpSoft
 *   movement   fbStep* runStep* fbLand1-3 jump land slide dodge fpStep step
 *   match      countTick roundStart roundWin roundLose matchWin matchLose
 *   interface  click button buzz page pickup uiOpen uiClose uiConfirm uiNotice
 *   world      portal gate zoneEnter
 * Levels: weapons loudest, hits right behind them (they must cut through),
 * steps clear but small, interface soft (js/audio.js mixes the groups and
 * ducks the music and ambience under the fight).
 * ===================================================================== */
(function () {
  const A = VR.Audio; if (!A || !A.define) return;
  const D = (name, fn) => A.define(name, fn);
  const ARP = (k, base, steps, type, vol, gap, dur) => steps.forEach((s, i) => k.tone(base * Math.pow(2, s / 12), dur, type, vol, null, i * gap));

  // ---------------------------------------------------------------- weapons
  D('pistol', (k) => { k.snap(0.34, 0, 4200, 0.02); k.noise(0.09, 0.38, 3200); k.thump(150, 0.32, 0.09); k.band(0.13, 0.1, 1400, 0.01); });
  D('revolver', (k) => { k.snap(0.42, 0, 3800, 0.024); k.noise(0.16, 0.48, 2600); k.thump(110, 0.42, 0.16); k.band(0.32, 0.1, 900, 0.02); });
  D('smg', (k) => { k.snap(0.24, 0, 5200, 0.014); k.noise(0.05, 0.27, 4400); k.thump(185, 0.18, 0.05); });
  D('rifle', (k) => { k.snap(0.3, 0, 4600, 0.018); k.noise(0.08, 0.34, 3600); k.thump(140, 0.26, 0.08); k.band(0.15, 0.08, 1600, 0.01); });
  D('dmr', (k) => { k.snap(0.38, 0, 4400, 0.022); k.noise(0.14, 0.42, 3300); k.thump(115, 0.36, 0.14); k.band(0.26, 0.1, 1100, 0.02); });
  D('lmg', (k) => { k.snap(0.28, 0, 3900, 0.02); k.noise(0.07, 0.33, 2800); k.thump(105, 0.3, 0.08); });
  D('shotgun', (k) => { k.snap(0.44, 0, 3000, 0.03); k.noise(0.24, 0.58, 2000); k.thump(88, 0.5, 0.2); k.band(0.36, 0.12, 700, 0.03); });
  D('sniper', (k) => {
    k.snap(0.5, 0, 5200, 0.026); k.noise(0.18, 0.52, 4000); k.thump(78, 0.5, 0.26); k.tone(1400, 0.05, 'square', 0.04);
    k.band(0.6, 0.12, 800, 0.04); k.noise(0.55, 0.05, 1200, 0.14);                       // the echo off the walls
  });
  D('sniperFar', (k) => { k.snap(0.34, 0, 6200, 0.02); k.noise(0.32, 0.24, 1400, 0.05); k.thump(68, 0.3, 0.3, 0.05); });
  D('enemyShot', (k) => { k.snap(0.24, 0, 3600, 0.018); k.noise(0.08, 0.28, 2600); k.thump(165, 0.2, 0.08); });
  D('knife', (k) => { k.snap(0.16, 0, 6000, 0.09); k.tone(1300, 0.05, 'triangle', 0.05, 600); });
  D('bow', (k) => { k.tone(200, 0.1, 'triangle', 0.16, 80); k.snap(0.12, 0, 2500, 0.06); k.band(0.12, 0.06, 1200, 0.03); });
  D('spear', (k) => { k.band(0.16, 0.24, 3000); k.tone(300, 0.1, 'sawtooth', 0.05, 140); });

  // ---------------------------------------------------------------- handling
  D('reload', (k) => {
    k.band(0.05, 0.24, 2200); k.tone(700, 0.03, 'square', 0.05, null, 0.02);           // the magazine out
    k.band(0.06, 0.24, 1500, 0.42); k.snap(0.2, 0.48, 3200, 0.02); k.thump(300, 0.12, 0.04, 0.5);   // in, and the slide
  });
  D('empty', (k) => { k.tone(1500, 0.025, 'square', 0.05); k.snap(0.07, 0.02, 3000, 0.015); });
  D('scope', (k) => { k.tone(1100, 0.03, 'sine', 0.06); k.snap(0.05, 0, 4000, 0.015); });
  D('throw', (k) => { k.band(0.16, 0.18, 1800); });
  D('fbSwitch', (k) => { k.band(0.05, 0.14, 2200); k.tone(900, 0.03, 'square', 0.035, null, 0.05); });

  // ---------------------------------------------------------------- hits (they must be heard over the shots)
  D('hitmark', (k) => { k.tone(2100, 0.035, 'triangle', 0.15); k.snap(0.12, 0, 6000, 0.012); });
  D('headshot', (k) => { k.tone(2600, 0.05, 'triangle', 0.16); k.tone(3900, 0.09, 'sine', 0.11, null, 0.035); k.snap(0.15, 0, 7000, 0.015); });
  D('fbKill', (k) => { k.tone(1320, 0.08, 'triangle', 0.14); k.tone(1980, 0.17, 'triangle', 0.13, null, 0.06); k.thump(160, 0.18, 0.12); });
  D('fbArmor', (k) => { k.tone(2400, 0.06, 'square', 0.045, 1700); k.band(0.08, 0.2, 6000); });
  D('hurt', (k) => { k.thump(130, 0.4, 0.14); k.noise(0.12, 0.2, 700); k.band(0.1, 0.07, 1200); });
  D('enemyDown', (k) => { k.tone(700, 0.08, 'triangle', 0.12, 300); k.thump(140, 0.2, 0.15, 0.04); });

  // ---------------------------------------------------------------- impacts (heard from where the bullet lands)
  D('fbImpStone', (k) => { k.snap(0.12, 0, 3000, 0.03); k.noise(0.05, 0.1, 1800); });
  D('fbImpMetal', (k) => { k.tone(2400 + Math.random() * 900, 0.07, 'triangle', 0.05, 1700); k.snap(0.1, 0, 6000, 0.02); });
  D('fbImpWood', (k) => { k.tone(260, 0.05, 'triangle', 0.08, 180); k.band(0.06, 0.14, 900); });
  D('fbImpSoft', (k) => { k.noise(0.07, 0.1, 600); });

  // ---------------------------------------------------------------- movement (clear, small; an opponent's steps tell you where they are)
  D('fbStepStone', (k) => { k.snap(0.05, 0, 2400, 0.02); k.noise(0.04, 0.07, 700); k.thump(95, 0.05, 0.04); });
  D('fbStepSoft', (k) => { k.noise(0.06, 0.07, 420); k.thump(80, 0.04, 0.05); });
  D('fbStepWood', (k) => { k.tone(190, 0.05, 'triangle', 0.06, 150); k.band(0.04, 0.08, 900); });
  D('fbStepMetal', (k) => { k.tone(620, 0.05, 'triangle', 0.04, 520); k.snap(0.05, 0, 5000, 0.02); k.band(0.06, 0.06, 2600); });
  D('runStep', (k) => { k.snap(0.06, 0, 2400, 0.02); k.noise(0.06, 0.1, 800); k.thump(95, 0.1, 0.05); });
  D('runStepWood', (k) => { k.tone(170, 0.06, 'triangle', 0.09, 120); k.band(0.05, 0.1, 1000); k.snap(0.04, 0, 2400, 0.015); });
  D('fbLand1', (k) => { k.thump(120, 0.14, 0.07); k.noise(0.07, 0.12, 600); });
  D('fbLand2', (k) => { k.thump(100, 0.22, 0.12); k.noise(0.12, 0.2, 500); k.snap(0.05, 0, 2000, 0.02); });
  D('fbLand3', (k) => { k.thump(70, 0.32, 0.25); k.noise(0.25, 0.36, 420); k.band(0.3, 0.1, 300, 0.03); });
  D('fpStep', (k) => { k.noise(0.04, 0.06, 600); k.snap(0.03, 0, 2400, 0.015); });
  D('slide', (k) => { k.band(0.32, 0.12, 1800); k.noise(0.3, 0.05, 600); });
  D('dodge', (k) => { k.band(0.08, 0.08, 2800); });

  // ---------------------------------------------------------------- the match
  D('countTick', (k) => { k.tone(880, 0.07, 'sine', 0.14); k.snap(0.05, 0, 5000, 0.01); });
  D('roundStart', (k) => { k.tone(660, 0.1, 'sine', 0.12); k.tone(1320, 0.26, 'triangle', 0.12, null, 0.08); k.band(0.3, 0.08, 2500, 0.06); });
  D('roundWin', (k) => { ARP(k, 523, [0, 4, 7, 12], 'triangle', 0.11, 0.07, 0.16); k.tone(2093, 0.4, 'sine', 0.05, null, 0.28); });
  D('roundLose', (k) => { ARP(k, 392, [7, 3, 0], 'triangle', 0.1, 0.11, 0.2); k.thump(110, 0.14, 0.3, 0.22); });
  D('matchWin', (k) => { ARP(k, 523, [0, 4, 7, 12, 16, 19, 24], 'triangle', 0.1, 0.08, 0.22); k.thump(130, 0.2, 0.3); k.band(0.8, 0.06, 4000, 0.3); });
  D('matchLose', (k) => { ARP(k, 330, [7, 5, 3, 0], 'triangle', 0.1, 0.16, 0.3); k.thump(90, 0.18, 0.5, 0.45); });

  // ---------------------------------------------------------------- interface (soft: it never covers the game)
  D('click', (k) => { k.tone(1250, 0.025, 'sine', 0.09); k.snap(0.035, 0, 5000, 0.01); });
  D('button', (k) => { k.tone(900, 0.04, 'sine', 0.1); k.snap(0.05, 0, 4000, 0.012); });
  D('buzz', (k) => { k.tone(220, 0.12, 'triangle', 0.12, 180); k.tone(165, 0.16, 'triangle', 0.1, 140, 0.08); });
  D('page', (k) => { k.band(0.1, 0.08, 4000); });
  D('pickup', (k) => { k.tone(880, 0.06, 'triangle', 0.1); k.tone(1320, 0.1, 'triangle', 0.09, null, 0.05); });
  D('uiOpen', (k) => { k.band(0.12, 0.07, 2200); k.tone(700, 0.08, 'sine', 0.06, 1050); });
  D('uiClose', (k) => { k.band(0.1, 0.06, 1600); k.tone(900, 0.07, 'sine', 0.05, 600); });
  D('uiConfirm', (k) => { k.tone(988, 0.06, 'sine', 0.09); k.tone(1480, 0.1, 'sine', 0.08, null, 0.05); });
  D('uiNotice', (k) => { k.tone(1175, 0.08, 'sine', 0.07); k.tone(1568, 0.12, 'sine', 0.05, null, 0.07); });

  // ---------------------------------------------------------------- the world
  D('portal', (k) => { k.tone(180, 0.7, 'sine', 0.16, 720); k.band(0.7, 0.1, 2600); k.tone(1047, 0.35, 'triangle', 0.06, null, 0.3); k.tone(1568, 0.3, 'sine', 0.04, null, 0.4); });
  D('gate', (k) => { k.thump(70, 0.22, 0.6); k.band(1.0, 0.12, 500); k.noise(0.8, 0.05, 300, 0.1); });
  D('zoneEnter', (k) => { k.tone(784, 0.2, 'sine', 0.06); k.tone(1175, 0.3, 'sine', 0.05, null, 0.1); });

  VR.SoundBank = { version: 1 };
})();
