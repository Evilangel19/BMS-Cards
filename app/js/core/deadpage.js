// Weapons > HARM > DEAD: destroy the SAM of a DEAD flight (BMS Training Manual 28.4-28.5). The geometry is in dead.js; the HARM range and time of flight
// come from the HARM model (airmissile.js harmShot) with the missile of the HARM page. The page: the target (its rings, its radars, the location known or
// not, one fire control radar on each launcher), the tactic (HARM standoff, Hunter-Killer, Bombs / Maverick) and the orbit side, the roles of the
// seats, the altitude of the flight (the blocks of the manual), the map or the scheme, the steps, the shot or the attack, the nav offsets of the anchors
// (OA1 from the target steerpoint, written to the DTC; the anchor as a PPT). Buttons that ask before they write: HARM tables, Auto PPT, Add card.
// deps: {esc, toast, confirm, ctx() -> {ok, why} | {ok, me, sams, target, seat, harms, hts}, harm(), toLL, attach, detach, cyclePlan, planMode, layerOn,
//   pal, dtc: {harm(), setHarm(t, n, code), has(sec), setOA(key, value)}, ppt([{x, y, rng, name}]), addPpt({x, y, name}), planLines(mode, {x, y}), pptTypes(), snap, kbAdd}
import { deadPlan, defaultRoles, rolesOf, partnerRole, ALT_BLOCKS, at } from './dead.js';
import { busyRun } from './busy.js';
import { mapKeep } from './mapkeep.js';
import { timed, seatLabels } from './sead.js';
import { harmShot, NM } from './airmissile.js';
import { threatOf } from './harmcodes.js';
import { SD_COL } from './seadcard.js';
import { drawDeadCard, DDC_W, DDC_H, deadBox, DD_PH } from './deadcard.js';

const FT_KM = 3280.84,
  KM_NM = 1.852;
const hms = t => {
  const s = Math.round(t / 1000) % 86400,
    q = n => String(n).padStart(2, '0');
  return q(Math.floor(s / 3600)) + ':' + q(Math.floor((s % 3600) / 60)) + ':' + q(s % 60);
};
const h3 = d => String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, '0');
// the roles in fixed colours, none of them the yellow of the flight plan: the shooters and the killer blue, the hunter green, the cover magenta
export const ROLE_COL = { shooter: '#3b82f6', hunter: '#22c55e', killer: '#3b82f6', cover: '#e879f9' };
const ROLE_NAME = { shooter: 'Shooter', hunter: 'Hunter', killer: 'Killer', cover: 'Cover' },
  ATKN = { popup: 'Pop-up', hadb: 'HADB', toss: 'TOSS' }; // the attack pages of Weapons drawn on the map (Bombs / Maverick)
const { HARM, IMP } = SD_COL,
  SEEK = '#22d3ee'; // where the HARM seeker opens (light blue as the HAS of the HARM page)

