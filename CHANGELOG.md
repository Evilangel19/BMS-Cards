# Changelog

What changed for the people who use BMS Cards, version by version. The detailed log of every beta (with the reasons and the tests) is in the git log of the `dev` branch.

## 1.4.0 (not released yet)

- Fixed: Performance > AAR planned no flight: BMS puts the Refuel steerpoint after the landing, with no time. Now you choose the route steerpoint you go to the tanker from (**Join after**; by default the one nearest to the track while the tanker is on station, else the first one after the target), and the join is the first time you reach the ARIP from it at 420 kt. A Refuel steerpoint in the route with its time works as before. OA1 / OA2 stay on the Refuel steerpoint.
- Added: Performance > AAR, the fuel to reach the tanker: a red check when the fuel at the join is less than 1,000 lb or runs out before it (with the TANK Bingo at the push steerpoint and what to do), and a note when the fuel at the join does not take you home without the tanker.
- Changed: A-G > TASMO: the profile in the look of the vertical envelope of Pop-up: one colour a phase (cruise, descent, missile fly-out, seeker on, terminal) with rounded turns, the descent, the launch, the radar acquisition, the point where the seeker turns on and the POP or SKIM point marked, OA1 / OA2 as triangles and the target as a diamond, the SAM rings as boxes (the low ring under 5,000 ft). The sliders move the plan in real time. The Missiles button goes to the missiles that the aircraft carries. **Write HPN STPT 90** also writes the ship as STPT 99, the target of the attack pages. **Attack in A-G > Pop-up / HADB** chooses the steerpoint of the ship as the target; when no steerpoint is within 10 NM of the ship, it asks to write the ship as STPT 99 first (a point that is not a route steerpoint 1-24 sets Manual entry).
- Added: the ships with a SAM have their ring with the SAM rings of the Map page (the SAM filter).
- Changed: A-G > TASMO: compact rows of buttons as the HARM page, narrower side columns, the Steps in the right column. The same missile on two stations is one choice (the count is the Missiles button). The profile: a wider view and a square-root scale of the altitude (the low altitudes readable), the aircraft before the launch and the flight of the missile after it, which follows the Fly-out (LOW: down at once; HIGH: at the launch altitude to 10 NM, or the enable range in BOL) and the Terminal (POP or SKIM), with the point where the seeker turns on. The map follows the mode: RBL its search area (LARGE grows with the range, MED and SMALL fixed, estimates), BOL the seeker on at the enable range and the destruct point, LOS the line only.
- Changed: A-G > TASMO is for a TASMO (Countersea) flight only; its ships are those your side spotted, with the ship of the task (the ATO gives it, spotted or not): a ship nobody saw does not show (no peek at a carrier not yet in action). The ship of the task first, else the nearest to the task steerpoint that is not a patrol boat. **Map filters** at the right of Fit view; the menus in the dark look; narrower side panels and a taller map.
- Fixed: A-G > HARM > SEAD: the text of Package time and the switch Launch outside the rings stay inside their card.
- Added: **A-G > TASMO**, the attack of a ship by the flight chosen, laid out as DEAD. The ships of the campaign near its task, with the fog of war: an area of ±3 NM when your side spotted the ship, ±40 NM when not. The weapon of the load: an anti-ship missile (the weapons that BMS makes for ships, so every aircraft that carries one: Harpoon, Penguin, Kormoran, Exocet, Kh-31A, Kh-35, ASM-2, YJ-12...), its range from its Misdata at the launch altitude; with a Maverick or bombs, **Attack in A-G > Pop-up** plans the attack there, the ship as the target. The launch point outside the SAM rings of the ship (the low ring under 5,000 ft) and inside the range, under the radar horizon of the ship; the descent before the ship sees you; the radar acquisition when the ship is not spotted (the range of the radar of your aircraft, the horizon), and BOL when it comes after the launch. The Harpoon options of the WPN page (RBL, BOL with the enable and destruct ranges, LOS, search area, priority, fly-out, terminal) and the steps of the Dash-34. The map or the profile; the shot; the checks. **Write OA1 / OA2** (the launch, the acquisition or the descent, on the steerpoint of the route nearest to the ship) and **Write HPN STPT 90** (the ship as the Harpoon target). **Add card**: Smart TASMO and the classic card with the map; both in Add all cards. Map > Display > A-G: **TASMO**.
- Added: the enemy patrol boats (no SAM of their class, a ring against low targets) have a dashed MANPADS ring on the Map page (under 15,000 ft).
- Added: Performance > AAR, **RV HEAD-ON**: on the first leg of the track you fly its reciprocal, offset by two turn radii (about 8 NM), and turn 180° (LEFT or RIGHT, at 30° of bank, 400 kt) behind the tanker to roll out 2.5 NM in trail. The page, the map and the cards show the turn point, its time, its range and the clock position of the tanker.
- Changed: Performance > AAR as the real procedures (ATP-56): the rendezvous have their names, **RV GOLF** (en route), **RV ECHO** (anchor: the ARCP is the anchor, the ARCT a pass of the tanker over it), **RV HEAD-ON**; the **ARIP** is where the rendezvous starts, set as its distance before the ARCP (or before the turn), and OA1 is always the ARCP, OA2 the ARIP; a note when the ARCT is more than 1 minute from your Refuel steerpoint; the procedure starts with ARCT − 15 min (levels, A-A TACAN, Mode 3, armament, timing). The SOP Rendezvous options have the same names (RV GOLF, RV ECHO, RV HEAD-ON in place of the point parallel, which BMS does not fly).
- Changed: Performance > AAR: the side of the turns of the tanker is not known (it depends on where the tanker comes from): the map and the cards show both racetracks and the line of the track, the times use the line. The four values are on one line, the buttons of the left card are in rows of the same width, the Onload slider is red (with the max) above what the tanks take, the Times table is under the Smart card.
- Added: **Performance > AAR**, the refuelling of the flight at its tanker (TANKER 1 / 2 of the datacard), on its Refuel steerpoint. The tanker flies its racetrack (BMS 4.38: 300 KCAS, turns at 30° of bank) and does not turn to meet you. **EN ROUTE**: the join where the tanker is at the time of the steerpoint; **ANCHOR**: from the ARIP behind the anchor as the tanker passes it (HEAD-ON comes in the next version). The gap at the ARIP, the fill (FULL, to the JOKER, an AMOUNT) from the fuel plan, the times and the fuel at the ARIP and at the join, the checks (a tanker without boom or drogue for you, too late, the tanker gone), the procedure for the boom or the probe with the calls by their names, the map. **Write OA1 / OA2 in the DTC** puts the anchor (or the join) and the ARIP on the Refuel steerpoint. **Add card** (top right): the Smart AAR card (with the Tanker topics of your SOP) and the classic card with the map; both in Add all cards.
- Added: Map > Display, the sub-sections A-A (DCA, OCA), A-G (Pop-up/HADB/TOSS, SEAD/DEAD) and AAR (**Tanker and rendezvous**).
- Changed: the datacard picks the tankers as BMS 4.36+ refuels: the KC-135 and the KC-10 have a drogue too, so a probe aircraft takes them after the drogue-only tankers (KC-130, C-160, IL-78), which a boom aircraft never takes first.
- Changed: Squadron > ROE / SOP, the bar of a sub-page is on one line (Chosen only is one button, + Custom is shorter) and Wide view leaves it where it is: no button moves. The SOP sections and topics roll up and unroll as the ATO does (also Fold all / Unfold all), the side columns fade away and back with Wide view, and the other sub-page fades in when you change sub-page.
- Fixed: a click on an option of an open SOP topic made its options flicker (they faded in again at each choice); the FENCE, comms and fuel phase was blue in place of orange.
- Fixed: Squadron > ROE / SOP, the buttons of the bars of the sub-pages changed size (and wrapped their text) when the page was narrow or with AUTO / MANUAL: now they keep their size; All topics / Chosen only, Wide view and Fold all are small, + Custom section and Clear SOP stay together at the right.
- Changed: Squadron > ROE / SOP is simpler: each sub-page has its **AUTO / MANUAL** switch and its **Clear**, in its bar. ROE AUTO: the ROE of the mission and your choices; ROE MANUAL: only yours (in place of Manual ROE). SOP AUTO: the program chooses the SOP of the Smart card and adapts them to the mission; SOP MANUAL: only the topics with SMART, as you chose them (Adapt to mission is gone: it is what AUTO does). **Clear ROE** takes your ROE away and puts the ROE in MANUAL; **Clear SOP** takes every SOP topic away. The Clear under the preview and in the Smart card column are gone. A choice saved with Adapt to mission off opens with ROE and SOP in MANUAL.
- Changed: the window of a custom section says what a section is, has labels over the fields and an example from the SOP of the program (Anti-collision / flash, LTS, FLASH MOVING = Flash as soon as the aircraft moves), and shows what the card writes for each topic (RNG: LTS FLASH MOVING).
- Added: Ready to fly > Save kneeboard (and Write all) also writes the pages for OpenKneeboard when its button is shown, after the BMS folder.
- Changed: Squadron > ROE / SOP, SOP sub-page: each topic is a strip with its value (no drop-down list); a click opens its options under it as strips, with Own text, the full text of the option, CARD (SMART in MANUAL) and Clear. Each phase has its colour (blue the ground and the field, orange the mission, purple the conditions, red the emergencies, teal the own sections).
- Changed: the ROE and SOP boxes of the datacard hold 7 lines at most, the text 12 px at the smallest (8 lines were hard to read in the cockpit).
- Changed: the Clear button of the Smart card column is **Clear ROE** on the ROE sub-page and **Clear SOP** on the SOP sub-page.
- Fixed: with an A-G block of the mission, MIN RLS 15K and PID BEF RLS were never written, also when the block does not write them (SEAD): now a rule is left out only when the block writes it (the strip has the yellow dot of the mission), and the box of the datacard counts it right.
- Changed: Squadron > ROE / SOP, two Clear buttons. **Clear** under the preview clears the datacard: no ROE, Manual ROE on (the ROE of the mission are not written), no SOP topic in its SOP box; the SOP topics stay chosen for the Smart card. **Clear** in the Smart card column clears the Smart card: on the ROE sub-page its ROE (the same as the datacard, Manual ROE on), on the SOP sub-page its SOP (AUTO: the topics that are not in the SOP box of the datacard; MANUAL: the Smart ticks).
- Changed: the "Default for" kinds of mission of a preset are strips as the rules; the strips are on two columns, all of the same width, a long text on two lines; Discard is red.
- Fixed: the Smart card on the ROE / SOP page showed JOKER and BINGO only after a click: it is drawn again when the values of the datacard change.
- Changed: Squadron > ROE / SOP, ROE sub-page: the rules are clickable strips, as the threats of the HARM page (Data Cartridge), in place of the chips: green for a key rule (datacard and the key of the Smart card), blue for another rule (datacard). The value of the mission has a yellow dot, struck through when your choice replaces it. The A-A and A-G blocks of the mission are now in the right column, under the Smart card.
- Changed: the ROE and SOP boxes of the datacard hold what fits, not 5 lines: the page measures the text as the card draws it, and the counts say the lines used at the smallest size ("ROE 6/8 lines"). Each rule starts with its label in bold (WPN, ID, COMMIT, BUGOUT; the tags of the SOP phases), the text that goes on starts a little in. The choices of a list are in the order of the list (BUGOUT: BINGO/WINCH/MUD SPIKE…), not in the order of the clicks. The preview of the page draws the boxes as the datacard does.
- Changed: Squadron > ROE / SOP, the chips of the ROE in a grid of the same width (the long ones on two cells); the ticks card and Smart of a SOP topic are now the buttons CARD and SMART; SOP, a **Wide view** button hides the columns of the presets and of the Smart card (the phases on up to four columns).
- Fixed: Smart ROE / SOP card, a long value of the key box (ID, BUGOUT) ran over the next cell: now it goes on two smaller lines, and when even so it does not fit it is cut with "…" and the whole rule is written under the key box (KEY ROE).
- Added: Squadron > ROE / SOP, the **RULES** sub-page (shown with Settings > Mission & squadron > Edit the Smart card rules): the table of the rules of the Smart ROE / SOP card, one row for each SOP topic (the topics of the custom sections too). A click on a cell changes it: tier, fixed, and for each condition IN, 1ST (Emergencies), SET (a value of the topic or your own text) or OUT. Your rules stay on this PC; the commander changes the rules of the squadron, which go to all its pilots. Only the changed rows are kept, so a new default of the program still comes. Reset to default, Changed only, Export / Import as text. The Smart card column says when the rules in use are not the defaults.
- Changed: the **Squadron > ROE / SOP page**. Two sub-pages, **ROE** and **SOP**; at the right, the column of the **Smart ROE / SOP card** with its picture (bigger than the datacard preview), what it holds and "How it works". **AUTO / MANUAL**: the program chooses the SOP topics of the Smart card (a green dot marks them), or only the topics with the Smart tick go on it. **Adapt to mission**: the ROE of the A-A and A-G pages, and the changes for the weather and the night (a yellow line under the topic). On the ROE sub-page your choices are added to the ROE of the mission, and your choice replaces a mission value of the same rule (weapons status, commit); **Manual ROE** writes only your ROE, on the datacard and on the Smart card. On the SOP sub-page one **Fold all / Unfold all** button, the phases on up to three columns.
- Changed: Smart ROE / SOP card, a bar after the tag of each phase ("ENR| TURNS CALLED · …"); what the pilot wrote (a free text on a topic, the topics of an own section) is always on it, first.
- Changed: Smart ROE / SOP card, the tag of each SOP phase (MSN, GND, T/O, ENR…) in bold. On the ROE / SOP page the change of the day says what the Smart card writes and why, for example "Smart card: RADAR TRAIL (marginal weather at landing)".
- Changed: the **Smart ROE / SOP card**. Key box: JOKER, BINGO, LASER, M4, then WPN, ID, COMMIT, BUGOUT. Under it the other ROE (other rules, restrictions, own lines, the A-A and A-G blocks), then the SOP in short form, one line for each phase in the order of the flight. Which SOP topics go on it, most important first: the topics that the conditions of the day change, what the pilot wrote, the topics of the conditions of the mission, the fixed topics; in each group the topics of flight safety first, then the procedures, then the routine ones. The Emergencies go in a box at the bottom (CSAR first over the enemy); the space left takes the other topics chosen. The page shows what the Smart card holds.
- Added: the conditions of the mission on the Smart ROE / SOP card, one rule table for every SOP topic (checked with AFMAN 11-2F-16V3): its tier (safety, procedures, routine), whether it is always on the card, and what each condition does: IMC or marginal weather (MVFR: clouds below 3,000 ft AGL, a visibility below 8 km or Inclement) at the departure field, at the landing field or at the target, night, training, tanker, A-G, over the enemy. For example: IMC at landing gives Recovery STAR + ILS/TACAN (a new Recovery option), Break SINGLE SHIP, Formation landing PROHIBITED; marginal weather at landing gives Radar trail recovery and straight-in; IMC at take-off gives SID, marginal weather a radar trail departure; night gives taxi 300 ft on the centerline and STEADY TAXI lights; over the enemy, silent turns (called turns in IMC) and the ops check. The page and the datacard keep your choice.
- Added: SOP, Night take-off lights (anti-collision on, position lights flash) and the Anti-collision option STEADY TAXI; FLASH HOLD is now FLASH EOR/HOLD, Formation landing NO is now PROHIBITED.
- Changed: Map, a screenshot taken with a turned frame (for the datacard, the kneeboard or the target picture): the names, the labels and the symbols of the units (friendly, enemy, air defense) come out level in the picture, turned with the frame, each at its point. A loading bar shows while the screenshot is taken.
- Changed: Settings > Kneeboard, the values of the Cockpit tone (Brightness, Contrast, Also on dark pages, Preview) show only when Cockpit tone is on.
- Changed: A-G > Target, a callout is one gesture: push on the point, drag to the place of the label, let go, then type the text (a click puts the label above and to the right). The line goes to the side of the label nearest to the point; a **Line** button (shown with a callout selected) sets the side: Auto, left, top, right, bottom. With Select, drag the label to move only the label.
- Fixed: A-G > Target, the colour of a symbol (a swatch or the colour picker) now colours its label too (frame and text), not only its line.
- Added: A-G > Target, a **Size** button in the tool bar: each click goes S, M, L, XL. It sets the size of the next symbol, or of the symbol that you select. Its lines, heads and text change, not its place.
- Added: A-G > Target, Page card, **Label size** (S, M, L, XL) for the labels that the program writes (threats, units, names).
- Added: the colour picker of the program (as on the Map page) in the tool bars of A-G > Target and of the Briefing room. The colour that you choose stays as a swatch; in the Briefing room it goes to the other pilots as the other colours do.
- Changed: Briefing room, one **Size** button (thin, medium, thick) in place of the three width buttons.
- Changed: Settings > Kneeboard, Save to OpenKneeboard is a three-way switch (Automatic, Always, Never) in the colours of the program; the texts of Save to OpenKneeboard use Simplified Technical English (ASD-STE100), as all the new texts of the program.
- Fixed (1.4.0-beta.1): the green buttons of the Squadron page and of the Briefing room (Join the room, Open the room) did not show.
- Added: Kneeboard > **Save to OpenKneeboard**: the pages of the kneeboard as PNG pictures at their true shape (the datacard pages at 1600 x 2400), in the Left and Right folders of Saved Games\BMS Cards\OpenKneeboard (or the folder of Settings > Folders); the pages written before are taken away. A Folder tab of OpenKneeboard on that folder shows them and follows every save. The button shows when OpenKneeboard is found on the computer; Settings > Kneeboard can show it always or never.

