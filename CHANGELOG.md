# Changelog

What changed for the people who use BMS Cards, version by version. The detailed log of every beta (with the reasons and the tests) is in the git log of the `dev` branch.

## 1.3.0 (not released yet)

- Added: A-A > OCA: the SWEEP or ESCORT of a package (the lead, the side and the position code of the NATO manual, the commit of the manual, the stop from the package, the target area), with a time slider along the route of the package and the problems in red (a SWEEP alone in its package is an independent sweep; the night of an embedded escort from the date of the campaign); it writes an A-A block in the ROE of the flight, its lines into the DTC, an OCA card with the map, a Smart OCA card and the OCA module of the Smart mission card; Map > Display > OCA.
- Changed: the Weapons tab is now A-G; the BVR tab is A-A, with DCA (the FAOR of a CAP flight), OCA and Timeline.
- Added: A-A > DCA: the area (FAOR) of a CAP flight (BARCAP, CAP, AMBUSHCAP, TARCAP, DCA, HAVCAP, RESCAP): the FEZ on the threat axis from the CAP points, its block and weapons control, COMMIT / STOP / DROP and the hardwall with the next CAP, with sliders from the profile of the mission down to the minimums of BMS and the problems in red (the threat axis from the nearest enemy units, SAMs and airbases; WPN on the COMMIT line, DROP on the STOP line, the time on station, the hardwall white and dashed); it writes a FAOR block in the ROE of the flight, its lines into the DTC, a FAOR card with the map, a Smart BVR card and the FAOR module of the Smart mission card; Map > Display > DCA; the DTC editing of the Map page has AUTO > FEZ.
- Changed: Add all cards asks Classic or Smart; the Smart SEAD card lists up to eight launches with yours in bold; the Smart DEAD card draws the pair of the player chosen; the Smart Target card names the places and objectives near the target.
- Changed: the windows that choose Kneeboard cards are as wide as their cards (no side scroll); the Smart Attack plan shows the zoom chosen on the Weapons map; the Smart Target card shows the SAMs, units and impacts of Fill from the datacard, now on at first; short weapon names (AGM-88).
- Added: Smart SEAD and DEAD cards, and the Smart mission cards: one page with the task (Pop-up, HADB, TOSS, SEAD or DEAD), the target, the weather over it (checked against the attack or the cruise level) and the ROE / SOP; every Smart card names the flight and its package.
- Added: Smart cards for the Kneeboard, in the look of a real smart card (key numbers in a box, a drawing with its values, red for the limits): Attack (Pop-up, HADB, TOSS) with the side profile over the real terrain and a plan view with contour lines, spot elevations and the places, bridges, towers and enemy units near the attack (ICAO / NATO symbols); Weather; Target; ROE / SOP. Chosen next to the classic cards in Add card and Add all cards.
- Added: Map > Display > HARM: the drawing of Weapons > HARM for the flight (its SEAD plan, its DEAD tactic, or else the Single shot); Pop-up/HADB/TOSS and HARM are off at first.
- Changed: headings and bearings are shown magnetic, with the magnetic variation of the theater (BMS 4.38); offsets, VIP / VRP and winds stay true.
- Changed: the theater projection is read from the Projection string of Theater.txt; the MSA / ERAA use the highest ground of every km of the height map, made once in the background at the first start and kept in the program folder (a peak between the samples is no longer missed, and no slow second pass).
- Changed: a TE with its own .ini is handled like a training mission (its DTC opened with it, closed when another is chosen, protected); the DTC button of the map is red when no DTC is open; TE_New / TE_New_NT are no longer listed.
- Changed: the messages that stop an action are shown in red; the TE / Training menu is as wide as the campaign menu.
- Fixed: with the animations off in Windows the Kneeboard cards could not be dragged: the program now asks at start whether to have the animations.
- Fixed: a mission applied to a new DTC without the sections WDP adds (NAV OFFSETS, ICP, Laser, FCC) lost those lines: they can now be added.
- Added: the BMS training missions (.trn) in the TE menu, now "Select a TE or Training".
- Added: training missions open their own DTC, protected unless Settings > General > Edit training DTCs is on.
- Changed: documents, pictures and maps on the Kneeboard say No dark version available.
- Changed: Select none / Select all in the windows that choose Kneeboard cards; the Target details card chosen by default.
- Added: dark datacard pages on the Kneeboard (Datacard and MDC format).
- Changed: Target cards always in the Paper (BTG) layout, light or dark; Write OA1 / OA2 says No DTC when none is open.
- Fixed: an F-16 flight in a package led by an F-15 wrote the F-15 kneeboard files and DTC.
- Changed: one dark look for all the cards (the page of Weather SIGWX); Target cards keep their picture as filtered, Program and Paper (BTG) made right for dark cards, with a note on which style goes with the look.
- Added: Cockpit tone (Settings > Kneeboard): the kneeboard pages written darker and with more contrast for the cockpit (Brightness / Contrast as in Photoshop, optional on dark pages).
- Changed: warnings shown in red; map offsets need an open DTC; Target: Save PNG on the Page title row.
- Fixed: Add all cards made the SEAD, DEAD, Attack and Target cards without their map; the side profile of the dark Attack card was light.
- Added: Kneeboard: a ☀ / ☾ button for the look of one card (kept by the Light / Dark cards button) and Add all cards (every card of the flight, chosen on their pictures); Send card at the top.
- Changed: one Add card a page, at the right of its tabs (Weapons, Weather, ROE / SOP); Target: Put on datacard at the top, Save PNG in Page.
- Fixed: the departure airport was listed among the targets.
- Fixed: the Light / Dark cards button did not switch the cards after a restart (their other look was not kept); the weather card profile went past the right edge.
- Changed: card text plain weight again, at least 22 px; the cards keep a light and a dark look and the Light / Dark cards button switches those already on the kneeboard.
- Changed: card text blacker and heavier (also Target and ROE / SOP cards); one Light / Dark cards button; a loading bar while the kneeboard is written.
- Added: dark cards (Kneeboard > Light cards / Dark cards) for SEAD, DEAD, Attack and Weather; heavier letters on the cards for the cockpit.
- Changed: sharper kneeboard pages in the cockpit: a better DXT encoder, mipmaps that keep text dark, and cards drawn with larger small text, darker greys and thicker lines.
- Added: F-15 AUTO COAST (Korea): ECOAST and WCOAST along the coast of the peninsula; a colour picker in the look of the program for the SIT lines.
- Fixed: the banner of a line being drawn moved to the right at every point.
- Added: Map lines: snapping to nearby points (switch in ADD), the side lengths of rectangles in NM (also as labels), any colour for the F-15 SIT lines, SIT line buttons with the initial of the name (6E, 11H...).
- Added: F-15 SIT lines (BMS 4.38.2): with the F-15 kneeboard the Data Cartridge shows the SIT lines 1-12 and the Map draws and edits them (lines 6-12 with 30 points and breaks, name, colour, dash, shown on the SIT); saved in the DTC, the campaign file and the mission.
- Fixed: writing the campaign / TE .ini no longer drops the F-15 SIT lines ([F15_SIT_LINES]) of the BMS F-15 SIT Lines Editor.
- Added: SEAD Package time slider (ROLEX late / LEEROY early, ±5 min in 15 s steps) that moves the times of the package but the SEAD flights, shown on the map, the scheme and the cards.
- Fixed: DEAD Bombs / Maverick map card without the attack profile; "HARM impact" in the SEAD / DEAD legends.
- Changed: DEAD HARM standoff bait arc at the ECM-on range (the ECM slider), "ECM as needed" in the bait texts; the DEAD scheme with the ways, clearer colours, the events and a legend.
- Changed: DEAD 4-ship: #3 and #4 fly the tactic as a second pair round the other way; the killer goes on round its orbit after its HARM.
- Changed: DEAD Hunter-Killer with one anchor and the killer's HARM when the SAM shoots at the hunter; Bombs / Maverick with the mark, the attack from the anchor and the hunter's cover point; top cover only for a cover role.
- Changed: SEAD / DEAD buttons at the top (HARM tables, Auto PPT, Add card); DEAD Hunter-Killer and Bombs / Maverick drawn as the Training Manual; OA elevation 0 by default (no terrain).
- Changed: SEAD HARMs launched for the most cover (a switch to keep launches outside the rings), the total covered shown; DEAD drawing cleaner (texts apart, longer orbit, smooth dashed egress, thin arrows), the killer orbiting with the hunter, Bombs / Maverick drawing the Weapons attack lines on the map; Map / Scheme next to the title.
- Fixed: SEAD and DEAD use the SAM rings of the Map page (the Ppt.ini range), so no SAM crossed on the map is left out; the Map page gets its own filters back after the Weapons pages. New: the uncovered parts of the protected routes in red on the SEAD map; the loading bar while the cards are prepared.
- Changed: the maps of Weapons, SEAD and DEAD keep their view across tabs, the zoom buttons by half a level; SEAD launches kept outside the ring of their SAM, the time before the first impact shown, Azimuth by the side of the route; DEAD roles swapped within a pair, the drawing with its labels, the nav offsets reorganised (OA elevation by 500 ft).
- Changed: SEAD and DEAD keep the zoom chosen; DEAD Fit view as the HARM page and the card with the view of the preview; the HARM footprint and seeker in DEAD; the Hunter-Killer bait inside the WEZ (ECM on); OA1 / OA2 elevation; green only for launches; the SEAD first impact slider live; the Single shot line blue.
- Changed: DEAD: the HARM range and seeker ring on the map, fixed role colours, phase colours in the scheme, a chevron on the arcs, the ECM slider live, no flicker; the anchors as PPT types BMS knows; the attack pages open on the steerpoint nearest the SAM; Manual nav offsets outside the flight plan. HARM standoff (Single shot): AGM-88 by default, emitters only SAM PPTs and flight plan steerpoints, the seeker ring light blue.
- New: DEAD planning on Weapons > HARM (SEAD | DEAD): the target SAM of a DEAD flight with its rings and radars, HARM standoff, Hunter-Killer or Bombs / Maverick, the orbit side, roles for each seat, the altitude check, the anchors as nav offsets (OA1 / OA2 to the DTC, or as PPTs), a DEAD card for the Kneeboard; the Single shot page lives on inside DEAD. A red warning for SAMs with a fire control radar on each launcher (TELAR), in SEAD too.
- Changed: SEAD cover: a HARM covers while it flies; a SAM is on while any flight of the package is inside its ring; the way back gets HARMs too; one row for each launch in the scheme.
- Changed: SEAD uses all the HARMs of the flight, spread over the time the protected flights are inside the rings (ingress first, each HARM covering until its max range); POS (to a flight plan steerpoint or a PPT) or HAD; a scheme view with the events; the tasks of the protected flights; two SEAD cards to choose from.
- New: SEAD planning on Weapons > HARM: the HARM shots of a SEAD flight that protect the flights of its package (the SAMs on their routes, the impact at 85% of the ring, the launch time and point of each aircraft, Priority or Azimuth sort), the HARM tables and PPT checked against them, a SEAD card for the Kneeboard.
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
