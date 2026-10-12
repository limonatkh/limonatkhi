/* The save (cubeexpress.profiles) and the wallet, run in node with a fake localStorage.
 * What they protect: a player never loses coins, purchases, missions or progress, and the
 * save's format stays as it is. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSave, fixture, fixtureData, MemoryStorage } = require('../helpers/vm');

const KEY = 'cubeexpress.profiles';
const read = (s, k = KEY) => JSON.parse(s.getItem(k));
const plain = (o) => JSON.parse(JSON.stringify(o));

test('legacy keys only: migrated into the new save, old keys left untouched', () => {
  const storage = new MemoryStorage(fixture('legacy-only.json'));
  const before = storage.dump();
  const { VR } = loadSave(storage);
  const p = VR.Profiles.player();
  assert.equal(p.wallet.coins, 1234);                       // floor of 1234.7
  assert.equal(p.stats.best, 5821);
  assert.deepEqual(plain(p.stats.duel), { w: 4, l: 2, d: 1 });
  assert.deepEqual(plain(p.progress.missions), fixtureData('legacy-only.json')['cubeexpress.missions']);
  assert.ok(storage.getItem(KEY), 'the new save is written at once');
  for (const k in before) assert.equal(storage.getItem(k), before[k], `old key ${k} must not change`);
  assert.equal(read(storage).version, 1);
});

test('legacy migration runs only once (a second load does not copy the old keys again)', () => {
  const storage = new MemoryStorage(fixture('legacy-only.json'));
  let { VR } = loadSave(storage);
  VR.Wallet.of().debit(200, 'test:spend', 'test');
  ({ VR } = loadSave(storage));                            // reopen the game
  assert.equal(VR.Profiles.player().wallet.coins, 1034);
});

test('a full v1.44 save: load + save writes back exactly the same data', () => {
  const storage = new MemoryStorage(fixture('full-v144.json'));
  const before = read(storage);
  const { VR } = loadSave(storage);
  VR.Profiles.load(); VR.Profiles.save();
  assert.deepEqual(read(storage), before);
});

test('a full v1.44 save: nothing the player owns is lost on load', () => {
  const storage = new MemoryStorage(fixture('full-v144.json'));
  const { VR } = loadSave(storage);
  const p = VR.Profiles.player();
  assert.equal(VR.Wallet.of().coins, 2750);
  assert.deepEqual(plain(p.upgrades), { hp: 2, ammo: 1, magnet: 1 });
  assert.deepEqual(plain(p.unlocks), { arena: ['revolver', 'rifle'] });
  assert.deepEqual(plain(p.inventory.consumables), { medkit: 2, startShield: 1 });
  assert.equal(p.inventory.loot.items.plate_crystal, 1);
  assert.deepEqual(Object.keys(p.progress.missions.completed).sort(), ['m1', 'm2']);
  assert.deepEqual(plain(p.progress.areas.isl1), { flags: ['boss_down'] });
  assert.deepEqual(plain(VR.Profiles.world('hub')), { flags: ['plaza_open'] });
  assert.equal(p.location.area, 'isl1');
  assert.equal(VR.Profiles.hasAdventure(), true);
});

test('a partial save: missing fields are filled, existing ones kept', () => {
  const storage = new MemoryStorage(fixture('partial.json'));
  const { VR } = loadSave(storage);
  const p = VR.Profiles.player();
  assert.equal(p.wallet.coins, 640);
  assert.deepEqual(plain(p.wallet.ledger), []);
  assert.equal(p.stats.best, 300);
  assert.deepEqual(plain(p.stats.duel), { w: 0, l: 0, d: 0 });
  assert.deepEqual(plain(p.progress.missions.completed), { m3: { t: 1, score: 50 } });
  assert.deepEqual(plain(p.progress.missions.plays), {});
  assert.deepEqual(plain(p.inventory.consumables), {});
  assert.deepEqual(plain(p.upgrades), {});
  assert.equal(p.location, null);
  assert.equal(VR.Profiles.hasAdventure(), false);
  assert.deepEqual(plain(VR.Profiles.load().world), {});
});

test('unknown fields (newer versions, other tools) are kept on load and save', () => {
  const storage = new MemoryStorage(fixture('unknown-fields.json'));
  const before = read(storage);
  const { VR } = loadSave(storage);
  VR.Wallet.of().credit(1, 'test:touch', 'test');          // forces a save
  const after = read(storage);
  assert.deepEqual(after.futureTopLevel, before.futureTopLevel);
  const p = after.players.p1, b = before.players.p1;
  for (const [a, x] of [[p.cosmetics, b.cosmetics], [p.inventory.pets, b.inventory.pets], [p.progress.storyWorlds, b.progress.storyWorlds],
    [p.progress.missions.streak, b.progress.missions.streak], [p.wallet.futureWalletField, b.wallet.futureWalletField]]) assert.deepEqual(a, x);
});

test('a corrupt save: the game still starts (from the old keys) and does not crash', () => {
  const storage = new MemoryStorage(fixture('corrupt.json'));
  const { VR } = loadSave(storage);
  assert.equal(VR.Profiles.player().wallet.coins, 777);   // current behaviour: rebuilt from cubeexpress.bank
  assert.doesNotThrow(() => JSON.parse(storage.getItem(KEY)));
});

test('NEW GAME keeps coins, purchases, missions and stats, and writes a backup', () => {
  const storage = new MemoryStorage(fixture('full-v144.json'));
  const before = read(storage);
  const { VR } = loadSave(storage);
  VR.Profiles.newGame();
  const p = VR.Profiles.player(), b = before.players.p1;
  assert.equal(p.wallet.coins, b.wallet.coins);
  assert.deepEqual(plain(p.wallet.ledger), b.wallet.ledger);
  assert.deepEqual(plain(p.upgrades), b.upgrades);
  assert.deepEqual(plain(p.unlocks), b.unlocks);
  assert.deepEqual(plain(p.inventory.consumables), b.inventory.consumables);
  assert.deepEqual(plain(p.progress.missions), b.progress.missions);
  assert.deepEqual(plain(p.stats), b.stats);
  assert.equal(p.uid, b.uid);
  // the adventure itself starts over (current behaviour)
  assert.equal(p.location, null);
  assert.deepEqual(plain(p.progress.areas), {});
  assert.deepEqual(plain(VR.Profiles.load().world), {});
  // a full copy of the old save is kept
  const backup = read(storage, KEY + '.backup');
  assert.deepEqual(backup.players, before.players);
  assert.deepEqual(backup.world, before.world);
  assert.equal(backup.recovered, 'wallet-kept');
  // and it survives a reload
  const again = loadSave(storage).VR;
  assert.equal(again.Wallet.of().coins, b.wallet.coins);
});

test('recoverFromBackup gives back what an older NEW GAME took, exactly once', () => {
  const storage = new MemoryStorage(fixture('backup-old-wipe.json'));
  let { VR } = loadSave(storage);
  assert.equal(VR.Profiles.recoverFromBackup(), 1500);
  let p = VR.Profiles.player();
  assert.equal(p.wallet.coins, 1500);
  assert.deepEqual(plain(p.upgrades), { hp: 3, regen: 1 });
  assert.deepEqual(plain(p.inventory.consumables), { medkit: 3 });
  assert.deepEqual(plain(p.unlocks.arena), ['lmg']);
  assert.equal(p.stats.best, 4000);
  // second time (same session, then after a reload): nothing more
  assert.equal(VR.Profiles.recoverFromBackup(), 0);
  ({ VR } = loadSave(storage));
  assert.equal(VR.Profiles.recoverFromBackup(), 0);
  assert.equal(VR.Wallet.of().coins, 1500);
});

test('recoverFromBackup does nothing after a NEW GAME of this version (wallet kept)', () => {
  const storage = new MemoryStorage(fixture('full-v144.json'));
  const { VR } = loadSave(storage);
  VR.Profiles.newGame();
  assert.equal(VR.Profiles.recoverFromBackup(), 0);
  assert.equal(VR.Wallet.of().coins, 2750);
});

test('wallet: a txId is paid once, also after reopening the game', () => {
  const storage = new MemoryStorage(fixture('full-v144.json'));
  let { VR } = loadSave(storage);
  const w = VR.Wallet.of();
  assert.equal(w.credit(100, 'test:reward:1', 'test'), true);
  assert.equal(w.credit(100, 'test:reward:1', 'test'), false);
  assert.equal(w.credit(150, 'mission:m1run', 'mission'), false, 'a txId already in the saved ledger');
  assert.equal(w.coins, 2850);
  ({ VR } = loadSave(storage));
  assert.equal(VR.Wallet.of().credit(100, 'test:reward:1', 'test'), false);
  assert.equal(VR.Wallet.of().coins, 2850);
});

test('wallet: spending never goes below zero and never twice for one txId', () => {
  const storage = new MemoryStorage(fixture('partial.json'));
  const { VR } = loadSave(storage);
  const w = VR.Wallet.of();
  assert.equal(w.debit(1000, 'test:too-much'), false);
  assert.equal(w.coins, 640);
  assert.equal(w.debit(40, 'test:buy'), true);
  assert.equal(w.debit(40, 'test:buy'), false);
  assert.equal(w.coins, 600);
  assert.equal(w.credit(0, 'test:zero'), false);
  assert.equal(w.credit(-5, 'test:neg'), false);
  assert.equal(w.coins, 600);
});

test('wallet: the ledger keeps the last 400 entries (current limit)', () => {
  const storage = new MemoryStorage(fixture('partial.json'));
  const { VR } = loadSave(storage);
  const w = VR.Wallet.of();
  for (let i = 0; i < 405; i++) w.credit(1, 'test:many:' + i);
  assert.equal(w.data.ledger.length, 400);
  assert.equal(w.coins, 640 + 405);
});

test('save format: the keys of a new save stay the same', () => {
  const storage = new MemoryStorage();
  const { VR } = loadSave(storage);
  VR.Profiles.load();
  const d = read(storage);
  assert.deepEqual(Object.keys(d).sort(), ['active', 'migrated', 'players', 'version', 'world']);
  assert.deepEqual(Object.keys(d.players.p1).sort(), ['created', 'id', 'inventory', 'location', 'progress', 'stats', 'uid', 'upgrades', 'wallet']);
  assert.deepEqual(Object.keys(d.players.p1.progress).sort(), ['areas', 'flags', 'missions']);
  assert.deepEqual(Object.keys(d.players.p1.progress.missions).sort(), ['achievements', 'completed', 'plays', 'secondary']);
  assert.deepEqual(Object.keys(d.players.p1.inventory).sort(), ['consumables', 'tools', 'weapons']);
  assert.equal(d.version, 1);
  assert.equal(d.active, 'p1');
});
