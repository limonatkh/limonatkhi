/* Missions: played from the missions list and through a door in the world; rewards paid once. */
const { test, expect } = require('@playwright/test');
const { openGame, waitState, waitFor, expectNoErrors } = require('../helpers/game');
const { fixture } = require('../helpers/vm');

const runState = (page, s) => waitFor(page, (x) => !!VR.game.missions.run && VR.game.missions.run.state === x, s);

async function playM1(page) {
  await page.evaluate(() => VR.game.playMissionFromMenu('m1'));
  await waitState(page, 'mission');
  await waitFor(page, () => VR.game.missions.run && VR.game.missions.run.def.id === 'm1');
  await page.evaluate(() => VR.game.missions.startActive());
  await runState(page, 'active');
  await page.evaluate(() => VR.game.missions.run.setFlag('got_golden_lemon'));   // the mission's success flag
  await runState(page, 'objective_completed');
  const summary = await page.evaluate(() => VR.game.missions.run.rewardSummary);
  await page.evaluate(() => VR.game.missions.finish(true));                     // "continue" on the results screen
  await waitState(page, 'missionsList');
  return summary;
}

test('mission 1 from the missions list: complete → rewards paid once → back to the list', async ({ page }) => {
  const { errors } = await openGame(page);
  const s1 = await playM1(page);
  expect(s1).toMatchObject({ coins: 50, score: 1500, firstTime: true });
  const p = await page.evaluate(() => VR.Profiles.player());
  expect(p.wallet.coins).toBe(50);
  expect(p.progress.missions.completed.m1).toBeTruthy();
  expect(p.wallet.ledger.filter((e) => e.id === s1.txId)).toHaveLength(1);
  // playing it again: the repeat reward only (no coins), the first reward is not paid again
  const s2 = await playM1(page);
  expect(s2.firstTime).toBe(false);
  expect(s2.coins).toBe(0);
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(50);
  expectNoErrors(errors);
});

test('leaving a mission before the end pays nothing and keeps the save as it was', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  await page.evaluate(() => VR.game.playMissionFromMenu('m3'));
  await waitState(page, 'mission');
  await page.evaluate(() => VR.game.missions.startActive());
  await runState(page, 'active');
  await page.evaluate(() => VR.game.missions.leave());
  await waitState(page, 'missionsList');
  const p = await page.evaluate(() => VR.Profiles.player());
  expect(p.wallet.coins).toBe(2750);
  expect(p.progress.missions.completed.m3).toBeUndefined();
  expectNoErrors(errors);
});

test('a mission door in the world: adventure → mission → back in front of the door', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  await page.evaluate(() => VR.game.modes.enterAdventure('hub', { intro: false }));
  await waitFor(page, () => VR.game.state === 'adventure' && VR.game.missions.run && VR.game.missions.run.def.id === 'hub');
  const door = { area: 'hub', pos: [2, 0.05, -6], yaw: 1 };
  expect(await page.evaluate((d) => VR.game.modes.enterMission('m2', d), door)).toBe(true);
  await waitFor(page, () => VR.game.state === 'mission' && VR.game.missions.run && VR.game.missions.run.def.id === 'm2');
  await page.evaluate(() => VR.game.missions.startActive());
  await runState(page, 'active');
  await page.evaluate(() => VR.game.missions.leave());
  await waitFor(page, () => VR.game.state === 'adventure' && VR.game.missions.run && VR.game.missions.run.def.id === 'hub');
  expect(await page.evaluate(() => VR.Profiles.player().location)).toMatchObject(door);
  expectNoErrors(errors);
});

test('every mission in the list opens its world and can be left', async ({ page }) => {
  const { errors } = await openGame(page);
  const ids = await page.evaluate(() => VR.MISSIONS.map((m) => m.id));
  for (const id of ids) {
    await page.evaluate((m) => VR.game.playMissionFromMenu(m), id);
    await waitFor(page, (m) => VR.game.state === 'mission' && VR.game.missions.run && VR.game.missions.run.def.id === m, id);
    await page.evaluate(() => VR.game.missions.startActive());
    await runState(page, 'active');
    await page.evaluate(() => VR.game.missions.leave());
    await waitState(page, 'missionsList');
  }
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(0);
  expectNoErrors(errors);
});