## 1.3.0 (2026-11-22)

### Highlights

- **A-A page**: DCA (the area of a CAP flight, the FEZ on the threat axis and its DTC lines), QRA (the scramble line on alert, the vector and the intercept once launched) and OCA (the SWEEP or ESCORT of a package: position, commit, stop, target area), each writing an A-A block in the ROE of the flight.
- **A-G page** (the Weapons page): HARM with a SEAD planner (the shots that protect the package) and a DEAD planner (HARM standoff, Hunter-Killer, bombs), the ALIC codes on the fire control radar; the checks of the manuals and an A-G block in the ROE.
- **Target picture** (A-G > Target): the plan of the objective, a picture of the map or a screenshot, with the DMPI of the DTC, threats, sensor filters and drawn symbols; pictures without a target; Put on datacard.
- **Smart cards** and dark cards for the cockpit: Attack, SEAD, DEAD, DCA, OCA, QRA, Weather and ROE / SOP, and the Smart mission card; Cockpit tone for the kneeboard.
- **DTC AUTOs on the Map**: PPT, BULLSEYE, FLOT, SAM FRIENDLY, ATTACK, NOE, FEZ, COAST (F-15 SIT lines) and tanker tracks, with a preview before writing and Fit after; labels and colours of the package flights; Copy of the map.
- **Missions in folders** on Squadron > Missions; Tactical Engagements with every faction open; the BMS training missions.
- Warnings that stop an action are red, and buttons with nothing to act on are dimmed.

