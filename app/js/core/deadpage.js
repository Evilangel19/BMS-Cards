// Weapons > HARM > DEAD: destroy the SAM of a DEAD flight (BMS Training Manual 28.4-28.5). The geometry is in dead.js; the HARM range and time of flight
// come from the HARM model (airmissile.js harmShot) with the missile of the HARM page. The page: the target (its rings, its radars, the location known or
// not, one fire control radar on each launcher), the tactic (HARM standoff, Hunter-Killer, Bombs / Maverick) and the orbit side, the roles of the
// seats, the altitude of the flight (the blocks of the manual), the map or the scheme, the steps, the shot or the attack, the nav offsets of the anchors
// (OA1 / OA2 from the target steerpoint, written to the DTC; an anchor as a PPT). Buttons that ask before they write: HARM tables, PPT, Add card.
// deps: {esc, toast, confirm, ctx() -> {ok, why} | {ok, me, sams, target, seat, harms, hts}, harm(), toLL, attach, detach, cyclePlan, planMode, layerOn,
//   pal, dtc: {harm(), setHarm(t, n, code), has(sec), setOA(key, value)}, ppt([{x, y, rng, name}]), addPpt({x, y, name}), openMode(mode), snap, kbAdd}
import { deadPlan, defaultRoles, ROLES, ALT_BLOCKS } from './dead.js';
import { timed, seatLabels } from './sead.js';
import { harmShot, NM, HARM_SUB } from './airmissile.js';
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
const ROLE_NAME = { shooter: 'Shooter', hunter: 'Hunter', killer: 'Killer', cover: 'Cover' };
const { HARM, IMP } = SD_COL,
  SEEK = '#22d3ee'; // where the HARM seeker opens (light blue as the HAS of the HARM page)

