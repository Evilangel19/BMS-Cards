// The Organization section of the Squadron page: packages and flights as a board, pilots dragged into the flights, who leads what, and the button that sends a
// mission to one flight. orgHtml() only builds the text (checked by a test); wireOrg() connects it. The rules are in organization.js: the screen shows a control only
// when orgReduce() would accept the change.
import { orgReduce, isAdmin, MAX_FLIGHTS, MAX_PILOTS, MAX_PACKAGES } from './organization.js';

/**
 * @param {any} q the squadron, @param {any} view orgView(q), @param {string} me my pilot id, @param {Set<string>} online pilot ids linked now
 * @param {(s:any)=>string} esc, @param {(uid:string)=>string} nameOf callsign of a pilot
 */
const nFlightsAny = view => view.packages.some(p => p.flights.length);
// colours of the packages and of the flights (a flight takes the colour of its place in the package, so they repeat from package to package)
const PAL = ['#4aa3ff', '#f0b040', '#b07cff', '#2ec4b6', '#ff7a90'];
export function orgHtml(q, view, me, online, esc, nameOf, hint) {
  const adm = isAdmin(q, me),
    live = Object.values(q.roster || {}).filter(r => !r.removed),
    on = u => u === me || online.has(u);
  const pkLeadOf = id => view.packages.some(p => p.id === id && p.lead === me);
  const tag = (t, c, title) => `<span class="ogtag ${c}" title="${esc(title)}">${t}</span>`;
  const roleTags = u =>
    [
      u === q.owner ? tag('COMMANDER', 'cmd', 'Commander of the squadron') : '',
      u === q.mc ? tag('MISSION CMD', 'mc', 'Mission commander') : '',
      view.packages.some(p => p.lead === u) ? tag('PACKAGE LEAD', 'pk', 'Package lead') : '',
      view.packages.some(p => p.flights.some(f => f.lead === u)) ? tag('LEAD', 'fl', 'Flight lead') : '',
    ].join('');
  // the name takes the colour of the highest role of the pilot
  const roleCls = u =>
    u === q.owner
      ? 'rc-cmd'
      : u === q.mc
        ? 'rc-mc'
        : view.packages.some(p => p.lead === u)
          ? 'rc-pk'
          : view.packages.some(p => p.flights.some(f => f.lead === u))
            ? 'rc-fl'
            : '';
  const dot = u => `<i class="sqd ${on(u) ? 'connected' : 'closed off'}" title="${on(u) ? 'Online' : 'Offline'}"></i>`;
  // a pilot is one line: dot, callsign, roles, then (when allowed) the star that makes him lead and the × that takes him out
  const row = (u, o = {}) =>
    `<div class="ogrow${u === me ? ' me' : ''}${on(u) ? '' : ' off'}" data-pilot="${esc(u)}">${dot(u)}<b class="${roleCls(u)}">${esc(nameOf(u))}</b>${roleTags(u)}${u === me ? '<span class="ogmu">you</span>' : ''}${on(u) ? '' : '<span class="ogmu">offline</span>'}<span class="ogact">${
      o.star
        ? `<button class="ogstar${o.star === 2 ? ' on' : ''}" data-lead="${esc(u)}" data-fl="${esc(o.fl)}" title="${o.star === 2 ? 'Not the flight lead any more' : 'Make flight lead'}" aria-label="${o.star === 2 ? 'Remove the flight lead' : 'Make ' + esc(nameOf(u)) + ' flight lead'}">${o.star === 2 ? '★' : '☆'}</button>`
        : ''
    }${o.out ? `<button class="ogx" data-out="${esc(u)}" title="Take out of the flight" aria-label="Take ${esc(nameOf(u))} out of the flight">×</button>` : ''}${o.sel || ''}</span></div>`;
  const pilotSel = (attr, val, uids, none) =>
    `<select ${attr} aria-label="${esc(none)}"><option value="">${esc(none)}</option>${uids.map(u => `<option value="${esc(u)}"${u === val ? ' selected' : ''}>${esc(nameOf(u))}</option>`).join('')}</select>`;
  const allUids = live.map(r => r.uid).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const myFlight = view.seat[me] ? view.seat[me].fl : '';
  const nOn = [...online].filter(u => u !== me).length,
    canAll = nFlightsAny(view) ? adm : !q.leader || q.leader === me;
  const nFlights = view.packages.reduce((n, p) => n + p.flights.length, 0);

  // the name of the squadron
  const top = `<div class="ogtop">${/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(q.logo || '') ? `<img class="sqlogo" src="${esc(q.logo)}" alt="">` : ''}<div><h2>${esc(q.name)}</h2>${q.motto ? `<div class="oghelp">${esc(q.motto)}</div>` : ''}</div></div>`;

  // the commanders and the summary of the night
  const canHand = q.owner === me && allUids.some(u => u !== me);
  const roles = `<div class="ogroles">
<div class="ogrole cmdcard"><div class="ogtxt"><div class="oglab">Squadron commander · Planner</div><div class="ogval">${q.owner && q.roster[q.owner] ? esc(nameOf(q.owner)) : '—'}</div><div class="oghelp">Edits the whole structure</div></div>${
    canHand
      ? '<button class="oghand" data-handover title="Give the command of the squadron to another pilot" aria-label="Hand over the command"><span>⇄</span>Hand over the command</button>'
      : ''
  }</div>
<div class="ogrole"><div class="oglab">Mission commander</div><div class="ogval">${q.mc && q.roster[q.mc] ? esc(nameOf(q.mc)) : '—'}</div><div class="oghelp">Names the package leads, has the commander's powers and takes the command if he leaves</div>${
    adm
      ? pilotSel(
          'data-mc',
          q.mc || '',
          allUids.filter(u => u !== q.owner),
          'Nobody'
        )
      : ''
  }</div>
<div class="ogrole"><div class="oglab">Today</div><div class="ogval">${view.packages.length} package${view.packages.length == 1 ? '' : 's'} · ${nFlights} flight${nFlights == 1 ? '' : 's'}</div>${
    adm
      ? '<div class="ogbtns"><button class="btn g bl" data-savetpl>Save template</button><button class="btn g" data-loadtpl>Load template</button><button class="btn g rd" data-clear>Clear all</button></div>'
      : '<div class="oghelp">Set up by the commanders</div>'
  }<div class="ogbtns one"><button class="btn g gn" data-sendall${nOn && canAll ? '' : ' disabled'} title="${esc(canAll ? 'Send the mission to every pilot online' : 'Only the commanders send to everybody; the lead of your flight sends you the mission')}">Send my mission to everybody online${nOn ? ' (' + nOn + ')' : ''}</button></div></div></div>`;

  // pilots who fly nowhere
  const free = view.unassigned.slice().sort((a, b) => on(b) - on(a) || nameOf(a).localeCompare(nameOf(b)));
  const flightOpts = view.packages.flatMap(p =>
    p.flights.filter(f => !f.full).map(f => `<option value="${esc(f.id)}">${esc(p.n)} · ${esc(f.n)}</option>`)
  );
  const side = `<div class="ogside ogdrop" data-drop=""><h4 class="oglab">Unassigned</h4><div class="oghelp">Drag a pilot into a flight</div>${
    free.length
      ? free
          .map(u =>
            row(u, {
              sel: flightOpts.length
                ? `<select class="ogput" data-moveto="${esc(u)}" aria-label="Put ${esc(nameOf(u))} in a flight"><option value="">Put in…</option>${flightOpts.join('')}</select>`
                : '',
            })
          )
          .join('')
      : '<div class="oghelp">Everybody has a flight.</div>'
  }<div class="oghelp ogfoot">Pilots left here do not receive any mission.</div></div>`;

  // packages
  // the name of a flight must be one of the flights of its package in the open campaign, TE or mission (package number in the package name)
  const norm = x =>
    String(x)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const mismatch = (p, f) => {
    const no = (/(\d{1,6})/.exec(p.n) || [])[1],
      names = hint && hint.map && no ? hint.map[no] : null;
    return names && !names.some(n => norm(n) === norm(f.n))
      ? 'Package ' + no + ' of the open mission has: ' + names.join(', ')
      : '';
  };
  const flightCard = (p, f, fi) => {
    const canLead = adm || pkLeadOf(p.id),
      mine = f.id === myFlight,
      canSend = adm || pkLeadOf(p.id) || f.lead === me,
      n = f.members.filter(u => u !== me && online.has(u)).length,
      canEdit = adm || pkLeadOf(p.id) || f.lead === me,
      bad = mismatch(p, f);
    return `<div class="ogflight ogdrop${mine ? ' mine' : ''}" data-drop="${esc(f.id)}" style="--fc:${PAL[fi % PAL.length]}">
<div class="oghead">${canEdit ? `<input class="ogname${bad ? ' bad' : ''}" data-flname="${esc(f.id)}" value="${esc(f.n)}" maxlength="24" aria-label="Flight name"${bad ? ` title="${esc(bad)}"` : ''}>` : `<b class="ogtitle${bad ? ' bad' : ''}">${esc(f.n)}</b>`}<span class="ogmu${f.full ? ' full' : ''}">${f.members.length} / ${MAX_PILOTS}</span>${mine ? '<span class="ogtag you">YOUR FLIGHT</span>' : ''}${canLead ? `<button class="ogx ogdel" data-delfl="${esc(f.id)}" title="Delete the flight" aria-label="Delete the flight ${esc(f.n)}">×</button>` : ''}</div>
${bad ? `<div class="oghelp warn">⚠ This name does not match the package. ${esc(bad)}</div>` : ''}
${f.members.length ? f.members.map(u => row(u, { out: canEdit || u === me, star: canLead ? (f.lead === u ? 2 : 1) : 0, fl: f.id })).join('') : '<div class="oghelp">Empty: drag a pilot here</div>'}
${canSend ? `<button class="ogsend" data-send="${esc(f.id)}"${n ? '' : ' disabled'} title="Send the mission to the pilots of this flight who are online">Send my mission to ${esc(f.n)} (${n} online)</button>` : f.lead ? `<div class="oghelp">Only ${esc(nameOf(f.lead))} can send to this flight</div>` : ''}
</div>`;
  };
  const packs = view.packages
    .map((p, pi) => {
      const canEdit = adm || pkLeadOf(p.id),
        pilots = p.flights.reduce((n, f) => n + f.members.length, 0);
      return `<div class="ogpack" style="--pc:${PAL[pi % PAL.length]}"><div class="oghead">${canEdit ? `<input class="ogname big" data-pkname="${esc(p.id)}" value="${esc(p.n)}" maxlength="24" aria-label="Package name">` : `<b class="ogtitle big">${esc(p.n)}</b>`}<span class="oglead">Package lead: ${adm ? pilotSel(`data-pklead="${esc(p.id)}"`, p.lead, allUids, '—') : `<b>${p.lead ? esc(nameOf(p.lead)) : '—'}</b>`}</span><span class="ogmu ogright">${p.flights.length} of ${MAX_FLIGHTS} flights · ${pilots} aircraft</span>${adm ? `<button class="ogx ogdel" data-delpk="${esc(p.id)}" title="Delete the package" aria-label="Delete the package ${esc(p.n)}">×</button>` : ''}</div>
<div class="ogflights">${p.flights.map((f, fi) => flightCard(p, f, fi)).join('')}${canEdit && !p.full ? `<button class="ogadd" data-addfl="${esc(p.id)}">+ Add flight</button>` : ''}</div></div>`;
    })
    .join('');
  const addPk =
    adm && view.packages.length < MAX_PACKAGES
      ? '<button class="ogadd wide ogdrop" data-addpk data-drop="@pk">+ Add package</button>'
      : '';
  const empty = !view.packages.length
    ? `<div class="oghelp ogempty">No packages yet.${adm ? ' Add a package, then its flights, and drag the pilots into them.' : ' The commander or the mission commander sets up the packages and flights.'}</div>`
    : '';
  const leave =
    q.owner === me && q.mc && q.roster[q.mc]
      ? `<div class="bar" style="margin-top:6px"><button class="btn g rd" data-leave title="You leave the squadron and the mission commander becomes the commander">Leave the squadron and hand the command to ${esc(nameOf(q.mc))}</button></div>`
      : '';
  return `${top}${roles}<div class="ogbody">${side}<div class="ogmain">${empty}${packs}${addPk}${leave}</div></div>`;
}

