// Layout check of the BMS XML tables: a missing field is reported (a newer BMS may have changed the format).
let bad = 0;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) bad++;
};
const { missingFields, buildTables } = await import('../app/js/bmsdata/bmsdata.js');
{
  const okU =
    '<UCD Num="1"><Name>x</Name><CtIdx>1</CtIdx><VehicleCtIdx_0>2</VehicleCtIdx_0><Rng_Air>1</Rng_Air><Rng_LowAir>1</Rng_LowAir><RadarVehicle>0</RadarVehicle><Det_LowAir>5</Det_LowAir><Det_Air>9</Det_Air></UCD>';
  ok(missingFields('ucd', okU).length === 0, 'all fields present: no alarm');
  ok(missingFields('ucd', okU.replace('Det_LowAir', 'Det_Low')).join() === 'Det_LowAir', 'a renamed field is named');
  const r = await buildTables(async k => (k === 'ucd' ? okU.replace('RadarVehicle', 'Radar') : null));
  ok(r.changed.length === 1 && /RadarVehicle/.test(r.changed[0]), 'buildTables reports the changed layout');
}

process.exit(bad ? 1 : 0);
