/* Short "fingerprints" of generated content, to notice when a change moves things that should
 * not move. Kept in tests/baseline/*.json (made from v1.44 with `npm run baseline`). */
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const req = (f) => require(path.join(ROOT, f));

/** a small seeded random generator (mulberry32) */
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r2 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : v);
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** ground heights on a grid + the named spots → { spots, groundHash } */
function ground(vt, spots, span = 120, step = 2) {
  const h = [];
  for (let x = -span; x <= span; x += step) for (let z = -span; z <= span; z += step) h.push(r2(vt.top(x, z)));
  const sp = {};
  for (const k of Object.keys(spots || {}).sort()) sp[k] = Array.isArray(spots[k]) ? spots[k].map(r2) : hash(spots[k]);
  return { spots: sp, groundHash: hash(h) };
}

function terrain() {
  const E = req('js/explore/explore.js'), I = req('js/explore/islandworlds.js'), S = req('js/explore/skyroutes.js');
  const out = {};
  const ex = E.generate();
  out.explore = ground(ex.vt, ex.spots);
  for (const id of Object.keys(I.GEN).sort()) {
    const w = I.GEN[id]();
    out[id] = ground(w.vt, w.spots);
    out[id].killY = w.killY;
    const rocks = S.forLevel(id, w.vt, w.spots);
    out[id].skyRoutes = hash(JSON.parse(JSON.stringify(rocks, (k, v) => r2(v))));
  }
  return out;
}

module.exports = { seeded, hash, terrain };

if (require.main === module) {
  // node tests/helpers/fingerprints.js → rewrites tests/baseline/terrain.json
  const fs = require('fs');
  const file = path.join(ROOT, 'tests', 'baseline', 'terrain.json');
  fs.writeFileSync(file, JSON.stringify({ about: 'Shape of the generated exploration area, sky islands and sky routes (v1.44). Regenerate with `npm run baseline` ONLY when a change to them is on purpose.', worlds: terrain() }, null, 2) + '\n');
  console.log('wrote', file);
}
