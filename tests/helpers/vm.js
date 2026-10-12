/* Load some of the game's own files into a small sandbox in node (no browser), with a fake
 * localStorage. Used by the unit tests for the save and the wallet: the files are run as they
 * are, nothing is copied or changed. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

class MemoryStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  /** a plain copy, to compare before / after */
  dump() { return Object.fromEntries(this.m); }
}

/** run the given repo files (in order) in a fresh sandbox; returns { VR, localStorage, context } */
function load(files, { storage = {} } = {}) {
  const localStorage = storage instanceof MemoryStorage ? storage : new MemoryStorage(storage);
  const context = { VR: {}, localStorage, console, Date, Math, JSON, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, context, { filename: f });
  }
  return { VR: context.VR, localStorage, context };
}

/** the save system as the game loads it: profile.js then wallet.js */
function loadSave(storage) {
  return load(['js/core/profile.js', 'js/core/wallet.js'], { storage });
}

/** fixture file → { key: string } ready for a storage */
function fixture(name) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', name), 'utf8'));
  const out = {};
  for (const k in d.storage) out[k] = typeof d.storage[k] === 'string' && d.raw ? d.storage[k] : JSON.stringify(d.storage[k]);
  return out;
}

/** fixture file → { key: value } (already parsed) */
function fixtureData(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', name), 'utf8')).storage;
}

module.exports = { ROOT, MemoryStorage, load, loadSave, fixture, fixtureData };
