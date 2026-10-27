// Squadron organisation: shapes, merge, limits, permissions, command and seats
import {
  newOrg,
  cleanOrg,
  mergeOrg,
  pruneOrg,
  orgView,
  orgReduce,
  isAdmin,
  MAX_FLIGHTS,
  MAX_PILOTS,
  NAME_MAX,
  flightWarning,
} from '../app/js/core/organization.js';
import { orgHtml } from '../app/js/core/orgpage.js';

let n = 0,
  bad = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name);
  }
};
const pilots = ['cmd1', 'mc1', 'pl1', 'fl1', 'w1', 'w2', 'w3', 'w4', 'w5', 'x1', 'x2'];
const mkQ = () => ({
  owner: 'cmd1',
  mc: 'mc1',
  org: newOrg(),
  ts: 1,
  roster: Object.fromEntries(pilots.map(u => [u, { uid: u, callsign: u, ts: 1 }])),
});
let T = 1000,
  I = 0;
const ctx = (online = []) => ({ now: ++T, rid: () => 'i' + ++I, online: new Set(online) });
// runs an action; returns the new squad or null (and keeps the error)
let err = '';
const run = (q, who, a, on) => {
  const r = orgReduce(q, who, a, ctx(on));
  err = r.ok ? '' : r.error;
  return r.ok ? r.q : null;
};
const idOf = (q, sec, name) => Object.values(q.org[sec]).find(x => x.n === name).id;

// ---- shapes
let o = cleanOrg({
  pk: {
    a1: { n: 'x'.repeat(80), lead: 'u1', ts: 5 },
    __proto__: { n: 'bad', ts: 1 },
    'bad id': { n: 'b', ts: 1 },
    a2: { n: 'ok', ts: 'now' },
    a3: 5,
  },
  fl: { f1: { n: 'F', pk: 'a1', lead: '<script>', ts: 4 }, f2: { n: 'G', pk: 5, ts: 1 } },
  as: { u1: { f: 'f1', ts: 3 }, u2: { f: 7, ts: 3 }, u3: { f: '', ts: 3 } },
});
ok('name cut to the limit', o.pk.a1 && o.pk.a1.n.length === NAME_MAX);
ok('bad keys and shapes dropped', Object.keys(o.pk).join() === 'a1' && Object.keys(o.fl).join() === 'f1');
ok('a lead that is not an id is emptied', o.fl.f1.lead === '');
ok('assignments checked', Object.keys(o.as).sort().join() === 'u1,u3');
ok(
  'garbage gives an empty organisation',
  Object.keys(cleanOrg('x').pk).length === 0 && cleanOrg(null).as !== undefined
);
ok(
  'item count is limited',
  Object.keys(
    cleanOrg({ as: Object.fromEntries(Array.from({ length: 900 }, (_, i) => ['u' + i, { f: '', ts: 1 }])) }).as
  ).length === 600
);

// ---- merge: newer wins, order does not matter
const A = { pk: { p1: { id: 'p1', n: 'Old', lead: '', ts: 5 } }, fl: {}, as: { u1: { f: 'f1', ts: 5 } } };
const B = {
  pk: { p1: { id: 'p1', n: 'New', lead: '', ts: 9 } },
  fl: {},
  as: { u1: { f: 'f2', ts: 3 }, u2: { f: 'f1', ts: 3 } },
};
let m1 = mergeOrg(A, B),
  m2 = mergeOrg(B, A);
ok('newer item wins', m1.org.pk.p1.n === 'New' && m1.org.as.u1.f === 'f1' && m1.org.as.u2.f === 'f1');
ok('same result in both orders', JSON.stringify(m1.org) === JSON.stringify(m2.org));
ok('changed is reported', m1.changed && !mergeOrg(m1.org, B).changed);
const t1 = { pk: { p1: { id: 'p1', n: 'A', lead: '', ts: 7 } }, fl: {}, as: {} },
  t2 = { pk: { p1: { id: 'p1', n: 'B', lead: '', ts: 7 } }, fl: {}, as: {} };
