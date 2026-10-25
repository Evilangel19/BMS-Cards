// Falcon BMS campaign (.cam) reader: table of contents, unit file (.uni), campaign-type table, bullseye.
import {lzExpand} from './lzss.js';

export function camToc(u8){const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);const t=dv.getUint32(0,true),n=dv.getUint32(t,true);let p=t+4;const E={};
 for(let k=0;k<n;k++){const nl=u8[p];const nm=new TextDecoder().decode(u8.subarray(p+1,p+1+nl));const o=dv.getUint32(p+1+nl,true),s=dv.getUint32(p+5+nl,true);p+=9+nl;E[nm.split('.').pop().toLowerCase()]=u8.subarray(o,o+s)}return E}

export function parseUni(blk,ver,ct){const h=new DataView(blk.buffer,blk.byteOffset,blk.byteLength);const num=h.getInt16(4,true),us=h.getInt32(6,true);
 const u=lzExpand(blk.subarray(10),us),d=new DataView(u.buffer);let p=0;
 const u8=()=>d.getUint8(p++),u16=()=>{const v=d.getUint16(p,true);p+=2;return v},i16=()=>{const v=d.getInt16(p,true);p+=2;return v},
  u32=()=>{const v=d.getUint32(p,true);p+=4;return v},i32=()=>{const v=d.getInt32(p,true);p+=4;return v},f32=()=>{const v=d.getFloat32(p,true);p+=4;return v},
  vu=()=>{const a=u32(),b=u32();return{n:a,c:b}},sk=n=>{p+=n};
 const wp=()=>{const w={};w.haves=u8();w.x=i16();w.y=i16();w.z=i16();w.arr=u32();w.act=u8();w.ract=u8();w.form=u8();
  if(ver>=73)u32();else u16();if(w.haves&2){w.tid=vu();u8();if(ver>103)sk(36)}if(w.haves&1)w.dep=u32();else w.dep=w.arr;if(ver>=86&&ver<100)sk(4);return w};
 const base=r=>{r.id=vu();r.et=u16();r.x=i16();r.y=i16();if(ver>=70)r.z=f32();r.spot=u32();r.spA=i16();r.spB=i16();r.owner=u8();r.campId=i16()};
 const unit=r=>{base(r);u32();r.roster=i32();r.flags=i32();i16();i16();vu();if(ver>1)vu();u8();u8();u8();if(ver>=83&&ver<100)sk(4);r.curwp=ver>=71?u16():u8();r.nameId=i16();i16();
  let n=ver>=71?u16():u8();if(n==0xFFFF)n=0;if(n>512)throw new Error('wp '+n+' @'+p);r.wps=[];for(let j=0;j<n;j++)r.wps.push(wp())};
 const obj=r=>{u32();ver>1?u32():u16();r.flags=0;u8();u8();u8();if(ver<100){if(ver>=86)sk(8);else if(ver>=84)sk(12);else if(ver>=83)sk(8)}
  const ns=u8();sk(ns);u8();r.nameId=i16();vu();u8();const lk=u8();sk(16*lk);if(ver>=20){const hr=u8();if(hr>0)sk(32)}
  if(ver>=103){r.sx=d.getFloat64(p,true);r.sy=d.getFloat64(p+8,true);sk(28)}
  if(ver>=106){r.name=new TextDecoder().decode(new Uint8Array(u.buffer,p,80)).split('\0')[0].trim();sk(80)}if(ver>=86&&ver<100)sk(24)};
 const units=[];
 for(let k=0;k<num&&p<u.length-1;k++){const p0=p;const et=u16();const c=ct[et-100];const r={t:et,c,p0};
  if(!c||c.e<=3||c.e==6||c.e!=4&&c.e!=5){base(r);obj(r);r.kind='obj'}
  else if(c.d==2&&c.k==6&&c.t==1){unit(r);f32();i32();if(ver==74||ver>=100)sk(16);sk(8);u32();u32();r.tot=u32();u32();i16();if(ver>=83&&ver<100)sk(6);
   const nl=u8();r.loads=[];for(let j=0;j<nl;j++){const ids=[],cn=[];for(let q=0;q<16;q++)ids.push(ver>=73?u16():u8());for(let q=0;q<16;q++)cn.push(u8());r.loads.push({ids,cn})}
   r.mission=u8();r.omis=u8();u8();r.prio=u8();u8();u8();u8();r.pkg=vu();r.sqd=vu();vu();
   r.slots=[u8(),u8(),u8(),u8()];r.pilots=[u8(),u8(),u8(),u8()];sk(8);r.lastSlot=u8();r.csId=u8();r.csNum=u8();u32();
   if(ver>=105)sk(16);if(ver>=108){r.tcn=[u8(),u8(),u8(),u8()];r.band=[u8(),u8(),u8(),u8()]}if(ver>=109)sk(4);if(ver>=83&&ver<100)sk(244);r.kind='flight'}
  else if(c.d==2&&c.k==6&&c.t==2){unit(r);const ne=u8();r.els=[];for(let j=0;j<ne;j++)r.els.push(vu());if(ne>0)vu();
   r.awacs=vu();r.jstar=vu();r.ecm=vu();r.tanker=vu();const wc=u8();
   if((r.flags&0x100000)&&wc==0){i16();if(ver<35)sk(2);i16();sk(4+16);if(ver>=16)sk(4);if(ver>=35)sk(1);if(ver>=41)sk(2)}
   else{u8();i16();sk(16);r.takeoff=u32();r.tp=u32();u32();i16();i16();if(ver<35)sk(2);i16();
    const ni=u8();for(let j=0;j<ni;j++)wp();const ng=u8();for(let j=0;j<ng;j++)wp();
    sk(32+4+8+14+9+9)}
   r.kind='pkg'}
  else if(c.d==2&&c.k==6&&c.t==3){unit(r);i32();u8();if(ver>=101)sk(16);sk(ver<69?200:ver==73?600:(ver==74||ver>=100)?1000:ver>=83?600:220);
   {const np=ver>=47?48:36;r.pil=[];for(let q=0;q<np;q++){if(ver>=47){const id=u16(),sr=u8(),st=u8(),aa=u8(),ag=u8(),as=u8(),an=u8(),ms=u16();r.pil.push({id,sr,st,aa,ag,as,an,ms})}else sk(10)}}sk(64);r.airbase=vu();vu();if(ver>=6&&ver<16)sk(8);{const q=p;r.sqs={missions:d.getUint32(q+24,true)};sk(16+12);r.sqs.acLoss=u8();r.sqs.pilotLoss=ver>=9?u8():0}ver>=100?sk(2):ver>=45?sk(1):0;
   if(ver>=83&&ver<100)sk(3);if(ver>=102)sk(5);if(ver>=105)sk(4);r.kind='sqd'}
  else if(c.d==3&&c.k==6){unit(r);u8();i16();vu();
   if(c.t==2){const ne=u8();sk(8*ne)}else if(c.t==1){sk(8);r.parent=vu();sk(8);sk(5);if(ver<15)sk(1);const ps=u8();if(ver>=83&&ver<100&&ps>0)sk(1)}
   else if(c.t==3){throw new Error('division')}r.kind='gnd'}
  else if(c.d==4&&c.k==6){unit(r);u8();u8();if(ver>=83&&ver<100)sk(9);r.kind='sea'}
  else{base(r);obj(r);r.kind='obj'}
  units.push(r)}
 return{units,end:p,len:u.length,num}}

