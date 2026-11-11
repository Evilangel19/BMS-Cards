import * as PJ from '../core/mission.js';
import { toDDS, toDDS5 } from '../core/dds.js';
import { CAM } from '../core/cam-core.js';
import { ST } from './state.js';
import { MFD, draw, gapless } from './cardview.js';
import { KBLIB, KBS, KBTH, dcPage, kbKept } from './kneeboard.js';
import { harmPage, mapV, pfPage, sqPage } from './pages.js';
import { WXS, loadFmap, loadIFF, loadL16, loadTwx, wxAt, wxKey, wxKeys, wxPage } from './campaign.js';
import { CYC, F, FD, TOPOWER, cycle, setField, ptChoices, ptPick, dtcChanged, dcSync } from './datacard.js';
import { MSFSIG, msfBuild, msfLoad, msfSig, unsaved } from './mission.js';
import { dtcSet } from './dtcapply.js';
import { $, IO } from './base.js';
import { dtcOut, lines, parse } from './dtcfile.js';
import { apply, loadCam } from './selection.js';
import { SX, SY, applyFormToggle, boxOf, closeEd, openEd } from './editor.js';
import { perfFill } from './perf.js';
import { acMemo, perfAcGet } from './gamefiles.js';
import { TDATA } from './dtctargets.js';
import { GAMEDATA } from './gamedata.js';
import { goFlight, pickSeat, seatIdx, seatMe } from './seat.js';
import { readyWatch, verCheck, verShow, readyItems } from './ready.js';
import { l16Add, l16Back, l16Info, l16Plan, l16Recs, l16Remove, l16Unpin } from './l16link.js';

// run 19: statements that run when the program starts (in the order of the original file)
export async function init19() {
  readyWatch();
  setTimeout(verCheck, 4000);
  window.__app = {
    ST,
    ready: { items: readyItems, verShow },
    initialOwners: u8 => CAM.initialOwners(ST.C, u8),
    CYC,
    ptChoices,
    ptPick,
    dtcChanged,
    dcSync,
    MFD,
    kbKept,
    get KBTH() {
      return KBTH;
    },
    dcState: () => dcPage.state(),
    openEd: k => openEd(FD.find(z => z.k == k)),
    // where a cell of the card (or of the MDC format) is on the screen: {x, y, w, h} in the pixels of the page
    cellRect: k => {
      const d = (ST.MDCON ? MFD : FD).find(z => z.k == k);
      if (!d) return null;
      const r = $('cv').getBoundingClientRect(),
        kk = r.width / 2048,
        b = boxOf(d);
      return { x: r.left + b.x * SX * kk, y: r.top + b.y * SY * kk, w: b.w * SX * kk, h: b.h * SY * kk };
    },
    get KBS() {
      return KBS;
    },
    get KBLIB() {
      return KBLIB;
    },
    setRl: o => {
      ST.RL = o;
      try {
        perfFill(+$('fsel').value || 0);
      } catch (e) {}
      try {
        pfPage.render();
      } catch (e) {}
    },
    sq: sqPage,
    seat: { pick: pickSeat, go: goFlight, idx: seatIdx, me: seatMe },
    l16: {
      info: l16Info,
      plan: l16Plan,
      recs: l16Recs,
      add: l16Add,
      remove: l16Remove,
      unpin: l16Unpin,
      back: l16Back,
    },
    wxPage,
    unsaved: () => unsaved(),
    msfSig: () => msfSig(),
    msfSigBase: () => MSFSIG,
    get MAPSHOT() {
      return ST.MAPSHOT;
    },
    set MAPSHOT(v) {
      ST.MAPSHOT = v;
    },
    missionExt: PJ.missionFolder.file(''),
    toggleForm: () => {
      closeEd(true);
      ST.FORMON = !ST.FORMON;
      applyFormToggle();
    },
    get mdcOn() {
      return ST.MDCON;
    },
    cycle,
    get TOPOWER() {
      return TOPOWER;
    },
    get sel() {
      return ST.ATOSEL;
    },
    get CL() {
      return ST.CL;
    },
    WXS,
    wxKey,
    wxAt,
    wxKeys,
    msfBuild,
    msfLoad,
    perfAcGet,
    get acMemo() {
      return acMemo;
    },
    setAc: (n, d) => {
      ST.MSFAC[n] = d;
      acMemo.delete(n);
    },
    get WX() {
      return ST.WX;
    },
    setField,
    get F() {
      return F;
    },
    get MANK() {
      return ST.MANK;
    },
    get C() {
      return ST.C;
    },
    get msPage() {
      return ST.msPage;
    },
    get harmPage() {
      return harmPage;
    },
    get pfPage() {
      return pfPage;
    },
    get mapV() {
      return mapV;
    },
    get wpPage() {
      return ST.wpPage;
    },
    tdata: {
      use: (d, c) => {
        ST.OBJDIR = d;
        ST.OBJCAMP = c || '';
        TDATA.reset();
      },
      get api() {
        return TDATA;
      },
    },
    dtcSet,
    noJtacSel: () => {
      const f =
        ST.C &&
        ST.C.units.find(
          u =>
            u.kind == 'flight' &&
            u.wps.length &&
            (!ST.C.playerTeam || u.owner == ST.C.playerTeam) &&
            !CAM.jtac(ST.C, u, true)
        );
      if (!f) return false;
      ST.ATOSEL = f;
      mapV.refresh();
      return true;
    },
    jtacSel: () => {
      const f =
        ST.C &&
        ST.C.units.find(
          u =>
            u.kind == 'flight' &&
            u.wps.length &&
            (!ST.C.playerTeam || u.owner == ST.C.playerTeam) &&
            CAM.jtac(ST.C, u, true)
        );
      if (!f) return false;
      ST.ATOSEL = f;
      mapV.refresh();
      return true;
    },
    IO,
    setDtcPath: (p, orig) => {
      ST.DTCF = ST.DTCF || { path: null, enc: 'utf-8', bom: false, orig: new TextEncoder().encode(orig || dtcOut()) };
      ST.DTCF.path = p;
    },
    dtcOut,
    get lines() {
      return lines;
    },
    kbInfo: () => {
      const it = KBLIB.filter(i => /^Map screenshot/.test(i.name));
      return {
        n: it.length,
        w: it[0] && it[0].w,
        h: it[0] && it[0].h,
        placed: KBS.some(r => [r.left, r.right].some(s => s.kind == 'pic' && it.includes(s.item))),
      };
    },
    hasShot: () => !!ST.MAPSHOT,
    get CAM_D() {
      return CAM.D;
    },
    get CFG() {
      return ST.CFG;
    },
    get GAMEDATA() {
      return GAMEDATA;
    },
    loadCam,
    loadFmap,
    loadL16,
    loadIFF,
    loadTwx,
    parse,
    apply,
    draw,
    gapless,
    toDDS,
    toDDS5,
    get FD() {
      return FD;
    },
  };
}
