// The tables of the game (entity types, objects, names, radio presets, weapons, threats ...) are NOT part of this program: they belong to Falcon BMS and are read from the
// user's own installation when the program starts (see ../bmsdata/bmsdata.js and loadGameData in index.html). Until then every table is empty.
// For the tests only, a folder `local/` (ignored by git, so it exists only on the computer of the developer) can hold copies of the tables; it is loaded when present.
const D = {ct: [], ac: {}, wn: {}, S: {}, ab: {}, ob: [], wt: {}, tf: {}, ew: {}, rm: {}, ap: {}, api: {}, el: {}, tn: {}, pn: [], gu: {}, un: {}, ppt: [], acfb: {}, mfb: {}, bfb: {}};
try { Object.assign(D, (await import('./local/index.js')).default); } catch (e) { /* no local copies: the tables come from the BMS installation */ }
export default D;
