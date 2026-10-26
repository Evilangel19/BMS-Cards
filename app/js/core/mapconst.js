// Map page: constants, base maps, layers, palettes, the preference store, the Leaflet loader (moved out of mapview.js).
import { getGeo } from '../rules/geo.js';
import { STPT_RANGE } from './mapdtc.js';

export const BMS_MAP_URL = 'https://cdn.falcon-bms.com/maps/04_KTO/maps/KTO_UI_Map_6k.jpeg';
export const COAST = {
  dark: { sea: '#0d1b2a', land: '#27323d', coast: '#56687a', border: '#8b98a8', river: '#3f78ad' },
  light: { sea: '#cde2f0', land: '#f2efe4', coast: '#7d8a96', border: '#6b7580', river: '#3a86c4' },
};
// The coastlines (offline) and the official map are pictures of Korea: other theaters use the map picture of their Docs folder, the satellite, the topographic map or a picture of their own.
export const KOREA_ONLY = ['coast', 'bms']; // the picture of the BMS folder (sky) exists for every theater that has one in its Docs\\ ... Maps folder
export const isKorea = () => {
  const g = getGeo();
  return g.lat === 38.5 && g.lon === 127.5;
};
export const baseOk = k => isKorea() || !KOREA_ONLY.includes(k);
export const BASES = {
  coast: { label: 'Coastlines (offline)' },
  sat: {
    label: 'Satellite (online)',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
    attr: '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2021), CC BY-NC-SA 4.0',
  },
  bms: {
    label: 'BMS map (official, online)',
    attr: 'Map picture © <a href="https://www.falcon-bms.com" target="_blank">Falcon BMS</a> (Benchmark Sims), loaded from the official BMS maps server',
  },
  sky: { label: 'BMS folder map (offline)', attr: 'Map picture from the Falcon BMS folder (Docs, Maps folder)' },
  topo: {
    label: 'Topographic (online)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    sub: 'abc',
    attr: 'Map data © <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, SRTM | Style © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
  },
  img: { label: 'Custom', attr: 'Custom map picture' },
};
// layers: [key, label, default on, section]
// objectives of the campaign (the types of the Targets page) that can be drawn: [type number, label, short mark]
export const OBJ_LAYERS = [
  [1, 'Airbases', 'ABS'],
  [2, 'Airstrips', 'STR'],
  [11, 'Factories', 'FAC'],
  [20, 'Power plants', 'PWR'],
  [25, 'Refineries', 'REF'],
  [7, 'Chemical plants', 'CHM'],
  [17, 'Nuclear', 'NUC'],
  [21, 'Radar stations', 'RDR'],
  [9, 'Command and control', 'C2'],
  [22, 'Radio towers', 'TWR'],
  [10, 'Depots', 'DEP'],
  [19, 'Ports', 'PRT'],
  [3, 'Army bases', 'ARM'],
  [6, 'Bridges', 'BRG'],
  [30, 'Harts', 'HRT'],
  [13, 'Fortifications', 'FRT'],
  [0, 'SAM sites', 'SAM'],
  [31, 'SAM / AAA sites', 'AAA'],
];
export const MAP_LAYERS = [
  ['ab', 'Airbases', true, 'Navigation'],
  ['nav', 'Navaids (VOR / TACAN)', false, 'Navigation'],
  ['bull', 'Bullseye', true, 'Navigation'],
  ['fp', 'Flight plan (line, steerpoints)', true, 'Selected flight'],
  ['pk', 'Package', true, 'Selected flight'],
  ['fd', 'Label and distances', true, 'Selected flight'],
  ['uf', 'Friendly units', true, 'Ground and naval units'],
  ['ue', 'Enemy units (spotted)', true, 'Ground and naval units'],
  ['sf', 'Friendly SAM range', false, 'SAM range'],
  ['se', 'Enemy SAM range (spotted)', true, 'SAM range'],
  ['dp', 'Precision targets (STPT ' + STPT_RANGE.prec + ')', true, 'DTC steerpoints'],
  ['dq', 'Pre-planned (STPT ' + STPT_RANGE.ppt + ')', true, 'DTC steerpoints'],
  ['dl', 'Geo lines (LINE1-4, STPT ' + STPT_RANGE.line + ')', true, 'DTC steerpoints'],
  ['da', 'Pop-up/HADB/TOSS/HARM', true, 'DTC steerpoints'],
  ['ff', 'Friendly flights', true, 'In flight'],
  ['fe', 'Enemy flights (spotted)', true, 'In flight'],
  ['rc', 'Enemy radar coverage (approximate)', false, 'Display'],
  ...OBJ_LAYERS.map(([t, l]) => ['o' + t, l, false, 'Objects']),
];
// switches that are not layers: [key, label, section]
export const MAP_OPTS = [
  ['sj', 'Only the JTAC unit of the selected CAS flight', 'Ground and naval units'],
  ['sx', 'Only enemy SAMs crossing the flight plan', 'SAM range'],
  ['fs', 'Only support flights (tankers, AWACS...)', 'In flight'],
  ['names', 'Names', 'Names'],
];
export const ALLY = '#4f8cff',
  ENEMY = '#ff5d5d';
