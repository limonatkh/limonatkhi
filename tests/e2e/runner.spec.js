/* The runner course (third person). */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame, waitState, waitFor, toMenu, expectNoErrors } = require('../helpers/game');
const snap = require('../helpers/snapshots');

const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'baseline', 'runner.json'), 'utf8')).seeds;

test('the course built from a seed is the same as in v1.44 (tests/baseline/runner.json)', async ({ page }) => {
  const { errors } = await openGame(page);
  for (const seed of snap.RUNNER_SEEDS) {
    expect(await page.evaluate(snap.runner, seed), `seed ${seed}`).toEqual(base[seed]);
  }
  expectNoErrors(errors);
});

test('running: the runner moves forward, and the arrow keys change lane', async ({ page }) => {
  const { errors } = await openGame(page);
  await page.evaluate(() => VR.game.start());
  await waitState(page, 'playing');
  await waitFor(page, () => VR.game.distance > 3);
  const lane = await page.evaluate(() => VR.game.player.lane);
  const key = lane > 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.press(key);
  await waitFor(page, (l) => VR.game.player.lane !== l, lane);
  expect(await page.evaluate(() => VR.game.player.lane)).toBe(lane + (key === 'ArrowLeft' ? -1 : 1));
  expectNoErrors(errors);
});

test('a crash pays the coins of the run into the wallet, once', async ({ page }) => {
  const { errors } = await openGame(page);
  await page.evaluate(() => VR.game.start());
  await waitState(page, 'playing');
  const before = await page.evaluate(() => VR.Wallet.of().coins);
  await page.evaluate(() => { VR.game.coins = Math.max(VR.game.coins, 0) + 37; });
  const run = await page.evaluate(() => Math.floor(VR.game.coins) - (VR.game.banked || 0));
  await page.evaluate(() => VR.game.gameOver());
  await waitState(page, 'gameover');
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(before + run);
  await page.evaluate(() => VR.game.bankRun());                              // asking again pays nothing more
  await toMenu(page);
  expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(before + run);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubeexpress.profiles')).players.p1.wallet.coins)).toBe(before + run);
  expectNoErrors(errors);
});

test('pause and resume during a run', async ({ page }) => {
  const { errors } = await openGame(page);
  await page.evaluate(() => VR.game.start());
  await waitState(page, 'playing');
  await page.evaluate(() => VR.game.pause());
  await waitState(page, 'paused');
  const d = await page.evaluate(() => VR.game.distance);
  await page.waitForTimeout(300);                                          // paused: the runner must not move
  expect(await page.evaluate(() => VR.game.distance)).toBe(d);
  await page.evaluate(() => VR.game.resume());
  await waitFor(page, (x) => VR.game.state === 'playing' && VR.game.distance > x, d);
  expectNoErrors(errors);
});
