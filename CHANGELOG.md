# Changelog

What changed for the people who use BMS Cards, version by version. The detailed log of every beta (with the reasons and the tests) is in the git log of the `dev` branch.

## 1.2.0

### Highlights

- **Squadron Briefing**: a live briefing room on the map. The briefer draws (pen, marker, arrows, shapes, text, NATO symbols, CAP orbits, holdings, threat rings, ruler and compass), gives the pen to the pilots he wants, and shows the weather; everybody sees the cursors and follows his view. "Save a kneeboard card" keeps the result.
- **ROE / SOP**: rules of engagement and SOP by phase of flight (mission, ground, take-off and departure, en route, tanker, FENCE / comms / fuel, recovery, weather, night, training, emergencies), with options from the RoKAF Basic Employment Manual, the 8th and 51st FW in-flight guides and AFMAN 11-2F-16V3. Short form on the datacard and in the MDC (5 lines a box), the full text on one or two kneeboard cards.
- **Presets**: a page Squadron > ROE / SOP with two lists, Flight (yours) and Squadron (the commander's), each with a Standard; a click puts a preset on the datacard, a double-click changes it; a preset can be the default of kinds of mission, and a mission received from another pilot gets the squadron's.
- **WEZ exposure time**: when the flight is inside the enemy SAM rings (first entry, last exit), the minutes inside and the largest SAM, on the datacard, the MDC and the map.
- **MDC format** filled automatically, with wider cells and TANK J/B (Joker / Bingo to the tanker).
- **AWACS and JSTARS**: when the package has none, the nearest allied one on station (marked `*`).
- **User Guide**: Settings > Help > User Guide, also as a PDF.
- **Ready to fly**: the tab bar lists what is not saved yet (DTC, kneeboard, mission), with "Write all".
- **A faster map** with all the objects and the political layer on.

### Datacard and MDC format

- Added: TOT / VUL with the WEZ exposure; the elevation of the target steerpoints; ROE and SOP in two boxes.
- Added: the Bingo carries a holding and an alternate fuel when the landing field is IMC (GRN or worse); minutes and pounds on the Performance page.
- Added: the BVR box fills itself with the BVR timeline when it is empty.
- Changed: the notes are laid out in sections (TWR, UHF2, TGT, JTAC, IFF) with the frequencies in columns, 16 to 12 px; big packages use short callsigns (Devil 3 = DL3).
- Changed: the ephemerides on two lines; METAR and TAF show the day of the month of the mission.
- Changed: MDC format: the pilots table without FCR, ID and OWN; wider Tanker, TOT / VUL, flight plan, roll call and Known EOB; Airspace / TGT is the primary target; the escorted flights in short form (ESC DL3 PR4); a shorter, bigger loadout.
- Changed: the Automatic rules open as a panel with sections; the tooltips are up to date and shorter.
- Fixed: the MDC callsign and the red Bingo; a field elevation typed by hand updates the take-off data, the landing and the TAF; the roster lists names, not callsigns; the Joker uses your margin also with the Bingo of the DTC.

### Map

- Added: the filter "WEZ exposure time" (minutes on each ring, the total in the flight label).
- Changed: the filters are easier to read; Pop-up / HADB / TOSS / HARM is a Display filter; the map is smoother with every object on; the first click on an objective zooms to its buildings.
- Fixed: placing a point near a city or an objective no longer opens its window; the labels no longer pop in again when a filter changes.

### Squadron

- Added: the Briefing room (see above), with the weather filters at the hour and altitude of the briefer.
- Added: ROE / SOP page and presets (see above); custom SOP sections, yours or the squadron's.
- Added: a connection troubleshooting in the User Guide (network test, STUN, TURN, direct connection).

### Kneeboard and DTC

- Added: Settings > General > One map screenshot (a new map screenshot replaces the last one).
- Fixed: a card inserted between two now slides from its own place; a kneeboard with only the datacard of no flight no longer shows "Not saved".
- Fixed: the Data Cartridge page refuses radio and ILS frequencies out of band and IFF codes that are not octal; names written into the DTC use plain letters.

### Other

- Added: a notice when a newer version exists (once a day, nothing is downloaded; Settings > General).
- Fixed: aircraft with a probe get the KC-130 first; the weather colour code counts the SCT layers; the ATO is in time order across midnight; a damaged config.json is no longer replaced without asking.

## 1.1.0

### Highlights

- **Pilot seat**: a round button beside each pilot chooses who the Datacard, the MDC format and the DTC are made for. Laser code, IFF (Mode 2 and 3), Link 16 and the loadout of that aircraft follow it.
- **Link 16 in the DTC**: the plan of BMS (callsign letters, number, flight lead, the STNs of your flight and of the package), the Mission, Fighter and Special channels of the campaign, file B, and a window on the map to put a flight in a slot ("Add Link 16").
- **Radio presets in the DTC**: UHF and VHF 5, 6, 13, 15 and the package flights follow the flight on the Datacard.
- **Map**: objectives of the campaign (airbases, factories, SAM sites, ... and the political layer: cities, towns, villages) with the owner ring, MSA and ERAA, TELAR count of the SAM units.
- **Performance**: Overhead or Direct landing, touchdown speed, runway length in the loadout row, ships handled.
- **Settings and data**: a redone Settings window, import from an older version, export of your data.
- **Animations** everywhere (Settings > Animations, and the system "reduce motion").

### Datacard and MDC format

- Added: MSA column in the flight plan and ERAA of the route (information only, from the terrain of the BMS folder).
- Added: the MDC format target table has three rows (primary 99, secondary 98, one free); the menu of points opens on all three.
- Added: the loadout follows the seat when the aircraft of a flight carry different loadouts (A/C 1-2, A/C 3-4); the list in the Config cell still changes it by hand.
- Added: DIST of the loadout row is the runway length of the departure base.
- Added: the METAR of the MDC is written as it is; when it would be smaller than 9 points the cell shows the colour code alone.
- Changed: MDC audio presets 5 (AWACS) and 6 (own flight UHF) were the other way round.
- Changed: the MDC layout is tighter (roll call, Known EOB, loadout row).
- Fixed: a point chosen by hand for the Secondary now goes to row 2 of the MDC table.

### DTC

- Added: Link 16 file A is the plan of BMS (callsign letters and number, flight lead, STNs); file B is writable and empty by default; Mission, Fighter and Special channels written from the campaign.
- Added: IFF codes (Mode 2, Mode 3, time events) and the laser code follow the chosen seat; a note on the IFF page says the codes are the ones BMS saved in the file.
- Added: radio presets (a "from Datacard" switch on the Comms & Nav page, on by default).
- Added: Link 16 page: who is in each slot, a cross to take a flight out, "Back to auto" and "Clear"; donors in two columns.

### Map

- Added: objects of the campaign by type, with a switch for each, "Colour by owner", and the political layer (Cities, Towns, Villages) in its own block of the Objects panel.
- Added: a click on a flight of the package opens "Select flight" and "Add Link 16".
- Added: MSA and ERAA layer; the popup of a steerpoint shows speed, MSA and minimum fuel.
- Added: SAM units show the TELARs that are left ("TELARs n") when the radar is in every launcher vehicle (SA-8, 11, 15, 17, 19); "No FCR" for the others.

### Performance

- Added: Landing choice: Overhead (as before) or Direct (airfield elevation and touchdown speed of the aircraft); the stores on board or dropped. The touchdown speed is an estimate, better for the F-16 and the F-15.
- Added: ships: three schematic drawings (catapults and wires, ski-jump and wires, flat deck), no red cross against a runway, the deck assumed 60 ft above the sea (Performance, Direct landing and Datacard).
- Added: STOVL aircraft (AV-8B, Harrier, F-35B): the take-off roll is compared with the length of the deck, written in DIST; the landing is a rolling estimate only (vertical landing is not modelled).
- Changed: the thrust and the fuel flow of twin-engine aircraft count both engines (before, the F-15, F-18 and A-10 had half the thrust and the AV-8B could not take off). The fuel plan of these aircraft changes too (Min.Fuel, Bingo, Joker).
- Changed: approach alpha of the landing estimate: 13° for the F-16, for the others 90% of the gear-down alpha limit of the flight model file.
- Changed: no afterburner choices (MIL/AB) for the aircraft that have none.
- Changed: the speed axis of the Turn chart stops after the last sustained turn; shorter texts in the Fuel plan.

### Weather and missiles

- Fixed: the weather of the fmap was read one step too high (sunny shown as fair, fair as poor).
- Added: TGT / LDG switch on the Weather page (forecast of the target or of the landing airbase).
- Changed: BVR timeline: a missile menu for each enemy class, its own altitude and speed, kt or Mach, classes corrected with the Threat Guide; surface-to-air missiles and training rounds are no longer in the BVR shot list.

### Optimizations

- Changed: MSA and the heights of the terrain are read in far fewer exchanges; the BMS folder map picture (16K) is cut into blocks and saved in the program's database, so the next starts do not read the whole file and the window does not freeze.

### Settings, data and other

- Added: Settings in sections (Folders with a status, Diagnostics, Preferences, Import & backup).
- Added: import from an older version (a folder or a `.zip` backup, the older folder is never written) and "Export my data".
- Import: when the missions of the older copy are in its own folder, they are copied into this copy (before, the settings tied this copy to the old folder and nothing was copied). A copy already tied that way is put right by importing the missions again.
- Added: Docs page: a Scroll switch, a question before turning more than 20 pages into cards.
- Added: startup logo.
- Changed: `config.json` is no longer in the portable folder (the program makes it at the first start).
- Fixed: the invitation codes of the Squadron page, the Kneeboard page at the minimum width, the Weapons and HARM state of an older mission.