ok(
  'same time: every computer picks the same',
  JSON.stringify(mergeOrg(t1, t2).org) === JSON.stringify(mergeOrg(t2, t1).org)
);
let pr = pruneOrg(
  { pk: { a: { id: 'a', n: 'x', ts: 1, x: 1 }, b: { id: 'b', n: 'y', ts: 2, x: 0 } }, fl: {}, as: {} },
  1e12
);
ok('old deleted items are forgotten, live ones stay', !pr.pk.a && !!pr.pk.b);

// ---- building the structure and its limits
let q = mkQ();
ok('commander and mission commander are admins', isAdmin(q, 'cmd1') && isAdmin(q, 'mc1') && !isAdmin(q, 'pl1'));
ok('a pilot cannot create a package', run(q, 'pl1', { t: 'pk+', name: 'STRIKE' }) === null && /Only/.test(err));
ok('a package needs a name', run(q, 'mc1', { t: 'pk+', name: '   ' }) === null);
q = run(q, 'mc1', { t: 'pk+', name: 'STRIKE' });
q = run(q, 'cmd1', { t: 'pk+', name: 'CAP' });
const PK = idOf(q, 'pk', 'STRIKE'),
  CAP = idOf(q, 'pk', 'CAP');
q = run(q, 'mc1', { t: 'pklead', id: PK, uid: 'pl1' });
ok('package lead set', orgView(q).packages[0].lead === 'pl1');
ok(
  'editing a package does not change the order',
  orgView(q).packages[0].n === 'STRIKE' && orgView(q).packages[1].n === 'CAP'
);
ok(
  'package lead of a pilot outside the squadron refused',
  run(q, 'mc1', { t: 'pklead', id: PK, uid: 'ghost' }) === null
);
ok('a pilot cannot name package leads', run(q, 'w1', { t: 'pklead', id: PK, uid: 'w1' }) === null);
ok('a package lead cannot name his own successor', run(q, 'pl1', { t: 'pklead', id: PK, uid: 'w1' }) === null);
for (let i = 1; i <= MAX_FLIGHTS; i++) q = run(q, i % 2 ? 'pl1' : 'mc1', { t: 'fl+', pk: PK, name: 'F' + i });
ok('package lead and mission commander create flights', orgView(q).packages[0].flights.length === MAX_FLIGHTS);
ok('a sixth flight is refused', run(q, 'mc1', { t: 'fl+', pk: PK, name: 'F6' }) === null && /at most 5/.test(err));
ok('a package lead of another package cannot add flights', run(q, 'pl1', { t: 'fl+', pk: CAP, name: 'Z' }) === null);
q = run(q, 'mc1', { t: 'fl+', pk: CAP, name: 'Hawk' });
const HAWK = idOf(q, 'fl', 'Hawk'),
  F1 = idOf(q, 'fl', 'F1'),
  F2 = idOf(q, 'fl', 'F2');

// ---- moving pilots
ok('a pilot does not choose his flight', run(q, 'w1', { t: 'as', uid: 'w1', f: F1 }) === null);
ok('commander places a pilot', (q = run(q, 'cmd1', { t: 'as', uid: 'w1', f: F1 })) && orgView(q).seat.w1.fl === F1);
ok(
  'a flight lead needs to be in the flight',
  run(q, 'mc1', { t: 'fllead', id: F1, uid: 'w2' }) === null && /first/.test(err)
);
q = run(q, 'mc1', { t: 'fllead', id: F1, uid: 'w1' });
ok('flight lead named', orgView(q).packages[0].flights[0].lead === 'w1');
q = run(q, 'w1', { t: 'as', uid: 'w2', f: F1 });
ok('a flight lead takes a pilot who flies nowhere', !!q && orgView(q).seat.w2.fl === F1);
ok(
  'a flight lead cannot take a pilot of another flight',
  (q = run(q, 'pl1', { t: 'as', uid: 'w3', f: F2 })) && run(q, 'w1', { t: 'as', uid: 'w3', f: F1 }) === null
);
ok('a flight lead cannot move a pilot into another flight', run(q, 'w1', { t: 'as', uid: 'w2', f: F2 }) === null);
q = run(q, 'w1', { t: 'as', uid: 'w2', f: '' });
ok('a flight lead lets a pilot go', !!q && !orgView(q).seat.w2);
ok(
  'a package lead moves a pilot inside his package',
  !!(q = run(q, 'pl1', { t: 'as', uid: 'w3', f: F1 })) && orgView(q).seat.w3.fl === F1
);
ok('a package lead cannot place a pilot in another package', run(q, 'pl1', { t: 'as', uid: 'w4', f: HAWK }) === null);
ok('a pilot can leave his flight', !!(q = run(q, 'w3', { t: 'as', uid: 'w3', f: '' })) && !orgView(q).seat.w3);
q = run(q, 'cmd1', { t: 'as', uid: 'w2', f: F1 });
q = run(q, 'cmd1', { t: 'as', uid: 'w3', f: F1 });
q = run(q, 'cmd1', { t: 'as', uid: 'w4', f: F1 });
ok(
  'a flight holds ' + MAX_PILOTS,
  orgView(q).packages[0].flights[0].members.length === MAX_PILOTS && orgView(q).packages[0].flights[0].full
);
ok('a fifth pilot is refused', run(q, 'cmd1', { t: 'as', uid: 'w5', f: F1 }) === null && /full/.test(err));
ok('moving to the flight he is in changes nothing', run(q, 'cmd1', { t: 'as', uid: 'w4', f: F1 }) === q);
q = run(q, 'cmd1', { t: 'as', uid: 'w4', f: F2 });
ok(
  'moving takes him out of the first flight',
  orgView(q).seat.w4.fl === F2 && orgView(q).packages[0].flights[0].members.length === 3
);

