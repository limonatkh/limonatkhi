# ليمونات — Endless Mountain Runner

A complete 3D endless runner across a high voxel mountain world (ridges,
knife edges, passes, forks around peaks, a sea of clouds below), built
with **Three.js** and plain JavaScript. No build step, no image or audio
files: every block texture, model and sound is generated in code.

---

## 1. Technology

| Part | What it uses |
|---|---|
| Rendering | Three.js r158 (`lib/three.min.js`, bundled locally), WebGL |
| Language | Plain JavaScript (ES2017), one global namespace `VR` |
| Textures | 16×16 pixel textures painted on `<canvas>` at startup (`js/voxel.js`) |
| Models | Boxes merged into one mesh per material (`VoxelBuilder`) |
| Audio | WebAudio synthesiser, replaceable by real files (`js/audio.js`) |
| UI | HTML/CSS overlay (`index.html`, `js/ui.js`) |
| Saves | `localStorage` (best score, coin bank, settings, selected character) |

## 2. How to run

Any static web server works. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve .`. Double-clicking `index.html` also works in most browsers
because the code uses classic `<script>` tags, not ES modules.

Controls: **A/D or ←/→** dodge sideways · **W / ↑ / Space** jump ·
**S / ↓** slide (in the air: fast-fall) · **Esc / P** pause ·
on phones, **swipe** in any direction.

## 3. Where the player character is defined

`js/character.js`

- `HERO_MODEL` — your character as a voxel model, split into 6 animated parts
  (`legL`, `legR`, `body`, `head`, `armL`, `armR`). Each part is a list of
  boxes `[x, y, z, width, height, depth, 'colourName']` in "pixels".
- `HERO_PALETTE` — the named colours.
- `outline` / `noOutline` — thickness of the black cartoon ink line, and which colours skip it.
- `VR.CHARACTERS` — the list shown in the Character menu (skins).
- `VR.buildCharacter()` — turns a definition into a rigged 3D model.

Animation (run cycle, jump pose, slide, lean, landing squash) lives in
`js/player.js → Player.animate()`, and works on any model that uses the
same 6 part names.

## 4. Replacing / changing the character

1. Open `js/character.js`.
2. Edit the boxes in `HERO_MODEL` (or copy it to a new object) and edit the
   boxes. Keep the six part names; pivots are the joints (hip, shoulder, neck).
   `-Z` is the front (the face), the figure is ~21 px tall.
3. Add a palette and register it:
   ```js
   VR.CHARACTERS.unshift({ id: 'hero', name: 'My Hero', tagline: 'Main character',
                           model: MY_HERO_MODEL, palette: MY_PALETTE });
   ```
   The first entry is the default. Extra entries with the same model and a
   different palette are skins.

Collision size is independent of the model (`PLAYER_*` values in
`js/config.js`), so a new look never changes gameplay.

## 5. The mountain world: route segments instead of lanes

The runner crosses a high voxel mountain range. There are **no lanes, no
railway and no trains**. Where things live:

| Question | Answer |
|---|---|
| Route geometry (what you can run on) | `js/route.js`: profiles `W` (wide ridge), `M`, `N` (knife edge), `Fm`/`Fc` (two branches around a peak / over a gorge), `Tm` (three branches). A section goes from one profile to the next over ~34 m (`span`), so splitting and merging are gradual. `regions(u)` = the walkable strips at a point |
| Sections (route + terrain + weights) | `js/terrain.js` → `VR.SECTIONS`: ridge, saddle, ledge_l/r, pass_w, w2m, w2n, m2w, m2n, n2m, n2w, ridge_m, ledge_ml/mr, pass_m, tunnel_start/end, knife, arch (natural rock bridge), split_m, twin_m, merge_mw, merge_mn, split_c, twin_c, merge_cw, merge_cn, split3, tri, merge3n, merge3w |
| Choosing the next section / turn / slope | `js/world.js` → `nextSection()` (only sections whose route starts where the last one ended), `nextShape()` (curvature, climbs and drops; a ledge always winds with its wall on the inside) |
| Turning path coordinates into the 3D world | `js/track.js` (`toWorld`, `heading`, `curvature`, `place`, `regionsAt`, `bendGroup`) |
| Sky depth: cloud sea, valley floor, far peaks | `js/backdrop.js` |
| Moving across the route | `js/player.js` (`action`, `update`) |
| Obstacles, coins, fairness check | `js/patterns.js` |
| Obstacle models | `js/prefabs.js` → `VR.OBSTACLE_TYPES` |

**Lanes.** The runner's sideways position `x` belongs to the walkable region
under it and to one of that region's **lanes** (`VR.Route.Lanes` in
`route.js`): one lane per swipe of room, at most 3, spread evenly over the
region; a **branch between mountains / beside a gorge has exactly one lane**
(no choosing between two places inside a branch). A swipe moves one lane
over (refused with a bump at the edge). When the region narrows, bends,
splits or merges the runner flows with its lane (at most `FOLLOW_SPEED`
m/s); when the number of lanes changes it takes the nearest one. At a fork
the side you are on (or last swiped toward) decides your branch.

**Merging from far away.** Branch positions and widths are interpolated over
the whole span: three routes converge into one over ~34 m, visible well
before you reach it. The camera rides on your branch and follows it.

**Terrain = route.** `terrain.js` builds the voxels *from* the regions:
natural ground on the walkable strips (grass / gravel / snow / sand with
patches), the mountain body dropping ~45 m into the clouds on `drop` sides,
grassy shoulders with trees, rock walls on `wall` sides, a peak or a deep
gorge between branches, tunnels, rock bridges, and medium peaks standing
out of the cloud sea. Materials are slots filled per biome.

**Adding a section:** one `sec(key, { from, to, sides, w, turn, hill })`
line in `terrain.js`. Route, terrain, obstacle placement and the fairness
check follow automatically. **New profile:** add it to `PROFILES` in
`route.js`.

Races stay identical for both players: sections, turns, slopes and content
come from the seeded random generator.

## 6. Obstacles, coins and the fairness check

`js/patterns.js` works on a grid of 0.5 m × 1 m cells built from the
section's regions.

- Obstacles (`prefabs.js`): `rock_low`, `log`, `crevice` (jump over),
  `arch`, `leaning` stone pillars, `lintel` beams (slide under), `boulder`, `pillar`,
  `rockfall` (a rock that falls from the mountain as you come; its landing
  spot is marked) — go around — and `step` (a rock shelf you run up onto).
  Jump/slide obstacles can be stretched to span a whole ridge (`hurdle`).
  Rocks you must go around always leave ≥ 1.5 m free beside them.
- Recipes: `calm`, `scatter`, `hurdles`, `slalom`, `rockfall`, `steps`.
- `verify()` walks the section backwards and marks every cell from which
  the end can be reached, moving sideways only as fast as a player can at
  this speed. The layout is accepted only if every branch, at every metre,
  still has a way through. Jump/slide obstacles are spaced by real airtime.
- Coins: one line per branch, always exactly **on a lane** (the same
  `VR.Route.Lanes` rule the runner uses), so every coin can be reached
  with swipes. A line keeps its lane when the route narrows, bends,
  splits or merges (like the runner), changes lane only the way a swipe
  does (no coin mid-swipe, none right where the number of lanes changes),
  carries on from one section into the next, goes around rocks, arcs over
  jumps, dips under slides and runs up rock shelves.
- A region with one lane (a knife edge, a branch between mountains) only
  gets jump / slide obstacles; the fairness check also demands that every
  region has a *lane* with a way through at every metre.

### Collisions: stumble first

`js/game.js` → `resolveCollisions()`:

- Hitting a **jump** obstacle (or a rock shelf / clipping any obstacle from
  the side) → **STUMBLE**: you trip (animation, short slowdown, red ring at
  your feet and a red screen edge) and are **vulnerable** for
  `VULNERABLE_TIME` (2.6 s). A second hit while vulnerable ends the run.
  No second hit → back to normal.
- Clipping only the **edge** of a block (boulder, pillar, falling rock) or
  of a slide obstacle's support (less than ~0.4 m of your body) is a glancing
  hit: the same stumble, and you are shoved off it.
- A **block** or **slide** obstacle hit full on ends the run, as before.
  A shield saves you once; star / boost smash obstacles.

Slide obstacles have a completely clear opening below the beam; their
supports stand outside it (and count as solid in the fairness check). A
slide hurdle across a whole ridge is one long beam held by posts beyond
the route's edges.

## 7. Difficulty and speed

`js/config.js`

- `SPEED_START`, `SPEED_MAX`, `SPEED_RAMP` — speed eases from 13 to 31 m/s.
- `DIFFICULTY_RAMP` — how fast difficulty (0 → 1) rises with distance.

`js/game.js → speedAt()` / `difficultyAt()` apply the curves.
Difficulty changes recipe weights (more slaloms, falling rocks, hurdles),
row spacing, how many rocks per row, and how often narrow / split routes
appear.

## 8. Score system

- Numbers: `js/config.js` → `POINTS_PER_METRE`, `COIN_POINTS`, `GEM_POINTS`,
  `POWERUP_POINTS`, `MULTIPLIER_STEPS`.
- Logic: `js/game.js` → `updateScore()` (distance × multiplier, doubled
  during Boost), `onCoin()`, `onGem()`, `onPowerUp()`.
- Best score and banked coins are saved in `gameOver()`.

## 9. Adding a new environment (biome)

Biomes are mountain regions (alpine meadows, pine heights, lemon terraces,
red canyons, rocky peaks, snowy summits). Open `js/biomes.js` and add an
entry to `VR.BIOMES`:

```js
volcano: {
  sky: 0xd9a08a, fog: 0xe8c2b0, valley: 'dark',
  slots: { top: 'gravel', topside: 'stone', alt: 'dark', cliff: 'dark', cliffTop: 'gravel',
           peak: 'stone', leaf: 'leaves', leafTop: 'leaves', trunk: 'log', rock: 'cobble' },
  bias: { tunnel: 1, arch: 1, split: 1 },
},
```

Then add `'volcano'` to `VR.BIOME_ORDER` and a name `'biome.volcano'` in
`js/i18n.js`. New block textures: `VR.Tex.register('lava', (ctx, rnd) => { … })`.
Every section's voxels are built once and reused by all biomes (only the
materials change), so a new biome costs nothing at runtime.

## Player profile and coins (saving)

| What | Where |
|---|---|
| Everything that belongs to the player: coins, items, upgrades, mission / area progress, best score, duel stats | `js/core/profile.js` → `VR.Profiles.player()` (saved as `cubeexpress.profiles`, with a version number) |
| The state of a world area (doors, enemies…), separate from the player | `VR.Profiles.world(areaId)` |
| Coins, shared by every mode | `js/core/wallet.js` → `VR.Wallet.of()` |

- Players are stored in a map by id (only `p1` now), so several players can
  later each keep their own data.
- Every reward is a wallet transaction with an id (`run:<id>:end:<n>`,
  `mission:<runId>`, `duel:<matchId>`); an id that was already paid is
  ignored, so no reward can be paid twice.
- First start of this version: the old keys (`bank`, `best`, `missions`,
  `duelStats`) are copied into the profile and left in place, so older
  versions still open with their data.
- Device preferences (settings, character, language, name) stay separate.

## Adventure: New Game / Continue and the start area

The main menu starts the **adventure** (first person):

- **New Game** (لعبة جديدة) — starts a blank save and puts you in the
  start area with its intro. If a save exists it asks first; the old save
  is kept on the device as `cubeexpress.profiles.backup`.
- **Continue** (متابعة) — shown only when an adventure exists; brings you
  back to the same area, the same spot, with doors, pickups and coins as
  you left them (also after closing the browser).
- The runner course opens from the **runner portal** in the big square (below).

Pieces:

| File | What it does |
|---|---|
| `js/core/modes.js` | `VR.ModeManager`: `newGame()`, `continueGame()`, `enterAdventure(area)`, `quitToMenu()` |
| `js/adventure/hub.js` | the start area: environment `hub`, its definition (`VR.ADVENTURE.areas.hub`) and the `coins` component |
| `js/missions/missions.js` | runs adventure areas too: a definition with `persistent: true` is never "completed"; it is restored and saved |

An adventure area is written exactly like a mission (anchors, entities,
flags, objectives). Saving: flags about the world (a door opened) go to
`Profiles.world(area).flags`; flags about the player (coins, items picked
up, notes read) to `player.progress.areas[area].flags`; carried items to
`player.inventory.tools`; the position to `player.location` (every few
seconds, on pause and when leaving).

`coins` component: `{ id, type: 'coins', points: [[x,y,z], …], value }`.
Walking through a coin pays it into the shared wallet once
(transaction id `world:<area>:<id>_<n>`).

### The adventure loop (doors, signs, hidden places)

- **Five doors** in the big square lead to missions m1–m5 (same missions,
  unchanged puzzles). The lamp above a door: red = locked (it says which
  mission opens it), yellow = open, green = done. Going through a door
  fades out, plays the mission, and brings you back in front of the same
  door — after the results, after leaving, or on CONTINUE if you quit to
  the menu from inside. Mission coins are paid to the shared wallet.
- **Progress across areas:** every completed mission gives the square the
  flag `done_<mission>` (derived from mission progress, never stored twice).
- **Cross-area clue:** a finished door shows a sign; the panel by the east
  wall wants the signs of doors 1, 2, 3 in order and opens a hidden gate to
  the garden (a bonus lemon and coins worth 5).
- **Hidden passage:** a low gap in the courtyard's west wall (crouch or
  slide) leads to a small nook with coins and a note pointing to the garden.
- **Objective tracker:** an area can have `chapters: [{ title, objectives }]`;
  the HUD shows the first chapter that is not finished.
- **Coins in areas:** each mission area has a few coins near where you
  arrive; collected coins are remembered per player
  (`progress.areas[<area>].coins`), so they stay gone even though a
  mission's own flags reset on replay.

### Single-player combat (training arena)

West of the big square is the **training arena**. The first weapon (lemon
pistol) lies on a table by its gate; inside are more weapons, grenades,
two ammo crates and a bell.

| Piece | File |
|---|---|
| Shared shooting maths (also used by the 1v1 duel, unchanged behaviour) | `js/combat/weaponkit.js` |
| Health (damage, regeneration, death) | `js/combat/health.js` |
| Enemies and their AI | `js/combat/enemies.js` |
| Player weapons, HUD, pickups, ammo crates, encounters | `js/combat/encounter.js` |

**Weapons** (two slots + grenades; `WEAPONS` in weaponkit.js):

| Weapon | Damage | Head | Fire rate | Magazine / max reserve | Notes |
|---|---|---|---|---|---|
| Lemon pistol | 24 | ×2 | 0.26 s | 12 / 72 | first weapon |
| Scatter shotgun | 9 × 11 | ×1.5 | 0.85 s | 6 / 30 | strong up close |
| Light SMG | 12 | ×1.8 | 0.085 s (hold) | 32 / 160 | automatic |
| Sniper | 95 | ×2.5 | 1.0 s | 5 / 25 | right click = scope |
| Impulse grenade | 70 (area) | — | 2 charges, 6 s refill | — | pushes, stuns; also a jump tool |

Damage falls to 40 % at a weapon's range. With both slots full, picking up
another weapon swaps it for the one in your hands (left on the ground).

**Enemies:** guard (60 HP, keeps distance, slow visible shots), runner
(35 HP, rushes, melee), heavy (300 HP, armoured front ×0.25, slow to turn,
**weak spot = glowing core on its back ×3**, stunned by grenades). Every
attack has a short wind-up (eyes flash white).

**Encounter:** walking in (with a weapon) starts three waves; the gate
closes until the fight ends; first clear pays 60 coins once; the bell
starts it again for practice. Going down: fade, back at the arena gate with
full health, the fight resets (no penalty).

Controls: left click fire · right click aim · R reload · 1 / 2 / wheel
weapon · G grenade · E pick up. Touch: FIRE / AIM / R / ⇄ / G buttons.

Saved: weapons and ammo (`inventory.weapons`), grenades
(`inventory.consumables.nade`), what lies on the ground
(`Profiles.world('hub').pickups`), and whether the arena was cleared.

### Runner portal (the way into the course)

The runner course is no longer in the main menu. It is reached through the
**runner portal** in the big square, just inside the gate (west side)
(`js/adventure/portal.js`, mode switch in `js/core/modes.js`).

- The rule lives in its own file, `js/core/rules.js`
  (`VR.Rules.RULES.runnerPortal`): the portal wakes up when the start
  area's first puzzle is solved (`plaza_open`), and after every course run
  (finished or crashed) it **rests 2 minutes of real time** (saved as
  `progress.runnerPortalAt`, so closing the game does not skip it). Its
  sign shows the time left. Leaving a run from the pause menu does not
  start the rest. Race runs never touch it.
- Using it: fade out → the course (third person). The return point (in
  front of the portal, facing away from it) is saved first, so the result
  screen's **Back to the square** — or CONTINUE after quitting — brings you
  back there in first person. The course's coins are already in the wallet.

### Shop (متجر الليمون)

A stall in the big square (`js/adventure/shop.js`, catalogue `VR.Shop.ITEMS`).
Everything is paid from the shared wallet, each purchase with a transaction
id (an upgrade level can only ever be charged once).

| Item | Kind | Price | Effect |
|---|---|---|---|
| Lemon heart | upgrade ×3 | 90 / 180 / 300 | +20 max health per level |
| Quick breath | upgrade | 120 | health returns after 2.5 s (was 4) and faster |
| Ammo belt | upgrade ×2 | 70 / 150 | +25 % ammo carried per level |
| Grenade pouch | upgrade | 160 | +1 impulse grenade charge |
| Strong magnet | upgrade | 200 | course magnet lasts 50 % longer (not in races) |
| Medkit | supply (max 3) | 25 | +50 health, H key / ✚ button |
| Starting shield | supply (max 3) | 35 | next solo course starts with a 20 s shield |
| Scatter shotgun / Light SMG / Sniper | weapon | 120 / 160 / 220 | into a free slot, or replaces the one in your hands |
| Revolver / Assault rifle / Marksman rifle / Heavy machine gun | fight weapon (once) | 250 / 400 / 450 / 550 | unlocks it on the buy screen before fights |

All upgrades together cost 1,270 coins. For scale: a full course pays
≈ 20–100 coins, missions 50–100 each (once), the arena 60 (once), a won
race +50, a won duel 150.

### Multiplayer readiness

See `docs/MULTIPLAYER.md`: players in a map with their own wallet and
progress, a shared world, per-area personal flags, enemies that handle a
list of players, and what a networked adventure still needs.

## 10. Export / build

There is no build step — the folder **is** the game.

- **Web**: upload the folder to any static host (GitHub Pages, Netlify,
  Cloudflare Pages, itch.io as an "HTML" game — zip the folder).
- **Android / iOS app**: wrap it with Capacitor (`npx cap init`, copy the
  folder into `www/`, `npx cap add android`).
- **Desktop app**: wrap it with Electron or Tauri, pointing at `index.html`.

## Lemon theme

- Textures: `lemon`, `lemon_leaves`, `lemon_icon` in `js/voxel.js`.
- Props: `P.lemon`, `P.lemonTree`, `P.lemonCrate` in `js/biomes.js`; the
  "lemon terraces" biome grows lemon trees on the mountain shoulders.
- Bonus pickup: the voxel lemon (worth 5 coins) in `js/collectibles.js`
  (the `gems` set); its spawn chance is in `js/patterns.js → addCoins`.

## The runner course (finite)

The third-person runner is an optional **course with a start and a finish**
(`js/runner/course.js`, tuning in `VR.Course.CONFIG`):

- 30 sections of mountain route (≈1.15 km to the line, about a minute at
  the course's speed curve). The last 4 sections always lead back to the
  wide ridge; the finish section is straight with a chequered arch, then a
  few empty run-out sections; nothing is generated after that.
- Crossing the line ends the run: the runner slows to a stop within 45 m,
  the coins are paid once (`run:<id>:finish`), the time is kept (best time
  in `profile.stats.bestTime`), and the result screen shows time, coins
  and best time.
- A crash also ends the course, with the coins collected so far (result
  screen with how far along the course you got). There is **no continue**:
  the secret codes were removed.
- No mission gates and no 1v1 gates on the course. Missions are reached
  through the doors in the adventure world; 1v1 duels from the main menu
  (**Fight → friend vs friend**: *1v1 with an online player* or *Wait for a player*).
- HUD: a progress bar with the course time (and the other runner's place in
  a race).

**Race (Challenge a friend):** both players run the same course (same
seed). The **first to reach the finish wins** — coins do not decide it —
and gets a **coin bag (+50)**, paid once per round. When one player
finishes, the other's run stops there (keeping their coins). If nobody
finishes (both crash), the one who got further wins.

---

# Mission mode (first-person)

The runner is still the main game. Rare **mission gates** stand on a wide
ridge of the mountain route. Run through one and the game switches to a first-person
puzzle world. When the mission ends you return to the same run.

```
Runner ──(run through a gate)──► gateEnter: runner frozen, camera moves into
   ▲                             the character's eyes (TPP → FPV in 0.3 s), fade
   │                                         │
   │                              mission: intro → explore / read / solve → results
   │                                         │
