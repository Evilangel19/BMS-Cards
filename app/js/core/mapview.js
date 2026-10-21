// Map page: Leaflet map of the theater with switchable base maps and layers. Leaflet is loaded the first time the page opens.
import {radarUnits,neededCells,coverage,CELL_KM} from './radarcov.js';
import basemap from '../data/basemap.js';
import D0 from '../data/index.js';
const PPT = new Proxy([], {get: (_, k) => D0.ppt[k], has: (_, k) => k in D0.ppt});   // the threat list is read from the BMS installation (Ppt.ini) when the program starts
import {objState, featState} from '../parsers/cam.js';
import {GROUPS, FT_KM, FT_NM, LINE_LEN, lineOf, dtcLines, freeSlot, removePoint, parseLL} from './mapdtc.js';
import {toLL, fromLL, fmtLL, mapAirbases, airbaseOwner, flightRoute, mapUnits, flightState, isActivity, legs, bullseye, allyOf, frontLine, spottedBy, crossesRoute, theaterBounds} from './mapdata.js';
import {getGeo} from '../rules/geo.js';
import {warpImageAsync, pictureTile, blockSource, BMS_EXTENT, warpFrame} from './mapwarp.js';
import {unitSymbol, placeIcon} from './mapsymbols.js';
import {teamName} from './ato.js';
import {jtacPick} from '../rules/support.js';
import {actName, hms, els0, nearAb, opWin} from './flight.js';

export const BMS_MAP_URL = 'https://cdn.falcon-bms.com/maps/04_KTO/maps/KTO_UI_Map_6k.jpeg';
const COAST = {dark: {sea: '#0d1b2a', land: '#27323d', coast: '#56687a', border: '#8b98a8', river: '#3f78ad'}, light: {sea: '#cde2f0', land: '#f2efe4', coast: '#7d8a96', border: '#6b7580', river: '#3a86c4'}};
// The coastlines (offline), the official map and the folder map are pictures of Korea: other theaters use the satellite, the topographic map or a picture of their own.
const KOREA_ONLY = ['coast', 'bms', 'sky'];
const isKorea = () => { const g = getGeo(); return g.lat === 38.5 && g.lon === 127.5; };
const baseOk = k => isKorea() || !KOREA_ONLY.includes(k);
const BASES = {
  coast: {label: 'Coastlines (offline)'},
  sat: {label: 'Satellite (online)', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
    attr: '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2021), CC BY-NC-SA 4.0'},
  bms: {label: 'BMS map (official, online)', attr: 'Map picture © <a href="https://www.falcon-bms.com" target="_blank">Falcon BMS</a> (Benchmark Sims), loaded from the official BMS maps server'},
  sky: {label: 'BMS folder map (Skyvector, offline)', attr: 'Map picture from the Falcon BMS folder (Docs\\05 Maps)'},
  topo: {label: 'Topographic (online)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub: 'abc',
    attr: 'Map data © <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, SRTM | Style © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)'},
  img: {label: 'Custom', attr: 'Custom map picture'}};
// layers: [key, label, default on, section]
// objectives of the campaign (the types of the Targets page) that can be drawn: [type number, label, short mark]
export const OBJ_LAYERS = [[1, 'Airbases', 'ABS'], [2, 'Airstrips', 'STR'], [11, 'Factories', 'FAC'], [20, 'Power plants', 'PWR'], [25, 'Refineries', 'REF'], [7, 'Chemical plants', 'CHM'], [17, 'Nuclear', 'NUC'], [21, 'Radar stations', 'RDR'], [9, 'Command and control', 'C2'], [22, 'Radio towers', 'TWR'], [10, 'Depots', 'DEP'], [19, 'Ports', 'PRT'], [3, 'Army bases', 'ARM'], [6, 'Bridges', 'BRG'], [30, 'Harts', 'HRT'], [13, 'Fortifications', 'FRT'], [0, 'SAM sites', 'SAM'], [31, 'SAM / AAA sites', 'AAA']];
export const MAP_LAYERS = [
  ['ab', 'Airbases', true, 'Navigation'], ['nav', 'Navaids (VOR / TACAN)', false, 'Navigation'], ['bull', 'Bullseye', true, 'Navigation'],
  ['fp', 'Flight plan (line, steerpoints)', true, 'Selected flight'], ['pk', 'Package', true, 'Selected flight'], ['fd', 'Label and distances', true, 'Selected flight'],
  ['uf', 'Friendly units', true, 'Ground and naval units'], ['ue', 'Enemy units (spotted)', true, 'Ground and naval units'],
  ['sf', 'Friendly SAM range', false, 'SAM range'], ['se', 'Enemy SAM range (spotted)', true, 'SAM range'],
  ['dp', 'Precision targets (STPT 81-99)', true, 'DTC steerpoints'], ['dq', 'Pre-planned (STPT 56-80)', true, 'DTC steerpoints'], ['dl', 'Geo lines (LINE1-4, STPT 31-54)', true, 'DTC steerpoints'], ['da', 'Pop-up/HADB/TOSS/HARM', true, 'DTC steerpoints'],
  ['ff', 'Friendly flights', true, 'In flight'], ['fe', 'Enemy flights (spotted)', true, 'In flight'],
  ['rc', 'Radar coverage at 5,000 ft (approximate)', false, 'Display'],
  ...OBJ_LAYERS.map(([t, l]) => ['o' + t, l, false, 'Objects'])];
// switches that are not layers: [key, label, section]
export const MAP_OPTS = [['sj', 'Only the JTAC unit of the selected CAS flight', 'Ground and naval units'], ['sx', 'Only enemy SAMs crossing the flight plan', 'SAM range'], ['fs', 'Only support flights (tankers, AWACS...)', 'In flight'], ['names', 'Names', 'Display']];
const ALLY = '#4f8cff', ENEMY = '#ff5d5d';
// airbase colours by faction: the viewed team, its allies, enemies, owner not known
const AB_COL = {own: '#4f8cff', ally: '#3ddc84', enemy: '#ff5d5d', unknown: '#e6edf3'};
// colours of the flight plan follow the base map: bright on dark maps, dark on light ones (the halo goes round the line)
const SAMS = {foe: {c: '#ff9f1a', d: '7 5', f: .08, w: 1.5}, ally: {c: '#4f8cff', d: null, f: .08, w: 1.5}};
const PAL = {dark: {sam: SAMS, plan: '#ffd23f', mate: '#ffffff', halo: 'rgba(0,0,0,.65)', casing: 'rgba(0,0,0,.65)', bull: '#c9a7ff', trk: '#3ddc84', foe: '#ff5d5d', dtc: {prec: '#4dd0e1', ppt: '#ff5d5d', pptO: '#3ddc84', line: '#d0a3ff'}},
  light: {sam: {foe: {c: '#d9730d', d: '7 5', f: .08, w: 1.5}, ally: SAMS.ally}, plan: '#d6007a', mate: '#1d2733', halo: 'rgba(255,255,255,.9)', casing: 'rgba(255,255,255,.95)', bull: '#000000', trk: '#0b7a3b', foe: '#b3001b', dtc: {prec: '#00697c', ppt: '#b3001b', pptO: '#0b7a3b', line: '#5b2a9e'}},
  // the BMS map pictures (official / folder): colours of the game's own map display - white plan with a black outline, cyan friendly and red
  // hostile contacts, flat blue SAM coverage, dark green bullseye
  game: {sam: {foe: {c: '#e0200f', d: '7 5', f: .12, w: 1.4}, ally: {c: '#1b2a9e', d: null, f: 0, w: 1.4}}, plan: '#ffffff', mate: '#2a2f3a', halo: 'rgba(0,0,0,.85)', casing: 'rgba(0,0,0,.85)', bull: '#000000', trk: '#38d6f2', foe: '#e0200f', dtc: {prec: '#ffffff', ppt: '#e0200f', pptO: '#1fbf5b', line: '#000000'}}};
// size of the screenshot area: the empty space of the datacard (page 2 bottom left of the 2048 px card) or one kneeboard card
// kinds: dc = datacard (564 x 752 px), kb = kneeboard card (a page of 1024 x 2048). out = width of the saved picture.
export const SHOTS = {dc: {w: 564, h: 752, out: 1128}, kb: {w: 1024, h: 2048, out: 1024}};

