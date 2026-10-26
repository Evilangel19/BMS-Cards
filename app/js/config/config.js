// Program settings. DEFAULTS is the single source of truth; config/config.default.json is a copy (checked by tests).
export const DEFAULTS = {
  version: 1,
  paths: {
    bmsInstall: '', // Falcon BMS install folder (used to read game data, next step)
    campaigns: '', // folder opened by "Open campaign" and the other import buttons
    dtc: '', // folder opened by "Open DTC"
    kneeboardDir: '', // where the kneeboard DDS files go (empty = BMS Data\TerrData\Objects\KoreaObj)
    missions: '', // folder where the mission folders are made (empty = "missions" next to the program)
  },
  ui: {
    animations: true, // short transitions and animations (also off when the system asks for reduced motion)
    showMfd34: false, // show MFD 3 and 4 in the Data Cartridge page (BMS does not use them yet)
    autoLoad: false, // true = at start the last DTC and the last campaign / tactical engagement are opened again
    lastDtc: '', // full path of the last DTC opened (kept by the program)
    lastCamp: '', // file name of the last campaign or tactical engagement opened (kept by the program)
  },
  mission: {
    radiusNm: 60, // a mission file keeps the units and flights within this distance of the route (the support flights of the datacard are always kept)
  },
  squadron: {
    trackers: '', // WebTorrent trackers (ws:// or wss://, one per line or separated by spaces) used to find the pilots of the squadron; empty = the built-in public ones
  },
  map: {
    satOn: false, // true = the satellite layer of the maps uses the provider below instead of the built-in one (Sentinel-2 by EOX)
    satUrl: '', // tile address with {z}, {x}, {y} (and {key} if the provider needs a key); the provider must allow CORS
    satKey: '', // key (token) put in place of {key} in the address
    satAttr: '', // credit shown on the map (the provider's terms usually require it)
    satMaxZoom: 18, // deepest zoom the provider has real tiles for (deeper zooms enlarge them)
  },
  theater: '', // name of the selected theater (empty = first one found)
  language: 'en',
};

// Merge a user config over the defaults. Unknown keys are ignored, wrong types fall back to the default.
export function mergeConfig(user) {
  const warnings = [];
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  // settings saved when the missions were called projects
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    user = { ...user };
    if (user.paths && user.paths.projects !== undefined && user.paths.missions === undefined)
      user.paths = { ...user.paths, missions: user.paths.projects };
    if (user.project && !user.mission) user.mission = user.project;
  }
  if (user === null || typeof user !== 'object' || Array.isArray(user)) {
    if (user !== undefined) warnings.push('config.json must contain a JSON object; defaults used');
    return { config: out, warnings };
  }
  const walk = (def, src, dst, pathName) => {
    for (const k of Object.keys(def)) {
      if (!(k in src)) continue;
      const d = def[k],
        v = src[k],
        name = pathName + k;
      if (d !== null && typeof d === 'object') {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) walk(d, v, dst[k], name + '.');
        else warnings.push(`"${name}" must be an object; default used`);
      } else if (typeof v === typeof d) dst[k] = v;
      else warnings.push(`"${name}" must be a ${typeof d}; default used`);
    }
  };
  walk(DEFAULTS, user, out, '');
  return { config: out, warnings };
}