// ---- two pilots fill the last seat at the same moment: every computer shows the same four
{
  const base = mkQ();
  let b = run(base, 'mc1', { t: 'pk+', name: 'P' });
  const P = idOf(b, 'pk', 'P');
  b = run(b, 'mc1', { t: 'fl+', pk: P, name: 'F' });
  const F = idOf(b, 'fl', 'F');
  for (const u of ['w1', 'w2', 'w3']) b = run(b, 'mc1', { t: 'as', uid: u, f: F });
  const left = run(b, 'mc1', { t: 'as', uid: 'w4', f: F }),
    right = run(b, 'cmd1', { t: 'as', uid: 'w5', f: F });
  const x = { ...left, org: mergeOrg(left.org, right.org).org },
    y = { ...right, org: mergeOrg(right.org, left.org).org };
  const vx = orgView(x),
    vy = orgView(y);
  ok('same picture on both computers', JSON.stringify(vx) === JSON.stringify(vy));
  ok(
    'four seated, the fifth shown as unassigned',
    vx.packages[0].flights[0].members.length === 4 && vx.unassigned.includes(vx.packages[0].flights[0].overflow[0])
  );
}
// a flight that is deleted, a pilot who is removed, a sixth flight that arrives from outside
q = run(q, 'cmd1', { t: 'fl-', id: F2 });
ok('deleting a flight sets its pilots free', !!q && !orgView(q).seat.w4 && orgView(q).unassigned.includes('w4'));
ok('a flight lead cannot delete a flight', run(q, 'w1', { t: 'fl-', id: F1 }) === null);
q = { ...q, roster: { ...q.roster, w1: { ...q.roster.w1, removed: true } } };
ok(
  'a removed pilot leaves the view and loses the lead',
  !orgView(q).seat.w1 && orgView(q).packages[0].flights[0].lead === ''
);
{
  const big = {
    owner: 'cmd1',
    mc: '',
    roster: q.roster,
    org: cleanOrg({
      pk: { p: { n: 'P', ts: 1 } },
      fl: Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['f' + i, { n: 'F' + i, pk: 'p', ts: 10 + i }])),
    }),
  };
  ok('flights above the limit are not shown', orgView(big).packages[0].flights.length === MAX_FLIGHTS);
}
q = run(q, 'mc1', { t: 'pk-', id: CAP });
ok(
  'deleting a package deletes its flights',
  orgView(q).packages.length === 1 && !Object.values(q.org.fl).some(f => f.pk === CAP && !f.x)
);