export function ctFromXml(x){const ct=[];const P=t=>x.split('</CT>');
 x.split('</CT>').forEach(b=>{const m=b.match(/<CT Num="(\d+)">/);if(!m)return;const g=k=>{const q=b.match(new RegExp('<'+k+'>(-?\\d+)'));return q?+q[1]:0};
  ct[+m[1]]={d:g('Domain'),k:g('Class'),t:g('Type'),s:g('SubType'),p:g('Specific'),e:g('EntityType'),i:g('EntityIdx')}});return ct}

// Team relations (.tea): stance[a][b] = 0 hostile, 1 allied, 2 friendly, 3 neutral, 4 unfriendly, 5 at war.
// Records are walked in order (team, air tasking manager, two simple managers); layout as documented by the CamReader project.
export function teamStances(tea,ver){const d=new DataView(tea.buffer,tea.byteOffset,tea.byteLength);let p=0;const n=Math.min(8,d.getInt16(p,true));p+=2;const st=[];
 for(let i=0;i<n;i++){p+=8+2+1+1+2+8;const r=[];for(let j=0;j<8;j++){r.push(d.getInt16(p,true));p+=2}st.push(r);
  p+=8+4+2+2+2+2+4+4+16+16+2+160+80+36+20+29+4+1+20+3+20+200+25+25+25;
  p+=8+2+2+1+2;if(ver>=28){if(ver>=63)p+=2;p+=2;p++}
  const nb=d.getUint8(p++);p+=nb*40;p++;const nr=d.getInt16(p,true);p+=2;p+=nr*76;p+=30}
 if(p!==tea.length)throw new Error('tea layout');return st}
