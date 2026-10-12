/* KNOWN BUG (v1.44), documented here and NOT fixed in this branch.
 *
 * The translation key `lt.got` is defined twice:
 *   js/explore/loot.js   'Found: {list}'      / 'وجدت: {list}'     (a chest you open in the world)
 *   js/duel/powers.js    'Picked up: {name}'  / 'التقطت: {name}'   (a power picked up in a duel)
 * powers.js loads later and wins, so opening a loot chest shows the literal text "{name}"
 * instead of what was found.
 *
 * These tests describe the CORRECT behaviour and are marked test.fail(): they pass (green) while
 * the bug is there. When the bug is fixed (in its own PR, with approval) they start "failing"
 * with "expected to fail" — then remove test.fail() and move them to tests/e2e/. */
const { test, expect } = require('@playwright/test');
const { openGame } = require('../helpers/game');

test.describe('known issue: lt.got defined twice (loot chest shows "{name}")', () => {
  for (const lang of ['ar', 'en']) {
    test(`a loot chest names what was found (${lang})`, async ({ page }) => {
      test.fail(true, 'known bug: js/duel/powers.js overrides lt.got from js/explore/loot.js');
      await openGame(page);
      const text = await page.evaluate((l) => { VR.I18N.set(l); return VR.t('lt.got', { list: 'TEST_ITEM' }); }, lang);
      expect(text).toContain('TEST_ITEM');
      expect(text).not.toContain('{name}');
    });
  }
  test('a power picked up in a duel still names it (must keep working after the fix)', async ({ page }) => {
    await openGame(page);
    // documents what the duel shows today, so a fix of the chest does not break the duel
    const text = await page.evaluate(() => VR.t('lt.got', { name: 'TEST_POWER' }));
    expect(text).toContain('TEST_POWER');
  });
});
