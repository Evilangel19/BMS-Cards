import { createWeatherPage } from '../core/weatherpage.js';
import { join as joinPath, listDir, readBytes, isDesktop, pickFile } from '../platform/desktop.js';
import { CAM } from '../core/cam-core.js';
import { toLL as mToLL, fromLL as mFromLL, theaterBounds as mBounds } from '../core/mapdata.js';
import { parseLink16 } from '../parsers/link16.js';
import { parseIff } from '../parsers/iff.js';
import { parseTwx } from '../parsers/twx.js';
import { ST } from './state.js';
import { $, esc, jp, rememberLast } from './base.js';
import { F, FD, MIR, pushOne } from './datacard.js';
import { perfFill } from './perf.js';
import { lines } from './dtcfile.js';
import { mapV } from './pages.js';
import { apply, discardOk, loadCam, manClear } from './selection.js';
import { atoSearch } from './ato.js';
import { msfLoad } from './mission.js';

/* Campaign list: every .cam in the BMS Campaign folder; selecting one also loads its weather (.fmap), Link16, IFF and date (.twx) files. */
export const dtcDir = () =>
  ST.CFG.paths.dtc || (ST.CFG.paths.bmsInstall ? joinPath(joinPath(ST.CFG.paths.bmsInstall, 'User'), 'Config') : '');