/** The box for a pilot who lost his program file (Members page). Empty when the viewer is not a commander. */
export function lostHtml(q, view, me, online, esc, nameOf) {
  const adm = isAdmin(q, me),
    live = Object.values(q.roster || {}).filter(r => !r.removed);
  const pilotSel = (attr, uids, none) =>
    `<select ${attr} aria-label="${esc(none)}"><option value="">${esc(none)}</option>${uids.map(u => `<option value="${esc(u)}">${esc(nameOf(u))}</option>`).join('')}</select>`;
  const gone = live.filter(r => r.uid !== me && !online.has(r.uid) && r.uid !== q.owner);
  const fresh = live.filter(r => online.has(r.uid) && r.uid !== q.owner && r.uid !== q.mc && !view.seat[r.uid]);
  if (!adm) return '';
  return `<h3>A pilot lost his program file?</h3><div class="hint">He comes back with the invite as a new pilot. Choose the old entry (offline) and the new one: the new pilot gets the flight, the lead and the role of the old one.</div><div class="bar">${pilotSel('data-seatold', [...(q.roster[q.owner] && !online.has(q.owner) ? [q.owner] : []), ...gone.map(r => r.uid)], 'Old pilot…')}${pilotSel(
    'data-seatnew',
    fresh.map(r => r.uid),
    'New pilot…'
  )}<button class="btn g gn" data-seat>Give the seat back</button></div>`;
}

