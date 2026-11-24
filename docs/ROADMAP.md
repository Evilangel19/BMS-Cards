# BMS Cards: status and plans

This file says what the program does today, how far each part has been checked, what is left, and what may come later. Everything outside "Possible later" exists in the code. The history of the changes is in the git log; on the `dev` branch, `docs/archive/` keeps the old roadmaps with the log of every beta.

## How to read the status

- **Verified** - checked in the game or against real files.
- **Implemented** - works, not yet checked in the game.
- **Estimated** - an approximate model of mine, shown as such (DLZ and MAR, time of flight, weapon effects, fuel plan, radar coverage). There is no JDAM or JSOW ballistics.
- **Not available** - the data is not in the files, or the feature was left out on purpose.

## Status by area

| Area                                                                                       | Status                                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Korea campaigns: datacard, ATO, map, kneeboard, DTC                                        | Verified                                                                                         |
| MDC format (drawn from the measures of the BMS blank)                                      | Implemented; filled automatically                                                                |
| Other theaters (Balkans, Israel, Hellas)                                                   | Implemented, few campaigns and Tactical Engagements tried                                        |
| Tactical Engagement files                                                                  | Implemented, few samples                                                                         |
| Objective owners (from the scenario file the campaign was saved from)                      | Verified on one campaign                                                                         |
| Friend, foe and neutral (map, ATO, support data): one rule in `core/coalitions.js`         | Implemented                                                                                      |
| DTC editing and writing, the campaign `.ini` written like BMS does                         | Verified on files written by BMS                                                                 |
| NAV OFFSETS (OA1, OA2, VRP, VIP and pull-up points)                                        | Implemented; the DED check is still open                                                         |
| Kneeboard: F-16 and F-15 files, one folder per theater, backups                            | Verified for F-16 and F-15; other aircraft not yet                                               |
| Performance, weights and take-off data for every aircraft that has a data file             | Calculated the same way for all; F-16 and F-15 are the most checked                              |
| A-G: pop-up, HADB, TOSS, HARM; the checks of the manuals                                   | Estimated (weapon models); the checks follow the manuals                                         |
| SEAD and DEAD (HARM shots, ALIC on the fire control radar)                                 | Implemented; ALIC codes from the HARM page of the DTC                                            |
| Target picture (plan, map, screenshot, filters, cards)                                     | Implemented                                                                                      |
| A-A: DCA, QRA, OCA, BVR timeline and MAR                                                   | Implemented; the timeline and MAR Estimated                                                      |
| DTC AUTOs on the Map (PPT, BULLSEYE, FLOT, SAM FRIENDLY, ATTACK, NOE, FEZ, COAST, tankers) | Implemented                                                                                      |
| Smart and dark Kneeboard cards                                                             | Implemented                                                                                      |
| Weather (campaign maps, wind, conditions) and the fuel plan                                | Implemented, Estimated for the fuel                                                              |
| Radar coverage                                                                             | Estimated: one detection range per unit                                                          |
| Squadron: roster, organization, missions, kneeboard cards, logbook                         | Implemented; tested with three pilots at the same time                                           |
| Squadron Briefing (live room on the map)                                                   | Implemented; tested with the squadron                                                            |
| ROE / SOP (presets, Standard, defaults by kind of mission, kneeboard card)                 | Implemented; options from the RoKAF BEM, the 8th / 51st FW in-flight guides and AFMAN 11-2F-16V3 |
| Pilot seat (laser, IFF, Link 16 and loadout of the chosen aircraft)                        | Implemented; Link 16 and IFF follow the files BMS saves                                          |
| Link 16 and radio presets in the DTC                                                       | Implemented, few campaigns tried                                                                 |
| Map objects of the campaign, political layer, MSA and ERAA                                 | Implemented; the owners are verified on one campaign                                             |
| Landing (Overhead or Direct), ships, STOVL                                                 | Estimated                                                                                        |

## Not yet verified in the game

- Performance and weights of the F-15K, F/A-18, F-4E, AV-8B+ and EA-6B on the datacard; the refusal speed shown as `---` for take-offs from a ship.
- Landing speeds: only the F-16 has a real approach alpha (13°); for the others it is 90% of the gear-down alpha limit of the file. The F/A-18 flies 8.1° with the flaps down, and the flap lift is not modelled (the file has the CL TEF table but not the way the game combines it): it keeps the estimate. The F-15C flies 20-22 AoA units, whose conversion to degrees is not known.
- The take-off from a ship and the STOVL take-off roll against the length of the deck; a vertical landing is not modelled.
- The Performance model of the F-16 Block 50 was compared with the HFFM manual: quickest turn 21.0 against 21.3 °/s, tightest radius 1 578 against 1 565 ft, sustained turn about 17 °/s, acceleration within 5-10% (30% at Mach 0.5).
- Two or three DLZ readings in the cockpit against the missile ranges and MAR of the program.
- The take-off lift gain (calibrated on one WDP point) and the weapon models.
- NAV OFFSETS written to the DTC: that VRP, VIP, OA1 and OA2 appear in the DED.
- The Squadron with more pilots than three: packages and flights edited at the same moment, templates, a card sent over the link, dragging on every PC.
- Other theaters with more campaigns; the aircraft of those theaters.

## Assumptions made when reading BMS files

