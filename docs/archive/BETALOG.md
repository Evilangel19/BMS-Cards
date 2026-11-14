# Beta log (after 1.2.0)

One line for every beta of the `dev` branch, oldest first: what changed, why, how it was checked. This folder lives on `dev` only; at a release the summary goes to `CHANGELOG.md` and the status to `docs/ROADMAP.md`. The log up to 1.2.0 is in `ROADMAP-to-1.2.md`.

- 1.2.1-beta.1 (2026-11-14): **Fixed: the Map (or another wide page) became narrow** (1300 px, centred) after a visit to the Squadron Briefing. Hiding the Briefing made the page narrow, and the Squadron hides it again each time it draws its tabs (a pilot joins or leaves, a mission arrives) even while another page is on screen. Now the Briefing makes the page narrow only when it was on screen, and only while the Squadron is the page shown. Test: `tools/briefing-test.py` (the Briefing hidden again with the Map on screen: the Map stays wide; it failed before the fix).
