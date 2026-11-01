// "Operational" percentage of an objective against the values read in the BMS target list (Bear Trap campaign, see core/objstatus.js)
import { operational } from '../app/js/core/objstatus.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const F = (name, v, k = 1) => Array.from({ length: k }, () => ({ name, value: v }));
// 3rd Artillery Brigade: a radio tower of 75 destroyed -> 25%
ck('one destroyed tower of 75', operational([...F('Radio Tower R&W', 75), ...F('Barracks', 5, 13)], [3]) === 25);
// ROK 2nd Operations Base: three damaged barracks of 5 -> 94 (half of 5 rounds down to 2)
ck(
  'three damaged barracks',
  operational(F('Barracks', 5, 23), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 2]) === 94
);
// Depot #6: an ammo dump of 50 damaged -> 75
ck('one damaged ammo dump', operational([...F('Ammo Dump', 50, 6), ...F('Admin Building', 15)], [2]) === 75);
// a wind farm whose features are worth 0 stays at 100 even with a destroyed turbine
ck('features worth 0', operational(F('Wind Turbine Small', 0, 23), [0, 0, 0, 0, 0, 3]) === 100);
// bridges, bases that lost the main features: 0, never negative
ck('two bridges of 100 destroyed', operational(F('Bridge Concrete', 100, 4), [3, 3, 0, 0]) === 0);
ck('never below 0', operational(F('Radio Tower Tall', 75, 3), [3, 3, 3]) === 0);
ck('intact', operational(F('Barracks', 5, 5), [0, 0, 0, 0, 0]) === 100 && operational(F('x', 5), null) === 100);
// airfield: two runways, one has a destroyed section -> 50% whatever else is lost
const ap = [
  ...F('RKPK Runway Stopway', 0),
  ...F('RKPK Runway THR 18L', 90),
  ...F('RKPK Runway Section', 95, 2),
  ...F('RKPK Runway THR 36R', 90),
  ...F('RKPK Runway Stopway', 0, 2),
  ...F('RKPK Runway THR 18R', 90),
  ...F('RKPK Runway Section', 95, 2),
  ...F('RKPK Runway THR 36L', 90),
  ...F('Depot Building', 50),
];
const st = Array(ap.length).fill(0);
st[3] = 3; // a section of the first runway
st[ap.length - 1] = 3; // the depot
ck('airfield: one of two runways cut', operational(ap, st) === 50);
st[8] = 3;
ck('airfield: both runways cut', operational(ap, st) === 0);
ck(
  'airfield: only damaged sections',
  operational(
    ap,
    st.map(() => 2)
  ) === 100
);
console.log(n - bad + '/' + n + ' objstatus checks ok');
process.exit(bad ? 1 : 0);
