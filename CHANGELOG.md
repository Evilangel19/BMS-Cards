# Changelog

What changed for the people who use BMS Cards. Version 1.1.0 against 1.0.0. The detailed log of every beta (with the reasons and the tests) is the "Beta log" of `docs/ROADMAP.md`.

## Unreleased (1.2 betas)

- Changed: the map is smoother in pan and zoom with all the Objects and the political layer on (nothing changes in what you see).
- Added: when the package has no AWACS or JSTARS, the Datacard shows an allied aircraft on station during your flight, the nearest to your route, marked with an asterisk (`*`). An ELINT aircraft (E-8C, RC-135) goes to the JSTARS row; the AWACS row takes an AEW/ABCCC aircraft. The operating time is in the notes, as for the tankers.

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