// ---- command
q = mkQ();
ok('the commander cannot be mission commander too', run(q, 'cmd1', { t: 'mc', uid: 'cmd1' }) === null);
ok('a pilot cannot name the mission commander', run(q, 'w1', { t: 'mc', uid: 'w1' }) === null);
let q2 = run(q, 'cmd1', { t: 'mc', uid: 'pl1' });
ok('commander names the mission commander', q2.mc === 'pl1' && q2.ts > q.ts);
ok('the mission commander names his successor', run(q2, 'pl1', { t: 'mc', uid: 'fl1' }).mc === 'fl1');
ok(
  'the mission commander cannot take the command while the commander is here',
  run(q, 'mc1', { t: 'cmd', uid: 'mc1' }) === null
);
ok('the commander passes the command', run(q, 'cmd1', { t: 'cmd', uid: 'pl1' }).owner === 'pl1');
ok(
  'passing the command to the mission commander empties that role',
  run(q, 'cmd1', { t: 'cmd', uid: 'mc1' }).mc === ''
);
let gone = { ...q, roster: { ...q.roster, cmd1: { ...q.roster.cmd1, removed: true } } };
ok(
  'the mission commander takes the command when the commander is gone',
  run(gone, 'mc1', { t: 'cmd', uid: 'mc1' }).owner === 'mc1'
);
ok(
  'a commander who leaves hands over to the mission commander',
  (() => {
    const r = run(q, 'cmd1', { t: 'leave' });
    return r.owner === 'mc1' && r.mc === '';
  })()
);
ok(
  'a commander cannot leave without a mission commander',
  run({ ...q, mc: '' }, 'cmd1', { t: 'leave' }) === null && /Name a mission commander/.test(err)
);
{
  let w = run(q, 'mc1', { t: 'pk+', name: 'P' });
  const P = idOf(w, 'pk', 'P');
  w = run(w, 'mc1', { t: 'fl+', pk: P, name: 'F' });
  const F = idOf(w, 'fl', 'F');
  w = run(w, 'mc1', { t: 'as', uid: 'w1', f: F });
  w = run(w, 'mc1', { t: 'fllead', id: F, uid: 'w1' });
  const l = run(w, 'w1', { t: 'leave' });
  ok('a pilot who leaves frees his seat and his lead', !orgView(l).seat.w1 && l.org.fl[F].lead === '');
}

// ---- a lost file: the new pilot takes the old seat
{
  let w = run(mkQ(), 'mc1', { t: 'pk+', name: 'P' });
  const P = idOf(w, 'pk', 'P');
  w = run(w, 'mc1', { t: 'fl+', pk: P, name: 'F' });
  const F = idOf(w, 'fl', 'F');
  w = run(w, 'mc1', { t: 'as', uid: 'w1', f: F });
  w = run(w, 'mc1', { t: 'fllead', id: F, uid: 'w1' });
  w = run(w, 'mc1', { t: 'pklead', id: P, uid: 'w1' });
  w.roster.w1.role = 'Lead';
  ok('only an admin gives a seat back', run(w, 'pl1', { t: 'seat', old: 'w1', nu: 'x1' }) === null);
  ok(
    'a pilot who is linked is not lost',
    run(w, 'mc1', { t: 'seat', old: 'w1', nu: 'x1' }, ['w1']) === null && /linked/.test(err)
  );
  const s = run(w, 'mc1', { t: 'seat', old: 'w1', nu: 'x1' });
  const v = orgView(s);
  ok('the new pilot flies where the old one flew', v.seat.x1 && v.seat.x1.fl === F && !v.seat.w1);
  ok('and leads where he led', v.packages[0].lead === 'x1' && v.packages[0].flights[0].lead === 'x1');
  ok(
    'the old entry is out, the role text passes on',
    s.roster.w1.removed && s.roster.w1.merged === 'x1' && s.roster.x1.role === 'Lead'
  );
  ok(
    'a seat is not given to the commander or the mission commander',
    run(w, 'mc1', { t: 'seat', old: 'w1', nu: 'cmd1' }) === null
  );
  // the commander lost his file: the mission commander brings him back
  const lost = run(mkQ(), 'mc1', { t: 'seat', old: 'cmd1', nu: 'x2' });
  ok('the lost commander gets the command back', lost && lost.owner === 'x2' && lost.roster.cmd1.removed);
  ok('and a mission commander lost too', run(mkQ(), 'cmd1', { t: 'seat', old: 'mc1', nu: 'x2' }).mc === 'x2');
}
ok('unknown action refused', run(mkQ(), 'cmd1', { t: 'nope' }) === null);
ok('somebody outside the squadron cannot act', run(mkQ(), 'stranger', { t: 'pk+', name: 'X' }) === null);

