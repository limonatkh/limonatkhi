/* The parts of the game that are plain numbers and also run in node: the billiards and basketball
 * simulations, the voxel ground, the exploration area, the sky islands and the sky routes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../helpers/vm');
const FP = require('../helpers/fingerprints');

const req = (f) => require(path.join(ROOT, f));

test('billiards: a break from a seeded rack is deterministic, every ball stops on the table or in a pocket', () => {
  const { PoolSim, EightBall, HL, HW, R } = req('js/mini/poolsim.js');
  const run = () => {
    const s = new PoolSim(); s.rack(FP.seeded(42));
    const rules = new EightBall(s);
    rules.beginShot(s); s.strike(0.02, 9);
    let t = 0;
    for (; t < 30 && s.moving(); t += 0.05) for (const e of s.step(0.05)) rules.note(e);
    return { t, balls: s.balls.map((b) => [b.n, b.on, +b.x.toFixed(6), +b.z.toFixed(6)]) };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.t < 30, 'the balls stop');
  assert.equal(a.balls.length, 16);
  for (const [n, on, x, z] of a.balls) if (on) assert.ok(Math.abs(x) <= HL + R && Math.abs(z) <= HW + R, `ball ${n} on the table`);
});

test('basketball: a seeded computer-vs-computer match ends with a result and fair numbers', () => {
  const { HoopMatch, Brain } = req('js/mini/hoopsim.js');
  const run = () => {
    const r = FP.seeded(7), m = new HoopMatch({ time: 40, rand: r });
    const bots = [new Brain(m, 0, 'normal', r), new Brain(m, 1, 'hard', r)];
    let steps = 0;
    while (!m.over && steps < 40 * 60 * 3) { const dt = 1 / 60; m.step(dt, bots.map((b) => b.think(dt))); steps++; }
    return { over: m.over, score: m.score.slice(), result: m.result, steps };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.equal(a.over, true);
  for (const s of a.score) assert.ok(Number.isInteger(s) && s >= 0);
  assert.ok(['win', 'lose', 'draw'].includes(a.result));
});

test('exploration area, sky islands and sky routes: same shape as v1.44 (tests/baseline/terrain.json)', () => {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'baseline', 'terrain.json'), 'utf8')).worlds;
  const now = FP.terrain();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(base).sort());
  for (const id in base) assert.deepEqual(now[id], base[id], `${id} changed shape (regenerate with "npm run baseline" only if that change is on purpose)`);
});

test('exploration area and islands are generated the same way every time', () => {
  assert.deepEqual(FP.terrain(), FP.terrain());
});