countdown 3-2-1 ◄── gateReturn (fade) ◄──────┘  run restored + rewards added,
then 2.5 s of star power                        player stands just past the gate
```

## Controls (missions)

| Keyboard / mouse | Touch | Action |
|---|---|---|
| W A S D / arrows | left stick | move |
| mouse (click to capture; drag works too) | drag on the right side | look |
| Space | Jump | jump (also out of a slide) |
| Shift (hold) | push the stick all the way | sprint (×1.5 walking speed, not while crouching) |
| C / Ctrl (press) | Crouch | crouch on / off (press again to stand); while running it starts a slide |
| Q | Burst | Lemon Burst blast-jump straight up (3.2 s cooldown) |
| E / F | Use | interact (read, pick up, press, install…) |
| 1 2 3 / wheel | tap a slot | choose the carried item |
| J / Tab | journal button | clue journal, objectives, hints |
| Esc / P | pause button | pause: resume, settings, restart, leave |

**Controls (Settings → 🎮 Controls):** every first-person action (move, jump, crouch,
sprint, fire, aim, reload, weapons, knife, grenades, mine, medkit, use, journal) has two
slots. Click a slot and press any key, any mouse button (left / middle / right / side
buttons 4-5) or turn the wheel (up / down) — e.g. jump on *wheel down*. An input can only
belong to one action (it moves). Esc cancels, Backspace clears, *Reset* brings the defaults
back. Saved on this device (`cubeexpress.keybinds`; `VR.Input.binds / setBind`). Esc / P
always pause.

**Crosshair (Settings → ⌖ Crosshair):** style (cross, cross + dot, dot, circle, T), colour,
length, gap, thickness and a black outline. The preview shows it at its real size (exactly as in the game) and ×4 zoomed; the crosshair is drawn on whole pixels and centred on a whole pixel, so it stays sharp. Used in the arena and the
adventure / missions (`VR.Crosshair`, `cubeexpress.crosshair`).

**Ping:** in a live duel / co-op match the round trip to the other player (every second)
shows under the round timer, and in a race next to the opponent's score (green < 80 ms,
yellow < 160 ms, red above).

**Iron sights:** in fights, right click (aim) with the pistol, shotgun, SMG, revolver,
assault rifle or heavy machine gun brings the gun up to the middle and looks down its
iron sights (M16-style rear notch + front post): the view zooms (×0.66-0.85 by weapon),
shots spread 35 % as much, the mouse slows a little. The sniper and the marksman rifle
keep their scopes. Every weapon has its own model and colours (lemon pistol, wooden
double-barrel shotgun, sand SMG with a suppressor, silver revolver, black M16-style rifle
with a carry handle, wooden marksman rifle with a scope, olive machine gun with a bipod).

**Font:** the whole game uses **Cairo** (Google Fonts): Arabic and Latin text and the
numbers (bold, same-width digits).

**Player name:** Settings → *Player name*; the first time, the main menu also asks for it.
Stored as `cubeexpress.playerName`, used in races, duels and the online list.

**Coins are never lost:**
- NEW GAME restarts the *adventure* only (story, world, what you carry there). Coins,
  shop upgrades and supplies, fight weapons, stats and missions stay (older versions emptied
  the wallet here — the cause of "my coins were gone after the update").
- Older versions kept a copy before NEW GAME (`profiles.backup`): on load the coins (and
  upgrades / fight weapons) in it are given back **once** (transaction `recover:backup:<time>`)
  with a message.
- A run's coins go into the wallet every 3 s while running (`run:<id>:bank:<n>`), so a page
  reload or a closed tab in the middle of a run keeps them.

**Fights against another player (1v1, co-op):** every weapon is open for both players
(fair even for a brand-new player). Against the computer the shop unlocks still apply.

**Mini-map** (top corner of the arena): the arena from above with the cover, you as an
arrow (your side at the bottom), your teammate; an enemy (player or bot) shows up as a red
mark **where it fired**, for 2.5 s.

**Kill feed:** killer · weapon icon (each weapon has its own silhouette; mine; knife) ·
headshot skull · victim, in team colours; your own kills / deaths are highlighted.

**Scoreboard (hold Tab, touch: النتائج):** score, round *n* of *max*, rounds left, how many
round wins each side still needs, and for every player / bot: kills, deaths and ping.

**Mouse sensitivity:** Settings → *Mouse sensitivity* (0.2-3, default 1), also in the
mission pause menu and the arena pause card. One saved value (`fpSettings.sens`, `VR.Sens`)
used by missions, the adventure world and the arena (touch look too).

The prompt under the crosshair shows the action and its kind by color and
icon: **blue ◉ inspect/read**, **yellow ✋ collect**, **green ⚙ interact**.

## Architecture (new and changed pieces)

| Responsibility (from the brief) | Where it lives |
|---|---|
| GameModeManager | `js/game.js` states `gateEnter → mission → gateReturn → countdown`; one loop for both modes |
| RunStatePersistence | `js/game.js` `snapshotRun()` / `restoreRun()`; the runner world is frozen, then checked (`restoreCheck`) |
| WorldTransitionManager | `js/game.js` `enterGate()`, `updateGateEnter()`, `updateFade()`, `onMissionReturn()`, `updateCountdown()` |
| Mission entrances | `js/world.js` `maybeSpawnGate()`, model `VR.buildMissionGate` in `js/prefabs.js`, spacing in `js/config.js` |
| MissionManager | `js/missions/missions.js` (build world, update, render, interaction ray, pause, finish) |
| MissionDefinition (content) | `js/missions/data.js`, pure data |
| MissionState machine | `js/missions/framework.js` `States` + `MissionRun.go()` (illegal transitions are refused) |
| InteractableObject / PuzzleManager | `js/missions/framework.js` `Components` + flags + `rules` |
| ClueSystem | `js/missions/text.js` (canvas-texture writing on walls, paper, chalkboards, signs, glow paint) + the `text` component |
| Inventory / MissionItemSystem | `MissionRun.inventory`, hotbar in the mission UI, held item shown in the hands |
| MissionJournal | `MissionRun.journal` (filled when a clue is read) + journal screen |
| MissionUI | `js/missions/missionui.js` (HUD, prompt, inspect, symbol lock, journal, pause, results, failure, touch controls) |
| RewardManager | `js/missions/framework.js` `Rewards` + `Progress` (saved in localStorage) |
| FirstPersonController | `js/missions/fpcontroller.js` (movement, collision, ladders, camera) + `HandsView` |
| Environments | `js/missions/level.js` (`cellar`, `office`, `docks`) and props in `js/missions/models.js` |
| Puzzle symbols | `js/missions/symbols.js` |
| Input | `js/input.js` now has a `runner` mode and an `fp` mode. It is still one input system |

**Files changed:** `index.html` (mission UI, fade, countdown, styles, scripts),
`js/config.js` (gate spacing, `FP` movement block), `js/input.js`,
`js/audio.js` (mission sounds + `VR.Audio.define`), `js/world.js`,
`js/prefabs.js`, `js/game.js`.
**New:** everything in `js/missions/`.

### Movement spec mapping (`CONFIG.FP`)

| Spec | Value used |
|---|---|
| speed 15–20 units/s | 17 units/s. A unit is player height / 5 (≈ 6 m/s) |
| most speed within 0.15–0.3 s | 82% at 0.15 s, 97% at 0.3 s; a little momentum when keys are released |
| jump 1–1.5 player heights, 0.5–0.8 s airborne | 1.2 player heights, 0.65 s, limited air control, frame-rate independent |
| slide 0.4–0.8 s, keeps speed, can jump out | 0.6 s, starts at 115% and ends at 60% of speed, then keeps moving, slide → jump |
| blast jump 3–4× height, 70–80°, 2.5–4 s cooldown | Lemon Burst: 3.5×, 80° standing / 70° moving, 3.2 s |
| FOV 90–105 | 95° default, adjustable 90–105 in the pause menu |
| arena proportions | corridors 2.2 m, low cover 1.2 m, containers 2.6 m, stacks 5.2 m |

Not built from the attached spec, since the puzzle missions don't need them:
weapons, shooting, health, Duels/2v2 rounds, the shooting range and the lobby.
The component/state design leaves room for them.

## The three missions

1. **The Wall Message** (cellar). Read *"THE ANSWER IS HIDDEN WHERE THE LIGHT NEVER REACHES."*,
   find the unlit strip behind the shelves (crouch under the low gap), read the glow-painted
   signs, set the chest's three symbol dials, take the Golden Lemon. Bonus: 3 hidden lemons.
2. **The Three Messages** (office). Messages A, B and C. Two of the five shelf objects are silent,
   and each hides a note. Message A rules out place 1. Message C says to press the signs in the
   written order, not by their numbers. The panel then opens a hidden wall compartment.
   Bonus: no mistakes.
3. **Restore the Power** (docks). Find the fuse, the copper coil (end of the container
   corridor) and the lemon cell (top of the stack; ladder or Lemon Burst). Signs say which
   socket each part belongs in, and the lamps show green or red. Pull the lever and leave
   through the gate. Bonus: under 3:00.

Missions unlock in order (`requires`). After all three are done, gates offer replays,
which pay only the explicitly configured `repeatReward`. First-completion rewards,
bonus rewards and achievements are saved and granted once.

## How to test the missions

* Play normally. The first gate appears about 250 m in, then one every 640–960 m. A
  "Mission gate ahead!" toast warns you. Steer through it.
* Shortcuts in the browser console while a run is going:
  * `VR.game.enterGate({ missionId: 'm2' })` jumps straight into mission 2.
  * `VR.Profiles.player().progress.missions = { completed: {}, secondary: {}, achievements: [], plays: {} }; VR.Profiles.save()` resets mission progress.
  * `VR.game.missions.run.flags` shows the current puzzle state.

## Adding a mission

1. Add an object to `VR.MISSIONS` in `js/missions/data.js` (fields are documented
   at the top of that file). Give it a new `id`, an `order`, and `requires` if it
   should unlock after another mission.
2. Pick an `environment` (`cellar`, `office`, `docks`), or build a new one in
   `js/missions/level.js`: a function that returns a `Level` with boxes, props,
   lights, a `spawn` and named `anchor()`s, registered in `VR.MissionEnvironments`.
3. Place `entities` on the anchors. Most puzzles combine the existing components:

```js
{ id: 'sign', type: 'text', at: 'someWall', style: 'paint', size: 0.3, width: 4,
  title: 'Scratched message', text: 'COUNT THE {star} ON THE DOOR' },
{ id: 'box', type: 'symbolLock', at: 'chestSpot', symbols: ['star','moon','sun'],
  solution: ['sun','sun','star'], opens: 'box_open' },
{ id: 'prize', type: 'item', at: 'chestSpot', offset: [0, 0.5, 0], item: 'key',
  name: 'Brass Key', model: 'goldenLemon', showWhen: 'box_open' },
