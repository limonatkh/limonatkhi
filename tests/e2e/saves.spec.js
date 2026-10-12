/* Player saves in the real game: loading old and current saves, CONTINUE, NEW GAME, reloads.
 * The saves are made-up test data (tests/fixtures/saves). */
const { test, expect } = require('@playwright/test');
const { openGame, waitState, waitFor, readStorage, expectNoErrors } = require('../helpers/game');
const { fixture, fixtureData } = require('../helpers/vm');

const KEY = 'cubeexpress.profiles';
const owned = (p) => ({                     // what a player must never lose
  coins: p.wallet.coins, upgrades: p.upgrades || {}, unlocks: p.unlocks || null,
  consumables: p.inventory.consumables || {}, loot: (p.inventory.loot || {}).items || {},
  missions: p.progress.missions, best: p.stats.best, duel: p.stats.duel,
});
const open = (page, name, o = {}) => openGame(page, Object.assign({ raw: fixture(name) }, o));

test('a v1.44 save: everything the player owns is there after opening and reopening the game', async ({ page }) => {
  const { errors } = await open(page, 'full-v144.json');
  const want = owned(fixtureData('full-v144.json')[KEY].players.p1);
  expect(owned(await page.evaluate(() => VR.Profiles.player()))).toEqual(want);
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(2750);
  await page.reload(); await waitState(page, 'menu');
  expect(owned((await readStorage(page, KEY)).players.p1)).toEqual(want);
  expectNoErrors(errors);
});

test('a v1.44 save: CONTINUE goes back into the adventure, to the square once it is open', async ({ page }) => {
  const { errors } = await open(page, 'full-v144.json');
  expect(await page.evaluate(() => VR.game.modes.hasSave())).toBe(true);
  await page.evaluate(() => VR.game.modes.enterHome());
  await waitState(page, 'adventure');
  await waitFor(page, () => VR.game.missions.run && VR.game.missions.run.def.id === 'hub');
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(2750);
  expectNoErrors(errors);
});

test('a v1.44 save: continueGame() returns to the saved area (isl1)', async ({ page }) => {
  const { errors } = await open(page, 'full-v144.json');
  await page.evaluate(() => VR.game.modes.continueGame());
  await waitState(page, 'adventure');
  await waitFor(page, () => VR.game.missions.run && VR.game.missions.run.def.id === 'isl1');
  const flags = await page.evaluate(() => [...VR.game.missions.run.flags]);
  expect(flags).toEqual(expect.arrayContaining(['boss_down', 'gate_open']));   // the player's and the world's flags
  expectNoErrors(errors);
});

test('only the old separate keys: coins, best, missions and duels are carried over', async ({ page }) => {
  const { errors } = await open(page, 'legacy-only.json');
  const p = await page.evaluate(() => VR.Profiles.player());
  expect(p.wallet.coins).toBe(1234);
  expect(p.stats.best).toBe(5821);
  expect(p.stats.duel).toEqual({ w: 4, l: 2, d: 1 });
  expect(Object.keys(p.progress.missions.completed)).toEqual(['m1']);
  expect(await page.evaluate(() => localStorage.getItem('cubeexpress.bank'))).toBe('1234.7');   // old key untouched
  expectNoErrors(errors);
});

test('a corrupt save does not stop the game from opening', async ({ page }) => {
  const { errors } = await open(page, 'corrupt.json');
  expect(await page.evaluate(() => VR.game.state)).toBe('menu');
  expectNoErrors(errors);
});

test('coins taken by an older NEW GAME come back once, and only once', async ({ page }) => {
  const { errors } = await open(page, 'backup-old-wipe.json');
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(1500);
  await page.reload(); await waitState(page, 'menu');
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(1500);
  expect((await readStorage(page, KEY + '.backup')).recovered).toBeTruthy();
  expectNoErrors(errors);
});

test('NEW GAME: starts the adventure again but keeps coins, purchases and missions', async ({ page }) => {
  const { errors } = await open(page, 'full-v144.json');
  const before = await page.evaluate(() => VR.Profiles.player());
  await page.evaluate(() => VR.game.modes.newGame());
  await waitState(page, 'adventure');
  await waitFor(page, () => VR.game.missions.run && VR.game.missions.run.def.id === VR.ADVENTURE.START);
  const after = await page.evaluate(() => VR.Profiles.player());
  for (const k of ['coins', 'upgrades', 'unlocks', 'consumables', 'missions', 'best', 'duel']) expect(owned(after)[k], k).toEqual(owned(before)[k]);
  expect(after.progress.areas.isl1).toBeUndefined();                          // the story starts over (current behaviour)
  expect((await readStorage(page, KEY + '.backup')).players.p1.wallet.coins).toBe(2750);
  expectNoErrors(errors);
});

test('progress made in an area is saved and comes back after closing the game', async ({ page }) => {
  const { errors } = await open(page, 'full-v144.json');
  await page.evaluate(() => VR.game.modes.continueGame());
  await waitFor(page, () => VR.game.state === 'adventure' && VR.game.missions.run && VR.game.missions.run.def.id === 'isl1');
  await page.evaluate(() => { VR.game.missions.run.setFlag('got_test_marker'); VR.game.toMenu(); });   // leaving saves the area
  await waitState(page, 'menu');
  await page.reload(); await waitState(page, 'menu');
  const d = await readStorage(page, KEY), p = d.players.p1;
  // personal flags (got_…) stay with the player; the others are saved with the world (current behaviour)
  expect(p.progress.areas.isl1.flags).toContain('got_test_marker');
  expect([...p.progress.areas.isl1.flags, ...d.world.isl1.flags]).toEqual(expect.arrayContaining(['boss_down', 'gate_open', 'got_test_marker']));
  expect(p.location.area).toBe('isl1');
  expect(p.wallet.coins).toBe(2750);
  expectNoErrors(errors);
});
