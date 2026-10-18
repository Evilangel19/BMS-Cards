# Credits and licenses

BMS Cards is a fan-made tool for Falcon BMS. It is not affiliated with or endorsed by Benchmark Sims or Falcon BMS.

Inspiration and reference:
- Weapon Delivery Planner (WDP) - original datacard planner and DDS reference.
- Datacard blank: layout redrawn by the program (app/js/core/dctemplate.js); it is a reconstruction of the WDP card structure, no third-party image is included.
- Open Frequency (UOAF) - layout and design inspiration.
- bms_html_briefing - reference for BMS briefing data.
- BMSRadio plugin (Tanrr.VAPlugin.BMSRadio) - reference for radio data.

Rule: code from other projects is reused only after checking its license. Each reused part is listed here with its
source, license and author. (Nothing is reused yet.)

Falcon BMS data (Falcon4_*.xml, CampObjData.xml, RadioMap.dat, Strings.txt, Ppt.ini, the aircraft and weapon data files, the ATC files, the AIP, theater files, ...) is read at run time from
the user's own Falcon BMS installation and is NOT part of this program or of this repository: no table, aircraft file, missile file or AIP value is included. Without the BMS folder
(Settings) the program has no game data and says so. The tests use private copies of such data and of campaign files that are kept out of the repository (see .gitignore).

Third-party code included:
- pdf.js 4.10.38 (Mozilla), Apache License 2.0 - app/vendor/pdfjs/ (unmodified build). Used to read the BMS AIP PDF from the
  user's own BMS installation and to render imported PDF pages as kneeboard pages.
- Leaflet 1.9.4 (Vladimir Agafonkin and contributors), BSD-2-Clause - app/vendor/leaflet/ (unmodified build). Map page.
- html2canvas 1.4.1 (Niklas von Hertzen), MIT - app/vendor/html2canvas/ (unmodified build). Map screenshot for the datacard.
- Natural Earth (public domain) coast and border lines, taken from the npm package world-atlas 2.0.2 (ISC, Mike Bostock) and
  clipped to the region with tools/make-basemap.mjs (topojson-client, ISC, used only at build time) - app/js/data/basemap.js.
  The same file holds the Natural Earth 10m rivers and lakes (public domain, github.com/nvkelso/natural-earth-vector, geojson folder).
- Satellite layer of the map (optional, needs internet): Sentinel-2 cloudless 2021 tiles by EOX IT Services GmbH
  (https://s2maps.eu, contains modified Copernicus Sentinel data 2021), CC BY-NC-SA 4.0. The tiles are loaded from the EOX server at
  run time and are not redistributed; the license is non-commercial and share-alike, so it must be re-checked if the program is ever sold.
- Topographic layer of the map (optional, needs internet): OpenTopoMap tiles (CC-BY-SA, map data OpenStreetMap contributors and SRTM),
  loaded from the OpenTopoMap servers at run time and not redistributed. Use is light (one person, on demand).
- "BMS map (official, internet)" base map: the KTO map picture of the official Falcon BMS interactive maps
  (https://maps.falcon-bms.com, picture at cdn.falcon-bms.com). It is loaded live from the BMS server, not redistributed or stored. Its
  position was measured from the public source of the site (github.com/BenchmarkSims/maps-website, GPL-3.0): only facts (airbase pixel
  positions, 4 px per km) were taken, no code. "Imported map picture" lets the user load their own copy of a BMS map picture.
- NATO-style unit symbols (map page) are drawn from scratch with simple SVG shapes following the APP-6 / MIL-STD-2525 look; no artwork copied.

Airbase data: runway numbers and headings are read from the BMS ATC files, ILS frequencies and elevations from the BMS KTO AIP, always from the user's own installation at run time
(the AIP forbids reproduction without permission of the BMS Docs team, so nothing of it is included).