// Squadron names stored in the campaign (.cmp): the list after the recent/priority events and the campaign map. Layout as documented by the CamReader project.
export function squadNames(E,ver){const b=E.cmp,h=new DataView(b.buffer,b.byteOffset,b.byteLength),r=lzExpand(b.subarray(8),h.getUint32(4,true)),d=new DataView(r.buffer,r.byteOffset,r.byteLength);
 let p=2110+8;const ev=()=>{p+=2+2+4+1+1+2+4+4;const len=d.getInt16(p,true);p+=2;p+=Math.max(0,len)};
 const n1=d.getInt16(p,true);p+=2;for(let i=0;i<n1;i++)ev();const n2=d.getInt16(p,true);p+=2;for(let i=0;i<n2;i++)ev();
 const cm=d.getInt16(p,true);p+=2;p+=Math.max(0,cm);p+=2;const ns=d.getInt16(p,true);p+=2;const nl=ver>=102?80:40,out={};
 const str=(o,n)=>new TextDecoder('latin1').decode(r.subarray(o,o+n)).split('\0')[0].trim();
 if(ver<102)return out;
 for(let i=0;i<ns;i++){p+=8;const id=d.getUint32(p,true);p+=8+4;if(ver>=42)p+=4;p+=3+nl+1+4+4;const nm=str(p,nl);p+=nl;if(nm)out[id]=nm}
 return out}
// Objective deltas (.obd): what changed during the campaign for each objective: the owner (team) and the status of every feature (0 intact, 3 destroyed ...).
// Objectives that are not in the bundle are as they were at the start. Initial owners are not in the bundle.
export function objDeltas(E){const own=new Map(),feat=new Map();try{const b=E.obd,h=new DataView(b.buffer,b.byteOffset,b.byteLength),num=h.getInt16(4,true),u=lzExpand(b.subarray(10),h.getInt32(6,true)),d=new DataView(u.buffer,u.byteOffset,u.byteLength);
 let p=0;for(let i=0;i<num&&p+17<=u.length;i++){const id=d.getUint32(p,true),n=u[p+16];own.set(id,u[p+12]);feat.set(id,u.slice(p+17,p+17+n));p+=17+n}}catch(e){}return{own,feat}}
export const objOwners=E=>objDeltas(E).own;
// state of a feature / of an objective: 0 intact, 1 damaged, 2 destroyed
export const featState=v=>v===0||v===6?0:v>=3&&v<=5?2:1;
export function objState(st){if(!st||!st.length)return 0;let d=0,x=0;for(const v of st){const s=featState(v);if(s)d++;if(s==2)x++}return !d?0:x==st.length?2:1}
// The scenario a saved campaign was started from (a file such as Save3.cam in the Campaign folder): 40 characters at 1990 of the "cmp" section; '' when not known
export function baseCampaign(E,ver){try{if(ver<52||!E.cmp)return '';const b=E.cmp,h=new DataView(b.buffer,b.byteOffset,b.byteLength),r=lzExpand(b.subarray(8),h.getUint32(4,true));let t='';for(let i=1990;i<2030&&r[i];i++)t+=String.fromCharCode(r[i]);return t.trim()}catch(e){return ''}}
// Objectives as the scenario starts (section "obj" of Save0..5.cam; a saved campaign only holds the changes, see objDeltas): Map CAMPAIGN ID of the objective -> owner (team); the map has a property `vu`: Map entity id of the objective in the campaign files -> campaign id.
// Two numberings exist: the entity id (first field of a record; the one the changes of a saved campaign and the squadrons use) and the campaign id (the 2 bytes after the owner; the one of the theater files, OCD CampObj CampId). They differ (checked on EvilKorea and Bear Trap: 5,999 of 5,999 positions agree through the campaign id).
// Record: type u16, the base fields of a campaign entity (id 8, entity type 2, x y 4, z 4, spot 4, 4, owner 1, campaign id 2), last repair 4, flags 4, supply, fuel, losses, features (count + bytes),
// priority, name id 2, parent 8, first owner, links (count, 16 bytes each), radar flag (+32), 16 + 12 bytes, name 80. Known for versions 106 and later; null when the section does not read exactly.
export function objInitial(E){try{const ver=+new TextDecoder().decode(E.ver);if(ver<106||!E.obj)return null;const b=E.obj,h=new DataView(b.buffer,b.byteOffset,b.byteLength),num=h.getInt16(0,true),u=lzExpand(b.subarray(10),h.getInt32(2,true)),d=new DataView(u.buffer,u.byteOffset,u.byteLength),out=new Map();let p=0;
 const vu=new Map();
 for(let i=0;i<num;i++){p+=2;const id=d.getUint32(p,true);p+=8+2+4+4+4+4;const ow=u[p],cid=d.getUint16(p+1,true);p+=1+2+4+4+3;const ns=u[p++];p+=ns+1+2+8+1;const lk=u[p++];p+=16*lk;if(u[p++]>0)p+=32;p+=16+12+80;if(p>u.length)return null;out.set(cid,ow);vu.set(id,cid)}
 out.vu=vu;return p==u.length?out:null}catch(e){return null}}
