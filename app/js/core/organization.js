// @ts-check
// Squadron organisation: packages, flights, who flies where, and who may change what. Pure functions, no screen and no network.
//
// State kept in a squadron q:
//   q.owner  the commander (a pilot id)          q.mc  the mission commander (a pilot id or '')
//   q.org    { pk: {id: {id, n, lead, ts, x?}},   packages   (lead: the package lead)
//              fl: {id: {id, n, pk, lead, ts, x?}}, flights   (pk: package id, lead: the flight lead)
//              as: {uid: {f, ts}} }                where every pilot flies ('' = nowhere)
//   c = when it was created (the order on screen), ts = when it was last changed.
//   x = 1 marks a deleted item (kept for a while so the deletion reaches the pilots who were offline).
// Every item has its own time stamp: when two pilots exchange their organisation the newer item wins, item by item.
// What the screen shows is orgView(q): the limits (5 flights in a package, 4 pilots in a flight) are applied there, the same way on every computer,
// so two pilots who fill the last seat at the same moment do not end up with different pictures.

export const MAX_PACKAGES = 40;
export const MAX_FLIGHTS = 5; // flights in a package (BMS does not accept a sixth)
export const MAX_PILOTS = 4; // pilots in a flight
export const NAME_MAX = 24;
const MAX_ITEMS = { pk: MAX_PACKAGES, fl: MAX_PACKAGES * MAX_FLIGHTS, as: 600 };
export const TOMB_DAYS = 60;

export const newOrg = () => ({ pk: {}, fl: {}, as: {} });

const ID = /^[A-Za-z0-9]{1,16}$/;
const isId = v => typeof v == 'string' && ID.test(v);
const isTs = v => typeof v == 'number' && isFinite(v) && v >= 0;
/** a name typed by a person: one line, no more than NAME_MAX characters */
export const cleanName = v =>
  String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);

