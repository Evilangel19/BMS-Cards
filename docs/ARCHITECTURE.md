# Architecture and roadmap

## Principles
- Portable: one folder (exe + `config.json` + optional `data/`), easy to move or delete.
- Read as much as possible from the user's BMS installation (Falcon4_*.xml, RadioMap.dat, theater data).
- Parsers are independent modules: file in, structured data out.
- Fixed rules (`rules.json`), user settings (`config.json`) and project data are kept separate.
- UI is a separate layer: it can be redesigned without touching parsers or rules.

## Target layout
```
src/
  parsers/   cam, fmap, link16, dtc, iff, twx
  data/      fallback tables (weapons, airfields, radios)
  rules/     fixed and dynamic card-filling rules
  core/      datacard model, ephemerides, calculations
  render/    canvas, DDS (DXT1/DXT5)
  store/     project, ATO, persistence
  ui/        panels, map, forms
src-tauri/   Rust shell: folder access, file watching
tests/       golden comparisons
```

## Current state (step 3: config and folders)
```
app/index.html          interface (ES module script, imports the modules below)
app/js/parsers/         lzss, cam, fmap, link16, iff, twx, dtc   (file in -> data out)
app/js/core/cam-core.js public API (CAM) that ties the modules together
app/js/core/flight.js   flight listing and shared helpers (names, times, nearest airbase)
app/js/core/fillcard.js datacard field filling
app/js/rules/           weather.js (ATIS/TAF), airbase.js (runway, TACAN), geo.js (coordinates),
                        support.js (tankers, AWACS, JTAC), ephemerides.js (sun/moon)
app/js/config/          settings defaults and merge rules (config/config.default.json is a copy)
app/js/platform/        desktop integration: config file, file dialogs, native save (browser fallbacks)
app/js/data/            fallback tables generated from the prototype (to be replaced by reading BMS files)
tests/                  run-golden.mjs (89 flights), run-parsers.mjs, run-config.mjs, fixtures, golden results
tools/ui-compare.py     local check: prototype page vs app produce identical fields and DDS bytes
```
`legacy/BMS-Planner.html` is the untouched prototype used as the reference.

## Roadmap
1. Foundation: repository, CI, golden tests. (done)
2. Extract parsers and rules into modules; read game data from the BMS installation; campaign list with its
   weather, Link16, IFF and date files loaded together. (done)
3. Small open items: WDP runway data permission, remaining embedded tables, add-on theaters (`Theater.lst`).
4. Project file (one file per mission: campaign, flights, hand edits, DTC), ATO browser, multiple datacards,
   direct editing on the card, folder import/export.
5. Kneeboard pages: more pages beyond the datacard (maps, checklists, images), each exported to its own DDS with
   the file names BMS expects (names to be provided).
6. Map and steerpoints.
7. Fuel and performance (calculator page).
8. BVR / MAR calculator page, with the results placed on the datacard.
9. Weapon planning.
10. P2P sharing.
11. UI refinements (ongoing, requested by the user).

## Theaters
`Data\Theater.lst` lists one .tdf per theater (add-on theaters live in their own subfolder). Each .tdf gives the theater's
campaign, object and terrain folders. The Theater selector (next to the campaign list) picks one; its campaigns and
data files are read from its own folders first, then from the rest of the BMS install. Limitation: the coordinate
conversion (`rules/geo.js`) is still built for the Korea map, so lat/long of other maps is not correct yet.

## Airbases
`bmsdata/airbases.js` builds the runway tables (`ap`, `api`) and elevations (`el`) from the BMS ATC files
(`Data\TerrData\ATC`: runway numbers, headings; BMS does not distinguish L/R) and the KTO AIP PDF (ILS frequency per runway
end, elevation), read with pdf.js (`platform/pdf.js`, `bmsdata/aip.js`). Without an AIP the Stations+Ils.dat frequency is used
only when all ILS frequencies of the airbase are equal. Airbases with no ATC file get runways from the AIP (heading = number x 10).
Without a BMS folder there is no runway data.


