# Changelog

What changed for the people who use BMS Cards. Version 1.1.0 against 1.0.0. The detailed log of every beta (with the reasons and the tests) is the "Beta log" of `docs/ROADMAP.md`.

## Unreleased (1.2 betas)

- Fixed: ROE / SOP page: Other SOP lines stayed far down with the sections folded; the drop-down of the custom section window was white.
- Added: ROE / SOP: Tanker and Weather sections, custom sections (yours or the squadron's), "Add card" (the whole ROE and SOP on Kneeboard cards), a warning before losing unsaved choices, folding sections, presets copied between yours and the squadron's.
- Changed: notes up to 16 px when there is room; the tick "card" is now off by default; clearer short forms.
- Changed: the notes of the Datacard are laid out in sections (TWR, UHF2, TGT) with the frequencies in columns, at 13 px.
- Changed: the SOP box writes one line a phase with its topics joined (T/O: 20S · AB · DEP COMBAT).
- Changed: ROE / SOP is a page of the Squadron (between Members and Organization); a click on the boxes of the card opens it. 5 lines a box, with a warning when full.
- Changed: the notes of a big package use short callsigns (Devil 3 = DL3) and never go under 11 px.
- Added: Squadron > ROE / SOP: the commander sets the presets of the squadron, every pilot finds them in his menu; a preset can be the default of kinds of mission (a BARCAP flight gets the Defensive Counter Air one by itself).
- Changed: ROE and SOP in two boxes (side by side on the Datacard, one above the other on the MDC); ephemerides back on two lines.
- Fixed: the drop-downs of the SOP menu did not open.
- Added: **ROE / SOP**: a click on the box opens a menu with the rules of engagement and the SOP of the squadron (ground, departure, en route, FENCE and comms, recovery, night, emergencies), personal presets that can be combined, and the short text written on the Datacard and in the MDC (the Overview box is now ROE / SOP).
- Changed: Datacard: the ROE / SOP box is taller, the notes moved down, the ephemerides on one line.
- Changed: MDC format: the pilots table without FCR, ID and OWN, six taller rows with wider cells.
- Added: MDC format: TANK J/B (Joker / Bingo to the tanker) filled from the fuel plan.
- Fixed: MDC format: the callsign was not written and the Bingo was not red (beta 14).
- Changed: MDC format: wider Tanker, TOT / VUL, flight plan columns, Aircraft and Target of the roll call, Type / Lat / Long of the Known EOB; Airspace / TGT filled with the primary target; the loadout written shorter and bigger.
- Added: the elevation of the target steerpoints after Lat&Long on the Datacard; METAR and TAF further apart; tanks without the aircraft name (Tank 600gal).
- Fixed: the Automatic rules of the Datacard were cut ("the..."): a click on ⓘ now opens the whole text in a panel with its sections.
- Changed: the notes of the Datacard are tidier and always readable with big packages (UHF2 backup two flights a line, long lines wrapped, "+N more" when nothing else helps).
- Changed: MDC format: TOT / VUL to the minute, and the escorted flights in short form (ESC DL3 PR4).
- Changed: Pop-up/HADB/TOSS/HARM is now a Display filter of the Map; Off in the Briefing weather also closes its panel.
- Changed: the Map filters are easier to read: one line per filter (details in the tooltips), Enemy before Friendly, Display in a side panel like Objects, Names as a button beside Clear filters.
- Changed: TOT is now TOT/VUL on the Datacard; the WEZ keeps the SAM name wherever the cell has room (each card format decides for itself).
- Changed: the weather buttons of the Briefing are all the same size, Off in red.
- Added: **WEZ exposure time**: after the TOT of the primary and of the secondary, the Datacard (and TOT / VUL of the MDC format) shows when the flight is inside the enemy SAM rings (first entry, last exit), the minutes inside and the largest SAM crossed. On the map, the filter "WEZ exposure time" writes the minutes on every ring crossed and the total in the label of the flight.
- Added: **Ready to fly** in the tab bar: it lists what is not saved yet (DTC, kneeboard, mission) with a button for each and "Write all"; green when everything is saved.
- Added: a notice when a newer version of the program exists (releases only, checked once a day on GitHub; nothing is downloaded; Settings > General to switch it off).
- Changed: tooltips and descriptions brought up to date and shortened (the Automatic rules of the Datacard above all: pilot names, ATIS, MSA, Bingo with IMC, Joker margin, tankers, AWACS / JSTARS estimates, BVR box).
- Added: weather in the Briefing: the briefer shows a weather filter (weather, wind with barbs, temperature, pressure, clouds, visibility) at the hour and altitude he chooses, the same for everybody in the room.
- Added: the Bingo carries a holding and an alternate fuel when the landing field is in IMC (GRN or worse at the landing time); minutes and pounds on the Performance page (10 min, 1000 lb), a small IMC beside the Bingo on the card.
- Added: Settings > General > One map screenshot: a new map screenshot takes the place of the last one, on the same kneeboard page (off by default).
- Added: the BVR box of the datacard fills itself with the BVR timeline when it is empty; the BVR timeline is kept from one session to the next.
- Fixed: the datacard roster sometimes listed a pilot by his callsign instead of his name (the logbook is read at the start).
- Fixed (Briefing): lines no longer dotted at some zooms or while the map moves; sharp labels; bearings without the "T".
- Added: **Squadron > Briefing**, a live briefing room on the map. A leader opens it and draws (pen, marker, arrows, shapes, text, the NATO symbols and radar tracks of the map, IP, CAP orbit, holding, threat rings, ruler and compass); he gives the pen to the pilots he wants. Everybody sees the cursors and follows the view of the briefer (or moves on his own). "Save a kneeboard card" keeps the drawings inside the kneeboard frame.
- Fixed: placing a steerpoint, a line or an offset on the map near a city or an objective no longer opens its window instead.
- Fixed: the weather colour code counts the scattered (SCT) cloud layers, as the military colour states do.
- Fixed: aircraft refuelled with a probe (F-14, Tornado, Typhoon, Rafale, Mirage, EA-6B...) get the KC-130 first.
- Fixed: a field elevation typed on the Datacard updates the take-off data, the Direct landing altitude and the TAF.
- Fixed: the Data Cartridge page refuses radio and ILS frequencies outside their bands and IFF codes that are not octal.
- Fixed: names written into the DTC use plain letters (accented names of the Balkans theater).
- Fixed: the ATO is in time order across midnight.
- Fixed: the Joker uses your margin also when the Bingo comes from the DTC.
- Fixed: METAR and TAF show the day of the month of the mission date.
- Fixed: a damaged or unreadable config.json is no longer replaced without asking.
- Changed: the asterisk of an estimated AWACS/JSTARS sits after the callsign; no refusal speed for a ship on the Performance page.
- Changed: the map is smoother in pan and zoom with all the Objects and the political layer on. The cities, towns and villages are drawn in a lighter way: they look and work as before, only during the zoom animation they are a little blurred for an instant.
- Changed: the first click on an objective zooms in one smooth movement to its buildings (sub-objectives).
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
