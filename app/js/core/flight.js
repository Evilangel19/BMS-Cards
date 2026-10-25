// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import {allyOf} from './coalitions.js';
import {carrierNear} from './carriers.js';
const ord=n=>n+(['th','st','nd','rd'][(n%100>10&&n%100<14)?0:Math.min(n%10,4)%4]||'th');
const locBE=(C,u,codes)=>{if(!C.bull||!u)return '';const w=u.wps.find(p=>codes?codes.includes(p.act):![0,1,2,3,4,7,8].includes(p.act));if(!w)return '';const n=w.y-C.bull.y,e=w.x-C.bull.x,b=Math.round((Math.atan2(e,n)*180/Math.PI+360)%360)%360;return String(b).padStart(3,'0')+'/'+Math.round(Math.hypot(n,e)/1.852)};
function fac(C,f,u6){if(!u6||!C)return null;const el=els0(C,f),all=el.flatMap(e=>e.wps),ts=all.map(p=>p.arr).filter(Boolean),a=ts.length?Math.min(...ts):-1e15,b=all.length?Math.max(...all.map(p=>p.dep||p.arr)):1e15;
 const ally=(x,y)=>allyOf(C,x,y),mem=u=>u===f||el.some(e=>e.id.n==u.id.n&&e.id.c==u.id.c);
 const c=C.units.filter(u=>u.kind=='flight'&&u.wps.length&&!mem(u)&&/^FAC\(A\)$/i.test(C.D.S[300+u.omis]||'')&&ally(u.owner,f.owner)&&(w=>w[0]<=b&&w[1]>=a)((t=>t.length?[Math.min(...t),Math.max(...t)]:[0,0])(u.wps.flatMap(p=>[p.arr,p.dep]).filter(Boolean))));
 if(!c.length)return null;const u=c[0];return{ty:csOf(C,u).replace(' ','')+' - '+acOf(C,u),tm:opWin(u),loc:locBE(C,u,[...Array(40).keys()].filter(x=>![0,1,2,3,4,7,8].includes(x)))}}
const ACT={1:'TakeOff',0:'Nav',8:'Holding',2:'Push',14:'GNDStrk',3:'Split',7:'Land',4:'Refuel',12:'CAP',10:'Escort',11:'Sweep',15:'Surf Attack',16:'S&D',17:'Strike',20:'ELINT',21:'Recon',24:'FUEL',26:'Jamming',6:'Pickup',25:'Airdrop',19:'SEAD'};
const actName=(w,i,mn)=>{const a=w[i].act;
 const isStk=x=>x&&(x.act==17||(mn=='DEEP STRIKE'&&![0,1,2,3,4,7,8].includes(x.act)));
 if(/^(STRIKE|OCA STRIKE|DEEP STRIKE)$/.test(mn)&&a==0){if(isStk(w[i+1]))return 'Ingress';if(isStk(w[i-1]))return 'Egress'}
 const basic=[0,1,2,3,4,7,8].includes(a);
 if(!basic&&/^(FAC\(A\)|RECCE|BDA)$/.test(mn))return 'Recon';
 if(!basic&&mn=='DEEP STRIKE')return 'Strike';
 if(mn=='SEAD'&&(a==14||a==16||a==19))return 'SEAD';
 if(a==14||a==16){if(/^(SCAR|BAI|AI)$/.test(mn))return 'S&D';if(/CAS/.test(mn))return 'Grnd Attack'}
 return ACT[a]??('#'+a)};
const acOf=(C,f)=>(C.D.ac[f.c.i]||'?').replace(/ROKAF/g,'ROK'),csOf=(C,f)=>(C.D.S[2000+f.csId]||'#'+f.csId)+' '+f.csNum;
const nAcf=f=>{let r=0;for(let i=0;i<16;i++)r+=((f.roster||0)>>>(i*2))&3;const last=a=>{let k=0;(a||[]).forEach((v,i)=>{if(v!=255)k=i+1});return k};
 return Math.max(1,Math.min(4,Math.max(r,f.slots.filter(s=>s!=255).length,last(f.slots),last(f.pilots))))};
const opWin=u=>{const ws=u.wps.filter(p=>![0,1,2,3,4,7,8].includes(p.act)&&p.arr);if(!ws.length)return '';
 const hm=ms=>{const s=Math.floor(ms/1000)%86400;return String(s/3600|0).padStart(2,'0')+':'+String((s%3600)/60|0).padStart(2,'0')};
 return hm(Math.min(...ws.map(p=>p.arr)))+' - '+hm(Math.max(...ws.map(p=>p.dep||p.arr)))};
