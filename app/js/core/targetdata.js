// Objectives, their features and the fixed radar stations, read from the objective files of the BMS install (CampObjData.XML, OCD / FED, Falcon4_CT / FCD).
// io = {dir(), camp(), readBytes, jp}: the folder (and the campaign's own objective file, if any) are asked every time; the results are kept per folder (reset() drops them).
import {parseCt} from '../bmsdata/bmsdata.js';
import {parseObjectives, parseOcdCt, parseFcdNames, parseFcdRadar, radarFeatures, parseFed, featuresOf, fedPath, ocdPath} from './targets.js';
export function createTargetData(io) {
  let OBJC = null, FCDN = null, RADC = null;
  const T = {
 dec:b=>new TextDecoder('utf-8').decode(b),
 async ct(){if(OBJC&&OBJC.ct&&OBJC.dir===io.dir())return OBJC.ct;return parseCt(this.dec(await io.readBytes(io.jp(io.dir(),'Falcon4_CT.xml'))))},
 async objectives(){if(OBJC&&OBJC.dir===io.dir()&&OBJC.list)return OBJC.list;const list=parseObjectives(this.dec(await io.readBytes(io.camp()||io.jp(io.dir(),'CampObjData.XML')))),ocds=[...new Set(list.map(o=>o.ocd))],ty={},ct=await this.ct();let bad=0,err='';
  for(let i=0;i<ocds.length;i+=40)await Promise.all(ocds.slice(i,i+40).map(async n=>{try{const c=parseOcdCt(this.dec(await io.readBytes(io.jp(io.dir(),...ocdPath(n).split('/')))));ty[n]=ct[c]?ct[c][2]:-1}catch(e){ty[n]=-1;bad++;err=err||String(e&&e.message||e)}}));
  list.forEach(o=>o.type=ty[o.ocd]===undefined?-1:ty[o.ocd]);OBJC={dir:io.dir(),list,ct};list.info=bad?bad+' of '+ocds.length+' objective type files could not be read in '+io.jp(io.dir(),'ObjectiveRelatedData')+' ('+err+')':'';return list},
 async features(o){if(!FCDN||FCDN.dir!==io.dir())FCDN={dir:io.dir(),names:parseFcdNames(this.dec(await io.readBytes(io.jp(io.dir(),'Falcon4_FCD.xml'))))};
  return featuresOf(o,parseFed(this.dec(await io.readBytes(io.jp(io.dir(),...fedPath(o.ocd).split('/'))))),await this.ct(),FCDN.names)},
 // fixed radar stations (objective type 21): [{o, feats:[{k,n,e,det}]}] with the radar features of each (FED -> CT -> FCD)
 async radars(){if(RADC&&RADC.dir===io.dir())return RADC.list;const list=(await this.objectives()).filter(o=>o.type==21),ct=await this.ct(),fr=parseFcdRadar(this.dec(await io.readBytes(io.jp(io.dir(),'Falcon4_FCD.xml')))),out=[];
  for(let i=0;i<list.length;i+=40)await Promise.all(list.slice(i,i+40).map(async o=>{try{const f=radarFeatures(o,parseFed(this.dec(await io.readBytes(io.jp(io.dir(),...fedPath(o.ocd).split('/'))))),ct,fr);if(f.length)out.push({o,feats:f})}catch(e){}}));
  RADC={dir:io.dir(),list:out};return out}};
  T.reset = () => { OBJC = null; FCDN = null; RADC = null; };
  return T;
}
