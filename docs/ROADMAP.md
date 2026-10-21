# BMS Cards: open items (updated 2026-10-19)

## To implement
1. **Squadron page**: v96 done: squadron (name, motto, notes), fixed roster with role/notes, green dot when a pilot is online (public WebTorrent trackers + WebRTC, squadron secret in the `BCS.` invite), mission sent to one pilot or all online, campaign section (kills, aces, share per squadron). Logbook statistics decoded (v97, medals not yet: needs a logbook with known medals), server list from PhoneBkn.ini, trackers editable in Settings. Squadron page v98: Members / Me / Settings, several squadrons, moderation. Still to do: squadron window values (aircraft, experience, morale, supply, rating, kills: needs a campaign saved with the in-game values noted), test with the real trackers and two PCs over the internet (STUN).
2. **Airport charts** (OpenTaxiway-style): not wanted for now; everyone can load the AIP picture. The runway length, the data that mattered for the calculations, now comes automatically from the objective files (done, see below); taxi time is not wanted.
3. **MDC format autofill** of the cells that have no Datacard value (M1-M4, audio presets, data link, NAV, AIRSPACE/TGT): filled by hand for now.
4. ~~AGPL-3.0 licence~~ done: the repo is public (`Ciga10/BMS-Cards`), no BMS data inside. Work goes to the `dev` branch; `main` only at the official beta.
5. **Game briefing import** (feasible, to decide): BMS writes `User\Briefings\briefing.txt` (plain text) when "Briefing output to file" is ON and "HTML Briefings" OFF, after Briefing > Print on the 2D map. It would give what the campaign file lacks (the flight and seat the pilot chose, callsigns, roster, package, comms, weapons). Needs a real `briefing.txt` sample to write the parser; sections vary (the UOAF `bms_html_briefing` project and EZBoards both read it).

## To check on the real PC
- Datacard: positions of the cells; MDC layout against the game.
- Terrain elevation (HeightMap.raw) against the airbase elevations of the AIP; Misdata units; VIP; physical toss; performance numbers.
- Missiles: 2-3 DLZ readings in the cockpit against Rmax / DLZ / MAR of the Missiles page.
- Take-off fuel: Min.Fuel never above the fuel on board (legs under 300 kt are flown at 300 kt); TO Fuel with 10 min of taxi (~300 lb).
- Hourly weather maps (`WeatherMapsUpdates`) and the wind layers: the 10 layers (0-50,000 ft, BMS manual) against the game; the Weather tab (conditions, wind barbs, temperature, pressure, clouds, visibility) against the game's weather map; the fuel plan consumption with the winds aloft.
- HARM: Target Isolate / Glide Inhibit behave as the manual table (default glides and flexes; TI no flex; GI no LOTG but EOMG; both neither). The one doubtful point is EOMG with TI off and GI on (NC): the forum thread on the manual table says yes, one user could not see it in a test. The manual pages 468-474 could not be read from here.
- Own satellite layer (Settings): try a real provider (address, key, credit, deepest zoom) on the Map, Weapons and Weather pages.
- Datacard is now the first tab and the page open at start (Data Cartridge second); BVR Timeline has the Shot card under the datacard.
- Cards in memory (`cardmemory`) come back after a restart; opening a mission file merges its cards.
- Screenshot angle: proportions on datacard and kneeboard at several angles with the real map.