// highest campaign file version this reader was checked against (BMS 4.38.1 writes 109); a newer file may carry fields read wrongly
export const CAM_VER_MAX=110;
// Tactical Engagement files (.tac) are campaign files with one more section, "te" (text): the teams of the engagement. Teams that have a name (not "---"): [{n, name}]; the first one is the player's side
export function teTeams(u8){const t=new TextDecoder('latin1').decode(u8),o=[],re=/:Team\r?\n(\d+)[^\n]*\n:TeamName\r?\n([^\r\n]*)/g;let m;while((m=re.exec(t))){const nm=m[2].trim();if(nm&&nm!=='---')o.push({n:+m[1],name:nm})}return o}
export function openCam(u8,D,name){const E=camToc(u8),OD=objDeltas(E),ver=+new TextDecoder().decode(E.ver);
 const ct=D.ct.map(a=>a?{d:a[0],k:a[1],t:a[2],e:a[3],i:a[4]}:null);const pu=parseUni(E.uni,ver,ct),units=pu.units,m={},byN={};units.forEach(x=>{m[x.id.n+':'+x.id.c]=x;if(!byN[x.id.n])byN[x.id.n]=x});
 const byId=new Proxy(m,{get:(t,k)=>t[k]!==undefined?t[k]:(typeof k=='string'&&k.includes(':')?byN[k.split(':')[0]]:undefined)});
 let bull=null,playerSq=null,now=null;try{if(E.cmp){const b=E.cmp,h=new DataView(b.buffer,b.byteOffset,b.byteLength);now=new DataView(lzExpand(b.subarray(8),h.getUint32(4,true)).buffer).getUint32(0,true)}}catch(e){}try{if(ver>=52){const b=E.cmp,h=new DataView(b.buffer,b.byteOffset,b.byteLength),r=lzExpand(b.subarray(8),h.getUint32(4,true)),d=new DataView(r.buffer);bull={x:d.getInt16(1946,true),y:d.getInt16(1948,true)};playerSq=d.getUint32(2110,true)}}catch(e){}
 const ps=playerSq&&units.find(x=>x.kind=='sqd'&&x.id.n==playerSq),te=E.te?teTeams(E.te):null,playerTeam=ps?ps.owner:(te&&te.length?te[0].n:null);
 let stance=null,squads={};try{stance=teamStances(E.tea,ver)}catch(e){}try{squads=squadNames(E,ver)}catch(e){}
 return{ver,isTe:!!E.te,units,byId,D,bull,now,playerSq,playerTeam,stance,squads,base:baseCampaign(E,ver),objOwn:new Map(),objFeat:new Map(),objOwnRaw:OD.own,objFeatRaw:OD.feat,parse:{num:pu.num,count:units.length,end:pu.end,len:pu.len},name:(name||'').replace(/\.(cam|tac)$/i,'')}}