```

   Then set `objectives` (steps that are done when their flags are set),
   `success: 'got_key'`, and optionally `secondary`, `timeLimit`, `hints` and
   `rules: [{ when: ['a','b'], set: 'c', say: 'Something clicked.' }]`.
4. New puzzle mechanics: add a component to `VR.Missions.Components` in
   `framework.js`. A component is `build(def, ctx)` returning
   `{ obj, hit, kind, prompt(), use(run), update(dt, run), sync(run) }`.
   Set flags with `run.setFlag()`, and everything else reacts to them.
5. New puzzle symbols: `VR.Symbols.add('key', [...16 rows of pixel art...])`.

## Language (Arabic / English)

Settings → Language switches the whole game live and remembers the choice.
The default is Arabic.

* `js/i18n.js` holds every interface string in both languages (`VR.t('key')`).
  Static HTML uses `data-i18n="key"`. Arabic mode sets `dir="rtl"` and
  uses the Reem Kufi and Tajawal fonts.
* Mission content in `js/missions/data.js` is bilingual: any text field is
  `{ en: '…', ar: '…' }` (read with `VR.L(value)`). This covers writing on the
  walls and signs, which is redrawn in the chosen language.
* Puzzles do not depend on the language. Solutions are symbols, and a row of
  symbols is read in the language's own direction, so the answer is the same.
* Mission gate signs on the route are redrawn when the language changes.
* To add a language, add a table to `STRINGS` in `i18n.js` and a field for it in
  the mission data.

## Challenge a friend (live two-player race)

Menu → **تحدَّ صديقًا / Challenge a friend**.

1. One player presses **Create invite** and sends the link (copy, WhatsApp or Share).
   The link looks like `…/?vs=K7M2Q0`; the 6-character room code can also be typed in by hand.
2. The friend opens the link and joins the room automatically. Both see each other's names.
3. The host presses **Start the race**. Both games receive the same seed, so the route,
   obstacles, coins and power-ups are identical, then a 3-2-1 countdown starts on both screens.
4. While running, the other player appears as a see-through runner with a name tag, and the
   HUD shows their score and how far ahead or behind they are. Players never collide.
5. When both have crashed, the higher score wins. **Rematch** (both press it) starts a new track.

Fairness: both players run exactly the same course; the first to the finish wins (see "The runner course").

How it works (no server of our own — the game is a static site):

| Piece | File |
|---|---|
| Messages between the two players (public MQTT relay over secure WebSockets; outgoing connections only, so it works on mobile data) | `js/challenge/net.js` |
| Lobby, start sync, state streaming (~10/s), ghost runner, HUD, results, rematch, disconnects | `js/challenge/challenge.js` |
| Same-seed track (`world.reset(seed)`, difficulty from the chunk's position) | `js/world.js` |
| MQTT browser client | `lib/mqtt.min.js` |

The room code's last digit picks the relay, so both players use the same one. Testing locally:
run any MQTT broker with WebSockets and add `?relay=ws://127.0.0.1:8899` to the URL
(the invite link keeps this parameter).