// airbase colours by faction: the viewed team, its allies, enemies, owner not known
/* airbases: ours or an ally's = white on the dark maps, blue (like the friendly unit symbols) on the light ones, cyan on the BMS pictures; red = enemy, grey = neutral; owner not known = white (black on the BMS pictures) */
export const AB_COL = { own: '#4f8cff', ally: '#4f8cff', enemy: '#ff5d5d', unknown: '#e6edf3', neutral: '#9aa4b2' },
  AB_DARK = { own: '#ffffff', ally: '#ffffff', enemy: '#ff5d5d', unknown: '#e6edf3', neutral: '#9aa4b2' },
  AB_GAME = {
    own: '#38d6f2',
    ally: '#38d6f2',
    enemy: '#ff3b1e',
    neutral: '#9aa4b2',
  }; /* on the BMS pictures the same cyan / red as the unit symbols there */
// colours of the flight plan follow the base map: bright on dark maps, dark on light ones (the halo goes round the line)
export const SAMS = {
  foe: { c: '#ff9f1a', d: '7 5', f: 0.08, w: 1.5 },
  ally: { c: '#4f8cff', d: null, f: 0.08, w: 1.5 },
};
export const PAL = {
  dark: {
    sam: SAMS,
    plan: '#ffd23f',
    mate: '#ffffff',
    halo: 'rgba(0,0,0,.65)',
    casing: 'rgba(0,0,0,.65)',
    bull: '#c9a7ff',
    trk: '#3ddc84',
    foe: '#ff5d5d',
    dtc: { prec: '#4dd0e1', ppt: '#ff5d5d', pptO: '#3ddc84', line: '#d0a3ff' },
  },
  light: {
    sam: { foe: { c: '#d9730d', d: '7 5', f: 0.08, w: 1.5 }, ally: SAMS.ally },
    plan: '#d6007a',
    mate: '#1d2733',
    halo: 'rgba(255,255,255,.9)',
    casing: 'rgba(255,255,255,.95)',
    bull: '#000000',
    trk: '#0b7a3b',
    foe: '#b3001b',
    dtc: { prec: '#00697c', ppt: '#b3001b', pptO: '#0b7a3b', line: '#5b2a9e' },
  },
  // the BMS map pictures (official / folder): colours of the game's own map display - white plan with a black outline, cyan friendly and red
  // hostile contacts, flat blue SAM coverage, dark green bullseye
  game: {
    sam: { foe: { c: '#e0200f', d: '7 5', f: 0.12, w: 1.4 }, ally: { c: '#1b2a9e', d: null, f: 0, w: 1.4 } },
    plan: '#ffffff',
    mate: '#2a2f3a',
    halo: 'rgba(0,0,0,.85)',
    casing: 'rgba(0,0,0,.85)',
    bull: '#000000',
    trk: '#38d6f2',
    foe: '#e0200f',
    dtc: { prec: '#ffffff', ppt: '#e0200f', pptO: '#1fbf5b', line: '#000000' },
  },
};
// size of the screenshot area: the empty space of the datacard (page 2 bottom left of the 2048 px card) or one kneeboard card
// kinds: dc = datacard (564 x 752 px), kb = kneeboard card (a page of 1024 x 2048). out = width of the saved picture.
export const SHOTS = { dc: { w: 564, h: 752, out: 1128 }, kb: { w: 1024, h: 2048, out: 1024 } };

let LEAF = null;
export function loadLeaflet() {
  if (LEAF) return LEAF;
  return (LEAF = new Promise((res, rej) => {
    if (window.L) return res(window.L);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = './vendor/leaflet/leaflet.css';
    document.head.append(l);
    const s = document.createElement('script');
    s.src = './vendor/leaflet/leaflet.js';
    s.onload = () => res(window.L);
    s.onerror = () => {
      LEAF = null;
      rej(new Error('Leaflet could not be loaded'));
    };
    document.head.append(s);
  }));
}
export const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('bmsmap') || '{}');
    } catch (e) {
      return {};
    }
  },
  set(v) {
    try {
      localStorage.setItem('bmsmap', JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  },
};
// the imported picture is kept in the browser database (survives restarts)
export const idb = {
  open: () =>
    new Promise((res, rej) => {
      const r = indexedDB.open('bmscards', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }),
  async put(k, v) {
    const d = await idb.open();
    return new Promise((res, rej) => {
      const t = d.transaction('blobs', 'readwrite');
      t.objectStore('blobs').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
  async get(k) {
    const d = await idb.open();
    return new Promise((res, rej) => {
      const r = d.transaction('blobs').objectStore('blobs').get(k);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async del(k) {
    const d = await idb.open();
    return new Promise((res, rej) => {
      const t = d.transaction('blobs', 'readwrite');
      t.objectStore('blobs').delete(k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
};
export const q2 = n => String(n).padStart(2, '0');
// "Day 4 · 11:00:53Z" from campaign milliseconds
export const clock = ms => {
  const s = Math.floor(ms / 1000);
  return (
    'Day ' +
    (Math.floor(s / 86400) + 1) +
    ' · ' +
    q2(Math.floor((s % 86400) / 3600)) +
    ':' +
    q2(Math.floor((s % 3600) / 60)) +
    ':' +
    q2(s % 60) +
    'Z'
  );
};
export const NM = 1852;
export const SUPPORT = new Set(['Support', 'C3I']); // ATO categories shown by the "support only" switch
export const SAMCAT = new Set(['Air Defense', 'SHORAD']);

// deps: {getC(), getSel() -> flight or null, getView() -> team number, esc(text), D, flightInfo(f) -> {cs, text}}
// names of points in the DTC: BMS accepts long steerpoint names, so only a generous cap; a weapon target from a sub-objective reads "sub-objective - objective"
export const NAME_MAX = 60,
  WT_SEP = ' - ',
  tgtName = t =>
    String(t || '')
      .replace(/[\s,]+/g, ' ')
      .trim()
      .slice(0, NAME_MAX);
