/* Fighting: a duel against a computer bot (the arena), and the fights in the island areas. */
const { test, expect } = require('@playwright/test');
const { openGame, waitState, waitFor, toMenu, expectNoErrors } = require('../helpers/game');
const { fixture } = require('../helpers/vm');

async function intoFight(page) {
  expect(await page.evaluate(() => VR.game.duel.startBots({ bots: 1, diff: 'normal' }))).toBe(true);
  await waitState(page, 'duel');
  await waitFor(page, () => VR.game.duel.match && VR.game.duel.match.phase === 'wait');
  await page.evaluate(() => VR.game.duel.buyReady());                          // the buy screen: "ready"
  await waitFor(page, () => VR.game.duel.match.phase === 'fight');
}

test('duel vs a bot: buy → fight → hit the bot → round won', async ({ page }) => {
  const { errors } = await openGame(page);
  await intoFight(page);
  await page.evaluate(() => { const d = VR.game.duel; d.hostBotHit(d.bots.list[0], 1000, true, d.match.me, 'sniper'); });
  await waitFor(page, () => VR.game.duel.match.sc.h === 1);
  expect(await page.evaluate(() => VR.game.duel.bots.list[0].alive)).toBe(false);
  expectNoErrors(errors);
});

test('duel vs a bot: getting hit lowers the player health', async ({ page }) => {
  const { errors } = await openGame(page);
  await intoFight(page);
  await page.evaluate(() => { const d = VR.game.duel; d.applyHit(d.match.me, 30, false, 'g', 0, 'pistol'); });
  const hp = await page.evaluate(() => VR.game.duel.match.hp[VR.game.duel.match.me]);
  expect(hp).toBeLessThan(100);
  expect(hp).toBeGreaterThan(0);
  expectNoErrors(errors);
});

test('duel vs a bot: a won match pays its reward once and counts the win', async ({ page }) => {
  const { errors } = await openGame(page);
  await intoFight(page);
  const reward = await page.evaluate(() => VR.DuelBots.DIFF.normal.reward);
  await page.evaluate(() => VR.game.duel.onMatchEnd({ h: 2, g: 0 }, null));
  await waitFor(page, () => VR.game.duel.match.over && !!VR.game.duel.match.result);
  expect(await page.evaluate(() => VR.game.duel.match.result)).toEqual({ win: true, reward });
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(reward);
  expect(await page.evaluate(() => VR.Profiles.player().stats.bots.normal)).toEqual({ w: 1, l: 0, d: 0 });
  await page.evaluate(() => VR.game.duel.onMatchEnd({ h: 2, g: 0 }, null));    // a second "end" changes nothing
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(reward);
  await page.evaluate(() => VR.game.duel.leave());
  await waitState(page, 'menu');
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(reward);
  expectNoErrors(errors);
});

test('duel vs a bot: forfeiting pays nothing; quitting to the menu cleans the arena up', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  await intoFight(page);
  await page.evaluate(() => VR.game.duel.forfeit());
  await waitFor(page, () => VR.game.duel.match.over);
  expect(await page.evaluate(() => VR.game.duel.match.result.reward)).toBe(0);
  await toMenu(page);
  expect(await page.evaluate(() => VR.game.duel.match)).toBeNull();
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(2750);
  expectNoErrors(errors);
});

test('island fights: an island area starts its combat system with the player\'s health', async ({ page }) => {
  const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
  for (const id of ['isl1', 'isl2']) {
    await page.evaluate((a) => VR.game.modes.enterAdventure(a, { intro: false }), id);
    await waitFor(page, (a) => VR.game.state === 'adventure' && VR.game.missions.run && VR.game.missions.run.def.id === a, id);
    const c = await page.evaluate(() => { const cb = VR.game.missions.combat; return cb ? { has: true, hp: cb.health && cb.health.hp, max: cb.health && cb.health.max } : { has: false }; });
    expect(c.has, `${id} has a combat system`).toBe(true);
    expect(c.hp).toBeGreaterThan(0);
    const after = await page.evaluate(() => { const h = VR.game.missions.combat.health; h.invuln = 0; h.damage(10); return h.hp; });
    expect(after).toBe(c.hp - 10);
    await toMenu(page);
  }
  expectNoErrors(errors);
});
