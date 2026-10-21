# BMS Cards: open items (updated 2026-10-21)

`main` holds the **0.8 alpha** (2026-10-21, backup before the split of index.html); the first beta will be **0.9 beta** (set in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` when `dev` is merged).

## To implement
1. **Squadron page**: still to do: squadron window values (aircraft, experience, morale, supply, rating, kills: needs a campaign saved with the in-game values noted); medals in the logbook `.lbk` (needs a logbook with known medals); test sending / receiving missions, mission leader and roster sync with real pilots.
2. **MDC format autofill** of the cells that have no Datacard value (M1-M4, audio presets, data link, NAV, AIRSPACE/TGT, srv): filled by hand for now.
3. **Game briefing import** (feasible, to decide): BMS writes `User\Briefings\briefing.txt` (plain text) when "Briefing output to file" is ON and "HTML Briefings" OFF, after Briefing > Print on the 2D map. It would give what the campaign file lacks (the flight and seat the pilot chose, callsigns, roster, package, comms, weapons). Needs a real `briefing.txt` sample to write the parser (the UOAF `bms_html_briefing` project and EZBoards both read it).
4. Ideas to define with the user: objective faction colours on the map; Mil Climb schedule; time at which a unit is spotted; EW radar state of SAM units; names of non-air-defense units (now "ordinal + category + Battalion"); AIP vs game runway length; interpolated terrain elevation (bilinear) if the 3-31 ft differences ever matter.
5. **BEFORE the 0.9 beta (decided 2026-10-21)**, in this order:
   a. DONE: warnings for a campaign file newer than 109 and for XML tables without the expected fields.
   b. Other theaters (Balkans), DONE in code 2026-10-21, to check on the real PC: the `.cam` v110 is read with the class table OF THE THEATER (`Falcon4_CT.xml` of its objects folder); map centre from `Theater.txt` (`setGeo`); weather map v5 (5 arrays after the winds); `.tdf` paths written in full no longer get the add-on folder twice; the Korea-only base maps are hidden in other theaters. NOT done: offline coastlines of other theaters (the basemap data covers East Asia only), AIP of other theaters (`KTO_AIP.pdf` is Korea's), the kneeboard folder `KoreaObj`, theater map picture other than a custom import, other theater's `Falcon4_*` tables not found fall back to empty.
   c. DONE (2026-10-21): Tactical Engagement files read like campaigns, with their own menu (see ARCHITECTURE v93). To check on the real PC: TE list in the game's Campaign folder, the DTC `<TE name>.ini` written for a TE, other TEs (weather, several player flights).
   d. PARTLY DONE: three blocks moved out of `app/index.html` (DDS, widgets, objective reader); the rest depends on the shared state and is left as it is for now (a full split after the beta).
6. **Backlog (online)**: "Allow in Windows Firewall" button (elevated netsh) or installer, only if the firewall turns out to block the traffic; own tracker / TURN (free Oracle VM with coturn) if STUN is not enough for some networks (the user is behind CGNAT; STUN worked on two real PCs); Iroh only if WebRTC proves unreliable. STUN stays off by default (decided).

## To check on the real PC
- Datacard cell positions; MDC format against the game's MDC; pilot-name dropdown from the roster.
- Radar coverage (Map > Display > "Radar coverage at 5,000 ft"): compare the polygons with the game's blue circles around fixed stations (read from OCD/FED/FCD; the FCD detection unit is assumed to be km) and with SAM / ship radars; speed with the real HeightMap.raw.
- Terrain elevation (HeightMap.raw) against the airbase elevations of the AIP; Misdata units; VIP; physical toss; performance numbers; takeoff lift gain (1.43, calibrated on one WDP point: collect heavy-load points).
- Missiles: 2-3 DLZ readings in the cockpit against Rmax / DLZ / MAR of the Missiles page.
- Take-off fuel: Min.Fuel never above the fuel on board (legs under 300 kt flown at 300 kt); TO Fuel with 10 min of taxi (~300 lb).
- Weather: hourly maps (`WeatherMapsUpdates`) and the 10 wind layers (0-50,000 ft) against the game; the Weather tab (conditions, wind barbs, temperature, pressure, clouds, visibility); fuel plan with winds aloft.
- HARM: Target Isolate / Glide Inhibit as the manual table (default glides and flexes; TI no flex; GI no LOTG but EOMG; both neither). Doubtful: EOMG with TI off and GI on (NC): the forum says yes, one user could not see it. Manual pages 468-474 could not be read from here.
- Own satellite layer (Settings): a real provider (address, key, credit, deepest zoom) on the Map, Weapons and Weather pages.
- Cards in memory (`cardmemory`) come back after a restart; opening a mission file merges its cards.
- Screenshot angle: proportions on datacard and kneeboard at several angles with the real map.
- NAV OFFSETS: VIP / VIPPUP / VRP / VRPPUP written as `steerpoint,bearing,range,elevation`; check that VRP / VIP / OA1 / OA2 show in the DED. OA1 button (Weapons) drives the OA1 row.
- Overwriting the DTC also writes `<campaign name>.ini` and `Autosave.ini`, which BMS loads for a campaign (to confirm in game).
- Runway length from the objective files: checked on 7 bases (within 0.3%); compare with the AIP of the game; bases without an ATC file get no automatic length.
- Docs tab, online squadron (missions, leader, roster sync).

## Assumptions made when reading BMS files (to confirm)
- Runway headings from the ATC files (no L/R); without an ATC file heading = number x 10 (magnetic or true unknown).
- Airbase elevation from the AIP table; terrain elevation format deduced (little-endian signed 16-bit feet, one floor sample, no interpolation).
- Misdata: ownship speed in ft/s, third axis = target altitude, table multiplier; mean missile speed Mach 2.2 (HARM) and 2.5 (BVR); Rmax against aspect is an estimate.
- Fuel: 10 min idle taxi, 500 lb joker margin, 300 kt floor on slow legs.
- Weather: wind direction is where it comes FROM; layers at 0, 3, 6, 9, 12, 18, 24, 30, 40, 50 thousand ft (BMS manual only); condition 0 sunny, 1 fair, 2 poor, 3 inclement (a few 4s drawn as inclement). The Weather page draws the cells axis-aligned (the real grid is turned by the grid convergence, small); temperature and pressure exist only at the surface; it uses the base map chosen on the Map page.
- HARM switches from the manual table (BMS 4.38 manual); the side view is schematic.
- Radar coverage: UCD / FCD `Det_LowAir` taken as km, 4/3 earth radius, 5,000 ft MSL; owners of untouched fixed stations are unknown (grey).
- Korea was checked on real files; the Balkans only on one `.cam` (v110), one `.fmap` (v5) and `Theater.txt` (tests with local fixtures, no check inside the game).

## Notes
- A saved mission weighs about 1.5-2 MB with the hourly weather maps.
