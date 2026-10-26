import { navRow } from '../core/weaponspage.js';
import { CAM } from '../core/cam-core.js';
import { dtcKey, dtcValue, dtcEmpty } from '../core/mapdtc.js';
import { ST } from './state.js';
import { G, S, lines, view } from './dtcfile.js';
import { F } from './datacard.js';
import { $ } from './base.js';
import { mapV } from './pages.js';
import { draw } from './cardview.js';

// The datacard of a received mission is the sender's: what his DTC, his Link 16 / IFF files and his pilot list filled in (IFF, Link 16, laser, delivery data, pilots, MAR table...) is kept
// whenever the card is built again on this computer (another DTC opened, the flight selected again). ST.MSFCARD = {C, key, vals} is set by msfLoad; values changed by hand here (ST.MANK) win.
export function msfFreeze(fl) {
  const c = ST.MSFCARD;
  if (!c || c.C !== ST.C || !fl || !fl.id || c.key !== fl.id.n + ':' + fl.id.c) return;
  Object.keys(c.vals).forEach(k => {
    if (!ST.MANK || !ST.MANK.has(k)) F[k] = c.vals[k];
  });
}
export function applyDTC(fl) {
  applyDTC0(fl);
  msfFreeze(fl);
}
function applyDTC0(fl) {
  if (!lines.length) return;
  const g = (s, k) => G(s, k, '');
  for (let i = 0; i < 6; i++) {
    const c = g('EWS', `PGM ${i} Comment`);
    if (c) F['ews' + i] = c;
  }
  const al = g('ICP', 'Alow AGL'),
    ms = g('ICP', 'Alow MSL'),
    bf = g('ICP', 'Bingo_Fuel');
  if (al !== '') F.alow = String(Math.round(+al));
  if (ms !== '') F.msl = String(Math.round(+ms));
  if (bf !== '') {
    F.bingo = String(Math.round(+bf));
    F.joker = String(Math.round(+bf) + 1000);
  }
  const SUB = { 7: 'CCIP', 8: 'CCRP' },
    FZ = { 0: 'NSTL', 1: 'NOSE', 2: 'TAIL' },
    bc = g('Laser', 'LaserTGP');
  [1, 2].forEach(n => {
    const k = s => g('FCC_AGB', `Profile${n}_${s}`);
    if (k('Submode') === '') return;
    F[`wp${n}_mode`] = SUB[+k('Submode')] || '';
    F[`wp${n}_fuze`] = FZ[+k('Fuze')] || '';
    F[`wp${n}_sgl`] = +k('SGL/PAIR') ? 'PAIR' : 'SGL';
    F[`wp${n}_ad`] = (+k('C1_AD1') / 100).toFixed(2).padStart(5, '0');
    F[`wp${n}_hb`] = String(Math.round(+k('C2_BA'))).padStart(4, '0');
    F[`wp${n}_ang`] = String(Math.round(+k('Release_Angle')));
    F[`wp${n}_rp`] = String(+k('Release_Pulse') + 1);
    F[`wp${n}_spc`] = String(Math.round(+k('Release_Spacing')));
    if (bc) F[`wp${n}_bc`] = bc;
  });
  // the attack data of the card (Delivery section) are built again from the DTC and the Weapons page every time: what is no longer there (offsets cleared, another attack) must not stay on the card; values typed by hand (MANK) are kept
  [
    'dmode',
    'dlab',
    ...['dv', 'dp', 'oa', 'ob'].flatMap(p => [0, 1, 2].map(i => p + i)),
    ...['ph', 'cl', 'pd', 'tn', 'ah', 'th', 'ia', 'is', 'rh', 'rs'].map(k => 'dl_' + k),
  ].forEach(k => {
    if (!ST.MANK || !ST.MANK.has(k)) F[k] = '';
  });
  const wc0 = ST.wpPage && ST.wpPage.card && ST.wpPage.card(),
    held = key => {
      const n = navRow(g('NAV OFFSETS', key));
      return [n.brg, n.rng, n.elev].some(x => +x);
    },
    modesel = (g('NAV OFFSETS', 'Modesel') || '').toUpperCase(),
    // the mode of the Delivery section: the DTC's (when it holds offsets of it) or the one of the attack applied on the Weapons page
    ms2 =
      (modesel === 'VRP' || modesel === 'VIP') && (held(modesel) || held(modesel + 'PUP'))
        ? modesel
        : wc0
          ? String(wc0.ref).toUpperCase()
          : '';
  if (ms2 === 'VRP' || ms2 === 'VIP') {
    F.dmode = ms2;
    const fill = (key, pre) => {
      const n = navRow(g('NAV OFFSETS', key)),
        v = [n.brg, n.rng, n.elev].map(Number);
      if (v.some(x => x)) v.slice(0, 3).forEach((x, i) => (F[pre + i] = i ? x + ' ft' : String(x)));
    };
    fill(ms2, 'dv');
    fill(ms2 + 'PUP', 'dp');
    // attack data of the Weapons page (written by its Apply): label, OA1 / OA2 rows of the steerpoint and the profile numbers
    const wc = wc0,
      n4 = navRow(g('NAV OFFSETS', ms2)).stpt || (wc && wc.stpt) || 0; // a loft needs no VRP row: the steerpoint is the one of the attack
    if (wc && String(wc.ref).toUpperCase() === ms2) {
      F.dlab = wc.label;
      if (wc.man) {
        const m = wc.man;
        F.dmode = ms2 + ' · STPT ' + m.stpt;
        [
          ['dv', m.dv],
          ['dp', m.dp],
          ['oa', m.oa],
          ['ob', m.ob],
        ].forEach(([pre, v]) => {
          if (v && v.some(x => +x)) v.forEach((x, i) => (F[pre + i] = i ? x + ' ft' : String(x)));
        });
      }
      [
        ['OA1-', 'oa'],
        ['OA2-', 'ob'],
      ].forEach(([a, pre]) => {
        const n = n4 ? navRow(g('NAV OFFSETS', a + n4), false) : null,
          v = n ? [n.brg, n.rng, n.elev].map(Number) : [];
        if (v.some(x => x)) v.forEach((x, i) => (F[pre + i] = i ? x + ' ft' : String(x)));
      });
      ['ph', 'cl', 'pd', 'tn', 'ah', 'th', 'ia', 'is', 'rh', 'rs'].forEach(k => {
        if (wc[k] !== undefined) F['dl_' + k] = String(wc[k]);
      });
    }
  }
  if (fl && ST.C) {
    const u6 = +g('Radio', 'UHF_6'),
      jt = CAM.jtac(ST.C, fl, u6 > 0);
    if (jt) {
      F.su4_0 = 'JTAC - ' + (jt.name || jt.cat);
      F.free = (F.free ? F.free + '\n\n' : '') + 'JTAC: Redwolf/Eyeball/Troll + n. (random)';
      F.su4_3 = jt.loc;
      F.su4_2 = (u6 / 1000).toFixed(3);
      const sv = CAM.svc(ST.C, fl);
      if (sv) F.sn4 = sv.tm;
    } else {
      const fc = CAM.fac(ST.C, fl, u6 > 0);
      if (fc) {
        F.su4_0 = fc.ty;
        F.su4_2 = (u6 / 1000).toFixed(3);
        F.su4_3 = fc.loc;
        F.sn4 = fc.tm;
      }
    }
  }
  if (fl && ST.C && g('IFF', 'Mode2 Code') !== '') {
    const P = ST.IFFP && ST.IFFP[fl.owner],
      B = [0, 1, 2, 3, 4, 7, 8],
      tot = CAM.totMs(ST.C, fl);
    let a2 = 1,
      a4 = 1;
    if (P && P.pm[fl.omis]) {
      const pr = P.pm[fl.omis],
        yy = +pr.slice(0, 2),
        zz = +pr.slice(2),
        m = yy != zz && fl.wps.some(p => !B.includes(p.act)) ? zz : yy;
      a2 = m & 2 ? 1 : 0;
      a4 = m & 8 ? 1 : 0;
    }
    const DAY = 864e5,
      ap = fl.wps.map(p => p.arr).filter(Boolean),
      t0 = (fl.wps.find(p => p.act == 1) || { arr: ap[0] }).arr,
      t1 = Math.max(...ap),
      EV = [];
    for (let n = 0; n < 48; n++) {
      const c = g('IFF', `TIME ${n} Criteria`);
      if (c === '') break;
      let T = Math.floor(t0 / DAY) * DAY + (Math.floor(+c / 100) * 60 + (+c % 100)) * 60000;
      if (T <= t0) T += DAY;
      EV.push({ T, n });
    }
    const atAbs = (t, key) => {
      let b = -1,
        v = g('IFF', key);
      EV.forEach(e => {
        const x = g('IFF', `TIME ${e.n} ${key}`);
        if (x !== '' && e.T <= t && e.T > b) {
          b = e.T;
          v = x;
        }
      });
      return v;
    };
    let k4 = +g('IFF', 'Mode4 Key');
    if (P && P.M4Rotation) {
      const per = (24 * 3600000) / Math.max(1, Math.min(4, P.M4Rotation)),
        st = (fl.wps.find(p => p.arr) || { arr: tot }).arr;
      if ((Math.floor(tot / per) - Math.floor(st / per)) % 2) k4 = k4 == 1 ? 2 : 1;
    } else k4 = +atAbs(tot, 'Mode4 Key');
    const K = +g('IFF', 'Mode4 On') && a4 ? { 1: 'A', 2: 'B' }[k4] || '' : '',
      el = CAM.els0(ST.C, fl),
      fi = Math.max(
        0,
        el.findIndex(e => e.id.n == fl.id.n && e.id.c == fl.id.c)
      ),
      o = parseInt(g('IFF', 'Mode2 Code'), 8),
      yy2 = o & 63,
      xx = o >> 6,
      bs = [4, 24, 44].find(b => yy2 >= b && yy2 - b < 20),
      st2 = P && P.M2Setting !== undefined ? P.M2Setting : 0;
    const c3 = atAbs(tot, 'Mode3A Code');
    for (let i = 0; i < CAM.nAcf(fl); i++) {
      let m2 = '';
      if (+g('IFF', 'Mode2 On') && a2) {
        if (st2 == 0) {
          if (bs !== undefined && Math.floor((yy2 - bs) / 4) == fi)
            m2 = ((xx << 6) | (bs + fi * 4 + i)).toString(8).padStart(4, '0');
        } else if (st2 == 1) m2 = String(g('IFF', 'Mode2 Code')).padStart(4, '0');
      }
      if (m2) m2 = '2 ' + m2;
      else if (c3) {
        const o3 = parseInt(c3, 8),
          y3 = o3 & 63,
          x3 = o3 >> 6,
          b3 = [4, 24, 44].find(b => y3 >= b && y3 - b < 20),
          s3 = P && P.M3Setting !== undefined ? P.M3Setting : 0;
        if (s3 == 0) {
          if (b3 !== undefined && Math.floor((y3 - b3) / 4) == fi)
            m2 = '3 ' + ((x3 << 6) | (b3 + fi * 4 + i)).toString(8).padStart(4, '0');
        } else if (s3 == 1) m2 = '3 ' + c3.padStart(4, '0');
      }
      const tx = [m2, K].filter(Boolean).join(' ');
      if (tx) F['fl' + i + '_6'] = tx;
    }
    {
      const show3 = [0, 1, 2, 3].some(q => /^3 /.test(F['fl' + q + '_6'] || '')),
        k4f = t => (+g('IFF', 'Mode4 On') && a4 ? { 1: 'A', 2: 'B' }[+atAbs(t, 'Mode4 Key')] || '' : ''),
        c3at = t => {
          const v = atAbs(t, 'Mode3A Code');
          if (v === '') return '';
          const o = parseInt(v, 8),
            y = o & 63,
            b = [4, 24, 44].find(q => y >= q && y - q < 20);
          return b === undefined ? '' : (((o >> 6) << 6) | (b + fi * 4)).toString(8).padStart(4, '0');
        },
        out = [];
      let pk = k4f(t0),
        p3 = show3 ? c3at(t0) : '';
      EV.map(e => e.T)
        .filter(T => T > t0 && T <= t1)
        .sort((x, y) => x - y)
        .forEach(T => {
          const k = k4f(T),
            c = show3 ? c3at(T) : '',
            s = [];
          if (show3 && c && c !== p3) {
            s.push('M3 ' + c);
            p3 = c;
          }
          if (k && k !== pk) {
            s.push('M4 ' + k);
            pk = k;
          }
          if (s.length)
            out.push(
              (q =>
                String(Math.floor(q / 36e5) % 24).padStart(2, '0') +
                ':' +
                String(Math.floor(q / 6e4) % 60).padStart(2, '0'))(T) +
                ' ' +
                s.join(' ')
            );
        });
      if (out.length)
        F.free =
          (F.free ? F.free + '\n\n' : '') + 'IFF from ' + out.slice(0, 3).join(' | ') + (show3 ? ' (M3 Leader)' : '');
    }
  }
  [
    ['target_98', 'pri', 'll1', 'STPT 99'],
    ['target_97', 'sec', 'll2', 'STPT 98'],
  ].forEach(([k, fk, lk, dn]) => {
    if (ST.MANK && ST.MANK.has(fk)) return;
    const s = g('STPT', k)
      .split(',')
      .map(x => x.trim());
    if (s.length >= 4 && +s[3] >= 0 && (+s[0] || +s[1]) && ST.C) {
      F[fk] = s[4] && !/^not set$/i.test(s[4]) ? s[4] : dn;
      F[lk] = CAM.geoLL(ST.C, +s[1] / 3280.84, +s[0] / 3280.84);
    }
  });
}
/* ATO column: mission categories > packages > flights, for one faction at a time. The player's faction (from the campaign's player squadron) is selectable; other factions can be read but are locked (red). Only F-16 flights fill the datacard. */
// a DTC steerpoint was changed on the map: keep the DTC page and the datacard (STPT 98 / 99 -> secondary / primary) in step
export function dtcSet(g, slot, patch, fromPage) {
  const k = dtcKey(g, slot);
  S('STPT', k, dtcValue(g, G('STPT', k, ''), patch));
  afterDtc(k, fromPage);
}
export function dtcClear(g, slot, fromPage) {
  const k = dtcKey(g, slot);
  S('STPT', k, dtcEmpty(g));
  afterDtc(k, fromPage);
}
export function dtcBtns() {
  const d = lines.some(l => l.dirty);
  [
    ['saveow', !d],
    ['dtcrev', !d],
  ].forEach(([i, n]) => {
    const b = $(i);
    if (b) b.classList.toggle('nil', n);
  });
}
export function afterDtc(k, fromPage) {
  dtcBtns();
  try {
    ST.wpPage && ST.wpPage.refresh && ST.wpPage.refresh();
  } catch (e) {}
  try {
    view();
  } catch (e) {}
  if (fromPage) {
    try {
      if (mapV.isReady()) mapV.refreshDtc();
    } catch (e) {}
  }
  if (ST.C && /^(target_9[78]|wpntarget_\d+)$/.test(k)) {
    [
      ['target_98', 'pri', 'll1', 'STPT 99'],
      ['target_97', 'sec', 'll2', 'STPT 98'],
    ].forEach(([kk, fk, lk, dn]) => {
      if (ST.MANK && ST.MANK.has(fk)) return;
      const q = G('STPT', kk)
        .split(',')
        .map(x => x.trim());
      if (q.length >= 4 && +q[3] >= 0 && (+q[0] || +q[1])) {
        F[fk] = q[4] && !/^not set$/i.test(q[4]) ? q[4] : dn;
        F[lk] = CAM.geoLL(ST.C, +q[1] / 3280.84, +q[0] / 3280.84);
      } else {
        F[fk] = '';
        F[lk] = '';
      }
    });
    draw();
  }
}