- Airbase elevation comes from the AIP table, or from the heights of the theater when there is no AIP list; terrain height is a signed 16-bit value in feet, one sample, no interpolation.
- Missile data (Misdata): own speed in ft/s, third axis the target altitude; the mean missile speed is Mach 2.2 for the HARM and 2.5 for BVR missiles; Rmax against aspect is an estimate.
- Fuel: 10 minutes of taxi at idle, joker = bingo + 1,000 lb by default (changeable in Performance), legs under 300 kt are flown at 300 kt; the result is an estimate, not a guarantee.
- Weather: the wind direction is where it comes from; layers at 0, 3, 6, 9, 12, 18, 24, 30, 40 and 50 thousand ft; the cells are drawn axis-aligned.
- HARM: Target Isolate and Glide Inhibit follow the table of the BMS 4.38 manual.
- Radar coverage: the detection ranges of the campaign database are taken as km, 4/3 earth radius, 5,000 ft MSL; the owner of a fixed station comes from the scenario file of the campaign.
- Thrust and fuel flow tables of the flight model files are per engine and are multiplied by the number of engines; the thrust of the AV-8B comes from `thrust_factor` and one engine.
- Ships: the deck is taken as 60 ft above the sea; the kind of ship (catapults, ski-jump, flat deck) is read from its name.
- Runway headings are the magnetic ones of the ATC files; without an ATC file the program shows the runway number times 10.

## Possible later

- **For 1.4, new Smart cards** (the look of the Smart cards of 1.3, made with the method of ARCHITECTURE.md):
  - **Smart Comms**: the UHF / VHF presets of the DTC, the package table with its frequencies, Link 16, IFF, AWACS and tankers on one page.
  - **Smart Tanker**: the track, the altitude, the time and the frequency of the tanker, the fuel before and after, ARIP / ARCP (with the air
    refuelling page below).
  - **Smart Threat**: the SAMs along the route in the order of time, the WEZ exposure minute by minute, the PPTs.
  - **Smart Recovery**: the landing and alternate fields, the approaches, the frequencies, the divert fuel, the weather on arrival.
- **For 1.4, the Smart ROE / SOP card reworked**: the pilot chooses which parameters of the SOP go on the card (for example JOKER / BINGO,
  the comm plan, the recovery, the tactics), instead of the whole text; the A-A and A-G blocks of the ROE stay.
- **For 1.4, bigger annotations on the target picture** (A-G > Target): a size for the symbols, the text and the labels of the threats and
  units (on the page and on the cards), so that they stay readable on the kneeboard in the cockpit and in VR.
- **For 1.4, a turned picture of the Map page**: Copy, the picture for the briefing and the map box of the datacard turned by an angle
  that the pilot chooses (the course of a leg, the attack heading): a wider area taken north up, turned and cropped, with the labels and the
  names turned with the map. The map of the page itself does not turn (Leaflet has no rotation of its own).
- **For 1.4, export to OpenKneeboard** (done in 1.4.0-beta.1): the cards of the Kneeboard written as PNG files at full size into a folder that the pilot chooses
  (`Left/01 ….png`, `Right/01 ….png`, the order of the pages), light or dark; an OpenKneeboard "Folder" tab pointed there reloads by itself at
  every save. Only files are written (OpenKneeboard is GPLv2, none of its code is used); the third-party cards are exported as the DDS save
  already does.

Nothing here is promised.

- Adapting the program to future versions of Falcon BMS (new aircraft, data and theaters).
- A calibration of the weapon and performance models as more readings from the game come in (the flap lift of the F/A-18, the AoA units of the F-15C).
- More standard kneeboard cards, when there is a need.
- Mission pages still to come (made with the method of ARCHITECTURE.md, "How a mission page is made"):
  - **Air refuelling**: the tanker track of the campaign, ARIP / ARCP, the rendezvous time and the fuel on and off the boom.
  - **TASMO**: the ships of the campaign, the ranges of the anti-ship missiles and of the ship SAMs, the launch point.
  - **AI / BAI / SCAR** (maybe): a kill box on the area of the battalion, where a column on the move will be at the time on target (its route in the
    campaign file, an area that grows with time), the search pattern of a SCAR; the attack itself with the A-G pages.
  - CAS is left out on purpose: the JTAC gives the 9-line in flight, and the ground units are aggregated in the planning and not updated in flight.
- Approach points from the ATC files (`Terrdata/atc/<airfield>.dat`) for an instrument or visual landing.

## Security

- The desktop program has a Content Security Policy: its own scripts only, no inline script, no `eval`.
- File writing is limited to the kinds of files the program makes; programs, scripts and system folders are blocked. Reading is not limited, because the BMS folder can be anywhere.
- The program never uses a saved mission's DTC path; the DTC is written only in the DTC folder of this computer.
- In a squadron, the address of your computer on the local network and your public IP address are visible to the other pilots (WebRTC).
- Writing is allowed for the `.pdf` of the User Guide too (Settings > Help > Save as PDF).

## Versions

- **0.8 (alpha)** - the first build kept on `main`.
- **0.9 (beta)** - Map, Weapons, BVR Timeline, Performance, Weather, Docs, Squadron, MDC format, other theaters, Tactical Engagements.
- **1.0** - the first official release (no longer a beta): the security work (CSP, file permissions) and the loading bars.
- **1.1** - the pilot seat, Link 16 and radio presets in the DTC, objects of the campaign on the map, Overhead or Direct landing, ships and STOVL, a redone Settings window with import and export of your data (the import copies the missions of an older copy into this one). See `CHANGELOG.md`.
- **1.2** - a faster map with all the objects and the political layer; the live Briefing room of the squadron; ROE and SOP on the datacard, with presets, a Standard and a full kneeboard card; the AWACS and JSTARS rule; MDC format filled automatically; the datacard notes and ephemerides redone; the User Guide (Settings > Help). See `CHANGELOG.md`.
- **1.3** - the A-A pages (DCA, QRA, OCA) and the A-G pages for SEAD, DEAD and the target picture, each with an A-A or A-G block in the ROE; Smart and dark kneeboard cards; the DTC AUTOs of the Map with a preview, Fit and Copy; missions in folders; Tactical Engagements with every faction and the training missions.