export function createDeadPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'wpdead';
  const acts = document.createElement('span');
  acts.className = 'hacts';
  let st = {
      tactic: null,
      side: 'R',
      ecm: 70,
      roles: {},
      tgt: null,
      mode: null,
      sub: null,
      view: 'map',
      ppt: {},
      oaEl: {},
    },
    M = null,
    pend = null,
    failed = false,
    fit = true,
    P = null,
    X = null,
    H = null,
    shown = false,
    fitKey = '';
  try {
    const o = JSON.parse(sessionStorage.getItem('dead1') || 'null');
    if (o) st = { ...st, ...o };
  } catch (e) {
    /* none */
  }
  const norm = () => {
    st.tactic = ['hs', 'hk', 'bomb'].includes(st.tactic) ? st.tactic : null;
    st.side = st.side == 'L' ? 'L' : 'R';
    st.ecm = Math.min(100, Math.max(30, Math.round((+st.ecm || 70) / 5) * 5));
    st.roles = st.roles && typeof st.roles == 'object' && !Array.isArray(st.roles) ? st.roles : {};
    st.hand = st.hand && typeof st.hand == 'object' && !Array.isArray(st.hand) ? st.hand : {};
    st.atk = ATKN[st.atk] ? st.atk : null;
    st.tgt = typeof st.tgt == 'string' ? st.tgt : null;
    st.mode = st.mode == 'pos' || st.mode == 'had' ? st.mode : null;
    st.sub = ['EOM', 'PB', 'RUK'].includes(st.sub) ? st.sub : null;
    st.view = st.view == 'sch' ? 'sch' : 'map';
    const pp = st.ppt && typeof st.ppt == 'object' && !Array.isArray(st.ppt) ? st.ppt : {};
    st.ppt = Object.fromEntries(['oa1', 'oa2'].filter(k => typeof pp[k] == 'string').map(k => [k, pp[k]]));
    const oe = st.oaEl && typeof st.oaEl == 'object' && !Array.isArray(st.oaEl) ? st.oaEl : {};
    st.oaEl = Object.fromEntries(
      ['oa1', 'oa2']
        .filter(k => Number.isFinite(oe[k]))
        .map(k => [k, Math.min(15000, Math.max(0, Math.round(oe[k] / 500) * 500))])
    );
  };
  norm();
  const save = () => {
    try {
      sessionStorage.setItem('dead1', JSON.stringify(st));
    } catch (e) {
      /* none */
    }
  };
  const mode = () => st.mode || (H && H.v && H.v.mode == 'had' ? 'had' : 'pos'),
    sub = () => st.sub || (H && H.v && ['EOM', 'PB', 'RUK'].includes(H.v.sub) ? H.v.sub : 'EOM');
  // the target: the SAM chosen in the list, else the target of the task steerpoint, else the nearest enemy SAM to it
  const sam = () =>
    X && X.ok ? X.sams.find(s => s.id == st.tgt) || X.sams.find(s => s.id == X.target) || X.sams[0] : null;
  // the tactic: chosen, else HARM standoff for a SAM spotted (location known), Hunter-Killer for one not spotted, bombs with no HARM
  const tactic = () =>
    st.tactic || (X && X.harms && !X.harms.some(h => h > 0) ? 'bomb' : sam() && !sam().spotted ? 'hk' : 'hs');
  const roles = () => {
    const t = tactic(),
      n = X ? X.me.n : 2,
      r = Array.isArray(st.roles[t]) ? st.roles[t] : [],
      d = defaultRoles(t, n);
    return d.map((q, i) => (rolesOf(t, i).includes(r[i]) ? r[i] : q));
  };
  function shot(p, s) {
    if (!H || !H.m) return { rTh: 0, vm: 0.36 };
    const b = ((Math.atan2(s.x - p.x, s.y - p.y) * 180) / Math.PI + 360) % 360,
      r = harmShot(H.m, H.m.loft, {
        alt: p.altFt > 500 ? p.altFt : 25000,
        speed: p.gsKt > 150 ? p.gsKt : 450,
        tgtAlt: 0,
        heading: b,
        offNose: 0,
        shotPct: 100,
        mode: 'pos',
        sub: sub(),
        emitter: { n: s.y * FT_KM, e: s.x * FT_KM },
      });
    if (!r || r.error) return { rTh: 0, vm: 0.36 };
    return { rTh: r.rTh / NM, vm: r.flight > 0 ? r.shot / NM / r.flight : 0.36 };
  }
  function compute() {
    X = deps.ctx();
    P = null;
    const s = sam();
    if (!X || !X.ok || !s) return;
    P = deadPlan({ sam: s, wps: X.me.f.wps, tactic: tactic(), side: st.side, ecm: st.ecm / 100, roles: roles(), shot });
  }
  const seatName = i => seatLabels(X.me.n)[i] || '#' + (i + 1),
    mine = i => X.seat != null && i === X.seat;
  function inTables(code) {
    const T = deps.dtc.harm();
    if (!T || code == null) return [];
    const o = [];
    T.forEach((row, t) => row.forEach((c, n) => c == code && o.push([t, n])));
    return o;
  }
  const tabTxt = code =>
    inTables(code)
      .map(([t, n]) => 'T' + (t + 1) + '/' + (n + 1))
      .join(' ');
  const pal = () => {
    const p = deps.pal ? deps.pal() : null;
    return {
      plan: (p && p.plan) || '#ffd23f',
      ring: (p && p.sam && p.sam.foe && p.sam.foe.c) || '#ff9f1a',
      halo: (p && p.halo) || 'rgba(0,0,0,.65)',
    };
  };

  // ---- the steps of the plan, for the page and the card: HARM standoff only your launch marked; the other tactics the steps of your aircraft
  function steps() {
    if (!P || P.error) return [];
    const t = tactic(),
      O = [],
      who = r => P.seats.filter(z => z.role == r).map(z => z.i),
      list = a => a.map(i => '#' + (i + 1)).join(', '),
      me = r => who(r).includes(X.seat);
    if (t == 'hs') {
      P.seats
        .filter(z => z.role == 'shooter')
        .forEach((z, k) =>
          O.push({
            me: mine(z.i),
            t: z.tl,
            s: `${'#' + (z.i + 1)} launch ${hms(z.tl)}${k ? ' (' + k * 8 + ' s after #' + (P.seats.find(q => q.role == 'shooter').i + 1) + ')' : ''} at ${P.dL.toFixed(0)} nm, ${mode().toUpperCase()}${mode() == 'pos' ? ' ' + sub() : ''}, heading ${h3(z.brgL)}°`,
          })
        );
      O.push({
        me: false,
        t: P.tTurn,
        s: `${hms(P.tTurn)} at ${P.Ra.toFixed(0)} nm: turn ${st.side == 'R' ? 'left' : 'right'}, the arc round the WEZ with the SAM on your ${st.side == 'R' ? 'right' : 'left'}, inside its search radar: it switches on`,
      });
      O.push({
        me: false,
        t: P.tImp,
        s: P.seats
          .filter(z => z.role == 'shooter')
          .map(z => '◆ ' + hms(z.imp) + ' HARM #' + (z.i + 1))
          .join(' · '),
      });
      if (who('cover').length)
        O.push({
          me: false,
          t: P.tTurn,
          s: `${list(who('cover'))} cover: the arc ${(P.Ra + 4).toFixed(0)} nm outside the shooters`,
        });
      O.push({ me: false, t: P.tEnd, s: `${hms(P.tEnd)} leave the arc, egress` });
    } else {
      // Hunter-Killer and bombs: the steps done together white (sh), those of your aircraft green
      const H_ = who('hunter'),
        K_ = who('killer'),
        C_ = who('cover'),
        hk = t == 'hk';
      O.push({
        sh: true,
        t: P.tA,
        s: `${hms(P.tA)} fighting wing to the anchor (OA1), ${P.Da.toFixed(0)} nm from the SAM, beside the way in`,
      });
      if (H_.length)
        O.push({
          me: me('hunter'),
          t: P.tArc0,
          s: `${list(H_)}: ${hms(P.tArc0)} ECM on, the bait arc ${P.Rb.toFixed(0)} nm inside the WEZ (the WEZ with ECM on; SAM on the ${st.side == 'R' ? 'right' : 'left'})`,
        });
      if (K_.length)
        O.push({
          me: me('killer'),
          t: P.tArc0,
          s: `${list(K_)}: the same way round ${P.Rk.toFixed(0)} nm from the SAM, outside the WEZ`,
        });
      if (H_.length)
        O.push({
          me: me('hunter'),
          t: P.tLaunch,
          s: `${list(H_)}: ${hms(P.tLaunch)} the SAM shoots: defend (ECM, chaff, notch), back to the anchor`,
        });
      if (K_.length)
        O.push(
          hk
            ? {
                me: me('killer'),
                t: P.tHL,
                s: `${list(K_)}: turn in, ${hms(P.tHL)} HARM at ${P.dLk.toFixed(0)} nm (${mode().toUpperCase()}${mode() == 'pos' ? ' ' + sub() : ''}) · ◆ ${hms(P.tImpK)} · back to the anchor`,
              }
            : {
                me: me('killer'),
                t: P.tLaunch,
                s: `${list(K_)}: ${hms(P.tLaunch)} mark the SAM (MARK point: HAD box, TGP to refine), on round and back to the anchor`,
              }
        );
      O.push({
        sh: true,
        t: P.tBack,
        s: `${hms(P.tBack)} both at the anchor: ${hk ? 'assess the shot, scan for the other threats' : 'decide the attack profile, scan for the other threats'}`,
      });
      if (!hk && K_.length)
        O.push({
          me: me('killer'),
          t: P.tAtk,
          s: `${list(K_)}: ${hms(P.tAtk)} attack from the anchor${st.atk ? ' (' + ATKN[st.atk] + ')' : ': choose the profile (On the map)'}`,
        });
      if (!hk && H_.length)
        O.push({
          me: me('hunter'),
          t: P.tAtk,
          s: `${list(H_)}: cover the attack from the cover point on the way back`,
        });
      if (C_.length)
        O.push({
          me: me('cover'),
          t: P.tA,
          s: `${list(C_)}: top cover, an orbit ${(P.Da + 2).toFixed(0)} nm from the SAM on the other side of the way in`,
        });
    }
    return O;
  }

  // ---- the page
  function build() {
    const r = root;
    seen.clear();
    if (!X || !X.ok || !sam()) {
      r.innerHTML = `<div class="wcard sdnone fx"><h3>DEAD</h3><p class="hint">${esc(X && !X.ok ? X.why : 'No enemy SAM near the task of the flight.')}</p></div>`;
      acts.innerHTML = '';
      return;
    }
    r.innerHTML = `<div class="wpg sdg dg"><div class="wpl sdl"><div class="wcard" id="ddtg"><div class="wh"><h3 id="ddtgh"></h3><span style="flex:1"></span><select data-ddtgt aria-label="Target"></select></div><div id="ddtgk"></div><div class="slr"><label>ECM on WEZ</label><input type="range" min="30" max="100" step="5" value="${st.ecm}" data-ddecm><em data-ddecme>${st.ecm}%</em></div></div><div class="wcard" id="ddtc"></div><div class="wcard" id="ddro"></div><div class="wcard" id="ddal"><div class="wh"><h3>Altitude · speed</h3><button type="button" class="ddinfo" aria-label="The altitude blocks of the manual" data-ddinfo>!</button></div><div id="ddalt"></div><div class="ddpop" hidden>${ALT_BLOCKS.map(([a, b, c]) => `<div style="background:${c}">${a}</div><div style="background:${c}">${b}</div>`).join('')}<p class="hint">BMS Training Manual 28.4 (the flight plan gives MSL)</p></div></div></div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>Horizontal plan</h3><span class="seg sdvw">${[
        ['map', 'Map'],
        ['sch', 'Scheme'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.view == v ? 'on' : ''}" data-ddview="${v}">${l}</button>`)
        .join(
          ''
        )}</span><span style="flex:1"></span><button class="btn g" type="button" data-ddfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-ddpf>Map filters</button></div>
      <div id="ddmapw"><div id="ddmap" class="wmapbox"></div><div class="wleg" id="ddleg"></div></div><div id="ddsch" hidden></div></div></div>
      <div class="wpr"><div class="wcard" id="ddst"></div><div class="wcard" id="dddt"></div><div id="ddoa"></div><div id="ddwn"></div></div></div>
      <div class="sdbar"><span class="hint" id="ddnote"></span></div>`;
    // the buttons of the page at the top, in the bar of the HARM tab (harmTab puts them there)
    acts.innerHTML = `<button type="button" class="btn g" data-ddtab title="Checks the HARM tables of the DTC for the target: adds it only after asking">HARM tables</button><button type="button" class="btn g" data-ddppt title="The target as a pre-planned threat of the DTC (the AUTO PPT of the Map page), after asking">Auto PPT</button><button type="button" class="btn" data-ddcard title="A DEAD card for the Kneeboard: with the map or with the scheme">Add card</button>`;
    wire();
  }
  const kv = (a, b, c) => `<span>${a}</span><b${c ? ` class="${c}"` : ''}>${b}</b>`;
  // a part of the page is written again only when it changed; what appears for the first time animates (data-fx: its key), what was there already does
  // not, so a change of a parameter does not make the cards flicker
  const seen = new Set();
  function put(el, html) {
    if (!el || el._h === html) return;
    el._h = html;
    el.innerHTML = html;
    el.querySelectorAll('[data-fx]').forEach(e => {
      const k = e.getAttribute('data-fx');
      if (!seen.has(k)) {
        seen.add(k);
        e.classList.add('fxin');
      }
    });
  }
  const chipInk = r => (r == 'hunter' ? '#04160a' : '#fff');
  function fill() {
    if (!P || !root.querySelector('#ddtg')) return;
    const q = s => root.querySelector(s),
      s = sam(),
      t = tactic(),
      tb = tabTxt(s.code),
      th = threatOf(s.code);
    put(q('#ddtgh'), 'Target · ' + esc(s.name));
    put(
      q('[data-ddtgt]'),
      X.sams
        .map(
          z =>
            `<option value="${esc(z.id)}"${z.id == s.id ? ' selected' : ''}>${esc(z.name)}${z.id == X.target ? ' (STPT ' + (P.task ? P.task.n : '') + ' target)' : ''} · ${(z.d || 0).toFixed(0)} nm</option>`
        )
        .join('')
    );
    q('[data-ddtgt]').value = s.id;
    put(
      q('#ddtgk'),
      `<div class="kv">${kv('ALIC', s.code == null ? 'none' : s.code + (th ? ' ' + esc(th[1]) : '') + (tb ? ' · ' + tb : deps.dtc.harm() ? ' · <span class="sdw">not in a table</span>' : ''))}${kv('WEZ', P.R.toFixed(0) + ' nm · ECM on ' + P.Recm.toFixed(0) + ' nm (' + st.ecm + '%)')}${kv('SEARCH RADAR', P.Rdet.toFixed(0) + ' nm')}${kv('TRACKING RADAR', s.fcr ? 'alive (the priority)' : 'destroyed', s.fcr ? '' : 'wbad')}${kv('LOCATION', s.spotted ? 'known (spotted)' : 'unknown: not spotted', s.spotted ? '' : 'sdw')}</div>${
        s.telar >= 0
          ? `<div class="ddtel" data-fx="tel${esc(s.id)}"><b>⚠ ONE FCR ON EACH TELAR</b> · a HARM or a weapon kills one launcher of the battalion (${s.telar} alive): the others keep shooting. Plan one for each.</div>`
          : ''
      }`
    );
    const ec = q('[data-ddecm]');
    if (ec && document.activeElement !== ec) ec.value = st.ecm;
    put(q('[data-ddecme]'), st.ecm + '%');
    put(
      q('#ddtc'),
      `<h3>Tactic</h3><span class="seg">${[
        ['hs', 'HARM standoff'],
        ['hk', 'Hunter-Killer'],
        ['bomb', 'Bombs / Maverick'],
      ]
        .map(([v, l]) => `<button type="button" class="${t == v ? 'on' : ''}" data-ddtac="${v}">${l}</button>`)
        .join('')}</span><div class="ddorb"><span class="hint">Orbit</span><span class="seg sm">${[
        ['L', 'Left'],
        ['R', 'Right'],
      ]
        .map(
          ([v, l]) =>
            `<button type="button" class="${st.side == v ? 'on' : ''}" data-ddside="${v}" title="${v == 'R' ? 'The SAM on your right (clockwise round it)' : 'The SAM on your left (anticlockwise round it)'}">${l}</button>`
        )
        .join(
          ''
        )}</span>${t != 'bomb' ? `<span class="seg sm" data-fx="md">${['pos', 'had'].map(v => `<button type="button" class="${mode() == v ? 'on' : ''}" data-ddmode="${v}">${v.toUpperCase()}</button>`).join('')}</span><span class="seg sm" data-fx="sb">${['EOM', 'PB', 'RUK'].map(v => `<button type="button" class="${sub() == v ? 'on' : ''}" data-ddsub="${v}">${v}</button>`).join('')}</span>` : ''}</div><p class="hint wnote">${
        t == 'hs'
          ? 'Location known: launch outside the WEZ, then fly the arc round it inside the search radar, so the SAM radiates and the HARM finds it (a HARM misses a radar that is off).'
          : t == 'hk'
            ? 'Location unknown: the hunter baits the SAM on the arc inside the WEZ; when it shoots at the hunter, the killer, the same way round outside the WEZ, turns in and shoots its HARM. Both back to the anchor.'
            : 'No HARM: the hunter baits the SAM, the killer marks it (MARK point); both back to the anchor, then the killer attacks with Mavericks, CBUs or IAMs (the profile: On the map) while the hunter covers.'
      }</p>`
    );
    const R = roles();
    put(
      q('#ddro'),
      `<h3>Roles · ${X.me.n}-ship</h3><div class="ddrl">${R.map((r, i) => {
        const z = P.seats.find(w => w.i == i),
          info =
            t == 'hs'
              ? z && z.role == 'shooter'
                ? 'L ' + hms(z.tl) + ' · ◆ ' + hms(z.imp)
                : 'the arc ' + (P.Ra + 4).toFixed(0) + ' nm'
              : r == 'hunter'
                ? 'bait arc ' + P.Rb.toFixed(0) + ' nm · SAM shot ' + hms(P.tLaunch)
                : r == 'killer'
                  ? t == 'hk'
                    ? 'HARM ' + hms(P.tHL) + ' · ◆ ' + hms(P.tImpK)
                    : 'mark ' + hms(P.tLaunch) + ' · attack ' + hms(P.tAtk)
                  : 'top cover';
        return `<div class="ddtile${mine(i) ? ' me' : ''}" data-fx="tile${i}"><div class="th"><span class="no">#${i + 1}</span><span>${i == 0 ? 'LEAD' : i == 2 ? 'ELEMENT' : 'WINGMAN'}</span>${mine(i) ? '<span class="you">YOU</span>' : ''}</div><div class="chips">${rolesOf(
          t,
          i
        )
          .map(
            q2 =>
              `<button type="button" class="${q2 == r ? 'on' : ''}" style="${q2 == r ? 'background:' + ROLE_COL[q2] + ';color:' + chipInk(q2) + ';border-color:' + ROLE_COL[q2] : ''}" data-ddrole="${i}:${q2}">${ROLE_NAME[q2]}</button>`
          )
          .join('')}</div><div class="hint">${esc(info)}</div></div>`;
      }).join('')}</div>`
    );
    put(
      q('#ddalt'),
      P.rating.ok && !P.slow
        ? `<p class="hint">${Math.round(P.alt).toLocaleString('en-US')} ft · ${P.gs} kt: optimal.</p>`
        : `<div class="ddnote" data-fx="alt"><b>${Math.round(P.alt).toLocaleString('en-US')} ft: ${P.rating.r}${P.rating.ok ? '' : ', not optimal'}.</b> Optimal: above 30 000 ft, or 50–300 ft AGL. ${P.gs} kt ${P.slow ? '<b>slow: 350 kt or more</b>' : '✓ (350 kt or more)'}</div>`
    );
    put(
      q('#ddst'),
      `<h3>Steps</h3><ol class="ddsteps">${steps()
        .map(o => `<li class="${o.me ? 'sdme' : o.sh ? 'ddsh' : ''}">${esc(o.s)}</li>`)
        .join('')}</ol>`
    );
    put(q('#dddt'), detail());
    fillOA(q);
    put(
      q('#ddwn'),
      P.warn
        .map(w => `<div class="wcard sdpb" data-fx="w${esc(w)}"><h3>Check</h3><p class="sdw">${esc(w)}</p></div>`)
        .join('')
    );
    put(
      q('#ddnote'),
      X.seat != null
        ? 'Your seat: <b class="ddyou">' + esc(seatName(X.seat)) + ' · ' + esc(ROLE_NAME[R[X.seat]] || '') + '</b>'
        : ''
    );
    const vm = st.view == 'map';
    root.querySelectorAll('[data-ddview]').forEach(b => b.classList.toggle('on', b.dataset.ddview == st.view));
    q('#ddmapw').hidden = !vm;
    if (vm && M) M.map.invalidateSize(); // shown again after the scheme: its size, the view kept
    q('#ddsch').hidden = vm;
    q('[data-ddfit]').style.visibility = vm ? '' : 'hidden'; // hidden but in place: the header keeps its height
    q('[data-ddpf]').style.visibility = vm ? '' : 'hidden'; // hidden but in place: the header keeps its height
    if (vm) put(q('#ddleg'), legend());
    else put(q('#ddsch'), schemeSvg());
  }
  function detail() {
    const t = tactic();
    if (t == 'hs') {
      const z = P.seats.find(w => w.role == 'shooter' && mine(w.i)) || P.seats.find(w => w.role == 'shooter');
      if (!z) return '<h3>Shot</h3><p class="hint">No shooter.</p>';
      const mg = P.dL - P.R;
      return `<h3>Shot · ${esc(seatName(z.i))}</h3><div class="kv">${kv('MISSILE', esc((H && H.m && H.m.name) || 'AGM-88') + ' · ' + mode().toUpperCase() + (mode() == 'pos' ? ' ' + sub() : ''))}${kv('LAUNCH', hms(z.tl) + ' · ' + P.dL.toFixed(1) + ' nm · ' + Math.round(P.alt).toLocaleString('en-US') + ' ft · ' + P.gs + ' kt', mine(z.i) ? 'sdme' : '')}${kv('RANGE', 'HARM ' + P.rTh.toFixed(1) + ' nm', P.dL <= P.rTh ? '' : 'wbad')}${kv('FLIGHT TIME', z.tof + ' s')}${kv('IMPACT', hms(z.imp) + (z.imp > P.tTurn ? ' · you on the arc (the SAM on)' : ' · <span class="sdw">before the arc</span>'))}${kv('YOUR MARGIN', (mg >= 0 ? '+' : '−') + Math.abs(mg).toFixed(1) + ' nm ' + (mg >= 0 ? 'outside' : 'INSIDE') + ' the WEZ · +' + (P.dL - P.Recm).toFixed(1) + ' nm (ECM on)', mg < 0 ? 'wbad' : '')}</div><p class="hint wnote">The missile of the HARM page; aimed at the SAM, from the altitude and ground speed of your flight plan on the way in.</p>`;
    }
    const k = P.seats.find(w => w.role == 'killer'),
      km = k && mine(k.i);
    if (t == 'hk')
      return `<h3>Killer · HARM${k ? ' · ' + esc(seatName(k.i)) : ''}</h3><div class="kv">${kv('MISSILE', esc((H && H.m && H.m.name) || 'AGM-88') + ' · ' + mode().toUpperCase() + (mode() == 'pos' ? ' ' + sub() : ''))}${kv('LAUNCH', hms(P.tHL) + ' · ' + P.dLk.toFixed(1) + ' nm · ' + h3(P.attackHdg) + '°', km ? 'sdme' : '')}${kv('RANGE', 'HARM ' + P.rThK.toFixed(1) + ' nm', P.dLk <= P.rThK ? '' : 'wbad')}${kv('FLIGHT TIME', P.tofK + ' s')}${kv('IMPACT', hms(P.tImpK) + ' · the killer on its way back')}${kv('HUNTER', P.seats.some(w => w.role == 'hunter') ? 'bait arc ' + P.Rb.toFixed(0) + ' nm (ECM on) · the SAM shoots ' + hms(P.tLaunch) : '—')}</div><p class="hint wnote">The killer shoots when the SAM shoots at the hunter (its radar on). The missile of the HARM page.</p>`;
    return `<h3>Attack${k ? ' · ' + esc(seatName(k.i)) : ''}</h3><div class="kv">${kv('MARK', hms(P.tLaunch) + ' · when the SAM shoots at the hunter')}${kv('ATTACK', hms(P.tAtk) + ' · from the anchor' + (st.atk ? ' · ' + ATKN[st.atk] : ''), km ? 'sdme' : '')}${kv('WEZ', 'enters at ' + P.R.toFixed(0) + ' nm · ECM on ' + P.Recm.toFixed(0) + ' nm')}${kv('HUNTER', P.seats.some(w => w.role == 'hunter') ? 'covers from its cover point' : '—')}</div>${
      t == 'bomb'
        ? `<div class="ddbtns"><span class="hint">On the map:</span><span class="seg sm">${[
            ['', 'None'],
            ...Object.entries(ATKN),
          ]
            .map(
              ([m, l]) =>
                `<button type="button" class="${(st.atk || '') == m ? 'on' : ''}" data-ddatk="${m}" title="${m ? 'The lines of the ' + l + ' page of Weapons (its settings), on the target steerpoint nearest to ' + esc(sam().name) : 'No attack lines'}">${l}</button>`
            )
            .join('')}</span></div>${atkNote()}`
        : ''
    }`;
  }
  // the attack lines of a Weapons page (Bombs / Maverick), on the target steerpoint nearest to the SAM: worked out once for the attack, the SAM and
  // the settings of that page (refresh: the Weapons page may have changed)
  let AL = null,
    ALk = '';
  function atkLines() {
    if (tactic() != 'bomb' || !st.atk || !deps.planLines) return null;
    const s = sam(),
      k = st.atk + '|' + s.id;
    if (k !== ALk) {
      ALk = k;
      AL = deps.planLines(st.atk, { x: s.x, y: s.y });
    }
    return AL;
  }
  function atkNote() {
    if (!st.atk) return '';
    const a = atkLines();
    return `<p class="hint wnote">${
      !a
        ? '<span class="wbad">No target steerpoint within 10 nm of ' +
          esc(sam().name) +
          ': add one (a DTC target or the flight plan).</span>'
        : a.error
          ? '<span class="wbad">' +
            esc(ATKN[st.atk]) +
            ' on ' +
            esc(a.label || 'the target') +
            ': ' +
            esc(a.error) +
            '</span>'
          : esc(ATKN[st.atk]) + ' on ' + esc(a.label) + ', with the settings of its Weapons page (change them there).'
    }</p>`;
  }
  // the PPT types BMS knows (Ppt.ini) that are not SAMs: an anchor added as one of them
  const pptTypes = () => (deps.pptTypes ? deps.pptTypes() : []);
  // the elevation of an offset (ft): the one set on its slider, else 0 (BMS puts an offset at the terrain then)
  const elOf = k => (st.oaEl[k] != null ? st.oaEl[k] : 0);
  // the nav offsets card: a block for each anchor (its offset, its elevation slider, its PPT), then the steerpoint they hang on and the DTC; built once
  // (the sliders stay while they move), its parts written again
  function fillOA(q) {
    const box = q('#ddoa');
    if (tactic() == 'hs' || !P.oa) return put(box, '');
    const A2 = [['oa1', 'Anchor', 'the hunter and the killer', '#e2e8f0']];
    if (!q('#ddoaf'))
      put(
        box,
        `<div class="wcard" data-fx="oa"><h3 id="ddoah"></h3>${A2.map(
          ([k, nmS, , col]) =>
            `<div class="oab" style="border-left-color:${col}"><div class="oah"><b>${k.toUpperCase()}</b><span style="color:${col}">${nmS}</span><span class="hint" id="dd${k}w"></span></div><div class="oav" id="dd${k}v"></div><div class="slr"><label>Elevation</label><input type="range" min="0" max="15000" step="500" value="${elOf(k)}" data-ddel="${k}" aria-label="Elevation of ${k.toUpperCase()}"><em data-ddele="${k}"></em></div><div class="oap" id="dd${k}p"></div></div>`
        ).join('')}<div id="ddoaf"></div></div>`
      );
    const o = P.oa,
      route = o.n >= 1 && o.n <= 24,
      T = pptTypes();
    put(q('#ddoah'), 'Nav offsets · from STPT ' + o.n);
    A2.forEach(([k, nmS, who]) => {
      const a = o[k],
        v = st.ppt[k] && T.some(e => e.name == st.ppt[k]) ? st.ppt[k] : T[0] ? T[0].name : '';
      put(q('#dd' + k + 'w'), who);
      put(
        q('#dd' + k + 'v'),
        `BRG <b>${String(a.brg).padStart(3, '0')}°</b> · RNG <b>${a.nm.toFixed(1)} NM</b> · ELEV <b>${elOf(k).toLocaleString('en-US')} FT</b>`
      );
      put(
        q('#dd' + k + 'p'),
        `<select data-ddpptt="${k}" aria-label="The PPT type of ${nmS}"${T.length ? '' : ' disabled'}>${T.length ? T.map(e => `<option value="${esc(e.name)}"${e.name == v ? ' selected' : ''}>${esc(e.label)}</option>`).join('') : '<option>Ppt.ini not read: open the BMS folder</option>'}</select><button type="button" class="btn g ddadd" data-ddadd="${k}"${T.length ? '' : ' disabled'} title="Add ${nmS} to the DTC as a pre-planned point of this type (not a SAM)">+ PPT</button>`
      );
      const i = q('[data-ddel="' + k + '"]');
      if (i && document.activeElement !== i) i.value = String(elOf(k));
      put(q('[data-ddele="' + k + '"]'), elOf(k).toLocaleString('en-US') + ' ft');
    });
    put(
      q('#ddoaf'),
      `<div class="oaf"><span>From <b>STPT ${o.n}</b> · ${route ? 'in the flight plan' : '<span class="wbad">not in the flight plan (1-24)</span>'}</span>${
        route
          ? `<button type="button" class="btn g" data-ddoaw>Write OA1 to the DTC</button>`
          : `<button type="button" class="btn g ddman" disabled title="STPT ${o.n} is not in the flight plan (1-24): BMS does not take its offsets from the DTC">Manual</button>`
      }</div><p class="hint wnote">${route ? 'BMS takes the offsets of a flight plan steerpoint from the DTC. ' : 'Type OA1 in the DED. '}Offsets from a PPT or a markpoint are not taken from the DTC: type them on board (DED).</p>`
    );
  }
  const sw = (c, d, w = 3) =>
    `<svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${c}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>`;
  function legend() {
    const c = pal(),
      t = tactic();
    return `<span>${sw(c.ring, '7 5')}WEZ (ECM off) · dotted: search radar</span><span>${sw('#ff3b3b', '4 4')}WEZ (ECM on)</span>${
      t == 'hs'
        ? `<span>${sw(ROLE_COL.shooter)}the shooters</span><span>${sw(HARM, '6 5')}HARM range</span><span>${sw(SEEK, '2 6')}seeker opens</span><span>${sw('#fff', '', 2)}footprint (${esc(sub())})</span><span>${sw(HARM, '', 2)}HARM</span>${roles().includes('cover') ? `<span>${sw(ROLE_COL.cover, '6 5')}cover</span>` : ''}`
        : `<span>${sw(ROLE_COL.hunter)}hunter</span><span>${sw(ROLE_COL.killer)}killer</span>${roles().includes('cover') ? `<span>${sw(ROLE_COL.cover, '6 5')}cover</span>` : ''}<span>${sw(ROLE_COL.hunter, '6 5')}defence, back to the anchor</span>${(() => {
            const a = atkLines();
            return a && a.segs
              ? [...new Map(a.segs.map(z => [z.k, z])).values()]
                  .map(z => `<span>${sw(z.col, z.dash)}${esc(z.name)}</span>`)
                  .join('')
              : '';
          })()}`
    }<span><b style="color:${IMP}">◆</b> impact</span><span>yours: thicker</span>`;
  }
  // ---- the scheme: a lane for each seat, the phases in time, a colour for each kind of phase
  const PH = DD_PH;
  function phases() {
    const t = tactic(),
      L = [];
    P.seats.forEach(z => {
      const ph = [],
        mk = [];
      if (t == 'hs') {
        if (z.role == 'shooter') {
          ph.push({ a: z.tl - 120000, b: z.tl, k: 'run', l: 'in' }, { a: P.tTurn, b: P.tEnd, k: 'arc', l: 'the arc' });
          mk.push({ t: z.tl, s: 'L' }, { t: z.imp, s: '◆' });
          ph.push({ a: z.tl, b: z.imp, k: 'harm' });
        } else ph.push({ a: P.tTurn, b: P.tEnd, k: 'cover', l: 'cover' });
      } else {
        if (z.role == 'hunter') {
          ph.push(
            { a: P.tA, b: P.tArc0, k: 'run', l: 'anchor' },
            { a: P.tArc0, b: P.tLaunch, k: 'arc', l: 'bait' },
            { a: P.tLaunch, b: P.tBack, k: 'def', l: 'defend, back' }
          );
          if (t == 'bomb') ph.push({ a: P.tAtk, b: P.tAtk + 120000, k: 'cover', l: 'cover point' });
        }
        if (z.role == 'killer') {
          if (t == 'hk') {
            ph.push(
              { a: P.tA, b: P.tHL, k: 'arc', l: 'round outside' },
              { a: P.tHL, b: P.tImpK, k: 'harm' },
              { a: P.tHL, b: P.tBack, k: 'run', l: 'back' }
            );
            mk.push({ t: P.tHL, s: 'L' }, { t: P.tImpK, s: '◆' });
          } else {
            ph.push(
              { a: P.tA, b: P.tBack, k: 'hold', l: 'round outside · mark' },
              { a: P.tAtk, b: P.tAtk + 90000, k: 'atk', l: 'attack' + (st.atk ? ' (' + ATKN[st.atk] + ')' : '') }
            );
            mk.push({ t: P.tLaunch, s: '+' });
          }
        }
        if (z.role == 'cover') ph.push({ a: P.tA, b: P.tBack + 120000, k: 'cover', l: 'top cover' });
      }
      L.push({ i: z.i, role: z.role, ph, mk });
    });
    return L;
  }
  function schemeSvg() {
    const L = phases(),
      ts = L.flatMap(l => l.ph.flatMap(p => [p.a, p.b]));
    if (!ts.length) return '<p class="hint">No plan.</p>';
    const t0 = Math.min(...ts) - 30000,
      t1 = Math.max(...ts) + 30000,
      W = 900,
      X0 = 170,
      XR = W - 12,
      Xt = t => X0 + ((t - t0) / (t1 - t0)) * (XR - X0),
      span = t1 - t0,
      step = span > 1800000 ? 300000 : span > 900000 ? 120000 : 60000,
      used = new Set(),
      o = [];
    let y = 28;
    L.forEach(l => {
      const c = ROLE_COL[l.role],
        me = mine(l.i);
      o.push(
        `<text x="8" y="${y + 14}" class="sdsl${me ? ' ddyou' : ''}">${esc(seatName(l.i))}${me ? ' · YOU' : ''}</text><text x="8" y="${y + 29}" class="sdss" fill="${c}">${esc(ROLE_NAME[l.role]).toUpperCase()}</text><path d="M${X0} ${y + 12}H${XR}" stroke="#202a36"/>`
      );
      l.ph.forEach(p => {
        const x0 = Xt(p.a),
          x1 = Xt(p.b),
          pc = PH[p.k][0],
          dash = p.k == 'def' || p.k == 'cover';
        used.add(p.k);
        if (p.k == 'harm')
          o.push(`<rect x="${x0}" y="${y + 16}" width="${Math.max(2, x1 - x0)}" height="6" rx="2" fill="${pc}"/>`);
        else
          o.push(
            `<rect x="${x0}" y="${y + 5}" width="${Math.max(2, x1 - x0)}" height="10" rx="2" fill="${pc}" fill-opacity="${dash ? 0.3 : 0.75}" stroke="${pc}"${dash ? ' stroke-dasharray="4 3"' : ''}/>${p.l ? `<text x="${x0 + 3}" y="${y + 34}" class="sdss">${esc(p.l)} ${hms(p.a).slice(3)}</text>` : ''}`
          );
      });
      l.mk.forEach(m =>
        o.push(
          m.s == '◆'
            ? `<path d="M${Xt(m.t)} ${y + 10}l8 8-8 8-8-8z" fill="${IMP}" stroke="#fff" stroke-width="1.1"/>`
            : `<text x="${Xt(m.t)}" y="${y + 3}" text-anchor="middle" class="sdsm" fill="${me && m.s == 'L' ? SD_COL.YOU : '#e2e8f0'}">${m.s}</text>`
        )
      );
      y += 48;
    });
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step)
      o.unshift(
        `<path d="M${Xt(t)} 18V${y - 6}" stroke="#202a36"/><text x="${Xt(t)}" y="12" class="sdss" text-anchor="middle">${hms(t).slice(0, 5)}</text>`
      );
    let lx = 8;
    const lg = Object.keys(PH)
      .filter(k => used.has(k))
      .map(k => {
        const s = `<rect x="${lx}" y="${y + 2}" width="14" height="8" rx="2" fill="${PH[k][0]}"/><text x="${lx + 18}" y="${y + 10}" class="sdss">${PH[k][1]}</text>`;
        lx += 30 + PH[k][1].length * 5.6;
        return s;
      })
      .join('');
    y += 20;
    return `<svg viewBox="0 0 ${W} ${y}" class="sdscv" role="img" aria-label="DEAD scheme"><rect width="${W}" height="${y}" rx="6" fill="#121820"/>${o.join('')}${lg}</svg>`;
  }

  // ---- the map
  async function ensureMap() {
    const box = root.querySelector('#ddmap');
    if (!box || !deps.attach) return (failed = true);
    const o = await deps.attach(box);
    if (!o) return (failed = true);
    if (!o.map._ddR) {
      o.map.createPane('ddP').style.zIndex = 470;
      o.map._ddR = o.L.canvas({ pane: 'ddP' });
    }
    M = { ...o, WL: o.L.layerGroup().addTo(o.map), zh: () => shown && st.view == 'map' && paint() };
    o.map.on('zoomend', M.zh); // the texts placed again for the new scale
    fit = !VK.restore(o.map, fitKey); // back from another tab: the view as it was left
  }
  const VK = mapKeep();
  function detachMap(nosave) {
    if (!M) return;
    if (!nosave && M.map.getContainer().clientWidth) VK.save(M.map, fitKey);
    try {
      M.WL.remove();
      M.map.off('zoomend', M.zh);
    } catch (e) {
      /* none */
    }
    M = null;
    try {
      deps.detach();
    } catch (e) {
      /* none */
    }
  }
  // the way an arc is flown: a thin arrow alongside it, outside (away from the SAM), over its middle half, its head at the end (the points of the
  // arc are in the order they are flown): [shaft, head]
  function flow(pts) {
    if (!pts || pts.length < 4) return null;
    const s = sam(),
      off = Math.max(1, P.R * 0.08) * KM_NM,
      out = p => {
        const d = Math.hypot(p.x - s.x, p.y - s.y) || 1;
        return { x: p.x + ((p.x - s.x) / d) * off, y: p.y + ((p.y - s.y) / d) * off };
      },
      n = pts.length,
      sh = pts.slice(Math.floor(n * 0.25), Math.ceil(n * 0.75) + 1).map(out);
    if (sh.length < 2) return null;
    return [sh, head(sh[sh.length - 2], sh[sh.length - 1], Math.max(0.6, P.R * 0.05))];
  }
  // the HARM shot of the first shooter as the HARM page draws it: its range, where its seeker opens and the footprint of the submode (the heart of
  // EOM / RUK, the wedge of PB), round the launch point
  const ftKm = p => ({ x: p.e / FT_KM, y: p.n / FT_KM });
  function harmGeo() {
    if (tactic() != 'hs' || !H || !H.m || !(P.rTh > 0)) return null;
    const s = sam(),
      z = P.seats.find(w => w.role == 'shooter');
    if (!z) return null;
    const r = harmShot(H.m, H.m.loft, {
      alt: P.alt,
      speed: P.gs,
      tgtAlt: 0,
      heading: z.brgL,
      offNose: 0,
      shotPct: Math.min(100, (P.dL / P.rTh) * 100),
      mode: mode(),
      sub: sub(),
      emitter: { n: s.y * FT_KM, e: s.x * FT_KM },
    });
    return r && !r.error ? r : null;
  }
  // what Fit view shows (the shot, not the whole route nor the HARM range): the WEZ and, HARM standoff, the launch, the turn and the arc; the other
  // tactics the anchors, the arcs and the attack
  function fitPts() {
    const s = sam(),
      r = P.R * KM_NM,
      ring = [
        { x: s.x - r, y: s.y - r },
        { x: s.x + r, y: s.y + r },
      ];
    if (tactic() == 'hs') return [...ring, P.L, P.turn, ...P.arc];
    return [...ring, P.A, ...P.arc, ...P.def, ...P.kPath, ...P.kBack, ...(roles().includes('cover') ? P.cover : [])];
  }
  // a point along a polyline, d nm from its start (the last point past its end)
  function along(pts, d) {
    let r = d * KM_NM;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        l = Math.hypot(b.x - a.x, b.y - a.y);
      if (r <= l && l > 0) return { x: a.x + ((b.x - a.x) * r) / l, y: a.y + ((b.y - a.y) * r) / l };
      r -= l;
    }
    return pts[pts.length - 1];
  }
  // an arrowhead at the end of a line (a to b)
  function head(a, b, sz) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d },
      k = sz * KM_NM,
      bk = { x: b.x - u.x * k, y: b.y - u.y * k };
    return [
      { x: bk.x - u.y * k * 0.6, y: bk.y + u.x * k * 0.6 },
      b,
      { x: bk.x + u.y * k * 0.6, y: bk.y - u.x * k * 0.6 },
    ];
  }
  function paint(force) {
    if (!P || (st.view != 'map' && !force)) return;
    if (!M) {
      if (!failed && !pend)
        pend = ensureMap().then(() => {
          pend = null;
          if (M) paint();
        });
      return;
    }
    const { L, map, WL } = M,
      RN = map._ddR,
      c = pal(),
      s = sam(),
      ll = p => deps.toLL(p.x, p.y),
      on = k => !!(deps.layerOn && deps.layerOn(k)),
      t = tactic(),
      R = roles(),
      seatsOf = r => R.map((q, i) => (q == r ? i : -1)).filter(i => i >= 0),
      nums = a => a.map(i => '#' + (i + 1) + (mine(i) ? ' (YOU)' : '')).join(' ');
    WL.clearLayers();
    const line = (pts, o) => L.polyline(pts.map(ll), { renderer: RN, interactive: false, ...o }).addTo(WL);
    // a route of a role: its colour on a dark edge; yours thicker
    const path = (pts, col, me, dash, arrow) => {
      line(pts, { color: c.halo, weight: me ? 8 : 5, opacity: 0.6, dashArray: dash ? '8 7' : '' });
      line(pts, { color: col, weight: me ? 4.4 : 2.6, dashArray: dash ? '8 7' : '' });
      // the way round: a thin arrow alongside the arc
      const v = arrow && flow(arrow);
      if (v) v.forEach(q => line(q, { color: col, weight: 1.4, opacity: 0.9 }));
    };
    // a label: on the side of its point away from the SAM, so it does not cover the drawing (either orbit)
    const tag = (p, html, cls = '') =>
      L.marker(ll(p), {
        icon: L.divIcon({ className: 'sdtag ' + cls + (p.x < s.x - 0.5 ? ' ddlf' : ''), html, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
    // the texts: placed at the end, on the side away from the SAM, each moved down (or up) a line when it would cover one already placed
    const LB = [];
    const txt = (p, s2, col, cls = '') => LB.push({ p, s2, col, cls });
    const ring = (r, col, dash, w, fill) =>
      L.circle(ll(s), {
        renderer: RN,
        radius: r * KM_NM * 1000,
        color: col,
        weight: w,
        dashArray: dash,
        fill: !!fill,
        fillOpacity: fill || 0,
        interactive: false,
      }).addTo(WL);
    const dot = (p, col, r = 6, shape = 'c') =>
      shape == 'd'
        ? tag(p, `<i class="ddanc" style="background:${col}"></i>`)
        : L.circleMarker(ll(p), {
            renderer: RN,
            radius: r,
            fillColor: col,
            fillOpacity: 1,
            color: '#0b0f14',
            weight: 2,
            interactive: false,
          }).addTo(WL);
    // the rings with their names
    ring(P.R, c.ring, '9 6', 2.2, 0.06);
    ring(P.Recm, '#ff3b3b', '4 4', 1.6, 0.05);
    ring(P.Rdet, c.ring, '2 6', 1.2);
    // their names on the far side of the SAM from your way in, where nothing else is drawn
    const fb = P.th + 180;
    txt(at(s, fb - 30, P.R), 'WEZ (ECM OFF) ' + P.R.toFixed(0) + ' NM', c.ring);
    txt(at(s, fb + 30, P.Recm), 'WEZ (ECM ON) ' + st.ecm + '% · ' + P.Recm.toFixed(0) + ' NM', '#ff5a5a');
    txt(at(s, fb, P.Rdet), 'SEARCH RADAR ' + P.Rdet.toFixed(0) + ' NM', c.ring);
    tag(
      s,
      `<b class="sdsamt" style="color:${c.ring}">▲</b><span style="color:${c.ring}">${esc(s.name)}${s.code != null ? ' · ALIC ' + s.code : ''}</span>`,
      'sdsamm'
    );
    const mw = timed(X.me.f.wps);
    if (mw.length > 1 && !on('fp')) {
      line(mw, { color: c.halo, weight: 5, opacity: 0.5 });
      line(mw, { color: c.plan, weight: 2.4, opacity: 0.8 });
    }
    const meRole = X.seat != null ? R[X.seat] : null,
      turnW = st.side == 'R' ? 'LEFT' : 'RIGHT';
    if (t == 'hs') {
      // the HARM: its range round the SAM, where its seeker opens, the footprint of the submode
      const g = harmGeo();
      if (g) {
        ring(g.rMax / NM, HARM, '6 5', 1.8);
        if (g.seekerOn) ring(g.seekerOn.nm, SEEK, '2 6', 1.8);
        if (g.foot)
          L.polygon(
            g.foot.map(p => ll(ftKm(p))),
            {
              renderer: RN,
              color: '#fff',
              weight: 2,
              opacity: 0.95,
              fillColor: '#fff',
              fillOpacity: 0.06,
              interactive: false,
            }
          ).addTo(WL);
      } else if (P.rTh > 0) ring(P.rTh, HARM, '6 5', 1.8);
      const cv = seatsOf('cover');
      path(P.path, ROLE_COL.shooter, meRole == 'shooter', false, P.arc);
      P.seats
        .filter(z => z.role == 'cover')
        .forEach(z => {
          path(z.arc, ROLE_COL.cover, mine(z.i), true, z.arc);
          txt(
            z.arc[Math.floor(z.arc.length / 2)],
            nums(cv) + ' COVER · ARC ' + (P.Ra + 4).toFixed(0) + ' NM',
            ROLE_COL.cover
          );
        });
      P.seats
        .filter(z => z.role == 'shooter')
        .forEach((z, k) => {
          const me = mine(z.i);
          line([P.L, s], { color: HARM, weight: me ? 2.6 : 1.8, opacity: me ? 1 : 0.6 });
          if (!k) dot(P.L, HARM, me ? 7 : 6);
          if (!k || me)
            txt(
              P.L,
              '#' + (z.i + 1) + ' L ' + hms(z.tl).slice(3) + ' · ' + P.dL.toFixed(0) + ' NM',
              me ? SD_COL.YOU : HARM
            );
        });
      dot(P.turn, '#fff', 5);
      txt(P.turn, 'TURN ' + turnW + ' ' + hms(P.tTurn).slice(3) + ' · ARC ' + P.Ra.toFixed(0) + ' NM', '#fff');
      // where you are when the HARM hits: on the arc
      const pi = along(P.arc, ((P.tImp - P.tTurn) / 3600000) * P.gs);
      tag(pi, `<i class="sdimpm"></i>`, 'sdimp');
      txt(pi, '◆ ' + hms(P.tImp).slice(3) + ' · ON THE ARC', IMP);
      tag(s, `<i class="sdimpm"></i>`, 'sdimp');
      // the egress: dashed, a smooth curve out of the arc
      path(P.egrPath, ROLE_COL.shooter, meRole == 'shooter', true);
      txt(P.egrPath[P.egrPath.length - 1], 'EGRESS ' + hms(P.tEnd).slice(3), ROLE_COL.shooter);
    } else {
      // from the Training Manual, with the HARM: fighting wing to the anchor, the hunter round inside the WEZ, the killer the same way outside;
      // when the SAM shoots at the hunter (red), the hunter defends and goes back; the killer (Hunter-Killer) turns in and shoots its HARM, (bombs)
      // marks the SAM, then from the anchor attacks with the profile chosen while the hunter covers
      const hn = seatsOf('hunter'),
        kl = seatsOf('killer'),
        cv = seatsOf('cover'),
        meH = hn.some(i => mine(i)),
        meK = kl.some(i => mine(i)),
        wIn = [at(s, P.th, P.Da + 14), P.A];
      const side = (q, d) =>
        q.map(p => {
          const dx = p.x - s.x,
            dy = p.y - s.y,
            l = Math.hypot(dx, dy) || 1;
          return { x: p.x + (-dy / l) * d * P.dir, y: p.y + (dx / l) * d * P.dir };
        });
      // the way in: the two aircraft side by side (fighting wing) to the anchor
      if (hn.length) path(side([wIn[0]], 0.8 * KM_NM).concat([P.A]), ROLE_COL.hunter, meH);
      if (kl.length) path(side([wIn[0]], -0.8 * KM_NM).concat([P.A]), ROLE_COL.killer, meK);
      txt(
        wIn[0],
        (X.me.n == 2 ? '2-SHIP ' : '') + 'FIGHTING WING · ' + Math.round(P.alt).toLocaleString('en-US') + ' FT',
        '#e2e8f0'
      );
      if (hn.length) {
        path(P.hIn.concat(P.arc), ROLE_COL.hunter, meH, false, P.arc);
        path(P.def, ROLE_COL.hunter, meH, true);
        txt(
          P.arc[Math.floor(P.arc.length * 0.25)],
          'HUNTER ' + nums(hn) + ' · BAIT ' + P.Rb.toFixed(0) + ' NM, ECM ON',
          ROLE_COL.hunter
        );
        // the SAM shoots at the hunter: a red mark across its line
        const p = P.launchH,
          d = Math.hypot(p.x - s.x, p.y - s.y) || 1,
          u = { x: (p.x - s.x) / d, y: (p.y - s.y) / d },
          k = Math.max(0.6, P.R * 0.06) * KM_NM;
        line(
          [
            { x: p.x - u.x * k, y: p.y - u.y * k },
            { x: p.x + u.x * k, y: p.y + u.y * k },
          ],
          { color: '#ff3b3b', weight: 3.5 }
        );
        txt(p, 'SAM SHOOTS ' + hms(P.tLaunch).slice(3) + ': HUNTER DEFENDS (ECM · CHAFF · NOTCH)', '#ff5a5a');
      }
      if (kl.length) {
        path(P.kPath, ROLE_COL.killer, meK, false, P.kPath.slice(P.kIn.length));
        path(P.kBack, ROLE_COL.killer, meK, true);
        txt(
          P.kArc[Math.floor(P.kArc.length * 0.2)],
          'KILLER ' + nums(kl) + ' · ' + P.Rk.toFixed(0) + ' NM, OUTSIDE THE WEZ',
          ROLE_COL.killer
        );
        if (t == 'hk') {
          // the HARM: the launch, its line to the SAM, the impact where the killer is then
          line([P.Lk, s], { color: HARM, weight: meK ? 2.6 : 2 });
          dot(P.Lk, HARM, meK ? 7 : 6);
          txt(P.Lk, nums(kl) + ' L ' + hms(P.tHL).slice(3) + ' · ' + P.dLk.toFixed(0) + ' NM', meK ? SD_COL.YOU : HARM);
          tag(P.impK, `<i class="sdimpm"></i>`, 'sdimp');
          txt(P.impK, '◆ ' + hms(P.tImpK).slice(3), IMP);
          tag(s, `<i class="sdimpm"></i>`, 'sdimp');
        } else {
          // bombs: the mark, then the attack from the anchor to the profile chosen
          tag(P.markK, `<b class="ddmk" style="color:${ROLE_COL.killer}">+</b>`);
          txt(P.markK, 'KILLER MARKS (MARK POINT) ' + hms(P.tLaunch).slice(3), ROLE_COL.killer);
          const al = atkLines(),
            p0 = al && al.segs && al.segs[0] && al.segs[0].pts[0];
          if (p0) path([P.A, p0], ROLE_COL.killer, meK);
          if (al && al.segs) {
            al.segs.forEach(z => {
              line(z.pts, { color: c.halo, weight: 5, opacity: 0.5 });
              line(z.pts, { color: z.col, weight: 2.4, dashArray: z.dash || '' });
            });
            al.marks.forEach(m => {
              dot(m, m.col, 4);
              if (m.l) txt(m, String(m.l).toUpperCase(), m.col);
            });
          }
          if (hn.length) {
            dot(P.coverPt, ROLE_COL.hunter, 6);
            txt(P.coverPt, 'HUNTER ' + nums(hn) + ' COVER POINT', ROLE_COL.hunter);
          }
        }
      }
      // top cover (the cover role): apart, on the other side of the way in
      if (cv.length) {
        path(
          P.cover,
          ROLE_COL.cover,
          cv.some(i => mine(i)),
          true,
          P.cover
        );
        txt(P.cover[Math.floor(P.cover.length / 2)], nums(cv) + ' TOP COVER', ROLE_COL.cover);
      }
      dot(P.A, '#e2e8f0', 6, 'd');
      txt(P.A, 'ANCHOR · OA1', '#e2e8f0');
    }
    if (fit) {
      fit = false;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(fitPts().map(ll)), { padding: [40, 40], maxZoom: 10, animate: false });
    }
    const S0 = map.latLngToContainerPoint(ll(s)),
      used = [{ x: S0.x - 8, y: S0.y - 12, w: 16 + (s.name.length + 12) * 6.6, h: 20 }];
    LB.forEach(({ p, s2, col, cls }) => {
      const q = map.latLngToContainerPoint(ll(p)),
        w = String(s2).length * 7.2 + 12,
        h = 17,
        cw = map.getContainer().clientWidth,
        // away from the SAM, unless the text would go out of the map on that side
        left = q.x < S0.x - 2 ? q.x - 10 - w >= 2 || q.x + 10 + w > cw : q.x + 10 + w > cw - 2 && q.x - 10 - w >= 2;
      let dy = 0;
      for (const d of [0, 17, -17, 34, -34, 51, -51]) {
        const r = { x: left ? q.x - 10 - w : q.x + 10, y: q.y - 9 + d, w, h };
        if (!used.some(u => r.x < u.x + u.w && u.x < r.x + r.w && r.y < u.y + u.h && u.y < r.y + r.h)) {
          dy = d;
          used.push(r);
          break;
        }
      }
      L.marker(ll(p), {
        icon: L.divIcon({
          className: 'sdtag ' + cls + (left ? ' ddlf' : ''),
          html: `<span class="ddtx" style="color:${col};top:${dy - 9}px">${s2}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
    });
  }
  async function draw(rebuild) {
    if (!shown) return;
    if (!H && deps.harm) {
      try {
        H = await deps.harm();
      } catch (e) {
        H = null;
      }
      if (!shown) return;
    }
    const was = !!P;
    compute();
    // a new flight, target or tactic: the map fits again; any other change keeps the zoom chosen
    const fk = P && X && X.ok ? X.me.key + '|' + sam().id + '|' + tactic() : '';
    if (fk !== fitKey) {
      fitKey = fk;
      fit = true;
    }
    if (rebuild || was !== !!P || !root.querySelector(P ? '.dg' : '.sdnone')) {
      detachMap();
      failed = false;
      pend = null;
      build();
    }
    fill();
    paint();
  }
  function wire() {
    acts.onclick = e => root.onclick && root.onclick(e); // the buttons at the top (outside the page) work as the page's
    root.onclick = async e => {
      const c = s => e.target.closest && e.target.closest(s);
      if (c('select, input')) return;
      // a new target or tactic fits the map again; the other parameters keep the zoom
      const set = (k, v) => {
        st[k] = v;
        if (k == 'tactic') fit = true;
        save();
        return draw(false);
      };
      const tc = c('[data-ddtac]');
      if (tc) return set('tactic', tc.dataset.ddtac);
      const sd = c('[data-ddside]');
      if (sd) return set('side', sd.dataset.ddside);
      const md = c('[data-ddmode]');
      if (md) return set('mode', md.dataset.ddmode);
      const sb = c('[data-ddsub]');
      if (sb) return set('sub', sb.dataset.ddsub);
      const vw = c('[data-ddview]');
      if (vw) return set('view', vw.dataset.ddview);
      const rl = c('[data-ddrole]');
      if (rl) {
        // the role chosen; the other aircraft of its pair takes the partner role, unless it was chosen by hand
        const [i, r] = rl.dataset.ddrole.split(':'),
          t = tactic(),
          a = roles(),
          hd = Array.isArray(st.hand[t]) ? st.hand[t].slice() : [],
          p = +i ^ 1;
        a[+i] = r;
        hd[+i] = true;
        // two roles only (#1-#2, HARM standoff): the partner always the other one; three (the element of Hunter-Killer): unless chosen by hand
        if (p < a.length && (rolesOf(t, p).length == 2 || !hd[p])) {
          const q = partnerRole(t, r);
          if (rolesOf(t, p).includes(q)) a[p] = q;
        }
        st.roles = { ...st.roles, [t]: a };
        st.hand = { ...st.hand, [t]: hd };
        save();
        return draw(false);
      }
      if (c('[data-ddinfo]')) {
        const p = root.querySelector('.ddpop');
        if (p) {
          p.hidden = !p.hidden;
          if (!p.hidden) {
            p.classList.remove('fxin');
            void p.offsetWidth;
            p.classList.add('fxin');
          }
        }
        return;
      }
      const ak = c('[data-ddatk]');
      if (ak) return set('atk', ak.dataset.ddatk || null);
      const ad = c('[data-ddadd]');
      if (ad) return addAnchor(ad.dataset.ddadd);
      if (c('[data-ddoaw]')) return writeOA();
      if (c('[data-ddfit]')) {
        fit = true;
        return paint();
      }
      if (c('[data-ddtab]')) return tables();
      if (c('[data-ddppt]')) return ppt();
      if (c('[data-ddcard]')) return addCard(c('[data-ddcard]'));
    };
    root.onchange = e => {
      const d = e.target.dataset || {};
      if (d.ddtgt != null) {
        st.tgt = e.target.value;
        fit = true;
      } else if (d.ddecm != null) st.ecm = +e.target.value;
      else if (d.ddel != null) st.oaEl = { ...st.oaEl, [d.ddel]: +e.target.value };
      else if (d.ddpptt != null) st.ppt = { ...st.ppt, [d.ddpptt]: e.target.value };
      else return;
      save();
      draw(false);
    };
    // the ECM slider: the rings and the plan follow it while it moves
    root.oninput = e => {
      const d = e.target.dataset || {};
      if (d.ddecm != null) st.ecm = +e.target.value;
      else if (d.ddel != null) st.oaEl = { ...st.oaEl, [d.ddel]: +e.target.value };
      else return;
      draw(false);
    };
    const po = root.querySelector('[data-ddpf]');
    if (po) {
      const LAB = ['Map filters', 'No filters', 'Plan', 'Plan + PPT'];
      po.onclick = () => {
        po.textContent = LAB[deps.cyclePlan ? deps.cyclePlan() : 0];
        paint();
      };
      po.textContent = LAB[deps.planMode ? deps.planMode() : 0];
    }
  }
  async function addAnchor(k) {
    const p = P.A,
      T = pptTypes(),
      sel = root.querySelector('[data-ddpptt="' + k + '"]'),
      e = T.find(x => x.name == (sel ? sel.value : st.ppt[k])) || T[0],
      an = 'the anchor';
    if (!e) return deps.toast('The PPT types are read from Ppt.ini: open the BMS folder first.', true);
    if (
      !(await deps.confirm(
        'Add ' + an + ' to the DTC as a pre-planned point of type ' + e.label + ' (' + e.name + ')?'
      ))
    )
      return;
    const r = deps.addPpt({ x: p.x, y: p.y, name: e.name, label: an });
    deps.toast(r.msg, r.bad);
  }
  async function writeOA() {
    const o = P.oa;
    if (!o || !(o.n >= 1 && o.n <= 24)) return;
    if (!deps.dtc.has('NAV OFFSETS')) return deps.toast('This DTC has no NAV OFFSETS section.', true);
    if (
      !(await deps.confirm(
        `Write the anchor as the nav offset OA1 of STPT ${o.n}?\n\nOA1-${o.n} = ${o.oa1.brg}°, ${o.oa1.nm.toFixed(1)} nm, ${elOf('oa1')} ft`
      ))
    )
      return;
    deps.dtc.setOA('OA1-' + o.n, [o.oa1.brg, o.oa1.rngFt, elOf('oa1')].join(','));
    deps.toast('OA1 of STPT ' + o.n + ' written to the DTC.');
  }
  async function tables() {
    const T = deps.dtc.harm(),
      s = sam();
    if (!T) return deps.toast('Open a DTC with a HARM section first: the tables are in it.', true);
    if (s.code == null) return deps.toast('The HARM has no ALIC for ' + s.name + '.', true);
    if (inTables(s.code).length) return deps.toast(s.name + ' is in the HARM tables: ' + tabTxt(s.code) + '.');
    const free = [];
    T.forEach((row, t) => row.forEach((c, n) => (!c || isNaN(c)) && free.push([t, n])));
    const at = free[0] || [2, 4],
      old = threatOf(T[at[0]][at[1]]);
    if (
      !(await deps.confirm(
        `${s.name} (ALIC ${s.code}) is not in the HARM tables.\n\n→ table ${at[0] + 1}, slot ${at[1] + 1}${free.length ? ' (free)' : ' (replaces ' + (old ? old[1] : T[at[0]][at[1]]) + ')'}\n\nWrite it into the HARM tables of the DTC?`
      ))
    )
      return;
    deps.dtc.setHarm(at[0], at[1], s.code);
    deps.toast(s.name + ' written into the HARM tables.');
    draw(false);
  }
  async function ppt() {
    const s = sam(),
      m = await deps.ppt([{ x: s.x, y: s.y, rng: s.rng, name: s.name }]);
    if (m) deps.toast(m);
  }

  // ---- the cards
  function cardData() {
    const s = sam(),
      t = tactic(),
      R = roles(),
      me = X.seat != null ? X.seat : 0,
      z = P.seats.find(w => w.i == me) || P.seats[0];
    let box;
    if (t == 'hs')
      box =
        z && z.role == 'shooter'
          ? [
              [
                'YOUR ROLE',
                'SHOOTER',
                seatName(me) + ' · ' + mode().toUpperCase() + (mode() == 'pos' ? ' ' + sub() : ''),
              ],
              ['LAUNCH', hms(z.tl), P.dL.toFixed(1) + ' NM · HDG ' + h3(z.brgL) + '°', true],
              ['THEN', 'TURN ' + (st.side == 'R' ? 'L' : 'R'), hms(P.tTurn) + ' · ARC ' + P.Ra.toFixed(0) + ' NM'],
              ['◆ IMPACT · TOF', hms(z.imp), z.tof + ' S'],
            ]
          : [
              ['YOUR ROLE', 'COVER', seatName(me)],
              ['ARC', (P.Ra + 4).toFixed(0) + ' NM', hms(P.tTurn)],
              ['SHOOTERS', P.seats.filter(w => w.role == 'shooter').length + '', 'L ' + hms(P.tL)],
              ['◆ IMPACT', hms(P.tImp), ''],
            ];
    else {
      const r = R[me];
      box =
        r == 'hunter'
          ? [
              ['YOUR ROLE', 'HUNTER', seatName(me)],
              ['ANCHOR', hms(P.tA), P.oa ? h3(P.oa.oa1.brg) + '° ' + P.oa.oa1.nm.toFixed(0) + ' NM · OA1' : ''],
              ['BAIT · ECM ON', 'ARC ' + P.Rb.toFixed(0), hms(P.tArc0) + '–' + hms(P.tArc1).slice(3)],
              ['SAM SHOOTS', hms(P.tLaunch), 'DEFEND, BACK TO THE ANCHOR' + (t == 'bomb' ? ' · COVER POINT' : '')],
            ]
          : r == 'killer'
            ? [
                ['YOUR ROLE', 'KILLER', seatName(me)],
                ['ANCHOR', hms(P.tA), P.oa ? h3(P.oa.oa1.brg) + '° ' + P.oa.oa1.nm.toFixed(0) + ' NM · OA1' : ''],
                ...(t == 'hk'
                  ? [
                      [
                        'HARM LAUNCH',
                        hms(P.tHL),
                        P.dLk.toFixed(1) + ' NM · ' + h3(P.attackHdg) + '° · ' + mode().toUpperCase(),
                        true,
                      ],
                      ['◆ IMPACT · TOF', hms(P.tImpK), P.tofK + ' S'],
                    ]
                  : [
                      ['MARK', hms(P.tLaunch), 'WHEN THE SAM SHOOTS AT THE HUNTER'],
                      [
                        'ATTACK',
                        hms(P.tAtk),
                        'FROM THE ANCHOR' + (st.atk ? ' · ' + ATKN[st.atk].toUpperCase() : ''),
                        true,
                      ],
                    ]),
              ]
            : [
                ['YOUR ROLE', 'COVER', seatName(me)],
                ['ORBIT', (P.Da + 2).toFixed(0) + ' NM', 'THE OTHER SIDE OF THE WAY IN'],
                ['FROM', hms(P.tA), ''],
                ['', '', ''],
              ];
    }
    return {
      title: X.me.name + ' · ' + X.me.n + '× ' + X.me.ac,
      sub:
        'PACKAGE ' +
        X.me.pkgNo +
        (X.me.tot ? ' · TOT ' + X.me.tot : '') +
        ' · ' +
        { hs: 'HARM STANDOFF', hk: 'HUNTER-KILLER', bomb: 'BOMBS / MAVERICK' }[t],
      tgt:
        s.name.toUpperCase() +
        (s.code != null ? ' · ALIC ' + s.code : '') +
        (tabTxt(s.code) ? ' · ' + tabTxt(s.code) : ''),
      rings:
        'WEZ ' + P.R.toFixed(0) + ' NM · ECM ON ' + P.Recm.toFixed(0) + ' NM · SEARCH ' + P.Rdet.toFixed(0) + ' NM',
      seatName: seatName(me),
      box,
      telar: s.telar >= 0 ? s.telar : -1,
      alt:
        P.rating.ok && !P.slow
          ? ''
          : Math.round(P.alt).toLocaleString('en-US') +
            ' FT: ' +
            P.rating.r +
            (P.rating.ok ? '' : ', NOT OPTIMAL') +
            ' · optimal above 30 000 ft or 50–300 ft AGL · ' +
            P.gs +
            ' kt' +
            (P.slow ? ' (350 kt or more)' : ' ✓'),
      steps: steps().map(o => ({ me: o.me, sh: o.sh, s: o.s })),
      oa: t == 'hs' || !P.oa ? null : { ...P.oa, oa1: { ...P.oa.oa1, el: elOf('oa1') } },
      seats: R.map((r, i) => {
        const w = P.seats.find(q => q.i == i);
        return {
          me: mine(i),
          go: r == 'shooter' || r == 'killer', // the times of a launch or an attack (green when yours)
          seat: seatName(i),
          role: ROLE_NAME[r].toUpperCase(),
          times:
            t == 'hs'
              ? w && w.role == 'shooter'
                ? 'L ' + hms(w.tl) + ' · ◆ ' + hms(w.imp)
                : 'ARC ' + hms(P.tTurn)
              : r == 'hunter'
                ? 'BAIT ' + hms(P.tArc0) + ' · SAM SHOOTS ' + hms(P.tLaunch) + ' · ANCHOR ' + hms(P.tBack)
                : r == 'killer'
                  ? t == 'hk'
                    ? 'HARM ' + hms(P.tHL) + ' · ◆ ' + hms(P.tImpK)
                    : 'MARK ' + hms(P.tLaunch) + ' · ATTACK ' + hms(P.tAtk)
                  : 'COVER ' + hms(P.tA),
        };
      }),
      lanes: phases().map(l => ({
        ...l,
        seat: seatName(l.i),
        me: mine(l.i),
        col: ROLE_COL[l.role],
        name: ROLE_NAME[l.role].toUpperCase(),
      })),
      px: null,
    };
  }
  // the plan for the card picture: the paths and the marks in map points (drawn on the picture, not captured with it)
  function geo() {
    const t = tactic(),
      R = roles(),
      me = X.seat != null ? R[X.seat] : null,
      paths = [],
      marks = [],
      add = (pts, r, m, w, dash, arrow) => {
        paths.push({ pts, col: ROLE_COL[r], w, dash, me: m });
        const v = arrow && flow(arrow);
        if (v) v.forEach(q => paths.push({ pts: q, col: ROLE_COL[r], w: 1.6 }));
      };
    const mw = timed(X.me.f.wps);
    if (mw.length > 1) paths.push({ pts: mw, col: pal().plan, w: 3 });
    if (t == 'hs') {
      add(P.path, 'shooter', me == 'shooter', 5, false, P.arc);
      add(P.egrPath, 'shooter', me == 'shooter', 4, true);
      P.seats.filter(z => z.role == 'cover').forEach(z => add(z.arc, 'cover', mine(z.i), 4, true, z.arc));
      paths.push({ pts: [P.L, sam()], col: HARM, w: 3 });
      const z = P.seats.find(w => w.role == 'shooter' && mine(w.i)) || P.seats.find(w => w.role == 'shooter');
      marks.push({
        p: P.L,
        k: 'pt',
        col: HARM,
        tc: z && mine(z.i) ? SD_COL.YOU : HARM,
        l: z ? '#' + (z.i + 1) + ' L ' + hms(z.tl).slice(3) + ' · ' + P.dL.toFixed(0) + ' NM' : 'L',
      });
      marks.push({ p: P.turn, k: 'pt', col: '#fff', l: 'TURN ' + hms(P.tTurn).slice(3) });
      marks.push({ p: sam(), k: 'imp' });
    } else {
      // as paint draws it
      const has = r => R.includes(r);
      if (has('hunter')) {
        add(P.hIn.concat(P.arc), 'hunter', me == 'hunter', 5, false, P.arc);
        add(P.def, 'hunter', me == 'hunter', 4, true);
        marks.push({ p: P.launchH, k: 'pt', col: '#ff3b3b', l: 'SAM SHOOTS: HUNTER DEFENDS' });
        if (t == 'bomb') marks.push({ p: P.coverPt, k: 'pt', col: ROLE_COL.hunter, l: 'HUNTER COVER POINT' });
      }
      if (has('killer')) {
        add(P.kPath, 'killer', me == 'killer', 5, false, P.kArc);
        add(P.kBack, 'killer', me == 'killer', 4, true);
        if (t == 'hk') {
          paths.push({ pts: [P.Lk, sam()], col: HARM, w: 3 });
          marks.push({
            p: P.Lk,
            k: 'pt',
            col: HARM,
            tc: me == 'killer' ? SD_COL.YOU : HARM,
            l: 'L ' + hms(P.tHL).slice(3),
          });
          marks.push({ p: P.impK, k: 'imp' }, { p: sam(), k: 'imp' });
        } else marks.push({ p: P.markK, k: 'pt', col: ROLE_COL.killer, l: 'KILLER MARKS' });
      }
      if (has('cover')) add(P.cover, 'cover', me == 'cover', 4, true, P.cover);
      marks.push({ p: P.A, k: 'anc', col: '#e2e8f0', l: 'ANCHOR · OA1' });
    }
    return { paths, marks };
  }
  // the map for the card: the lent map fitted to the search radar, a picture of it (without the plan), the plan in its pixels. With the scheme shown, the
  // map is opened out of sight for the picture and closed again
  async function snapPlan(AR) {
    if (!deps.snap) return null;
    const off = st.view != 'map',
      w = root.querySelector('#ddmapw');
    if (off && w) {
      w.hidden = false;
      w.classList.add('ddoff');
    }
    try {
      // the view of the preview (yours: its centre and zoom) when the map is open; else the Fit view
      let keep = !!M;
      if (!M) {
        failed = false;
        await ensureMap();
        if (!M) return null;
        keep = false;
      }
      M.map.invalidateSize();
      paint(true);
      return await snapNow(AR, keep);
    } finally {
      if (off && w) {
        w.classList.remove('ddoff');
        w.hidden = true;
        detachMap(true);
        failed = false;
        pend = null;
      }
    }
  }
  async function snapNow(AR, keep) {
    const { map, L, WL } = M,
      ll = p => deps.toLL(p.x, p.y),
      s = sam(),
      G = geo(),
      hg = harmGeo(),
      el = map.getContainer(),
      cw = el.clientWidth,
      ch = el.clientHeight,
      bw = Math.min(cw, ch * AR),
      bh = bw / AR,
      ox = (cw - bw) / 2,
      oy = (ch - bh) / 2,
      c0 = map.getCenter(),
      z0 = map.getZoom();
    WL.remove();
    try {
      if (!keep)
        map.fitBounds(L.latLngBounds(fitPts().map(ll)), {
          paddingTopLeft: [ox + 10, oy + 10],
          paddingBottomRight: [ox + 10, oy + 10],
          maxZoom: 10,
          animate: false,
        });
      await new Promise(r => setTimeout(r, keep ? 600 : 1200));
      const sh = await deps.snap(2);
      if (!sh) return null;
      const k = sh.canvas.width / cw,
        px = p => {
          const q = map.latLngToContainerPoint(ll(p));
          return [(q.x - ox) * k, (q.y - oy) * k];
        },
        nmPx = Math.hypot(...[0, 1].map(i => px({ x: s.x + KM_NM, y: s.y })[i] - px(s)[i])),
        crop = document.createElement('canvas'),
        c = pal(),
        hs = tactic() == 'hs';
      crop.width = Math.round(bw * k);
      crop.height = Math.round(bh * k);
      crop.getContext('2d').drawImage(sh.canvas, -ox * k, -oy * k);
      return {
        img: crop,
        coast: sh.coast,
        ring: c.ring,
        sam: {
          c: px(s),
          R: P.R * nmPx,
          Recm: P.Recm * nmPx,
          Rdet: P.Rdet * nmPx,
          rTh: hs && hg ? (hg.rMax / NM) * nmPx : 0,
          seek: hs && hg && hg.seekerOn ? hg.seekerOn.nm * nmPx : 0,
          foot: hs && hg && hg.foot ? hg.foot.map(p => px(ftKm(p))) : null,
          name: s.name,
        },
        paths: G.paths.map(a => ({ ...a, pts: a.pts.map(px) })),
        marks: G.marks.map(m => ({ ...m, p: px(m.p) })),
        nm: nmPx,
      };
    } catch (e) {
      return null;
    } finally {
      WL.addTo(map);
      map.setView(c0, z0, { animate: false });
      fit = false;
    }
  }
  function drawCard(D, kind) {
    const c = document.createElement('canvas');
    c.width = DDC_W;
    c.height = DDC_H;
    drawDeadCard(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), D, kind);
    return c;
  }
  async function addCard(btn) {
    if (!deps.kbAdd || !P) return;
    btn.disabled = true;
    const bt = btn.textContent;
    btn.textContent = 'Preparing the map…';
    let D;
    try {
      D = cardData();
      const B = deadBox(D);
      D.px = await busyRun('Preparing the DEAD cards…', () => snapPlan(B.w / B.h)); // the loading bar of the map while the picture is taken
    } catch (e) {
      btn.disabled = false;
      btn.textContent = bt;
      return deps.toast('DEAD card: ' + ((e && e.message) || e), true);
    }
    btn.disabled = false;
    btn.textContent = bt;
    const KINDS = [
        ['map', 'With the map'],
        ['sch', 'With the scheme'],
      ],
      C = Object.fromEntries(KINDS.map(([k]) => [k, drawCard(D, k)])),
      on = { map: true };
    const d = document.createElement('dialog');
    d.className = 'tgdlg';
    d.innerHTML = `<h3>Add DEAD cards to the Kneeboard</h3><p class="hint">Both have your role, the steps and the flight; one has the map (the map of the Map page, with the plan drawn on it), the other the scheme.</p><div class="tgcards"></div><div class="tgbar"><span class="tgsp"></span><button type="button" class="btn g" data-a="no">Cancel</button><button type="button" class="btn" data-a="ok">Add</button></div>`;
    document.body.append(d);
    const cnt = () => {
      const n = KINDS.filter(([k]) => on[k]).length,
        b = d.querySelector('[data-a=ok]');
      b.textContent = n ? `Add ${n} card${n > 1 ? 's' : ''}` : 'Add';
    };
    KINDS.forEach(([k, l]) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'tgcard' + (on[k] ? ' on' : '');
      it.dataset.kind = k;
      const th = document.createElement('canvas');
      th.width = 300;
      th.height = 450;
      th.getContext('2d').drawImage(C[k], 0, 0, 300, 450);
      const sp = document.createElement('span');
      sp.textContent = l;
      it.append(th, sp);
      it.onclick = () => {
        on[k] = !on[k];
        it.classList.toggle('on', on[k]);
        cnt();
      };
      d.querySelector('.tgcards').append(it);
    });
    cnt();
    const close = () => {
      d.close();
      setTimeout(() => d.remove(), 200);
    };
    d.querySelector('[data-a=no]').onclick = close;
    d.addEventListener('cancel', e => {
      e.preventDefault();
      close();
    });
    d.querySelector('[data-a=ok]').onclick = async () => {
      const L = KINDS.filter(([k]) => on[k]);
      if (!L.length) return;
      close();
      const out = [];
      for (const [k] of L) {
        const blob = await new Promise(r => C[k].toBlob(r, 'image/png'));
        if (!blob) continue;
        const at = await deps.kbAdd(blob, 'DEAD · ' + X.me.name + (k == 'sch' ? ' · scheme' : ''));
        out.push(at ? 'the ' + at.side + ' column, card ' + (at.row + 1) : 'among the unused cards');
      }
      deps.toast('DEAD card' + (out.length > 1 ? 's' : '') + ' added to the Kneeboard: ' + out.join('; ') + '.');
    };
    d.showModal();
  }

  return {
    root,
    acts: () => acts,
    // shown again (the Weapons page draws its tab again at many changes): the page and its map stay, so the zoom chosen stays
    render: () => {
      shown = true;
      ALk = '';
      draw(false);
    },
    refresh: () => {
      ALk = ''; // the Weapons page may have changed: its attack lines again
      if (shown) draw(false);
    },
    leave: () => {
      shown = false;
      detachMap();
    },
    usable: () => {
      const c = deps.ctx();
      return !!(c && c.ok && c.sams && c.sams.length);
    },
    state: () => st,
    setState: o => {
      if (o && typeof o == 'object') {
        st = { ...st, ...o };
        norm();
        save();
        if (shown) draw(true);
      }
    },
    plan: () => P,
    steps: () => steps(),
    card: () => (P ? cardData() : null),
    cardCanvas: async kind => {
      if (!P) return null;
      const D = cardData(),
        B = deadBox(D);
      if (kind != 'sch') D.px = await snapPlan(B.w / B.h);
      const c = drawCard(D, kind || 'map');
      c.dataset.px = D.px ? '1' : '';
      return c;
    },
    _test: o => {
      if (o.ctx) deps.ctx = o.ctx;
      if (o.harm) {
        deps.harm = o.harm;
        H = null;
      }
    },
  };
}