// ---- the name of a flight against the mission about to be sent to it
const mis = { name: '1301 Hawkeye 4', datacard: { label: 'Hawkeye 4 · F-16C · SEAD' } };
ok(
  'the callsign in any case matches',
  flightWarning('hawkeye 4', mis) === '' &&
    flightWarning('HAWKEYE', mis) === '' &&
    flightWarning('Hawkeye4', mis) === ''
);
ok(
  'the package number matches',
  flightWarning('1301', mis) === '' &&
    flightWarning('Pkg 1301', mis) === '' &&
    flightWarning('Package 1301 Strike', mis) === ''
);
ok(
  'another name warns, naming both',
  /does not look like/.test(flightWarning('Viper', mis)) &&
    /Viper/.test(flightWarning('Viper', mis)) &&
    /1301 Hawkeye 4/.test(flightWarning('Viper', mis))
);
ok('a flight with a generic name warns', flightWarning('Flight 2', mis) !== '');
ok(
  'nothing to compare: no warning',
  flightWarning('', mis) === '' && flightWarning('Viper', null) === '' && flightWarning('Viper', {}) === ''
);

// ---- the board: each role sees the controls it can use
{
  let w = run(mkQ(), 'mc1', { t: 'pk+', name: 'STRIKE' });
  const P = idOf(w, 'pk', 'STRIKE');
  w = run(w, 'mc1', { t: 'fl+', pk: P, name: 'Viper' });
  const F = idOf(w, 'fl', 'Viper');
  w = run(w, 'mc1', { t: 'as', uid: 'fl1', f: F });
  w = run(w, 'mc1', { t: 'fllead', id: F, uid: 'fl1' });
  w = run(w, 'mc1', { t: 'as', uid: 'w1', f: F });
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = (me, on = ['fl1', 'w1']) => orgHtml(w, orgView(w), me, new Set(on), esc, u => w.roster[u].callsign);
  const h1 = html('mc1'),
    h2 = html('fl1'),
    h3 = html('w1'),
    h4 = html('cmd1');
  ok(
    'the mission commander can build and send',
    /data-addpk/.test(h1) &&
      /data-addfl/.test(h1) &&
      /data-send=/.test(h1) &&
      /data-clear/.test(h1) &&
      /data-mc/.test(h1)
  );
  ok(
    'the flight lead sends and renames his flight but cannot add packages or flights',
    /data-send=/.test(h2) &&
      /data-flname/.test(h2) &&
      !/data-addpk/.test(h2) &&
      !/data-addfl/.test(h2) &&
      !/data-delpk/.test(h2) &&
      !/data-delfl/.test(h2)
  );
  ok(
    'a wingman has no button to send, rename or move',
    !/data-send=/.test(h3) && !/data-flname/.test(h3) && !/data-fllead/.test(h3) && !/data-pklead/.test(h3)
  );
  ok(
    'a wingman can take himself out of his flight, nobody else',
    /data-out="w1"/.test(h3) && !/data-out="fl1"/.test(h3)
  );
  ok('only the commander can hand over the command', /data-cmd/.test(h4) && !/data-cmd/.test(h1));
  ok(
    'the count of online pilots to send to leaves me out',
    /Send my mission to Viper \(1 online\)/.test(h2) && /Send my mission to Viper \(2 online\)/.test(h1)
  );
  ok('my flight is marked', /YOUR FLIGHT/.test(h2) && !/YOUR FLIGHT/.test(h1));
  ok('the commander is called so, a flight lead too', /COMMANDER/.test(h1) && />LEAD</.test(h1));
  ok('pilots who fly nowhere are offered for the flight', /data-moveto="pl1"/.test(h1) && /STRIKE · Viper/.test(h1));
  ok(
    'a name with markup is escaped',
    !/<script/.test(
      orgHtml(
        { ...w, roster: { ...w.roster, pl1: { uid: 'pl1', callsign: '<script>x</script>' } } },
        orgView(w),
        'mc1',
        new Set(),
        esc,
        u => String(w.roster[u].callsign || '')
      )
    )
  );
  ok('the commander with a mission commander can leave and hand over', /data-leave/.test(h4) && !/data-leave/.test(h1));
}

console.log(bad ? `${bad} of ${n} organization checks failed` : `OK - ${n} organization checks`);
process.exit(bad ? 1 : 0);
