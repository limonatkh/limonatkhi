# Test saves

Made up for the tests (no real player's data). Each file is `{ "storage": { key: value } }`:
the localStorage a player could have, with the game's key names.

| File | What it is |
|---|---|
| `legacy-only.json` | A player from before `cubeexpress.profiles` existed: only the old separate keys (`bank`, `best`, `missions`, `duelStats`). |
| `full-v144.json` | A v1.44 save in the middle of a game: coins and their ledger, shop upgrades, supplies, fight weapons, loot, completed missions, area flags, world state, a place to continue. |
| `partial.json` | An older / partial save: fields missing that the game fills in. |
| `unknown-fields.json` | A save with fields the game does not know (from a newer version or another tool). They must be kept. |
| `corrupt.json` | `cubeexpress.profiles` is not valid JSON. |
| `backup-old-wipe.json` | A save left by an older version whose NEW GAME emptied the wallet, with its `profiles.backup` copy (coins to give back once). |
