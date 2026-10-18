// Theater list / .tdf parsing (inline samples, no BMS files needed).
import { parseTheaterList, parseTdf, theaterDirs } from '../app/js/bmsdata/bmsdata.js';
let bad = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) { bad++; console.log('FAIL', name, info); } };
const lst = 'TerrData\\TheaterDefinition\\Korea KTO.tdf\r\nAdd-On Korea TvT\\TerrData\\TheaterDefinition\\Korea_TvT.tdf\r\n\r\n';
const list = parseTheaterList(lst);
ok('theater list', list.length === 2 && list[1].startsWith('Add-On'));
const tdf = parseTdf('# c\nname Korea KTO\ncampaigndir Campaign\nterraindir Terrdata\\korea\nobjectdir Terrdata\\objects\nmoviedir \n#uisounddir Sounds\nmintacan 1');
ok('tdf keys', tdf.name === 'Korea KTO' && tdf.campaigndir === 'Campaign' && tdf.objectdir === 'Terrdata\\objects' && tdf.moviedir === '' && tdf.uisounddir === undefined);
let d = theaterDirs(list[0], tdf);
ok('default theater dirs', d.base.length === 0 && d.campaign.join('/') === 'Campaign' && d.objects.join('/') === 'Terrdata/objects');
d = theaterDirs(list[1], parseTdf('name Korea TvT\ncampaigndir Campaign'));
ok('add-on theater dirs', d.name === 'Korea TvT' && d.base.join('/') === 'Add-On Korea TvT' && d.campaign.join('/') === 'Add-On Korea TvT/Campaign' && d.objects === null);
console.log(bad ? `${bad} of ${n} theater checks failed` : `OK - ${n} theater checks`);
process.exit(bad ? 1 : 0);