## Missions 4 and 5: clues from the channel videos

Two more missions use the Limonat channel videos as clues. The detail in a video is only
**part** of each solution. Both use the existing gate → mission → return flow, so the run
(distance, score, coins, power-ups) is saved and restored exactly as for missions 1-3.

**Mission 4 · لغز النجوم السبعة (`starhall`)**: video «المفكر v.s الفقيه», clip 01:21–01:58
(at 01:55: a ball with seven stars inside it).
- A note: start on the lemon tile, count as many tiles as there are stars in the ball, toward the
  rising sun, lift that tile.
- The 15 × 9 tile floor has the lemon tile in the middle; the east painting says «الشروق» (sunrise),
  the west one «الغروب» (sunset).
- So: 7 (video) + direction (paintings) + start (note/lemon) → the 7th tile east. Under it the
  Star Key → star lock → vault → Star Lemon. Wrong tiles stay put (mistake); the two typical
  slips (counting the lemon tile, walking toward sunset) get a gentle hint.

**Mission 5 · لغز حروف الجر الثلاثة (`wordroom`)**: video «الحكم على الشيء جزء من تصوره», clip
00:08–00:30 (at 00:28: «في», then «عن», then «على»).
- The blackboard teaches what each word points to: في inside, على on top, عن away from / fallen off.
- The note says which cupboard: the one the colour of the fruit the game is named after (lemon → yellow).
- Each of the four cupboards has a card inside, on top and fallen off it, so you must use the right
  cupboard, the right meanings, and the video's order for the three dials (في, عن, على).
  The board lists the words in a different order, so the video is needed.

