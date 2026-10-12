/* Checks on the source files, without running the game. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('../helpers/source');

const baseline = (f) => JSON.parse(fs.readFileSync(path.join(S.ROOT, 'tests', 'baseline', f), 'utf8')).entries;

test('every game file parses as a classic script (no syntax errors, no import/export)', () => {
  for (const f of S.jsFiles()) {
    assert.doesNotThrow(() => new vm.Script(S.read(f), { filename: f }), `${f} does not parse`);
  }
});

test('index.html loads every file under js/ exactly once', () => {
  const order = S.scriptOrder();
  const js = order.filter((f) => f.startsWith('js/'));
  const dup = js.filter((f, i) => js.indexOf(f) !== i);
  assert.deepEqual(dup, [], 'loaded twice');
  assert.deepEqual([...js].sort(), S.jsFiles(), 'every js/ file is in index.html and every script tag points to a js/ file');
});

test('every <script src> in index.html exists', () => {
  for (const f of S.scriptOrder()) {
    if (/^https?:/.test(f)) continue;
    assert.ok(fs.existsSync(path.join(S.ROOT, f)), `${f} is missing`);
  }
});

test('three.js loads before the game, and game.js after the systems it starts', () => {
  const order = S.scriptOrder();
  const three = order.findIndex((f) => /three/i.test(f));
  assert.ok(three >= 0 && three < order.findIndex((f) => f.startsWith('js/')), 'three.js first');
  const at = (f) => order.indexOf(f);
  for (const f of ['js/config.js', 'js/i18n.js', 'js/core/profile.js', 'js/core/wallet.js', 'js/core/modes.js']) {
    assert.ok(at(f) >= 0 && at(f) < at('js/game.js'), `${f} before js/game.js`);
  }
});

test('no NEW cross-file overrides (one system replacing another one\'s function)', () => {
  const allowed = new Set(baseline('cross-file-overrides.json'));
  const added = S.crossFileOverrides().filter((e) => !allowed.has(e));
  assert.deepEqual(added, [], 'new overrides: register through VR.MissionEnvironments / VR.ADVENTURE.areas / VR.Missions.Components instead, or add to tests/baseline/cross-file-overrides.json with a reason');
});

test('no NEW translation keys defined twice with different text', () => {
  const allowed = new Set(baseline('i18n-conflicts.json'));
  const added = S.i18nConflicts().filter((e) => !allowed.has(e));
  assert.deepEqual(added, [], 'use a key prefix of your own (e.g. "desert.") so two systems do not overwrite each other\'s text');
});