/** An organisation that came from outside (or from the saved file): only what has the right shape is kept. */
export function cleanOrg(o) {
  const out = newOrg();
  if (!o || typeof o != 'object') return out;
  const take = (sec, f) => {
    const src = o[sec];
    if (!src || typeof src != 'object') return;
    let n = 0;
    for (const [k, v] of Object.entries(src)) {
      if (n >= MAX_ITEMS[sec]) break;
      if (!isId(k) || !v || typeof v != 'object') continue;
      const c = f(k, v);
      if (c) {
        out[sec][k] = c;
        n++;
      }
    }
  };
  take('pk', (k, v) => {
    if (!isTs(v.ts)) return null;
    const c = { id: k, n: cleanName(v.n), lead: isId(v.lead) ? v.lead : '', c: isTs(v.c) ? v.c : v.ts, ts: v.ts };
    if (v.x) c.x = 1;
    return c;
  });
  take('fl', (k, v) => {
    if (!isTs(v.ts) || !isId(v.pk)) return null;
    const c = {
      id: k,
      n: cleanName(v.n),
      pk: v.pk,
      lead: isId(v.lead) ? v.lead : '',
      c: isTs(v.c) ? v.c : v.ts,
      ts: v.ts,
    };
    if (v.x) c.x = 1;
    return c;
  });
  take('as', (k, v) => {
    if (!isTs(v.ts) || (v.f !== '' && !isId(v.f))) return null;
    return { f: v.f, ts: v.ts };
  });
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Item by item, the newer one wins (the same time: the smaller text, so every computer picks the same one). */
export function mergeOrg(mine, theirs) {
  const out = cleanOrg(mine),
    t = cleanOrg(theirs);
  let changed = false;
  for (const sec of /** @type {const} */ (['pk', 'fl', 'as'])) {
    for (const [k, v] of Object.entries(t[sec])) {
      const o = out[sec][k];
      if (!o || v.ts > o.ts || (v.ts === o.ts && !same(o, v) && JSON.stringify(v) < JSON.stringify(o))) {
        out[sec][k] = v;
        changed = true;
      }
    }
  }
  return { org: out, changed };
}

/** Deleted items older than TOMB_DAYS are forgotten (everybody has had the time to hear about them). */
export function pruneOrg(org, now = Date.now()) {
  const lim = now - TOMB_DAYS * 864e5;
  for (const sec of /** @type {const} */ (['pk', 'fl']))
    for (const [k, v] of Object.entries(org[sec] || {})) if (v.x && v.ts < lim) delete org[sec][k];
  return org;
}

// packages and flights stay in the order they were created (c), whatever is changed later
const byTs = (a, b) => a.c - b.c || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * What the squadron looks like: packages with their flights and pilots, and the pilots who fly nowhere.
 * @param {{org?:any, roster?:any}} q
 */
export function orgView(q) {
  const org = q.org || newOrg(),
    R = q.roster || {},
    live = u => !!R[u] && !R[u].removed;
  const seat = {}; // pilot id -> {pk, fl}
  const packages = Object.values(org.pk || {})
    .filter(p => !p.x)
    .sort(byTs)
    .map(p => {
      const flights = Object.values(org.fl || {})
        .filter(f => !f.x && f.pk === p.id)
        .sort(byTs)
        .slice(0, MAX_FLIGHTS)
        .map(f => {
          const cand = Object.entries(org.as || {})
            .filter(([u, a]) => a.f === f.id && live(u))
            .sort((x, y) => x[1].ts - y[1].ts || (x[0] < y[0] ? -1 : 1))
            .map(x => x[0]);
          const members = cand.slice(0, MAX_PILOTS);
          members.forEach(u => (seat[u] = { pk: p.id, fl: f.id }));
          return {
            id: f.id,
            n: f.n,
            pk: p.id,
            lead: members.includes(f.lead) ? f.lead : '',
            members,
            overflow: cand.slice(MAX_PILOTS),
            full: members.length >= MAX_PILOTS,
          };
        });
      return { id: p.id, n: p.n, lead: live(p.lead) ? p.lead : '', flights, full: flights.length >= MAX_FLIGHTS };
    });
  const unassigned = Object.keys(R).filter(u => live(u) && !seat[u]);
  return { packages, unassigned, seat };
}

/** @param {string} error @returns {{ok:false, error:string}} */
const fail = error => ({ ok: false, error });
const liveIn = (q, u) => !!u && !!q.roster && !!q.roster[u] && !q.roster[u].removed;

/** commander or mission commander: may change everything of the organisation */
export const isAdmin = (q, uid) => !!uid && (q.owner === uid || q.mc === uid);

/**
 * One change of the organisation made by pilot `actor`; nothing is changed when it is not allowed.
 * ctx: {now, rid(): a new id, online: Set of the pilot ids linked now (a seat can be taken over only from a pilot who is not)}
 * actions: pk+ {name} · pk~ {id,name} · pk- {id} · pklead {id,uid} · fl+ {pk,name} · fl~ {id,name} · fl- {id} · fllead {id,uid} · as {uid,f}
 *          mc {uid} · cmd {uid} · leave {} · seat {old,nu}
 * @returns {{ok:true, q:any}|{ok:false, error:string}}
 */
export function orgReduce(q, actor, a, ctx) {
  const now = ctx.now;
  if (!liveIn(q, actor) && q.owner !== actor) return fail('You are not in this squadron.');
  const org = cleanOrg(q.org); // a copy
  const nq = { ...q, org, owner: q.owner, mc: q.mc || '', roster: q.roster };
  const view = orgView({ org, roster: q.roster });
  const admin = isAdmin(q, actor);
  const flight = fid => {
    for (const p of view.packages) for (const f of p.flights) if (f.id === fid) return { p, f };
    return null;
  };
  const stamp = (sec, id, patch) => {
    const was = org[sec][id];
    org[sec][id] = { ...(was || {}), id, ...patch, c: was && was.c != null ? was.c : now, ts: now };
  };
  const touch = () => {
    nq.ts = now;
  };
  switch (a.t) {
    case 'pk+': {
      if (!admin) return fail('Only the commander and the mission commander create packages.');
      const n = cleanName(a.name);
      if (!n) return fail('A package needs a name.');
      if (view.packages.length >= MAX_PACKAGES) return fail('Too many packages.');
      const id = ctx.rid();
      stamp('pk', id, { n, lead: '' });
      break;
    }
    case 'pk~': {
      const p = view.packages.find(x => x.id === a.id);
      if (!p) return fail('This package does not exist any more.');
      if (!admin && p.lead !== actor)
        return fail('Only the commander, the mission commander and the package lead rename a package.');
      const n = cleanName(a.name);
      if (!n) return fail('A package needs a name.');
      stamp('pk', p.id, { n, lead: org.pk[p.id].lead });
      break;
    }
    case 'pk-': {
      const p = view.packages.find(x => x.id === a.id);
      if (!p) return fail('This package does not exist any more.');
      if (!admin) return fail('Only the commander and the mission commander delete packages.');
      for (const f of Object.values(org.fl)) if (f.pk === p.id && !f.x) stamp('fl', f.id, { x: 1 });
      for (const f of p.flights) for (const u of [...f.members, ...f.overflow]) org.as[u] = { f: '', ts: now };
      stamp('pk', p.id, { x: 1 });
      break;
    }
    case 'pklead': {
      const p = view.packages.find(x => x.id === a.id);
      if (!p) return fail('This package does not exist any more.');
      if (!admin) return fail('Only the commander and the mission commander name the package leads.');
      if (a.uid && !liveIn(q, a.uid)) return fail('This pilot is not in the squadron.');
      stamp('pk', p.id, { lead: a.uid || '' });
      break;
    }
    case 'fl+': {
      const p = view.packages.find(x => x.id === a.pk);
      if (!p) return fail('This package does not exist any more.');
      if (!admin && p.lead !== actor)
        return fail('Only the commander, the mission commander and the package lead create flights.');
      const n = cleanName(a.name);
      if (!n) return fail('A flight needs a name.');
      if (p.flights.length >= MAX_FLIGHTS) return fail('A package holds at most ' + MAX_FLIGHTS + ' flights.');
      stamp('fl', ctx.rid(), { n, pk: p.id, lead: '' });
      break;
    }
    case 'fl~': {
      const x = flight(a.id);
      if (!x) return fail('This flight does not exist any more.');
      if (!admin && x.p.lead !== actor && x.f.lead !== actor) return fail('You cannot rename this flight.');
      const n = cleanName(a.name);
      if (!n) return fail('A flight needs a name.');
      stamp('fl', x.f.id, { n, pk: x.p.id, lead: org.fl[x.f.id].lead });
      break;
    }
    case 'fl-': {
      const x = flight(a.id);
      if (!x) return fail('This flight does not exist any more.');
      if (!admin && x.p.lead !== actor)
        return fail('Only the commander, the mission commander and the package lead delete flights.');
      for (const u of [...x.f.members, ...x.f.overflow]) org.as[u] = { f: '', ts: now };
      stamp('fl', x.f.id, { x: 1 });
      break;
    }
    case 'fllead': {
      const x = flight(a.id);
      if (!x) return fail('This flight does not exist any more.');
      if (!admin && x.p.lead !== actor)
        return fail('Only the commander, the mission commander and the package lead name the flight leads.');
      if (a.uid && !x.f.members.includes(a.uid)) return fail('Put the pilot in the flight first.');
      stamp('fl', x.f.id, { lead: a.uid || '', pk: x.p.id, n: org.fl[x.f.id].n });
      break;
    }
    case 'as': {
      if (!liveIn(q, a.uid)) return fail('This pilot is not in the squadron.');
      const to = a.f ? flight(a.f) : null;
      if (a.f && !to) return fail('This flight does not exist any more.');
      const from = view.seat[a.uid] ? flight(view.seat[a.uid].fl) : null;
      if (to && from && to.f.id === from.f.id) return { ok: true, q };
      if (!to && !from) return { ok: true, q };
      let allowed = admin;
      if (!allowed && a.uid === actor) allowed = !to; // a pilot can leave his flight, not choose another
      if (!allowed) allowed = (!!to && to.p.lead === actor) || (!!from && from.p.lead === actor);
      if (!allowed && to && !from) allowed = to.f.lead === actor; // a flight lead takes a pilot who flies nowhere
      if (!allowed && !to && from) allowed = from.f.lead === actor; // and lets him go
      if (!allowed) return fail('You cannot move this pilot.');
      if (to && to.f.members.length >= MAX_PILOTS) return fail('This flight is full (' + MAX_PILOTS + ' pilots).');
      org.as[a.uid] = { f: a.f || '', ts: now };
      break;
    }
    case 'mc': {
      if (!admin) return fail('Only the commander and the mission commander name the mission commander.');
      if (a.uid) {
        if (!liveIn(q, a.uid)) return fail('This pilot is not in the squadron.');
        if (a.uid === q.owner) return fail('The commander cannot also be the mission commander.');
      }
      nq.mc = a.uid || '';
      touch();
      break;
    }
    case 'cmd': {
      if (!liveIn(q, a.uid)) return fail('This pilot is not in the squadron.');
      if (a.uid === q.owner) return { ok: true, q };
      const gone = !liveIn(q, q.owner);
      if (q.owner !== actor && !(q.mc === actor && gone)) return fail('Only the commander passes the command.');
      nq.owner = a.uid;
      if (nq.mc === a.uid) nq.mc = '';
      touch();
      break;
    }
    case 'leave': {
      if (q.owner === actor) {
        if (!liveIn(q, q.mc)) return fail('Name a mission commander first: he takes the command when you leave.');
        nq.owner = q.mc;
        nq.mc = '';
        touch();
      } else if (q.mc === actor) {
        nq.mc = '';
        touch();
      }
      if (org.as[actor] && org.as[actor].f) org.as[actor] = { f: '', ts: now };
      for (const sec of /** @type {const} */ (['pk', 'fl']))
        for (const v of Object.values(org[sec])) if (v.lead === actor && !v.x) stamp(sec, v.id, { lead: '' });
      break;
    }
    case 'seat': {
      // a pilot who lost his file comes back as a new pilot: the old entry (offline) passes its seat to the new one
      if (!admin) return fail('Only the commander and the mission commander give a seat back.');
      const o = q.roster && q.roster[a.old];
      if (!o || o.removed) return fail('This pilot is not in the squadron.');
      if (!liveIn(q, a.nu) || a.nu === a.old) return fail('Choose the pilot who comes back.');
      if (a.nu === q.owner || a.nu === q.mc) return fail('This pilot already has a role.');
      if (ctx.online && ctx.online.has(a.old)) return fail('This pilot is linked now: he is not lost.');
      if (view.seat[a.old]) {
        // he flies where the old one flew
        org.as[a.nu] = { f: view.seat[a.old].fl, ts: now };
        org.as[a.old] = { f: '', ts: now };
      }
      for (const sec of /** @type {const} */ (['pk', 'fl']))
        for (const v of Object.values(org[sec])) if (v.lead === a.old && !v.x) stamp(sec, v.id, { lead: a.nu });
      if (nq.owner === a.old) nq.owner = a.nu;
      if (nq.mc === a.old) nq.mc = a.nu;
      nq.roster = { ...q.roster, [a.old]: { ...o, removed: true, merged: a.nu, ts: now } };
      const nu = q.roster[a.nu];
      if (nu && !nu.role && o.role) nq.roster[a.nu] = { ...nu, role: o.role, ts: now };
      touch();
      break;
    }
    default:
      return fail('Unknown action.');
  }
  return { ok: true, q: nq };
}

const norm = t =>
  String(t == null ? '' : t)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const GENERIC = new Set(['package', 'pkg', 'pack', 'flight', 'fl', 'flt', 'no', 'nr', 'num', 'number']);
/**
 * A warning when the name of a flight does not look like the mission about to be sent to it ('' = it does, or nothing can be said).
 * The name may hold the callsign or the package number of the mission, in any case and with or without spaces: "Hawkeye", "hawkeye 4", "1301", "Pkg 1301".
 * @param {string} flightName @param {any} m the mission (name, datacard.label)
 */
export function flightWarning(flightName, m) {
  const fn = norm(flightName);
  if (!fn || !m) return '';
  const label = (m.datacard && m.datacard.label) || '',
    hay = norm((m.name || '') + ' ' + label);
  if (!hay) return '';
  if (hay.includes(fn)) return '';
  const toks = String(flightName)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(x => x.length >= 2 && !GENERIC.has(x));
  if (toks.some(x => hay.includes(x))) return '';
  return (
    'The mission "' +
    (m.name || '') +
    '" does not look like the flight "' +
    flightName +
    '": the name of the flight should hold the callsign or the package number of the mission. Send it anyway?'
  );
}

/**
 * The shape of the night as a template: packages and flights with their names, leads and pilots.
 * @returns {{pk:{n:string, lead:string, fl:{n:string, lead:string, m:string[]}[]}[]}}
 */
export function orgToTemplate(q) {
  const v = orgView({ org: q.org, roster: q.roster });
  return {
    pk: v.packages.map(p => ({
      n: p.n,
      lead: p.lead || '',
      fl: p.flights.map(f => ({ n: f.n, lead: f.lead || '', m: f.members.slice() })),
    })),
  };
}

/**
 * Replaces all the packages and flights with the ones of a template (only a commander may). Pilots who left the squadron are skipped.
 * ctx: as in orgReduce. @returns {{ok:true, q:any}|{ok:false, error:string}}
 */
export function orgFromTemplate(q, actor, tpl, ctx) {
  if (!isAdmin(q, actor)) return fail('Only the commander and the mission commander load a template.');
  const list = tpl && Array.isArray(tpl.pk) ? tpl.pk.slice(0, MAX_PACKAGES) : [];
  let cur = q,
    last = '';
  const rid = () => (last = ctx.rid());
  /** @param {any} a @returns {boolean} */
  const go = a => {
    const r = orgReduce(cur, actor, a, { ...ctx, rid });
    if (!r.ok) return false;
    cur = r.q;
    return true;
  };
  for (const p of orgView({ org: q.org, roster: q.roster }).packages) go({ t: 'pk-', id: p.id });
  for (const tp of list) {
    if (!tp || !go({ t: 'pk+', name: String(tp.n || '') })) continue;
    const pid = last;
    if (tp.lead && liveIn(q, tp.lead)) go({ t: 'pklead', id: pid, uid: tp.lead });
    for (const tf of Array.isArray(tp.fl) ? tp.fl.slice(0, MAX_FLIGHTS) : []) {
      if (!tf || !go({ t: 'fl+', pk: pid, name: String(tf.n || '') })) continue;
      const fid = last;
      const placed = [];
      for (const u of Array.isArray(tf.m) ? tf.m.slice(0, MAX_PILOTS) : [])
        if (liveIn(q, u) && go({ t: 'as', uid: u, f: fid })) placed.push(u);
      if (tf.lead && placed.includes(tf.lead)) go({ t: 'fllead', id: fid, uid: tf.lead });
    }
  }
  return { ok: true, q: cur };
}

/**
 * A pilot dropped on "Add package": a new package with a first flight and the pilot in it.
 * ctx: as in orgReduce. @returns {{ok:true, q:any}|{ok:false, error:string}}
 */
export function orgNewPackageWith(q, actor, uid, ctx) {
  let last = '';
  const rid = () => (last = ctx.rid());
  const step = (cur, a) => orgReduce(cur, actor, a, { ...ctx, rid });
  const n = orgView({ org: q.org, roster: q.roster }).packages.length;
  let r = step(q, { t: 'pk+', name: 'Package ' + (n + 1) });
  if (!r.ok) return r;
  const pid = last;
  r = step(r.q, { t: 'fl+', pk: pid, name: 'Flight 1' });
  if (!r.ok) return r;
  const fid = last;
  return step(r.q, { t: 'as', uid, f: fid });
}
