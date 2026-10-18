# BMS Cards: open items (updated 2026-10-18)

## To implement
1. **Squadron page**: v96 done: squadron (name, motto, notes), fixed roster with role/notes, green dot when a pilot is online (public WebTorrent trackers + WebRTC, squadron secret in the `BCS.` invite), mission sent to one pilot or all online, campaign section (kills, aces, share per squadron). Logbook statistics decoded (v97, medals not yet: needs a logbook with known medals), server list from PhoneBkn.ini, trackers editable in Settings. Squadron page v98: Members / Me / Settings, several squadrons, moderation. Still to do: squadron window values (aircraft, experience, morale, supply, rating, kills: needs a campaign saved with the in-game values noted), test with the real trackers and two PCs over the internet (STUN).
2. **OpenTaxiway-based airbase data** (to decide after a test, see below): runway length and width, taxi chart for the kneeboard, taxi time from the real distance.
3. **MDC autofill**: removed for now (the MDC is filled by hand); to be redone later.
4. ~~AGPL-3.0 licence~~ done: the repo is public (`Ciga10/BMS-Cards`), no BMS data inside. Work goes to the `dev` branch; `main` only at the official beta.

## To check on the real PC
- Datacard: positions of the cells; MDC layout against the game.
- Terrain elevation (HeightMap.raw) against the airbase elevations of the AIP; Misdata units; VIP; physical toss; performance numbers.
- Missiles: 2-3 DLZ readings in the cockpit against Rmax / DLZ / MAR of the Missiles page.
- Take-off fuel: Min.Fuel never above the fuel on board (legs under 300 kt are flown at 300 kt); TO Fuel with 10 min of taxi (~300 lb).
- Hourly weather maps (`WeatherMapsUpdates`) and the wind layers (5,000 ft steps assumed).
- Cards in memory (`cardmemory`) come back after a restart; opening a mission file merges its cards.
- Screenshot angle: proportions on datacard and kneeboard at several angles with the real map.

## Assumptions made when reading BMS files (to confirm)
- Runway length: not in the files read; typed on the Performance page. Runway headings from the ATC files (no L/R); without an ATC file heading = number x 10 (magnetic or true unknown).
- Airbase elevation from the AIP table; terrain elevation format deduced (little-endian signed 16-bit feet); never checked on real data.
- Misdata: ownship speed in ft/s, third axis = target altitude, table multiplier; mean missile speed Mach 2.2 (HARM) and 2.5 (BVR); Rmax against aspect is an estimate (R = Rhead (Vm+Vt cos a)/(Vm+Vt)).
- Fuel: 10 min idle taxi, 500 lb joker margin, 300 kt floor on slow legs.
- Weather: wind direction is where it comes FROM; 10 wind layers every 5,000 ft (index 4 = 20,000 ft).
- Only the Korea theater was checked; add-on theaters are untested.

## Small open items
- A saved mission weighs about 1.5-2 MB with the hourly weather maps.
- The git remote prints a "repository moved" notice (harmless; the environment resets the address).

## OpenTaxiway (github.com/oakdesign/OpenTaxiway)
Python tool (MIT, 2 commits, 1 star) that reads Falcon BMS BML models and draws flat primitives as SVG/OBJ; it can go from a CampID (e.g. Osan) to the taxiway model through CampObjData.XML, OCD/FED and Falcon4_CT.xml. Useful for runway size and taxi charts. It is Python and the app is JavaScript/Tauri, and BMS data cannot be shipped, so the way is a small BML reader written in JavaScript (MIT is compatible with AGPL; LZ4/LZMA needed), reading the user's install at run time. First a test with one airbase (BML file + XML files) against known runway lengths.

- Check: takeoff lift gain (1.43) is calibrated on a single WDP point; collect heavy-load data points.

- Squadron page: the user supplied `PhoneBkn.ini` (phone book: `[Contact n]`, Description, IPaddress, Voicehostip, bandwidth) and `Evil19.lbk` (pilot logbook, binary/obfuscated), both from `Falcon BMS 4.38\User\Config`. To be studied when the page starts.
- **TURN server** (backlog): the user is behind CGNAT; first real two-PC tests with STUN only. If they fail, a free Oracle Cloud VM could run coturn (temporary credentials) and our own tracker.


## Squadron online (state of 2026-10-18, to retest)
- The two pilots saw each other in the swarm of the public tracker but never connected: the program announced as a seeder (`left: 0`) and some trackers never match two seeders. Now it announces as a downloader (`left: 1`). Not yet confirmed on real PCs (no way to test for now).
- Diagnostics in Settings > Connection (offers/answers, ICE states, size of the swarm per tracker, last error, "Test my network"), optional TURN server field, STUN off by default (migrated for old saves).
- Windows Firewall: no rule is created by the program; if it turns out to block the traffic, add a "Allow in Windows Firewall" button (elevated netsh) or an installer.
- Option for later: own tracker / coturn on a free Oracle VM; Iroh (Rust) only if WebRTC proves unreliable.

## DTC and missions (2026-10-18)
- A mission opened from file now knows where to write its DTC: the path saved in the mission if the file exists here, else `<DTC folder>/<name>`.
- Overwriting the DTC also writes `<campaign name>.ini` (created if missing) and `Autosave.ini` (if present) in the DTC / campaign folders, which BMS loads for a campaign (to confirm in game).
- Cards are no longer saved in the mission folder; `cardmemory` is the only place (loaded at start, never written before it has been read).
- Default mission name: package number + callsign (e.g. `1301 Hawkeye 4`).
