# BMS Cards: open items (updated 2026-10-17)

## To implement
1. **Squadron page**: v96 done: squadron (name, motto, notes), fixed roster with role/notes, green dot when a pilot is online (public WebTorrent trackers + WebRTC, squadron secret in the `BCS.` invite), mission sent to one pilot or all online, campaign section (kills, aces, share per squadron). Logbook statistics decoded (v97, medals not yet: needs a logbook with known medals), server list from PhoneBkn.ini, trackers editable in Settings. Squadron page v98: Members / Me / Settings, several squadrons, moderation. Still to do: squadron window values (aircraft, experience, morale, supply, rating, kills: needs a campaign saved with the in-game values noted), test with the real trackers and two PCs over the internet (STUN).
2. **OpenTaxiway-based airbase data** (to decide after a test, see below): runway length and width, taxi chart for the kneeboard, taxi time from the real distance.
3. **MDC autofill**: removed for now (the MDC is filled by hand); to be redone later.
4. **AGPL-3.0-or-later licence**: last step before any public release (LICENSE, CREDITS.md, README). The embedded AIP elevation table must be removed or cleared first.

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