**Videos inside the world**: `js/missions/video.js`.
- `VR.VIDEOS` holds each video (YouTube id, segment, clue time, clue description). Screens in
  mission data only name a key (`{ type: 'videoScreen', video: 'thinker' }`); adding videos
  never touches mission code.
- The TV opens the clip with the YouTube IFrame Player (from the given start, stops at the end,
  replay button, "open on YouTube").
- If it can't play (offline, blocked embedding, or nothing after a few seconds: a button appears),
  the owner's description of the clue is shown and copied to the journal, so no mission can get stuck.
- Nothing is downloaded. To play local files instead, add them and extend `VR.VIDEOS`.

**Missions list** (main menu → المهمات): every mission with its status; replay any reached
mission from the menu (rewards: coins to the bank). For testing, `?missions=all` in the URL
opens every mission in this list.

New/changed files: `js/missions/video.js`, `js/missions/extra.js` (models, components
`videoScreen` · `floorTiles` · `keyhole` · `cupboard`, environments `starhall` · `wordroom`),
`js/missions/data.js` (m4, m5), `js/missions/missions.js` (see-through solids for aiming),
`js/game.js` + `index.html` (missions list), `js/i18n.js`, `js/ui.js`.

## 1v1 Sniper Arena (ساحة القنص)

A live first-person duel between two players, started from the road. Missions and the race
mode are untouched; the duel reuses their systems (first-person controller, hands, voxel
level builder, run snapshot/restore, fade + countdown, the relay link).