### All changes

- Fixed: the A-A line of the DCA, OCA and QRA pages and the weapon of the A-G pages counted one missile or bomb per station ("1× AIM-120B · 1× AIM-120B…"); each weapon now has its total, as on the datacard.
- Changed: the warnings that stop an action or say that something is missing are red everywhere (A-G > Target, ATO, ROE, Kneeboard, seat, Map, Squadron, Briefing room, Organization).
- Changed: buttons with nothing to act on are dimmed: Add card of A-G (no attack, no SEAD or DEAD flight, no target), A-A (no flight for the page) and ROE / SOP (nothing chosen); Put on datacard without a picture; HARM tables and Auto PPT without a DTC; the AUTOs of the Map without a DTC (COAST outside Korea).
- Fixed: Squadron > Missions said "loaded" in red; in the Briefing room a failed Copy or screenshot was not red.
- Fixed: a Picture of the Target page no longer shows the threats, the units and the DMPI boxes of its place, nor the Target information page and the From the datacard card; Put on datacard brings its frame bar (under the picture) into view.
- Added: A-G > Target, ＋ Picture: a screenshot with no target (an aircraft to know in A-A, a view of the area), named as you like, with the Screenshot and Map views and the drawing tools; Add card makes one Picture card; Put on datacard puts it on the datacard, which goes with the mission (the entry itself is kept for the session, as the other Target pictures).
- Added: three AUTOs of the DTC editing: SAM FRIENDLY (the forward edge of the friendly SAM rings near the route, one LINE), ATTACK (from the A-G attack page: IP, PUP, apex, release, target, egress, and the run-in V, two LINEs) and NOE (the walls of the valley of the low part of the flight plan, where the terrain rises to the altitude of the leg, two LINEs; needs the terrain of the BMS folder).
- Changed: SEAD and DEAD aim the HARM at the fire control radar of a SAM (ALIC 202 Fan Song for the SA-2, 203, 204, 205, 206, 210, 211 and 217 for the TELARs of the SA-11 and SA-17, 230 for the Hawk), as the HARM page of the DTC lists them with a T.
- Fixed: the A-A and A-G blocks of the ROE are written as soon as a flight is chosen (no need to open its page) and the ROE page shows them when it is opened; only A-G missions get an A-G block. On the A-G pages the Edit points button sits on the left, Fit view and the map filters on the right (as on the A-A pages).
- Fixed: Copy the map in the Briefing room did nothing; it copies the map with the drawings and the cursors (for every pilot in the room, with or without the pen), with a progress bar. Fit keeps the AUTO menu open. Map > Display: HARM is now SEAD/DEAD.
- Added: Copy on the Map and in the Briefing room: the map as it is shown, with the drawings, in the clipboard. The VHF preset of your flight (VHF 15 for the first flight of the package, 16 for the second...) in the empty cell left of Callsign on the datacard. A User Guide button next to Settings. Fit next to Automatic lines: after an AUTO the map shows what it wrote. Your own flight can have a colour too (click its label), and the labels of the package flights can be dragged along their route.
- Changed: AUTO > FEZ is dimmed for a flight that no A-A page plans; the combined Smart mission card comes first when cards are chosen.
- Added: on the Map, the label of the flight and of the tanker tracks can be dragged along its route (double click: back to its place); the other flights of the package can have a colour of their own (click one of them with the editing on, Colour); the pointer on an AUTO button previews what it will write, and what it would replace blinks red. The labels moved and the colours are kept with the mission.
- Changed: the escort lines of A-A > OCA bend back to the push point.
- Fixed: in a TE every faction is open: choose one in the ATO (or a flight of it) and it becomes yours, its flights load on the datacard and the map shows the flights of every side (a TE has nothing spotted). Campaigns are unchanged. Settings > Other factions says when a squadron keeps the other factions hidden.
- Changed: the A-A and A-G blocks of the ROE are on the datacard (WPN, COMMIT and the main rule of the A-A page; the release minimum, the abort speed, PID and the calls of the A-G pages), never cut; the blocks no longer repeat weapons and tactics (HARM mode, DEAD tactic, OCA position, stern conversion), which are on the pages and the cards.
- Changed: the OCA sweep area is one outline around the track instead of a box for each leg, and the DTC lines follow it: a sweep writes the outline of its area (two lines, one each side), an escort a box open on the side of arrival around the target, touching the STOP and COMMIT circles; no track line (the steerpoints show it); AUTO > FEZ of the DTC editing writes the lines of the A-A page of the flight (DCA, QRA or OCA).
- Fixed: A-A > DCA (and OCA) could stay empty when the Map had drawn it before the page was shown; DCA says when the flight is an OCA mission.
- Added: A-A > DCA plans the QRA flights. On alert: the scramble line on the threat axis (how far out a raid must be seen to meet it at the range chosen), checked against the friendly radars and the enemy airbases. Launched by the campaign (INTERCEPTION): the vector, ANGELS, the intercept point and time against the target your side has spotted (else the Intercept steerpoint of BMS), the commit, and the stern conversion when the ROE ask for VID. It writes an A-A block in the ROE, DTC lines, a QRA card with the map, a Smart QRA card and the Smart mission card.
- Added: A-G checks from the manuals: a pop-up under 350 KCAS (300 above 10 000 ft AGL), a ripple faster than the racks release and a cloud base under 2 000 ft AGL over the target are shown in red; the toss angle ends at 45°. The A-G pages (Pop-up, HADB, TOSS, SEAD, DEAD) write an A-G block in the ROE of the flight (minimum release, abort speed, PID, the night cue, the ceiling; the HARM mode and the calls), with Edit in A-G.
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
