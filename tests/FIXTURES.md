# Optional test files (BMS files of the developer)

Some tests compare the program with files that Falcon BMS itself wrote. These files are **not** in the repository (BMS data is not ours to redistribute): `tests/fixtures/` and `tests/golden/` are gitignored. When a file is missing the test prints a "skipped" line and goes on, so `npm test` works on a fresh clone.

| File (in `tests/fixtures/`)                                            | What it checks                                                                | Where it comes from                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `TE_BMS_06_F-18C_QRA.ini`                                              | a Tactical Engagement `.ini` comes back byte for byte (`run-campaignini.mjs`) | `Data\Campaign` of the BMS install, `TE_BMS_06_F-18C_QRA.ini` |
| `te/TE_BMS_03_F-16_DEAD.ini`                                           | the same, a second TE                                                         | `Data\Campaign\...`                                           |
| `ROLLING_FIRE_HARD_campaign.ini`                                       | the same for a campaign `.ini`                                                | the campaign folder written by BMS                            |
| the campaign files (`.cam`, `.uni`, `.tea` ...) and the golden results | `run-golden.mjs`, `run-parsers.mjs` ...                                       | any campaign of the install                                   |

Other files of the developer that some tests use, each test skips without them (`tests/fixture.mjs`, `tools/fixtures.py`):

| File                                                                                                                                        | Used by                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `app/js/data/local/index.js` (the tables of the game, made from the BMS files) and `missilefallback.js`, `acfallback.js`, `bombfallback.js` | most tests that open a campaign; BVR, performance, bombs |
| `beartrap/Evil19_2_.ini`, `Evil19_5.ini`, `Evil19_6.ini` (the DTC saved with that campaign)                                                 | map, seat, card, weapons, dtcpage, l16, mission ...      |
| `beartrap/PSI_BEAR_TRAP_26-double.cam`, `saves/Save0-5.cam`                                                                                 | objects, loadout, objinit                                |
| `evilkorea/EvilKorea.cam` (+ `.fmap`), `te/TE_BMS_03_F-16_DEAD.tac`                                                                         | carriers, golden, te                                     |
| `expect.json` (`lbk`, `beartrapSqd`: the values of the logbook and of the squadron of those files)                                          | run-squadron                                             |

`BMS_DATA=<path of the Falcon BMS folder>` makes the game-data tests (`npm run test:bmsdata`) read the install directly; without it they are skipped.

Rules: never `git add -f` a file of these folders; a new real-file check must skip when its file is absent and must not copy any part of the file into the code or the repository.