export function createDeadPage(deps) {
  const { esc } = deps,
    root = document.createElement('div');
  root.id = 'wpdead';
  let st = { tactic: null, side: 'R', ecm: 70, roles: {}, tgt: null, mode: null, sub: null, view: 'map', ppt: {} },
    M = null,
    pend = null,
    failed = false,
    fit = true,
    P = null,
    X = null,
    H = null,
    shown = false;
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
    st.tgt = typeof st.tgt == 'string' ? st.tgt : null;
    st.mode = st.mode == 'pos' || st.mode == 'had' ? st.mode : null;
    st.sub = ['EOM', 'PB', 'RUK'].includes(st.sub) ? st.sub : null;
    st.view = st.view == 'sch' ? 'sch' : 'map';
    const pp = st.ppt && typeof st.ppt == 'object' && !Array.isArray(st.ppt) ? st.ppt : {};
    st.ppt = Object.fromEntries(['oa1', 'oa2'].filter(k => typeof pp[k] == 'string').map(k => [k, pp[k]]));
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
    return d.map((q, i) => (ROLES[t].includes(r[i]) ? r[i] : q));
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

  // ---- the steps of the plan, for the page and the card (HARM standoff: your launches marked; the other tactics: the steps of your role)
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
      const H_ = who('hunter'),
        K_ = who('killer'),
        C_ = who('cover');
      O.push({
        me: true,
        t: P.tA,
        s: `${hms(P.tA)} split: ${H_.length ? list(H_) + ' hunter to anchor H (OA1)' : ''}${H_.length && K_.length ? ', ' : ''}${K_.length ? list(K_) + ' killer to anchor K (OA2)' : ''}, ${(P.Ra + 8).toFixed(0)} nm from the SAM`,
      });
      if (H_.length)
        O.push({
          me: me('hunter'),
          t: P.tArc0,
          s: `${list(H_)}: ${hms(P.tArc0)} the arc ${P.Ra.toFixed(0)} nm round the WEZ (SAM on the ${st.side == 'R' ? 'right' : 'left'}) to bait it; at its launch: ECM, chaff, notch, back to anchor H`,
        });
      if (K_.length)
        O.push({ me: me('killer'), t: P.tArc0, s: `${list(K_)}: mark the SAM (HAD box → markpoint, TGP to refine)` });
      O.push({
        me: true,
        t: P.tBack,
        s: `${hms(P.tBack)} reset at the anchors${t == 'bomb' ? '' : '; the killer chooses the attack (pop-up, loft, HARM HAD)'}`,
      });
      if (K_.length)
        O.push({
          me: me('killer'),
          t: P.tAtk,
          s: `${list(K_)}: ${hms(P.tAtk)} attack on ${h3(P.attackHdg)}°${t == 'bomb' ? ' (plan it on the Weapons page)' : ''}`,
        });
      if (C_.length || H_.length)
        O.push({
          me: me('cover') || me('hunter'),
          t: P.tAtk,
          s: `${list(C_.length ? C_ : H_)}: top cover, the arc ${(P.Ra + 4).toFixed(0)} nm on the other side`,
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
      return;
    }
    r.innerHTML = `<div class="wpg sdg dg"><div class="wpl sdl"><div class="wcard" id="ddtg"><div class="wh"><h3 id="ddtgh"></h3><span style="flex:1"></span><select data-ddtgt aria-label="Target"></select></div><div id="ddtgk"></div><div class="slr"><label>ECM on WEZ</label><input type="range" min="30" max="100" step="5" value="${st.ecm}" data-ddecm><em data-ddecme>${st.ecm}%</em></div></div><div class="wcard" id="ddtc"></div><div class="wcard" id="ddro"></div><div class="wcard" id="ddal"><div class="wh"><h3>Altitude · speed</h3><button type="button" class="ddinfo" aria-label="The altitude blocks of the manual" data-ddinfo>!</button></div><div id="ddalt"></div><div class="ddpop" hidden>${ALT_BLOCKS.map(([a, b, c]) => `<div style="background:${c}">${a}</div><div style="background:${c}">${b}</div>`).join('')}<p class="hint">BMS Training Manual 28.4 (the flight plan gives MSL)</p></div></div></div>
      <div class="wpc"><div class="wcard"><div class="wh"><h3>Horizontal plan</h3><span style="flex:1"></span><span class="seg sdvw">${[
        ['map', 'Map'],
        ['sch', 'Scheme'],
      ]
        .map(([v, l]) => `<button type="button" class="${st.view == v ? 'on' : ''}" data-ddview="${v}">${l}</button>`)
        .join(
          ''
        )}</span><button class="btn g" type="button" data-ddfit>Fit view</button><button class="btn g" type="button" style="min-width:104px" data-ddpf>Map filters</button></div>
      <div id="ddmapw"><div id="ddmap" class="wmapbox"></div><div class="wleg" id="ddleg"></div></div><div id="ddsch" hidden></div></div></div>
      <div class="wpr"><div class="wcard" id="ddst"></div><div class="wcard" id="dddt"></div><div id="ddoa"></div><div id="ddwn"></div></div></div>
      <div class="sdbar"><span class="hint" id="ddnote"></span><span style="flex:1"></span><button type="button" class="btn g" data-ddtab title="Checks the HARM tables of the DTC for the target: adds it only after asking">HARM tables…</button><button type="button" class="btn g" data-ddppt title="The target as a pre-planned threat of the DTC (the AUTO PPT of the Map page), after asking">PPT…</button><button type="button" class="btn" data-ddcard title="A DEAD card for the Kneeboard: with the map or with the scheme">Add card…</button></div>`;
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
      `<div class="kv">${kv('ALIC', s.code == null ? 'none' : s.code + (th ? ' ' + esc(th[1]) : '') + (tb ? ' · ' + tb : deps.dtc.harm() ? ' · <span class="sdw">not in a table</span>' : ''))}${kv('WEZ', P.R.toFixed(0) + ' nm · ECM on ' + P.Recm.toFixed(0) + ' nm (' + st.ecm + '%)')}${kv('SEARCH RADAR', P.Rdet.toFixed(0) + ' nm')}${kv('TRACKING RADAR', s.fcr ? 'alive (the priority)' : 'destroyed', s.fcr ? 'sdok' : 'wbad')}${kv('LOCATION', s.spotted ? 'known (spotted)' : 'unknown: not spotted', s.spotted ? '' : 'sdw')}</div>${
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
        )}</span>${t == 'hs' ? `<span class="seg sm" data-fx="md">${['pos', 'had'].map(v => `<button type="button" class="${mode() == v ? 'on' : ''}" data-ddmode="${v}">${v.toUpperCase()}</button>`).join('')}</span><span class="seg sm" data-fx="sb">${['EOM', 'PB', 'RUK'].map(v => `<button type="button" class="${sub() == v ? 'on' : ''}" data-ddsub="${v}">${v}</button>`).join('')}</span>` : ''}</div><p class="hint wnote">${
        t == 'hs'
          ? 'Location known: launch outside the WEZ, then fly the arc round it inside the search radar, so the SAM radiates and the HARM finds it (a HARM misses a radar that is off).'
          : t == 'hk'
            ? 'Location unknown: the hunter baits the SAM on the arc, the killer marks it, both reset at the anchors, the killer attacks while the other covers.'
            : 'No HARM: Mavericks, CBUs or IAMs. Plan the attack on the Weapons page (pop-up, loft, high or medium altitude) from the killer anchor.'
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
                ? 'anchor H · the arc ' + P.Ra.toFixed(0) + ' nm'
                : r == 'killer'
                  ? 'anchor K · attack ' + h3(P.attackHdg) + '°'
                  : 'top cover';
        return `<div class="ddtile${mine(i) ? ' me' : ''}" data-fx="tile${i}"><div class="th"><span class="no">#${i + 1}</span><span>${i == 0 ? 'LEAD' : i == 2 ? 'ELEMENT' : 'WINGMAN'}</span>${mine(i) ? '<span class="you">YOU</span>' : ''}</div><div class="chips">${ROLES[
          t
        ]
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
        .map(o => `<li class="${o.me ? 'sdme' : ''}">${esc(o.s)}</li>`)
        .join('')}</ol>`
    );
    put(q('#dddt'), detail());
    put(q('#ddoa'), t == 'hs' ? '' : oaCard());
    put(
      q('#ddwn'),
      P.warn
        .map(w => `<div class="wcard sdpb" data-fx="w${esc(w)}"><h3>Check</h3><p class="sdw">${esc(w)}</p></div>`)
        .join('')
    );
    put(
      q('#ddnote'),
      X.seat != null
        ? 'Your seat: <b class="sdme">' + esc(seatName(X.seat)) + ' · ' + esc(ROLE_NAME[R[X.seat]] || '') + '</b>'
        : ''
    );
    const vm = st.view == 'map';
    root.querySelectorAll('[data-ddview]').forEach(b => b.classList.toggle('on', b.dataset.ddview == st.view));
    q('#ddmapw').hidden = !vm;
    q('#ddsch').hidden = vm;
    q('[data-ddfit]').hidden = !vm;
    q('[data-ddpf]').hidden = !vm;
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
    const k = P.seats.find(w => w.role == 'killer');
    return `<h3>${t == 'bomb' ? 'Attack' : 'Killer'}${k ? ' · ' + esc(seatName(k.i)) : ''}</h3><div class="kv">${kv('FROM', 'anchor K · ' + (P.Ra + 8).toFixed(0) + ' nm · ' + hms(P.tAtk))}${kv('RUN-IN', h3(P.attackHdg) + '°', k && mine(k.i) ? 'sdme' : '')}${kv('WEZ', 'enters at ' + P.R.toFixed(0) + ' nm · ECM on ' + P.Recm.toFixed(0) + ' nm')}${kv('HUNTER', P.seats.some(w => w.role == 'hunter') ? 'the arc ' + P.Ra.toFixed(0) + ' nm · ' + hms(P.tArc0) + '–' + hms(P.tArc1) : '—')}</div><div class="ddbtns"><span class="hint">Plan the attack:</span>${[
      ['popup', 'Pop-up'],
      ['hadb', 'HADB'],
      ['toss', 'TOSS (loft)'],
    ]
      .map(
        ([m, l]) =>
          `<button type="button" class="btn g" data-ddopen="${m}" title="Opens the ${l} page with the target steerpoint nearest to ${esc(sam().name)}">${l}</button>`
      )
      .join('')}</div>`;
  }
  // the PPT types BMS knows (Ppt.ini) that are not SAMs: an anchor added as one of them
  const pptTypes = () => (deps.pptTypes ? deps.pptTypes() : []);
  function oaCard() {
    if (!P.oa) return '';
    const o = P.oa,
      route = o.n >= 1 && o.n <= 24,
      T = pptTypes(),
      row = (k, a, nmS, col) => {
        const v = st.ppt[k] && T.some(e => e.name == st.ppt[k]) ? st.ppt[k] : T[0] ? T[0].name : '';
        return `<tr><td><b>${k.toUpperCase()}</b></td><td>${String(a.brg).padStart(3, '0')}°</td><td>${a.nm.toFixed(1)} NM</td><td>0</td><td style="color:${col};font-weight:700">${nmS}</td></tr><tr class="oapt"><td></td><td colspan="4"><select data-ddpptt="${k}" aria-label="The PPT type of ${nmS}"${T.length ? '' : ' disabled'}>${T.length ? T.map(e => `<option value="${esc(e.name)}"${e.name == v ? ' selected' : ''}>${esc(e.label)}</option>`).join('') : '<option>Ppt.ini not read: open the BMS folder</option>'}</select><button type="button" class="btn g ddadd" data-ddadd="${k}"${T.length ? '' : ' disabled'} title="Add ${nmS} to the DTC as a pre-planned point of this type (not a SAM)">+ PPT</button></td></tr>`;
      };
    return `<div class="wcard"><h3>Nav offsets · from STPT ${o.n}</h3><table class="oat"><tr><th></th><th>BRG</th><th>RNG</th><th>ELEV</th><th>ANCHOR</th></tr>${row('oa1', o.oa1, 'Anchor H', ROLE_COL.hunter)}${row('oa2', o.oa2, 'Anchor K', ROLE_COL.killer)}</table><div class="ddbtns">${
      route
        ? `<button type="button" class="btn g" data-ddoaw>Write OA1 · OA2 to the DTC</button><span class="hint">STPT ${o.n} is in the flight plan: BMS takes them from the DTC.</span>`
        : `<button type="button" class="btn g ddman" disabled title="STPT ${o.n} is not in the flight plan (1-24): BMS does not take its offsets from the DTC">Manual</button><span class="hint">STPT ${o.n} is not in the flight plan (1-24): type OA1 and OA2 in the DED.</span>`
    }</div><p class="hint wnote">Offsets from a PPT or a markpoint are not taken from the DTC: type them on board (DED).</p></div>`;
  }
  const sw = (c, d, w = 3) =>
    `<svg width="26" height="8" aria-hidden="true"><path d="M0 4H26" stroke="${c}" stroke-width="${w}"${d ? ` stroke-dasharray="${d}"` : ''}/></svg>`;
  function legend() {
    const c = pal(),
      t = tactic();
    return `<span>${sw(c.ring, '7 5')}WEZ (ECM off) · dotted: search radar</span><span>${sw('#ff3b3b', '4 4')}WEZ (ECM on)</span>${
      t == 'hs'
        ? `<span>${sw(ROLE_COL.shooter)}the shooters</span><span>${sw(HARM, '6 5')}HARM range</span><span>${sw(SEEK, '2 6')}seeker opens</span><span>${sw(HARM, '', 2)}HARM</span><span>${sw(ROLE_COL.cover, '6 5')}cover</span>`
        : `<span>${sw(ROLE_COL.hunter)}hunter</span><span>${sw(ROLE_COL.killer)}killer</span><span>${sw(ROLE_COL.cover, '6 5')}cover</span><span>${sw(ROLE_COL.hunter, '6 5')}defence, back to the anchor</span>`
    }<span><b style="color:${IMP}">◆</b> impact</span><span>yours: thicker, white edge</span>`;
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
        if (z.role == 'hunter')
          ph.push(
            { a: P.tA, b: P.tArc0, k: 'run', l: 'anchor H' },
            { a: P.tArc0, b: P.tArc1, k: 'arc', l: 'bait' },
            { a: P.tArc1, b: P.tBack, k: 'def', l: 'defend, back' },
            { a: P.tAtk, b: P.tAtk + 120000, k: 'cover', l: 'cover' }
          );
        if (z.role == 'killer') {
          ph.push(
            { a: P.tA, b: P.tAtk, k: 'hold', l: 'anchor K · mark' },
            { a: P.tAtk, b: P.tAtk + 90000, k: 'atk', l: 'attack ' + h3(P.attackHdg) + '°' }
          );
          mk.push({ t: P.tArc0, s: '+' });
        }
        if (z.role == 'cover') ph.push({ a: P.tA, b: P.tAtk + 120000, k: 'cover', l: 'top cover' });
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
        `<text x="8" y="${y + 14}" class="sdsl${me ? ' sdme' : ''}">${esc(seatName(l.i))}${me ? ' · YOU' : ''}</text><text x="8" y="${y + 29}" class="sdss" fill="${c}">${esc(ROLE_NAME[l.role]).toUpperCase()}</text><path d="M${X0} ${y + 12}H${XR}" stroke="#202a36"/>`
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
    M = { ...o, WL: o.L.layerGroup().addTo(o.map) };
    fit = true;
  }
  function detachMap() {
    if (!M) return;
    try {
      M.WL.remove();
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
  // a chevron at the middle of an arc, pointing the way it is flown (the points of the arc are in the order they are flown)
  function chev(pts) {
    if (!pts || pts.length < 3) return null;
    const m = Math.floor(pts.length / 2),
      a = pts[m - 1],
      b = pts[m + 1],
      tip = pts[m],
      d = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d },
      sz = Math.max(1.2, P.Ra * 0.12) * KM_NM,
      bk = { x: tip.x - u.x * sz, y: tip.y - u.y * sz };
    return [
      { x: bk.x - u.y * sz * 0.65, y: bk.y + u.x * sz * 0.65 },
      tip,
      { x: bk.x + u.y * sz * 0.65, y: bk.y - u.x * sz * 0.65 },
    ];
  }
  const seekNm = () => (mode() == 'pos' ? (HARM_SUB[sub()] || HARM_SUB.EOM).on : 0);
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
      all = [],
      t = tactic(),
      R = roles();
    WL.clearLayers();
    const line = (pts, o) => L.polyline(pts.map(ll), { renderer: RN, interactive: false, ...o }).addTo(WL);
    // a route of a role: its colour; yours thicker with a white edge
    const path = (pts, col, me, dash, arrow) => {
      line(pts, {
        color: me ? '#fff' : c.halo,
        weight: me ? 7.5 : 5,
        opacity: me ? 0.9 : 0.6,
        dashArray: dash ? '8 7' : '',
      });
      line(pts, { color: col, weight: me ? 4 : 2.6, dashArray: dash ? '8 7' : '' });
      const v = arrow && chev(pts.length > 6 ? arrow : pts);
      if (v) {
        line(v, { color: me ? '#fff' : c.halo, weight: me ? 7 : 5, opacity: 0.8 });
        line(v, { color: col, weight: me ? 3.6 : 2.6 });
      }
      all.push(...pts);
    };
    const tag = (p, html, cls = '') =>
      L.marker(ll(p), {
        icon: L.divIcon({ className: 'sdtag ' + cls, html, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(WL);
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
    ring(P.R, c.ring, '9 6', 2.2, 0.06);
    ring(P.Recm, '#ff3b3b', '4 4', 1.6, 0.05);
    ring(P.Rdet, c.ring, '2 6', 1.2);
    tag(
      s,
      `<b class="sdsamt" style="color:${c.ring}">▲</b><span style="color:${c.ring}">${esc(s.name)}${s.code != null ? ' · ALIC ' + s.code : ''}</span>`,
      'sdsamm'
    );
    all.push({ x: s.x - P.Rdet * KM_NM, y: s.y }, { x: s.x + P.Rdet * KM_NM, y: s.y });
    const mw = timed(X.me.f.wps);
    if (mw.length > 1 && !on('fp')) {
      line(mw, { color: c.halo, weight: 5, opacity: 0.5 });
      line(mw, { color: c.plan, weight: 2.4, opacity: 0.8 });
    }
    const meRole = X.seat != null ? R[X.seat] : null;
    if (t == 'hs') {
      // the HARM: its range round the SAM and, in POS, where its seeker opens
      if (P.rTh > 0) ring(P.rTh, HARM, '6 5', 1.8);
      if (seekNm()) ring(seekNm(), SEEK, '2 6', 1.8);
      path(P.path, ROLE_COL.shooter, meRole == 'shooter', false, P.arc);
      P.seats.filter(z => z.role == 'cover').forEach(z => path(z.arc, ROLE_COL.cover, mine(z.i), true, z.arc));
      P.seats
        .filter(z => z.role == 'shooter')
        .forEach((z, k) => {
          const me = mine(z.i);
          line([P.L, s], { color: HARM, weight: me ? 2.6 : 1.8, opacity: me ? 1 : 0.6 });
          L.circleMarker(ll(P.L), {
            renderer: RN,
            radius: me ? 7 : 5,
            fillColor: HARM,
            fillOpacity: 1,
            color: '#fff',
            weight: 2,
            interactive: false,
          }).addTo(WL);
          if (!k || me)
            tag(
              P.L,
              `<span class="${me ? 'sdme' : ''}" style="${me ? '' : 'color:' + HARM}">#${z.i + 1} L ${hms(z.tl).slice(3)} · ${P.dL.toFixed(0)} NM</span>`,
              'sdl'
            );
        });
      tag(P.turn, `<i class="ddpt"></i><span>TURN ${hms(P.tTurn).slice(3)} · ARC ${P.Ra.toFixed(0)} NM</span>`);
      tag(s, `<i class="sdimpm"></i>`, 'sdimp');
    } else {
      const hn = R.map((r, i) => (r == 'hunter' ? i : -1)).filter(i => i >= 0),
        kl = R.map((r, i) => (r == 'killer' ? i : -1)).filter(i => i >= 0),
        cv = R.map((r, i) => (r == 'cover' ? i : -1)).filter(i => i >= 0);
      if (hn.length) {
        const me = hn.includes(X.seat);
        path([P.A, P.arc[0]].concat(P.arc), ROLE_COL.hunter, me, false, P.arc);
        path(P.def, ROLE_COL.hunter, me, true);
        tag(
          P.arc[Math.floor(P.arc.length / 2)],
          `<span style="color:${ROLE_COL.hunter}">HUNTER ${hn.map(i => '#' + (i + 1)).join(' ')} · ARC ${P.Ra.toFixed(0)} NM · BAIT</span>`
        );
      }
      if (kl.length) {
        const me = kl.includes(X.seat);
        path(P.atk, ROLE_COL.killer, me);
        tag(
          P.atk[1],
          `<span style="color:${ROLE_COL.killer}">KILLER ${kl.map(i => '#' + (i + 1)).join(' ')} · ${hms(P.tAtk).slice(3)} · ${h3(P.attackHdg)}°</span>`
        );
      }
      if (cv.length || hn.length) path(P.cover, ROLE_COL.cover, cv.includes(X.seat), true, P.cover);
      [
        [P.A, 'ANCHOR H · OA1', ROLE_COL.hunter],
        [P.B, 'ANCHOR K · OA2', ROLE_COL.killer],
      ]
        .filter((q, i) => i || hn.length)
        .forEach(([p, l, col]) =>
          tag(p, `<i class="ddanc" style="background:${col}"></i><span style="color:${col}">${l}</span>`)
        );
    }
    if (fit && all.length) {
      fit = false;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(all.map(ll)), { padding: [24, 24], maxZoom: 10, animate: false });
    }
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
        const [i, r] = rl.dataset.ddrole.split(':'),
          t = tactic(),
          a = roles();
        a[+i] = r;
        st.roles = { ...st.roles, [t]: a };
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
      const op = c('[data-ddopen]');
      if (op && deps.openMode) {
        const s = sam(),
          a = deps.openMode(op.dataset.ddopen, { x: s.x, y: s.y });
        if (a) deps.toast('Target: ' + a.label + ' (' + a.nm.toFixed(1) + ' nm from ' + s.name + ').');
        else deps.toast('No target steerpoint within 10 nm of ' + s.name + ': choose it on the page.', true);
        return;
      }
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
      else if (d.ddpptt != null) st.ppt = { ...st.ppt, [d.ddpptt]: e.target.value };
      else return;
      save();
      draw(false);
    };
    // the ECM slider: the rings and the plan follow it while it moves
    root.oninput = e => {
      const d = e.target.dataset || {};
      if (d.ddecm == null) return;
      st.ecm = +e.target.value;
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
    const p = k == 'oa1' ? P.A : P.B,
      T = pptTypes(),
      sel = root.querySelector('[data-ddpptt="' + k + '"]'),
      e = T.find(x => x.name == (sel ? sel.value : st.ppt[k])) || T[0],
      an = k == 'oa1' ? 'anchor H' : 'anchor K';
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
        `Write the anchors as the nav offsets of STPT ${o.n}?\n\nOA1-${o.n} = ${o.oa1.brg}°, ${o.oa1.nm.toFixed(1)} nm (anchor H)\nOA2-${o.n} = ${o.oa2.brg}°, ${o.oa2.nm.toFixed(1)} nm (anchor K)`
      ))
    )
      return;
    deps.dtc.setOA('OA1-' + o.n, [o.oa1.brg, o.oa1.rngFt, 0].join(','));
    deps.dtc.setOA('OA2-' + o.n, [o.oa2.brg, o.oa2.rngFt, 0].join(','));
    deps.toast('OA1 and OA2 of STPT ' + o.n + ' written to the DTC.');
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
              ['LAUNCH', hms(z.tl), P.dL.toFixed(1) + ' NM · HDG ' + h3(z.brgL) + '°'],
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
              ['ANCHOR H', hms(P.tA), P.oa ? h3(P.oa.oa1.brg) + '° ' + P.oa.oa1.nm.toFixed(0) + ' NM · OA1' : ''],
              ['BAIT', 'ARC ' + P.Ra.toFixed(0), hms(P.tArc0) + '–' + hms(P.tArc1).slice(3)],
              ['THEN', 'DEFEND', 'BACK TO ANCHOR H'],
            ]
          : r == 'killer'
            ? [
                ['YOUR ROLE', 'KILLER', seatName(me)],
                ['ANCHOR K', hms(P.tA), P.oa ? h3(P.oa.oa2.brg) + '° ' + P.oa.oa2.nm.toFixed(0) + ' NM · OA2' : ''],
                ['MARK', 'HAD → TGP', t == 'hk' ? 'WHILE THE HUNTER BAITS' : 'HAD BOX → MARKPOINT'],
                ['ATTACK', h3(P.attackHdg) + '°', hms(P.tAtk)],
              ]
            : [
                ['YOUR ROLE', 'COVER', seatName(me)],
                ['ARC', (P.Ra + 4).toFixed(0) + ' NM', ''],
                ['FROM', hms(P.tAtk), ''],
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
      steps: steps().map(o => ({ me: o.me, s: o.s })),
      oa: t == 'hs' || !P.oa ? null : P.oa,
      seats: R.map((r, i) => {
        const w = P.seats.find(q => q.i == i);
        return {
          me: mine(i),
          seat: seatName(i),
          role: ROLE_NAME[r].toUpperCase(),
          times:
            t == 'hs'
              ? w && w.role == 'shooter'
                ? 'L ' + hms(w.tl) + ' · ◆ ' + hms(w.imp)
                : 'ARC ' + hms(P.tTurn)
              : r == 'hunter'
                ? 'ARC ' + hms(P.tArc0) + '–' + hms(P.tArc1) + ' · COVER ' + hms(P.tAtk)
                : r == 'killer'
                  ? 'ANCHOR K ' + hms(P.tA) + ' · ATTACK ' + hms(P.tAtk)
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
        const v = arrow && chev(arrow);
        if (v) paths.push({ pts: v, col: ROLE_COL[r], w, me: m });
      };
    const mw = timed(X.me.f.wps);
    if (mw.length > 1) paths.push({ pts: mw, col: pal().plan, w: 3 });
    if (t == 'hs') {
      add(P.path, 'shooter', me == 'shooter', 5, false, P.arc);
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
      const has = r => R.includes(r);
      if (has('hunter')) {
        add([P.A, P.arc[0]].concat(P.arc), 'hunter', me == 'hunter', 5, false, P.arc);
        add(P.def, 'hunter', me == 'hunter', 4, true);
      }
      if (has('killer')) add(P.atk, 'killer', me == 'killer', 5);
      if (has('cover') || has('hunter')) add(P.cover, 'cover', me == 'cover', 4, true, P.cover);
      if (has('hunter')) marks.push({ p: P.A, k: 'anc', col: ROLE_COL.hunter, l: 'ANCHOR H · OA1' });
      marks.push({ p: P.B, k: 'anc', col: ROLE_COL.killer, l: 'ANCHOR K · OA2' });
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
      if (!M) {
        failed = false;
        await ensureMap();
        if (!M) return null;
      }
      M.map.invalidateSize();
      paint(true);
      return await snapNow(AR);
    } finally {
      if (off && w) {
        w.classList.remove('ddoff');
        w.hidden = true;
        detachMap();
        failed = false;
        pend = null;
      }
    }
  }
  async function snapNow(AR) {
    const { map, L, WL } = M,
      ll = p => deps.toLL(p.x, p.y),
      s = sam(),
      G = geo(),
      pts = [
        { x: s.x - P.Rdet * KM_NM, y: s.y - P.Rdet * KM_NM },
        { x: s.x + P.Rdet * KM_NM, y: s.y + P.Rdet * KM_NM },
      ],
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
      map.fitBounds(L.latLngBounds(pts.map(ll)), {
        paddingTopLeft: [ox + 10, oy + 10],
        paddingBottomRight: [ox + 10, oy + 10],
        animate: false,
      });
      await new Promise(r => setTimeout(r, 1200));
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
          rTh: hs && P.rTh > 0 ? P.rTh * nmPx : 0,
          seek: hs ? seekNm() * nmPx : 0,
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
      D.px = await snapPlan(B.w / B.h);
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
    render: () => {
      shown = true;
      draw(true);
    },
    refresh: () => {
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
