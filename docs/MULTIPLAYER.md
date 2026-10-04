# Multiplayer readiness review (stage 8)

No networking for the adventure was added. This page records what is
already shaped for more than one player, what was changed in this review,
and what a networked version still has to do.

## Ready

| Piece | Why it is ready |
|---|---|
| Player data (`js/core/profile.js`) | Players live in a map (`players[id]`), each with its own wallet, inventory, upgrades, progress, location and stats. Each player has a stable `uid`. `addPlayer`, `setActive`, `activeId`, `playerIds`. |
| World data | Kept apart from players: `Profiles.world(area)` holds what belongs to the place (opened gates, the hidden garden, weapons lying on the ground). |
| Personal vs world flags (`js/missions/missions.js`) | Pickups, coins, notes read, and each area's `personalFlags` (where you have been, what you cleared) are saved per player; everything else per world. A second player sees gates already opened but collects their own coins and clears the arena for their own reward. |
| Coins (`js/core/wallet.js`) | One wallet per player, every credit/debit with a transaction id, so the same reward is paid once per player and never twice. |
| Shop (`js/adventure/shop.js`) | Upgrades and supplies are bought into the active player's profile; upgrade levels have fixed transaction ids. |
| Enemies (`js/combat/enemies.js`) | `update(dt, players)` takes a list: each enemy goes for the nearest player it can see; shots hit any player. |
| Weapon maths (`js/combat/weaponkit.js`) | Pure functions shared by the networked duel and the single-player combat. |
| Course (`js/runner/course.js`) | Deterministic from a seed (already used by the two-player race), finite, and the race result depends only on finish times. |
| Rules (`js/core/rules.js`) | Rules read the player's own progress (e.g. the portal's rest time). |
| NEW GAME | With several players in a save, only the active player starts over; the shared world stays. |

## Still to do for a networked adventure

1. **Authority for world state.** `Profiles.world(...)` is local. A server
   (or a host, like the duel's host referee) must own world flags,
   pickups and enemies, and send changes to the others.
2. **Other players in the scene.** The area manager has one local camera
   and controller; remote players need avatars (the race "ghost" and the
   duel avatar show the pattern).
3. **Encounter rewards for everyone who took part.** Today the first clear
   pays the local player (`encounter.js`, comment marks the spot).
4. **Damage authority.** Enemy damage and player hits are decided locally;
   in a network game the host decides (as the duel host does for shots).
5. **Inventory and items carried in an area** are per player already; items
   *left* in the world (weapon swaps) are world state and need the
   authority from point 1.

## Tests

`stage8.py` (in the test scratchpad): uid and old-save upgrade, world vs
personal flags, a second player in the same world (shared gate, own coins,
own arena reward, own wallet), switching back, enemies with two players,
NEW GAME with two players.
