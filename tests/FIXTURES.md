# Optional test files (BMS files of the developer)

Some tests compare the program with files that Falcon BMS itself wrote. These files are **not** in the repository (BMS data is not ours to redistribute): `tests/fixtures/` and `tests/golden/` are gitignored. When a file is missing the test prints a "skipped" line and goes on, so `npm test` works on a fresh clone.

| File (in `tests/fixtures/`)                                            | What it checks                                                                | Where it comes from                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `TE_BMS_06_F-18C_QRA.ini`                                              | a Tactical Engagement `.ini` comes back byte for byte (`run-campaignini.mjs`) | `Data\Campaign` of the BMS install, `TE_BMS_06_F-18C_QRA.ini` |
| `te/TE_BMS_03_F-16_DEAD.ini`                                           | the same, a second TE                                                         | `Data\Campaign\...`                                           |
| `ROLLING_FIRE_HARD_campaign.ini`                                       | the same for a campaign `.ini`                                                | the campaign folder written by BMS                            |
| the campaign files (`.cam`, `.uni`, `.tea` ...) and the golden results | `run-golden.mjs`, `run-parsers.mjs` ...                                       | any campaign of the install                                   |

`BMS_DATA=<path of the Falcon BMS folder>` makes the game-data tests (`npm run test:bmsdata`) read the install directly; without it they are skipped.

Rules: never `git add -f` a file of these folders; a new real-file check must skip when its file is absent and must not copy any part of the file into the code or the repository.