ST.THEATERS = [];
ST.TH = null;
ST.THGEO = null;
ST.GEOKEY = 'k';
ST.GEOWARN = '';
ST.D_BASE = null;
export let WXS;
export const WXDIR = { files: null };
export const wxKey = ms => {
  const t = Math.floor(ms / 1000);
  return (Math.floor(t / 86400) + 1) * 10000 + Math.floor((t % 86400) / 3600) * 100;
};
export const wxAt = ms => (ms != null && WXS.get(wxKey(ms))) || ST.WX;
// wind aloft at a position (km), time and altitude (ft): the layer nearest to the altitude, from the map of that hour
export const wxWind = (x, y, t, a) => {
  const w = wxAt(t);
  return w && w.wind ? w.wind(x, y, a) : null;
};
export const wxKeys = f => {
  const ts = [];
  ((f && f.wps) || []).forEach(p => {
    if (p.arr) ts.push(p.arr);
    if (p.dep) ts.push(p.dep);
  });
  if (!ts.length) return [];
  const a = Math.min(...ts),
    b = Math.max(...ts),
    o = [];
  for (let t = Math.floor(a / 3600000) * 3600000; t <= b; t += 3600000) o.push(wxKey(t));
  return o;
};
export async function wxList() {
  const c = [];
  try {
    const cd = campDir();
    if (cd) c.push(jp(cd, 'WeatherMapsUpdates'));
    const bi = ST.CFG.paths.bmsInstall;
    if (bi) c.push(jp(bi, 'Data', 'Campaign', 'WeatherMapsUpdates'));
  } catch (e) {}
  for (const d of c) {
    try {
      const es = await listDir(d),
        m = {};
      es.forEach(e => {
        const x = /^(\d+)\.fmap$/i.exec(e.name);
        if (!e.isDirectory && x) m[+x[1]] = joinPath(d, e.name);
      });
      if (Object.keys(m).length) return m;
    } catch (e) {}
  }
  return {};
}
export async function wxLoadKeys(keys) {
  if (!WXDIR.files) WXDIR.files = await wxList();
  let n = 0;
  for (const k of keys) {
    if (WXS.has(k) || !WXDIR.files[k]) continue;
    try {
      WXS.set(k, CAM.parseFmap(new Uint8Array(await readBytes(WXDIR.files[k]))));
      n++;
    } catch (e) {}
  }
  return n;
}
export const landMs = f => {
  const w = ((f && f.wps) || []).find((p, i) => i > 0 && p.act == 7);
  return w ? w.arr : null;
};
// ATIS, TAF and runways from the weather map of the right hour (the campaign map is the fallback); set(k,v) writes the field
export function wxApply(i, set) {
  const f = ST.CL[i] && ST.CL[i].f;
  if (!f || !(ST.WX || WXS.size)) return;
  const d = F.__dep,
    ta = (f.wps.find(p => ![0, 1, 2, 3, 4, 7, 8].includes(p.act)) || {}).arr,
    wt = wxAt(ta);
  const taf = wt ? CAM.tafText(ST.C, wt, f) : '';
  set('__taf', taf);
  const wd = wxAt(d && d[3]);
  if (wd && d) set('atis', CAM.atisText(wd, d, F.ab0_4) + (taf ? '\n' + taf : ''));
  (F.__ab || []).forEach((o, j) => {
    if (!o) return;
    const w = wxAt(j == 0 && d ? d[3] : landMs(f)),
      r = w && CAM.pickRwy(w, o);
    if (r) {
      set('ab' + j + '_5', r.nr);
      set('ab' + j + '_6', r.ils);
    }
  });
}
export async function wxPrep(i) {
  const f = ST.CL[i] && ST.CL[i].f;
  if (!f || !ST.C || ST.NOPERF) return;
  const k = ST.CURK;
  let n = 0;
  try {
    n = await wxLoadKeys(wxKeys(f));
  } catch (e) {}
  if (!n || ST.CURK !== k || !ST.CL[i] || ST.CL[i].f !== f || !ST.AUTO) return;
  wxApply(i, (key, v) => {
    if (ST.MANK.has(key)) return;
    F[key] = v;
    ST.AUTO[key] = v;
    const e = FD.find(z => z.k == key);
    if (e && e.el) e.el.value = v;
    if (MIR[key] && ST.DCS[MIR[key].grp] && lines.length) pushOne(key);
  });
  perfFill(i);
  wxPage.render();
}
// Weather page: the selected flight (route, hours of the maps, airbases with ATIS, target forecast) and the buttons of the datacard
export function wxFlight() {
  const i = +$('fsel').value || 0,
    x = ST.C && ST.CL[i];
  if (!x || !x.f || !x.f.wps || !x.f.wps.length) return null;
  const f = x.f,
    d = F.__dep,
    B = [0, 1, 2, 3, 4, 7, 8],
    ta = (f.wps.find(p => !B.includes(p.act)) || {}).arr,
    land = landMs(f);
  const hours = wxKeys(f)
      .filter(k => WXS.has(k))
      .map(k => ((Math.floor(k / 10000) - 1) * 24 + Math.floor((k % 10000) / 100)) * 3600000),
    end = f.wps.findIndex((p, j) => j > 0 && p.act == 7),
    w2 = end > 0 ? f.wps.slice(0, end + 1) : f.wps;
  const bases = [];
  (F.__ab || []).forEach((o, j) => {
    if (!o) return;
    const ms = j == 0 && d ? d[3] : land,
      Wb = wxAt(ms),
      id = (o[1].match(/\((\w+)\)/) || [])[1] || o[1],
      elev = +F['ab' + j + '_4'] || 0;
    bases.push({
      role: ['DEP', 'ARR', 'ALTN'][j],
      name: o[1],
      x: o[2],
      y: o[3],
      ms,
      elev,
      rwy: F['ab' + j + '_5'],
      ils: F['ab' + j + '_6'],
      atis: Wb && ms != null ? CAM.atisText(Wb, [id, o[2], o[3], ms], elev) : '',
    });
  });
  const wt = wxAt(ta);
  return {
    title: x.label,
    wps: f.wps,
    labels: f.wps.map((_, k) => F['fp' + k + '_0'] || ''),
    alt: Math.max(0, ...w2.map(p => p.z * 10)),
    dep: d ? d[3] : f.wps[0].dep || f.wps[0].arr,
    tot: ta || null,
    land,
    hours,
    bases,
    taf: wt ? CAM.tafText(ST.C, wt, f) : '',
  };
}
// force: write ATIS, TAF and runways again, also over what was typed by hand; fillState tells whether the datacard already holds them
export function wxFill() {
  const i = +$('fsel').value || 0;
  wxApply(i, (key, v) => {
    ST.MANK.delete(key);
    F[key] = v;
    if (ST.AUTO) ST.AUTO[key] = v;
    const e = FD.find(z => z.k == key);
    if (e && e.el) e.el.value = v;
    if (MIR[key] && ST.DCS[MIR[key].grp] && lines.length) pushOne(key);
  });
  perfFill(i);
}
export function wxFillState() {
  const i = +$('fsel').value || 0;
  let diff = false;
  try {
    wxApply(i, (key, v) => {
      if (String(F[key] == null ? '' : F[key]) !== String(v == null ? '' : v)) diff = true;
    });
  } catch (e) {}
  return { diff };
}
export let wxPage;
export const campDir = () =>
  ST.CFG.paths.campaigns ||
  (ST.CFG.paths.bmsInstall ? jp(ST.CFG.paths.bmsInstall, 'Data', ST.TH ? ST.TH.campaign : 'Campaign') : '');
