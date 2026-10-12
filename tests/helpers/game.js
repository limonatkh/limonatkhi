/* Shared helpers for the browser tests.
 * The tests drive the real game through the global `VR` (VR.game, VR.Profiles…), the same way a
 * player's actions end up calling it. Nothing in the game is changed for the tests. */
const { expect } = require('@playwright/test');

const URL_DEFAULT = '/index.html?menu=1&wx=calm';   // ?menu=1 stays on the main menu, wx=calm keeps the weather still
const PREFIX = 'cubeexpress.';

/**
 * Open the game.
 *   storage   { key: value } put into localStorage before the game starts (values are JSON-encoded,
 *             except strings given with raw: true). Applied once per test, not again on reload.
 *   online    false by default: the tests never talk to the internet (the game's own setting)
 *   query     extra URL text
 */
async function openGame(page, { storage = {}, raw = {}, online = false, query = '', wait = 'menu' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push('console: ' + m.text()); });
  // no traffic leaves the machine (multiplayer brokers, video API…)
  await page.route(/^(?!http:\/\/localhost)/, (r) => r.abort());

  const seed = {};
  for (const k in storage) seed[k] = JSON.stringify(storage[k]);
  Object.assign(seed, raw);
  if (!online && !('cubeexpress.settings' in seed)) seed['cubeexpress.settings'] = JSON.stringify({ online: false });
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('__seeded')) return;           // reloads keep what the game saved
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    for (const k in data) localStorage.setItem(k, data[k]);
  }, seed);

  await page.goto(URL_DEFAULT + query);
  if (wait) await waitState(page, wait);
  return { errors };
}

function isNetworkNoise(text) {
  return /net::ERR_|WebSocket|Failed to load resource|mqtt|ERR_FAILED/i.test(text);
}

async function waitState(page, state, timeout = 90_000) {
  const states = Array.isArray(state) ? state : [state];
  await page.waitForFunction((s) => !!(window.VR && VR.game && s.includes(VR.game.state)), states, { timeout });
}

/** wait until a condition (a function run in the page) is true */
async function waitFor(page, fn, arg, timeout = 90_000) {
  await page.waitForFunction(fn, arg, { timeout });
}

async function readStorage(page, key) {
  return page.evaluate((k) => { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); }, key);
}

/** back to the main menu from anywhere */
async function toMenu(page) {
  await page.evaluate(() => VR.game.toMenu());
  await waitState(page, 'menu');
}

function expectNoErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}

module.exports = { openGame, waitState, waitFor, readStorage, toMenu, expectNoErrors, PREFIX };
