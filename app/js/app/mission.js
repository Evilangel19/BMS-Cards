import {onCloseGuard, loadPrefs, isDesktop, join as joinPath, saveBlob as saveFile, pickFile} from '../platform/desktop.js';
import * as PJ from '../core/mission.js';
import {parseDtc} from '../parsers/dtc.js';
import {CAM} from '../core/cam-core.js';
import {ST} from './state.js';
import {$, IO, appToast, enc8, jclone} from './base.js';
import {DTCTEXT, S, dtcOverwrite, dtcRevert, lines, parse, view} from './dtcfile.js';
import {F, FD} from './datacard.js';
import {WXDIR, WXS, dtcDir, setSel, wxKeys, wxLoadKeys} from './campaign.js';
import {harmPage, mapV, pfPage} from './pages.js';
import {loadImg} from './cardview.js';
import {acMemo, perfAcGet} from './gamefiles.js';
import {apply, discardOk, hasMan, manClear, manDiff, markMan} from './selection.js';
import {atoCloseState, atoSearch} from './ato.js';
import {afterDtc, dtcBtns} from './dtcapply.js';

/* Mission (core/mission.js): one folder per package = the mission file (package taken out of the campaign, the DTC as opened with its changes kept apart, the datacard with its
   automatic and manual values), the program settings, the cards and a copy of the original kneeboards. The mission works without the campaign. */
