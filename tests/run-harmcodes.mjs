// The HARM code (ALIC) of a SAM of the campaign: its fire control radar, the one SEAD and DEAD want to kill. Made-up names, no BMS file.
import { harmCode, threatOf } from '../app/js/core/harmcodes.js';

let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const T = {
  'SA-2 Guideline': 202,
  'SA-3 Goa': 203,
  'SA-4': 204,
  'SA-5 Gammon': 205,
  'SA-6 Gainful': 206,
  'SA-10 Grumble': 210,
};
Object.entries(T).forEach(([k, v]) =>
  ck(k + ': the tracking radar ' + v, harmCode(k) === v && /T$/.test(threatOf(v)[2]))
);
ck(
  'SA-11 and SA-17: the radars of their TELARs (211 Fire Dome, 217 Chairback)',
  harmCode('SA-11 Gadfly') === 211 && harmCode('SA-17 Grizzly') === 217
);
ck('Hawk: its fire control radar (230, HT)', harmCode('I-Hawk') === 230 && threatOf(230)[2] === 'HT');
ck(
  'the systems listed by their radar stay (SA-8, SA-15, SA-19, Patriot, Skyguard)',
  harmCode('SA-8 Gecko') === 608 &&
    harmCode('SA-15 Gauntlet') === 615 &&
    harmCode('SA-19') === 619 &&
    harmCode('Patriot') === 693 &&
    harmCode('Skyguard') === 695
);
ck(
  'every code is in the table of the HARM',
  Object.values(T)
    .concat([211, 217, 230])
    .every(c => threatOf(c))
);
ck('an IR system has none', harmCode('SA-13 Gopher') === null && harmCode('Stinger') === null);

console.log(bad ? 'FAIL - ' + bad + ' of ' + n : 'OK - ' + n + ' HARM code checks');
process.exit(bad ? 1 : 0);
