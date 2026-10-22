import {isDesktop, fileSize, listDir, readBytes, findFiles} from '../platform/desktop.js';
import {heightSpec, parseTheaterValues} from '../bmsdata/heightmap.js';
import {parseMisList, parseMissileDat, parseLoftTable} from '../bmsdata/missiledata.js';
import {CAM} from '../core/cam-core.js';
import {parseAcPerf} from '../bmsdata/acperf.js';
import {ST} from './state.js';
import {jp} from './base.js';

// terrain heights: the HeightMap.raw of the theater (Data\TerrData\<theater>\NewTerrain\HeightMaps), read one sample at a time from the BMS folder
export let TERR = null;
export let TERRKEY = '';
export async function terrain(){
 const inst=ST.CFG.paths.bmsInstall;if(!isDesktop()||!inst)return null;const key=inst+'|'+(ST.TH&&ST.TH.name);if(TERRKEY===key)return TERR;TERRKEY=key;TERR=null;
 try{const data=jp(inst,'Data'),dn=q=>q.replace(/[\\/][^\\/]*$/,''),dirs=[ST.TH&&ST.TH.tdfEntry?jp(data,dn(ST.TH.tdfEntry)):null,ST.TH?jp(data,'TerrData',ST.TH.name):null,ST.TH&&ST.TH.terrain?jp(data,...ST.TH.terrain):null,!ST.THGEO||(ST.THGEO.lat===38.5&&ST.THGEO.lon===127.5)?jp(data,'TerrData','Korea'):null].filter(Boolean);let dir=null,hm='',f=null;
  for(const d of dirs){const h=jp(d,'NewTerrain','HeightMaps'),n=(await listDir(h)).map(e=>e.name).find(x=>/\.raw$/i.test(x)&&/height/i.test(x));if(n){dir=d;hm=h;f=n;break}}
  if(!f)return null;const path=jp(hm,f);let vals={};
  for(const c of [jp(dir,'Theater.txt'),jp(dir,'NewTerrain','Theater.txt'),jp(hm,'Theater.txt')]){try{vals=parseTheaterValues(new TextDecoder('latin1').decode(await readBytes(c)));break}catch(e){}}
  const spec=heightSpec(vals,await fileSize(path),1024);if(spec)TERR={path,spec}}catch(e){TERR=null}
 return TERR}
export let misMemo = null;
export const misLoad = ()=>misMemo||(misMemo=(async()=>{// Data\Sim\...\Misdata: MisTypes.lst + <name>.dat + Lofttables\<file>
  try{const inst=ST.CFG.paths.bmsInstall;if(!isDesktop()||!inst)return null;const lst=(await findFiles(jp(inst,'Data','Sim'),['MisTypes.lst'],3))['MisTypes.lst'];if(!lst)return null;const dir=lst.replace(/[\\/][^\\/]*$/,''),dec=b=>new TextDecoder('latin1').decode(b),o={},lofts={};
   for(const n of parseMisList(dec(await readBytes(lst)))){try{const m=parseMissileDat(dec(await readBytes(jp(dir,n+'.dat'))));if(!m.range)continue;let lt=null;if(m.loftFile){if(!(m.loftFile in lofts)){try{lofts[m.loftFile]=parseLoftTable(dec(await readBytes(jp(dir,'Lofttables',m.loftFile))))}catch(e){lofts[m.loftFile]=null}}lt=lofts[m.loftFile]}o[n]={title:m.title,params:m.params,range:m.range,loft:lt,extra:m.extra}}catch(e){}}return o}catch(e){return null}})());
/* Performance page: aircraft tables from Data\Sim\Acdata (desktop), or the ones saved in an open mission (no aircraft table is included in the program) */
ST.MSFAC = {};
export let ACDIR = null;
export async function acFolder(){if(ACDIR)return ACDIR;const inst=ST.CFG.paths.bmsInstall;if(!isDesktop()||!inst)return null;
 try{const data=jp(inst,'Data');let dir=ST.TH&&ST.TH.sim?jp(data,ST.TH.sim,'Acdata'):jp(data,'Sim','Acdata'),ents=await listDir(dir);
  if(!ents.length){const f=(await findFiles(inst,['F-16CM-40.txtpb'],6))['F-16CM-40.txtpb'];if(f){dir=f.replace(/[\\/][^\\/]*$/,'');ents=await listDir(dir)}}
  const names=ents.filter(e=>!e.isDirectory&&/\.txtpb$/i.test(e.name)).map(e=>e.name.replace(/\.txtpb$/i,'')).sort();return names.length?(ACDIR={dir,names}):null}catch(e){return null}}
export let acMemo;
export async function perfAcGet(n){if(!n)return null;if(ST.MSFAC[n])return ST.MSFAC[n];if(acMemo.has(n))return acMemo.get(n);let d=null;
 const f=await acFolder();if(f&&f.names.includes(n)){try{d=parseAcPerf(new TextDecoder('utf-8').decode(await readBytes(jp(f.dir,n+'.txtpb'))),n)}catch(e){d=null}}
 if(!d&&CAM.D.acfb[n])d=CAM.D.acfb[n];if(d)acMemo.set(n,d);return d}

// run 10: statements that run when the program starts (in the order of the original file)
export async function init10() {
  acMemo = new Map();
}