export const MSFPREFS = ['mapprefs.json','dtcprefs.json','dtcdefaults.json','mfddefault.json'];
// default name of a mission: package number + callsign of the flight, e.g. "1301 Hawkeye 4"
export function msfName(x){const p=x.label.split(' · '),P=ST.C&&ST.C.byId&&ST.C.byId[x.f.pkg.n+':'+x.f.pkg.c],no=(P&&P.campId)||x.f.pkg.n;return PJ.safeName(no+' '+(p[0]||''))}
export function msfCardKeys(){return Object.keys(F).filter(k=>typeof F[k]=='string'&&!/^__/.test(k)||k=='__taf')}
export async function wxPack(u8){const s=new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate')),b=new Uint8Array(await new Response(s).arrayBuffer());let t='';for(let i=0;i<b.length;i+=8192)t+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(t)}
export async function wxBuild(f){try{await wxLoadKeys(wxKeys(f))}catch(e){}const series={};for(const k of wxKeys(f)){const w=WXS.get(k);if(w&&w.raw)series[k]=await wxPack(w.raw)}
 if(!(ST.WX&&ST.WX.raw)&&!Object.keys(series).length)return null;const o={};if(ST.WX&&ST.WX.raw)o.fmap=await wxPack(ST.WX.raw);if(Object.keys(series).length)o.series=series;return o}
export async function wxUnpack(t){const b=Uint8Array.from(atob(t),c=>c.charCodeAt(0)),s=new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'));return new Uint8Array(await new Response(s).arrayBuffer())}
// the weapons data (Weapons page, HARM and BVR pages): an attack profile travels with the mission
export function msfWeapons(){try{return {wp:jclone(ST.wpPage.state()),harm:jclone(harmPage.state()),bvr:jclone(ST.msPage.state())}}catch(e){return null}}
export async function msfMapshot(u){if(!u){ST.MAPSHOT=null;return}try{const im=await loadImg(u),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);ST.MAPSHOT=c}catch(e){}}
export async function msfBuild(){
 const i=+$('fsel').value||0,x=ST.CL[i];if(!ST.C||!x)throw new Error('Select a flight first (a campaign or a mission must be open).');
 const settings={config:ST.CFG,prefs:{}};for(const n of MSFPREFS){const o=await loadPrefs(n);if(o)settings.prefs[n]=o}
 const dtc=lines.length?{name: ST.name,path:ST.DTCF&&ST.DTCF.path||null,enc:ST.DTCF&&ST.DTCF.enc||'utf-8',bom:!!(ST.DTCF&&ST.DTCF.bom),original:DTCTEXT,edits:PJ.dtcEditsAgainst(parseDtc(DTCTEXT),lines)}:null;
 const final={},auto={};msfCardKeys().forEach(k=>{final[k]=F[k]});FD.forEach(d=>{auto[d.k]=(ST.AUTO&&ST.AUTO[d.k])||''});
 const manual=PJ.diffFields(ST.AUTO||{},F,FD.map(d=>d.k));
 let aircraft=null;try{const an=ST.C.D.ac[x.f.c.i],d=an&&await perfAcGet(an);if(d)aircraft={name:an,perf:d}}catch(e){}
 return PJ.buildMission({app:'BMS Cards',name:msfName(x),flight:x.f.id.n+':'+x.f.id.c,snapshot:PJ.snapshotCampaign(ST.C,x.f,{radiusNm:ST.CFG.mission.radiusNm}),dtc,datacard:{label:x.label,auto,manual,final},settings,weather:await wxBuild(x.f),aircraft,tanks:mapV.tanks(),weapons:msfWeapons(),mapshot:ST.MAPSHOT?ST.MAPSHOT.toDataURL('image/png'):null})}
export async function msfSave(){
 try{
  const msf=await msfBuild(),text=JSON.stringify(msf);
  if(!isDesktop()){saveFile(new Blob([text]),PJ.missionFolder.file(msf.name),'');MSFSIG=msfSig();appToast('Mission saved: '+PJ.missionFolder.file(msf.name));return}
  const app=await IO.appDir(),base=ST.CFG.paths.missions||joinPath(app,'missions'),dir=joinPath(base,msf.name);
  if(await IO.fileExists(joinPath(dir,PJ.missionFolder.file(msf.name)))&&!await confirm('The mission "'+msf.name+'" already exists:\n\n'+dir+'\n\nOverwrite it?'))return;
  await IO.makeDir(dir);
  await IO.writeBytes(joinPath(dir,PJ.missionFolder.file(msf.name)),enc8(text));
  await IO.writeBytes(joinPath(dir,PJ.missionFolder.settings),enc8(JSON.stringify(msf.settings,null,1)));
  MSFDIR=dir;MSFSIG=msfSig();appToast('Mission saved in: '+dir);
 }catch(e){alert('Could not save the mission: '+(e&&e.message||e))}}
export async function msfLoad(text,file){
 const r=PJ.parseMission(text);if(r.error)return alert(r.error);const p=r.mission;
 if(!p.package||!p.datacard)return alert('This mission has no package.');
 if(ST.C&&!await discardOk())return;
 try{
  ST.NOPERF=true;WXS.clear();WXDIR.files=null;ST.C=PJ.restoreCampaign(p.package,CAM.D);ST.CL=CAM.listFlights(ST.C,null);manClear();ST.WX=null;ST.L16=null;ST.IFFP=null;ST.CAMSEL='';setSel('');
  ST.MSFAC={};if(p.aircraft&&p.aircraft.perf){ST.MSFAC[p.aircraft.name]=p.aircraft.perf;acMemo.delete(p.aircraft.name)}pfPage.refresh();
  if(p.weather&&p.weather.series){for(const k of Object.keys(p.weather.series)){try{WXS.set(+k,CAM.parseFmap(await wxUnpack(p.weather.series[k])))}catch(e){}}}
  if(p.weather&&p.weather.fmap){try{ST.WX=CAM.parseFmap(await wxUnpack(p.weather.fmap))}catch(e){ST.WX=null}}
  try{mapV.setTanks(Array.isArray(p.tanks)?p.tanks:[])}catch(e){}
  let i=ST.CL.findIndex(x=>x.f.id.n+':'+x.f.id.c==p.datacard.flight);if(i<0)i=0;
  $('fsel').innerHTML=ST.CL.map((x,k)=>`<option value="${k}">${x.label}</option>`).join('');$('fsel').value=i;$('cinfo').textContent='Mission: '+p.name;
  if(p.dtc){ST.name=p.dtc.name||'DTC.ini';let dpath=null;if(isDesktop()){const cs=[p.dtc.path,dtcDir()?joinPath(dtcDir(),ST.name):''].filter(Boolean);for(const c of cs){try{if(await IO.fileExists(c)){dpath=c;break}}catch(e){}}if(!dpath&&cs.length)dpath=cs[cs.length-1]}   // the DTC of the mission is written where this computer keeps its DTC
   ST.DTCF={path:dpath,enc:p.dtc.enc||'utf-8',bom:!!p.dtc.bom,orig:enc8(p.dtc.original)};parse(p.dtc.original);p.dtc.edits.forEach(e=>S(e.s,e.k,e.v));$('fn').textContent=ST.name+' · from the mission';afterDtc('target_98',true);dtcBtns()}
  atoSearch();apply(i,'fresh');
  const w=p.weapons;if(w){try{w.wp&&ST.wpPage.setState(w.wp);w.harm&&harmPage.setState(w.harm);w.bvr&&ST.msPage.setState(w.bvr)}catch(e){}}
  const d=p.datacard;Object.assign(F,d.final||{});await msfMapshot(p.mapshot);ST.AUTO=Object.assign({},d.auto||ST.AUTO);ST.MANK=new Set(Object.keys(d.manual||{}));view();markMan();atoCloseState();atoSearch();MSFSIG=msfSig();
 }catch(e){alert('Could not open the mission: '+(e&&e.message||e))}finally{ST.NOPERF=false}}
// unsaved changes: the datacard fields typed by hand, the edited DTC lines; compared with what the last saved (or opened) mission held
export let MSFSIG = '';
export const dtcDirty = ()=>lines.some(l=>l.dirty);
// the values of the DTC (not the 'edited' marks, which a Save DTC clears: saving the file is not a change of the mission)
export const msfSig = ()=>{try{return JSON.stringify([$('fsel').value,manDiff(),[...ST.OVR.entries()],lines.map(l=>l.s+'|'+l.k+'|'+l.v)])}catch(e){return ''}};
export const unsaved = ()=>(hasMan()||dtcDirty())&&msfSig()!==MSFSIG;
export let MSFDIR = '';

// run 3: statements that run when the program starts (in the order of the original file)
export async function init3() {
  $('msfsave').onclick=msfSave;
  setInterval(()=>{const b=$('msfsave');if(b)b.classList.toggle('nil',!unsaved());if(document.body.classList.contains('onwp'))try{ST.wpPage.btn()}catch(e){}},700);
  onCloseGuard(async()=>!unsaved()||await confirm('There are changes not saved in a mission (and not written to the DTC). Close the program anyway?'),unsaved);
  $('msfopen').onclick=async()=>{const f=await pickFile({exts:['bcrd'],startDir:MSFDIR||ST.CFG.paths.missions||'',title:'Open a mission'});if(f)msfLoad(await f.text(),f)};
  $('wpapply').onclick=()=>{if($('wpapply').classList.contains('nil'))return;ST.wpPage.apply()};
  $('saveow').onclick=dtcOverwrite;
  $('dtcrev').onclick=dtcRevert;
}