## ATO column
`app/js/core/ato.js` builds the Air Tasking Order from the campaign (all factions: team names from Strings 40-47; mission categories as in BMS; package number = package campId; squadron shown as its ordinal number because BMS keeps squadron names outside the files read). Only F-16 flights can fill the datacard. Search: faction, category, callsign, aircraft, package, mission, takeoff time range. Test: tools/ato-test.py.
ATO update: the list shows packages (expand to see flights); only the player's faction is open, the others are red and locked. BMS faction of the player is not read from the .cam (not found), so it is chosen in the "Your faction" selector and remembered per campaign. Take-off and TOT searches accept "1430", "14:30", "14".
ATO v3: the player's faction is the owner of the player squadron (PlayerSquadID in the .cam cmp block, offset taken from the CamReader project's documentation of the format; no code copied). The faction menu is the only filter: other factions are readable but red and locked. Tree: mission category > package > flight; a one-flight package loads the datacard directly.
ATO v4: alliances come from the team stances in the .tea block (allied or friendly in either direction, e.g. PRC and DPRK), not from a fixed rule. Strings with a space instead of a tab (341 RELOCATE) are now read. tests/run-ato.mjs checks that every flight is listed.
ATO v5: the datacard can be generated for every flight except helicopters (and the MV-22). Weight, fuel, drag and the overhead landing speed (300 kt / 1500 ft) are filled only for "accurate" aircraft: all F-16 and F-15 except E, K, I and JASDF (see isHiFi in core/flight.js); other aircraft are dark in the ATO and get those fields empty. Aircraft data files read: Acdata F-16* and F-15*.
Datacard supplements: the groups in the notes box (airfield frequencies, backup frequencies, other elements' targets, JTAC note, IFF changes) are separated by a blank line, drawn as a thin rule (the box shrinks its line spacing to fit). JTAC row: battalion name = ordinal of nameId + unit type (the same way CamReader builds ground unit names); brigade/division not shown. Squadron names come from the .cmp squadron list.

### ATO v6 (closed)
- Search criteria order: Callsign, Package #, Aircraft, Mission type, Airport, Squadron, Departure time, TOT.
- The campaign file stores only the player squadron (`PlayerSquadID`), not the flight chosen in the briefing, so no automatic flight selection on campaign load.
- Supplements box: uniform font, constant line pitch, constant group gaps with hairline rules.

### Kneeboard pages v1 (now its own "Kneeboard" tab)
- Tab "Kneeboard" (the dialog was replaced): 16 clickable thumbnails per side + big preview of both pages of the selected row. Click = menu to cycle (Empty, Datacard L/R, imported pages), import images (jpg/png/webp) or PDF (pdf.js, one page per slot), stretch/fit, empty. Imported pages fill the clicked slot and the next empty ones. Default picture mode is stretch (the user's own DDS fills the whole page). 16 rows × (left, right). Each row is one 2048² DDS (left page | right page, 1024×2048 each); row 1 = 7982.dds … row 16 = 7997.dds in `Data\TerrData\Objects\KoreaObj` (setting `paths.kneeboardDir`, empty = automatic from the BMS folder).
- Slot content: Empty, Datacard Left/Right, or a picture ("fit" keeps proportions inside the 2:3 page, "fill" stretches). Default: row 1 = datacard. Rows with both sides empty are not written.
- Existing files are copied once to `<name>.orig` before being replaced. Formats: DXT1 or DXT5 + mipmaps.
- Map page: later, once the map exists. Code: `app/js/core/kneeboard.js`; tests `tests/run-kneeboard.mjs`, `tools/kneeboard-test.py`.
- Kneeboard tab v2: drag a card onto another to swap; DXT1/DXT5 toggle buttons; Set Default / Load Default (kept in memory for now, saved with the project later); Clear kneeboard (confirm); Restore (copies the `.orig` backups back over the DDS files). The DTC bar is hidden on this tab. Tests: tools/kneeboard-test.py, tools/kneeboard-desktop-test.py (mocked file system).

### UI conventions (standing rule)
- Every new button, page, menu, dialog or list gets a short animation (about 150 ms: fade/slide, expand/collapse, transitions on hover). All of it goes through the existing pieces: CSS keyframes/transitions, `expand()`/`collapse()`, FLIP moves for reordering, and the custom drop-down (`ddOpen`) that replaces the browser's own `<select>` list. The Settings switch "Animations" and the system "reduce motion" turn everything off (`animOn()`). The datacard canvas is not animated.
- Kneeboard backups: before the first overwrite, each original BMS file is copied (as DDS) to `backup\kneeboard` next to the program; nothing extra is created in the BMS folders. "Restore" copies them back. "Set Default" remembers the card arrangement (project folder backup to be added with the project file); "Load" restores it.
- Cards are moved with a pointer-based drag (not HTML5 drag and drop, which Tauri on Windows can block).
- Kneeboard v3: with animations on there is no click menu: cards are dragged (slot ↔ slot swap, slot → unused cards to take it off, unused → slot to place it, anywhere → bin to delete an imported card). Imported images/PDF pages land among the unused cards (under the preview). With animations off dragging, tray and bin are not shown and the click menu (cycle, import, empty) comes back. One global option decides whether images are stretched (default) or keep their proportions.
- Dialogs: Tauri's dialog plugin makes `window.confirm` return a promise, so every confirmation must be written `await confirm(...)` (otherwise the action runs before the answer). The browser's date picker is replaced by an animated calendar (`dcOpen`), like the drop-downs (`ddOpen`).
- Imported kneeboard pictures are stored as compressed files with a small preview (`mid`); the full image is decoded only while the card is placed in a slot (`kbDecodeUsed`). PDFs are opened page by page; if a PDF has more than 8 pages a dialog asks which pages (max 40 at a time). Reason: rendering every page of a long PDF at full size exhausted memory and blanked the window.
- Files can be dropped on the Kneeboard tab (Tauri drag-drop events on desktop, normal drag and drop in a browser): imported among the unused cards (or into the first empty left slots when animations are off). Added because selecting a PDF in the Windows file dialog blanked the window on the author's machine (cause not confirmed; the dialog is native, outside the program's code).
- Kneeboard: clicking the bin deletes all unused imported cards (after a confirmation; the two datacard pages stay); dragging a card from a slot (or from the unused area) onto the bin deletes it directly. A file dropped on an empty slot is imported straight into it (the following files go into the next empty slots of that side); dropped elsewhere it goes among the unused cards.

### Kneeboard page (closed)
Done: 16×2 cards, big two-page preview, unused cards + bin, import (jpg/png/webp/pdf, file dialog or drag and drop), page selection for long PDFs, DXT1/DXT5, Set Default / Load (session only), Clear, Save to the BMS folder with originals backed up in the program folder, Restore. Still to do with the project file: persist the card arrangement, keep originals and last saved copy in the project folder, and the map page.

## Map page v3
- Tab "Map" after Kneeboard. Files: `core/mapview.js` (Leaflet UI, layers, base maps), `core/mapdata.js` (pure data: `toLL`, `fmtLL`,
  `mapAirbases`, `flightRoute`, `legs`, `isActivity`, `flightState`, `mapUnits`, `allyOf`, `spottedBy`, `bullseye`), `core/mapsymbols.js`
  (NATO-style SVG symbols per BMS unit category), `core/mapwarp.js` (re-projects a theater picture onto Web Mercator with a triangle mesh),
  `data/basemap.js` (offline coast and borders, built by `tools/make-basemap.mjs`). Leaflet is loaded from `app/vendor/leaflet` on first use.
- Campaign grid: x = east, y = north, origin (512,512) km = lat 38.5 N, lon 127.5 E (checked on Osan, Seoul, Sunan).
  `Korea_KTO.tga` in the BMS data is only the theater loading picture, NOT a map.
- Base maps: Coastlines (offline); BMS map (official picture `cdn.falcon-bms.com/maps/04_KTO/maps/KTO_UI_Map_6k.jpeg`, loaded live);
  Imported map picture (file chosen by the user, kept in IndexedDB `bmscards`/`blobs`/`mapimg`); Topographic (OpenTopoMap); Satellite (EOX).
  Pictures are in the campaign grid, not Mercator, so `mapwarp.js` re-projects them. Area of the BMS picture: the whole 1024 x 1024 km theater
  (x 0..1024, y 0..1024, north up). Found by fitting the airbase hot spots of the official interactive map (49 airbases, 0.5 km rms, 4 px/km):
  their coordinates are on the 4096 px grid, NOT on the 3840 px the page displays (first version wrongly used 960 km: distorted picture). The official picture comes from another
  origin without known CORS headers, so its pixels cannot be read back (display only). SkyVector is not used (no public tile API/terms).
- Campaign time: `C.now` = first u32 of the .cmp inside the .cam (ms; day = floor(ms/86400000)+1). Shown as a fixed chip; nothing can be moved
  in time (so the map cannot be used to look at other moments).
- Layers (all switchable, kept in localStorage `bmsmap`): airbases, navaids, bullseye (rings every 20 nm to 100 nm); selected flight: plan line,
  steerpoints, distances between steerpoints (nm); friendly units and spotted enemy units (NATO symbols, smaller when zoomed out); friendly and
  enemy (spotted) SAM range rings; friendly and enemy (spotted) flights as radar tracks at the campaign time.
- Steerpoints: hollow circle = navigation (codes 0,1,2,3,7,8), hollow triangle = any activity (CAP, strike, SEAD, ground attack, refuel, recon,
  jamming...). The number is always visible; clicking fills the symbol and opens an info box (action, position, altitude, time, leg nm/course).
- Tracks: hollow square (green friendly, red enemy), white velocity vector (2 minutes ahead), label callsign / FL / ground speed (hidden when zoomed out).
  Position, altitude and speed come from interpolating the timed waypoints (altitude = z * 10 ft).
- Units: `D.un` (Falcon4_UCD: category, Rng_Air, Rng_LowAir km). SAM = Air Defense / SHORAD with Rng_Air > 0, ring radius = Rng_Air km (UNVERIFIED
  that BMS means km). Unspotted enemies are not drawn at all. Spotted = low byte of `spA` (the 2 bytes after the spot time in the .cam) has the bit
  `1 << team` of a team allied with the viewing faction (inferred from the sample campaigns, not documented; to be checked by the user).
- The ATO list of the datacard page (`#ato`) is moved into the map page (left side, `#mpside`) when the Map tab opens and back when it closes, so
  it is the same list and the same selection. Clicking a flight there, or a friendly track on the map, loads it (`selectFlight`, only flights that
  can be loaded: own faction, not helicopters). Other flights of the selected package (`els0`) are drawn dimmer: dashed line, small steerpoints.
- Airbases and navaids use icons (`placeIcon`: airfield, VOR hexagon, VORTAC/TACAN hexagon with bars, NDB dotted); the "Names always visible" switch
  shows the name labels of units, airbases and navaids (otherwise only on hover). Symbols shrink when zoomed out.
- Not done yet: BMS unit icons (user will look for them in the BMS folders; NATO symbols are the first set), automatic loading of the BMS map picture
  from the installation folder, pop-up/lofting envelope (needs terrain elevation), offline satellite.
- Tests: `tests/run-map.mjs` (data, symbols, geometry), `tools/map-test.py` (UI; servers are mocked, the real ones are not reachable from CI).

### Map page v5
- **Draw order** is fixed by Leaflet panes, not by the order layers were added: tiles and map pictures `tilePane` (200), offline coastlines `coastP` (250, own canvas renderer), units / rings / bullseye `overlayPane` (400), flight plans `planP` (450, own canvas renderer), markers (600). This removed the "plan under the coastline" bug.
- **Flight plan** is one layer `fp` (halo line + line + steerpoints + leg distances + label box); `pk` holds the package mates (dashed, white on dark bases).
- **Colours follow the base map** (`PAL`, `setPalette`): dark bases yellow / white, light bases (topographic, BMS, imported picture brighter than 0.5) dark magenta / dark grey. The imported picture is measured; the official one cannot be read (cross-origin) and is assumed light. Colours are CSS variables `--plan --mate --halo` on `#mpbody`.
- **SAM filter** (`sx`): with a flight selected, only enemy rings whose circle (Air range) touches a leg of the route are drawn, thicker (`crossesRoute` in `mapdata.js`).
- **Label box** (`label`, `placeLabels`): callsign, aircraft/mission and take-off time, tied to the route point nearest the view centre (inside a margin), moved on every `moveend`. Package mates get a small callsign tag.
- **Screenshot** (`shotStart` / `shotTake`): frame with the aspect of the free datacard area (`SHOT` 564 x 752 px, page 2 bottom left of the 2048 px card, drawn at x 1048, y 1290 in `draw()`), `html2canvas` (vendored) on `#mpmap` cropped to the frame; SVG styles are inlined in `onclone`. Stored as `MAPSHOT`, cleared by `apply()` (other flight). A cross-origin picture taints the canvas (DDS export would fail): the shot is then repeated without the base picture and the user is told.

### Map page v6
- **Panel**: sections fold like the ATO categories (150 ms, choice stored in `bmsmap.closed`). The campaign selector and Browse button move from the top bar into the left column of the map page (and back on leaving). The SAM filter row sits under "Enemy SAM range" and rewrites that row's text when it is on. No "Remove" for the imported picture (only Import / Replace).
- **Screenshots**: two kinds (`SHOTS`): datacard (564 x 752 area of page 2) and kneeboard card (1024 x 2048, added as a library item "Map screenshot N" and put in the first free slot, left column first by `kbAddShot`). html2canvas silently leaves a cross-origin canvas blank, so the base picture is tested first (`tainted(OV._url)`); when it cannot be exported the shot is taken without it and a persistent warning with the reason is shown.
- **DTC steerpoints** (`core/mapdtc.js`, layers `dp` `dq` `dl`): reads and writes the `[STPT]` section of the open DTC through `deps.dtc` (`lines` of the DTC page, `S()` setter; saving is the existing "Save copy" -> `_mod`). Ini positions are feet (north, east) = campaign km x 3280.84; `fromLL` (forward transverse Mercator, `geo.js tmFwd`) turns map clicks into them.
  - `target_80..98` = STPT 81-99 (name, altitude); `ppt_N` = STPT 56+N (name = threat, 4th field = range in ft -> ring); `lineSTPT_N` = STPT 31+N (a line runs until an empty row).
  - Not in the ini, so not on the map: STPT 25 bullseye (taken from the campaign), 26-30 markpoints. STPT 1-24 are the campaign flight plan, deliberately read-only.
  - Editing: click a point (popup: name, position, altitude, range, delete), drag it, or "+ Precision target / PPT / Line point / New line" then click the map (next free slot). Deleting a line point moves the following ones up.
  - Assumed, not confirmed in the game: the PPT/line slot numbering (index + 56 / + 31) and the meaning of the 4th PPT field.

### Map page v7
- **Two panels**: map options on the left (`#mpbar`), DTC in its own menu bottom-left (`dtcMenu()`: `#mpdtcw` / `#mpdtc` / `#mpdtcb`, open state `st.dtcOpen`). The DTC menu holds the master switch, the three DTC layers (`dp dq dl`), Open DTC, Save (overwrite), Save copy and the add buttons.
- **Master toggles**: each macro section (`MACRO`) has a checkbox that switches all its layers (`masters()`, `setLayers()`).
- **Layers**: `fp` = line + steerpoints; `fd` = label box + leg distances (one filter, labels sit on the leg midpoints nearest the view centre); `pk` ("Package") = mates and their tags. Option "Names" (was "Names always visible").
- **Colours**: bullseye `pal.bull` (black on light bases); no casing on the line for light bases (`pal.casing` null); speed vector in the flight colour; airbases by faction (`airbaseSide`: owners from the `.obd` deltas and squadron hosts only; others white). TACAN and NDB icons from the supplied symbol sheet (`mapsymbols.js`).
- **DTC mirroring**: map edits go through `dtcSet/dtcClear/afterDtc`, which refresh the Data Cartridge page (tables Precision targets, PPT threats, Geo lines) and vice versa; STPT 97/98 sync with the datacard primary/secondary.
- **Overwrite** (`dtcOverwrite`): desktop only (path known from `pickFile`), confirm, `<file>.bak` written once, original encoding/BOM kept (`encodeDtc`). The `.cam` is never written.
- **Geo lines**: 4 lines x 6 points; LINEn = ini rows `lineSTPT_(6(n-1)..6(n-1)+5)` = STPT 31-54 (`mapdtc.js lineOf`, `freeSlot`, `dtcLines`, `removePoint`).

### Map page v8
- **Navaid icons** (`mapsymbols.js placeIcon`): VOR, VOR/DME, DME, VORTAC, TACAN, NDB from the supplied symbol sheet (`mapdata.js` sub types `vor vordme dme vortac tacan ndb`).
- **Airbases** are white; only the take-off base of the selected flight (`nearAb` of its first steerpoint, the ATO "Airport" rule) is coloured, by the faction of the flight (viewed team / ally / enemy). The `.obd` owner reading (`airbaseSide`) is no longer used by the map.
- **Flight plan** is dashed from the first Land steerpoint (act 7) to the end. **Air contacts** use `pal.trk` / `pal.foe` (darker on light bases, redrawn by `setPalette`). Section switches have their own accent colour (CSS `input.mst[data-sec=...]`).
- **PPT**: the symbol is an empty diamond. Enemy SAM rings are dashed red and clickable (`samPopup`): "Add as PPT threat" writes the next free `ppt_N` with the unit position, ring = its range in ft and a name (SA number, else the first 6 characters). Assumption: the game stores the SA number as the PPT name (sample ini: name "10", range 303805.78 ft = 50 nm).
- **Rectangle tool** (`rectStart` / `rectPlace`): click for the centre, scale with the corner handles, move with the centre handle, "Create 4 steerpoints" writes NW, NE, SE, SW into the first LINE with 4 free rows. The box is axis-aligned in latitude/longitude (the campaign grid is slightly rotated against it).
- **Base map "BMS folder map (Skyvector)"** (`deps.localMap`): reads `Docs\05 Maps\8_KTO_16k_Skyvector.*` from the BMS folder, reduced to 8192 px, warped with the standard extent (ASSUMED: not verified against the real picture).

### Map page v9
- **Base map menu** (`baseMenu`, `#mpbasew`, top left next to the zoom buttons) is separate from the filter panel. **Clear filters** (`clearFilters`) switches every layer off and remembers the choice; pressed again it restores it.
- **Geo lines**: drawing is sequential (each click adds the next point until the line has 6; Done / Esc stops). The line number is a permanent tooltip (`.lnlab`). The rectangle tool is closed (5 points: NW, NE, SE, SW, NW) and needs a LINE with 5 free rows.
- **Revert changes** (`dtcRevert` in index.html): edited lines get back their `raw` value, lines added by an edit are dropped (reverts to the last open/save).
- **SAM rings**: the canvas below the plan canvas cannot receive clicks, so `samHit` tests the map click against the enemy rings (smallest wins; pointer cursor over a ring).
- Radar squares of flights that cannot be loaded (`deps.canSelect` false) are dashed.

### Map page v10
- **Menus**: FILTERS (top right), LEVELS (top left, order: coastlines, satellite, BMS official, BMS folder, topographic, Custom), DTC (bottom left, sections Filters / Editing tools / Functions) are drop-downs (`ddown`). The map note is its own floating element (`#mpnote`). All section switches are green. Sections renamed: "In flight"; "Package" sits above "Label and distances".
- **Persistence**: `PREF` (filters, level, open menus, view) goes to the browser storage and, in the desktop app, to `mapprefs.json` next to `config.json` (`platform/desktop.js loadPrefs/savePrefs`, written 0.8 s after the last change). "Clear filters" / "All filters" is not stored.
- **BMS folder picture** (`skyLayer`, `mapwarp.js pictureTile`): decoded with `createImageBitmap` (off the main thread), cut into 256 px tiles on demand straight from the full-resolution picture (a 4096 px reduced copy serves zoom <= 9), no huge intermediate canvas. Extent assumed = standard BMS extent (unverified for this picture). `window.__localMap` is a test hook.
- **DTC editors**: precision target = typed STPT number (moves the point) + position + altitude; line point = Delete / Delete line; PPT = threat list (`PPT_TYPES`, ring range from the campaign unit data). `+ LINEn` becomes `- LINEn` when the line is complete and removes one point per press. Rectangle: corners scale, middle moves, round handle turns (`rectPlace`, local metric frame).
- **SAM units**: the markers of SAM units live in `G.su` and follow their range layers as well as their unit layer (`unitVis`). Enemy unit markers open the "Add as PPT threat" popup.

### Map page v11
- **PPT list**: `data/ppt.js` = the `Ppt.ini` of the BMS campaign folder (242 entries: name written in the DTC, ring range in ft, label). The PPT editor is a select over it; "Add as PPT threat" on an enemy unit picks the entry whose label is found in the unit name (weapon systems only), else uses the unit's own range. Menu names: "Pre-planned" (button), "Pre-planned threats" (layer).
- **Game look** (`PAL.game`, used on the two BMS pictures): white plan with black outline, cyan friendly / red hostile unit symbols (`#mpbody.game` CSS, `svg.u-friend|hostile|neutral`), flat blue enemy SAM coverage, dark green bullseye. `pal.sam` holds the ring styles of every palette.
- **Loading**: `note(msg, pct)` shows a loading bar (moving when the duration is unknown). The online / custom pictures are re-projected in slices (`warpImageAsync`). The 16k picture is kept as 2048 px blocks (`blockSource`) plus a 4096 px copy; tiles are queued and drawn ~8 ms per frame, newest first, dead tiles skipped.
- **Others**: airbase symbol = two parallel runways cut across by a third; refuel steerpoint = square; "Only support" (ATO categories Support + C3I) under Friendly flights; Open DTC button is green and carries the file name; FILTERS header folds / unfolds all sections; `- LINEn` deletes the line after asking; the rectangle has two round handles with the heading next to the top one.

### Map page v12
- **DTC editing tools**: `AUTO PPT` (a PPT for every enemy SAM crossing the flight plan of the selected flight, longest range first, skipping positions already in the DTC; warns when the free slots run out), `CLEAR PPT` (asks first), `AUTO BULLSEYE` (3-point L in the first LINE with 3 free steerpoints: 30 nm east of the bullseye, the bullseye, 60 nm north). Without an open DTC the buttons (and "Add as PPT threat") show a warning instead of being disabled.
- **Colours**: SAM rings orange, PPT red (the BMS picture keeps the flat blue coverage). SAM ring radius = range of the matching entry of `data/ppt.js` (so it equals the PPT ring); the ring itself is no longer clickable, the unit is. PPT labels on the map show the list label (SA-10), the DTC keeps the code (10).
- **Filters**: an "only ..." switch turns its amber parent layer on; All / Clear filters leave the DTC filters alone; LEVELS / FILTERS / DTC buttons are green.
- **Rectangle**: Create / Cancel hang under the rectangle (`.rcb` marker, follows it) instead of the banner.
- **Map from the BMS folder**: the reduced 4096 px copy is stored in IndexedDB (`skysm`, keyed by the file size); the next start shows it without decoding the 16k picture, which is decoded and cut into blocks in the background the first time a zoom level of 10 or more is needed (those tiles use the reduced copy meanwhile and are redrawn when the blocks are ready). Test: `tools/mapcache-test.py`.
- **ATO**: one button "Open all / Close all" (Close while anything is open).

### Map page v13
- **JTAC filter** ("Only the JTAC of the selected CAS flight", under Friendly units, amber like the SAM one): the unit comes from `jtacPick` (rules/support.js, the same rule the datacard uses: friendly ground unit near the CAS target or the enemy). Without a CAS flight / JTAC all friendly units stay. Flights that cannot be loaded on the datacard (non F-16 / F-15 hi-fi) cannot be selected, so in practice the filter works for the selectable CAS flights.
- **Pre-planned colours**: "SAM" PPTs (list entries 0-25: SA-n, AAA, ManPad, Hawk...) red, the others green (`pal.dtc.ppt` / `pptO`); PPT rings solid; enemy SAM unit rings dashed, friendly ones solid. On the BMS pictures: all PPT green, precision targets white (black outline), lines black, enemy SAM rings red.
- **Enemy unit popup**: SAM / AAA unit -> "Add as Pre-planned"; any other unit -> "Add as precision target".
- **DTC tools**: AUTO PPT first removes the SAM PPTs of the DTC; CLEAR opens PPT / TGT / LINES (each asks first); BULLSEYE LINE needs a completely empty LINE (3 points only).
- **Tanker track** (like WDP): click the track of a tanker (flight icon), choose "Add to line n": the rectangle tool opens laid on its two FUEL waypoints (width 10 nm, `rectStart(pre)`).

### Map page v14
- **Filters**: Clear / All filters now include the "only" switches (sx, fs, sj) and redraw (`refilter`); the DTC filters stay untouched.
- **SAM rings**: "Ring fill" slider (SAM range section, `st.on.ringfill`, 0-60 %, default 8) sets the colour inside the unit rings; an enemy SAM unit with a SAM PPT (ring) of the DTC on it shows only the red PPT ring (`pptCovers`; `sams()` is redrawn from `dtc()`).
- **Editing tools** are grouped: `⊞ Points` (precision / pre-planned), `☰ Lines` (+LINE1-4), `☰ CLEAR` (PPT / TGT / LINES), `ADD TANKER` (list of the AIR REFUEL flights of your side by callsign; a click lays the rectangle on the two FUEL waypoints in the first LINE with 5 free steerpoints, otherwise a warning). `foldRow` = 150 ms fold-out. Clicking a tanker track selects it as before.
- **Names**: units are shown by battalion (`ordinal + type`, `bn` in `mapUnits`); the type stays as second line in tooltip / popup and drives the PPT matching.
- BMS pictures: SAM PPT red, other PPT green, precision targets white, lines black.

### Map page v15
- **DTC menu**: editing tools stacked (Points, Lines, AUTO, Rectangle, CLEAR); the hamburger buttons fold their sub-buttons out at the right (`.mpt` row + `.mpsub`, `foldRow`, 150 ms). AUTO = BULLSEYE LINE, TANKER (callsign list) and PPT. Functions in two columns (Open DTC / Revert, Save / Save copy).
- **Tanker track**: whole empty LINE (like the bullseye line), rectangle laid on the FUEL points when the callsign is clicked. The line gets a label like the flight labels (`label(..., 'tk', TLB)`, big callsign + activity window from `opWin`); the link line-to-tanker is kept in `PREF.tanks` (matched by the first point), so it survives restarts as long as the line is not moved.
- **Filters**: the Display section has its master switch (Names).

### Map page v16
- **DTC menu**: the DTC filters and the editing tools (`#mpdedit`) are hidden until a DTC is open (`dtcInfo`); the function buttons are a separate block below. A hamburger button (Points, Lines, AUTO, CLEAR) is replaced by its sub-buttons (`swap`), a ◂ button brings it back; the tanker callsigns replace the AUTO buttons the same way.
- **Tanker track**: `tankAdd` writes the closed rectangle straight into an empty LINE (no editing, no Create); the rectangle tool is unchanged.
- **FRONT LINE** (AUTO): `frontLine(U, 6)` in mapdata.js. Friendly combat units (no supply / HQ / engineers / air defence) closest to the spotted enemy ground units (nearest 30 %, within 60 km), the front axis = main direction of those units (PCA, west to east), 6 equal stretches along it, in each the unit closest to the enemy; the 6 points go into an empty LINE. It only sees the enemy units the viewed side has spotted.

## Map page v17
- Hamburger sub-buttons (`.mpsub`) are a vertical column and fold back into their hamburger after a sub-button is used (`fold(k)` in `dtcMenu()`; the tanker list folds AUTO via `foldTk`). CLEAR buttons use `.btn.g.rd` (red).
- AUTO PPT also switches the "Selected flight" section on (`setLayers(secKeys('Selected flight'), true)`). Tanker label: callsign, aircraft model (`flightInfo().ac`, saved in `PREF.tanks[].ac`), activity times.
- "Ring fill" also sets the fill of the PPT SAM rings (`dtcRing`, live update of `DT` rings in the slider).
- Light palette: plan `#d6007a` with a white casing, so it stays visible on the topographic map.
- Base maps: new `coastl` (light coastlines). `mkCoast(COAST.dark|light)` builds land, lakes, rivers, borders (`G.coastD`, `G.coastL`). `basemap.js` now also has `rivers` and `lakes` (Natural Earth 10m, public domain; `tools/make-basemap.mjs <world-atlas dir> <geojson dir>`).
- Screenshot fallback: when the base cannot be exported, the offline coastlines (light or dark as the plan palette) replace it for the capture, and the warning says so.

## Map page v18
- Hamburgers: `.mpsub` = row (◂ centred on the left, `.mpv` column of sub-buttons on the right); `swap(btn,row,open,after)` fades the row out in 150 ms. Sub-buttons fold their hamburger (`fold(k)`); `reset` restores the nested states (AUTO tanker list, CLEAR→PPT).
- CLEAR is a square red button (`#mpdclr`) beside the DTC functions (outside `#mpdedit`, disabled without DTC): ALL, PPT ▸ (SAM / OTHER), TGT, LINES → `clearPoints('all'|'sam'|'oth'|'prec'|'line')`. Line buttons are plain 1-4 (`− n` when complete). Points sub-buttons have small icons (`ICON`).
- Levels menu closes after a choice (`baseSet(false, true)`, not for the imported picture). One Coastlines level with a "Light version" switch (`st.cl`, `PREF.coastLight`; old `coastl` preference migrates).
- New PPT starts on a disabled "— choose a threat —" option (picking the first list entry, SA-2, did not fire a change before). `.ddp` list and `.dtp select` restyled; names are black on light bases; toasts are centred; ATO header rows spaced.
- Rivers: Natural Earth 10m `rivers_lake_centerlines_scale_rank` (261 lines in the region) + lakes.

## Map page v19
- Labels of package mates and tanker tracks are clickable (`label(..., pick)`, `data-lb` + capture listener on the host): they select the flight (`deps.selectFlight`; a message appears if it cannot be selected).
- `clearFilters` also resets the Names display. LINE buttons: red = 6 points, green = partly used, white = empty (`lnr/lng/lnw`).
- No back buttons: opening a hamburger closes the others (`foldAll(except)`), a click on an empty spot of the map closes all of them (and the tanker list / CLEAR→PPT sub-menus).

## Map page v20
- Editing tools are three square buttons in one row: ＋ (green: Points ▸, Lines ▸, Rectangle), − (red: ALL, Points ▸ → Precision / Pre-planned ▸ → ALL, SAM, OTHER; Lines ▸ → ALL, 1-4) and AUTO. Hamburgers are generic (`HB()` helper, `.hm` > button + `.hs` sub-list, nested): opening one closes its siblings, a leaf button or an empty map click folds everything (`foldAll`). Adding to a full line only warns; a line is emptied from − → Lines → n (`lineDelete`). The add-line buttons are red / green / white (full / partly used / empty).
- Notices: `toast(msg)` = informational, bottom of the map; `toast(msg, true)` = danger (a refusal and its reason), red, centre, with OK.
- The Light version switch of the coastlines does not close the levels menu (only the radio choices do). Game palette: white halo on the line STPT numbers. Rounder `.ddp` list and select; ATO faction row holds the flights count on the right; Kneeboard: Import images green, Clear kneeboard red.

## Map page v21
- DTC area split: `#mpdtc` (opened by the green DTC button) holds `#mpdedit` = two separate boxes on the left, 16 px apart: `#mpdfil` (green "Filters" button `#mpdfb` shows/hides the DTC filter rows, key `dtcFilOpen`) above `#mpdham` (the ＋ / − / AUTO hamburgers). The functions (`#mpdfun`: Open DTC…, then Revert / Save / Save copy once a DTC is loaded) sit to the right of the DTC button. Without a DTC the button only warns.
- Hamburger look: ＋ sub-buttons green border, − sub-buttons red border (the ALL buttons are filled red), AUTO blue (wide, filled) with blue borders; line numbers are 34 px squares in a 2×2 grid (`.mpg`); − Lines has ALL under the numbers, − has the general ALL last. AUTO order: PPT, BULLSEYE LINE, FRONT LINE, TANKER (hover shows the aircraft and activity times).
- All filters: when every filter is off by hand the button reads "All filters" and switches every layer on (`clrLabel`, `clearFilters`).
- Notices have no OK button and never take clicks (`pointer-events:none`); they fade by themselves (info 5 s, danger 7.5 s).
- Every light map now uses the BMS palette (`PAL.game`): white plan with black casing, black airbases and bullseye, white chips behind line STPT numbers, line labels and package labels. `PAL.light` is unused.
- The custom `<select>` list is opened from a capture-phase listener: Leaflet popups stop `mousedown`, so the PPT list was still the native one.
- ATO: Close all keeps only the package of the selected flight in its mission (`ATOONLY`, cleared by any header click, search or Open all); the flights/packages count button shows/hides the search filters (`ATOFLT`); Faction is a button (`#aq_viewb`) that opens the list of the hidden `#aq_view` select.

## ATO scroll (v21b)
- The ATO is redrawn after every click. `atoList()` / `atoSearch()` now keep the scroll position of the nearest scrolling ancestor (`scrollKeep()`), and `collapse()` / `expand()` hold the height of `#atolist` while rows fold or unfold, so the view cannot be clamped upwards during the 150 ms animation.

## Non-selectable interface text (v22)
`body{user-select:none}` makes all program chrome (buttons, banners, menus, headers, ATO, map overlays) non-selectable like a native app. `input, textarea, [contenteditable=true], .sel-ok` re-enable selection so fields stay copyable; add `.sel-ok` to any future content block that must be copyable. Covered by a computed-style check in `tools/map-test.py`.

## Map menus v23
- Filters + Editing tools (`#mpdtc`) sit on the left at the vertical centre (absolute, `top:0;bottom:0;margin:auto 0` so the fade animation does not fight a transform), 44 px apart. The function row (`#mpdrow`) stays bottom left.
- The green DTC button toggles filters, editing tools **and** functions (`ddown` gets a small proxy over both elements). With no DTC open it opens the file picker instead (no warning, no "Open DTC" button); the file-name button only shows once a DTC is loaded. After a load started from that button the menus open.
- "Revert changes" is now a red "Reset"; save buttons and the two screenshot buttons carry an icon (`ICON.save/cam/trash`); every ALL button has the trash icon; the ALL of lines and of pre-planned threats are 34 px squares (`.sqa`) beside the numbers / SAM+OTHER.
- The line squares of the "−" menu use the same red/green/white fill rule as the "+" ones (`dtcInfo`).
- Rectangle button: "Place". Line add mode: the point the next click connects to is highlighted (`.nxr`, pulsing ring) and the Done button (`.nxd`) sits beside it (layer group `ADL`, removed in `addStop`).
- Escape for add / screenshot mode is listened to in the capture phase: Leaflet's keyboard handler swallows Escape on the focused map once a popup was ever opened.

## Map / ATO v24
- ATO: a freshly opened campaign is already in the "Close all" state (`atoCloseState()`, shared with the button): search cleared, only the package and mission of the selected flight shown.
- Aircraft tracks get a dotted trail (one dotted polyline per flight over the last 3 minutes, `flightState(f, now - k*20 s)`).
- BMS colours (`#mpbody.game`): callsigns on a white chip with a coloured edge, white leader lines with a black outline for the flight and package labels, white line STPTs and white flight-plan STPTs with black outlines, lighter green for the non-SAM PPTs, a thin black outline on allied aircraft.
- Auto buttons: FLOT (counts every enemy ground unit, spotted or not) and BULLSEYE (with a sight icon). Precision-target popup shows only the coordinates under the battalion name.
- All distances read "NM". Filters: "friendly" is blue and "enemy" red (`fe()` / `ltxt()`). Display section: "Map opacity" slider (opacity of the tile and coastline panes; 100 % removes the style so no extra compositing layer is made).
- Screenshot framing: no instructions next to Capture; while it is open `zoomSnap` is 0.05 and `wheelPxPerZoomLevel` 240 (restored on Cancel/Capture).
- Test notes: Playwright must not return the Leaflet map from `evaluate` (e.g. `setView(...)` as the last expression): with many layers the serialisation fails with "execution context destroyed". `tools/map-test.py` wraps those calls; map clicks must avoid the filter panel.

## v25
- Own message boxes: `window.alert` / `window.confirm` are replaced (small script before the module, `dialog.msg`, same look as the other dialogs, fade in/out). `confirm()` returns a promise (always `await` it); OK = Enter, Cancel = Esc. The file pickers stay the system ones. Every `<dialog>` now fades out on `close()`.
- Tests keep Playwright's dialog API through `tools/dialogs.py` (`install(pg)` after the page is created): the handler's accept / dismiss clicks the real button of the program's box.
- Line drawing: `dtc()` re-evaluates an unfinished line after any change (`addStart` again), so the pulsing ring and the Done button follow a deleted point and disappear when the line is emptied. `addStop(true)` / `fadeOut()` fade the banner and the screenshot frame.
- Animations: closing Filters / Levels / DTC fades (`ddown` click passes `fade`), toasts fade out, hamburgers use a 200 ms / 130 ms ease (`swap`).
- The ATO faction button toggles its list (`ddJust` guard against the same press reopening it). ATO scroll bar is dark. Reset has the ↺ of the kneeboard Restore; "Save copy" is "Copy"; the Points hamburgers use the sight icon.

## v26
- Trail dots cover 90 s (10 s steps). FLOT again uses the spotted enemy units. `.cfr` / `.cen` (friendly / enemy words) are inline and turn amber when an "only" filter is on (`.mpr.fl`).
- The `game` class (BMS colours with their outlines) is on every light map: BMS pictures, topographic, light coastlines. Allied flights use the cyan of the friendly ground symbols; the BULLSEYE label has a white halo.
- Line point popup: `− Delete point`, red `Delete line` with a bin, `＋ Add point` on the last point of a line with fewer than 6 points. Bins on the PPT / precision Delete and on SAM / OTHER removal; fuel-pump icon on TANKER.
- `.ddp` lists (campaign, faction, PPT) have the dark scroll bar. The DDS page gap is always removed (the `removePageGap` setting is gone).

## v27 (map polish, kneeboard preview)
- Tanker label (`.flb.tk`) now uses the normal `.flb` size; only the colours differ.
- SAM/unit popup (`samPopup`): coordinates above a centred "Add as …" button; name/range stay in the hover tooltip.
- Editing tools: long buttons are 98x54 px (`#mpdham .mpv>.btn`), rectangle button has no "(5 pts)".
- Global `input[type=range]` has no padding/border, so the thumb reaches both ends (Ring fill, Map opacity).
- Hover tooltips: `tooltipopen/close` tracked in a Set; any non-permanent tooltip is closed when the pointer is no longer over a marker/path/tooltip or leaves the map.
- Kneeboard page: `#kbpv` is 1024x1024 (the two 1:2 pages side by side), previously 4:3 which stretched the pages horizontally.

## v28
- ATO: in the "Close all" state (`ATOONLY`) a click on the selected package no longer widens the list to the whole mission; the mission header resets `ATOONLY` only when it is closed or another one is opened.
- Screenshot without base map: one short warning (same text for every base).
- DTC Filters macro: no master checkbox; closing the macro switches the DTC filters off (their state is kept in `st.dtcFilMem`, saved in the prefs), opening it restores them.
- Point popups: Delete buttons are red. `+` buttons, DTC Filters button and the player faction button use the program green (`--ac`).
- DTC overwrite: the original is saved once in the program folder (`backup\dtc\<name>.<hash>.bak`), never next to the file in the BMS folder (`IO.appDir`/`IO.makeDir` are replaceable by tests).

## v29
- AUTO buttons (PPT, BULLSEYE, FLOT, each tanker) work once: `AU` remembers what each generated (line + first point, or the PPT slots); `auUsed()` checks that it is still in the DTC, `autoRefresh()` (called from `dtc0` and `tankerList`) dims/disables the button (`.used`) and gives it back when the line/threats are deleted.
- Unit popup shows the battalion name (white, top) above the coordinates; editing tool buttons 86x46 px.

## v30
- DTC Filters button stands alone (`#mpdfil` has no background) like LEVELS; its menu `#mpdfrows` is its own `.mpbox`; closing it still switches the DTC filters off.
- Delete menu: SAM / OTHER are filled red, every icon is the bin.
- ATO: after "Close all" the restriction to the selected package applies only to the selected package's mission; opening another mission shows all its packages. "Close all / Open all" counts a second open mission as "something open".

## v31 (editing tools redesign)
- The editing section is a rail of three square buttons (`#mpdadd`, `#mpddel`, `#mpdauto`, `data-fly` = id of their panel) and side panels `.fly` (`#padd`, `#pdel`, `#pauto`) with tiles (`.tl`, 92x56) grouped by `.fh` headings. No nested hamburgers any more (`HB()` is unused by the DTC menu).
- One panel at a time; the rail button stays visible and lit (`.on`); a click on a tile (not disabled), on the map or on the same rail button closes it (`foldAll`, `flyShow`, 200/130 ms animation). `tankPlace()` keeps a panel clear of the DTC function buttons (shift up / scroll).
- AUTO panel lists the tankers directly (`#mpdtkl`, filled by `tankerList()` when the panel opens).
- Tests: `CHAIN` in map-test.py opens the rail button of the panel that holds a hidden control.

## v32
- ATO "Close all": the package that stays alone in its mission is remembered in `ATOONLYP` (it no longer follows the selection), so choosing a flight in another mission does not open all the packages of the first one.

## v33
- Delete tiles get the class `nil` (grey, not red) while their group has nothing to delete (`autoRefresh`); LINE 1-4 keep their own colour rule. General delete is "CLEAR DTC"; precision buttons are "TGT Stpt"; the unit popup button is "Add TGT Steerpoint". The three buttons of a line-point popup (`.bar3`) share one row and width.

## v34 (manual datacard changes per flight)
- `OVR` (flight id -> {field: value}) keeps what the user changed by hand: the difference between the fields and the automatic fill (`AUTO`, snapshot taken at the end of `apply`). `apply(i)` stores the difference of the flight being left and puts back the stored one after the automatic fill; `apply(i,'reset')` drops it, `apply(i,'fresh')` is used after the memory was cleared (date / weather).
- Marks: amber border on edited fields (`.man`), amber dot after the callsign in the ATO (`.fl.man`), "↺ Reset datacard" button (`#rstf`) while the current flight has changes (`markMan()`).
- `discardOk()` asks "The datacard changes you made by hand will be discarded. Continue?" before another campaign (list or file), a new date (field or .twx) or new weather (.fmap) when anything is stored; Cancel keeps everything (campaign list and date field are put back).
- The memory lives for the session only (cleared when a campaign is loaded).

## v35
- Unit popup: the add button is green and reads "Add Pre-planned STPT" / "Add TGT Steerpoint". The editing panels all open at the height of the first rail button. Save / Copy of the DTC are blue.

## v36 (weather layer)
- Filter "Weather (fmap, winds at 18,000 ft)" in Display (`wx`, off by default; layer group `G.wx`, panes `wxP` 320 / `wxA` 330). `weather()` (called by `refresh()`) draws the loaded .fmap (`deps.getWx`): one image with a soft veil per cell condition (poor grey, inclement dark; colours follow the map palette) and wind arrows every 4 cells with "dir/speed" (shown from zoom 8). The file's wind direction is where the wind comes FROM, so the arrow points the opposite way. The 10 wind layers are taken as 5,000 ft steps (`WX_LV = 4` = 20,000 ft): the file format does not state the altitudes. `parseFmap` now also returns `X, Y, cs, cell(i,j,level)`.
- v34 fix: only the fields typed by the user (`MANK`, filled by `setField`) count as manual datacard changes; values the DTC or the rules write into `F` do not.

## v37
- Screenshot framing: markers/overlays/popups get `pointer-events:none` under `#mpbody.shoting`, the map click handler returns while `shotOn`, popups and add mode are closed on start. Pan/zoom still work.
- Hover: a generic rule gives every `.btn` / `.tab` a hover state (coloured buttons keep their own).
- TGT Stpt delete tile uses the red `rd` style (grey `nil` when there are none).
- PPT popup: the type change refreshes the delete menu (`autoRefresh`); new `data-a=conv` button converts PPT <-> TGT (first free slot of the other group, source removed with `removePoint`; PPT->TGT keeps altitude and uses the threat label as name, TGT->PPT opens the editor to pick the threat). Datacard / Data Cartridge read the same ini lines so they follow.
- Reset / Save (map) and Save-over (DTC page) are `nil` + disabled while no line is dirty; the "nothing changed" alert is gone.
- Kneeboard "Import images" uses the primary green (`.btn`).

## v38
- Line / TGT / PPT add tiles: empty (or room left) = dark with green border, partial line = green fill, full line (or no free TGT/PPT slot, class `lnr`) = red with red border. Line delete tiles: dimmed when the line is empty, red otherwise.

## v39
- Empty-line delete tiles lose the red border; the rectangle button is red (`lnr`) when no LINE has 5 free points; the tanker buttons are disabled/dimmed when no whole LINE is free (`lineRoom`).

## v40 — Data Cartridge page redesign

- `app/js/core/dtcpage.js` (`createDtcPage(deps)`): vertical section nav (Steerpoints, EWS, Comms & Nav, IFF, Link 16, Systems, Weapons, Nav offsets, Other) with amber dot on modified sections. Cards are locked until "✎ Edit". ON/OFF and enums are buttons, no dropdowns.
- Steerpoints: TGT/PPT/Lines tables, STPT number first, AUTO tags from the map (`autoPptSlots`, `lineNotes`).
- Comms & Nav: UHF/VHF presets with "Used by" from the datacard (`freqOwners`).
- "From Datacard" switches (ews/icp/wpn) mirror datacard fields into the DTC (`MIR` table in index.html, prefs in `dtcprefs.json`); edits on the page mirror back to the datacard (`mirrorToCard`).
- Inferred (to verify): TACAN domain labels, STPT type names. MFD, missiles, HARM and Nav offsets calculation are deferred (keys fall into "Other").
- Test: `tools/dtcpage-test.py`.

## v41 — MFD page of the Data Cartridge

- `[MFD]` keys `Display{m}-{mode}-{slot}` / `-csel`: m 0 = MFD 1, 1 = MFD 2 (2-3 unused by BMS); mode 0-5 = A-G, A-A, NAV, MSL OVRD, DGFT OVRD, S-J. Slots are stored in reverse order (file slot 2 = first button on screen) and csel is the file slot shown at start (screen slot = 2 - csel).
- Page codes (decoded from WDP saves Evil19_3/4/5, fixture `Evil19_5.ini`): DTE 5, FCR 11, FLCS 6, FLIR 3, HAD 16, HSD 10, HUD 14, RWR 13, SMS 12, TCN 9, TEST 4, TFR 2, TGP 8, WPN 7, none 0. Codes 1 and 15 never seen.
- Page `mfd` in `dtcpage.js`: slot buttons open a small menu (a page is used once per MFD and mode), round button = start page; Bullseye on MFD as On/Off.

## v42 — Data Cartridge: flight plan, lines, IFF, Link 16

- Steerpoints: read-only "Flight plan" card with the STPTs of the flight chosen in the Datacard (`deps.flight`, from `flightRoute` + `actName`); the DTC route card only shows when the file has route points. Lines are four cards side by side (STPT 31-54, position as `N dd°mm.mmm E ddd°mm.mmm`, elevation). `deps.ll` no longer needs the map to be open.
- Comms: Start presets (Comm1/Comm2) is a small card top right.
- IFF as in the BMS DTC: Status (M1-M4, MC, MS, codes, Auto change), Position event (`POS n …`, event selector 1-2) and Time event (`TIME n …`, selector 1-12, `Criteria` = hhmm edited as hours + minutes).
- Link 16: File A / File B with three columns (fields, flight+team STNs, donor STNs).
- Inferred, to confirm: AutoChange 0 Off / 1 Position / 2 Time; POS Direction 0 West / 1 East.

## v43 — Data Cartridge refinements

- Reset / Save / Copy are right-aligned in the top bar. Descriptions no longer mention the BMS DTC.
- Flight plan card also shows Hdg, Dist, Spd (from the timed waypoints) and Formation (same rule as the Datacard). Precision (TGT) and PPT sit side by side; their position is one editable text ("N 35°56.220 E 126°53.443", parsed by `parseLL`, converted with `fromLL`) that moves the point on the Map. Lines: same editable position, "n/6" counter in the card header.
- Comms: Start presets (horizontal) above UHF / VHF / TACAN-ILS (three columns); COMMS comments and Radio ILS_n now in a bottom card. ICP gets MasterMode NAV/AG/AA (0/1/2). New HARM page (3 threat tables of 4-digit codes; MODE/SUBMODE shown as numbers, TER as TBL1-3 = 0-2, to confirm). MFD: Bullseye is a small card at the top right. IFF event selectors follow the Edit lock. The nav dot has a tooltip ("changed since opened or saved").

## v44 — HARM page with threat names

- `[HARM]` `THREAT t n` = 4-digit ALIC code (t = table 0-2, n = 0-4); names/symbols from the BMS manual table (`THREATS` in dtcpage.js: SAM systems 1xx, FCR radars 2xx/6xx, EWR 4xx). Each row: name button (menu grouped SAM / FCR / EWR), code input (padded to 4 digits), symbol.
- `MODE` 1 = HAS, 0 = POS; `SUBMODE` 0 PB / 1 EOM / 2 RUK; `TER` 0-2 = Table 1-3 (WDP also lists "Table 0", not mapped yet). Confirmed against WDP for MODE 1, SUBMODE 1, TER 0; the other values follow the WDP order.

## v45 — Data Cartridge: layout, MFD default, no "Other"

- Steerpoints: cards are separated by the same gap and stretched to equal height (four lines; precision = PPT); positions use the compact form `N35°56.220 E126°53.443`. No card has a horizontal scroll bar (checked by `dtcpage-test`).
- Comms: the notes of COMM 1/2 sit in the Start presets; the bottom card only holds the ILS presets.
- MFD: blue "Save as default" / "Load default" (stored in `mfddefault.json`; dimmed when there is nothing to save or load; both ask for confirmation before replacing).
- The "Other" page is gone: FCC_AIM / FCC_AGM are in Weapons (raw numbers), MAP_POP (toggles) and OA offsets are in Nav offsets. Sections the app does not know stay untouched in the file.

## v46 — HARM layout

- The three HARM tables and the Delivery card (selected table as 1/2/3) sit in one row. Missile cards are titled as in WDP (A-A missiles / A-G missiles, "Auto Power On/Dir/Wpt").
- From `Evil19_6.ini` (fixture): IFF `AutoChange` can be 3 (so it is probably two flags, not Off/Position/Time) and `POS n Direction` can be 2 or 8 (not West/East): both still to decode. The file has no HUD/Views/Misc/SNSR/INT/CMDS sections.

## v47 — Flight plan read-only, defaults, MFD 3/4, missile values

- Steerpoints: the editable "route points" card is gone. The single flight plan table (STPT, Type, Position, Alt, Hdg, Dist, Spd, Formation) is read-only: it lists the flight picked in the Datacard, or, with no campaign, the file's `target_0..29` (type = last value, alt = −3rd value, position from north/east ft; Hdg and Dist computed from the coordinates, Spd/Formation only exist for a campaign flight).
- Defaults: `deps.dtcDef` (index.html, groups `mfd`, `ews`, `sys`, stored in `dtcdefaults.json`; the old `mfddefault.json` is migrated). EWS and Systems have the blue buttons in the page header, the MFD in its card. `defState()` re-dims them after every change.
- MFD: card "MFD 1 and 2" and, only with Settings → "MFD 3 and 4" (`CFG.ui.showMfd34`), a second card for `Display2-*` / `Display3-*`.
- Weapons back to the narrow grid; missile values are buttons: AIM-9 Spot(0)/Scan(1), BP(0)/TD(1), AIM-120 size Unkn/Small/Medium/Large (0-3); Maverick auto power OFF/ON, direction North/East/South/West of (0-3), steerpoint 0-7.
- HARM: coloured top border per table (blue/amber/purple); radar names and the menu are tinted by type (SAM green, FCR red, EWR teal).
- Web search: the BMS 4.37 technical manual and forum posts do not document the DTC ini format or the HUD/Views/SNSR/INT keys.

## v48 — green headings, Targets page, Systems cleanup

- All card headings (and sub-headings) are green. HARM: only the table top borders and the group names of the radar menu keep their colour; name buttons are plain. HARM "Table 0" of WDP is our Table 1 (`TER` 0): nothing extra to map.
- Weapons: A-A and A-G missiles side by side on the second row.
- Systems: default buttons and the HUD/Views card removed; the `sys` group is gone from `dtcDef`. Not added, because unverified: Master Arm (a forum post says `[Weapons] MasterArm=0/1/2` in the callsign ini; our files have no such section).
- New page **Targets** after Steerpoints: read-only list of `wpntarget_0..99` (those not "Not set"). Picking from the campaign objectives will use `CampObjData.XML` (already read by `bmsdata.js`).

## wpntarget format (decoded from WDP screenshots, Evil19 file)

`wpntarget_n=<north ft>, <east ft>, <-elevation ft>, -1, <name>`; empty slot = `0, 0, 0, -1, Not set`. Same axes as `target_n` and as `PositionX/PositionY` (north/east, feet) of `CampObjData.XML`. The name is the objective name of the XML plus the feature (e.g. "Chongjin Thermal Power Plant" + "Transformer"; "EW Site Chaeryong P-35" + "Radar P-37"); the position of a feature is within ~1000 ft of the objective centre. The XML has only objectives (no features, no elevation: `PositionZ` = 0). The meaning of the fourth value (-1 in every slot seen, "Precision" in WDP's Action column) is unknown: keep it as it is.

## v49 — Targets: objectives and features from the BMS install

- `core/targets.js` (parsers) and `core/targetpicker.js` (dialog: type → objective → feature or centre, elevation typed by hand). Data: `CampObjData.XML` (centre: PositionX = north ft, PositionY = east ft), `ObjectiveRelatedData/OCD_nnnnn/{OCD,FED}_nnnnn.XML` (type via CtIdx → CT type; features), `Falcon4_FCD.xml` (names via CT EntityIdx). Feature position = centre + (OffsetY north, OffsetX east): checked against a WDP file (error < 0.5 ft). Written as `wpntarget_n=north, east, -elv, -1, <objective> <feature>`.
- Only available in the desktop app (the objectives are read when the picker is first opened); tests inject `window.__targetData`.
- The terrain elevation is not in the game data we read: it is typed by hand (default 0).

## v50 — IFF values from WDP

- `AutoChange`: 0 MAN, 1 POS, 2 TIM, 3 P/T (both). `POS n Direction`: 0 "---", 2 North, 4 West, 6 East, 8 South (of the waypoint `POS n WayPoint`): the WDP list order with the even values seen in the files (0, 2, 4, 6, 8); the order is still to be confirmed with a paired file/screenshot.

- FED `Value` is the priority shown in WDP's list (pmc.editing.wiki, Falcon 4 database files): 0-100 in the files (steps of 5; Gimpo/RKSS: runway sections and thresholds 90-100, which WDP calls "Very High"). The thresholds of the WDP names are unknown, so the picker shows the number.

- Targets: the Objects folder is the one of `Falcon4_CT.xml` (not the one of `CampObjData.XML`, which can also sit in the Campaign folder: that copy is read for the objectives themselves).
- EWS values (from the user): BQ = chaff/flares dispensed within BI ms; SQ = number of such sequences, spaced by SI. For the future burst preview.

- Targets page: the column is "Wpn TGT" (n + 1 = `wpntarget_n`). "To STPT" (row, needs Edit) copies a weapon target (name, position, elevation) to one of the TGT steerpoints 81-99 (`target_80..98`) through `deps.pointSet('prec', ...)`, so Steerpoints, the Map and the Datacard (STPT 98 / 99) follow; a used steerpoint is replaced only after confirming.

## v51 — EWS preview

- `core/ewsfx.js`: `ewsEvents(g)` turns a program into release times (BQ pieces, BI ms apart; SQ sequences, SI ms between the last piece of one and the first of the next; capped at 300 releases), `createEwsFx(canvas)` draws a chaff lane (silver-blue) and a flare lane (orange) with a small circular burst per release, a play-head and a time scale. Without animations (Settings or reduced motion) Play only lights the markers. Timing as described by the user (corrected in v52).
- The EWS page has a live (never locked) "Preview" card: buttons 1-6, Play, a one-line summary; the ▶ in the PGM column plays that program. The preview follows edits to the values.

## v52 — EWS colours, TGT steerpoints from the last slot

- EWS: Chaff headers have a blue top border, Flare headers amber (same palette as the HARM tables); the preview uses the same colours. BI = time between two pieces, SI = time between two sequences.
- `freeSlot(pts, 'prec')` returns the LAST free TGT slot (STPT 99, 98, ...): adding a TGT steerpoint on the map fills from 99 downwards (98 / 99 are the datacard's secondary / primary target). Weapon targets (wpntarget) never go on the map.

## Roadmap and decisions (2026-10-15)

- Not wanted: WDP Open 1 / Open 2, and the HUD, Views, Misc (Master Arm), SNSR, INT_LIGHT and CMDS settings. Coordination card: very low priority. Briefing: optional.
- To do: Targets: Action column (needs the list of actions and how WDP writes each one, probably the 4th value of `wpntarget_n`) and picking an objective / building by clicking on the map (the objectives are on the map; the features can be drawn near an objective from their FED offsets). Terrain elevation for targets: still to be found, typed by hand for now.
- To do: apply the STPT of the mission ini (= the campaign's ini, `[MISSION] title` + `[STPT]`) to the callsign ini; to be designed together.
- To do: a different layout of the datacard (soon); Performance and the calculators (PopUp, HADB, TOSS).
- Decodings to confirm by the user: IFF direction order, HARM HAS/POS order, TACAN T/R and A/A, STPT type names. The EWS timing is confirmed.

## v53 — EWS: Control layout and slider mode
- Control card spans 2 grid columns (`.dcard.s2`): on/off rows left, Chaff/Flare bingo right.
- Programs card has a "Sliders" toggle (`data-ewsmode`, remembered in sessionStorage `ewsm`) that swaps the table for a slider view of the program chosen with the pills (`data-sp`, shared with the preview). Min-height = the table height measured at toggle time.
- Each slider is `input[type=range][data-s][data-k][data-sl]`, committed by the generic change handler (which re-renders when `data-sl` is set); the paired number input is updated live via `oninput`. Max = max(default range, current value). Chaff blue, flare amber.

## v54 — layout tweaks
- Range inputs: `padding:0!important` (the generic input padding made the ends unreachable by click).
- EWS Control: right column = Bingo switch, Chaff bingo, Flare bingo; left = REQ JAM, REQ CTR, Feedback.
- Comms: ILS presets are stacked blocks (MHz + note) under the TACAN card.
- Link 16: files A and B side by side from 1250 px (`.l16two`), one per row below that.

## v55 — HARM threat panel
- The floating threat menu is replaced by a wide card (`harmp`) under the tables, always shown (state `HPICK`, default table 1 slot 1; clicking a slot of an unlocked table selects it; the panel is locked while that table is). The current threat is highlighted in the colour of the table; group titles are red. Items use the DTC menu style (green bar + highlight on the current threat), grouped SAM / FCR / EWR, with group filter pills and a live search (DOM filtering, no re-render). The slot being edited is outlined in its table.
- Link 16: the donor block is separated by a rule and extra margin.

## v56 — HARM single Edit and common threat list
- One "✎ Edit" in the page header (`data-edit="harm"`, OPEN key `harm`) unlocks the three tables, Delivery and the threat list (`card` option `ok` = the OPEN key).
- The threat list is common to all tables: every threat present in any table is highlighted in that table's colour with one dot per table that has it, so used / missing is visible at a glance. Filters are plain clickable text (All / SAM / FCR / EWR); the explanatory hint was removed.

## v57
- Nav offsets: the Map pop-up options (MAP_POP, BMS map-layer switches) are no longer shown; the section stays recognised so it is not reported as unknown.
- Systems: Manual wingspan has its own card (`wspan`), no longer inside ICP.
- Kneeboard: the big preview canvas is a centred block.
- Design preview of the Performance and Weapons pages (artifact, sample values): fuel plan per steerpoint + assumptions; weapon calculators as tabs (Pop-up, HARM HAS/POS, TOSS, BVR/MAR) with a side profile and "use the result" actions.

## Roadmap note (2026-10-15): weapon calculators and licence
- Weapon calculators (Pop-up, HARM HAS/POS, TOSS, BVR/MAR) and the Performance page: design previews exist (artifact "Performance e armi"). Weapons use the app's own map (flight plan + the weapon's horizontal envelope: ingress / egress lines, pull-up and release points, impact point) and write the offsets to the DTC (VIP/VRP, OA).
- The pop-up maths is written from scratch; the UOAF `bms_html_briefing` project (AGPL-3.0-or-later, wsy 2025) is only used to cross-check results.
- Licence decision: BMS Cards will be relicensed AGPL-3.0-or-later as the very last step before any public release (add LICENSE, update CREDITS.md and the README, include the project's credit). The embedded AIP elevation table must be removed or cleared before publishing.

## Terrain elevation (found 2026-10-15, to implement)
- BMS keeps the terrain heights in `HeightMap.raw` under the theater's NewTerrain folder (`...\HeightMaps\HeightMap.raw`, found through the theater's `Theater.txt`). Facts taken from the way the UOAF tool reads it (only the file format, no code): little-endian signed 16-bit samples in feet, a square grid (side = `map size in pixels` of Theater.txt, else sqrt(file size / 2); the 16k theaters are 32768 px = ~2 GB, so read single samples with a seek, never the whole file), covering `theater size in km` (Theater.txt) in both directions. Pixel x = east/maxEast * (side-1); pixel y = (1 - north/maxNorth) * (side-1); coordinates are BMS north/east feet (0..size in feet).
- Use: target elevation for the Targets page (the open "elevation" item) and MSL values of the weapon calculators. Needs desktop file access with seek (Tauri fs `open` + `seek` + `read`); tests: synthetic small raw file.

## Pop-up engine (v58)
- `app/js/core/popup.js`: pure functions (`computePopup(target, ref, inputs)`, `bombFall`, geometry helpers) in BMS north/east feet. Inputs and limits as the UOAF tool (dive angle 5-45, release alt 100-10000, ingress alt 0-5000, speed 300-650 kt, time on final 0-20, action range 1-10 nm, ripple pulses / spacing, stick MID or START, attack or ingress heading, OA2 off / on the target at zero elevation / out along the egress (straight on, or turned left or right by 15-90 deg), turn side, 3, 4 or 5 G (whole numbers), bomb range model low drag / high drag / manual).
- Results: POP bearing/range, DA, CA, pull-down and apex altitude, MRA (loss + 120 ft), AOD, MAP distance, turn radius, TOF of the stick, PUP / PDP / MAP / release / OA1 points with the turn arc, and the NAV OFFSETS rows (bearing 0.1 deg, range ft) for PUP and OA1 relative to the reference steerpoint (VIP or VRP).
- Cross-check: scratch harness (not in the repo) ran the UOAF functions and this engine on 300 random inputs: valid cases agree within 0.5 ft / 0.3 deg, error cases coincide. The only difference is that the UOAF code rounds the leg heading to 0.1 deg before placing the PUP (up to ~50 ft on long legs); this engine keeps it exact. `tests/run-popup.mjs` holds golden values.
- Next: the Weapons page (map + side profile + sliders), writing PUP/OA1 into Nav offsets, terrain elevation from HeightMap.raw.

## Weapons page (v59)
- New tab "Weapons" (`app/js/core/weaponspage.js`, state in sessionStorage `wppopup`). Pop-up only for now; the page is written so other calculators can be added as further tabs.
- Left: reference (VIP / VRP), steerpoint (VIP point and base of the OA rows), target (a `wpntarget_n` of the Targets page), range model, sliders with the engine ranges (`LIMITS`), pulses / spacing, stick, turn side, 3-5 G, heading, OA2 (off / target at zero elevation / egress with turn none-left-right, angle and range).
- Centre: horizontal view from `computePopup` (route, PUP, PDP, arc, MAP, release, target, OA1, OA2, nm rings, flight plan). The "Map layer" switch draws the picture of the Map page (`mapV.underlay()`) under the drawing with its own opacity; nothing is downloaded from here, without a picture on the Map page a note says so.
- Right: POP and angles, side profile (altitudes AGL, distances to scale), results, NAV OFFSETS table and "Apply to the DTC": writes the reference row (`VIP` = VIP to target, `VRP` = target to VRP), `VIPPUP` / `VRPPUP` and `OA1-n` / `OA2-n` for the chosen steerpoint (any route steerpoint 1-24: missing rows are created; for VIP / VRP rows the 4th value is the steerpoint number, as in the UOAF tool's `row.stpt`), and sets `Modesel`; asks before replacing non-zero values; the change goes through `dtcChanged`, so the DTC page, datacard and map follow.
- Not yet: elevation of the terrain (all heights are AGL), picking the target on the map.
- Tests: `tools/weapons-test.py`.

## Impact pattern, steerpoints, terrain reader (v60)
- Engine: `impacts` (distance from the target along the attack line, time after the first release, bombs per pulse; `releaseMode` single / pair). The Weapons page shows them in an "Impact pattern" card scaled to the stick. Not modelled yet: sideways gap of a pair, CBU burst altitude / footprint (needs the weapon data).
- Nav offsets page lists every `OAn-m` row of the DTC.
- `app/js/bmsdata/heightmap.js`: reader for `HeightMap.raw` (format above), `readAt(offset, len)` injected; `desktop.readRange` / `fileSize` open the file with seek (capabilities `fs:allow-open/seek/read/stat`). `tests/run-heightmap.mjs` uses a small synthetic file. Not yet wired to the pages: the folder of the theater's Theater.txt / HeightMaps is to be confirmed on the real installation.

## WDP profiles, reference points (v61)
- The engine now follows the Weapon Delivery Planner manual: pull heading = attack heading turned away by the angle off (2 x climb angle; climb angle = dive angle + 5 up to 15 deg, else + 10; the climb angle is not the release dive angle); the climb runs straight on the pull heading, at the pull-down point the aircraft turns by the angle off (3-5 G radius) and rolls out at the MAP. The old "action range" (UOAF tangent construction) is gone: the PUP is now exact on the pull heading. The vertical numbers (bomb range, AOD, pull-down / apex altitude, MRA, altitude loss) are unchanged and still agree with the UOAF tool; the PUP position differs from it.
- Profile Type 2: the approach already is the pull heading (PUP = start of the climb). Type 1: straight in over the target, at the PUP a first turn away by the offset angle onto the pull heading (found by solving that the straight-in heading points at the target; `firstArc`, `approachHeading`, `offsetAngle`, `climbStart`). The line-up point (VRP) lies `vrpToPup` ft before the PUP (Type 1: on the line target - PUP; Type 2: on the pull heading).
- Reference: VRP = target based (rows `VRP` = target to VRP, `VRPPUP` = target to PUP); VIP = a chosen point (TGT STPT, route 1-24, geo-line points 31-54, PPT 56-80, precision targets 81-99): rows `VIP` = VIP to target, `VIPPUP`. The 4th value of those rows and the OA rows belong to the TGT STPT (a route steerpoint 1-24, the one holding the target).
- Bearings and headings run 1-360 everywhere (north is 360, never 0): sliders, results, `offsetRow`.

## Units, egress altitude, fuze (v62)
- The Weapons page shows distances in nm (VRP to PUP, egress range, AOD, MAP, radius, arming distance) and altitudes in ft; the engine keeps feet. The NAV OFFSETS table stays in feet because those are the DTC units; stick spacing stays in ft (it is a short distance set in ft in the SMS).
- Egress altitude: `egressAltitude` is written as the elevation (3rd value) of OA2 when OA2 is on the egress; OA2 on the target gets 0.
- Fuze (own card): C1 (free-fall / GBU: arming delays AD1, AD2) or C2 (CBU: arming delay and burst altitude). Values start from the DTC bomb profile 1 or 2 (`ProfileN_C1_AD1`, `_C1_AD2`, `_C2_AD` in 1/100 s, `_C2_BA` in ft); "Write to DTC profile N" puts them back (asks first). Engine `fuze`: fall time, whether each delay is shorter than the fall (armed), height and distance from the release at that moment, and for C2 the burst point (height, time, distance short of the impact point, whether it is armed before it opens). The bomb track comes from the same drag model as the bomb range. The CBU footprint is not modelled yet.

## Weapons page on the Map page's map (v63)
- The horizontal view is the Map page's own Leaflet map: `mapview.attach(el)` moves its container into the Weapons card (the layer and the flight plan chosen there are seen as they are), `detach()` gives it back (called by `show()`, by the tab handler via `wpPage.leave()` and before the page is rebuilt). The pop-up is drawn in a layer group on its own pane (`wpP`); opacity of the base map only changes `tilePane` / `coastP` while attached. Zoom, pan and a "Fit view" button; the view is fitted when the target, reference or profile changes, never while a slider moves.
- Target = steerpoint 1-99 (route, geo-line points, PPT, precision targets); weapon targets (`wpntarget_N`) are not used, because on board the pull-up point and the OA rows hang on steerpoints 1-99. The OA rows of the target steerpoint are `OAn-<stpt>`; VIP / VRP carry the same number as 4th value.
- One colour and dash per phase in every drawing (`PH`): ingress green, climb amber, pull-down turn magenta, dive/tracking blue, bomb fall red dashed, egress/OA violet dotted. The vertical pull-down arc is a closed-form circle (joins the dive line exactly). On an engine error the horizontal map and the impact pattern are hidden and the message is shown in the centre.

## Terrain elevation wired in (v64)
- `terrain()` in index.html finds `Data\TerrData\<theater>\NewTerrain\HeightMaps\*height*.raw` (the theater folder comes from the tdf entry of Theater.lst, then `TerrData\<name>`, then `TerrData\Korea`), reads `Theater.txt` from the theater folder, `NewTerrain` or `HeightMaps` (else 1024 km) and builds the spec; samples are read one at a time with `readRange`.
- The Weapons page asks `deps.elev(points)` for target, OA1, VRP and PUP (latest request wins) and shows TGT ELEV and MSL altitudes; Apply writes these elevations as 3rd value of OA1 / VRP / VIP / PUP rows (OA2: 0 on target, egress altitude on egress). Without the BMS folder nothing changes. `wpPage.setElev(fn)` is the test hook.

## CBU damage data (v65)
- `bmsdata/bombdata.js`: parses `Data\Sim\...\Bombdata\<name>.dat` (list in `BombTypes.lst`; read from the BMS folder with `findFiles`, built-in `FALLBACK` numbers for the 7 CBUs otherwise). Footprint of a burst = circle of diameter min(`cbuMaxDamageDiameter`, burst altitude x `cbuDamageDiameterBurstAltMultiplier`); full effect up to `cbuLethalHeight`, none from `cbuIneffectiveHeight` (linear in between: our assumption).
- Fuze card (C2) has a Weapon select; Results show FOOTPRINT; the map draws a circle at the burst point of every pulse and the impact pattern a footprint bar. The Bombdata files have no loft / DTOS / HADB data.

## Weapons sub-menus: Pop-up, HADB, TOSS (v66)
- Tabs at the top of the Weapons page (`st.mode`); each profile keeps its own inputs (`st.inp` pop-up, `st.hadb`, `st.toss`), target / reference / fuze / map are shared. All three return the same result shape (`target, pup, vrp, oa, oa2, impacts, fuze, v`), so NAV OFFSETS, results, impact pattern and CBU footprint are common; the horizontal map and the side view are drawn from a spec (`draw` / `vert`: segments per phase, marks, arrows, labels) that the pop-up builds in the page and HADB / TOSS bring from `strike.js`.
- `strike.js` (physics estimate, not the BMS FCC; no weapon file holds loft / DTOS data). HADB: ingress level on the ingress heading (attack heading turned away by the angle off), OA1 a set distance before the VIP; the turn at the VIP is one great-circle turn of the velocity vector, Theta = acos(cos A cos angle-off), displacement R tan(Theta/2) (u0 + u1), drop R tan(Theta/2) sin A, radius from the mean of ingress and release speed at the chosen G; then tracking time, release; the ingress altitude is derived (release altitude + tracking drop + turn drop). LAT: level ingress, optional turn (VRP = start, OA2 lined up before it, ends on OA1), pull-up at the VIP at n G to the release angle (gamma' = g (n - cos gamma) / V, mean speed), optional straight climb, release; the bomb flies up and over with `bombFall` (negative dive angle). VIP = pull-up point; VRP = release point (HADB) / turn start (LAT).
- `popup.js` now exports `stickImpacts` and `fuzeData` (shared by the three engines). Speeds of HADB / TOSS are true airspeed (no CAS conversion yet).

## v67 – Weapons page layout, one Apply, datacard Delivery, map filter

- Left column per mode: Reference · attack cards (Attack profile holds Turn, Turn G, Heading of and the Heading slider) · **Egress** (OA2 + `egressTurn` none|set with the absolute `egressHeading` 1–360; older `left`/`right` + `egressAngle` is still understood by `popup.egressHeading`) · **Weapon settings** (bomb profile 1/2, fuze C1/C2, delays, burst altitude, pulses, spacing, release, target is). TOSS has no Egress card.
- Heading sliders have a number box (`data-slnum`) for exact values.
- Right column: tiles · Vertical envelope · "Fuze … and turn/heading data" · Results · NAV OFFSETS.
- **Apply to the DTC** is `#wpapply` in the main bar (Reset/Save/Copy are hidden on the Weapons tab with `body.onwp`). One confirm writes NAV OFFSETS plus the FCC_AGB profile (fuze delays, C2 burst altitude, `Release_Pulse` = pulses−1, `Release_Spacing`, `SGL/PAIR`, and `Release_Angle` for TOSS), stores `card()` and refreshes the datacard.
- Datacard Delivery: fields `oa0-2`, `ob0-2` (OA1/OA2 from the NAV OFFSETS rows of the steerpoint), `dl_ph/cl/pd/tn/ah/th/ia/is/rh/rs` filled by `applyDTC` from `wpPage.card()`; `dmode` = Modesel · attack label. Profile mode, fuze and SGL/PAIR boxes cycle on click (`CYC`). "HB" is now "BA".
- Map page: DTC filter `da` draws the current attack (`wpPage.spec()` → `deps.attack()` in mapview) unless the Weapons page has the map.
- Targets: no Edit button, no manual elevation (taken from the HeightMap terrain).

## v68 – Missile data (Misdata)

`bmsdata/missiledata.js` reads `Data\Sim\...\Misdata\<name>.dat` (input data, "Range Data" table: altitude × ownship velocity × third axis read as target altitude, with a table multiplier), `MisTypes.lst` and `Lofttables\*.txt` (loft angle by altitude and aspect). `rmax(m, alt, vel, tgtAlt)` interpolates the range (ft), `loftAngle(tab, alt, aspect)` the loft. Velocity unit (ft/s) and the third axis are assumptions to check against BMS. Not yet used by a page: groundwork for HARM HAS/POS and missile range on the Weapons page. Fixtures in `tests/fixtures/misdata`.

## v69 – Missiles page (HARM, BVR / MAR)

New tab **Missiles** (`core/missilespage.js`, maths in `core/airmissile.js`, numbers from `bmsdata/missiledata.js`; `missilefallback.js` holds AGM-88, AIM-120B and AIM-9M so it works without the BMS folder, the rest is read from `Data\Sim\...\Misdata` when the install folder is known).
- **HARM**: emitter = a PPT of the DTC (its range is the SAM ring), missile with seeker type 2, heading / launch altitude / speed / share of Rmax. `harmShot`: Rmax from the table (altitude × ownship speed × target altitude), launch point on the opposite heading, margin to the ring, loft angle from the loft table, flight time with a mean Mach 2.2. POS = known position; HAS = the emitter must be inside the seeker gimbal limit (off-nose slider). Map: ring, Rmax circle, launch point and line (own `wpP` pane like the Weapons page).
- **BVR / MAR**: radar missiles (seeker types 1 and 6). `bvrShot`: head-on Rmax from the table, scaled for aspect and target speed with R = Rhead (Vm + Vt cos a)/(Vm + Vt), Vm = Mach 2.5 × speed of sound (assumption), time of flight, chart Rmax against aspect. No no-escape range or MAR yet: the files do not give one.
- Assumptions to check against BMS: ownship speed of the table in ft/s, third axis of the table = target altitude, mean missile speeds.
- Tests: `tests/run-airmissile.mjs`, `tools/missiles-test.py`.

### MAR (BVR1 paper)
`airmissile.js`: `marUniform` (constant deceleration from vMax so that the missile covers its Rmax; stops at the stall speed = max(400 KIAS as TAS, target speed)) and `marVariable` (a = aMax ((v−vStall)/(vMax−vStall))², 1 s steps, ends at stall speed or Rmax). The paper's vMax / measured aMax for AIM-120B/C, AIM-7, AA-10C, AA-12, AIM-54C are in `MAR_MISSILE`; other missiles get the uniform case with vMax 2408 kt. Rmax = table range of the launch. Tests reproduce the paper's Tables 2 and 4 within a few nm.

### HARM modes and AIM-120 DLZ (manual TO 1F-16CMAM-34-1-1)
- HARM page: POS / HAS / HAD; POS and HAD have the submodes EOM, PB, RUK (`HARM_SUB`: seeker opens 8 / 13 / 30 nm from the steerpoint, narrow / wide / wide FOV). Footprint of the HTS pod (`harmFootprint`, `footprintFactor`): range as a share of Rmax by bearing off the nose, measured from the manual's figure: EOM and RUK a "heart" (1.0 up to 30°, .97 at 43°, .76 at 55°, .62 at 67°, .41 at 77°, .10 at 90°, nothing behind, small notch at the aircraft), PB a wedge of ±11° (the text says 5° for the TOF calculation). HAS: ±60° (120° in all), no footprint. Target isolate (FLEX / GLIDE) and the glide flavours LOTG and EOMG are explained, they do not change numbers (no data for them).
- BVR page DLZ card: RAERO (range at the aspect), RTR (tail aspect), A-pole (range between the aircraft when the seeker goes active, from the pitbull range of the missile file: small fighter 6, fighter 8, bomber 12 nm for the AIM-120B) and F-pole, closure. ROPT, RPI and RMIN depend on termination criteria that are not in the files: not shown.

## v70 – BVR timeline on the datacard
- `app/js/core/bvrtimeline.js`: `CLASSES` (enemy aircraft from the Threat Guide: its fixed MAR and best radar missile), `STD` (standard conditions: 25 000 ft, Mach 0.9 both aircraft, head-on, T notch 15 s, T recommit 20 s, FR 15 nm) and `timeline(class, DB, std, ownMissile)`.
- MAR: `marShot` (BVR1 paper) with the enemy missile when it is in the Misdata files, otherwise the Threat Guide value. DR = MAR + Vc·Tnotch, DOR = DR + Vc·Trecommit (formule_bvr.docx). MTR = Vc·time-to-active + minimum range of the selected own missile (no fixed definition, to be checked). FR is a set value.
- Missiles page, BVR/MAR tab: "BVR timeline · datacard" card (standard conditions, four classes, table, "Fill datacard"). Datacard: fields `bv{0-3}_{0-5}` (Class, MTR, FR, MAR, DR, DOR) at y 793 + 28·row in the BVR box; filled through `deps.fillBvr` → `setField`. Values are rounded to integers.
- Tests: run-airmissile (3 checks), missiles-test (3 checks).

## v71 – timeline scheme, HARM on the Weapons page, "Flight plan only"
- `bvrtimeline.js`: order MTR > TR > DOR > DR > MAR > STERN WEZ. STERN WEZ = tail-chase range of the enemy missile (capped below MAR); TR, MTR and FR are arbitrary margins by the kind of enemy (`CAT`: short / medium / long range, from the MAR). Missiles page card draws the scheme (SVG) of the selected class: Launch and Decide (Banzai / abort at DR) and Launch and Leave (Skate at DOR, Short Skate at MAR).
- The HARM page is now the fourth mode of the Weapons page (Pop-up, HADB, TOSS, HARM). `createMissilesPage` takes `only: 'harm' | 'bvr'` and its own storage `key`; two instances share one missile-file load (`misLoad`). The Weapons Apply button is hidden on HARM (`body.onharm`). The Missiles tab is the BVR / MAR page only.
- `mapview.onlyPlan()` / `planOnly()`: every map filter off except the flight plan (line, steerpoints); pressed again, the previous choice returns. Button "Flight plan only" on the envelope map of all four weapon modes.

## v72 – MAT (standoff toss around a SAM)
- MAT is a switch of the TOSS mode (not a new profile): `st.mat = {on, ppt, samMax, samMin}`. With it on, the ingress altitude slider reaches 50 000 ft and starts above the SAM top (max + 1000 ft); switching it off brings it back under 2000 ft. The steerpoint references (VIP / VRP / OA) do not change; the datacard attack label reads `MAT TOSS`.
- `strike.matCheck(result, {n, e, ringFt}, {max, min})`: samples the ingress / pull-up / climb of the side view against the PPT ring and the SAM altitude band; returns the first crossing, the release distance to the SAM, how far inside the ring the release is, and the along-track stretch of the attack line inside the ring (the box of the side view). The aircraft is safe outside the ring, above the SAM top or below its bottom. `computeToss` now also returns `release`.
- The PPT (with its range ring from the DTC) is chosen in the MAT card; without one the result says MAT needs a PPT. The map draws the ring and the SAM, the side view the "SAM WEZ min–max ft" box, and a "MAT · SAM WEZ" card gives the verdict. SAM altitudes are above the target (same reference as the toss).
- The map button is now "Plan + PPT only": it keeps the flight plan and the PPT layer (`dq`, with the rings) on and the rest off.

## v73 – datacard BVR cells, class menu, filter ring, look
- Datacard BVR box fields now follow the template columns (Class 1265/120, MTR 1388/38, FR 1428/44, MAR 1474/36, DR 1511/40, DOR 1553/42, rows y 793 + 28·n). The Class cell opens a menu of the aircraft (`#chm`, used for any cell with more than 6 choices); choosing one calls `msPage.calc(class)` and fills MTR, FR, MAR, DR and DOR of that row (`bvRow` in `setField`). "Fill datacard" on the BVR Timeline tab still fills all four rows.
- The Missiles tab is now called **BVR Timeline**.
- Weapon maps: the filter button cycles All filters → Plan → Plan + PPT (`mapview.cyclePlan()` / `planMode()`).
- TOSS vertical envelope: still kept to scale; wider (scrolls sideways) when long, taller (up to 1400 px) when high, so the whole bomb curve shows with MAT altitudes.
- One look for scroll bars and number boxes: global thin dark scroll bars, no native spin buttons; `stepper()` adds our own ▲▼ buttons after every number box (also those drawn later, via a MutationObserver).

## v74 – batch of 16 Oct
- Target STPT list order (also the VIP list): TGT STPT (81-99), PPT SAM, Flight plan, PPT others, Lines. A PPT is a "SAM" when its name is in the first 26 entries of `data/ppt.js`.
- MAT: SAM min/max altitudes start from the BMS Threat Guide values of the chosen PPT (`SAMALT` in weaponspage.js: launch floor and typical ceiling); touching a slider sets `st.mat.man` and keeps the manual values until another PPT is chosen. The custom ring/dot of the weapons map is gone: the rings come from the DTC `dq` layer.
- Weapon-map filter button, four states: Map filters (as the Map page) → No filters (every layer off, only the envelope) → Plan → Plan + PPT.
- TOSS side view: the level ingress is cut to a short stub (`max(3000, min(12000, 35 % of the climb extent))`), scale kept equal on both axes within 620 × 520 px, the SAM box is clipped to 1.25 × the highest point of the path; the box scrolls both ways (`.wpvs`, max-height 540).
- VIP far from the attack (> 3 × the attack extent + 5 nm) stays out of the map fit and is labelled with its distance and bearing.
- HARM: colour legend, two independent switches as in the manual: Target Isolate (TI, stops the flex) and Glide Inhibit (GI, stops LOTG; EOMG stays possible unless TI is on too). Default Off/Off = glides and flexes; the page tells what the HARM page shows (TI, TI highlighted, NC, SD). Schematic vertical envelope (launch, loft, seeker opens, flex, glide with the seeker wide open) always shown; state fields `iso` / `gi` (0/1), `harmOpt()` derives flex / LOTG / EOMG.
- BVR timeline: each class lists the radar missiles it carries (`CLASSES[].ms`); the missile selected on the page replaces the class's best one when it carries it (table column "Missile", ★ = the selected one). Banzai track has its aircraft triangle.

## v75 – edit lock, route numbering, scrolling side view
- Route steerpoints of the DTC: `target_N` is STPT **N + 1** (as the Datacard page shows it); the Weapons page used N, so the VIP / target STPT was one off (and the OA rows were written for the wrong steerpoint). Keys 0-23 now give STPT 1-24.
- The DTC points of the shared map are locked on the Weapons / HARM pages: `mapview.setEdit()` (attach turns it off, detach on), button "Edit points: Off/On" (`deps.toggleEdit` / `isEdit`). The Map page is unchanged.
- Side view: 56 px free space on the right (the fall is no longer glued to the border), the box scrolls sideways and opens on the target end; number boxes with a unit put the unit next to the value and the ▲▼ after it.
- HARM page: fixed an extra closing div that broke the grid; the vertical envelope is in the right column. BVR Timeline: results (table, scheme) above, standard conditions and classes below; "Threat Guide" names the MAR taken from the table, the Banzai track ends with an aircraft triangle.

## v76 – flight plan source, VIP reference, physical toss fall
- The Weapons page takes the route steerpoints from the flight picked in the Datacard (`deps.fplan`, the same as the Map and Steerpoints pages); without a campaign flight it falls back to the DTC route points (target_N = STPT N + 1). Target values `r:<STPT>`.
- HADB / TOSS in VIP reference draw the VIP steerpoint and the dashed line to the target, like the pop-up.
- TOSS bomb fall: `popup.bombFall(..., physical = true)`: quadratic drag on the whole velocity scaled by the air density (scale height 26 000 ft), same sea-level drag as the low / high drag model at 500 kt. A lofted bomb keeps its forward speed and does not drop straight down (the old constant deceleration stopped it in about 30 s); MAT at altitude is no longer pessimistic.
- BVR Timeline: table, Fill datacard, standard conditions and classes, then the scheme. HARM FLEX label shortened.

## v77 – project file (step 1)
- `core/mission.js` (pure): `snapshotCampaign(C, flight, {radiusNm})` takes out of the campaign the flight, its package and elements, the tankers and FAC(A) flights of the time window (the datacard looks for them by time, wherever they are), the other flights close to the route and in the same time window, the ground / sea units within the radius, and the squadrons they belong to; `restoreCampaign(snap, D)` gives back a campaign object the datacard code can use (D = the static game tables of the program). Test `tests/run-project.mjs`: the datacard of every flight of both fixtures is identical from the package alone (radius 0 and 60 nm).
- DTC kept in two parts: the text as opened (`DTCTEXT`, set by `parse()`) and the edits (`dtcEditsAgainst`); `applyDtcEdits(original, edits)` rebuilds the text.
- Project file `*.bmsproj` (JSON, `format` + `version`): package, dtc {name, enc, bom, original, edits}, datacard {flight, label, auto, manual, final}, settings {config, prefs}, weapons {wp, harm, bvr} (state of the weapons pages) and mapshot (PNG data URL of the map image). Desktop: a folder `<missions>/<name>/` with the mission file and `settings.json` (cards live in the program's `cardmemory`, kneeboard backups in the program's `backup/kneeboard`); browser: only the project file is downloaded. `paths.projects` (default `projects` next to the program) and `project.radiusNm` (60) are in config.json.
- Top bar: "📦 Project" (open) and "📦 Save project" (next to Copy, which still saves the DTC copy). Opening a project replaces the campaign by the package; the datacard is restored from `final` (weather and Link 16 files are not in the project: the stored values are used, a new fill would lack them).
- Not done yet: applying the settings of a project (that is "sync settings"), weather in the project, the ATO of a project (only its package), p2p.

## v78 – Performance page, project with weather and aircraft

- **Copy** (top bar) now also saves the project; the weather (`.fmap`, deflate + base64) and the aircraft data of the flight travel in the project (`weather.fmap`, `aircraft.{name,perf}`), so a project opened without the campaign or the BMS folder has ATIS/TAF and the Performance page. `parseFmap` keeps the raw bytes (`raw`). Settings: "Projects folder" and "Project radius" (`project.radiusNm`).
- **Performance tab** (`core/perfpage.js`, maths `core/airperf.js`, data `bmsdata/acperf.js`). `Data\Sim\Acdata\<aircraft>.txtpb` (protobuf text, all 200 files read): airframe, lift/drag tables (Mach x alpha), thrust and fuel flow (altitude x Mach, idle/mil/ab), stores drag line (`LIM_STORES_DRAG`: drag index x k(Mach)), gear and air brake drag, wheel and brake friction. Aircraft with a simple engine (no fuel table) burn thrust x `fuel_flow_factor_*`. Built-in data (`acfallback.js`): F-16CM-40/50/52, F-15C, A-10C. Load, stores and drag index come from the Datacard flight (`F.gw`, `F.fuel`, `F.drag`), the aircraft by name (trailing words are dropped when there is no file).
- Tabs: Turn & energy (instantaneous and sustained turn against KCAS, Ps map Mach x altitude at n g), Cruise & range (specific range, fuel flow, table by altitude, range and endurance for the usable fuel), Take-off & landing (rotation and lift-off speed, ground roll, 50 ft, abort at rotation; approach speed and roll with / without brakes). It is an estimate: lift-off at the optimum pitch of the file, constant climb to 50 ft, no TEF/LEF effect, no thrust loss with alpha. The corner speed found (about 440 KCAS for the F-16 at 15 000 ft) is near the 420 of the file.
- Tests: `tests/run-airperf.mjs` (in `npm test`), `tools/perf-test.py`.

## v79 – Datacard from the performance data

- New `core/fuelplan.js`: `fuelPlan(ac, wps, o)` works back from the first landing of the flight plan: the fuel needed on arriving at each steerpoint (Min.Fuel, rounded up to 100 lb) to fly the rest of the plan and land with the reserve (default 1500 lb). Leg burn = planned speed and altitude -> thrust needed (drag + climb) -> fuel flow from the BMS tables; time between arrival and departure of a steerpoint is a hold (Mach .5-.85); at a tanker (action 4) the fuel on arrival is 1000 lb (WDP convention). TO Fuel = the first Min.Fuel; Bingo = the Min.Fuel of the steerpoint after the last activity (first non-basic action), Joker = Bingo + margin (500 lb). `climbAltitude`: highest steerpoint altitude before the activity, at least 15 000 ft.
- `airperf.js`: `refusal` (highest speed from which the aircraft stops on the runway: threshold offset 164 ft, full brakes, idle, cap 225 kt), `climbSchedule` (military power climb, constant CAS then constant Mach, energy method; the least fuel for CAS 300-450 and Mach .70-.90), `milRpm` (max rpm chart x 100: 97 % for the F100-229, as in WDP).
- `index.html` `perfFill(i)` (after every `apply`, and after a change of Gross Wgt / Fuel / Drag idx, of the runway length or of the reserve): fills TO Spec ("AB 12°"), Rotation, Refusal (only when the runway length is known), Mil Power, Mil Climb, TO Fuel, Joker, Bingo and the Min.Fuel column. Fields typed by hand (`MANK`) are not touched; the bingo goes to the DTC like any other datacard field when its group is synchronised. Not run while a project is opened (the project keeps its own values). Only for the aircraft the datacard gives a gross weight for.
- Wind and temperature of the departure come from the weather (`WX.at`); the runway number of the datacard gives the headwind. The runway length is not in the files the program reads: it is typed on the Performance page (Take-off & landing) and remembered per airbase in `perfprefs.json` with the reserve and the joker margin.
- Performance page: new "Fuel plan" tab (table of the steerpoints, TO Fuel / Bingo / Joker / Mil climb tiles, reserve and joker sliders), Refusal speed and Military power tiles in Take-off & landing.

## v80 — Weather by hour, UI clean-up
- `Data\Campaign\WeatherMapsUpdates\<day*10000+hour*100>.fmap` (10100 = day 1 01:00). `WXS` (key → parsed fmap), `wxKey(ms)`, `wxAt(ms)` (falls back on the campaign fmap `WX`), `wxKeys(flight)` (takeoff → landing hours), `wxLoadKeys`, `wxApply(i,set)` (ATIS at departure time, TAF at the target arrival, runways at departure / landing), `wxPrep(i)` loads the maps after `apply` and refreshes non-manual fields. The performance wind/temperature uses the departure-hour map. Day wrap (>17 days) is ignored.
- Project: `weather.series` = {key: deflate+base64 fmap} for the hours of the flight; restored into `WXS` on load.
- Removed from the Datacard page: Random package, DDS downloads, PNG preview, project directory row (`Project` opens the last project's folder). BVR: DLZ and Shot share one section (`.wdz`); UNUSED missiles are hidden.

## v81 — MDC card (alternative Datacard format), test page
- `app/mdc.html` (separate test page, not linked to the app yet), `app/js/core/mdccard.js` (`mdcTexts(F)` maps the Datacard fields to the MDC cells, `drawMdc`, `mdcGapless`), `app/mdc/blank.jpg` (the MDC PDF at 1600x1200, same space as the Datacard template, exported 2048x2048 stretched the same way), `app/mdc/fields.json` (351 cell rectangles found from the PDF by flood fill; `lab` = a label sits at the top of the cell, `multi` = wrapped text), `app/mdc/sample.json` (a sample flight: Datacard F + `__wp` steerpoint lat/long from `mapV.toLL`/`fmtLL`).
- Filled: callsign, take-off / land times, MSN#, tanker, ATIS, TOT/VUL, Joker/Bingo, flight, steerpoints (lat/long, elev, TOS, dist, hdg, min fuel), CFG/GW/DI/ROT/TO/REF, roll call from the package, timeline, overview and free area (ATIS+TAF, airbase frequencies, support, ephemeris). Not filled yet: PRI/FREQ table, NAV, EOB/AO, codewords, SPINS, CSAR, link and the lower waypoint table.
- Test: `tools/mdc-test.py`.

## v82 — MDC toggle, fixes
- Datacard page: `#mdctog` switches the card between the Datacard and the MDC (`MDCON`, saved in localStorage `bmsmdc`); in MDC mode the canvas is read-only (`cellAt` returns null) and `gapless()` uses the MDC page cuts. The form on/off moved to Settings ("Datacard form", `bmsform`).
- Map pages: with Edit points off the popups of the DTC points / units are read-only (`ro`), delete and add do nothing. MAT: changing the PPT moves the SAM min/max sliders to the SAM's altitudes. HARM: changing the emitter threw (`E` out of scope) — fixed. Copy DTC buttons (`#save`, `#mpdcopy`) removed.
- Performance: TO Fuel = parking fuel minus start/taxi burn (idle flow x `TAXIMIN` = 10 min); the fuel the plan needs stays in Min.Fuel of the first steerpoint and in the Performance page.
- BVR: left = table + classes (column) + standard-condition sliders (`data-tls`, live without re-drawing the sliders), middle = scheme (`#msch`), under it the Shot section (shot sliders + results).

## v83
- MDC card is editable: `mdcKeys(F)` maps MDC cell ids to Datacard fields; `MDFD` + `boxOf.mdc` + `cellAt` reuse the Datacard editor. J/B, overview, timeline and lat/long cells stay read-only.
- Map: TARGET rail button (`wtAdd`), red blinking ring (`nxr red`) with "Add to TGT STPTs" (81-99); "Hide all drawings" and Copy removed; filter renamed "Attack".
- DTC buttons renamed "DTC". BVR page in 3 columns; HARM vertical envelope in `#msv`; NAV offsets in `.dstack`; Datacard top bar reorganized.
- fuelplan: `MINGS=300` — legs needing less than 300 kt are flown at 300 kt (no campaign slack); TO Fuel = parking fuel − taxi.

## v84
- Map: CLEAR DTC also removes the weapon targets; a weapon target kept as a TGT STPT hides its red ring and the STPT icon turns red (`wtKept`, `it.wt`). `wpPage.refresh()` after every DTC change keeps the Pop-up/HADB/TOSS reference current; the filter is called "Pop-up/HADB/TOSS/HARM".
- HARM: vertical envelope on the right above the Shot card (taller). BVR: DLZ and Shot merged, columns 430px / drawing / 340px.
- MDC card is filled by hand only: texts are `F['mdc_<cell>']`; `mdcTexts`/`mdcKeys` stay in `mdccard.js` for the future autofill.

## v85
- Ring menu of a weapon target: "− Remove" (`data-a=wdel`, `wtClear`). Popup fields ignore changes while editing is off.
- `wpPage.refresh()` / `harmPage.refresh()`: after every DTC change the chosen target, reference point and HARM emitter follow the point (same position) when it is renumbered or retyped, and the lists are redrawn (the map view is kept unless the lists changed).
- MDC: 273 more empty cells detected on the blank (`x<n>` in `fields.json`: EOB, AO, codewords, SPINS, CSAR, Link, contracts, PRI/FREQ, NAV, lower waypoints, ...), all editable.
- Save project is pushed right on the BVR and HARM pages.

## v86
- Map: TANKER list shows only the tankers on station (FUEL waypoints window) during the selected flight's package; the screenshot frame has a Rotate button (frame on its side, picture turned into the card).
- Saving a project shows a confirmation (`appToast`). BVR timeline column is 480px (room for the star).
- Kneeboard: dropping a card on the left/right edge of another inserts it there (`kbInsert`); the cards of the column move on to the first empty slot.

## v87
- "Project" is now **Mission** (the saved package + DTC + datacard): `core/mission.js` (`buildMission`, `parseMission`, `missionFolder`, `.bmsmission`; old `.bmsproj` / `bms-cards-project` files still open), buttons, dialogs, settings (`paths.missions`, `mission.radiusNm`; old `projects` / `project` keys are migrated in `mergeConfig`), IDs `msf*`, `tests/run-mission.mjs`, `tools/mission-test.py`. Not to be confused with the ATO missions of the campaign.
- Cards (imported pictures + arrangement) are kept in `<program folder>/cardmemory` (`kbMemSave` after every kneeboard change, `kbMemLoad` at start); opening a mission file only adds its cards that are missing and keeps the arrangement when there are cards already.
- Screenshot frame: free **angle** (slider + +90°); the frame keeps the proportions of the card, the picture is straightened (`#mpfr` box around the turned `#mpfi`).
- MDC: 14 cells with a printed label (STEP, START, CHECK IN, TAXI, AUX, TRACK, ALT, OFF, TANK J/B, AIRSPACE/TGT, M1-M4) added (`h<n>`).
- Confirmations (toast) for DTC and mission saves; Browse buttons without dots.

## v88 – Takeoff calibration and TO Spec toggle
- `airperf.js`: `TO_LIFT_GAIN = 1.43` multiplies CL in `takeoff()` (clean-wing CL had no LEF/TEF/ground effect). Calibrated on one WDP point (161 kt at 37 065 lb) and observed 160-170 kt; an estimate, not file data.
- Datacard: clicking TO Spec switches AB / MIL (`cycle('tospec')`, `TOPOWER`, stored in localStorage `bmstopower`).

## v89 – Mission polish
- Mission file extension is now `.bcrd` (only that one is accepted by Open mission; the campaign Browse button accepts `.cam` and `.bcrd`). Mission also stores `tanks` (map labels of the tanker tracks; `mapV.tanks()/setTanks()`).
- Campaign list hides `Save0..5` / `Instant-Save*` (Auto Save stays).
- `unsaved()` (manual datacard fields + edited DTC lines vs the last saved/opened mission, `MSFSIG`): dims `#msfsave` and asks before closing (`onCloseGuard` in desktop.js; capability `core:window:allow-destroy/close`).
- Settings: red box (`#cfgwarn`, `GAMEDATA.warn`) when BMS files/folders cannot be read.
- Kneeboard page instructions behind an Info button; campaign time (hour only) beside the map coordinates (`#mpll`); HARM threat tables have Save/Load default (`DEFSEC.harm`); ATO filter fields show the selected flight as placeholders on the map page only (`atoHints`); screenshot frame size no longer depends on the angle (smooth slider).

## v90 – Pylon and rack weight, joker
- Gross weight and Drag index now include the pylons and racks of every station, as BMS does (Munitions / Drag Factor): `BmsRack.dat` (`parseRacks`, `rackLoad`, `weaponClass` in `bmsdata.js`; table `D.rk`) + the `hardpoint_grp` list of the aircraft file (`D.hp`, read with the whole txtpb). Index k of the loadout = hardpoint k. Checked exactly against BMS: Satan 3 (EvilKorea 2747) 39111 lb / drag 120, Hammer 7 (2525) 45579 lb / 197. Without `BmsRack.dat` the old (weapons only) values are used and Settings shows a warning.
- Joker default is now bingo + 1000 lb (Performance setting; an old stored 500 becomes 1000). Instant* campaigns are hidden.
- Open: Mil Climb schedule (model prefers 440-500 KCAS / .77-.80; WDP gives 390-410 / .80-.85): needs an in-game test (see chat) before changing the search.

## v91 – Units on the map
- Units are always drawn at their exact position. When icons overlap, the SAM / air defense units are on top, the longest range first (SA-10 over SHORAD), then the enemy units, then the friendly ones (`zIndexOffset` in `units()`, rounded: Leaflet writes it into CSS z-index, which ignores fractions). A grid layout of stacked units was tried and removed.
- Open: BMS seems to show some enemy units only after a few seconds of campaign time; the rule is not understood yet. Low-altitude radar coverage (blue areas in BMS) is not implemented.

## v92 — Map: Objects filter
Objectives of the campaign (factories, power plants, radars ...) are drawn as dots (`objDraw` in `mapview.js`), one switch per type in the Objects section (above Display, off by default). A click zooms to the maximum and shows the sub-objectives as smaller dots; the names appear only at the maximum zoom. Colour = owner from the `.cam` deltas (blue friendly, red enemy, grey unknown: the initial owners are not in any file received so far). The map opacity slider now lives at the bottom of the maps menu.

## v93 — Objects as HTML dots, with state
Objects are DOM markers (a canvas dot under another canvas layer was not clickable). Size follows the zoom (`--os`, 3 px far, about 13 px at maximum zoom), sub-objectives are smaller. All white whatever the owner; state from the `.cam` deltas (`objDeltas` in `parsers/cam.js`: per objective owner + status byte of every feature, 0 intact, 3 destroyed; `objState`): grey damaged, black destroyed, inverted on light maps (class `lt`). The Objects section starts folded (default `closed`) and off; afterwards the saved filter memory decides.

## v94 — Objects: magnifier (zoom up to 18), two-step click, airbases
Map max zoom is 16 (base maps are enlarged from 13: `maxNativeZoom`). 1st click on an objective zooms in, shows the sub-objectives and fits them in view (magnifier, zoom 13-16; sub names from zoom 14); the 2nd click opens the menu: Add as weapon target / ＋ TGT STPT (`deps.dtc.elev` gives the terrain height). Airbases (type 1) and Airstrips (type 2) are Objects types too.

## v95 — Squadron page
`js/core/squadron.js`: logbook reader (`parseLbk`: the .lbk is XOR-ed with "Falcon is your Master", chained on the previous encrypted byte, first one with 0x58; name@0, callsign@21, motto@225, squadron@346 of a 372-byte file; the password is not read), codes (`pack`/`unpack`: deflate-raw + base64url, prefix `BC1.`), one WebRTC data-channel link per pilot (`createLink`: invite / accept / join, no signalling server, optional public STUN off by default), the session (`createSession`: the leader has one link per pilot) and the page. The leader's "Send my mission" sends `msfBuild()` (compressed, in 16 kB chunks); a pilot gets a "Load" button that calls `msfLoad`. Tests: `tests/run-squadron.mjs`, `tools/squadron-test.py` (two browsers, loopback).

## v96 — Squadron management
`core/squadron.js`: `createSwarm` announces to WebTorrent trackers (info_hash = SHA1 of `bmscards-squadron:`+secret), the tracker passes the WebRTC offers/answers; a link counts only after an HMAC proof of the secret. If two pilots offer to each other, both keep the link offered by the smaller uid. The roster (`mergeRoster`, newer `ts` wins) and the squadron info are synced on connect and on every edit; saved in `squadron.json` prefs. `campaignSquadrons(C)` sums the 48 pilot records of each squadron (aces = 5+ air kills). Test hook `window.__swarmTest={trackers,interval}`; `tools/squadron-test.py` runs a mock tracker on port 8772. Real trackers are untested in the sandbox.

## v97 — Logbook statistics, phone book, trackers setting
`parseLbk().stats` (offsets calibrated on Evil19.lbk and its Logbook screenshot): float32 hours@72, ace factor@76; u16 rank@80, dogfight won/lost@84/86, online@88/90, kills/deaths@92/94, online@96/98, campaigns@100/102/104, missions@106; int32 score@108, last mission@112; u16 consecutive@116, A-A@118, A-G@128, static@130, naval@132; commissioned date string@45. Medals (somewhere around 140-190) are not decoded: needs logbooks with known medals. A short copy of the stats travels in the swarm `hello` and is kept in the roster. `parsePhoneBook` reads PhoneBkn.ini (Config folder). Settings > Squadron trackers (`CFG.squadron.trackers`, empty = built-in list) restarts the swarm on save.

## v98 — Squadron page in three sections
Members (selected squadron: roster with online dot, role/notes, mission leader star, send mission; mission received; the player's squadron in the campaign), Me (logbook; list of my squadrons with create/join/leave and, for the ones I created, removal of pilots), Settings (invite codes, trackers in use + STUN, phone book, direct connection with two codes, activity). Several squadrons at once: `DB.squads[]` (id, name, motto, notes, secret, owner uid, leader uid, ts, roster), one swarm per squadron. The creator edits the squadron info and moderates; a pilot edits his own row. Removal = tombstone `removed` in the roster (newer ts wins) + the swarm refuses the uid (`allow`); the removed pilot's client leaves the squadron when it sees itself removed. The top bar (DTC/mission buttons) is hidden in the Squadron tab. cam.js: squadron record `sqs` = {missions (u32 at +24 of the 28-byte block after the second vu), acLoss, pilotLoss}: matches the in-game window of the 78th FS (18 missions, 15 aircraft lost; 3 pilot losses in the -B save). Aircraft count, experience, morale, supply, mission rating and the squadron's own kill totals are not located yet: they need a campaign saved while the squadron window shows known values.

## v99 — Squadron tabs, campaign table, pictures
The page has tabs (Members / Me / Settings, `.wtabs` like Weapons). Campaign squadron = a table like the EWS of the DTC (`table.dt`, grouped headers). Pictures: the logo of a squadron (`q.logo`, set by the creator, travels in the squadron info) and the avatar of a pilot (`DB.av`, travels in `hello`/`hello2` and is stored in the roster entry, never inside the roster sync). `shrinkImage` (JPG/PNG/WebP, canvas, max 128/96 px, WebP data URL) and `okImg` (data URL check, also for what other pilots send). Squadron-wide kills (16/57/0/2 of the in-game PILOT tab) and the aircraft count were searched in Bear Trap 26 B (squadron record, tea, plt, pst): not found; the PILOT tab values are most likely the player's own pilot, not stored in the campaign file.

## v100 — Independence from BMS data (public release preparation)
Nothing of Falcon BMS is in the repository any more. `data/index.js` starts with empty tables and optionally loads `data/local/` (ignored by git: copies of the old tables, `acfb` aircraft performance, `mfb` missile data, `bfb` CBU numbers, `ppt` threat list) so the tests run; the program fills the tables from the user's BMS folder (`bmsdata.js`: `ct, ac, wn, ob, rm, S, pn, wt, gu, un, tf, ab` and now `ppt` = Ppt.ini; runways/elevations/TACAN from the ATC files and the AIP of the installation). Without the BMS folder the program says so (Settings message, alert when a campaign is opened). Also local only (`.gitignore`): `app/mdc/blank.jpg` (the MDC blank is picked by the user once and kept in the prefs as `mdc-template.json`), `legacy/`, `tests/fixtures/`, `tests/golden/`. CI (`build.yml`) only builds: the tests run on the developer's computer. perfpage: no more endless redraw when an aircraft has no file (`noData`). The full history stays in the private repository (archive); the public repository starts from a clean tree.

- NAV OFFSETS format: `VIP|VIPPUP|VRP|VRPPUP=steerpoint,bearing,range,elevation`, `OA1-N|OA2-N=bearing,range,elevation` (`navRow()` in weaponspage.js reads both this and the older bearing-first order).

## Weather page and winds aloft
- `parsers/fmap.js`: `WX_ALT` = the 10 wind layers (0, 3, 6, 9, 12, 18, 24, 30, 40, 50 thousand ft; BMS manual table), `wxLevel(alt)` the layer nearest to an altitude (a tie goes to the higher one), `WX_COND`. A parsed map gives `cell(i,j,lv)`, `at(x,y,lv)` (km east, north), `wind(x,y,alt)` ({lv, alt, spd, hdg}), `profile(x,y)` (the 10 layers) and `hdr` (global wind, stratus, contrail altitudes). A cell has cond, p (mbar), t (C), spd/hdg, cu (cumulus altitude ft), dens (1-13), size (0-5), tcu, shower, fogEnd (km, 60 = clear), fogZ (ft). The file stores ONE ARRAY PER FIELD (not per cell).
- Fuel plan (`fuelplan.js`): `o.wind(x, y, timeMs, altFt)` gives the wind aloft of the layer nearest to the mean altitude of each leg, at its middle and its time; the headwind along the track is added to the planned ground speed to get the airspeed (and Mach). Rows carry `hw` and `wind`. `index.html` passes `wxWind` (the map of the hour, `wxAt`). The Fuel plan table has a "Wind aloft" column.
- Weather tab (after Performance; `weatherpage.js`, state in sessionStorage `wxstate2`): the weather is drawn over the Leaflet map of the Map page, borrowed like the Weapons page does (`mapV.attach(box)` / `detach()` on leaving; not editable, no Map-page buttons; the layers, base map and flight plan are those chosen on the Map page; zoom and drag as usual). The tabs above the map choose the filter drawn over it: Weather (game palette: sunny transparent, fair green, poor yellow, inclement red), Wind (colours by speed plus wind barbs, one every ~46 px, redrawn on zoom), Temperature, Pressure, Clouds, Visibility. The cells are an `imageOverlay` (pane `wxP`, one pixel per cell, `image-rendering:pixelated`), the barbs are markers in pane `wxA`. A "TIME & ALTITUDE" button on the map (like FILTERS on the Map page) opens a panel: the time slider over the hourly maps of the flight with DEP / TOT / LAND marks (the map of the hour nearest below is drawn) and the 10 wind layers (SFC to 50), by default the one nearest to the highest altitude of the flight plan (`Nearest to the flight plan` goes back to it). Hover shows the cell data. Cards on the right: airbases with ATIS, target forecast, route table (condition and wind aloft at each steerpoint, at its time and altitude), winds aloft at the target (clicking a row selects the layer). `Fill datacard` (`wxFill`) writes ATIS, TAF and runways again, over manual edits; it is dimmed while the datacard already holds them (`wxFillState`). Mode, layer and time changes redraw only the map and the small parts (`upd()`); the page is drawn again (`draw()`) when it is opened or the datacard is filled. Test: `tools/weather-test.py`.
