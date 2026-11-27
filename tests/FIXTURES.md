# Optional test files (BMS files)

Some tests compare the program with files that Falcon BMS itself wrote. These files are **not** in the repository (BMS data is not ours to redistribute): `tests/fixtures/`, `tests/golden/` and `app/js/data/local/` are gitignored. When a file is missing the test prints a "skip" line and goes on (`tests/fixture.mjs`, `tools/fixtures.py`), so `npm test` works on a fresh clone.

## Setting them up from a BMS installation (BMS 4.38.2)

1. The tables of the game and the built-in data of the tests (missiles, bombs, aircraft):
   `node tools/make-local.mjs --objects <Data\TerrData\Objects> --campaign <Data\Campaign> --sim <Data\Sim>`
   (writes `app/js/data/local/index.js`, `missilefallback.js`, `bombfallback.js`, `acfallback.js` with the readers of the program).
2. Copy the files below into `tests/fixtures/` (spaces of a file name become `_`).
3. `npm run test:update` writes `tests/golden/golden.json` (the datacards of the campaigns below): run it again after a change of the cards that is wanted.

| File (in `tests/fixtures/`)                                                           | Used by                                                                  | Where it comes from                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `beartrap/PSI_BEAR_TRAP_26.*` (`.cam`, `.fmap`, `.iff`, `.l16.txtpb`, `.twx`, `.ini`) | most campaign tests (ATO, map, mission, seat, weapons, objects, loadout) | `Data\Campaign` (a campaign started from Save3)    |
| `beartrap/Evil19_2_.ini`                                                              | the DTC of the browser tests (map, seat, card, weapons, dtcpage, l16 …)  | `User\Config\<callsign>.ini`, saved with Bear Trap |
| `psikorea/PSIKorea.*`, `koreau2/KoreaU2.*`                                            | carriers (the Vinson, the two Wasps), golden, mission, te, campaign ini  | `Data\Campaign`                                    |
| `saves/Save0-5.cam`                                                                   | objinit, objects (the owners of the scenario)                            | `Data\Campaign`                                    |
| `te/TE_BMS_06_F-18C_QRA.*`, `te/TE_BMS_04_F-16_DCA.*`, `TE_BMS_06_F-18C_QRA.ini`      | run-te, te-test, campaign ini (byte for byte)                            | `Data\Campaign`                                    |
| `misdata/` (`*.dat`, `MisTypes.lst`, `Lofttables/`)                                   | run-missiledata                                                          | `Data\Sim\Misdata`                                 |
| `squadron/Evil19.lbk`, `squadron/PhoneBkn.ini`                                        | run-squadron                                                             | `User\Config`                                      |
| `expect.json` (`lbk`, `beartrapSqd`: the values of that logbook and squadron)         | run-squadron (the numbers; without it only their shape)                  | written by hand, checked in the logbook editor     |

Still without a file: `evilkorea/EvilKorea.cam` (the checks of a campaign that is not in the fixtures any more) and `tests/golden/parsers.json` (the results of the first prototype); `fixtures/balkans` (another theater).

`BMS_DATA=<path of the Falcon BMS folder>` makes the game-data tests (`npm run test:bmsdata`) read the install directly; without it they are skipped.

Rules: never `git add -f` a file of these folders; a new real-file check must skip when its file is absent and must not copy any part of the file into the code or the repository.
