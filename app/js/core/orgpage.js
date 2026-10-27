// The Organization section of the Squadron page: packages and flights as a board, pilots dragged into the flights, who leads what, and the button that sends a
// mission to one flight. orgHtml() only builds the text (checked by a test); wireOrg() connects it. The rules are in organization.js: the screen shows a control only
// when orgReduce() would accept the change.
import { orgReduce, isAdmin, MAX_FLIGHTS, MAX_PILOTS, MAX_PACKAGES } from './organization.js';

/**
 * @param {any} q the squadron, @param {any} view orgView(q), @param {string} me my pilot id, @param {Set<string>} online pilot ids linked now
 * @param {(s:any)=>string} esc, @param {(uid:string)=>string} nameOf callsign of a pilot
 */
export function orgHtml(q, view, me, online, esc, nameOf) {
  const adm = isAdmin(q, me),
    live = Object.values(q.roster || {}).filter(r => !r.removed),
    on = u => u === me || online.has(u);
  const pkLeadOf = id => view.packages.some(p => p.id === id && p.lead === me);
  const tag = (t, c, title) => `<span class="ogtag ${c}" title="${esc(title)}">${t}</span>`;
  const roleTags = u =>
    [
      u === q.owner ? tag('COMMANDER', 'cmd', 'Commander of the squadron') : '',
      u === q.mc ? tag('MISSION CMD', 'cmd', 'Mission commander') : '',
      view.packages.some(p => p.lead === u) ? tag('PACKAGE LEAD', 'pk', 'Package lead') : '',
      view.packages.some(p => p.flights.some(f => f.lead === u)) ? tag('LEAD', 'fl', 'Flight lead') : '',
    ].join('');
  const dot = u => `<i class="sqd ${on(u) ? 'connected' : 'closed off'}" title="${on(u) ? 'Online' : 'Offline'}"></i>`;
  // a pilot is one line: dot, callsign, roles, then (when allowed) the star that makes him lead and the × that takes him out
  const row = (u, o = {}) =>
    `<div class="ogrow${u === me ? ' me' : ''}${on(u) ? '' : ' off'}" draggable="true" data-pilot="${esc(u)}">${dot(u)}<b>${esc(nameOf(u))}</b>${roleTags(u)}${u === me ? '<span class="ogmu">you</span>' : ''}${on(u) ? '' : '<span class="ogmu">offline</span>'}<span class="ogact">${
      o.star
        ? `<button class="ogstar${o.star === 2 ? ' on' : ''}" data-lead="${esc(u)}" data-fl="${esc(o.fl)}" title="${o.star === 2 ? 'Not the flight lead any more' : 'Make flight lead'}" aria-label="${o.star === 2 ? 'Remove the flight lead' : 'Make ' + esc(nameOf(u)) + ' flight lead'}">${o.star === 2 ? '★' : '☆'}</button>`
        : ''
    }${o.out ? `<button class="ogx" data-out="${esc(u)}" title="Take out of the flight" aria-label="Take ${esc(nameOf(u))} out of the flight">×</button>` : ''}${o.sel || ''}</span></div>`;
  const pilotSel = (attr, val, uids, none) =>
    `<select ${attr} aria-label="${esc(none)}"><option value="">${esc(none)}</option>${uids.map(u => `<option value="${esc(u)}"${u === val ? ' selected' : ''}>${esc(nameOf(u))}</option>`).join('')}</select>`;
  const allUids = live.map(r => r.uid).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const myFlight = view.seat[me] ? view.seat[me].fl : '';
  const nFlights = view.packages.reduce((n, p) => n + p.flights.length, 0);

  // the commanders and the summary of the night
  const roles = `<div class="ogroles">
<div class="ogrole"><div class="oglab">Squadron commander · Planner</div><div class="ogval">${q.owner && q.roster[q.owner] ? esc(nameOf(q.owner)) : '—'}</div><div class="oghelp">Edits the whole structure</div>${
    q.owner === me
      ? pilotSel(
          'data-cmd',
          '',
          allUids.filter(u => u !== me),
          'Hand over the command…'
        )
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
<div class="ogrole"><div class="oglab">Tonight</div><div class="ogval">${view.packages.length} package${view.packages.length == 1 ? '' : 's'} · ${nFlights} flight${nFlights == 1 ? '' : 's'}</div>${
    adm
      ? '<div class="bar"><button class="btn g rd" data-clear>Clear all</button></div>'
      : '<div class="oghelp">Set up by the commanders</div>'
  }</div></div>`;

  // pilots who fly nowhere
  const free = view.unassigned.slice().sort((a, b) => on(b) - on(a) || nameOf(a).localeCompare(nameOf(b)));
  const flightOpts = view.packages.flatMap(p =>
    p.flights.filter(f => !f.full).map(f => `<option value="${esc(f.id)}">${esc(p.n)} · ${esc(f.n)}</option>`)
  );
  const side = `<div class="ogside ogdrop" data-drop=""><h4>Unassigned</h4><div class="oghelp">Drag a pilot into a flight</div>${
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
  const flightCard = (p, f) => {
    const canLead = adm || pkLeadOf(p.id),
      mine = f.id === myFlight,
      canSend = adm || pkLeadOf(p.id) || f.lead === me,
      n = f.members.filter(u => u !== me && online.has(u)).length,
      canEdit = adm || pkLeadOf(p.id) || f.lead === me;
    return `<div class="ogflight ogdrop${mine ? ' mine' : ''}" data-drop="${esc(f.id)}">
<div class="oghead">${canEdit ? `<input class="ogname" data-flname="${esc(f.id)}" value="${esc(f.n)}" maxlength="24" aria-label="Flight name">` : `<b class="ogtitle">${esc(f.n)}</b>`}<span class="ogmu${f.full ? ' full' : ''}">${f.members.length} / ${MAX_PILOTS}</span>${mine ? '<span class="ogtag you">YOUR FLIGHT</span>' : ''}${canLead ? `<button class="ogx ogdel" data-delfl="${esc(f.id)}" title="Delete the flight" aria-label="Delete the flight ${esc(f.n)}">×</button>` : ''}</div>
${f.members.length ? f.members.map(u => row(u, { out: canEdit || u === me, star: canLead ? (f.lead === u ? 2 : 1) : 0, fl: f.id })).join('') : '<div class="oghelp">Empty: drag a pilot here</div>'}
${canSend ? `<button class="ogsend" data-send="${esc(f.id)}"${n ? '' : ' disabled'} title="Send the mission to the pilots of this flight who are online">Send my mission to ${esc(f.n)} (${n} online)</button>` : f.lead ? `<div class="oghelp">Only ${esc(nameOf(f.lead))} can send to this flight</div>` : ''}
</div>`;
  };
  const packs = view.packages
    .map(p => {
      const canEdit = adm || pkLeadOf(p.id),
        pilots = p.flights.reduce((n, f) => n + f.members.length, 0);
      return `<div class="ogpack"><div class="oghead">${canEdit ? `<input class="ogname big" data-pkname="${esc(p.id)}" value="${esc(p.n)}" maxlength="24" aria-label="Package name">` : `<b class="ogtitle big">${esc(p.n)}</b>`}<span class="oglead">Package lead: ${adm ? pilotSel(`data-pklead="${esc(p.id)}"`, p.lead, allUids, '—') : `<b>${p.lead ? esc(nameOf(p.lead)) : '—'}</b>`}</span><span class="ogmu ogright">${p.flights.length} of ${MAX_FLIGHTS} flights · ${pilots} aircraft</span>${adm ? `<button class="ogx ogdel" data-delpk="${esc(p.id)}" title="Delete the package" aria-label="Delete the package ${esc(p.n)}">×</button>` : ''}</div>
<div class="ogflights">${p.flights.map(f => flightCard(p, f)).join('')}${canEdit && !p.full ? `<button class="ogadd" data-addfl="${esc(p.id)}">+ Add flight</button>` : ''}</div></div>`;
    })
    .join('');
  const addPk =
    adm && view.packages.length < MAX_PACKAGES ? '<button class="ogadd wide" data-addpk>+ Add package</button>' : '';
  const empty = !view.packages.length
    ? `<div class="oghelp ogempty">No packages yet.${adm ? ' Add a package, then its flights, and drag the pilots into them.' : ' The commander or the mission commander sets up the packages and flights.'}</div>`
    : '';

  // a pilot who lost his file comes back as a new one
  const gone = live.filter(r => r.uid !== me && !online.has(r.uid) && r.uid !== q.owner);
  const fresh = live.filter(r => online.has(r.uid) && r.uid !== q.owner && r.uid !== q.mc && !view.seat[r.uid]);
  const lost = adm
    ? `<details class="oglost"><summary>A pilot lost his program file?</summary><div class="oghelp" style="margin:6px 0">He comes back with the invite as a new pilot. Choose the old entry (offline) and the new one: the new pilot gets the flight, the lead and the role of the old one.</div><div class="bar">${pilotSel('data-seatold', '', [...(q.roster[q.owner] && !online.has(q.owner) ? [q.owner] : []), ...gone.map(r => r.uid)], 'Old pilot…')}${pilotSel(
        'data-seatnew',
        '',
        fresh.map(r => r.uid),
        'New pilot…'
      )}<button class="btn g gn" data-seat>Give the seat back</button></div></details>`
    : '';
  const leave =
    q.owner === me && q.mc && q.roster[q.mc]
      ? `<div class="bar" style="margin-top:6px"><button class="btn g rd" data-leave title="You leave the squadron and the mission commander becomes the commander">Leave the squadron and hand the command to ${esc(nameOf(q.mc))}</button></div>`
      : '';
  return `${roles}<div class="ogbody">${side}<div class="ogmain">${empty}${packs}${addPk}${lost}${leave}</div></div>`;
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
  const nameN = (base, used) => {
    let i = used + 1;
    return base + ' ' + i;
  };
  const view = () => h.view();
  box.onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('addpk' in d) run({ t: 'pk+', name: nameN('Package', view().packages.length) });
    else if (d.addfl) {
      const p = view().packages.find(x => x.id === d.addfl);
      run({ t: 'fl+', pk: d.addfl, name: nameN('Flight', p ? p.flights.length : 0) });
    } else if (d.delpk) {
      if (await h.confirm('Delete this package and its flights? The pilots go back to Unassigned.'))
        run({ t: 'pk-', id: d.delpk });
    } else if (d.delfl) {
      if (await h.confirm('Delete this flight? Its pilots go back to Unassigned.')) run({ t: 'fl-', id: d.delfl });
    } else if (d.out) run({ t: 'as', uid: d.out, f: '' });
    else if (d.lead) run({ t: 'fllead', id: d.fl, uid: b.classList.contains('on') ? '' : d.lead });
    else if (d.send) h.send(d.send);
    else if ('clear' in d) {
      if (await h.confirm('Delete all the packages and flights?'))
        for (const p of view().packages) run({ t: 'pk-', id: p.id });
    } else if ('leave' in d) h.leave();
    else if ('seat' in d) {
      const o = box.querySelector('[data-seatold]').value,
        n = box.querySelector('[data-seatnew]').value;
      if (!o || !n) return h.toast('Choose the old pilot and the new one.');
      if (await h.confirm('Give the seat of the old pilot to the new one? The old entry leaves the squadron.'))
        run({ t: 'seat', old: o, nu: n });
    }
  };
  box.onchange = async e => {
    const t = e.target,
      d = t.dataset,
      v = t.value;
    if (d.pkname) run({ t: 'pk~', id: d.pkname, name: v });
    else if (d.flname) run({ t: 'fl~', id: d.flname, name: v });
    else if (d.pklead) run({ t: 'pklead', id: d.pklead, uid: v });
    else if (d.fllead) run({ t: 'fllead', id: d.fllead, uid: v });
    else if ('mc' in d) run({ t: 'mc', uid: v });
    else if ('cmd' in d) {
      if (v && (await h.confirm('Hand the command of the squadron to this pilot?'))) run({ t: 'cmd', uid: v });
      else t.value = '';
    } else if (d.moveto) {
      if (v) run({ t: 'as', uid: d.moveto, f: v });
    }
  };
  // dragging: what a drop would do is asked to the rules when the drag starts, so only the flights that accept the pilot light up
  let drag = null;
  box.ondragstart = e => {
    const c = e.target.closest && e.target.closest('[data-pilot]');
    if (!c) return;
    const uid = c.dataset.pilot,
      q = h.q(),
      ok = new Map();
    box.querySelectorAll('[data-drop]').forEach(z => {
      const f = z.dataset.drop,
        r = orgReduce(q, h.me, { t: 'as', uid, f }, { now: Date.now(), rid: () => 'x', online: h.online() });
      ok.set(f, r.ok);
    });
    drag = { uid, ok };
    box.dataset.drag = '1';
    e.dataTransfer.setData('text/plain', uid);
    e.dataTransfer.effectAllowed = 'move';
    box.querySelectorAll('[data-drop]').forEach(z => z.classList.toggle('okdrop', !!ok.get(z.dataset.drop)));
  };
  box.ondragend = () => {
    drag = null;
    delete box.dataset.drag;
    box.querySelectorAll('.okdrop,.over').forEach(z => z.classList.remove('okdrop', 'over'));
  };
  box.ondragover = e => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !drag || !drag.ok.get(z.dataset.drop)) return;
    e.preventDefault();
    box.querySelectorAll('.over').forEach(x => x !== z && x.classList.remove('over'));
    z.classList.add('over');
  };
  box.ondrop = e => {
    const z = e.target.closest && e.target.closest('[data-drop]');
    if (!z || !drag) return;
    e.preventDefault();
    const d = drag;
    box.ondragend();
    if (d.ok.get(z.dataset.drop)) run({ t: 'as', uid: d.uid, f: z.dataset.drop });
    else h.toast('This pilot cannot go there.');
  };
}