## Assumptions made when reading BMS files (to confirm)
- Runway length: read from the objective files (OCD PHD/PDX, Type 8 corners; checked only on Osan: 9,004 x 149 ft); typed on the Performance page it overrides. Runway headings from the ATC files (no L/R); without an ATC file heading = number x 10 (magnetic or true unknown).
- Airbase elevation from the AIP table; terrain elevation format deduced (little-endian signed 16-bit feet); never checked on real data.
- Misdata: ownship speed in ft/s, third axis = target altitude, table multiplier; mean missile speed Mach 2.2 (HARM) and 2.5 (BVR); Rmax against aspect is an estimate (R = Rhead (Vm+Vt cos a)/(Vm+Vt)).
- Fuel: 10 min idle taxi, 500 lb joker margin, 300 kt floor on slow legs.
- Weather: wind direction is where it comes FROM; the 10 wind layers sit at 0, 3, 6, 9, 12, 18, 24, 30, 40, 50 thousand ft (BMS manual table; real maps may differ from the default shape). Layer altitudes were only checked against the manual, not against the game.
- Weather condition: 0 sunny, 1 fair, 2 poor, 3 inclement (BMS wiki); the real files carry 1-3 (and a few 4s in one file): the 4 is drawn as inclement.
- HARM switches: two independent switches (Target Isolate, Glide Inhibit) from the manual table (BMS 4.38 manual, HARM page); the side view is schematic.
- Weather page: it uses the map of the Map page (base map and layers chosen there), so the theater support is the one of that map. The cells are an axis-aligned image over lat/lon bounds (as the Map weather filter), the real grid is turned by the map grid convergence (small). Temperature and pressure exist only at the surface.
- Only the Korea theater was checked; add-on theaters are untested.

## Radar coverage (to check on the real PC)
- Map > Display > "Radar coverage at 5,000 ft": compare the polygons with the blue circles of the game around fixed stations (not included yet: they need OCD data) and with SAM / ship radars; check the speed with the real HeightMap.raw.

