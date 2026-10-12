/* Moving between the game's modes: menu → adventure areas → runner course → planet → menu. */
const { test, expect } = require('@playwright/test');
const { openGame, waitState, waitFor, toMenu, expectNoErrors } = require('../helpers/game');
const { fixture } = require('../helpers/vm');

const inArea = (page, id) => waitFor(page, (a) => VR.game.state === 'adventure' && !!VR.game.missions.run && VR.game.missions.run.def.id === a, id);

test('PLAY on a first visit starts a new adventure in the start area', async ({ page }) => {
  const { errors } = await openGame(page);
  await page.locator('#continueBtn').click();
  await inArea(page, await page.evaluate(() => VR.ADVENTURE.START));
  expect(await page.evaluate(() => VR.game.modes.mode)).toBe('adventure');
  expect(await page.evaluate(() => VR.game.modes.hasSave())).toBe(true);
  await toMenu(page);
  expect(await page.evaluate(() => VR.game.modes.mode)).toBe('menu');
  expectNoErrors(errors);
});

test('every area of the adventure opens and goes back to the menu', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  const areas = await page.evaluate(() => Object.keys(VR.ADVENTURE.areas));
  expect(areas.length).toBeGreaterThanOrEqual(8);
  for (const id of areas) {
    await page.evaluate((a) => VR.game.modes.enterAdventure(a, { intro: false }), id);
    await inArea(page, id);
    await toMenu(page);
  }
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(2750);
  expectNoErrors(errors);
});

test('a portal between areas: travel() fades out and arrives in the other area', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  await page.evaluate(() => VR.game.modes.enterAdventure('hub', { intro: false }));
  await inArea(page, 'hub');
  expect(await page.evaluate(() => VR.game.modes.travel('explore'))).toBe(true);
  await inArea(page, 'explore');
  await toMenu(page);                                                       // leaving saves where you are
  expect(await page.evaluate(() => VR.Profiles.player().location.area)).toBe('explore');
  expectNoErrors(errors);
});

test('the runner portal: adventure → course → back to the same place', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  await page.evaluate(() => VR.game.modes.enterAdventure('hub', { intro: false }));
  await inArea(page, 'hub');
  const at = { area: 'hub', pos: [1, 0.05, -3], yaw: 0.5 };
  expect(await page.evaluate((a) => VR.game.modes.enterCourse(a), at)).toBe(true);
  await waitState(page, 'playing');
  expect(await page.evaluate(() => [VR.game.modes.mode, VR.game.courseFrom])).toEqual(['runner', 'adventure']);
  await page.evaluate(() => VR.game.modes.backFromCourse());
  await inArea(page, 'hub');
  expect(await page.evaluate(() => VR.Profiles.player().location)).toMatchObject(at);
  expectNoErrors(errors);
});

test('the Mini Planet: menu → planet → its portal → menu', async ({ page }) => {
  const { errors } = await openGame(page);
  expect(await page.evaluate(() => VR.game.modes.enterPlanet())).toBe(true);
  await inArea(page, 'planet');
  expect(await page.evaluate(() => VR.game.modes.leavePlanet())).toBe(true);
  await waitState(page, 'menu');
  expectNoErrors(errors);
});

test('the runner from the menu: start → crash → result screen → menu', async ({ page }) => {
  const { errors } = await openGame(page);
  await page.evaluate(() => VR.game.start());
  await waitState(page, 'playing');
  await page.evaluate(() => VR.game.gameOver());
  await waitState(page, 'gameover');
  await toMenu(page);
  expectNoErrors(errors);
});
