/* The mini-games behind the square's gates, and standing in each area of the world. */
const { test, expect } = require('@playwright/test');
const { openGame, waitState, waitFor, toMenu, expectNoErrors } = require('../helpers/game');
const { fixture } = require('../helpers/vm');

const inArea = (page, id) => waitFor(page, (a) => VR.game.state === 'adventure' && !!VR.game.missions.run && VR.game.missions.run.def.id === a, id);

for (const id of ['billiards', 'basketball']) {
  test(`mini-game ${id}: square gate → the game → back in front of the gate`, async ({ page }) => {
    const { errors } = await openGame(page, { raw: fixture('full-v144.json') });
    expect(await page.evaluate((m) => VR.MiniGames.has(m), id)).toBe(true);
    await page.evaluate(() => VR.game.modes.enterAdventure('hub', { intro: false }));
    await inArea(page, 'hub');
    const gate = { area: 'hub', pos: [3, 0.05, -8], yaw: 0.2 };
    await page.evaluate(([m, at]) => VR.game.hubAction(m, at, m), [id, gate]);
    await waitState(page, 'mini');
    expect(await page.evaluate(() => VR.game.mini.id)).toBe(id);
    await page.evaluate(() => VR.game.mini.leave());
    await inArea(page, 'hub');
    const pos = await page.evaluate(() => { const p = VR.game.missions.ctrl.pos; return [p.x, p.z]; });
    expect(pos[0]).toBeCloseTo(gate.pos[0], 0);
    expect(pos[1]).toBeCloseTo(gate.pos[2], 0);
    expect(await page.evaluate(() => VR.Wallet.of().coins)).toBe(2750);       // leaving before playing pays and takes nothing
    expectNoErrors(errors);
  });
}

test('every area: the player starts on solid ground (does not fall out of the world)', async ({ page }) => {
  const { errors } = await openGame(page);
  const areas = await page.evaluate(() => Object.keys(VR.ADVENTURE.areas));
  for (const id of areas) {
    await page.evaluate((a) => VR.game.modes.enterAdventure(a, { intro: false }), id);
    await inArea(page, id);
    await waitFor(page, () => VR.game.missions.ctrl && VR.game.missions.ctrl.grounded === true);
    const y0 = await page.evaluate(() => VR.game.missions.ctrl.pos.y);
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ y: VR.game.missions.ctrl.pos.y, grounded: VR.game.missions.ctrl.grounded, area: VR.game.missions.run.def.id }));
    expect(st.area, id).toBe(id);
    expect(Math.abs(st.y - y0), `${id}: still standing`).toBeLessThan(0.5);
    await toMenu(page);
  }
  expectNoErrors(errors);
});