/** Wires the box of lostHtml. h: {act(a): {ok, error}, toast(text), confirm(text): Promise<boolean>} */
export function wireLost(box, h) {
  box.onclick = async e => {
    const b = e.target.closest('button');
    if (!b || !('seat' in b.dataset)) return;
    const o = box.querySelector('[data-seatold]').value,
      n = box.querySelector('[data-seatnew]').value;
    if (!o || !n) return h.toast('Choose the old pilot and the new one.');
    if (await h.confirm('Give the seat of the old pilot to the new one? The old entry leaves the squadron.')) {
      const r = h.act({ t: 'seat', old: o, nu: n });
      if (!r.ok) h.toast(r.error);
    }
  };
}

/**
 * Connects the buttons, the lists and the dragging of the board.
 * h: {q(): the squadron, view(): its organisation view, me: pilot id, online(): Set, act(a): {ok, error}, send(flightId), leave(), toast(text), confirm(text): Promise<boolean>}
 */
export function wireOrg(box, h) {
  const run = a => {
    const r = h.act(a);
    if (!r.ok) h.toast(r.error);
    return r;
  };
  // the open mission names the new package or flight when it can (its name is not used in the squadron yet)
  const prefName = (kind, base, used, pk) => {
    const t = h.hint && h.hint();
    const want = !t ? '' : kind == 'pk' ? 'Package ' + t.pk : t.fl;
    const taken = kind == 'pk' ? view().packages.map(p => p.n) : (pk ? pk.flights : []).map(f => f.n);
    if (want && !taken.some(n => n.toLowerCase() == want.toLowerCase())) return want;
    return nameN(base, used);
  };
  const nameN = (base, used) => {
    let i = used + 1;
    return base + ' ' + i;
  };
  const view = () => h.view();
  box.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('addpk' in d) run({ t: 'pk+', name: prefName('pk', 'Package', view().packages.length) });
    else if (d.addfl) {
      const p = view().packages.find(x => x.id === d.addfl);
      run({ t: 'fl+', pk: d.addfl, name: prefName('fl', 'Flight', p ? p.flights.length : 0, p) });
    } else if (d.delpk) {
      if (await h.confirm('Delete this package and its flights? The pilots go back to Unassigned.'))
        run({ t: 'pk-', id: d.delpk });
    } else if (d.delfl) {
      if (await h.confirm('Delete this flight? Its pilots go back to Unassigned.')) run({ t: 'fl-', id: d.delfl });
    } else if (d.out) run({ t: 'as', uid: d.out, f: '' });
    else if (d.lead) run({ t: 'fllead', id: d.fl, uid: b.classList.contains('on') ? '' : d.lead });
    else if (d.send) h.send(d.send);
    else if ('sendall' in d) h.sendAll();
    else if ('handover' in d) h.handover();
    else if ('savetpl' in d) h.saveTpl();
    else if ('loadtpl' in d) h.loadTpl();
    else if ('clear' in d) {
      if (await h.confirm('Delete all the packages and flights?'))
        for (const p of view().packages) run({ t: 'pk-', id: p.id });
    } else if ('leave' in d) h.leave();
  };
  box.onchange = async e => {
    const t = e.target,
      d = t.dataset,
      v = t.value;
    if (t.blur) t.blur(); // a chosen select (or a name finished with Enter) keeps the focus, and a board with the focus inside is not redrawn
    if (d.pkname) run({ t: 'pk~', id: d.pkname, name: v });
    else if (d.flname) run({ t: 'fl~', id: d.flname, name: v });
    else if (d.pklead) run({ t: 'pklead', id: d.pklead, uid: v });
    else if ('mc' in d) run({ t: 'mc', uid: v });
    else if (d.moveto) {
      if (v) run({ t: 'as', uid: d.moveto, f: v });
    }
  };
  // dragging with the pointer (the HTML5 drag and drop does not work in every webview): press on a pilot, move, release on a flight.
  // What a drop would do is asked to the rules when the drag starts, so only the flights that accept the pilot light up.
  box.onpointerdown = e => {
    if (e.button || !e.target.closest) return;
    const c = e.target.closest('[data-pilot]');
    if (!c || e.target.closest('button,select,input')) return;
    const x0 = e.clientX,
      y0 = e.clientY,
      uid = c.dataset.pilot;
    let ghost = null,
      ok = null,
      over = null;
    const zones = () => box.querySelectorAll('[data-drop]');
    const start = () => {
      const q = h.q();
      ok = new Map();
      zones().forEach(z => {
        const f = z.dataset.drop,
          r =
            f == '@pk'
              ? orgReduce(q, h.me, { t: 'pk+', name: 'x' }, { now: Date.now(), rid: () => 'x', online: h.online() })
              : orgReduce(q, h.me, { t: 'as', uid, f }, { now: Date.now(), rid: () => 'x', online: h.online() });
        ok.set(f, r.ok);
        z.classList.toggle('okdrop', r.ok);
      });
      ghost = c.cloneNode(true);
      ghost.classList.add('ogghost');
      ghost.style.width = c.offsetWidth + 'px';
      document.body.append(ghost);
      c.classList.add('dragging');
      box.dataset.drag = '1';
      document.body.classList.add('og-dragging');
    };
    const zoneAt = (x, y) => {
      const el = document.elementFromPoint(x, y),
        z = el && el.closest ? el.closest('[data-drop]') : null;
      return z && box.contains(z) ? z : null;
    };
    const move = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        start();
      }
      ghost.style.left = ev.clientX + 12 + 'px';
      ghost.style.top = ev.clientY + 8 + 'px';
      const z = zoneAt(ev.clientX, ev.clientY);
      const good = z && ok.get(z.dataset.drop) ? z : null;
      if (good !== over) {
        if (over) over.classList.remove('over');
        if (good) good.classList.add('over');
        over = good;
      }
    };
    const end = ev => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!ghost) return;
      const z = ev.type == 'pointerup' ? zoneAt(ev.clientX, ev.clientY) : null;
      ghost.remove();
      c.classList.remove('dragging');
      document.body.classList.remove('og-dragging');
      zones().forEach(x => x.classList.remove('okdrop', 'over'));
      delete box.dataset.drag;
      const swallow = k => {
        k.stopPropagation();
        k.preventDefault();
      };
      box.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => box.removeEventListener('click', swallow, true), 0);
      if (z) {
        if (!ok.get(z.dataset.drop)) h.toast('This pilot cannot go there.');
        else if (z.dataset.drop == '@pk') {
          const r = h.newPack(uid);
          if (!r.ok) h.toast(r.error);
        } else run({ t: 'as', uid, f: z.dataset.drop });
      }
      box.dispatchEvent(new Event('dragend')); // the board is drawn again if something changed while he dragged
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  };
}
