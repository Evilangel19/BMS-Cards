// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import {ord,acOf,actName,els0,hms,nearObj} from '../core/flight.js';
import {geoLL,hmN,locXY} from './geo.js';
function svc(C,f){const B=[0,1,2,3,4,7,8],w=f.wps,a=w.find(p=>!B.includes(p.act));if(!a)return null;
 const g=w.filter(p=>p.act==a.act),st=g[0].arr,en=g[g.length-1].dep||g[g.length-1].arr,nm=actName(w,w.indexOf(g[0]),C.D.S[300+f.omis]||'');
 const o=[14,15,16,17,19].includes(a.act)?nearObj(C,g[0].x,g[0].y):null;
 return{tm:!st?'':([14,15,16,17,19].includes(a.act)?hms(st):hmN(st)+' - '+hmN(en)),tgt:(o&&o[1])||nm,ll:o?geoLL(C,o[2],o[3]):''}}
function pickTankers(C,f,P){const el=els0(C,f),all=el.flatMap(e=>e.wps),ts=all.map(p=>p.arr).filter(Boolean),a=ts.length?Math.min(...ts):-1e15,b=all.length?Math.max(...all.map(p=>p.dep||p.arr)):1e15;
 const win=u=>{let g=u.wps.filter(p=>p.act==24);if(!g.length)g=u.wps.filter(p=>p.arr);return g.length?[g[0].arr,g[g.length-1].dep||g[g.length-1].arr]:[0,0]};
 const asg=P&&P.tanker&&C.byId[P.tanker.n+':'+P.tanker.c],ty=u=>acOf(C,u),probe=/F\/A-18|F-18|EF-18|CF-188|AV-8|Harrier/i.test(ty(f));
 const pref=u=>probe?/^KC-130/.test(ty(u)):/^KC-(135|10)/.test(ty(u));
 const c=C.units.filter(u=>u.kind=='flight'&&/^KC-/.test(ty(u))&&u.wps.length&&(u===asg||(((x,y)=>x==y||(x<4&&y<4))(u.owner,f.owner)&&(w=>w[0]<=b&&w[1]>=a)(win(u)))));
 return c.filter(u=>u!==f&&!el.some(e=>e.id.n==u.id.n&&e.id.c==u.id.c)).sort((x,y)=>(pref(y)-pref(x))||((y===asg)-(x===asg))||(win(x)[0]-win(y)[0])).slice(0,2)}
// the friendly ground unit that acts as JTAC of a CAS flight: {u, cat, name, d, loc} or null
function jtacPick(C,f){if(!/CAS$/.test(C.D.S[300+f.omis]||''))return null;
 const B=[0,1,2,3,4,7,8],tg=f.wps.filter(p=>!B.includes(p.act));if(!tg.length)return null;
 const ally=o=>o==f.owner||(o<4&&f.owner<4),g=C.units.filter(u=>u.kind=='gnd'),en=g.filter(u=>u.owner>=4&&!ally(u.owner));if(!en.length)return null;
 const dm=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)/1.852;let best=null;
 g.filter(u=>ally(u.owner)&&C.D.gu[u.c.i]).forEach(u=>{const dt=Math.min(...tg.map(p=>dm(u,p))),de=Math.min(...en.map(e=>dm(u,e)));
  if((dt<=10||de<=6)&&dt<=30&&(!best||dt<best.d))best={u,cat:C.D.gu[u.c.i],name:ord(u.nameId)+' '+C.D.gu[u.c.i],d:dt,loc:locXY(C,u.x,u.y)}});return best}
function jtac(C,f,uhf6){if(!uhf6)return null;const b=jtacPick(C,f);return b&&{cat:b.cat,name:b.name,d:b.d,loc:b.loc}}
export {svc,pickTankers,jtac,jtacPick};