**On the road.** A purple 1v1 gate stands on a rock pillar *beside* the route (never in the way).
While it is ahead, the prompt **E — Challenge a player** (a button on touch screens) appears.
Nothing happens unless the player presses it. Then only this runner is frozen and the picker opens:

- **Friend in your room**: your challenge-room friend, over the room link.
- **Online now**: everyone playing right now (Settings → *Online challenges*, on by default).
  Busy players are shown with the reason (in a mission / duel / race) and can't be invited.

**Invite.** The other player gets a small pop-up: name, mode, **Accept / Decline**, 12 s timer
(keys Y / N). Declined or unanswered invites put that player on a 15 s cooldown; while waiting
the inviter sees the timer and **Cancel**. Refused, timed out or cancelled → back to the run (3-2-1).

**Match.** Both runs are saved; the TPP→FPV transition plays; the arena loads.
Rounds: 3-2-1, fight, 45 s, **first to 5**. Kill or higher health at time-out wins the round
(equal health = draw, no point). ROUND WON / LOST, short freeze, next round.

| | |
|---|---|
| Sniper | head 100 (kill), body 55 · 1 s bolt · 5 rounds, 1.9 s reload · right-click scope (FOV 32) · small hip-fire spread |
| Impulse grenade | **no damage**: pushes everyone in 3.8 m; under your feet = rocket jump · 2 charges, 3.2 s recharge each |
| Controls | mouse aim · left click fire (hold for the SMG) · right click scope · Q / G grenade · 1 / 2 / X switch · R reload · Shift sprint · Space jump · C slide |
| Arena | 46 × 23 m (26 × 13 PH), 11 m walls + invisible caps, 2 m floor grid, cover in 180° rotational symmetry |

**Referee (host-authoritative).** There is no game server, so the *inviter's* game decides:
it checks every guest shot (fire rate, origin near the guest, walls in the way, the host's
positions over the last 300 ms for lag) and owns health, rounds and score. The guest only
shows what the host sends, so a player can't change the result on their own device.
Grenade pushes are applied by each player to themselves (they never damage).

**Waiting arena (main menu → "انتظار لاعب").** Enter the arena alone: move, jump, slide,
snipe and grenade-jump freely while you show as *waiting* online. When another player
arrives (someone else waiting, or a runner who picks you at a 1v1 gate) the duel starts at
round 1 right there; afterwards you return to the menu. Two waiting players match on their
own (the lower id invites, the other accepts automatically). Esc/pause → leave any time.
**EXIT** on the waiting bar leaves the arena for the main menu at any time (online status
goes back to *free*). On a computer the arena holds the mouse: press **Esc** first (the
button says so), then click EXIT, or use "Leave the arena" in the pause card.

**Return.** Result card (winner, loser, score, rounds, coins: +150 win / +30 loss), then
each runner is restored exactly where they were (3-2-1 + short star). If a player leaves or
disconnects (no message for 7 s), the other wins and returns; the arena is torn down.

| Piece | File |
|---|---|
| Presence + private inbox on the relay | `js/duel/online.js` |
| Invites, rounds, combat, referee, return | `js/duel/duel.js` |
| HUD, picker, invite pop-up, touch controls | `js/duel/duelui.js` |
| Arena geometry | `js/duel/arena.js` |
| Rifle / grenade models, tracers, push wave | `js/duel/weapons.js` |
| Road gate model | `js/duel/gate.js` (spawned by `world.maybeSpawnDuelGate`) |

Tuning numbers are in `VR.DUEL` at the top of `duel.js`.

## Fight menu: 1v1, vs the computer, co-op (القتال)

Main menu → **القتال / Fight** opens three choices:

| Mode | What happens |
|---|---|
| **صديق ضد صديق** (friend vs friend) | the 1v1 above: *1v1 with an online player* or *Wait for a player* |
| **أنا ضد الكمبيوتر** (me vs the computer) | choose **1, 2 or 3** computer players and the difficulty **عادي / متوسط / صعب / مستحيل**, then START. Runs only on your device. |
| **أنا وصديق ضد الكمبيوتر** (me + a friend vs the computer) | same settings, then INVITE A PLAYER: the picker opens and the invite says it is co-op. Both players are one team against the bots. |

The chosen number of bots and difficulty are remembered on the device.

No name is shown over an opponent (the other player in a 1v1, or a bot): name tags show
through walls and would give away where they hide. In co-op only your teammate has a name tag.

**Buying before the match.** Every match (1v1, vs computer, co-op) starts with a buy screen.
Each player gets a **match budget of 1000 points** (the same for everyone; real coins are
never touched). You carry up to **2 weapons**; the pistol is free; the dearer weapon is in
your hand first. 25 s to choose (then you start with what you picked); READY when done.
The host only starts round 1 when everyone is ready.

| Item | Price | Damage body / head | Magazine · reload | Notes |
|---|---|---|---|---|
| Lemon pistol | free | 20 / 40 | 12 · 1.1 s | 0.3 s between shots |
| Scatter shotgun | 350 | 11 / 16 per pellet ×8 | 6 · 1.9 s | strong up close, weak past 18 m |
| Light SMG | 400 | 10 / 18 | 30 · 1.6 s | automatic (hold fire) |
| Sniper | 550 | 55 / 150 | 5 · 1.9 s | scope on right click |
| Impulse grenades | 250 | no damage | 2 charges | push / rocket jump |
| Mines ×2 | 200 | up to 85 | 2 per round | key B |
| Knife | always carried | 50 / 100 | — | reach 2.3 m, key 3 / V |
| 🔒 Revolver | 300 | 42 / 90 | 6 · 1.7 s | unlock in the shop (250 coins) |
| 🔒 Assault rifle | 450 | 17 / 34 | 25 · 1.8 s | automatic; unlock 400 coins |
| 🔒 Marksman rifle | 500 | 38 / 85 | 10 · 2.0 s | scope, 0.38 s between shots; unlock 450 coins |
| 🔒 Heavy machine gun | 500 | 13 / 22 | 60 · 3.2 s | automatic, wide spread; unlock 550 coins |

**Fight weapons from the shop.** The four 🔒 weapons are bought **once, with real coins**,
in the weapon shop (Fight → 🛒 Weapon shop, or the Lemon Shop in the adventure square, group
"Fight weapons"; saved in `profile.unlocks.arena`, transaction `shop:arena:<id>` so it is
never charged twice). Until then they show locked on the buy screen; after that you pick
them there like the others, paying match points. Hard / impossible bots use some of them too. Bots never use the sniper, except **Impossible +** (مستحيل +): the hardest level, it carries only the sniper (nothing else), reacts almost instantly, aims almost always at the head and turns very fast. Reward for beating it: 300 coins.

So *sniper + SMG* fits the budget, *sniper + SMG + grenades* does not. Numbers:
`js/duel/fightkit.js` (`WEAPONS`, `BUY`).

