// Pylons and racks: BMS counts them in the loadout weight and drag. Synthetic file with the rules of the real BmsRack.dat.
import { parseRacks, rackLoad, weaponClass, parseAircraftData } from '../app/js/bmsdata/bmsdata.js';
let n = 0,
  bad = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', name);
  }
};
const wcd = ids =>
  '<WCD_LIST>' +
  ids
    .map(
      ([num, ct, w, d]) =>
        `<WCD Num="${num}"><CtIdx>${ct}</CtIdx><Name>x</Name><Weight>${w}</Weight><Drag>${d}</Drag></WCD>`
    )
    .join('') +
  '</WCD_LIST>';
const rk = parseRacks(
  `# comment
definerack aim-no-rail
	rackct 0
	addwclass aim
definerack tank370
	rackct 0
	addwclass tank
	addwid 93
definerack tank600
	rackct 2490
	addwid 103
definerack no-rack
	rackct 0
	addwclass bomb, gbu
definegroup wing
	addpylon
		pylonct 0
			addrack tank370
			addrack tank600
	addpylon
		pylonct 1858 # LAU-129
			addrack aim-no-rail
	addpylon
		pylonct 1980
			addrack no-rack
`,
  wcd([
    [1, 1858, 95, 2],
    [2, 1980, 320, 14],
    [3, 2490, 295, 8],
  ])
);
ok(
  'racks and groups read',
  Object.keys(rk.racks).length === 4 && rk.groups.wing.length === 3 && rk.groups.wing[1].ct === 1858
);
ok(
  'an AIM-9 on the wing uses the LAU-129 pylon',
  JSON.stringify(rackLoad(rk, 'wing', 176, 'aim')) === '{"w":95,"d":2}'
);
ok(
  'a 600 gal tank: the rack that names it wins over the tank class (295 lb)',
  JSON.stringify(rackLoad(rk, 'wing', 103, 'tank')) === '{"w":295,"d":8}'
);
ok(
  'a bomb: the normal pylon (320 lb, drag 14)',
  JSON.stringify(rackLoad(rk, 'wing', 287, 'gbu')) === '{"w":320,"d":14}'
);
ok(
  'unknown group or weapon: nothing',
  rackLoad(rk, 'nope', 1, 'aim') === null && rackLoad(rk, 'wing', 5, 'ecm') === null
);
ok(
  'weapon classes',
  weaponClass('AIM-9X Sidewinder') === 'aim' &&
    weaponClass('GBU-10G/B /AP') === 'gbu' &&
    weaponClass('Tank 600gal', true) === 'tank' &&
    weaponClass('AN/ALQ-184') === 'ecm' &&
    weaponClass('AGM-88B HARM') === 'harm' &&
    weaponClass('Mk-82') === 'bomb'
);
const a = parseAircraftData([
  {
    name: 'F-16CM-40.txtpb',
    text: 'empty_weight_lbs: 19800\ninternal_fuel_lbs: 7000\n  hardpoints {\n    hardpoint_grp: "0"\n    hardpoint_grp: "f16-wingtip"\n  }\n',
  },
]);
ok(
  'hardpoint groups read from the aircraft file',
  a.hp['F-16CM-40'].join() === '0,f16-wingtip' && a.ew['F-16CM-40'] === 19800
);
console.log(`racks: ${n - bad}/${n} checks passed`);
process.exit(bad ? 1 : 0);