let LEAF = null;
function loadLeaflet() {
  if (LEAF) return LEAF;
  return LEAF = new Promise((res, rej) => {
    if (window.L) return res(window.L);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './vendor/leaflet/leaflet.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = './vendor/leaflet/leaflet.js';
    s.onload = () => res(window.L); s.onerror = () => { LEAF = null; rej(new Error('Leaflet could not be loaded')); };
    document.head.append(s);
  });
}
const store = {
  get() { try { return JSON.parse(localStorage.getItem('bmsmap') || '{}'); } catch (e) { return {}; } },
  set(v) { try { localStorage.setItem('bmsmap', JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
// the imported picture is kept in the browser database (survives restarts)
const idb = {
  open: () => new Promise((res, rej) => { const r = indexedDB.open('bmscards', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
  async put(k, v) { const d = await idb.open(); return new Promise((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  async get(k) { const d = await idb.open(); return new Promise((res, rej) => { const r = d.transaction('blobs').objectStore('blobs').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async del(k) { const d = await idb.open(); return new Promise((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};
const q2 = n => String(n).padStart(2, '0');
// "Day 4 · 11:00:53Z" from campaign milliseconds
export const clock = ms => { const s = Math.floor(ms / 1000); return 'Day ' + (Math.floor(s / 86400) + 1) + ' · ' + q2(Math.floor(s % 86400 / 3600)) + ':' + q2(Math.floor(s % 3600 / 60)) + ':' + q2(s % 60) + 'Z'; };
const NM = 1852;
const SUPPORT = new Set(['Support', 'C3I']);   // ATO categories shown by the "support only" switch
const SAMCAT = new Set(['Air Defense', 'SHORAD']);

// deps: {getC(), getSel() -> flight or null, getView() -> team number, esc(text), D, flightInfo(f) -> {cs, text}}
export function createMap(host, deps) {
  let map = null, G = {}, st = null, TL = null, OV = null, OVC = {}, baseTok = 0, curC = null, curSel, curView = null, imgName = '', shotK = 'dc', UL = [], LBL = [], DT = [], LNP = [], addM = null, PR = null, CR = null, pal = PAL.dark, LUM = {}, shotOn = false, SAMR = [], SAVED = null, dtcMst = () => {}, SX = false;
  // choices (filters, level, open menus, view) are kept in the browser storage and, in the desktop app, in a file next to the program
  let PREF = store.get();
  const mkSt = () => ({base: BASES[PREF.base] ? PREF.base : 'coast', cl: !!PREF.coastLight || PREF.base == 'coastl', on: Object.assign(Object.fromEntries(MAP_LAYERS.map(l => [l[0], l[2]]).concat(MAP_OPTS.map(o => [o[0], false]))), PREF.on || {}), closed: Array.isArray(PREF.closed) ? PREF.closed : ['Objects'], dtcOpen: !!PREF.dtcOpen, dtcFilOpen: PREF.dtcFilOpen !== false, dtcFilMem: PREF.dtcFilMem || null, baseOpen: !!PREF.baseOpen, filOpen: !!PREF.filOpen});
  st = mkSt();
  const persist = () => { store.set(PREF); if (deps.savePrefs) deps.savePrefs(PREF); };
  // the satellite layer: the built-in one (Sentinel-2 by EOX) or, when it is switched on in the Settings, the user's own tile provider
  const satDef = () => {
    const c = deps.satCfg && deps.satCfg();
    if (c && c.satOn && /\{z\}/.test(c.satUrl || '') && /\{x\}/.test(c.satUrl) && /\{y\}/.test(c.satUrl)) return {label: 'Satellite (your provider, online)', url: c.satUrl.replace(/\{key\}/g, encodeURIComponent(c.satKey || '')), attr: deps.esc(c.satAttr || ''), maxNative: Math.max(5, Math.min(22, +c.satMaxZoom || 18))};
    return BASES.sat;
  };
  const baseDef = k => k == 'sat' ? satDef() : BASES[k];
  const save = () => { Object.assign(PREF, {base: st.base, coastLight: st.cl, on: st.on, closed: st.closed, dtcOpen: st.dtcOpen, dtcFilOpen: st.dtcFilOpen, dtcFilMem: st.dtcFilMem, baseOpen: st.baseOpen, filOpen: st.filOpen}); persist(); };
  const $ = id => host.querySelector('#' + id);

  let home = null, away = null;
  // the DTC points can be dragged on the Map page; on the Weapons pages only after "Edit points"
  let EDIT = true;
  const ro = w => { if (!EDIT) w.querySelectorAll('input,select,button').forEach(x => { x.disabled = true; }); return w; };   // with the editing off the popups only show
  function setEdit(b) { EDIT = !!b; if (map) map.closePopup(); if (!EDIT) addStop && addStop(); DT.forEach(e => { try { if (EDIT) e.mk.dragging.enable(); else e.mk.dragging.disable(); } catch (x) { /* none */ } }); return EDIT; }
  function detach() { if (!away || !map) return; away = null; setEdit(true); const c = map.getContainer(); ['tilePane', 'coastP'].forEach(k => { const p = map.getPane(k); if (p) p.style.opacity = ''; }); home.insertBefore(c, home.firstChild); bgOp(); map.invalidateSize(); }
  async function init() {
    const L = await loadLeaflet();
    if (deps.loadPrefs) { try { const fp = await deps.loadPrefs(); if (fp && typeof fp == 'object') { PREF = Object.assign(PREF, fp); st = mkSt(); } } catch (e) { /* no file */ } }
    mergeTanks();
    host.innerHTML = '<div id="mpmap"></div><div id="mpfilw"><button class="btn" id="mpfilb">FILTERS <i>▾</i></button><div id="mpbar" class="mpp" style="display:none"></div></div><div id="mpnote" class="mpp" style="display:none"></div><div id="mpll" class="mpp"><span id="mpllc"></span><span id="mptm"></span></div><div id="mptm" class="mpp"></div><div id="mptoast" class="mpp" style="display:none"></div><div id="mpbasew"><button class="btn" id="mpbaseb">LEVELS <i>▾</i></button><div id="mpbase" class="mpp" style="display:none"></div></div><div id="mpdtcw"><div id="mpdtc" style="display:none"></div><div id="mpdrow"><button class="btn" id="mpdtcb">DTC <i>▴</i></button><div id="mpdfun"></div></div></div><div id="mpshots"><button class="btn" id="mpshotkb" title="Take a picture of the map as a new kneeboard card (1 : 2)">Screenshot for kneeboard</button><button class="btn" id="mpshot" title="Take a picture of the map for the empty space of the datacard (page 2)">Screenshot for datacard</button></div><input type="file" id="mpfile" accept="image/*" style="display:none">';
    map = L.map('mpmap', {preferCanvas: true, zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 18, zoomSnap: 0.25});
    // hover tooltips: close any that is left on when the pointer is no longer over a unit (a redraw under the cursor can leave one orphaned)
    const TIPS = new Set(); map.on('tooltipopen', e => TIPS.add(e.tooltip)); map.on('tooltipclose', e => TIPS.delete(e.tooltip));
    const tipSweep = () => TIPS.forEach(t => { if (!t.options.permanent) map.closeTooltip(t); });
    map.getContainer().addEventListener('mousemove', e => { if (TIPS.size && !(e.target.closest && e.target.closest('.leaflet-marker-icon,.leaflet-interactive,.leaflet-tooltip'))) tipSweep(); });
    map.getContainer().addEventListener('mouseleave', tipSweep);
    const wxz = () => host.classList.toggle('wxlo', map.getZoom() < 8); map.on('zoomend', wxz); wxz();   // the numbers of the wind arrows only show when zoomed in
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank">Leaflet</a>');
    L.control.scale({metric: true, imperial: false, position: 'bottomleft'}).addTo(map);
    // an overlay that shows a canvas (Leaflet's own image overlay only takes pictures)
    L.CanvasOverlay = L.ImageOverlay.extend({_initImage() { const c = this._url; this._image = c; c.classList.add('leaflet-image-layer'); if (this._zoomAnimated) c.classList.add('leaflet-zoom-animated'); this._updateOpacity(); }});
    // drawing order (bottom to top): picture / tiles (200), offline coastlines (250), units and rings (400), flight plans (450), markers (600).
    // Each level has its own pane, so nothing can be drawn over the flight plan whatever the order the layers were added in.
    map.createPane('wxP').style.zIndex = 320; map.createPane('wxA').style.zIndex = 330; ['wxP', 'wxA'].forEach(k => { map.getPane(k).style.pointerEvents = 'none'; }); map.createPane('coastP').style.zIndex = 250; map.createPane('planP').style.zIndex = 450;
    CR = L.canvas({pane: 'coastP'}); PR = L.canvas({pane: 'planP'});
    // offline bases (dark and light): land, borders, rivers and lakes over the sea-coloured container
    const mkCoast = c => {
      const sch = L.layerGroup(), ll = rs => rs.map(r => r.map(p => [p[1], p[0]]));
      L.polygon(ll(basemap.land), {renderer: CR, stroke: true, color: c.coast, weight: 1, fillColor: c.land, fillOpacity: 1, interactive: false}).addTo(sch);
      L.polygon(ll(basemap.lakes || []), {renderer: CR, stroke: true, color: c.river, weight: .8, fillColor: c.sea, fillOpacity: 1, interactive: false}).addTo(sch);
      L.polyline(ll(basemap.rivers || []), {renderer: CR, color: c.river, weight: 1, opacity: .9, interactive: false}).addTo(sch);
      L.polyline(ll(basemap.borders), {renderer: CR, color: c.border, weight: 1, dashArray: '4 4', interactive: false}).addTo(sch);
      return sch;
    };
    G.coastD = mkCoast(COAST.dark); G.coastL = mkCoast(COAST.light); G.coast = G.coastD;
    MAP_LAYERS.forEach(([k]) => G[k] = L.layerGroup());
    G.su = L.layerGroup().addTo(map);   // SAM units: shown with their unit layer or with their range layer
    map.fitBounds(PREF.view ? PREF.view.b : theaterBounds());
    map.on('moveend', () => { placeLabels(); const b = map.getBounds(); PREF.view = {b: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]}; persist(); });
    const zc = () => { const z = map.getZoom(); host.classList.toggle('zlo', z < 8); host.classList.toggle('zmid', z >= 8 && z < 9.5); };
    map.on('zoomend', zc); zc();
    host.addEventListener('click', e => { const d = e.target.closest && e.target.closest('.flb div[data-lb]'); if (d && LBP[d.dataset.lb]) { e.stopPropagation(); e.preventDefault(); LBP[d.dataset.lb](); } }, true);
    map.on('click', e => { if (shotOn) return; foldAll(); if (addM) addPlace(e.latlng); });
    map.on('mousemove', e => { $('mpllc').textContent = fmtLL(e.latlng.lat, e.latlng.lng); });
    try { const b = await idb.get('mapimg'); if (b) imgName = b.name || 'picture'; } catch (e) { /* no database */ }
    panel(); setBase();
  }
  // a message over the map; pct = 0..1 draws a loading bar, -1 a moving one (unknown duration)
  function note(msg, pct) {
    const n = $('mpnote'); if (!n) return;
    n.textContent = msg || ''; n.style.display = msg ? '' : 'none';
    if (msg && pct !== undefined) { const b = document.createElement('div'); b.className = 'ldb' + (pct < 0 ? ' ind' : ''); b.innerHTML = `<i style="width:${pct < 0 ? 40 : Math.round(pct * 100)}%"></i>`; n.append(b); }
  }

  // The panel works like the ATO list: every section folds and unfolds with a short animation (the choice is remembered)
  const SAMTXT = {se: ['Enemy SAM range (spotted)', 'Enemy SAM range · flight plan only'], sx: 'Only those crossing the flight plan', ff: ['Friendly flights', 'Friendly flights · support only'], fs: 'Only support (tankers, AWACS...)', uf: ['Friendly units', 'Friendly units · JTAC only'], sj: 'Only the JTAC of the selected CAS flight'};
  // the two "only ..." switches sit under their layer; when on, the layer's row is amber and says so
  function samRows() {
    const bar = $('mpbar'); if (!bar) return;
    const se = bar.querySelector('[data-row=se]'), sx = bar.querySelector('[data-row=sx]'), ff = bar.querySelector('[data-row=ff]'), fs = bar.querySelector('[data-row=fs]');
    if (se && sx) { ltxt(se.querySelector('.lt'), SAMTXT.se[st.on.sx ? 1 : 0]); se.classList.toggle('fl', !!st.on.sx); ltxt(sx.querySelector('.lt'), SAMTXT.sx + (st.on.sx && !deps.getSel() ? ' (select a flight)' : '')); }
    const uf = bar.querySelector('[data-row=uf]'), sj = bar.querySelector('[data-row=sj]');
    if (uf && sj) { ltxt(uf.querySelector('.lt'), SAMTXT.uf[st.on.sj ? 1 : 0]); uf.classList.toggle('fl', !!st.on.sj); ltxt(sj.querySelector('.lt'), SAMTXT.sj + (st.on.sj && !jtacOf() ? ' (select a CAS flight)' : '')); }
    if (ff && fs) { ltxt(ff.querySelector('.lt'), SAMTXT.ff[st.on.fs ? 1 : 0]); ff.classList.toggle('fl', !!st.on.fs); ltxt(fs.querySelector('.lt'), SAMTXT.fs); }
  }
  function toggleSec(h) {
    const body = h.nextElementSibling, name = h.dataset.sec, open = body.style.display == 'none', fast = deps.anim && !deps.anim();
    h.querySelector('i').textContent = open ? '▾' : '▸';
    st.closed = st.closed.filter(x => x != name); if (!open) st.closed.push(name); save();
    if (open) { body.style.display = ''; if (!fast) body.animate([{height: '0px', opacity: 0}, {height: body.scrollHeight + 'px', opacity: 1}], {duration: 150, easing: 'ease-out'}); }
    else if (fast) body.style.display = 'none';
    else { const an = body.animate([{height: body.offsetHeight + 'px', opacity: 1}, {height: '0px', opacity: 0}], {duration: 150, easing: 'ease-out'}); an.onfinish = () => { body.style.display = 'none'; }; }
  }
  const MACRO = ['Navigation', 'Selected flight', 'Ground and naval units', 'SAM range', 'In flight', 'Objects', 'Display'];   // sections with a switch for all their layers
  const secKeys = n => MAP_LAYERS.filter(l => l[3] == n).map(l => l[0]).concat(n == 'Display' ? ['names'] : []);   // the "only ..." switches are not part of a section's master switch
  // the switch of a section: on when all its layers are on, "mixed" when some are
  function masters() {
    host.querySelectorAll('#mpbar input.mst').forEach(i => { const k = secKeys(i.dataset.sec), n = k.filter(x => st.on[x]).length; i.checked = n == k.length; i.indeterminate = n > 0 && n < k.length; });
    clrLabel();
  }
  function setLayers(keys, on) {
    keys.forEach(k => { st.on[k] = on; const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = on; });
    save(); masters(); sync();
  }
  // "friendly" is written in blue and "enemy" in red in the filter names
  const fe = t => t.replace(/\b(friendly)\b/gi, '<b class="cfr">$1</b>').replace(/\b(enemy)\b/gi, '<b class="cen">$1</b>'), ltxt = (el, t) => { el.innerHTML = fe(t); };
  const bgOp = () => { if (!map) return; const o = (st.on.bgop == null ? 100 : st.on.bgop) / 100; ['tilePane', 'coastP'].forEach(k => { const p = map.getPane(k); if (p) p.style.opacity = o < 1 ? o : ''; }); };
  const layerRow = l => `<label class="mpr${l[3] ? ' sub' : ''}" data-row="${l[0]}"><input type="checkbox" data-k="${l[0]}"${st.on[l[0]] ? ' checked' : ''}> <span class="lt">${fe(l[1])}</span></label>`;
  // a menu that opens from a button (like LEVELS): open state kept in st[key]; up = the menu opens upward
  function ddown(b, m, key, up) {
    const show = o => { b.querySelector('i').textContent = o ? (up ? '▾' : '▴') : (up ? '▴' : '▾'); };
    const set = (o, fade) => { st[key] = o; save(); show(o); if (!o && fade && !(deps.anim && !deps.anim()) && m.style.display != 'none') { m.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: `translateY(${up ? 6 : -6}px)`}], {duration: 150, easing: 'ease-in'}).onfinish = () => { if (!st[key]) m.style.display = 'none'; }; return; } if (o) { m.style.display = ''; if (!(deps.anim && !deps.anim())) m.animate([{opacity: 0, transform: `translateY(${up ? 6 : -6}px)`}, {opacity: 1, transform: 'none'}], {duration: 150, easing: 'ease-out'}); } else m.style.display = 'none'; };
    b.onclick = () => set(!st[key], true); m.style.display = st[key] ? '' : 'none'; show(!!st[key]); return set;
  }
  function panel() {
    const el = $('mpbar'), ITEMS = [];
    MAP_LAYERS.filter(l => l[3] != 'DTC steerpoints').forEach(l => { ITEMS.push([l[0], l[1], l[3]]); if (l[0] == 'uf') ITEMS.push(['sj', SAMTXT.sj, 'Ground and naval units', 1]); if (l[0] == 'se') ITEMS.push(['sx', SAMTXT.sx, 'SAM range', 1]); if (l[0] == 'ff') ITEMS.push(['fs', SAMTXT.fs, 'In flight', 1]); });
    MAP_OPTS.filter(o => !['sx', 'fs', 'sj'].includes(o[0])).forEach(o => ITEMS.push(o));
    const secs = [...new Set(ITEMS.map(l => l[2]))].sort((a, b) => (a == 'Display') - (b == 'Display'));   // Display stays last
    el.innerHTML = `<div class="mph"><button class="btn g" id="mpfa" title="Fold or unfold all the filter sections">Filters</button> <button class="btn g" id="mpclr" title="Switch every filter off; press again to bring them back">Clear filters</button></div>` + secs.map(n => {
      const closed = st.closed.includes(n);
      return `<div class="mps${MACRO.includes(n) ? ' mac' : ''}" data-sec="${n}"><i>${closed ? '▸' : '▾'}</i>${MACRO.includes(n) ? `<input type="checkbox" class="mst" data-sec="${n}" title="All of ${n}">` : ''}<span>${n}</span></div><div class="mpsb" data-sec="${n}"${closed ? ' style="display:none"' : ''}>${ITEMS.filter(l => l[2] == n).map(layerRow).join('')}</div>`;
    }).join('');
    const sb = el.querySelector('.mpsb[data-sec="SAM range"]');   // transparency of the colour inside the SAM unit rings
    if (sb) { sb.insertAdjacentHTML('beforeend', `<label class="mpr" title="Colour inside the SAM rings of the units: 0 = transparent"><span class="lt">Ring fill</span><input type="range" id="mpfill" min="0" max="60" value="${st.on.ringfill == null ? 8 : st.on.ringfill}" style="flex:1;min-width:0"></label>`); $('mpfill').oninput = () => { st.on.ringfill = +$('mpfill').value; save(); sams(deps.getC(), deps.getSel()); DT.forEach(e => e.it.group == 'ppt' && e.ring && e.ring.setStyle({fillOpacity: st.on.ringfill / 100})); }; }
    el.querySelectorAll('.mps').forEach(h => h.onclick = () => toggleSec(h));
    el.querySelectorAll('input.mst').forEach(i => { i.onclick = e => e.stopPropagation(); i.onchange = () => setLayers(secKeys(i.dataset.sec), i.checked); });
    el.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { st.on[i.dataset.k] = i.checked;
      const par = {sx: 'se', fs: 'ff', sj: 'uf'}[i.dataset.k]; if (i.checked && par && !st.on[par]) { st.on[par] = true; const c = el.querySelector(`input[data-k=${par}]`); if (c) c.checked = true; }   // an "only" switch needs its layer
      save(); if (i.dataset.k == 'sx') { samRows(); sams(deps.getC(), deps.getSel()); } if (i.dataset.k == 'sj') { samRows(); }
      if (i.dataset.k == 'fs') { samRows(); flights(deps.getC(), deps.getView(), deps.getSel()); } masters(); sync(); });
    $('mpshot').onclick = () => shotStart('dc'); $('mpshotkb').onclick = () => shotStart('kb');
    $('mpfa').onclick = () => {   // every section open, or - when all are open - every section folded
      const hs = [...el.querySelectorAll('.mps')], allOpen = hs.every(h => h.nextElementSibling.style.display != 'none');
      hs.forEach(h => { const open = h.nextElementSibling.style.display != 'none'; if (open == allOpen) toggleSec(h); });
    };
    $('mpclr').onclick = clearFilters; ddown($('mpfilb'), el, 'filOpen', false);
    samRows(); masters(); baseMenu(); dtcMenu();
  }
  // The levels (base maps) have their own menu (top left of the map, next to the zoom buttons). Opens downward from its button.
  function baseMenu() {
    const m = $('mpbase'); if (!baseOk(st.base)) st.base = 'sat';
    m.innerHTML = Object.entries(BASES).filter(([k]) => baseOk(k)).map(([k, b]) => `<label class="mpr"><input type="radio" name="mpbase" value="${k}"${st.base == k ? ' checked' : ''}> ${baseDef(k).label}</label>` + (k == 'coast' ? `<label class="mpr sub" id="mpcl" style="${st.base == 'coast' ? '' : 'display:none'}"><input type="checkbox" id="mpcll"${st.cl ? ' checked' : ''}> Light version</label>` : '') + (k == 'img' ? `<div id="mpimg" class="mpi" style="${st.base == 'img' ? '' : 'display:none'}"><button class="btn g" id="mpimp">${imgName ? 'Replace picture…' : 'Import picture…'}</button><div class="hint" id="mpimn">${imgName ? deps.esc(imgName) : 'Your own map picture (same area as the official BMS map).'}</div></div>` : '')).join('');
    // opacity of the base map (pictures, tiles, coastlines): the data stay as they are
    m.insertAdjacentHTML('beforeend', `<label class="mpr" title="Opacity of the base map: 0 = only the flat background"><span class="lt">Map opacity</span><input type="range" id="mpbgo" min="0" max="100" value="${st.on.bgop == null ? 100 : st.on.bgop}" style="flex:1;min-width:0"></label>`);
    $('mpbgo').oninput = () => { st.on.bgop = +$('mpbgo').value; save(); bgOp(); }; bgOp();
    m.querySelectorAll('input[name=mpbase]').forEach(i => i.onchange = () => { st.base = i.value; $('mpimg').style.display = st.base == 'img' ? '' : 'none'; $('mpcl').style.display = st.base == 'coast' ? '' : 'none'; save(); setBase(); if (st.base != 'img' && st.base != 'coast') baseSet(false, true); });   // the menu closes after a choice (not for the imported picture: its button is in the menu)
    $('mpcll').onchange = () => { st.cl = $('mpcll').checked; save(); setBase(); };
    $('mpimp').onclick = () => $('mpfile').click();
    $('mpfile').onchange = async () => {
      const f = $('mpfile').files[0]; $('mpfile').value = ''; if (!f) return;
      try { await idb.put('mapimg', Object.assign(f.slice(0, f.size, f.type), {name: f.name})); } catch (e) { /* kept for this session only */ }
      imgName = f.name; OVC.img = null; OVC.imgBlob = f; $('mpimn').textContent = f.name; $('mpimp').textContent = 'Replace picture…'; setBase();
    };
    baseSet = ddown($('mpbaseb'), m, 'baseOpen', false);
  }
  // "Clear filters": every layer off; pressed again ("All filters"), the previous choice comes back
  const filterKeys = () => MAP_LAYERS.filter(l => l[3] != 'DTC steerpoints').map(l => l[0]).concat(['sx', 'fs', 'sj', 'names']);   // layers and the "only ..." switches (not the DTC filters)
  const clrLabel = () => { const b = $('mpclr'); if (b) b.textContent = SAVED || !filterKeys().some(k => st.on[k]) ? 'All filters' : 'Clear filters'; };
  function clearFilters() {
    const keys = filterKeys(), put = f => keys.forEach(k => { st.on[k] = f(k); const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = st.on[k]; });
    if (SAVED) { put(k => !!SAVED[k]); SAVED = null; }   // brings the previous choice back
    else if (!keys.some(k => st.on[k])) put(k => !['sx', 'fs', 'sj', 'names'].includes(k));   // everything is off: switch every layer on
    else { SAVED = Object.fromEntries(keys.map(k => [k, !!st.on[k]])); put(() => false); }
    save(); masters(); refilter();
  }
  // Map filters on the weapon pages, four states in a ring: 0 = the filters of the Map page, 1 = no filters (only the weapon drawing), 2 = the flight plan only, 3 = the flight plan and the PPT rings (the MAT toss is checked against them)
  let PLANSAVE = null, PLANMODE = 0;
  function cyclePlan() {
    const keys = MAP_LAYERS.map(l => l[0]).concat(MAP_OPTS.map(o => o[0]), ['names']);
    PLANMODE = (PLANMODE + 1) % 4;
    if (PLANMODE == 1) PLANSAVE = Object.fromEntries(keys.map(k => [k, !!st.on[k]]));
    if (PLANMODE == 0) { keys.forEach(k => { st.on[k] = !!(PLANSAVE && PLANSAVE[k]); }); PLANSAVE = null; }
    else keys.forEach(k => { st.on[k] = (PLANMODE >= 2 && k == 'fp') || (PLANMODE == 3 && k == 'dq'); });
    keys.forEach(k => { const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = !!st.on[k]; });
    save(); masters(); refilter(); return PLANMODE;
  }
  // everything that depends on the "only" switches is drawn again
  function refilter() { samRows(); sams(deps.getC(), deps.getSel()); flights(deps.getC(), deps.getView(), deps.getSel()); sync(); }
  // The DTC menu: bottom left of the map. Opens upward from its button. Filters and editing tools (only with an open DTC), then the function buttons.
  let baseSet = () => {}, foldAll = () => {}, dtcSet = null, dtcWant = false;
  // hamburger: a button that is replaced, in place, by its sub-buttons (which may be hamburgers themselves)
  const HB = (id, label, cls, title, inner) => `<div class="hm"><button class="btn g ${cls}" id="${id}" data-hb="${id}" title="${title}">${label}</button><div class="mpsub hs" style="display:none"><span class="mpv">${inner}</span></div></div>`;
  const BACK = () => '';   // no back buttons: a click on an empty spot of the map (or on another hamburger) closes the open ones
  const ICON = {prec: '<svg width="14" height="14" viewBox="0 0 18 18" class="mpic" style="--c:#4dd0e1"><circle cx="9" cy="9" r="5" class="dti"/><path d="M9 .5V4.5M9 13.5V17.5M.5 9H4.5M13.5 9H17.5" class="dti"/></svg>', ppt: '<svg width="14" height="14" viewBox="0 0 18 18" class="mpic" style="--c:#ff5d5d"><path d="M9 1.5L16.5 9L9 16.5L1.5 9Z" class="dti"/></svg>',
    fuel: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3 14V2.5h6.5V14M2 14h9M4.5 5h3.5v3H4.5zM9.5 6h2l1.5 1.5v4.5a1 1 0 0 1-2 0V9.5"/></svg>',
    tgt: '<svg width="20" height="20" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><path d="M8 0.5V3M8 13V15.5M0.5 8H3M13 8H15.5"/></svg>',
    bull: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.3"/><circle cx="8" cy="8" r="1.6"/><path d="M8 .5v4M8 11.5v4M.5 8h4M11.5 8h4"/></svg>',
    save: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9l3 3v9H2z"/><path d="M5 2v4h5V2M4.5 14V9h7v5"/></svg>',
    cam: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M1.5 4.5h3l1-1.5h5l1 1.5h3v9h-13z"/><circle cx="8" cy="9" r="2.6"/></svg>',
    bolt: '<svg width="16" height="16" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/></svg>'};
  const sqAll = (k, tit) => `<button class="btn g rd sqa" data-clr="${k}" title="${tit}">${ICON.trash}<b>ALL</b></button>`;
  function dtcMenu() {
    const m = $('mpdtc'), rows = MAP_LAYERS.filter(l => l[3] == 'DTC steerpoints');
    const ln4 = (attr, cls, tit) => '<span class="mpg">' + [1, 2, 3, 4].map(n => `<button class="btn g ${cls}" ${attr}="${attr == 'data-add' ? 'line' + n : n}"${attr == 'data-add' ? ' disabled' : ''} title="${tit(n)}">${n}</button>`).join('') + '</span>';
    m.innerHTML = `<div id="mpdedit" style="display:none"><div id="mpdfil"><div class="dtf"><button class="btn" id="mpdfb" title="Show or hide the DTC filters (hidden = the DTC points are off)">Filters <i>▾</i></button></div><div class="mpp mpbox" id="mpdfrows">${rows.map(l => layerRow([l[0], l[1]])).join('')}</div></div>
      <div id="mpdham"><div class="rail">
        <button class="btn g gn" id="mpdadd" data-fly="padd" title="Add: points, lines, rectangle">＋<small>ADD</small></button>
        <button class="btn g rd" id="mpddel" data-fly="pdel" title="Remove points from the DTC (asks first)">${ICON.trash}<small>DELETE</small></button>
        <button class="btn g bl" id="mpdauto" data-fly="pauto" title="Automatic points: pre-planned threats, bullseye line, front line, tanker tracks">${ICON.bolt}<small>AUTO</small></button>
        <button class="btn g am" id="mpdtgt" title="Add a weapon target of the DTC (the same as Add target in the Data Cartridge page, Targets): pick it from the campaign objectives. It is drawn on the map as a red blinking ring; click the ring to keep it as a TGT steerpoint.">${ICON.tgt}<small>TARGET</small></button></div>
        <div class="fly" id="padd" style="display:none"><div class="fh">Points</div><div class="tg">
          <button class="btn g gb tl" data-add="prec" disabled title="Click on the map to place a precision target (STPT 81-99). Click a point to edit it, drag it to move it.">${ICON.prec}<span>TGT Stpt</span></button>
          <button class="btn g gb tl" data-add="ppt" disabled title="Click on the map to place a pre-planned threat (STPT 56-80); pick its type in the point's editor.">${ICON.ppt}<span>Pre-planned</span></button></div>
          <div class="fh">Lines</div>${ln4('data-add', 'gb', n => `LINE${n}: each click on the map adds the next point (up to 6 steerpoints); Esc or Done stops. Red = full, green = partly used, white = empty.`)}
          <button class="btn g gb tl wide" id="mpdrect" disabled title="Closed rectangle of 5 steerpoints in a free LINE: click the map, scale it with the square corners, move it by the middle, turn it with the round handles.">▭<span>Rectangle</span></button></div>
        <div class="fly" id="pdel" style="display:none"><div class="fh">Points</div><div class="tg">
          <button class="btn g rd tl" data-clr="prec" title="Remove every precision target">${ICON.trash}<span>TGT Stpt</span></button>
          <button class="btn g rd tl" data-clr="sam" title="Remove the SAM pre-planned threats (SA-n, AAA, MANPADS)">${ICON.trash}<span>SAM</span></button>
          <button class="btn g rd tl" data-clr="oth" title="Remove the pre-planned threats that are not SAMs">${ICON.trash}<span>OTHER</span></button>
          <button class="btn g rd tl" data-clr="ppt" title="Remove every pre-planned threat">${ICON.trash}<span>ALL PPT</span></button></div>
          <div class="fh">Lines</div><span class="mrow">${ln4('data-del', 'rb', n => `Remove the 6 steerpoints of LINE${n}. Red = full, green = partly used, white = empty.`)}${sqAll('line', 'Remove every steerpoint of the 4 lines')}</span>
          <button class="btn g rd tl wide" data-clr="all" title="Remove every pre-planned threat, precision target and line steerpoint">${ICON.trash}<span>CLEAR DTC</span></button></div>
        <div class="fly" id="pauto" style="display:none"><div class="fh">Automatic lines</div><div class="tg">
          <button class="btn g bb tl" id="mpdppt" title="Replace the SAM pre-planned threats of the DTC with one for every enemy SAM crossing the flight plan of the selected flight">${ICON.ppt}<span>PPT</span></button>
          <button class="btn g bb tl" id="mpdbull" title="A whole LINE with 3 points shaped like an L: 30 NM east of the bullseye, the bullseye, 60 NM north">${ICON.bull}<span>BULLSEYE</span></button>
          <button class="btn g bb tl" id="mpdfront" title="A whole LINE of 6 points along the front: the friendly units closest to the enemy, from end to end"><span>FLOT</span></button></div>
          <div class="fh">Tankers ${ICON.fuel}</div><div class="tg" id="mpdtkl"></div></div></div></div>`;
    $('mpdfun').innerHTML = `<div class="mpcol"><button class="btn g" id="mpdopen" title="Open a DTC .ini" style="display:none">DTC</button><button class="btn g rd" id="mpdrev" disabled title="Undo every change made to the DTC since it was opened or last saved" style="display:none">↺ Reset</button></div><div class="mpcol" id="mpdcol2" style="display:none"><button class="btn g bl" id="mpdsave" disabled title="Write the changes into the open DTC file (a .bak of the original is kept once)">${ICON.save} DTC</button></div>`;
    $('mpshotkb').innerHTML = ICON.cam + ' Screenshot for kneeboard'; $('mpshot').innerHTML = ICON.cam + ' Screenshot for datacard';
    // closing the Filters macro switches every DTC filter off (the points disappear), opening it brings back what was on
    const keys = rows.map(l => l[0]), mst = () => {};
    const dfset = on => { keys.forEach(k => { st.on[k] = on ? !st.dtcFilMem || st.dtcFilMem[k] !== false : false; const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = st.on[k]; }); save(); masters(); sync(); };
    const dfs = ddown($('mpdfb'), $('mpdfrows'), 'dtcFilOpen', true);
    $('mpdfb').onclick = () => { const o = !st.dtcFilOpen; if (!o) { st.dtcFilMem = Object.fromEntries(keys.map(k => [k, !!st.on[k]])); dfset(false); } else dfset(true); dfs(o, true); };
    m.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { st.on[i.dataset.k] = i.checked; save(); sync(); });
    if (!st.dtcFilOpen && keys.some(k => st.on[k])) { st.dtcFilMem = Object.fromEntries(keys.map(k => [k, !!st.on[k]])); keys.forEach(k => { st.on[k] = false; const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = false; }); }
    dtcMst = mst; mst();
    $('mpdopen').onclick = () => deps.dtc && deps.dtc.open(); $('mpdsave').onclick = () => deps.dtc && deps.dtc.overwrite(); $('mpdrev').onclick = () => deps.dtc && deps.dtc.revert && deps.dtc.revert();
    $('mpdtgt').onclick = async () => { if (!EDIT) return; if (!deps.dtc.wtAdd) return; const r = await deps.dtc.wtAdd(); if (r == 'noinst') toast('Needs the BMS install folder (desktop app, Settings): the objectives are read from it.', true); else if (r == 'full') toast('All the weapon target numbers are used.', true); else if (r == 'ok') { const c = host.querySelector('input[data-k=dp]'); if (!st.on.dp) { st.on.dp = true; save(); if (c) c.checked = true; } dtc(); const z = WTM[WTM.length - 1]; if (z && z.mk) { map.setView(z.mk.getLatLng(), Math.max(map.getZoom(), 8)); z.mk.openPopup(); } } };
    $('mpdrect').onclick = () => rectStart(); $('mpdppt').onclick = autoPpt; $('mpdbull').onclick = autoBull; $('mpdfront').onclick = autoFront;
    // hamburgers: a button is replaced by its sub-buttons (150 ms fade); opening one closes the others; a leaf button, or a click on an empty spot of the map, closes them all
    // keep a panel clear of the DTC function buttons at the bottom and of the top of the map: shift it up, or let it scroll
    const tankPlace = p => {
      const mp = $('mpmap').getBoundingClientRect(), lim = $('mpdrow').getBoundingClientRect().top - 12, top = mp.top + 10; let r = p.getBoundingClientRect();
      if (r.height > lim - top) { p.style.maxHeight = (lim - top) + 'px'; r = p.getBoundingClientRect(); }
      let dy = 0; if (r.bottom > lim) dy = lim - r.bottom; if (r.top + dy < top) dy = top - r.top;
      if (dy) p.style.top = (parseFloat(p.style.top) + dy) + 'px';
    };
    const rail = [...m.querySelectorAll('[data-fly]')], flyOf = b => $(b.dataset.fly), ease = 'cubic-bezier(.22,.9,.3,1)';
    const flyShow = (b, o) => {
      const p = flyOf(b), fast = deps.anim && !deps.anim(); b.classList.toggle('on', o);
      if (o) {
        p.style.display = ''; p.style.maxHeight = ''; p.style.top = Math.max(0, rail[0].offsetTop - 6) + 'px'; tankPlace(p);
        if (!fast) p.animate([{opacity: 0, transform: 'translateX(-8px) scale(.97)'}, {opacity: 1, transform: 'none'}], {duration: 200, easing: ease}); return; }
      if (p.style.display == 'none') return;
      if (fast) { p.style.display = 'none'; return; }
      p.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(-8px) scale(.97)'}], {duration: 130, easing: 'ease-in'}).onfinish = () => { if (!b.classList.contains('on')) p.style.display = 'none'; };
    };
    foldAll = except => rail.forEach(b => { if (b !== except) flyShow(b, false); });
    const onOpen = {mpdauto: tankerList};
    rail.forEach(b => { b.onclick = () => { const open = flyOf(b).style.display == 'none' || !b.classList.contains('on'); if (open) { foldAll(b); if (onOpen[b.id]) onOpen[b.id](); } flyShow(b, open); }; });
    m.querySelectorAll('.fly button').forEach(x => x.addEventListener('click', () => foldAll()));
    m.querySelectorAll('[data-clr]').forEach(b => b.onclick = () => clearPoints(b.dataset.clr));
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = () => lineDelete(+b.dataset.del));
    m.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const a = b.dataset.add; if (a.startsWith('line')) lineTool(+a.slice(4)); else addStart(a, 0); });
    // the green DTC button shows / hides the filters, the editing tools and the functions; with no DTC open it asks for the file instead
    const els = [m, $('mpdfun')], grp = {style: {get display() { return els[0].style.display; }, set display(v) { els.forEach(e => { e.style.display = v; }); }}, animate: (k, o) => { const a = els.map(e => e.animate(k, o)); return {set onfinish(f) { a[0].onfinish = f; }}; }};
    const tgl = ddown($('mpdtcb'), grp, 'dtcOpen', true); dtcSet = tgl; const flip = $('mpdtcb').onclick;
    $('mpdtcb').onclick = () => { if (deps.dtc && deps.dtc.points()) flip(); else if (deps.dtc) { dtcWant = true; deps.dtc.open(); } };
    dtcInfo();
  }
  // replace a button by its row (or the row by the button), 150 ms fade
  function swap(btn, row, open, after) {
    const fast = deps.anim && !deps.anim(), ease = 'cubic-bezier(.22,.9,.3,1)';
    if (open) { btn.style.display = 'none'; row.style.display = ''; if (!fast) row.animate([{opacity: 0, transform: 'translateY(-6px) scale(.96)'}, {opacity: 1, transform: 'none'}], {duration: 200, easing: ease}); return; }
    if (row.style.display == 'none') return;
    const done = () => { row.style.display = 'none'; btn.style.display = ''; if (after) after(); if (!fast) btn.animate([{opacity: 0, transform: 'scale(.94)'}, {opacity: 1, transform: 'none'}], {duration: 190, easing: ease}); };
    if (fast) return done();
    row.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-6px) scale(.96)'}], {duration: 130, easing: 'ease-in'}).onfinish = done;
  }
  const showLayer = k => { if (!st.on[k]) { st.on[k] = true; save(); const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = true; masters(); dtcMst(); } };
  // each AUTO works once: it is dimmed while the line (or the threats) it generated is still in the DTC and comes back when that is deleted
  const lineRoom = (P, whole) => { for (let n = 1; n <= 4; n++) { const k = freeSlot(P, 'line', n); if (whole ? k == (n - 1) * LINE_LEN : k >= 0 && LINE_LEN - k % LINE_LEN >= 5) return true; } return false; };   // a LINE for a rectangle (5 free points) / a whole free LINE for a tanker track
  const AU = {};
  const auLine = (P, r) => { if (!r) return false; const q = P.line[(r.line - 1) * LINE_LEN]; return !!q && !q.empty && Math.hypot(q.x - r.x, q.y - r.y) < 3; };
  const auUsed = key => { const P = deps.dtc && deps.dtc.points(); if (!P) return false; const r = AU[key]; if (key == 'ppt') return !!r && r.some(z => { const q = P.ppt[z.slot]; return !!q && !q.empty && Math.hypot(q.x - z.x, q.y - z.y) < 3; }); return auLine(P, r); };
  function autoRefresh() {
    // the delete buttons are red only when there is something to delete
    const P0 = deps.dtc && deps.dtc.points(), ne = g => P0 ? P0[g].filter(q => !q.empty) : [], sm = ne('ppt').filter(q => isSamPpt(q.name)).length, n = {prec: ne('prec').length, sam: sm, oth: ne('ppt').length - sm, ppt: ne('ppt').length, line: ne('line').length};
    n.all = n.prec + n.ppt + n.line + (deps.dtc && deps.dtc.wtargets ? deps.dtc.wtargets().length : 0);
    document.querySelectorAll('#pdel [data-clr]').forEach(b => b.classList.toggle('nil', !n[b.dataset.clr]));
    [['mpdppt', 'ppt'], ['mpdbull', 'bull'], ['mpdfront', 'front']].forEach(([id, k]) => { const b = $(id); if (b) { const u = auUsed(k); b.classList.toggle('used', u); b.disabled = u; } });
    const noTk = !!P0 && !lineRoom(P0, true);
    document.querySelectorAll('#mpdtkl [data-tk]').forEach(b => { const u = auUsed('tk:' + b.textContent) || noTk; b.classList.toggle('used', u); b.disabled = u; });
  }
  // AUTO PPT: a pre-planned threat for every enemy SAM crossing the flight plan of the selected flight (longest range first), as many as there are free slots
  function autoPpt() {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first: the threats are added to it.', true);
    if (auUsed('ppt')) return toast('The automatic threats are already in the DTC.', true);
    const C = deps.getC(), f = deps.getSel(), r = C && f ? flightRoute(C, f) : [];
    if (!r.length) return toast('Select a flight with a flight plan first: the SAMs crossing it are added.', true);
    const cand = UL.filter(m => m.sam && !m.noFcr && !m.ally && crossesRoute(r, m.u.x, m.u.y, m.rng)).sort((a, b) => b.rng - a.rng);
    const old = P.ppt.filter(p => !p.empty && isSamPpt(p.name)); old.forEach(p => deps.dtc.clear('ppt', p.slot));   // the SAM threats of the DTC are replaced
    if (!cand.length) { dtc(); return toast((old.length ? old.length + ' SAM threats removed. ' : '') + 'No enemy SAM crosses the flight plan of the selected flight, so no threat was added.', !!old.length ? false : true); }
    let added = 0, dup = 0, full = 0; AU.ppt = [];
    cand.forEach(m => {
      const Q = deps.dtc.points(), same = Q.ppt.some(p => !p.empty && Math.hypot(p.x - m.u.x, p.y - m.u.y) < 0.5);
      if (same) { dup++; return; }
      const slot = freeSlot(Q, 'ppt'); if (slot < 0) { full++; return; }
      const k = pptForUnit(m.name), en = k >= 0 ? PPT[k] : null;
      deps.dtc.set('ppt', slot, {x: m.u.x, y: m.u.y, altFt: 0, name: en ? en[0] : String(m.name).replace(/[\s,]+/g, ' ').trim().slice(0, 6), rngNm: en ? pptRng(en) : m.rng / 1.852}); added++; AU.ppt.push({slot, x: m.u.x, y: m.u.y});
    });
    if (added) { showLayer('dq'); setLayers(secKeys('Selected flight'), true); sync(); dtc(); }
    if (full) toast(added + ' pre-planned threats added, but ' + full + ' more SAMs cross the flight plan and there are no free PPT slots left.', true);
    else toast(added ? (old.length ? old.length + ' SAM threats replaced by ' : '') + added + ' pre-planned threats added' + (dup ? ' (' + dup + ' already in the DTC)' : '') + '.' : 'The SAMs crossing the flight plan are already in the DTC.');
  }
  // CLEAR opens three buttons: PPT, TGT, LINES
  async function clearPoints(g) {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first.', true);
    const sel = {ppt: p => true, sam: p => isSamPpt(p.name), oth: p => !isSamPpt(p.name)};
    const kinds = g == 'all' ? [['ppt', 'pre-planned threats', sel.ppt], ['prec', 'precision targets', () => true], ['line', 'line steerpoints', () => true]]
      : g == 'sam' ? [['ppt', 'SAM pre-planned threats', sel.sam]] : g == 'oth' ? [['ppt', 'other pre-planned threats', sel.oth]]
      : [[g, g == 'prec' ? 'precision targets' : 'line steerpoints', () => true]];
    const list = kinds.map(([gr, nm, f]) => [gr, nm, P[gr].filter(p => !p.empty && f(p))]), WT = g == 'all' && deps.dtc.wtargets ? deps.dtc.wtargets() : [];
    if (WT.length) list.push(['wt', 'weapon targets', WT]);
    const tot = list.reduce((n, l) => n + l[2].length, 0);
    if (!tot) return toast('The DTC has no ' + (g == 'all' ? 'points to remove' : list[0][1]) + ', so nothing was removed.', true);
    addStop(); if (!await confirm('Remove ' + (g == 'all' ? 'ALL ' + tot + ' points (' + list.filter(l => l[2].length).map(l => l[2].length + ' ' + l[1]).join(', ') + ')' : 'all ' + tot + ' ' + list[0][1]) + ' from the DTC?')) return;
    list.forEach(([gr, , pts]) => pts.forEach(p => gr == 'wt' ? deps.dtc.wtClear(p.n) : deps.dtc.clear(gr, p.slot))); dtc(); toast(tot + ' ' + (g == 'all' ? 'points' : list[0][1]) + ' removed.');
  }
  // ADD TANKER: lists the tankers of the campaign (AIR REFUEL flights with their two FUEL waypoints); a click on a callsign opens the rectangle tool laid on
  // its track (width 10 NM) in the first LINE with 5 free steerpoints, ready to scale / turn
  const tankPts = (C, f) => (C && f && f.wps ? flightRoute(C, f) : []).filter(w => w.act == 24).slice(0, 2);
  let TK = [];
  // TANKER: the callsigns replace the AUTO buttons; a click places the track in an empty LINE
  function tankerList() {
    const C = deps.getC(), view = deps.getView(), sel = deps.getSel();
    // only the tankers on station during the selected flight (its element's waypoints, as the datacard picks its tankers); with no flight selected all of them
    const fWin = (() => { if (!C || !sel || !sel.wps) return null; const el = els0(C, sel), all = (el.length ? el : [sel]).flatMap(e => e.wps), ts = all.map(p => p.arr).filter(Boolean); return ts.length ? [Math.min(...ts), Math.max(...all.map(p => p.dep || p.arr))] : null; })();
    const tWin = u => { let g = u.wps.filter(p => p.act == 24); if (!g.length) g = u.wps.filter(p => p.arr); return g.length ? [g[0].arr, g[g.length - 1].dep || g[g.length - 1].arr] : [0, 0]; };
    TK = !C ? [] : C.units.filter(f => f.kind == 'flight' && f.wps && f.wps.length && (C.D.S[300 + f.omis] || '') == 'AIR REFUEL' && allyOf(C, f.owner, view) && tankPts(C, f).length == 2 && (!fWin || (w => w[0] <= fWin[1] && w[1] >= fWin[0])(tWin(f)))).map(f => [deps.flightInfo(f).cs, f]).sort((a, b) => a[0].localeCompare(b[0]));
    const w = $('mpdtkl'); w.innerHTML = TK.length ? TK.map(([cs], i) => `<button class="btn g bb tl" data-tk="${i}" title="${deps.esc([deps.flightInfo(TK[i][1]).ac, opWin(TK[i][1])].filter(Boolean).join(' · '))}">${deps.esc(cs)}</button>`).join('') : '<span class="hint">' + (sel ? 'No tanker (AIR REFUEL) on station during the selected flight.' : 'No tanker (AIR REFUEL) of your side in this campaign.') + '</span>';
    w.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { tankAdd(TK[+b.dataset.tk][1]); foldAll(); });
    autoRefresh();
  }
  // the track goes straight into an empty LINE as a closed rectangle (10 NM wide) laid on the two FUEL waypoints, with its label (no editing, unlike the rectangle tool)
  function tankAdd(f) {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first: the track is added to it.', true);
    let line = 0, slot = -1;
    for (let n = 1; n <= 4 && !line; n++) { const k = freeSlot(P, 'line', n); if (k == (n - 1) * LINE_LEN) { line = n; slot = k; } }
    if (!line) return toast('No empty LINE left: a tanker track needs a whole LINE for itself.', true);
    if (auUsed('tk:' + deps.flightInfo(f).cs)) return toast('The track of ' + deps.flightInfo(f).cs + ' is already in the DTC.', true);
    addStop();
    const C = deps.getC(), [p, q] = tankPts(C, f).map(t => t.ll), c0 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], kx = 111320 * Math.cos(c0[0] * Math.PI / 180), ky = 110574;
    const dx = (q[1] - p[1]) * kx, dy = (q[0] - p[0]) * ky, a = 5 * NM, b = Math.max(Math.hypot(dx, dy) / 2, 1 * NM), r = Math.atan2(dx, dy);
    const at = (lx, ly) => [c0[0] + (-lx * Math.sin(r) + ly * Math.cos(r)) / ky, c0[1] + (lx * Math.cos(r) + ly * Math.sin(r)) / kx];
    const cs = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([u, v]) => at(u * a, v * b)), pts = cs.concat([cs[0]]).map(z => fromLL(z[0], z[1]));
    if (pts.some(([x, y]) => x < 0 || x > 1024 || y < 0 || y > 1024)) return toast('The track reaches outside the theater.', true);
    pts.forEach(([x, y], i) => deps.dtc.set('line', slot + i, {x, y, altFt: 0})); AU['tk:' + deps.flightInfo(f).cs] = {line, x: pts[0][0], y: pts[0][1]};
    PREF.tanks = (PREF.tanks || []).filter(t => Math.hypot(t.x - pts[0][0], t.y - pts[0][1]) > 0.05).concat([{x: pts[0][0], y: pts[0][1], cs: deps.flightInfo(f).cs, ac: deps.flightInfo(f).ac || '', t: opWin(f)}]); persist();
    showLayer('dl'); sync(); dtc(); map.fitBounds(window.L.latLngBounds(cs).pad(0.5));
    toast('LINE' + line + ': track of ' + deps.flightInfo(f).cs + ' (STPT ' + (GROUPS.line.first + slot) + '-' + (GROUPS.line.first + slot + 4) + ') added to the DTC.');
  }
  // FRONT LINE: a whole empty LINE of 6 points along the front (friendly units closest to the enemy, end to end)
  function autoFront() {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first: the line is added to it.', true);
    if (auUsed('front')) return toast('The front line is already in the DTC.', true);
    let line = 0, slot = -1;
    for (let n = 1; n <= 4 && !line; n++) { const k = freeSlot(P, 'line', n); if (k == (n - 1) * LINE_LEN) { line = n; slot = k; } }
    if (!line) return toast('No empty LINE left: the front line needs a whole LINE for itself.', true);
    const f = deps.getC() ? frontLine(UL, LINE_LEN) : null;   // the friendly units and every spotted enemy ground unit
    if (!f || f.length < LINE_LEN) return toast(f ? 'Only ' + f.length + ' friendly units near the enemy were found: not enough for a line of 6 points.' : 'No front found: it needs friendly and spotted enemy ground units.', true);
    addStop(); f.forEach((p, i) => deps.dtc.set('line', slot + i, {x: p.x, y: p.y, altFt: 0})); AU.front = {line, x: f[0].x, y: f[0].y};
    showLayer('dl'); sync(); dtc(); toast('LINE' + line + ': front line, 6 points (STPT ' + (GROUPS.line.first + slot) + '-' + (GROUPS.line.first + slot + 5) + ') on the friendly units closest to the enemy.');
  }
  // BULLSEYE LINE: a 3-point line shaped like an L, the bullseye in the corner: 30 NM due east, the bullseye, 60 NM due north
  function autoBull() {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first: the line is added to it.', true);
    if (auUsed('bull')) return toast('The bullseye line is already in the DTC.', true);
    const b = bullseye(deps.getC()); if (!b) return toast('This campaign has no bullseye.', true);
    let line = 0, slot = -1;
    for (let n = 1; n <= 4 && !line; n++) { const k = freeSlot(P, 'line', n); if (k == (n - 1) * LINE_LEN) { line = n; slot = k; } }   // an empty LINE: with other points in it the L would join them
    if (!line) return toast('No empty LINE left: the bullseye L needs a whole LINE for itself.', true);
    addStop();
    const pts = [[b[0], b[1] + 30 * NM / (111320 * Math.cos(b[0] * Math.PI / 180))], b, [b[0] + 60 * NM / 110574, b[1]]].map(p => fromLL(p[0], p[1]));
    if (pts.some(([x, y]) => x < 0 || x > 1024 || y < 0 || y > 1024)) return toast('The line would reach outside the theater.', true);
    pts.forEach(([x, y], i) => deps.dtc.set('line', slot + i, {x, y, altFt: 0})); AU.bull = {line, x: pts[0][0], y: pts[0][1]};
    showLayer('dl'); sync(); dtc(); toast('LINE' + line + ': bullseye L (STPT ' + (GROUPS.line.first + slot) + '-' + (GROUPS.line.first + slot + 2) + ') added to the DTC.');
  }
  // + LINEn adds points one click at a time; once the line is complete the same button is "- LINEn" and deletes the line (after asking)
  function lineTool(n) {
    const P = deps.dtc && deps.dtc.points(); if (!P) return;
    if (freeSlot(P, 'line', n) >= 0) return addStart('line', n);
    toast('LINE' + n + ' is full (6 steerpoints), so nothing was added. Use − → Lines → ' + n + ' to empty it first.', true);
  }
  async function lineDelete(n) {
    const P = deps.dtc && deps.dtc.points(); if (!P) return toast('Open a DTC first.', true);
    const a = (n - 1) * LINE_LEN; if (P.line.slice(a, a + LINE_LEN).every(q => q.empty)) return toast('LINE' + n + ' is already empty, so nothing was removed.', true);
    addStop(); if (!await confirm('Delete all the steerpoints of LINE' + n + '?')) return;
    for (let i = a; i < a + LINE_LEN; i++) deps.dtc.clear('line', i); dtc(); toast('LINE' + n + ' emptied.');
  }
  // picture (official or imported), re-projected once and kept. The BMS folder picture (16k, 100+ MB) is not re-projected as a whole: it is
  // decoded off the main thread and cut into tiles on demand at full resolution, so the program stays usable while it loads.
  async function pictureOverlay(key) {
    if (OVC[key]) return OVC[key];
    const L = window.L; let url = BMS_MAP_URL, obj = null;
    if (key == 'sky') return OVC.sky = await skyLayer();
    const img = new Image();
    if (key == 'img') {
      let b = OVC.imgBlob; if (!b) { try { b = await idb.get('mapimg'); } catch (e) { /* none */ } }
      if (!b) throw new Error('Import a map picture first.');
      url = obj = URL.createObjectURL(b);
    }
    img.src = url; await img.decode().catch(() => { throw new Error(key == 'img' ? 'The picture could not be read.' : 'The official BMS map could not be loaded (internet?).'); });
    const w = await warpImageAsync(img, undefined, undefined, undefined, p => note('Preparing the map picture…', p)); if (obj) URL.revokeObjectURL(obj);
    LUM[key] = lumOf(w.canvas);
    return OVC[key] = new L.CanvasOverlay(w.canvas, w.bounds, {interactive: false, opacity: 1, pane: 'tilePane'});
  }
  async function skyLayer() {
    const L = window.L; if (!deps.localMap) throw new Error('Not available here.');
    const blob = await deps.localMap(), sig = 'sky' + blob.size; let bmp = null, sm = null, sw = 0, sh = 0;
    const decode = async () => {
      try { return await createImageBitmap(blob); }
      catch (e) { try { return await createImageBitmap(blob, {resizeWidth: 8192, resizeQuality: 'high'}); } catch (e2) { throw new Error('The picture could not be read (is it a PNG / JPG, and is there enough memory?).'); } }
    };
    // the reduced copy (4096 px) is kept in the database: the next start shows the map at once, the big picture is only decoded when someone zooms in
    try {
      const c = await idb.get('skysm');
      if (c && c.sig == sig && c.blob) { const r = await createImageBitmap(c.blob); sm = document.createElement('canvas'); sm.width = r.width; sm.height = r.height; sm.getContext('2d').drawImage(r, 0, 0); sw = c.sw; sh = c.sh; }
    } catch (e) { sm = null; }
    if (!sm) {
      note('Decoding the picture…', -1); bmp = await decode();
      sw = bmp.width; sh = bmp.height; const k = 4096 / sw; sm = document.createElement('canvas'); sm.width = 4096; sm.height = Math.round(sh * k);
      const x = sm.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, sm.width, sm.height);   // reduced copy for the zoomed-out levels
      sm.toBlob(async jb => { try { if (jb) await idb.put('skysm', {sig, blob: jb, sw, sh}); } catch (e) { /* not kept */ } }, 'image/jpeg', 0.92);
    }
    LUM.sky = lumOf(sm);
    let full = null, fullBusy = false, lay = null;
    const needFull = async () => {   // blocks for the deep zoom levels, prepared in the background the first time they are needed
      if (full || fullBusy) return; fullBusy = true;
      try {
        if (!bmp) bmp = await decode();
        full = await blockSource(bmp, 2048, p => note('Preparing the detail for the closest zoom levels…', p)); note('');
        if (lay) lay.redraw();
      } catch (e) { note(e.message); } finally { fullBusy = false; }
    };
    if (bmp) needFull();   // just decoded: continue with the blocks right away
    const bounds = warpFrame(BMS_EXTENT, sw, sh, 4096).bounds, queue = [];
    let busy = false;
    const pump = () => {   // tiles are drawn a few milliseconds per frame, newest first, so panning and zooming stay smooth
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 8) {
        const j = queue.pop(); if (j.cv._dead) { j.done(null, j.cv); continue; }
        try { if (j.z <= 9) pictureTile(j.cv, sm, sm.width, sm.height, BMS_EXTENT, j.z, j.x, j.y); else if (full) pictureTile(j.cv, full, sw, sh, BMS_EXTENT, j.z, j.x, j.y); else { needFull(); pictureTile(j.cv, sm, sm.width, sm.height, BMS_EXTENT, j.z, j.x, j.y); } } catch (e) { /* blank tile */ }
        j.done(null, j.cv);
      }
      if (queue.length) requestAnimationFrame(pump); else busy = false;
    };
    const Lay = L.GridLayer.extend({createTile(c, done) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; queue.push({cv, done, z: c.z, x: c.x, y: c.y});
      if (!busy) { busy = true; requestAnimationFrame(pump); }
      return cv;
    }});
    lay = new Lay({pane: 'tilePane', tileSize: 256, minZoom: 5, maxZoom: 18, maxNativeZoom: 13, bounds: L.latLngBounds(bounds), updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1});
    lay.on('tileunload', e => { e.tile._dead = true; });
    return lay;
  }
  // average brightness (0-1) of a picture; null when the pixels cannot be read (cross-origin picture)
  function lumOf(cv) {
    try {
      const t = document.createElement('canvas'); t.width = t.height = 48; const x = t.getContext('2d'); x.drawImage(cv, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data; let s = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { s += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; n++; }
      return n ? s / n : null;
    } catch (e) { return null; }
  }
  // light bases get dark flight-plan colours. The official picture cannot be measured (cross-origin) and is a light chart.
  function setPalette() {
    const game = st.base == 'bms' || st.base == 'sky', light = st.base == 'topo' || (st.base == 'coast' && st.cl) || st.base == 'bms' || ((st.base == 'img' || st.base == 'sky') && (LUM[st.base] == null || LUM[st.base] > 0.5));
    const np = game || light ? PAL.game : PAL.dark, ch = np !== pal; pal = np;
    host.style.setProperty('--plan', pal.plan); host.style.setProperty('--mate', pal.mate); host.style.setProperty('--halo', pal.halo); host.style.setProperty('--bull', pal.bull); host.style.setProperty('--dtcl', pal.dtc.line); host.classList.toggle('lt', light || game); host.classList.toggle('game', game || light);   // the BMS colours (and their outlines) for every light map
    if (ch && map) { refresh(); plan(deps.getC(), deps.getSel()); dtc(); bull(deps.getC()); flights(deps.getC(), deps.getView(), deps.getSel()); sams(deps.getC(), deps.getSel()); }
  }
  async function setBase() {
    if (!map) return;
    const L = window.L, tok = ++baseTok;
    if (!baseOk(st.base)) st.base = 'sat';
    if (TL) { map.removeLayer(TL); TL = null; }
    if (OV) { map.removeLayer(OV); OV = null; }
    map.removeLayer(G.coastD); map.removeLayer(G.coastL); G.coast = st.cl ? G.coastL : G.coastD; note('');
    const b = baseDef(st.base);
    host.classList.toggle('sat', st.base != 'coast'); host.classList.toggle('cl', st.base == 'coast' && st.cl); setPalette();
    if (st.base == 'coast') { G.coast.addTo(map); return; }
    if (st.base == 'bms' || st.base == 'img' || st.base == 'sky') {
      note(st.base == 'sky' ? 'Reading the picture from the BMS folder…' : 'Loading the map picture…', -1);
      try { const o = await pictureOverlay(st.base); if (tok != baseTok) return; OV = o; o.addTo(map); o.bringToBack(); note(''); setPalette(); }
      catch (e) { if (tok == baseTok) note(e.message); }
      return;
    }
    TL = L.tileLayer(b.url, {maxZoom: 18, maxNativeZoom: Math.min(18, b.maxNative || 13), subdomains: b.sub || 'abc', attribution: b.attr || '', crossOrigin: true});
    TL.on('tileerror', () => note('No tiles received: check the internet connection.')); TL.on('tileload', () => note('')); TL.addTo(map); TL.bringToBack();
  }
  // objectives (factories, power plants, radars ...): read when a type is first switched on and drawn as dots, white whatever the owner. The state comes from the
  // campaign file (the features of the objectives that were hit): grey = damaged, black = destroyed (the other way round on light maps, where intact is black and
  // destroyed white). A click zooms to the maximum and shows the sub-objectives as smaller dots; the full names are written next to the objectives only at the maximum zoom.
  let OBL = null, OBLP = null, OBK = '', OBJB = new Set(), OSUB = null, OLBL = null, OSEL = null, OHOOK = false, OJ = [];
  const objClear = () => { if (OSUB) OSUB.clearLayers(); if (OLBL) OLBL.clearLayers(); OSEL = null; OSL = []; };
  const dotSize = () => { const z = Math.min(13, map ? map.getZoom() : 8); return Math.round((3 + (z - 5) * 1.25) * 10) / 10; };   // 3 px zoomed out, about 13 px at the maximum zoom
  const dotIcon = (state, sub) => window.L.divIcon({className: 'nobj' + (sub ? ' sub' : ''), html: '<i class="s' + state + '"></i>', iconSize: [22, 22], iconAnchor: [11, 11]});
  const NAMEZ = 13;   // the names are written from this zoom (the maximum of the base maps); above it the sub-objectives get theirs too
  let OSL = [];
  function objLabels() {
    if (!OLBL || !map) return; OLBL.clearLayers();
    const z = map.getZoom(); if (z < NAMEZ - 0.01) return;
    const bd = map.getBounds().pad(0.1), L = window.L; let n = 0;
    const lab = (ll, name, cls) => L.marker(ll, {interactive: false, keyboard: false, icon: L.divIcon({className: 'nobjl' + cls, html: '<span>' + deps.esc(name) + '</span>', iconSize: [0, 0], iconAnchor: [-9, 7]})}).addTo(OLBL);
    OJ.forEach(r => { if (n > 400 || !bd.contains(r.ll) || !map.hasLayer(G['o' + r.t])) return; n++; lab(r.ll, r.o.name, ''); });
    if (z >= 14) OSL.forEach(r => { if (bd.contains(r.ll)) lab(r.ll, r.name, ' sl'); });
  }
  const objSize = () => { host.style.setProperty('--os', dotSize() + 'px'); host.style.setProperty('--ss', Math.max(3, dotSize() * 0.62) + 'px'); };
  function objDraw() {
    const on = OBJ_LAYERS.filter(([t]) => st.on['o' + t]); if (!map) return;
    if (!on.length) { objClear(); return; }
    if (!OBL) { if (!OBLP && deps.objects) OBLP = deps.objects.list().then(l => { OBL = l; objDraw(); }).catch(e => { OBLP = null; toast('Objects: ' + (e && e.message || e), true); OBJ_LAYERS.forEach(([t]) => { st.on['o' + t] = false; }); save(); panel(); sync(); }); return; }
    const C = deps.getC(), key = (C && C.name) + '|' + (C && C.now), L = window.L;
    if (!OSUB) { OSUB = L.layerGroup().addTo(map); OLBL = L.layerGroup().addTo(map); }
    if (!OHOOK) { OHOOK = true; map.on('moveend zoomend', objLabels); map.on('zoom zoomend', objSize); map.on('click', () => { if (OSEL) objClear(); }); }
    objSize();
    if (key != OBK) { OBJ_LAYERS.forEach(([t]) => G['o' + t].clearLayers()); OBK = key; OBJB = new Set(); OJ = []; objClear(); }
    on.forEach(([t, lab]) => {
      if (OBJB.has(t)) return; OBJB.add(t);
      OBL.filter(o => o.type == t).forEach(o => {
        const fs = C && C.objFeat ? C.objFeat.get(o.id) : null, state = objState(fs), ll = toLL(o.e / FT_KM, o.n / FT_KM);
        OJ.push({t, o, ll});
        L.marker(ll, {icon: dotIcon(state), keyboard: false, zIndexOffset: 100})
          .bindTooltip(deps.esc(o.name) + ' · ' + lab + (state ? (state == 2 ? ' · destroyed' : ' · damaged') : ''), {direction: 'top', offset: [0, -6]})
          .on('click', () => { if (OSEL === o.id) window.L.popup({className: 'mpop', closeButton: false, autoPan: false, minWidth: 200, offset: [0, -6]}).setLatLng(ll).setContent(objPopup(o.name, lab + (state ? (state == 2 ? ' · destroyed' : ' · damaged') : ''), o.n, o.e)).openOn(map); else objOpen(o, ll, lab); }).addTo(G['o' + t]);   // 1st click: zoom in and show the sub-objectives; 2nd click: the menu
      });
    });
    objLabels();
  }
  // zoom to the objective and show its sub-objectives
  function objOpen(o, ll, lab) {
    const L = window.L, C = deps.getC(), fs0 = C && C.objFeat ? C.objFeat.get(o.id) : null, an = !(deps.anim && !deps.anim()); objClear(); OSEL = o.id; OSL = [];
    const first = map.getZoom() < NAMEZ - 0.01 || map.getCenter().distanceTo(ll) > 2; map.setView(ll, Math.max(map.getZoom(), NAMEZ), {animate: an});
    deps.objects.features(o).then(fs => {
      if (OSEL !== o.id) return;
      fs.forEach((f, k) => { const sv = fs0 && fs0[k] !== undefined ? featState(fs0[k]) : 0, txt = sv ? (sv == 2 ? ' · destroyed' : ' · damaged') : '', fl = toLL(f.e / FT_KM, f.n / FT_KM); OSL.push({ll: fl, name: f.name});
        L.marker(fl, {icon: dotIcon(sv, true), keyboard: false, zIndexOffset: 150})
          .bindTooltip(deps.esc(f.name) + txt, {direction: 'top', offset: [0, -4]})
          .bindPopup(() => objPopup(o.name + ' ' + f.name, f.name + ' · ' + o.name + txt, f.n, f.e), {className: 'mpop', closeButton: false, autoPan: false, minWidth: 200}).addTo(OSUB); });
      if (fs.length) {   // magnifier: enlarge until the sub-objectives fill the view (up to zoom 18)
        const bd = L.latLngBounds([ll]); OSL.forEach(r => bd.extend(r.ll));
        const go = () => { const z = Math.min(18, Math.max(NAMEZ, map.getBoundsZoom(bd, false, [50, 50]))); map.setView(bd.getCenter(), z, {animate: an}); };
        if (!first) go(); else { let done = false; const once = () => { if (!done) { done = true; go(); } }; map.once('moveend', once); setTimeout(once, 900); }   // wait for the first move (a second setView during it is lost)
      }
      objLabels();
    }).catch(() => { toast('The sub-objectives could not be read.', true); });
  }
  function objPopup(name, sub, n, e) {
    const d = document.createElement('div'); d.className = 'dtp'; const nm = name.slice(0, 40);
    d.innerHTML = `<div><b>${deps.esc(name)}</b></div><div class="hint" style="min-height:0">${deps.esc(sub)} · ${fmtLL(...toLL(e / FT_KM, n / FT_KM))}</div><div class="bar" style="margin:6px 0 0"><button type="button" class="btn g" data-a="wt">Add as weapon target</button><button type="button" class="btn g gn" data-a="st" title="Keep it as a TGT steerpoint (STPT 81-99)">＋ TGT STPT</button></div><div class="hint err" style="color:#ff6b6b;min-height:0"></div>`;
    const err = t => { d.querySelector('.err').textContent = t; };
    d.querySelector('[data-a=wt]').onclick = async () => { if (!EDIT) return; const r = await deps.dtc.wtPut({n, e, elv: 0, name: nm}); if (r == 'full') return err('No free weapon target left in the DTC.'); if (r == 'ok') { map.closePopup(); dtc(); toast('Weapon target added: ' + nm); } };
    d.querySelector('[data-a=st]').onclick = async () => {
      if (!EDIT) return; const P = deps.dtc.points(), slot = P ? freeSlot(P, 'prec') : -1; if (slot < 0) return err('There is no free TGT Steerpoint (STPT 81-99).');
      const alt = deps.dtc.elev ? await deps.dtc.elev({n, e}) : 0, sn = String(name).replace(/[\s,]+/g, ' ').trim().slice(0, 11) || 'Map STPT ' + (GROUPS.prec.first + slot);
      deps.dtc.set('prec', slot, {x: e / FT_KM, y: n / FT_KM, altFt: alt, name: sn}); map.closePopup(); dtc(); toast('Added as STPT ' + (GROUPS.prec.first + slot) + '.');
    };
    return ro(d);
  }
  function sync() { unitVis(); objDraw(); host.classList.toggle('names', !!st.on.names); host.classList.toggle('nofd', !st.on.fd); MAP_LAYERS.forEach(([k]) => { if (st.on[k]) G[k].addTo(map); else map.removeLayer(G[k]); }); radarCov(); }

  const side = (ally, owner) => ally ? 'friend' : owner == 0 ? 'neutral' : 'hostile';
  // units and SAM rings (campaign / faction change)
  function units(C, view) {
    const L = window.L; ['uf', 'ue'].forEach(k => G[k].clearLayers()); G.su.clearLayers(); UL = [];
    if (!C) return;
    UL = mapUnits(C, view).filter(m => m.spotted);
    UL.forEach(m => { if (m.sam) { const k = pptForUnit(m.name); if (k >= 0 && PPT[k][1] > 1000) m.rng = Math.round(PPT[k][1] / FT_KM * 10) / 10; } });   // same ring as the pre-planned threat of the list
    UL.forEach(m => {
      const s = unitSymbol(m.cat, side(m.ally, m.owner));
      const tip = '<b>' + deps.esc(m.bn) + '</b><br>' + deps.esc(m.name) + ' · ' + deps.esc(m.cat) + ' · ' + deps.esc(teamName(C.D, m.owner)) + (m.sam ? '<br>Range ' + m.rng + ' km (low ' + m.low + ' km)' : '') + (m.noFcr ? '<br><b style="color:#ff8a8a">No FCR</b>' : '');
      const mk = L.marker(m.ll, {icon: L.divIcon({className: 'nsym', html: s.html + '<i class="nm">' + deps.esc(m.bn) + '</i>', iconSize: [s.w, s.h]}), keyboard: false, zIndexOffset: m.sam ? 800 + Math.round(Math.min(m.rng || 0, 190)) : m.ally ? 0 : 200}).bindTooltip(tip, {direction: 'top', offset: [0, -s.h / 2]});   // exact position; when icons overlap the SAM / air defense units are on top (the dangerous ones), the longest range on top (SA-10 over SHORAD), then the enemy ones
      if (!m.ally) mk.bindPopup(() => ro(samPopup(m)), {className: 'mpop', closeButton: false, autoPan: false, minWidth: 190});   // an enemy unit can become a PPT threat
      m.mk = mk; if (m.sam) G.su.addLayer(mk); else mk.addTo(G[m.ally ? 'uf' : 'ue']);
    });
  }
  // SAM range rings. With the "crossing" switch on and a flight selected, only the enemy rings that touch its flight plan are drawn (thicker).
  // an enemy SAM unit that already has a SAM pre-planned threat of the DTC on it (same place, with its ring): only the red PPT ring is shown
  function pptCovers(m) {
    const P = deps.dtc && deps.dtc.points(); return !!P && P.ppt.some(p => !p.empty && p.rngNm > 0.5 && isSamPpt(p.name) && Math.hypot(p.x - m.u.x, p.y - m.u.y) < 0.5);
  }
  function sams(C, f) {
    const L = window.L; ['sf', 'se'].forEach(k => G[k].clearLayers()); SAMR = [];
    if (!C) return;
    const r = f ? flightRoute(C, f) : [], only = !!st.on.sx && r.length > 0; SX = only; UL.forEach(m => { m.hit = false; });
    UL.filter(m => m.sam && !m.noFcr).forEach(m => {   // no FCR: no ring
      const hit = !m.ally && only && crossesRoute(r, m.u.x, m.u.y, m.rng); m.hit = hit; if (!m.ally && only && !hit) return;
      if (!m.ally && pptCovers(m)) return;   // its red PPT ring is drawn instead
      const sty = pal.sam[m.ally ? 'ally' : 'foe'], fo = (st.on.ringfill == null ? 8 : st.on.ringfill) / 100;
      L.circle(m.ll, {radius: m.rng * 1000, color: sty.c, weight: hit ? 2.8 : sty.w, dashArray: sty.d, fillColor: sty.c, fillOpacity: hit && fo > 0 ? Math.max(.2, fo + .1) : fo, interactive: false}).addTo(G[m.ally ? 'sf' : 'se']);
      if (!m.ally) SAMR.push(m);
    });
    unitVis();
  }
  // SAM units follow their range: visible when their unit layer is on, or their range layer is on (enemy: only the ones crossing the plan when that filter is on)
  // the JTAC unit of the selected flight (CAS missions): the same rule as the datacard
  function jtacOf() { const C = deps.getC(), f = deps.getSel(); if (!C || !f) return null; try { const b = jtacPick(C, f); return b ? b.u : null; } catch (e) { return null; } }
  function unitVis() {
    const jt = st.on.sj ? jtacOf() : null;
    UL.filter(m => !m.sam && m.ally && m.mk).forEach(m => { if (!jt || m.u === jt) G.uf.addLayer(m.mk); else G.uf.removeLayer(m.mk); });   // "JTAC only": that unit alone
    UL.filter(m => m.sam && m.mk).forEach(m => {
      const on = m.ally ? (st.on.uf || st.on.sf) : (st.on.ue || (st.on.se && (!SX || m.hit)));
      if (on) G.su.addLayer(m.mk); else G.su.removeLayer(m.mk);
    });
  }
  // an enemy unit can be added to the open DTC (click on the unit): a SAM / AAA unit becomes a pre-planned threat (name from the list, ring = its range),
  // any other unit a precision target
  function samPopup(m) {
    const w = document.createElement('div'), P = deps.dtc && deps.dtc.points(), k = pptForUnit(m.name), en = k >= 0 ? PPT[k] : null, g = m.sam || en ? 'ppt' : 'prec';
    const slot = P ? freeSlot(P, g) : -1, name = g == 'prec' ? String(m.bn).replace(/[\s,]+/g, ' ').trim().slice(0, 11) : en ? en[0] : String(m.name).replace(/[\s,]+/g, ' ').trim().slice(0, 6), rngNm = en ? pptRng(en) : m.sam ? m.rng / 1.852 : 0;
    const what = g == 'ppt' ? 'Pre-planned' : 'precision target', btn = g == 'ppt' ? 'Add Pre-planned STPT' : 'Add TGT Steerpoint';
    w.className = 'dtp';
    w.innerHTML = `<div><b>${deps.esc(m.bn)}</b></div><div class="hint" style="min-height:0">${fmtLL(m.ll[0], m.ll[1])}</div><div class="bar" style="margin:6px 0 0;justify-content:center"><button class="btn" data-a="ppt">${btn}</button></div><div class="hint" style="min-height:0">${!P ? 'Open a DTC to add it.' : slot < 0 ? 'No free slot left for this kind of point.' : 'Becomes STPT ' + (GROUPS[g].first + slot) + (g == 'ppt' ? ': ' + (en ? deps.esc(en[2]) + (rngNm ? ', ring ' + rngNm.toFixed(1) + ' NM' : '') : 'name ' + deps.esc(name)) : ' (' + deps.esc(name) + ')') + '.'}</div>`;
    w.querySelector('[data-a=ppt]').onclick = () => {
      if (!P) { toast('Open a DTC first: the point is added to it.', true); return; }
      if (slot < 0) { toast('No free ' + what + ' slot left in the DTC.', true); return; }
      deps.dtc.set(g, slot, g == 'ppt' ? {x: m.u.x, y: m.u.y, altFt: 0, name, rngNm} : {x: m.u.x, y: m.u.y, altFt: 0, name}); map.closePopup();
      showLayer(GROUPS[g].layer);
      sync(); dtc(); toast('STPT ' + (GROUPS[g].first + slot) + ' added to the DTC as a ' + what.toLowerCase() + ' (' + m.name + ').');
    };
    return w;
  }
  // flights as radar tracks at the campaign time: hollow square, speed vector, callsign and basics
  function flights(C, view, sel) {
    const L = window.L; G.ff.clearLayers(); G.fe.clearLayers();
    if (!C || C.now == null) return;
    const mates = [0, 1, 2, 3, 4, 5, 6, 7].filter(t => allyOf(C, t, view));
    C.units.forEach(f => {
      if (f.kind != 'flight') return; const s = flightState(f, C.now); if (!s) return;
      const ally = allyOf(C, f.owner, view); if (!ally && !spottedBy(f, mates)) return;
      if (ally && st.on.fs && !SUPPORT.has(deps.flightInfo(f).cat)) return;   // "support only": tankers, AWACS, airlift, CSAR...
      const col = ally ? pal.trk : pal.foe, info = deps.flightInfo(f), g = G[ally ? 'ff' : 'fe'], fl = Math.round(s.altFt / 100);
      const ahead = s.gsKt * 1.852 * 2 / 60 / 111.12; // 2 minutes of flight, degrees of latitude (small-scale vector)
      const rad = s.hdg * Math.PI / 180, end = [s.ll[0] + ahead * Math.cos(rad), s.ll[1] + ahead * Math.sin(rad) / Math.cos(s.ll[0] * Math.PI / 180)];
      L.polyline([s.ll, end], {color: col, weight: 1.6, interactive: false}).addTo(g);
      const back = [s.ll];   // the track behind the aircraft: dots over the last 90 seconds (one dotted line, so there is little to draw)
      for (let k = 1; k <= 9; k++) { const q = flightState(f, C.now - k * 10000); if (!q) break; back.push(q.ll); }
      if (back.length > 1) L.polyline(back, {color: col, weight: 3, opacity: .85, lineCap: 'round', dashArray: '0.1 7', interactive: false}).addTo(g);
      const html = `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" class="${f === sel ? 'sel' : ''}${deps.canSelect && !deps.canSelect(f) ? ' ns' : ''}" style="--c:${col}"/></svg><span class="trl" style="color:${col};--c:${col}">${deps.esc(info.cs)}<br>${String(fl).padStart(3, '0')} ${s.gsKt}</span>`;
      L.marker(s.ll, {icon: L.divIcon({className: ally ? 'trk al' : 'trk', html, iconSize: [14, 14]}), zIndexOffset: 500, keyboard: false})
        .on('click', () => deps.selectFlight && deps.selectFlight(f)).bindTooltip(deps.esc(info.text) + '<br>FL' + String(fl).padStart(3, '0') + ' · ' + s.gsKt + ' kt · ' + Math.round(s.hdg) + '°', {direction: 'right', offset: [10, 0]}).addTo(g);
    });
  }

  // selected flight plan: line with a halo, steerpoints (circle / triangle, hollow, click to fill and read), leg distances and a label box.
  // Line and steerpoints are in the "fp" layer, leg distances and the label box in "fd", the package mates in "pk". Lines go to their own pane, above rings and units.
  function plan(C, f) {
    const L = window.L; ['fp', 'fd', 'pk'].forEach(k => G[k].clearLayers()); LBL = [];
    const r = C && f ? flightRoute(C, f) : []; if (!r.length) return;
    els0(C, f).filter(m => m !== f && m.wps && m.wps.length > 1).forEach((m, i) => member(C, m, i));
    const mn = C.D.S[300 + f.omis] || '', lg = legs(r), ll = r.map(p => p.ll);
    // from the first landing steerpoint on (recovery, diversion) the line is dashed
    const li = r.findIndex(p => p.act == 7), parts2 = li > 0 && li < r.length - 1 ? [[ll.slice(0, li + 1), null], [ll.slice(li), '7 6']] : [[ll, null]];
    parts2.forEach(([pl, dash]) => {
      if (pal.casing) L.polyline(pl, {renderer: PR, color: pal.casing, weight: 6, opacity: 1, dashArray: dash, interactive: false}).addTo(G.fp);
      L.polyline(pl, {renderer: PR, color: pal.plan, weight: 2.5, opacity: .95, dashArray: dash, interactive: false}).addTo(G.fp);
    });
    r.forEach((p, i) => {
      const act = isActivity(p.act), shape = p.act == 4 ? '<rect x="2.5" y="2.5" width="13" height="13" class="wpi"/>' : act ? '<path d="M9 2.5L16 15H2Z" class="wpi"/>' : '<circle cx="9" cy="9" r="6.5" class="wpi"/>';   // refuel = square, other activity = triangle
      const mk = L.marker(p.ll, {icon: L.divIcon({className: 'wps', html: `<svg width="18" height="18" viewBox="0 0 18 18">${shape}</svg><b>${p.n}</b>`, iconSize: [18, 18]}), zIndexOffset: 1000, keyboard: false});
      const l = lg[i], t = p.arr > 0 ? hms(p.arr).slice(0, 8) + 'Z' : '';
      mk.bindPopup(`<b>Steerpoint ${p.n}</b> · ${deps.esc(actName(f.wps, i, mn))}<br>${fmtLL(p.ll[0], p.ll[1])}<br>${p.altFt ? p.altFt.toLocaleString('en-US') + ' ft' : 'Ground'}${t ? ' · ' + t : ''}${l ? '<br>Leg ' + l.nm.toFixed(1) + ' NM · ' + String(Math.round(l.hdg)).padStart(3, '0') + '°' : ''}`,
        {className: 'mpop', closeButton: false, autoPan: false, offset: [0, -4]});
      mk.on('popupopen', () => mk._icon && mk._icon.classList.add('sel')); mk.on('popupclose', () => mk._icon && mk._icon.classList.remove('sel'));
      mk.addTo(G.fp);
      if (l) L.marker(l.mid, {icon: L.divIcon({className: 'leg', html: `<span>${l.nm >= 100 ? Math.round(l.nm) : l.nm.toFixed(1)} NM</span>`, iconSize: [0, 0]}), interactive: false, keyboard: false}).addTo(G.fd);
    });
    const info = deps.flightInfo(f), parts = String(info.text).split(' · '), t0 = r.find(p => p.arr > 0);
    label(G.fd, ll, `<b>${deps.esc(info.cs)}</b><i>${deps.esc(parts.slice(1, 3).join(' · '))}</i>${t0 ? '<i>T/O ' + hms(t0.arr).slice(0, 8) + 'Z</i>' : ''}`, '', 0);
    placeLabels();
  }
  // a box tied to the flight plan by a short leader line, next to the distance label of a leg: placeLabels() puts it on the leg whose middle is
  // nearest to the view centre (and inside the visible map), and moves it whenever the map moves
  let PENDTK = null;
  const mergeTanks = () => { if (!PENDTK) return; const cur = PREF.tanks || []; PREF.tanks = cur.filter(t => !PENDTK.some(n => Math.hypot(t.x - n.x, t.y - n.y) <= 0.05)).concat(PENDTK); PENDTK = null; persist(); };
  let TLB = [];   // labels of the tanker tracks (the DTC lines)
  let LBN = 0; const LBP = {};   // click actions of the labels
  function label(group, route, html, cls, k, list, pick) {
    const L = window.L, at = route.length > 1 ? [(route[0][0] + route[1][0]) / 2, (route[0][1] + route[1][1]) / 2] : route[0];
    const mk = L.marker(at, {icon: L.divIcon({className: 'flb ' + cls, html: `<div style="--o:${k * 34}px"${pick ? ` data-lb="${++LBN}"` : ''}>${html}</div>`, iconSize: [0, 0]}), interactive: false, keyboard: false, zIndexOffset: 1500}).addTo(group);
    if (pick) LBP[LBN] = pick;
    (list || LBL).push({mk, r: route});
  }
  function placeLabels() {
    if (!map || !LBL.length && !TLB.length) return;
    const L = window.L, sz = map.getSize(), c = {x: sz.x / 2, y: sz.y / 2};
    LBL.concat(TLB).forEach(o => {
      let best = null, bd = Infinity;
      const cand = o.r.length > 1 ? o.r.slice(1).map((q, i) => [(o.r[i][0] + q[0]) / 2, (o.r[i][1] + q[1]) / 2]) : o.r;
      cand.forEach(ll => {
        const x = map.latLngToContainerPoint(ll); if (x.x < 24 || x.x > sz.x - 210 || x.y < 90 || x.y > sz.y - 50) return;
        const d = Math.hypot(x.x - c.x, x.y - c.y); if (d < bd) { bd = d; best = ll; }
      });
      if (best) { o.mk.setLatLng(best); o.mk.setOpacity(1); } else o.mk.setOpacity(0);
    });
  }
  // other flights of the selected package: white, dimmer, dashed; a click selects the flight (when it can be loaded)
  function member(C, m, k) {
    const L = window.L, r = flightRoute(C, m), info = deps.flightInfo(m), pick = () => deps.selectFlight && deps.selectFlight(m), ll = r.map(p => p.ll);
    L.polyline(ll, {renderer: PR, color: pal.mate, weight: 1.8, opacity: .75, dashArray: '6 5', interactive: false}).addTo(G.pk);
    r.forEach(p => {
      const shape = p.act == 4 ? '<rect x="3.5" y="3.5" width="11" height="11" class="wpi"/>' : isActivity(p.act) ? '<path d="M9 3.5L15 14.5H3Z" class="wpi"/>' : '<circle cx="9" cy="9" r="5.5" class="wpi"/>';
      L.marker(p.ll, {icon: L.divIcon({className: 'wps dim', html: `<svg width="18" height="18" viewBox="0 0 18 18">${shape}</svg><b>${p.n}</b>`, iconSize: [18, 18]}), zIndexOffset: 400, keyboard: false})
        .on('click', pick).bindTooltip(deps.esc(info.text) + '<br>Steerpoint ' + p.n, {direction: 'top', offset: [0, -6]}).addTo(G.pk);
    });
    label(G.pk, ll, `<b>${deps.esc(info.cs)}</b>`, 'm clk', k, null, () => { if (deps.selectFlight && deps.selectFlight(m) === false) toast('That flight cannot be selected.', true); });
  }
  function bull(C) {
    const L = window.L; G.bull.clearLayers(); const b = bullseye(C); if (!b) return;
    for (let n = 20; n <= 100; n += 20) L.circle(b, {radius: n * NM, color: pal.bull, weight: 1, opacity: .6, dashArray: n % 40 ? '2 5' : null, fill: false, interactive: false}).addTo(G.bull);
    const d = 100 * NM / 111120, dl = d / Math.cos(b[0] * Math.PI / 180);
    L.polyline([[b[0] - d, b[1]], [b[0] + d, b[1]]], {color: pal.bull, weight: 1, opacity: .45, interactive: false}).addTo(G.bull);
    L.polyline([[b[0], b[1] - dl], [b[0], b[1] + dl]], {color: pal.bull, weight: 1, opacity: .45, interactive: false}).addTo(G.bull);
    L.marker(b, {icon: L.divIcon({className: 'bulls', html: '<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8"/><circle cx="11" cy="11" r="3.5"/><path d="M11 0v22M0 11h22"/></svg><span>BULLSEYE</span>', iconSize: [22, 22]}), interactive: false, keyboard: false}).addTo(G.bull);
  }

  // ---- DTC steerpoints: read from / written to the open DTC (deps.dtc) --------------------------------
  const SAMPPT = 26;   // entries 0-25 of the list are the weapon systems with a ring (SA-n, AAA, ManPad, Hawk...): "SAM" threats, all the others "other"
  const isSamPpt = n => { const k = pptIndex(n); return k >= 0 && k < SAMPPT; };
  const dtcCol = (g, it) => g == 'ppt' && it && !isSamPpt(it.name) ? pal.dtc.pptO : pal.dtc[g];
  const P0 = () => deps.dtc.points();
  function dtcInfo() {
    const ob = $('mpdopen'); if (!ob || !deps.dtc) return;
    const has = !!deps.dtc.points(), ed = $('mpdedit');
    if (has && dtcWant && dtcSet && !st.dtcOpen) dtcSet(true); if (has) dtcWant = false;
    if (ed) { const was = ed.style.display != 'none'; ed.style.display = has ? '' : 'none'; if (has && !was && !(deps.anim && !deps.anim())) ed.animate([{opacity: 0}, {opacity: 1}], {duration: 150, easing: 'ease-out'}); }
    $('mpdrev').style.display = has ? '' : 'none'; $('mpdcol2').style.display = has ? '' : 'none'; $('mpdsave').disabled = !has || !(deps.dtc.canOverwrite && deps.dtc.canOverwrite()) || !deps.dtc.dirty(); $('mpdsave').classList.toggle('nil', $('mpdsave').disabled); if (ob) { ob.classList.toggle('g', !has); ob.style.display = has ? '' : 'none'; ob.textContent = has ? deps.dtc.fileName() : 'DTC'; ob.title = has ? 'DTC open: ' + deps.dtc.fileName() + ' (click to open another)' : 'Open a DTC .ini'; } $('mpdrev').disabled = !has || !deps.dtc.dirty(); $('mpdrev').classList.toggle('nil', $('mpdrev').disabled); host.querySelectorAll('[data-add]').forEach(b => { b.disabled = !has; }); $('mpdrect').disabled = !has;
    [1, 2, 3, 4].forEach(n => host.querySelectorAll(`[data-add=line${n}],[data-del="${n}"]`).forEach(b => { const a = (n - 1) * LINE_LEN, pl = has ? P0().line.slice(a, a + LINE_LEN) : [], full = has && pl.length > 0 && pl.every(q => !q.empty), none = has && pl.every(q => q.empty);
      b.classList.toggle('lnr', full); b.classList.toggle('lng', has && !full && !none); b.classList.toggle('lnw', none); b.textContent = n; }));
    $('mpdrect').classList.toggle('lnr', has && !lineRoom(P0(), false));   // no LINE with 5 free points: red
    ['prec', 'ppt'].forEach(g => host.querySelectorAll(`[data-add=${g}]`).forEach(b => b.classList.toggle('lnr', has && freeSlot(P0(), g) < 0)));   // no room left: red
  }
  const dtcIcon = it => {
    const L = window.L, col = it.group == 'prec' && it.wt ? '#ef4444' : dtcCol(it.group, it);
    const sh = it.group == 'prec' ? '<circle cx="9" cy="9" r="5" class="dti"/><path d="M9 0.5V4.5M9 13.5V17.5M0.5 9H4.5M13.5 9H17.5" class="dti"/>'
      : it.group == 'ppt' ? '<path d="M9 1.5L16.5 9L9 16.5L1.5 9Z" class="dti"/>' : '<rect x="4.5" y="4.5" width="9" height="9" class="dti"/>';
    return L.divIcon({className: 'dts ' + it.group, html: `<svg width="18" height="18" viewBox="0 0 18 18" style="--c:${col}">${sh}</svg><b style="color:${col}">${it.stpt}</b>` + (it.group == 'ppt' && it.name ? `<i class="dtn" style="color:${col}">${deps.esc(pptLabel(it.name))}</i>` : ''), iconSize: [18, 18]});
  };
  const dtcTip = it => `<b>STPT ${it.stpt}</b> · ${it.group == 'line' ? 'LINE' + lineOf(it.slot) + ' point ' + (it.slot % LINE_LEN + 1) : GROUPS[it.group].label}${it.name ? '<br>' + deps.esc(it.name) : ''}<br>${fmtLL(...toLL(it.x, it.y))}${it.group == 'ppt' && it.rngNm ? '<br>Range ' + it.rngNm.toFixed(1) + ' NM' : ''}`;
  // after a change (a point or a whole line deleted ...) an unfinished line is recalculated: the highlighted point and the Done button follow
  function dtc() { const am = addM && addM.g == 'line' && !addM.rect ? addM : null; try { dtc0(); } finally { if (am && addM === am) addStart('line', am.line); } }
  function dtc0() {
    ['dp', 'dq', 'dl', 'da'].forEach(k => G[k].clearLayers()); DT = []; LNP = []; attackDraw();
    const P = deps.dtc && deps.dtc.points(); dtcInfo(); sams(deps.getC(), deps.getSel()); autoRefresh(); if (!P) return;
    ['prec', 'ppt', 'line'].forEach(g => P[g].filter(p => !p.empty).forEach(dtcMark));
    dtcLinesDraw(); wtDraw(); placeLabels();
  }
  // the weapon targets of the DTC (STPT wpntarget_n): a red blinking ring; its menu keeps the target as a TGT steerpoint (STPT 81-99)
  let WTM = [];
  const WTK = (P0) => (deps.dtc && deps.dtc.wtargets ? deps.dtc.wtargets() : []);
  const wtKept = (w, P) => !!P && P.prec.some(p => !p.empty && Math.abs(p.x - w.x) < 0.02 && Math.abs(p.y - w.y) < 0.02);
  function wtDraw() {
    WTM = []; const W = WTK(), P1 = deps.dtc && deps.dtc.points(); const L = window.L;
    W.filter(w => !wtKept(w, P1)).forEach(w => {
      const mk = L.marker(toLL(w.x, w.y), {icon: L.divIcon({className: 'nxr red', html: '<i></i>', iconSize: [34, 34]}), keyboard: false, zIndexOffset: 880}).addTo(G.dp);
      mk.bindTooltip(deps.esc('Wpn TGT ' + (w.n + 1) + ' · ' + w.name), {direction: 'top', offset: [0, -14]});
      mk.bindPopup(() => wtPopup(w), {className: 'mpop', closeButton: false, autoPan: false, minWidth: 210}); WTM.push({w, mk});
    });
  }
  function wtPopup(w) {
    const d = document.createElement('div'); d.className = 'dtp';
    d.innerHTML = `<div><b>Wpn TGT ${w.n + 1}</b> · ${deps.esc(w.name)}</div><div class="hint">${fmtLL(...toLL(w.x, w.y))} · ${w.altFt} ft</div><div class="bar" style="margin:6px 0 0"><button class="btn g gn" data-a="tgt"${EDIT ? '' : ' disabled'} title="Keep this target as a TGT steerpoint (STPT 81-99)">＋ Add to TGT STPTs</button><button class="btn g rd" data-a="wdel"${EDIT ? '' : ' disabled'} title="Remove this weapon target from the DTC">− Remove</button></div><div class="err"></div>`;
    d.querySelector('[data-a=tgt]').onclick = () => {
      const P = deps.dtc.points(), slot = P ? freeSlot(P, 'prec') : -1, err = d.querySelector('.err');
      if (slot < 0) { err.textContent = 'There is no free TGT Steerpoint (STPT 81-99).'; return; }
      const nm = String(w.name).replace(/[\s,]+/g, ' ').trim().slice(0, 11) || 'Map STPT ' + (GROUPS.prec.first + slot);
      deps.dtc.set('prec', slot, {x: w.x, y: w.y, altFt: w.altFt, name: nm}); map.closePopup(); dtc(); toast('Added as STPT ' + (GROUPS.prec.first + slot) + '.');
    };
    d.querySelector('[data-a=wdel]').onclick = () => { if (!EDIT) return; deps.dtc.wtClear(w.n); map.closePopup(); dtc(); toast('Weapon target ' + (w.n + 1) + ' removed.'); };
    return ro(d);
  }
  // the attack worked out on the Weapons page (deps.attack(): lines per phase and marks as [lat, lon]); the Weapons page draws it itself while it has the map
  function attackDraw() {
    const A = !away && deps.attack && deps.attack(); if (!A) return; const L = window.L;
    A.segs.forEach(z => { const q = z.pts; L.polyline(q, {color: '#000', weight: 6, opacity: .35, interactive: false}).addTo(G.da); L.polyline(q, {color: z.color, weight: 3.5, dashArray: z.dash || null, interactive: false}).addTo(G.da); });
    A.marks.forEach(m => { const c = L.circleMarker(m.ll, {radius: m.r || 5, fillColor: m.color, fillOpacity: 1, color: '#111', weight: 2}).addTo(G.da); if (m.label) c.bindTooltip(deps.esc(m.label), {permanent: !!m.perm, direction: 'right', offset: [8, 0]}); });
  }
  function dtcRing(e) {
    const L = window.L, it = e.it, g = GROUPS[it.group]; if (e.ring) { G[g.layer].removeLayer(e.ring); e.ring = null; }
    if (it.group == 'ppt' && it.rngNm > 0.5) e.ring = L.circle(e.mk.getLatLng(), {radius: it.rngNm * 1852, color: dtcCol('ppt', it), weight: 1.4, fillColor: dtcCol('ppt', it), fillOpacity: (st.on.ringfill == null ? 8 : st.on.ringfill) / 100, interactive: false}).addTo(G[g.layer]);
  }
  function dtcMark(it) {
    if (it.group == 'prec') it.wt = WTK().some(w => wtKept(w, {prec: [it]}));
    const L = window.L, g = GROUPS[it.group], mk = L.marker(toLL(it.x, it.y), {icon: dtcIcon(it), draggable: EDIT, zIndexOffset: 700, keyboard: false}).addTo(G[g.layer]), e = {it, mk, ring: null};
    mk.bindTooltip(() => dtcTip(it), {direction: 'top', offset: [0, -8]});
    mk.bindPopup(() => ro(dtcPopup(e)), {className: 'mpop', closeButton: false, autoPan: false, offset: [0, -4], minWidth: 230});
    mk.on('drag', () => { const ll = mk.getLatLng(), [x, y] = fromLL(ll.lat, ll.lng); it.x = x; it.y = y; if (e.ring) e.ring.setLatLng(ll); if (it.group == 'line') dtcLinesDraw(); });
    mk.on('dragend', () => {
      const ll = mk.getLatLng(), [x, y] = fromLL(ll.lat, ll.lng);
      if (x < 0 || x > 1024 || y < 0 || y > 1024) { dtc(); toast('That is outside the theater.', true); return; }
      deps.dtc.set(it.group, it.slot, {x, y}); dtcInfo(); G.da.clearLayers(); attackDraw(); if (it.group == 'ppt') sams(deps.getC(), deps.getSel());
    });
    DT.push(e); dtcRing(e); return e;
  }
  function dtcLinesDraw() {
    const L = window.L; LNP.forEach(l => G.dl.removeLayer(l)); LNP = []; TLB.forEach(o => G.dl.removeLayer(o.mk)); TLB = [];
    dtcLines({line: DT.filter(e => e.it.group == 'line').map(e => e.it)}).forEach(run => {
      const tk = (PREF.tanks || []).find(t => run.pts.length > 1 && Math.hypot(t.x - run.pts[0].x, t.y - run.pts[0].y) < 0.05);
      if (tk) label(G.dl, run.pts.map(p => toLL(p.x, p.y)), `<b>${deps.esc(tk.cs)}</b>${tk.ac ? `<i>${deps.esc(tk.ac)}</i>` : ''}<i>${deps.esc(tk.t || '')}</i>`, 'tk clk', 0, TLB, () => { const C = deps.getC(), f = C && C.units.find(u => u.kind == 'flight' && u.wps && deps.flightInfo(u).cs == tk.cs); if (!f || !deps.selectFlight || deps.selectFlight(f) === false) toast('That flight cannot be selected.', true); });
      if (run.pts.length > 1) LNP.push(L.polyline(run.pts.map(p => toLL(p.x, p.y)), {color: dtcCol('line'), weight: 2, opacity: .9, interactive: false}).bindTooltip('LINE' + run.line, {permanent: true, direction: 'center', className: 'lnlab'}).addTo(G.dl));
    });
  }
  // pre-planned threat list of BMS (data/ppt.js): the ring range comes from the list (feet), the same value the game uses
  const pptIndex = n => PPT.findIndex(e => e[0].toLowerCase() == String(n).toLowerCase());
  const pptLabel = n => { const k = pptIndex(n); return k >= 0 ? PPT[k][2] : n; };
  const pptRng = e => e[1] > 1000 ? e[1] / FT_NM : 0;
  // the list entry (weapon systems only) that matches the name of a unit: the longest label found in it, or -1
  const lbl = t => String(t).toLowerCase().replace(/\s*\(.*\)/, '').trim();
  function pptForUnit(name) {
    const n = String(name).toLowerCase(); let best = -1, bl = 0;
    PPT.slice(0, 26).forEach((e, i) => { const l = lbl(e[2]); if (l.length > bl && n.includes(l)) { best = i; bl = l.length; } });
    return best;
  }
  function dtcPopup(e) {
    const it = e.it, g = GROUPS[it.group], w = document.createElement('div'), ll = toLL(it.x, it.y);
    w.className = 'dtp';
    const head = it.group == 'line' ? `<div><b>STPT ${it.stpt}</b> · LINE${lineOf(it.slot)}, point ${it.slot % LINE_LEN + 1} of ${LINE_LEN}</div>`
      : it.group == 'prec' ? `<label>STPT<input data-f="stpt" type="number" min="${g.first}" max="${g.first + g.n - 1}" step="1" value="${it.stpt}"></label>` : `<div><b>STPT ${it.stpt}</b> · ${g.label}</div>`;
    const cur = pptIndex(it.name), PL = deps.dtc.points(), l0 = (lineOf(it.slot) - 1) * LINE_LEN;
    const more = it.group == 'line' && PL && PL.line.slice(l0, l0 + LINE_LEN).filter(q => !q.empty).length < LINE_LEN && !PL.line.slice(it.slot + 1, l0 + LINE_LEN).some(q => !q.empty);   // the last point of an unfinished line
    const body = it.group == 'prec' ? `<label>Position<input data-f="pos" value="${fmtLL(ll[0], ll[1])}"></label><label>Altitude (ft)<input data-f="alt" type="number" value="${it.altFt}"></label>`
      : it.group == 'ppt' ? `<label>Threat<select data-f="type">${cur >= 0 ? '' : !it.name ? '<option value="" selected disabled>— choose a threat —</option>' : `<option value="" selected>${deps.esc(it.name)} (other)</option>`}${PPT.map((e, i) => `<option value="${i}"${i == cur ? ' selected' : ''}>${deps.esc(e[2])}</option>`).join('')}</select></label>` : '';
    w.innerHTML = head + body + '<div class="bar' + (it.group == 'line' ? ' bar3' : '') + '" style="margin:6px 0 0">' + (more ? '<button class="btn g gn" data-a="addn" title="Add the next point of this line">＋ Add point</button>' : '') + (it.group == 'line' ? '' : '<button class="btn g" data-a="conv" title="' + (it.group == 'ppt' ? 'Turn this pre-planned threat into a precision target (TGT Steerpoint) at the same place' : 'Turn this precision target into a pre-planned threat at the same place: pick its type afterwards') + '">' + (it.group == 'ppt' ? '⇄ TGT Steerpoint' : '⇄ Pre-planned STPT') + '</button>') + '<button class="btn g rd" data-a="del">' + (it.group == 'line' ? '− Delete point' : ICON.trash + ' Delete') + '</button>' + (it.group == 'line' ? '<button class="btn g rd" data-a="dline">' + ICON.trash + ' Delete line</button>' : '') + '</div><div class="hint err" style="color:#ff8a8a;min-height:0"></div>';
    const err = m => { w.querySelector('.err').textContent = m || ''; }, f = k => w.querySelector(`[data-f=${k}]`);
    const put = patch => { Object.assign(it, patch); deps.dtc.set(it.group, it.slot, patch); dtcInfo(); };
    if (f('stpt')) f('stpt').onchange = () => { if (!EDIT) return;   // move the point to another steerpoint number
      const n = Math.round(+f('stpt').value), slot = n - g.first, P = deps.dtc.points();
      if (!(n >= g.first && n < g.first + g.n)) return err('STPT must be ' + g.first + '-' + (g.first + g.n - 1) + '.');
      if (slot == it.slot) return err();
      if (P.prec.some(p => p.slot == slot && !p.empty)) return err('STPT ' + n + ' is already used.');
      const nm = /^Map STPT \d+$/.test(it.name) ? 'Map STPT ' + n : it.name;
      deps.dtc.set(it.group, slot, {x: it.x, y: it.y, altFt: it.altFt, name: nm}); deps.dtc.clear(it.group, it.slot); map.closePopup(); dtc();
      const z = DT.find(q => q.it.group == it.group && q.it.slot == slot); if (z) z.mk.openPopup();
    };
    if (f('alt')) f('alt').onchange = () => { if (!EDIT) return; const v = Math.round(+f('alt').value); if (isNaN(v)) return err('Altitude must be a number.'); err(); put({altFt: v}); };
    if (f('type')) f('type').onchange = () => { if (!EDIT) return;
      if (f('type').value === '') return; const en = PPT[+f('type').value];
      put({name: en[0], rngNm: pptRng(en)}); dtcRing(e); e.mk.setIcon(dtcIcon(it)); sams(deps.getC(), deps.getSel()); autoRefresh();
    };
    if (f('pos')) f('pos').onchange = () => { if (!EDIT) return;
      const c = parseLL(f('pos').value); if (!c) return err("Use N 37° 05.000'  E 127° 01.000' or 37.0833 127.0167");
      const [x, y] = fromLL(c[0], c[1]); if (x < 0 || x > 1024 || y < 0 || y > 1024) return err('That is outside the theater.');
      err(); e.mk.setLatLng(c); put({x, y}); dtcRing(e);
    };
    const cv = w.querySelector('[data-a=conv]'); if (cv) cv.onclick = () => {   // PPT <-> TGT: the point moves to a free slot of the other group (the DTC, the lists and the pages follow)
      const P = deps.dtc.points(), to = it.group == 'ppt' ? 'prec' : 'ppt', slot = P ? freeSlot(P, to) : -1;
      if (slot < 0) return err(it.group == 'ppt' ? 'There is no free TGT Steerpoint (STPT 81-99).' : 'There is no free pre-planned slot (STPT 56-80).');
      const nm = it.group == 'ppt' ? (String(pptLabel(it.name) || '').replace(/[\s,]+/g, ' ').trim().slice(0, 11) || 'Map STPT ' + (GROUPS.prec.first + slot)) : '';
      deps.dtc.set(to, slot, to == 'prec' ? {x: it.x, y: it.y, altFt: it.altFt, name: nm} : {x: it.x, y: it.y, altFt: 0, name: '', rngNm: 0});
      removePoint(deps.dtc.points(), it.group, it.slot, deps.dtc.set, deps.dtc.clear); map.closePopup(); dtc();
      const z = DT.find(q => q.it.group == to && q.it.slot == slot); if (z && to == 'ppt') z.mk.openPopup();
    };
    w.querySelector('[data-a=del]').onclick = () => { dtcDelete(it); map.closePopup(); };
    const an = w.querySelector('[data-a=addn]'); if (an) an.onclick = () => { map.closePopup(); addStart('line', lineOf(it.slot)); };
    const dl = w.querySelector('[data-a=dline]'); if (dl) dl.onclick = async () => {   // the whole line (its 6 rows)
      if (!await confirm('Delete all the steerpoints of LINE' + lineOf(it.slot) + '?')) return;
      const a = (lineOf(it.slot) - 1) * LINE_LEN; for (let i = a; i < a + LINE_LEN; i++) deps.dtc.clear('line', i); map.closePopup(); dtc();
    };
    return w;
  }
  // delete a point; in a line the following points move up so the line stays in one piece
  function dtcDelete(it) {
    const P = deps.dtc.points(); if (!P || !EDIT) return;
    removePoint(P, it.group, it.slot, deps.dtc.set, deps.dtc.clear); dtc();
  }
  // add mode: the next click on the map places the point in the next free slot
  let ADL = null;   // the highlight of the point the next click connects to, and the Done button beside it
  const addKey = e => { if (e.key == 'Escape') addStop(true); };
  // an element that goes away fades out first (its id is dropped at once so that a new one can take its place)
  const fadeOut = el => { if (!el) return; el.removeAttribute('id'); if (deps.anim && !deps.anim()) return el.remove(); const a = el.animate([{opacity: 1}, {opacity: 0}], {duration: 150, easing: 'ease-in'}); a.onfinish = a.oncancel = () => el.remove(); };
  function addStop(fade) { addM = null; rectClear(); if (ADL) { ADL.remove(); ADL = null; } host.classList.remove('adding'); const b = $('mpadd'); if (b) { if (fade === true) fadeOut(b); else b.remove(); } window.removeEventListener('keydown', addKey, true); }
  function addStart(g, line) {
    const P = deps.dtc && deps.dtc.points(); if (!P || !EDIT) return; addStop();
    const slot = freeSlot(P, g, line); if (slot < 0) return toast(g == 'line' ? 'LINE' + line + ' already has its 6 steerpoints.' : 'No free slot left for this kind of point.', true);
    addM = {g, slot, line}; host.classList.add('adding');
    const b = document.createElement('div'); b.id = 'mpadd'; b.className = 'mpp'; b.innerHTML = g == 'line' ? `LINE${line}: click on the map to add point ${slot % LINE_LEN + 1} of ${LINE_LEN} (STPT ${GROUPS[g].first + slot}); every click adds the next one <button class="btn g">Done</button>`
      : `Click on the map to place STPT ${GROUPS[g].first + slot} (${GROUPS[g].label}) <button class="btn g">Cancel</button>`;
    host.append(b); b.querySelector('button').onclick = () => addStop(true); window.addEventListener('keydown', addKey, true);
    const prev = g == 'line' && slot % LINE_LEN > 0 ? P.line[slot - 1] : null;
    if (prev && !prev.empty) {   // an unfinished line: the last point is highlighted and Done sits beside it
      const L = window.L, ll = toLL(prev.x, prev.y); ADL = L.layerGroup().addTo(map);
      L.marker(ll, {icon: L.divIcon({className: 'nxr', html: '<i></i>', iconSize: [34, 34]}), interactive: false, keyboard: false, zIndexOffset: 900}).addTo(ADL);
      const dm = L.marker(ll, {icon: L.divIcon({className: 'nxd', html: '<button class="btn g">Done</button>', iconSize: [0, 0]}), zIndexOffset: 950, keyboard: false}).addTo(ADL), de = dm.getElement();
      L.DomEvent.disableClickPropagation(de); de.querySelector('button').onclick = () => addStop(true);
      b.querySelector('button').remove();
    }
  }
  function addPlace(latlng) {
    if (addM.rect) return rectPlace(latlng);
    const {g, slot} = addM, [x, y] = fromLL(latlng.lat, latlng.lng); if (x < 0 || x > 1024 || y < 0 || y > 1024) return toast('That is outside the theater.', true);
    const d = g == 'prec' ? {name: 'Map STPT ' + (GROUPS[g].first + slot)} : {};
    deps.dtc.set(g, slot, Object.assign({x, y, altFt: 0}, d)); addStop();
    const k = GROUPS[g].layer; if (!st.on[k]) { st.on[k] = true; save(); const c = host.querySelector(`input[data-k=${k}]`); if (c) c.checked = true; }
    sync(); dtc();
    if (g == 'line') { // a line is drawn point after point: stay in add mode until it is full (Done / Esc to stop earlier)
      const line = lineOf(slot), P = deps.dtc.points(), nx = P ? freeSlot(P, 'line', line) : -1;
      if (nx >= 0) addStart('line', line); else toast('LINE' + line + ' is complete (6 steerpoints).');
      return;
    }
    const e = DT.find(z => z.it.group == g && z.it.slot == slot); if (e) e.mk.openPopup();
  }

  // Rectangle tool: a closed box (4 corners + the first again = 5 steerpoints) for a geo line. Click the map for its centre, scale it by dragging the corners, move it by
  // its centre handle, then write the corners (NW, NE, SE, SW, NW) into the first LINE that has 5 free steerpoints.
  let RC = null;
  function rectClear() { if (RC) { map.off('zoomend', RC.upd); RC.g.remove(); RC = null; } }
  function rectStart(pre) {
    const P = deps.dtc && deps.dtc.points(); if (!P) return; addStop();
    let line = 0, slot = -1;
    for (let n = 1; n <= 4 && !line; n++) { const k = freeSlot(P, 'line', n); if (pre && pre.whole ? k == (n - 1) * LINE_LEN : k >= 0 && LINE_LEN - k % LINE_LEN >= 5) { line = n; slot = k; } }
    if (!line) return toast(pre && pre.whole ? 'No empty LINE left: a tanker track needs a whole LINE for itself.' : 'No LINE has 5 free steerpoints left (a closed rectangle needs 5).', true);
    addM = {rect: true, line, slot}; host.classList.add('adding');
    const b = document.createElement('div'); b.id = 'mpadd'; b.className = 'mpp'; b.innerHTML = `Click on the map to place the closed rectangle for LINE${line} (5 steerpoints) <button class="btn g">Cancel</button>`;
    host.append(b); b.querySelector('button').onclick = addStop; window.addEventListener('keydown', addKey, true);
    if (pre && pre.c) rectPlace({lat: pre.c[0], lng: pre.c[1]}, pre);
  }
  function rectPlace(c, pre) {
    const L = window.L, {line, slot} = addM; addM = null; rectClear();
    const g = L.layerGroup().addTo(map), col = dtcCol('line'), rc = RC = {g, line, slot, c: [c.lat, c.lng], a: pre ? pre.a : 10 * NM, b: pre ? pre.b : 6 * NM, rot: pre ? pre.rot : 0, tank: pre && pre.tank};   // half sizes in metres, heading of its "up" side
    const kx = () => 111320 * Math.cos(rc.c[0] * Math.PI / 180), ky = 110574, R = () => rc.rot * Math.PI / 180;
    const toLLm = (lx, ly) => { const r = R(); return [rc.c[0] + (-lx * Math.sin(r) + ly * Math.cos(r)) / ky, rc.c[1] + (lx * Math.cos(r) + ly * Math.sin(r)) / kx()]; };
    const toLoc = ll => { const dx = (ll.lng - rc.c[1]) * kx(), dy = (ll.lat - rc.c[0]) * ky, r = R(); return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)]; };
    const corners = () => [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([u, v]) => toLLm(u * rc.a, v * rc.b));   // NW, NE, SE, SW (before turning)
    const rotPos = k => {   // a turning handle (k = 1 top side, -1 opposite side): 15 px outside the middle of the side
      const t = map.latLngToContainerPoint(toLLm(0, k * rc.b)), o = map.latLngToContainerPoint(rc.c), d = Math.hypot(t.x - o.x, t.y - o.y) || 1;
      return map.containerPointToLatLng([t.x + (t.x - o.x) / d * 15, t.y + (t.y - o.y) / d * 15]);
    };
    rc.poly = L.polygon(corners(), {color: col, weight: 2, dashArray: '6 4', fillColor: col, fillOpacity: .08, interactive: false}).addTo(g);
    rc.lead = L.polyline([toLLm(0, rc.b), rotPos(1)], {color: col, weight: 1.5, interactive: false}).addTo(g);
    rc.lead2 = L.polyline([toLLm(0, -rc.b), rotPos(-1)], {color: col, weight: 1.5, interactive: false}).addTo(g);
    const mkH = (cls, size) => L.divIcon({className: 'rch ' + cls, html: '<i></i>', iconSize: [size, size]});
    const btnPos = () => {   // the Create / Cancel buttons hang under the lowest point of the box and its handles
      const pts = corners().concat([rotPos(1), rotPos(-1)]); return [Math.min(...pts.map(p => p instanceof Array ? p[0] : p.lat)), rc.c[1]];
    };
    const heading = () => { if (rc.rm) rc.rm.setTooltipContent(String(Math.round((rc.rot % 360 + 360) % 360)).padStart(3, '0') + '°'); };
    const upd = skip => {
      rc.poly.setLatLngs(corners()); const cs = corners(); rc.hs.forEach((h, i) => { if (skip !== h) h.setLatLng(cs[i]); });
      if (skip !== rc.cm) rc.cm.setLatLng(rc.c); const rp = rotPos(1), rq = rotPos(-1); if (skip !== rc.rm) rc.rm.setLatLng(rp); if (skip !== rc.rm2) rc.rm2.setLatLng(rq);
      rc.lead.setLatLngs([toLLm(0, rc.b), rp]); rc.lead2.setLatLngs([toLLm(0, -rc.b), rq]); rc.bm.setLatLng(btnPos()); heading();
    };
    rc.upd = () => upd();
    rc.hs = corners().map((p, i) => {
      const h = L.marker(p, {icon: mkH('', 14), draggable: true, zIndexOffset: 900, keyboard: false}).addTo(g); let opp = null;
      h.on('dragstart', () => { opp = corners()[(i + 2) % 4]; });
      h.on('drag', e => {   // the opposite corner stays: new size and centre from the two corners, in the turned frame
        const ll = e.target.getLatLng(), mid = {lat: (ll.lat + opp[0]) / 2, lng: (ll.lng + opp[1]) / 2}, [lx, ly] = toLoc({lat: ll.lat, lng: ll.lng}), [ox, oy] = toLoc({lat: opp[0], lng: opp[1]});
        rc.a = Math.max(0.25 * NM, Math.abs(lx - ox) / 2); rc.b = Math.max(0.25 * NM, Math.abs(ly - oy) / 2); rc.c = [mid.lat, mid.lng]; upd(h);
      });
      return h;
    });
    rc.cm = L.marker(rc.c, {icon: mkH('c', 18), draggable: true, zIndexOffset: 900, keyboard: false}).addTo(g).on('drag', e => { const ll = e.target.getLatLng(); rc.c = [ll.lat, ll.lng]; upd(rc.cm); });
    const turn = (h, k) => h.on('drag', e => {   // either round handle turns the box: the heading is that of the handle seen from the middle (+ 180 for the opposite one)
      const ll = e.target.getLatLng(), dx = (ll.lng - rc.c[1]) * kx(), dy = (ll.lat - rc.c[0]) * ky; rc.rot = Math.atan2(dx, dy) * 180 / Math.PI + (k < 0 ? 180 : 0); upd(h);
    });
    rc.rm = turn(L.marker(rotPos(1), {icon: mkH('r', 16), draggable: true, zIndexOffset: 900, keyboard: false}).addTo(g), 1);
    rc.rm2 = turn(L.marker(rotPos(-1), {icon: mkH('r', 16), draggable: true, zIndexOffset: 900, keyboard: false}).addTo(g), -1);
    rc.rm.bindTooltip('000°', {permanent: true, direction: 'right', offset: [8, 0], className: 'rtip'});
    map.on('zoomend', rc.upd);
    const ban = $('mpadd'); if (ban) ban.style.display = 'none';   // the buttons are next to the rectangle, not in the banner
    rc.bm = L.marker(btnPos(), {icon: L.divIcon({className: 'rcb', html: `<div class="rcbi"><span>LINE${line}</span><button class="btn" data-a="ok">Place</button><button class="btn g" data-a="no">Cancel</button></div>`, iconSize: [0, 0]}), zIndexOffset: 950, keyboard: false}).addTo(g);
    const b = rc.bm.getElement(); L.DomEvent.disableClickPropagation(b); L.DomEvent.disableScrollPropagation(b);
    b.querySelector('[data-a=no]').onclick = addStop;
    if (pre) map.fitBounds(rc.poly.getBounds().pad(0.7));   // a rectangle laid on something (tanker track): show it
    b.querySelector('[data-a=ok]').onclick = () => {
      const cs = corners(), pts = cs.concat([cs[0]]).map(p => fromLL(p[0], p[1]));   // NW, NE, SE, SW and NW again: the box is closed
      if (pts.some(([x, y]) => x < 0 || x > 1024 || y < 0 || y > 1024)) return toast('The rectangle reaches outside the theater.', true);
      pts.forEach(([x, y], i) => deps.dtc.set('line', slot + i, {x, y, altFt: 0}));
      if (rc.tank) { PREF.tanks = (PREF.tanks || []).filter(t => Math.hypot(t.x - pts[0][0], t.y - pts[0][1]) > 0.05).concat([{x: pts[0][0], y: pts[0][1], cs: rc.tank.cs, t: rc.tank.t}]); persist(); }   // the line keeps its tanker label
      addStop(); if (!st.on.dl) { st.on.dl = true; save(); const k = host.querySelector('input[data-k=dl]'); if (k) k.checked = true; }
      sync(); dtc(); toast('LINE' + line + ': closed rectangle, 5 steerpoints (STPT ' + (GROUPS.line.first + slot) + '-' + (GROUPS.line.first + slot + 4) + ') added to the DTC.');
    };
  }

  // ---- screenshot for the datacard -------------------------------------------------------------
  let H2C = null;
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return H2C || (H2C = new Promise((res, rej) => {
      const e = document.createElement('script'); e.src = './vendor/html2canvas/html2canvas.min.js';
      e.onload = () => res(window.html2canvas); e.onerror = () => { H2C = null; rej(new Error('The screenshot module could not be loaded')); }; document.head.append(e);
    }));
  }
  let toastT = 0;
  // a warning stays until it is closed
  // notices: informational ones sit at the bottom of the map, danger ones (a refusal and its reason) are red in the middle; both fade by themselves
  let toastA = null;
  function toast(msg, warn) {
    const t = $('mptoast'); if (!t) return; clearTimeout(toastT); if (toastA) { toastA.cancel(); toastA = null; } t.textContent = msg; t.classList.toggle('warn', !!warn); t.style.display = '';
    toastT = setTimeout(() => { if (deps.anim && !deps.anim()) { t.style.display = 'none'; return; } const a = toastA = t.animate([{opacity: 1}, {opacity: 0}], {duration: 220, easing: 'ease-in'}); a.onfinish = () => { t.style.display = 'none'; toastA = null; }; }, warn ? 7500 : 5000);
  }
  function shotBtn() { const s = $('mpshots'); if (s) s.style.display = shotOn ? 'none' : ''; }
  // the frame shows the area that will be saved, with the shape of the free space on the datacard
  function sizeFrame() {
    const fr = $('mpfr'); if (!fr) return; const fi = $('mpfi');
    const W = host.clientWidth, H = host.clientHeight, ar = SHOTS[shotK].w / SHOTS[shotK].h, a = shotAng * Math.PI / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
    // the size does not depend on the angle (the turned frame always fits the map: its diagonal fits), so turning it only changes the transform: smooth
    let h = Math.max(120, H - 150), w = h * ar;
    const diag = Math.hypot(w, h), k = Math.min(1, (W - 60) / diag, (H - 150) / diag);
    w = Math.max(60, w * k); h = Math.max(60 / ar, h * k);
    const BW = w * c + h * sn, BH = w * sn + h * c;
    fr.style.width = Math.round(BW) + 'px'; fr.style.height = Math.round(BH) + 'px'; fr.style.left = Math.round((W - BW) / 2) + 'px'; fr.style.top = Math.round((H - BH) / 2 - 20) + 'px';
    fi.style.width = w + 'px'; fi.style.height = h + 'px'; fi.style.left = ((BW - w) / 2) + 'px'; fi.style.top = ((BH - h) / 2) + 'px'; fi.style.transform = `rotate(${shotAng}deg)`;
  }
  let shotAng = 0;   // the frame is turned by this angle (degrees, clockwise): the picture is straightened into the card
  const onKey = e => { if (e.key == 'Escape') shotStop(); };
  let ZO = null;
  function shotStart(k) {
    if (!map || shotOn) return; shotOn = true; shotAng = 0; shotK = k || 'dc'; host.classList.add('shoting'); map.closePopup(); if (addM) addStop(true);
    const fr = document.createElement('div'); fr.id = 'mpfr';
    fr.innerHTML = '<div id="mpfi"></div><div id="mpfb"><button class="btn" id="mpcap">Capture</button><label class="hint" style="margin:0;display:flex;align-items:center;gap:6px" title="Turn the frame: the map inside it is straightened into the picture">Angle <input type="range" id="mpang" min="0" max="359" step="1" value="0" style="width:130px"><b id="mpangv" style="min-width:34px;text-align:right">0°</b></label><button class="btn g" id="mprot" title="Turn the frame by another quarter">+90°</button><button class="btn g" id="mpcan">Cancel</button></div>';
    host.append(fr); sizeFrame(); shotBtn();
    ZO = {snap: map.options.zoomSnap, wheel: map.options.wheelPxPerZoomLevel}; map.options.zoomSnap = 0.05; map.options.wheelPxPerZoomLevel = 240;   // finer, less sensitive wheel zoom while framing
    $('mpcan').onclick = shotStop; $('mpcap').onclick = shotTake; const setAng = v => { shotAng = ((Math.round(v) % 360) + 360) % 360; $('mpang').value = shotAng; $('mpangv').textContent = shotAng + '°'; sizeFrame(); };
    let angRaf = 0; $('mpang').oninput = () => { if (angRaf) return; angRaf = requestAnimationFrame(() => { angRaf = 0; setAng(+$('mpang').value); }); }; $('mprot').onclick = () => setAng(shotAng + 90);
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', sizeFrame);
  }
  function shotStop() {
    shotOn = false; host.classList.remove('shoting'); if (ZO) { map.options.zoomSnap = ZO.snap; map.options.wheelPxPerZoomLevel = ZO.wheel; ZO = null; } const fr = $('mpfr'); if (fr) fadeOut(fr); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', sizeFrame); shotBtn();
  }
  const tainted = c => { try { c.getContext('2d').getImageData(0, 0, 1, 1); return false; } catch (e) { return true; } };
  async function shotTake() {
    const fr = $('mpfr'), cap = $('mpcap'); if (!fr || cap.disabled) return;
    cap.disabled = true; cap.textContent = 'Capturing…';
    try {
      const h2c = await loadH2C(), mp = $('mpmap'), fb = fr.getBoundingClientRect(), mb = mp.getBoundingClientRect(), fw = fb.width, fh = fb.height, cw = parseFloat($('mpfi').style.width);   // fb: the box around the turned frame, cw: the width of the frame itself
      const run = () => h2c(mp, {x: fb.left - mb.left, y: fb.top - mb.top, width: fw, height: fh, scale: SHOTS[shotK].out / cw, useCORS: true, logging: false, backgroundColor: st.base == 'coast' ? (st.cl ? COAST.light : COAST.dark).sea : '#000',
        ignoreElements: e => e.classList && e.classList.contains('leaflet-control-zoom'),
        onclone: doc => { // SVG symbols take their colours from the page style sheet: copy them into the SVG so they survive the conversion
          const w = doc.defaultView, props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight'];
          doc.querySelectorAll('#mpmap svg *').forEach(e => { const cs = w.getComputedStyle(e); props.forEach(p => e.style.setProperty(p, cs.getPropertyValue(p))); });
        }});
      const to = shotK == 'kb' ? 'the kneeboard cards' : 'the datacard (page 2, bottom left)';
      let c, warn = '';
      // html2canvas leaves a picture it cannot read (cross-origin) blank without any error, so it is checked first
      if (OV && OV._url && tainted(OV._url)) c = null; else { c = await run(); if (tainted(c)) c = null; }
      if (!c) { // the base picture cannot be exported: take the shot again without it
        // the coastlines map (light or dark, as the flight-plan colours) takes the place of the base map
        const base = OV || TL, lt = pal !== PAL.dark, cg = lt ? G.coastL : G.coastD, bg = (lt ? COAST.light : COAST.dark).sea, ob = mp.style.background;
        if (base) map.removeLayer(base); cg.addTo(map); mp.style.background = bg;
        try { c = await run(); } finally { map.removeLayer(cg); mp.style.background = ob; if (base) { base.addTo(map); base.bringToBack(); } }
        if (tainted(c)) throw new Error('the map contains an image that cannot be exported.');
        warn = 'WARNING: the base map is not in the screenshot (its server does not allow copying, a browser security rule): the offline coastlines map was used instead. To include it, import the picture: Base map → Imported map picture.';
      }
      if (shotAng && c) {   // straighten: turn the picture back by the angle of the frame and keep the middle, of the proportions of the card
        const ow = SHOTS[shotK].out, oh = Math.round(ow * SHOTS[shotK].h / SHOTS[shotK].w), r = document.createElement('canvas'); r.width = ow; r.height = oh; const q = r.getContext('2d');
        q.fillStyle = '#000'; q.fillRect(0, 0, ow, oh); q.imageSmoothingQuality = 'high'; q.translate(ow / 2, oh / 2); q.rotate(-shotAng * Math.PI / 180); q.drawImage(c, -c.width / 2, -c.height / 2); c = r;
      }
      deps.setShot(c, shotK); shotStop(); toast(warn ? warn + ' The screenshot was added to ' + to + '.' : 'Screenshot added to ' + to + '.', !!warn);
    } catch (e) { cap.disabled = false; cap.textContent = 'Capture'; toast('Screenshot failed: ' + (e && e.message || e), true); }
  }

  // redraw the data layers for the campaign / selected flight / faction
  // RADAR COVERAGE at 5,000 ft (approximate): the spotted radars (ground / naval units with a long detection range) with the terrain hiding what is below the line of
  // sight (radarcov.js). Heights come from the HeightMap.raw of the BMS folder (deps.elev); without it only the radar horizon limits the range.
  const RC_ALT = 5000;
  let RCK = '', RCBUSY = false, RCNOTE = false;
  async function radarCov() {
    if (!map || !G.rc) return;
    const C = deps.getC(), key = !st.on.rc || !C ? '' : (C.name || '') + '|' + UL.length + '|' + (curView == null ? '' : curView) + '|' + (pal === PAL.dark ? 'd' : 'l');
    if (key === RCK && key !== '' || (key === '' && !RCK)) return;
    if (!key) { RCK = ''; G.rc.clearLayers(); return; }
    if (RCBUSY) return; RCBUSY = true; RCK = key;
    try {
      const radars = radarUnits(UL), L = window.L, H = new Map(), view = deps.getView();
      // fixed radar stations: their radar features that are not destroyed (state of the campaign); the owner of an untouched station is not in the campaign file: neutral colour
      try {
        const td = deps.objects && deps.objects.radars ? await deps.objects.radars() : [];
        td.forEach(({o, feats}) => {
          const fs = C.objFeat ? C.objFeat.get(o.id) : null, ow = airbaseOwner(C, o.id), side = ow == null || ow == 0 ? 'n' : (ow == view || allyOf(C, ow, view)) ? 'a' : 'f', seen = new Set();
          feats.forEach(f => { if (fs && fs[f.k] !== undefined && featState(fs[f.k]) == 2) return; const x = f.e / FT_KM, y = f.n / FT_KM, kk = Math.round(x) + ',' + Math.round(y); if (seen.has(kk)) return; seen.add(kk); radars.push({x, y, rng: f.det, side, name: o.name}); });
        });
      } catch (e) { /* no BMS folder: only the radars of the units */ }
      if (deps.elev && radars.length) {
        const cells = neededCells(radars), pts = cells.map(([i, j]) => ({e: i * CELL_KM * 3280.84, n: j * CELL_KM * 3280.84}));
        let hs = null; try { hs = await deps.elev(pts); } catch (e) { hs = null; }
        if (hs) cells.forEach(([i, j], k) => H.set(i + ',' + j, hs[k] || 0));
        else if (!RCNOTE) { RCNOTE = true; toast('Radar coverage: terrain heights need the BMS install folder (desktop app, Settings); only the radar horizon is used.', true); }
      }
      if (RCK !== key) return;
      G.rc.clearLayers();
      radars.forEach(r => {
        const poly = coverage(r, (i, j) => H.get(i + ',' + j) || 0, RC_ALT).map(p => toLL(p[0], p[1])), c = r.side == 'n' ? '#9aa4b2' : r.ally || r.side == 'a' ? pal.sam.ally.c : pal.sam.foe.c;
        L.polygon(poly, {color: c, weight: 1, opacity: .7, fillColor: c, fillOpacity: .12, className: 'rcov', interactive: false}).addTo(G.rc);
      });
    } catch (e) { RCK = ''; } finally { RCBUSY = false; if (st.on.rc && RCK !== key) radarCov(); }
  }
  function refresh() {
    if (!map) return;
    const C = deps.getC(), f = deps.getSel(), L = window.L, view = deps.getView();
    ['ab', 'nav'].forEach(k => G[k].clearLayers());
    const D = C ? C.D : deps.D;
    // airbases are white; only the one the selected flight takes off from (same rule as the ATO "Airport" filter: nearest base to the first
    // steerpoint) is coloured, by the faction of the flight: the viewed team, its allies or an enemy
    const w0 = C && f && f.wps && f.wps[0], home = w0 ? nearAb(C, w0.x, w0.y) : null, hs = !f ? 'unknown' : f.owner == view ? 'own' : allyOf(C, f.owner, view) ? 'ally' : 'enemy';
    mapAirbases(D).filter(a => a.kind != 'ship').forEach(a => {
      const nav = a.kind == 'nav', ic = placeIcon(a.kind, a.sub, nav ? null : pal === PAL.game ? '#000000' : AB_COL[home && home[0] == a.id ? hs : 'unknown']);
      L.marker(a.ll, {icon: L.divIcon({className: 'ico', html: ic.html + '<i class="nm">' + deps.esc(a.name) + '</i>', iconSize: [ic.w, ic.h]}), keyboard: false, zIndexOffset: nav ? -200 : -100}).bindTooltip(deps.esc(a.name), {direction: 'top', offset: [0, -8]}).addTo(nav ? G.nav : G.ab);
    });
    if (curC !== C || curView !== view) { curC = C; curView = view; units(C, view); bull(C); OBK = ''; }
    radarCov();
    sams(C, f); plan(C, f); flights(C, view, f); dtc(); curSel = f; sync(); shotBtn(); samRows();
    const t = $('mptm'); t.textContent = C && C.now != null ? clock(C.now).split(' · ')[1] : ''; t.style.display = '';
  }
  return {
    units: () => UL,   // for the tests
    // called when the page becomes visible
    async show() {
      detach();
      if (!map) { try { await init(); } catch (e) { host.innerHTML = '<p class="hint">The map could not be loaded: ' + deps.esc(e.message) + '</p>'; return; } }
      map.invalidateSize(); refresh();
    },
    dtcItems: () => DT.map(e => ({stpt: e.it.stpt, name: e.it.name, group: e.it.group})), refresh, fromLL, refreshDtc: () => { if (map) { dtc(); sync(); } }, refreshDtcButtons: () => { if (map) dtcInfo(); }, autoPptSlots: () => { const P = deps.dtc && deps.dtc.points(), o = new Set(); if (P && AU.ppt) AU.ppt.forEach(z => { const q = P.ppt[z.slot]; if (q && !q.empty && Math.hypot(q.x - z.x, q.y - z.y) < 3) o.add(z.slot); }); return o; },
    lineNotes: () => { const P = deps.dtc && deps.dtc.points(), o = {}; if (!P) return o; Object.entries(AU).forEach(([k, r]) => { if (k != 'ppt' && auLine(P, r)) o[r.line] = k == 'bull' ? 'Bullseye line (AUTO)' : k == 'front' ? 'Front line (AUTO)' : k.startsWith('tk:') ? 'Tanker ' + k.slice(3) : k; }); dtcLines({line: P.line.filter(p => !p.empty)}).forEach(run => { const tk = (PREF.tanks || []).find(t => run.pts.length > 1 && Math.hypot(t.x - run.pts[0].x, t.y - run.pts[0].y) < 0.05); if (tk && !o[run.line]) o[run.line] = 'Tanker ' + tk.cs; }); return o; }, shotStart, shotTake, shotStop, toLL, fmtLL, isReady: () => !!map, get leaflet() { return map; }, state: () => st,
    // number of objects drawn in a layer (0 when the layer is off); picture overlay (for tests)
    count: k => map && G[k] && map.hasLayer(G[k]) ? G[k].getLayers().length : 0,
    overlay: () => OV,
    // the picture now shown as the base of the map page, as {canvas, bounds: [[south, west], [north, east]]} (null when there is none): used by the Weapons page as a background
    // the Weapons page borrows the Leaflet map (with the layer and flight plan chosen here) and gives it back with detach()
    async attach(el) {
      if (!map) { try { await init(); } catch (e) { return null; } }
      const c = map.getContainer(); if (!home) home = c.parentNode;
      el.appendChild(c); away = el; setEdit(false); map.invalidateSize(); refresh();
      return {L: window.L, map};
    },
    // the labels of the tanker tracks are kept with the mission (they belong to the DTC lines drawn from the tanker list)
    tanks: () => (PREF.tanks || []).slice(),
    setTanks: a => { PENDTK = a; if (map) { mergeTanks(); dtc(); sync(); } },
    detach: () => detach(), toggleEdit: () => setEdit(!EDIT), isEdit: () => EDIT, cyclePlan, planMode: () => PLANMODE,
    // the Settings changed the satellite provider: the layer (and its name in the menu) is made again
    // another theater was chosen: the pictures are placed again, the view goes to the theater, the base map is checked
    theaterChanged: () => { OVC = {imgBlob: OVC.imgBlob}; PREF.view = null; if (!map) return; try { baseMenu(); } catch (e) { /* menu not drawn yet */ } map.fitBounds(theaterBounds()); setBase(); refresh(); },
    rebase: () => { if (!map) return; try { baseMenu(); } catch (e) { /* menu not drawn yet */ } if (st.base == 'sat') setBase(); },
    underlay: () => { const c = OV && OV._url; if (!c || !c.getContext || !OV.getBounds) return null; const b = OV.getBounds(); return {canvas: c, bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]}; }
  };
}