**Computer players** (`js/duel/bots.js`) are player-shaped, have 100 health and use the
same weapons. Difficulty changes reaction time, aim error, turn speed, fire rate, how often
they aim for the head, speed, strafing, retreating when hurt and grenades (hard and
impossible). Their aim error grows when you move fast, so moving and cover always help.
Rounds: 75 s, first to 3 (at most 5). All bots down = round won; you (or both of you in co-op)
down = round lost; time out = draw. Coins for a won match: normal 40, medium 70, hard 110,
impossible 180 (loss 10, draw a third). Stats per difficulty: `stats.bots`.
Against the computer alone, pause really pauses. In co-op the host's game runs the bots,
decides every hit (the guest's shots too) and streams the bots ~10 times a second.

**Impulse grenade (everywhere: arena, combat, duel).** It rests on the ground, blinks, and
explodes **1/5 s after landing** (bounces off walls first). Under your feet it throws you
**straight up where you stand** (no long jump forward), about 11 m high (push 34). The
Lemon Burst (Q in missions) also goes straight up.

**Knife and mines.** Everyone carries a **knife** (key 3 or V, touch: سكّين): 50 body /
100 head, reach 2.3 m, no ammo. **Mines** can be bought (200, two per round; key B, touch:
لغم): placed in front of your feet, armed after 0.8 s, they go off when an enemy comes
within 1.3 m (up to 85 damage within 3.2 m). The host decides who a mine hits.

**Feedback.** A damage number floats over whoever you hit (yellow = headshot). "You took
out X" / "X took you out" appear in the middle of the screen. When you go down the view
falls to the floor and the screen turns grey; in co-op, after a moment, you watch your
teammate from behind until the round ends.

**Sniper and heads.** The head hit box now covers the whole drawn head (the hero's voxel
head reaches ~2.1 m); a sniper headshot does 150 (always a kill). In the adventure combat a
sniper headshot kills any enemy. Reloading (by hand or when the magazine is empty) leaves
the scope; aim again to scope back in.

**Random starts.** Every round you start at a random free spot on your side
(`arena.js` → `extras.spawnPts`, never the same spot twice in a row); bots too.

**Sprint.** Hold **Shift** (touch: push the stick to the edge) to run 1.5× faster
(`CONFIG.FP.SPRINT`), in missions, the adventure world and the arena.


## AI fighters (مقاتلو الذكاء): human player vs AI fighter

Fight → **مقاتلو الذكاء**: choose one of 10 opponents (picture, ability, difficulty
stars, short description, strength, weakness), then the usual buy screen and rounds
(first to 3). Built on the existing arena combat — same hit boxes, weapons, damage,
kill feed, scoreboard — in `js/duel/fighters.js` (`VR.Fighters`), switched on by
`VR.DuelBots` when the match is `diff: 'f_<id>'`.

| Fighter | Ability (cooldown) | Kit / health | Plays like |
|---|---|---|---|
| DASHER ★★ | Dash (3.2 s): 6 m burst | SMG · 90 | dashes in from afar, dodges when you aim at it, hits and runs, retreats when low |
| FLASH ★★★ | Flash (5.5 s): blink ≤ 8 m | shotgun + pistol · 95 | gets near, blinks beside / behind you (only to a free spot it can see you from), no long fights |
| TANK ★★ | Heavy Shield (9 s): −65 % damage for 3 s | heavy MG · 180, slow | always walks at you, raises the shield when hit or aimed at |
| BLASTER ★★★ | Energy Shot: 4 charges, 1.6 s each | pistol · 85 | keeps 13-24 m, backs off when you close in, real flying orbs (dodgeable, walls stop them) |
| BOMBER ★★★ | Bomb (3.4 s): red circle, blows after 1.1 s | revolver · 100 | throws where you are going; walls block the blast |
| HEALER ★★ | Self Heal (14 s): +45 over 1.4 s | SMG · 100 | hits then steps back; when hurt hides and heals standing still — a hit stops the heal |
| FREEZER ★★★ | Freeze Blast (5.5 s): you move at 50 % for 2 s | shotgun · 95 | freezes you, then rushes in |
| BERSERKER ★★★ | Rage (once): ×1.45 speed, ×1.4 damage, faster fire for 7 s, no extra defence | shotgun · 115 | normal until low, then reckless |
| TRICKSTER ★★★★ | Decoy (9 s): a copy for 5 s that never shoots; any hit pops it | SMG + pistol · 90 | sends the copy one way, flanks the other |
| NINJA ★★★★★ | Shadow Strike (6 s): rush + 62 knife hit, then pulls back | rifle · 100 | patient, sidesteps your aim, strikes when you reload or come close |

**Abilities are modules** (`ABILITIES`: name, cooldown, duration, range, damage,
movement effect, status effect, vfx, sfx, `use()`); **behaviour priorities** per
fighter are small functions (`BRAINS`). A new fighter = one `FIGHTERS` entry (+ an
ability if new).

**Fair play:** a fighter only knows where you are when it sees you (line of sight and
in its ~155° field of view) or hears your gunshots; otherwise it goes to where it last
saw / heard you and then searches. Reaction time ≥ 0.3 s, aim error that grows when you
move, limited turning, real cooldowns. It reads only what a person can see: where you
look and whether you reload. The ordinary computer players now follow the same "no
seeing through walls" rule. Reward for beating a fighter: 40 coins × its stars.

## Spear, bow, the SHRINKER, clear view, the pixel font

* **Spear** (الرمح, 250 on the buy screen): melee with a 3.4 m reach (the knife: 2.3 m), 60 / 110,
  slower. It takes a weapon slot (the knife stays the extra one).
* **Bow** (القوس, 300): one arrow at a time, a real arrow flies to the target (a miss sticks in
  the wall), 48 / 115, nocks the next arrow by itself and keeps aiming while it does. The limb sits
  left of the arrow so the middle of the screen stays free.
* **SHRINKER** (المتقلّص, the 11th AI fighter, ★★★★): every hit makes it 30 % smaller and twice as
  fast (70 → 49 → 34 → 24 % size, up to 5.5× speed); its hit boxes and eyes shrink with it; its
  shots do 45 % damage. Fast movers now move in short steps, so they never pass through walls.
  Playing as the SHRINKER does the same to you (lower eye, smaller hit box, up to 4× speed).
* **Nothing covers the enemy**: your own gun has no smoke and only a tiny flash (none while aiming /
  scoped); remote muzzle smoke, death smoke and dust are low and short; screen tints are light.
* **Font**: a blocky pixel font like the reference picture, self-hosted in `fonts/` (SIL OFL):
  Tiny5 for Latin and numbers, Handjet for Arabic; titles get a hard shadow + soft glow (and are
  slanted in English). In-world signs still use Cairo.

## Fighter levels, teams, playing as a fighter, loot arena, hostages (`js/duel/powers.js`)

**Fighter levels and teams.** The fighter screen picks **one to three** opponents (click to add,
click again to remove) and a **level**: normal / medium (the numbers in `FIGHTERS`) / hard /
impossible. A level scales aim error, reaction, turning, fire rate, headshot chance, ability
cooldown, health, speed and the reward (`VR.Fighters.LEVELS`). The match key is
`f_<id>[+<id>…]@<level>` (old `f_<id>` still works = medium).

**Play as a fighter** («ألعب بشخصية»): pick one of the 10 and its ability is yours on the
**ability key** (X / mouse 4, Settings → Controls): dash, blink, heavy shield (−65 % damage),
energy shots (4 charges), bombs (red circle, then the blast), self-heal (slows you, a hit stops it),
freeze shot (slows the bot), rage (once a round), decoy (the bots shoot it), shadow strike. Same
cooldowns as the fighter. Your effects use that fighter's feedback profile.

**Loot arena** («ساحة التحدي»): Fight → 🎁, 1-3 bots at a difficulty. No buy screen: pistol, knife,
grenades. Six glowing items (beam + ring by rarity) lie on the floor and one comes back every
10 s; **E** picks up. They are never sold and are stronger than the shop:

| Weapon | vs shop |
|---|---|
| Railgun (المدفع الكهرومغناطيسي) | 75 / 200 — beats the sniper's 55 / 150 |
| Plasma rifle | 24 per shot at 0.1 s — far above the rifle |
| Minigun | 16 per shot at 0.045 s, 150 rounds |
| Golden Fang | 60 / 150 pistol |
| Thunder shotgun | 10 pellets × 18 |

Powers (charges, on the ability key): Meteor (huge bomb), Overshield (absorbs 90), Phase jump
(3 × 11 m blinks), Regeneration (+70), Frost nova (area slow + damage), Overdrive (rage ×1.6),
Storm orb (4 big orbs). A loot gun fills the second gun slot or replaces the one in hand (a
replaced loot gun drops on the floor). Each round starts again with the pistol and new loot.

**Hostage** (vs the computer): standing next to an enemy **at its side or behind it** (not in its
±60° front), **F** grabs it. It stays in front of you (a bit to the left, so you can still aim);
you walk at your normal speed but cannot sprint; your own shots go past it. Shots from the front
(±75°) hit the hostage instead of you: it takes **3 hits or two killing shots (200)**, then falls.
A grenade jump makes it slip away (it lives); F again lets it go.

## Feedback & effects layer (المؤثرات) — `js/duel/feedback.js`

A layer **on top of** the arena's systems (player, camera, weapons are unchanged): it reacts to
the events they already have — the hit / kill messages (`w` weapon id + `head`), the
controller's jump / land / slide / burst events, the streamed positions — so everything also
shows on the other player's screen without new network messages (one exception: `fell`, the
guest telling the host it fell out of the arena).