// the campaign menu (.cam) and the Tactical Engagement menu (.tac) are separate; choosing in one clears the other
export const setSel = n => {
  const te = /\.tac$/i.test(n || '');
  $('csel').value = te ? '' : n || '';
  $('tesel').value = te ? n : '';
  $('csel').classList.toggle('dimsel', !!n && te);
  $('tesel').classList.toggle('dimsel', !!n && !te);
}; // the menu not in use is darkened
export async function fillCampaigns() {
  const sel = $('csel'),
    tsel = $('tesel'),
    d = campDir();
  if (!isDesktop() || !d) {
    sel.innerHTML = '<option value="">— set the BMS folder in Settings, or use Open ▾ › Campaign —</option>';
    tsel.innerHTML = '<option value="">— select a tactical engagement —</option>';
    return;
  }
  const all = (await listDir(d)).filter(e => !e.isDirectory),
    srt = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }),
    opt = (n, rx) => `<option value="${esc(n)}">${esc(n.replace(rx, ''))}</option>`;
  const names = all
      .filter(e => /\.cam$/i.test(e.name) && !/^instant/i.test(e.name) && !/^save\d+\.cam$/i.test(e.name))
      .map(e => e.name)
      .sort(srt),
    tacs = all
      .filter(e => /\.tac$/i.test(e.name))
      .map(e => e.name)
      .sort(srt);
  sel.innerHTML = '<option value="">— select a campaign —</option>' + names.map(n => opt(n, /\.cam$/i)).join('');
  if (!names.length)
    sel.innerHTML = '<option value="">— no campaigns found in ' + d.replace(/</g, '&lt;') + ' —</option>';
  tsel.innerHTML =
    '<option value="">— select a tactical engagement —</option>' + tacs.map(n => opt(n, /\.tac$/i)).join('');
  if (!tacs.length) tsel.innerHTML = '<option value="">— no tactical engagements found —</option>';
}
// the last choice wins: the arrow keys on the menu choose one campaign after the other, and a slow file of a campaign left behind must not end up over the one chosen last
let CAMGEN = 0;
// a campaign or a mission opened another way (Open menu): a choice of the menu still loading is dropped
export const campCancel = () => ++CAMGEN;
export async function selectCampaign(name) {
  const gen = ++CAMGEN,
    stale = () => gen !== CAMGEN;
  if (ST.C && !(await discardOk())) {
    if (!stale()) setSel(ST.CAMSEL);
    return;
  }
  if (stale()) return;
  ST.CAMSEL = name;
  setSel(name);
  rememberLast('lastCamp', name);
  if (!name) {
    manClear();
    ST.C = null;
    ST.CL = [];
    ST.WX = null;
    ST.L16 = null;
    ST.IFFP = null;
    atoSearch();
    $('fsel').innerHTML = '<option>— select a flight —</option>';
    $('cinfo').textContent = '';
    return;
  }
  const dir = campDir(),
    es = await listDir(dir),
    stem = name.replace(/\.(cam|tac)$/i, '');
  if (stale()) return;
  const find = (...sfx) => {
    const e =
      es.find(e => !e.isDirectory && sfx.some(s => e.name.toLowerCase() === (stem + s).toLowerCase())) ||
      (sfx.some(s => /txtpb/.test(s))
        ? es.find(
            e =>
              !e.isDirectory &&
              e.name.toLowerCase().startsWith(stem.toLowerCase()) &&
              /l16.*\.(txtpb|txt)$|\.txtpb$/i.test(e.name)
          )
        : null);
    return e && e.name;
  };
  const got = [],
    miss = [];
  ST.WX = null;
  WXS.clear();
  WXDIR.files = null;
  ST.L16 = null;
  ST.IFFP = null;
  const tryLoad = async (label, names, fn) => {
    const n = find(...names);
    if (!n) {
      miss.push(label);
      return;
    }
    try {
      const b = await readBytes(joinPath(dir, n));
      if (stale()) return;
      await fn(b);
      got.push(label);
    } catch (e) {
      miss.push(label + ' (unreadable)');
    }
  };
  const txt = b => new TextDecoder('latin1').decode(b);
  await tryLoad('weather', ['.fmap'], b => {
    ST.WX = CAM.parseFmap(new Uint8Array(b));
  });
  await tryLoad('Link16', ['_l16.txtpb', '.l16.txtpb', '-l16.txtpb', '.txtpb', '_link16.txtpb'], b => {
    const m = parseLink16(txt(b));
    if (!Object.keys(m).length) throw 0;
    ST.L16 = m;
  });
  await tryLoad('IFF', ['.iff'], b => {
    const m = parseIff(txt(b));
    if (!Object.keys(m).length) throw 0;
    ST.IFFP = m;
  });
  await tryLoad('date', ['.twx'], b => {
    const v = parseTwx(new Uint8Array(b).buffer).iso;
    $('d1').value = v;
    ST.D1PREV = v;
    CAM.setBase(v);
    try {
      localStorage.setItem('bmsd1', v);
    } catch (e) {}
  });
  if (stale()) return;
  $('cinfo').textContent =
    (got.length ? 'Loaded: ' + got.join(', ') + '. ' : '') +
    (miss.length ? 'Not found: ' + miss.join(', ') + '.' : '') +
    (miss.includes('Link16')
      ? ' (files starting with "' +
        stem +
        '": ' +
        (es
          .filter(e => e.name.toLowerCase().startsWith(stem.toLowerCase()))
          .map(e => e.name.slice(stem.length))
          .join(' ') || 'none') +
        ')'
      : '');
  let bytes;
  try {
    bytes = await readBytes(joinPath(dir, name));
  } catch (e) {
    if (!stale()) alert('Unable to read the campaign file: ' + ((e && e.message) || e));
    return;
  }
  if (stale()) return;
  await loadCam(new File([bytes], name), stale);
  if (stale()) return;
  if (ST.C && ST.C.isTe) $('cinfo').textContent = 'Tactical Engagement. ' + $('cinfo').textContent;
}
export async function loadFmap(file) {
  let W;
  try {
    W = CAM.parseFmap(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return alert('Unable to read the .fmap: ' + e.message);
  }
  if (ST.C && ST.CL.length && !(await discardOk())) return;
  manClear();
  ST.WX = W;
  if (ST.C && ST.CL.length) apply(+$('fsel').value || 0, 'fresh');
  else alert('Weather loaded: open a campaign to fill in the ATIS.');
}
export async function loadL16(file) {
  const m = parseLink16(await file.text());
  if (!Object.keys(m).length) return alert('No STN found in the Link16 file.');
  ST.L16 = m;
  atoSearch();
  if (ST.C && ST.CL.length) apply(+$('fsel').value || 0);
  else alert('Link16 loaded: open a campaign to fill in the STNs.');
}
export async function loadIFF(file) {
  const m = parseIff(await file.text());
  if (!Object.keys(m).length) return alert('No IFF policy found in the file.');
  ST.IFFP = m;
  if (ST.C && ST.CL.length) apply(+$('fsel').value || 0);
  else alert('IFF policy loaded: open a campaign to fill in the IFF column.');
}
export async function loadTwx(file) {
  let T;
  try {
    T = parseTwx(await file.arrayBuffer());
  } catch (e) {
    return alert(e.message);
  }

  const v = T.iso;
  if (ST.C && ST.CL.length && !(await discardOk())) return;
  manClear();
  $('d1').value = v;
  ST.D1PREV = v;
  CAM.setBase(v);
  try {
    localStorage.setItem('bmsd1', v);
  } catch (e) {}
  if (ST.C && ST.CL.length) apply(+$('fsel').value || 0, 'fresh');
  else alert('Date imported: campaign day 1 = ' + v);
}

// run 14: statements that run when the program starts (in the order of the original file)
export async function init14() {
  WXS = new Map();
  wxPage = createWeatherPage({
    root: $('wx'),
    esc,
    flight: wxFlight,
    at: wxAt,
    fill: wxFill,
    fillState: wxFillState,
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
    toLL: (x, y) => mToLL(x, y),
    fromLL: (a, b) => mFromLL(a, b),
    get bounds() {
      return mBounds();
    },
  });
  $('csel').onchange = () => selectCampaign($('csel').value);
  $('tesel').onchange = () => selectCampaign($('tesel').value);
  $('cam').onclick = async () => {
    const f = await pickFile({
      exts: ['cam', 'tac', 'bcrd'],
      startDir: ST.CFG.paths.campaigns,
      title: 'Open a campaign, a Tactical Engagement or a mission',
    });
    if (!f) return;
    if (/\.bcrd$/i.test(f.name)) {
      msfLoad(await f.text(), f);
      return;
    }
    if (await discardOk()) {
      const gen = campCancel();
      loadCam(f, () => gen !== CAMGEN);
    }
  };
  $('fsel').onchange = () => ST.C && apply(+$('fsel').value);
  $('rstf').onclick = async () => {
    if (!ST.C || !(await confirm("Discard the changes made by hand to this flight's datacard?"))) return;
    apply(+$('fsel').value || 0, 'reset');
  };
}
