/* Writes tests/baseline/*.json from the game as it is now: `npm run baseline`.
 * Run it only to record a change that is ON PURPOSE (and say so in the PR). */
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame } = require('../helpers/game');
const snap = require('../helpers/snapshots');

const out = (name, about, data) => {
  const f = path.join(__dirname, '..', 'baseline', name);
  fs.writeFileSync(f, JSON.stringify(Object.assign({ about }, data), null, 2) + '\n');
};

test('write the browser baselines', async ({ page }) => {
  await openGame(page);
  out('vr-surface.json', 'Systems on the global VR and the functions of the main ones (v1.44). Things may be added; nothing listed may disappear.', { surface: await page.evaluate(snap.surface) });
  out('registries.json', 'Areas, mission worlds, mission parts, missions, weapons, shop and loot items, languages (v1.44). Things may be added; nothing listed may disappear.', { registries: await page.evaluate(snap.registries) });
  const runs = {};
  for (const s of snap.RUNNER_SEEDS) runs[s] = await page.evaluate(snap.runner, s);
  out('runner.json', 'The runner course for fixed seeds (v1.44): chunks and obstacles. Must stay the same unless the course is changed on purpose.', { seeds: runs });
});
