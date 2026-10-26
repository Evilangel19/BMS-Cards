// Theater list / .tdf parsing (inline samples, no BMS files needed).
import { parseTheaterList, parseTdf, theaterDirs, parseTheaterTxt } from '../app/js/bmsdata/bmsdata.js';
let bad = 0,
  n = 0;
const ok = (name, cond, info = '') => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name, info);
  }
};
const lst =
  'TerrData\\TheaterDefinition\\Korea KTO.tdf\r\nAdd-On Korea TvT\\TerrData\\TheaterDefinition\\Korea_TvT.tdf\r\n\r\n';
const list = parseTheaterList(lst);
ok('theater list', list.length === 2 && list[1].startsWith('Add-On'));
const tdf = parseTdf(
  '# c\nname Korea KTO\ncampaigndir Campaign\nterraindir Terrdata\\korea\nobjectdir Terrdata\\objects\nmoviedir \n#uisounddir Sounds\nmintacan 1'
);
ok(
  'tdf keys',
  tdf.name === 'Korea KTO' &&
    tdf.campaigndir === 'Campaign' &&
    tdf.objectdir === 'Terrdata\\objects' &&
    tdf.moviedir === '' &&
    tdf.uisounddir === undefined
);
let d = theaterDirs(list[0], tdf);
ok(
  'default theater dirs',
  d.base.length === 0 && d.campaign.join('/') === 'Campaign' && d.objects.join('/') === 'Terrdata/objects'
);
d = theaterDirs(list[1], parseTdf('name Korea TvT\ncampaigndir Campaign'));
ok(
  'add-on theater dirs',
  d.name === 'Korea TvT' &&
    d.base.join('/') === 'Add-On Korea TvT' &&
    d.campaign.join('/') === 'Add-On Korea TvT/Campaign' &&
    d.objects === null
);
d = theaterDirs(
  'Add-On Balkans\\Terrdata\\theaterdefinition\\Balkans.tdf',
  parseTdf(
    'name Balkans\ncampaigndir Add-On Balkans\\Campaign\nterraindir Add-On Balkans\\Terrdata\\Balkans\nobjectdir Add-On Balkans\\Terrdata\\objects'
  )
);
ok(
  'add-on theater with full paths in the tdf (Balkans): the base is not doubled',
  d.campaign.join('/') === 'Add-On Balkans/Campaign' &&
    d.objects.join('/') === 'Add-On Balkans/Terrdata/objects' &&
    d.terrain.join('/') === 'Add-On Balkans/Terrdata/Balkans',
  JSON.stringify(d)
);
// Theater.txt and the map centre of a theater
const tt = parseTheaterTxt(
  'Theater name=Balkans\r\nTheater size in KM=1024\r\nMap size in pixels=32768\r\nCenter latitude=41.8327\r\nCenter longitude=16.4191\r\nProjection string=+proj=tmerc'
);
ok(
  'Theater.txt',
  tt &&
    tt.name === 'Balkans' &&
    tt.sizeKm === 1024 &&
    tt.mapPx === 32768 &&
    Math.abs(tt.lat - 41.8327) < 1e-9 &&
    Math.abs(tt.lon - 16.4191) < 1e-9
);
ok('Theater.txt without a centre', parseTheaterTxt('Theater name=x') === null);
const { setGeo } = await import('../app/js/rules/geo.js'),
  { toLL, fromLL, theaterBounds } = await import('../app/js/core/mapdata.js');
const near = (a, b, e) => Math.abs(a - b) < e;
let ll = toLL(512, 512);
ok('Korea centre by default', near(ll[0], 38.5, 1e-6) && near(ll[1], 127.5, 1e-6));
const kb = JSON.stringify(theaterBounds());
ok('Korea bounds unchanged', kb === '[[32,121],[43.5,133.5]]');
setGeo(tt.lat, tt.lon);
ll = toLL(512, 512);
ok('Balkans centre', near(ll[0], 41.8327, 1e-6) && near(ll[1], 16.4191, 1e-6), ll);
const back = fromLL(ll[0], ll[1]);
ok('Balkans round trip', near(back[0], 512, 1e-6) && near(back[1], 512, 1e-6), back);
const nw = toLL(0, 1024),
  se = toLL(1024, 0);
ok('Balkans corners about 512 km from the centre', nw[0] > 45 && se[0] < 38.5 && nw[1] < 12 && se[1] > 21, [nw, se]);
const bb = theaterBounds();
ok(
  'Balkans bounds contain the theater',
  bb[0][0] < se[0] && bb[1][0] > nw[0] && bb[0][1] < nw[1] && bb[1][1] > se[1],
  bb
);
setGeo();
ok('back to Korea', near(toLL(512, 512)[1], 127.5, 1e-6));
console.log(bad ? `${bad} of ${n} theater checks failed` : `OK - ${n} theater checks`);
process.exit(bad ? 1 : 0);
