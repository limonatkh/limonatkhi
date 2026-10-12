/* The game opens: no errors, every system and registry still there, both languages work. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame, expectNoErrors, readStorage } = require('../helpers/game');
const snap = require('../helpers/snapshots');

const baseline = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'baseline', f), 'utf8'));
const missing = (was, now) => was.filter((x) => !now.includes(x));

test('boot: the main menu opens with no errors', async ({ page }) => {
  const { errors } = await openGame(page);
  const st = await page.evaluate(() => ({
    state: VR.game.state, lang: VR.lang, dir: document.documentElement.dir,
    canvas: !!document.querySelector('canvas'), menuVisible: !document.getElementById('menu')?.hidden,
  }));
  expect(st.state).toBe('menu');
  expect(st.canvas).toBe(true);
  expect(st.lang).toBe('ar');                                   // Arabic is the default
  expect(st.dir).toBe('rtl');
  expectNoErrors(errors);
});

test('boot: a first visit writes a fresh save in the current format', async ({ page }) => {
  const { errors } = await openGame(page);
  const d = await readStorage(page, 'cubeexpress.profiles');
  expect(d.version).toBe(1);
  expect(Object.keys(d.players)).toEqual(['p1']);
  expect(d.players.p1.wallet.coins).toBe(0);
  expect(await page.evaluate(() => VR.game.modes.hasSave())).toBe(false);
  expectNoErrors(errors);
});

test('boot: every system on VR is still there (tests/baseline/vr-surface.json)', async ({ page }) => {
  await openGame(page);
  const now = await page.evaluate(snap.surface), was = baseline('vr-surface.json').surface;
  for (const k in was) expect(missing(was[k], now[k]), `${k}: removed`).toEqual([]);
});

test('boot: areas, missions, worlds, weapons and items are all still registered (tests/baseline/registries.json)', async ({ page }) => {
  await openGame(page);
  const now = await page.evaluate(snap.registries), was = baseline('registries.json').registries;
  expect(now.start).toBe(was.start);
  for (const k in was) if (Array.isArray(was[k])) expect(missing(was[k], now[k]), `${k}: removed`).toEqual([]);
});

test('boot: switching language changes the page and switches back', async ({ page }) => {
  const { errors } = await openGame(page);
  const r = await page.evaluate(() => {
    const out = [];
    VR.I18N.toggle(); out.push([VR.lang, document.documentElement.dir, VR.t('menu.settings')]);
    VR.I18N.toggle(); out.push([VR.lang, document.documentElement.dir, VR.t('menu.settings')]);
    return out;
  });
  expect(r).toEqual([['en', 'ltr', 'SETTINGS'], ['ar', 'rtl', 'الإعدادات']]);
  expectNoErrors(errors);
});