## Small open items
- **Target coordinates and elevations vs the game (test of 2026-10-19, left as it is on purpose).** Three targets were put in the game and in the program (Hamgyong P-14, Seonginbong, Jinhae helobase). The north/east feet written in the DTC are the same as the game's (checked on the game's `target_96..98` lines). What differs is only the text we show: the latitude of our feet -> lat/lon conversion (`tmInv` / `tmFwd`, origin 38.5 N 127.5 E) is 0.017' (103 ft, about 31 m) south of the game's, equal at 35, 37 and 39 N, with the longitude equal (within 0.001'). Bombs follow the DTC, so nothing is wrong in flight and the lat/lon is a reminder: not corrected. If it is ever corrected: add about 103.2 ft (31.5 m) to the northing in both directions of the conversion.
  Elevations: the game writes interpolated values with decimals (`-5078.497070`, `-3095.777344`, `-10.030000`); we read one sample of `HeightMap.raw` (floor, whole feet): 5078 / 3080 / 16 against 5078.5 / 3095.8 / 10.0 (the game's own screen shows 3075 for the second one). The differences are the slope between samples (+6 and -16 ft): bilinear interpolation of the 4 neighbours would be the next step; `Theater.txt` and `HeightMap.raw` of Korea are needed to choose the scheme (side or side-1 spacing, half-pixel) by matching these three values.
- A saved mission weighs about 1.5-2 MB with the hourly weather maps.
- The git remote prints a "repository moved" notice (harmless; the environment resets the address).

- Ideas not yet written down in detail (to define with the user): objective faction colours on the map; Mil Climb schedule; time at which a unit is spotted; low-altitude radar; refusal runway length (see OpenTaxiway); MDC autofill (item 3); medals in the logbook `.lbk` (item 1); online squadron connection on real PCs; a "Allow in Windows Firewall" button; own tracker / TURN.
- Weather map: the real fmap grid is turned by the map grid convergence; the cells are drawn axis-aligned (as the Map weather filter). Temperature and pressure exist only at the surface.

## Done on 2026-10-19 (all on `dev`)
- Runway length automatic (objective files PHD/PDX), used by the Performance page and the refusal speed.
- Wind layers at the manual altitudes; fmap reader with every field; fuel plan uses the wind aloft per leg.
- Weather tab on the Map page's Leaflet map: filters (conditions, wind, temperature, pressure, clouds, visibility), wind barbs only in Wind, Time & altitude panel on the map (time slider with DEP / TOT / LAND, wind altitude slider only in Wind, opacity slider), airbases with ATIS / TAF, route table, winds aloft, Fill datacard.
- HARM: Target Isolate and Glide Inhibit as two independent switches (manual table).
- Settings: own satellite layer (XYZ tile provider; EOX stays the default).
- BVR Timeline: Shot card under the datacard, drawing smaller. Datacard first tab. Open Mission button in the same green as Open DTC.
- Decided not to correct: the 103 ft latitude text offset and non-interpolated elevations (see Small open items).

- Runway size from `OCD_nnnnn/PHD+PDX` (done 2026-10-19): read on the real PC by the user: Wonju 8,980, Kunsan 9,018, Gwangju 9,300, Osan 9,004, Daegu 8,998, Cheongju 9,001, Iwakuni 8,005 ft (all within 0.2-0.3% of the real runways; Gimpo not tried, no flight). Still to compare with the AIP of the game. Bases without an ATC file get no automatic length (type it).

## OpenTaxiway (github.com/oakdesign/OpenTaxiway)
Python tool (MIT, 2 commits, 1 star) that reads Falcon BMS BML models and draws flat primitives as SVG/OBJ; it can go from a CampID (e.g. Osan) to the taxiway model through CampObjData.XML, OCD/FED and Falcon4_CT.xml. Useful for runway size and taxi charts. It is Python and the app is JavaScript/Tauri, and BMS data cannot be shipped, so the way is a small BML reader written in JavaScript (MIT is compatible with AGPL; LZ4/LZMA needed), reading the user's install at run time. First a test with one airbase (BML file + XML files) against known runway lengths.

- Check: takeoff lift gain (1.43) is calibrated on a single WDP point; collect heavy-load data points.

- Squadron page: the user supplied `PhoneBkn.ini` (phone book: `[Contact n]`, Description, IPaddress, Voicehostip, bandwidth) and `Evil19.lbk` (pilot logbook, binary/obfuscated), both from `Falcon BMS 4.38\User\Config`. To be studied when the page starts.
- **TURN server** (backlog): the user is behind CGNAT; first real two-PC tests with STUN only. If they fail, a free Oracle Cloud VM could run coturn (temporary credentials) and our own tracker.


## Squadron online (state of 2026-10-20)
- **Confirmed on two real PCs (2026-10-20):** the user connected with a friend by ticking the STUN option, so the connection system works. Still to test with real pilots: sending and receiving missions, mission leader, roster sync and the rest of the squadron functions. Consider making STUN on by default (it was needed on real networks).
- The two pilots saw each other in the swarm of the public tracker but never connected: the program announced as a seeder (`left: 0`) and some trackers never match two seeders. Now it announces as a downloader (`left: 1`). Not yet confirmed on real PCs (no way to test for now).
- Diagnostics in Settings > Connection (offers/answers, ICE states, size of the swarm per tracker, last error, "Test my network"), optional TURN server field, STUN off by default (migrated for old saves).
- Windows Firewall: no rule is created by the program; if it turns out to block the traffic, add a "Allow in Windows Firewall" button (elevated netsh) or an installer.
- Option for later: own tracker / coturn on a free Oracle VM; Iroh (Rust) only if WebRTC proves unreliable.

## DTC and missions (2026-10-18)
- A mission opened from file now knows where to write its DTC: the path saved in the mission if the file exists here, else `<DTC folder>/<name>`.
- Overwriting the DTC also writes `<campaign name>.ini` (created if missing) and `Autosave.ini` (if present) in the DTC / campaign folders, which BMS loads for a campaign (to confirm in game).
- Cards are no longer saved in the mission folder; `cardmemory` is the only place (loaded at start, never written before it has been read).
- Default mission name: package number + callsign (e.g. `1301 Hawkeye 4`).

## Weapons, mission buttons (done, to verify on a real PC)
- NAV OFFSETS: VIP / VIPPUP / VRP / VRPPUP are now written as `steerpoint,bearing,range,elevation` (the order the game and WDP use, e.g. `VRP=7,89.8,34248,1170`); the old order is still read. OA rows are `bearing,range,elevation` under `OA1-<steerpoint>`. Check in the game that VRP / VIP / OA1 / OA2 show up in the DED.
- Weapons page: NAV OFFSETS card under the vertical envelope; Apply is dimmed when the DTC already holds what it would write.
- BVR page: Fill datacard is on only when the datacard differs from the table.
- Save mission no longer lights up after only saving the DTC of an opened mission.
- Weapons: OA1 button at the end of the attack profile (and of the HADB / TOSS cards): pop-up = top of climb (pull-down point) or aim-off point; HADB / TOSS = PUP or line-up point. It drives the OA1 row, the plan drawing (diamond) and the side view (small triangle).
