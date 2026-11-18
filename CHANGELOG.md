# Changelog

What changed for the people who use BMS Cards, version by version. The detailed log of every beta (with the reasons and the tests) is in the git log of the `dev` branch.

## 1.3.0 (not released yet)

- Fixed: the Objects box of the map filters switches the political places (cities, towns, villages) too.
- Changed: opening a campaign chooses the flight the player chose in BMS (its seat too), else the next flight of the player's squadron.
- Changed: the Target information card shows the graphic in place of the list of the components.
- New: the aim points of the two detail pictures can be chosen (Target information > Details).
- New: Attack cards for the Kneeboard (Weapons > Add card): one for each role of the flight, with the attack drawn on the map chosen on the Map page, the side profile, the parameters, the spacing of a split flight and the nav offsets.
- Changed: Weather > Add card opens a dialog with the SIGWX, RADAR and WIND cards to choose from.
- Changed: each mission folder has its own colour; the folders inside take it.
- Changed: TOSS Egress: heading, range, then Egress alt. (was OA2 alt.).
- Changed: the fragments of the bombs follow the envelope graphs of the manual in space and time (a point is dangerous only while the fragments pass it): the lethal zone, the fragmentation MRA, the safe escape and the deconfliction of a split flight (which now says what sets the spacing).
- Changed: the egress (its heading, its range and the OA2 Egress point) starts at the release point instead of the target, in Pop-up, HADB and TOSS.
- New: a joined egress for a split flight (Egress: Split off): the element goes out to the lead's egress point and rejoins visually. A toss in formation can be split on the egress only.
- Fixed: the egress heading of HADB and TOSS was missing (the Target tab, the shared egress).
- Changed: Save closes the Settings window.
- New: a split of the flight on the Weapons page: in Pop-up, HADB and TOSS, Split gives the element (or wingman) an attack of its own, born as the mirror of the lead's (Rejoin drops it), LEAD / ELEMENT chooses the one shown; the other group is drawn in white; a deconfliction card gives the spacing after the lead, amber when only the timing clears a conflict, red (with the sliders that clear it) when an attack parameter can. Apply writes the attack of the seat chosen on the Datacard. The check starts at the split point (pop-up Type 1 PUP, Type 2 VRP; HADB line-up point; TOSS OA2 or VRP), since the flight shares the ingress.
- Fixed: "Edit points" flickered on the Weapons and HARM pages when they were drawn again.
- New: Weather cards for the Kneeboard (Weather page > Add card), three kinds. SIGWX and RADAR (satellite clouds and radar echoes): the chart around the route with smooth isobars and H / L, the profile along the route (clouds, rain, fog, 0 °C, contrails, winds), the METAR and TAF of departure, target, landing and alternate in plain words, the contrail levels. WIND: winds and temperatures aloft at FL060, FL180 and FL300 at the target time.
- Fixed: the Weather page showed no clouds above 9 999 ft with the BMS 4.38.2 maps.
- Changed: checked with Falcon BMS 4.38.2 (4.38.1 still works without a warning).
- New: BVR timeline: the Su-30SM2 with the AA-13 (R-37M) and the AA-12B (R-77-1) of BMS 4.38.2; their abort range from estimated values.
- Fixed: weather reports with the maps of BMS 4.38.2 and F4Wx: clouds above 10 000 ft are reported (they read as CAVOK), Sunny has no clouds, the cover is read in eighths, shower cumulus give SHRA / SHSN.
- Changed: the weather of an hour without its own map follows the moving map of BMS (as its briefing does); the TAF gives the changes of the coming hours (FM / TEMPO) from the hourly weather maps.
- Fixed: "Not saved: Kneeboard" came back when the Datacard tab was opened after a save, with nothing changed; the Save button of the Kneeboard page now agrees with the tab bar.
- Changed: Weapons > Target: the plan (now Synthetic) and the picture of the map can be turned (Attack up puts the attack heading at the top); new Targeting pod filter with its display; the infrared filters renamed; no Edit points on the tab.
- Changed: Weapons > Target: three columns as the Pop-up tab, the annotation tools as a bar over the picture (as in the Briefing room), a tidier From the datacard card, two more filters (IR black-hot, NVG), a cursive handwriting for the notes.
- Fixed: the message boxes of the program stood at the bottom of the window after the Missions list was opened; all the groups of the Missions list can be closed.
- Fixed: Weapons > Target: the levels chosen on the lent map did nothing. Changed: the zoom of the live map is the Width chosen (free again in the frame of the picture).
- Changed: Squadron > Missions: each campaign has its colour in the list; the Squadron groups are your online squadron (the one that sent the mission, or the one you were in when you saved it).
- Changed: Weapons > Target: the Map background is the live map first (choose what it shows), then Take picture; Handwritten notes in the Filter card, also for the remarks; the plan of an airbase shows its runways and taxiways. Fixed: the handwriting was not shown.
- Fixed: the tabs of the Squadron page moved when the Briefing was opened.
- Changed: Squadron > Missions: Saved and Received side by side; New folder at the top, ＋ for a folder inside one; folders open and close; folders can be dragged into each other; select all, Move to and Delete at the head of the list. Fixed: dragging missions in the desktop program.
- Changed: Weapons > Target: the map background has Edit points, Map filters and Buildings (the buildings of the objective on the picture); the plan zooms (wheel or − all +); Add target makes a WPN TGT in the DTC; the select tool shows a pointer. Fixed: the LEVELS menu went missing from the Map page after a frame of the map.
- New: Squadron > Missions: search, groups by campaign, squadron or date, and folders of your own (drag missions onto them, or select several and Move to). The folders are only in the list: the missions stay where they are on the disk. Long lists open at once and show a hundred missions at a time.
- New: **Weapons > Target**, a target picture in the style of a Basic Target Graphic. Background: the plan of the objective (from the BMS files), the map of the Map page (its base map and layers) or a pasted screenshot (BMS Recon view), with filters (Recon B/W, IR, Recon 1980s). "Fill from the datacard" draws the DMPIs with their TGT STPT, the attack of the attack planner, the enemy SAM rings and units; BTG symbols and notes by pen are drawn by hand. A second page holds the target information and detail pictures. The pages go to the Kneeboard as cards (Add card) or onto the datacard in place of the map screenshot, through a crop frame in the shape of the datacard or of the MDC. A target removed from the list is deleted from the DTC; the plan shows the relief of the BMS terrain; the impacts of the stick and the names of the sub-objectives can be shown. Two more filters imitate the video of a large drone (UAV FLIR, with the data of the mission) and of a small one.
- Fixed: after a visit to the Squadron Briefing, the Map and the other wide pages could become narrow (centred, with empty sides).

## 1.2.0

### Highlights

- **Squadron Briefing**: a live briefing room on the map. The briefer draws (pen, marker, arrows, shapes, text, NATO symbols, CAP orbits, holdings, threat rings, ruler and compass), gives the pen to the pilots he wants, and shows the weather; everybody sees the cursors and follows his view. "Save a kneeboard card" keeps the result.
- **ROE / SOP**: rules of engagement and SOP by phase of flight (mission, ground, take-off and departure, en route, tanker, FENCE / comms / fuel, recovery, weather, night, training, emergencies), with options from the RoKAF Basic Employment Manual, the 8th and 51st FW in-flight guides by mirv and AFMAN 11-2F-16V3. Short form on the datacard and in the MDC (5 lines a box), the full text on one or two kneeboard cards.
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
