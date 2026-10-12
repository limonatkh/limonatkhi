# Lemonat tests

The game itself has no build step and no dependencies. `package.json` only installs the test
tools (Playwright). Nothing in `js/` or `index.html` is changed for the tests: they drive the real
game through the global `VR`, the same way a player's actions end up calling it.

```bash
npm ci
npx playwright install chromium     # once
npm test                            # everything that blocks a merge
npm run test:known                  # known bugs (test.fail), never blocking
npm run test:unstable               # tests that did not pass every time, never blocking
npm run serve                       # the game on http://localhost:8765 (the same server the tests use)
```

## Groups

| Group | Where | Blocks a merge | What it is |
|---|---|---|---|
| node | `tests/static/`, `tests/unit/` | yes | No browser. Source checks, the save and the wallet (run in a sandbox with a fake localStorage), the pure simulations and generated worlds. |
| blocking | `tests/e2e/` | yes | The real game in headless Chromium (WebGL in software). |
| known-issues | `tests/known-issues/` | no | Bugs that exist today, written as the CORRECT behaviour inside `test.fail()`. Green while the bug is there. When it is fixed (in its own PR), remove `test.fail()` and move the test to `tests/e2e/`. |
| unstable | `tests/e2e/`, tagged `@unstable` | no | A test that did not pass every time. It still runs and reports. Put `@unstable` in its title with a line here saying why, never delete it or hide it. |

### Unstable tests

None at the moment (every test passed 5 runs out of 5 when this was set up, see the PR).

### Known issues

| Test | Bug |
|---|---|
| `known-issues/lt-got.spec.js` | The key `lt.got` is defined in `js/explore/loot.js` and again in `js/duel/powers.js`; the second wins, so a loot chest shows the literal text `{name}`. |

## What the tests cover

| File | Covers |
|---|---|
| `static/source.test.js` | Every game file parses as a classic script; `index.html` loads every `js/` file exactly once and in a working order; no NEW cross-file overrides; no NEW translation keys defined twice with different text. |
| `unit/save.test.js` | `cubeexpress.profiles`: migration from the old keys, load + save leaves the data unchanged, unknown fields kept, partial and corrupt saves, NEW GAME keeps coins / purchases / missions and writes the backup, recovery from the backup once, wallet txIds paid once (also after a reload), the save's format. |
| `unit/pure-modules.test.js` | Billiards and basketball simulations (deterministic, sane results); the exploration area, the five sky islands and the sky routes are the same shape as v1.44. |
| `e2e/boot.spec.js` | The menu opens with no errors; a fresh save; no system, area, mission, weapon or item disappeared; switching language. |
| `e2e/saves.spec.js` | The same test saves inside the real game: CONTINUE, NEW GAME, recovery, area progress saved across a reload. |
| `e2e/modes.spec.js` | PLAY, every area, portals between areas, the runner portal and back, the Mini Planet, the runner from the menu. |
| `e2e/runner.spec.js` | The course for fixed seeds is the same as v1.44; moving and changing lane; coins paid once at a crash; pause. |
| `e2e/missions.spec.js` | Mission 1 completed and paid once (and not again on a replay); leaving pays nothing; a mission door in the world and back; every mission opens. |
| `e2e/combat.spec.js` | A duel against a bot: buy, fight, hits, a won match paid once, forfeit; the island fights' health. |
| `e2e/worlds.spec.js` | Billiards and basketball from the square's gates and back; the player stands on solid ground in every area. |

## Test saves

`tests/fixtures/saves/` holds made-up saves (no real player's data), see its README. A test never
touches a real browser's storage: each test starts with an empty localStorage and only the save it
asks for.

The tests never go online: `cubeexpress.settings` is `{ "online": false }` and every request that
does not go to `localhost` is blocked.

## Baselines (`tests/baseline/`)

Some tests compare with what the game was in v1.44:

| File | Rule |
|---|---|
| `vr-surface.json`, `registries.json` | Things may be ADDED. Nothing listed may disappear. |
| `runner.json`, `terrain.json` | Must stay the same. A change on purpose (a new obstacle, a reshaped island) is recorded with `npm run baseline`, and the PR says so. |
| `cross-file-overrides.json`, `i18n-conflicts.json` | May only get SHORTER. A new entry is a new hidden link between two systems: register through `VR.MissionEnvironments` / `VR.ADVENTURE.areas` / `VR.Missions.Components` instead, and use a key prefix of your own for translations. |

`npm run baseline` rewrites all of them from the current code. Only run it for a change that is meant
to be there.

## Writing a test

- Open the game with `openGame(page, { raw: fixture('full-v144.json') })` (or no save).
- Wait on the game's state (`waitState(page, 'adventure')`, `waitFor(page, () => …)`), never on fixed sleeps.
- End with `expectNoErrors(errors)`: an uncaught error or a `console.error` fails the test.
- Software WebGL is slow (a frame can take 100 ms). Wait for conditions, not for times.