const rmf=(C,cs)=>{const r=C.D.rm[cs.replace(/\s+/g,'')];const q=v=>v?(v/1000).toFixed(3):'';return r?[q(r[0]),q(r[1]),q(r[2])]:['','','']};
const FORMS={1:'Wedge',2:'Trail',3:'Ladder',4:'Stack',5:'Res Cell',6:'Box',7:'Arrowhead'};
const hms=ms=>{if(!ms)return '';const s=Math.floor(ms/1000)%86400,p=n=>String(n).padStart(2,'0');return p(s/3600|0)+':'+p((s%3600)/60|0)+':'+p(s%60)};
const tcnStr=(v,b)=>{if(!v)return '';const c=v>63?v-63:v;return c+(b?String.fromCharCode(b):(v>63?'Y':'X'))};
// Aircraft the datacard calculations (weight, fuel, weapons, overhead speeds) are accurate for: F-16 and F-15 (not E/K/I, not JASDF).
const isHiFi=n=>/^F-16/.test(n)||(/^F-15/.test(n)&&!/^F-15[EKI]/.test(n)&&!/JASDF|^F-15[CD]J/.test(n));
// BMS helicopters (and the MV-22) cannot be flown: no datacard for them.
const isHeli=n=>/^(UH|AH|CH|MH|OH|HH|SH|MV|Mi-|Ka-|Z-\d|WZ-|MD-)/i.test(n);
function listFlights(C,rx=/F-16/){return C.units.filter(x=>x.kind=='flight'&&x.wps.length>3&&(rx?rx.test(acOf(C,x)):!isHeli(acOf(C,x)))).map(f=>({f,label:`${csOf(C,f)} · ${acOf(C,f)} x${nAcf(f)} · ${C.D.S[300+f.omis]||'?'} · ${hms(f.wps[0].arr)}`}))}
const clean=n=>n.replace(/\s*\(.*\)/,'').replace(/ (AB|Airbase|Airport|Intl Airport)$/,'');
function nearAb(C,x,y){let b=null,bd=9;C.D.ob.forEach(o=>{if(!C.D.ab[o[0]])return;const d=Math.hypot(o[2]-x,o[3]-y);if(d<bd){bd=d;b=o}});const cv=carrierNear(C,x,y);return cv&&(!b||cv.d<bd)?cv.row:b}   /* a carrier (a unit at sea with its own airbase row) counts as a base within 25 km */
function nearObj(C,x,y,km=3){let b=null,bd=km;C.D.ob.forEach(o=>{const d=Math.hypot(o[2]-x,o[3]-y);if(d<bd){bd=d;b=o}});return b}
const mach=(gs,alt)=>{const T=Math.max(216.65,288.15-0.0019812*alt);return gs/(38.967854*Math.sqrt(T))};
const els0=(C,f)=>{const P=C.byId[f.pkg.n+':'+f.pkg.c];return(P&&P.els||[]).map(e=>C.byId[e.n+':'+e.c]).filter(Boolean)};
function totMs(C,f){const B=[0,1,2,3,4,7,8],a=f.wps.find(p=>!B.includes(p.act)&&p.arr)||f.wps.find(p=>p.arr);return a?a.arr:0}
// The loadouts of a flight: one list when all aircraft share it, else one per aircraft (up to 4). Aircraft with the same loadout form one group: [{ac:[1,2], ids, cn, label:'A/C 1-2'}].
const loadGroups=f=>{const n=Math.max(1,Math.min(4,nAcf(f))),L=f.loads||[],key=l=>l?l.ids.join()+'|'+l.cn.join():'',G=[];
 for(let i=0;i<n;i++){const l=L.length>1?(L[i]||L[L.length-1]):L[0],k=key(l);let g=G.find(x=>x.k==k);if(!g){g={k,ac:[],l:l||{ids:[],cn:[]}};G.push(g)}g.ac.push(i+1)}
 const rg=a=>a.every((v,i)=>!i||v==a[i-1]+1)?(a.length>1?a[0]+'-'+a[a.length-1]:''+a[0]):a.join(',');
 return G.map(g=>({ac:g.ac,ids:g.l.ids,cn:g.l.cn,label:'A/C '+rg(g.ac)}))};
export {loadGroups,ord,isHiFi,isHeli,locBE,fac,actName,acOf,csOf,nAcf,opWin,rmf,FORMS,hms,tcnStr,listFlights,clean,nearAb,nearObj,mach,els0,totMs};
