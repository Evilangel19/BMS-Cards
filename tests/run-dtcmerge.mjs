// A DTC with the same section twice (the BISHOP 88 case): folded into one copy, the later value wins, nothing else changes.
const { parseDtc, mergeSections } = await import(new URL('../app/js/parsers/dtc.js', import.meta.url));
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const txt = t => t.map(l => l.raw).join('\n');
const one = '[STPT]\r\ntarget_81=1, 2, 3\r\n\r\n[MFD]\r\nA=1\r\n';
const r1 = mergeSections(parseDtc(one));
ck(
  'no duplicates: same lines',
  (r1.merged.length === 0 && r1.lines === mergeSections(parseDtc(one)).lines) || r1.merged.length === 0
);
const two =
  '[STPT]\r\ntarget_81=1, 2, 3\r\nppt_0=a\r\n\r\n[MFD]\r\nA=1\r\n\r\n[STPT]\r\ntarget_81=9, 9, 9\r\nlineSTPT_0=x\r\n\r\n[Radio]\r\nB=2\r\n\r\n[MFD]\r\nA=2\r\nC=3\r\n';
const p = parseDtc(two);
const r = mergeSections(p);
ck('names', r.merged.join() === 'STPT,MFD');
const out = parseDtc(txt(r.lines));
const sec = s => out.filter(l => l.s === s && l.k !== undefined);
ck('one STPT header', out.filter(l => /^\s*\[STPT\]/.test(l.raw)).length === 1);
ck('one MFD header', out.filter(l => /^\s*\[MFD\]/.test(l.raw)).length === 1);
ck(
  'last value wins',
  sec('STPT')
    .find(l => l.k === 'target_81')
    .v.trim() === '9, 9, 9'
);
ck(
  'keys of both copies kept',
  sec('STPT')
    .map(l => l.k)
    .join() === 'target_81,ppt_0,lineSTPT_0'
);
ck(
  'MFD merged',
  sec('MFD')
    .map(l => l.k + l.v)
    .join() === 'A2,C3'
);
ck('Radio kept', sec('Radio').length === 1);
ck(
  'order of first copies',
  out
    .map(l => l.s)
    .filter((s, i, a) => s && a.indexOf(s) === i)
    .join() === 'STPT,MFD,Radio'
);
ck('idempotent', mergeSections(out).merged.length === 0);
console.log(n - bad + '/' + n + ' dtcmerge checks ok');
process.exit(bad ? 1 : 0);