**Profiles** (`VR.Feedback.PROFILES`, `register(id, partial, from)`): colours, matter (organic /
robotic / armored / magic), element, death style, crit effect, run trail, arm style, weapon
sway, step sounds, landing weight, camera shake. `hero`, `fridge` and the 10 fighters
(`f_<id>`) are defined; **a new character is one `register()` call**, and an AI fighter can carry
its own `fx: {…}` in its `FIGHTERS` entry (its element comes from its ability's `elem`).

| Event | What you get |
|---|---|
| elimination | by cause + victim profile: **A** radiant core burst (headshot, energy / ice abilities), **B** dust poof, **C** progressive disintegration (body shrinks bottom-up while particles rise), **D** shockwave ring, **E** debris (sparks + shards for robotic / armored, ash + light motes + smoke for organic / magic), **F** explosive (mines, bombs, fire), **G** fall. Intensity +headshot, +big damage, +ability, +last of the round (extra ring). Body hidden or dissolved, never left standing |
| hits | particles at the hit point: normal / crit (stars, sparks or shards by profile) / armor (Tank's shield: sparks + ripple) / ability (element). Hit marker per type + a red rotating **kill** marker. Damage numbers rise, pop, fade, coloured by type; fast hits on one target add up into one number |
| on me | red arc pointing at the shooter, arm flinch, element tint for ability / blast hits, pulsing low-HP vignette |
| round end | banner slides in and out, the winner's team colour flashes; vs the computer the last kill gets a 0.35 s slow motion |
| arms (first person) | opposite-phase swing tied to speed (walk → run → sprint lean), lag on direction changes, a settle on sudden stops, jump-up / falling / landing compression / slide / dash / hit / ability poses. Styles: normal, agile, fast, heavy, robotic (stepped), magic (hover) |
| weapon in hand | per-weapon pose (light pistol, steady sniper, heavy MG, knife ready…), look + move inertia back to centre, a reduced share of the run motion, sprint pose; much less while aiming, none in the scope |
| movement | speed lines + FOV kick (sprint, dash, fast falls), footstep dust by surface (stone, wood, metal sparks, dirt, snow, water, energy), landing ring + dust + sound by weight + camera pulse (stronger from high), slide trail / scrape, dash afterimage |
| weapons | muzzle by class (small, heavy + smoke, precise thin streak), tracer colour per weapon, impacts by material (metal sparks, wood splinters, stone chips + dust, soft dust / spray, energy ripple) — the level now remembers each block's material |
| abilities | one interface: `fb.ability(stage, {pos, dir, elem, color, radius, me})`, stages charge / launch / trail / area / impact / end; elements fire, electric, ice, poison, energy, mechanical, shadow, nature, magic, blast differ in colour **and** motion (rise, jitter, fall, drift), density and sound |

**Performance:** two instanced voxel particle pools (solid + glow), 12 rings, 10 sprites and 2
lights that always stay in the scene (no shader recompiles); maximum lifetimes, automatic
cleanup, fewer cosmetic particles far away and on lower quality; hit confirmation and
eliminations take the place of cosmetic particles when the pool is full; sounds are throttled.

**Settings → ✨ Effects** (accessibility): camera shake 0-100 %, screen flashes, speed effects,
slow motion, damage numbers, effect quality (auto follows Graphics).

## Characters, colours, fullscreen

- **Characters:** Hero (default) and **Mr. Fridge** (`character.js`). A character can define
  `fpArms` for simpler first-person hands (the fridge shows only cuff + mitten).
- **Automatic challenge colours:** in a race or a 1v1 duel the inviter/host stays **white**
  and the other player is **grey** ("سكني"): runner, race ghost, duel body and first-person
  hands. Everything goes back to white when the challenge ends (`VR.toneCharacter`).
- **Fullscreen:** button in the menu corner, Settings toggle, pause menu, mission HUD and duel
  pause card. Once chosen, PLAY and "Start mission" go back to fullscreen. iPhone Safari has no
  page fullscreen: Settings explains "Add to Home Screen" (`manifest.webmanifest`, display fullscreen).
- **Tunnel camera:** the runner camera is held under the tunnel roof (5.9 m) while it, the
  player or the stretch just ahead is in a tunnel (`Game.tunnelCover`).

## Performance notes

- Every model is built once and pooled (`VR.Pool`); spawned objects share
  geometry and materials.
- Coins, gems and sparkles are `InstancedMesh` (one draw call each).
- Each mountain section is built once (merged boxes, hidden faces dropped)
  and shared by all biomes; curved / sloped sections are bent on the CPU
  (~5 ms per 40 m). Sections are pre-built while the menu is open.
- The cloud sea is one instanced mesh; far peaks are one mesh (hidden on Low).
- No real-time shadows (a blob shadow under the player), no post-processing.
- Draw distance is 6 chunks on High, 4 on Low (Settings → Graphics).
- The world is shifted back to the origin every 600 m for float precision
  on very long runs.

## Replacing sounds

```js
VR.Audio.useFile('coin', 'sounds/coin.mp3');   // any name from SYNTH in audio.js
VR.Audio.useMusicFile('sounds/theme.mp3');
```

## Extending

| Feature | Where |
|---|---|
| New power-up | `CONFIG.POWERUPS`, icon in `prefabs.js ICONS`, effect via `game.powerups.active('id')` |
| New obstacle | `VR.OBSTACLE_TYPES` in `prefabs.js`, then use it in a recipe |
| New recipe | `RECIPES` in `patterns.js` (the fairness check applies automatically) |
| New route section | `sec(...)` in `terrain.js`; new profile in `route.js` |
| Missions / achievements | hook into `Game.onCoin`, `onPowerUp`, `gameOver` |
| Leaderboards | send `this.score` from `Game.gameOver()` |
| Shop / unlocks | `game.bank` already stores lifetime coins |
