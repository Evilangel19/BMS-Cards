// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import {FORMS,isHiFi,acOf,actName,clean,csOf,els0,hms,locBE,mach,nAcf,nearAb,opWin,rmf,tcnStr} from './flight.js';
import {tcnFor} from '../rules/airbase.js';
import {pickTankers,svc} from '../rules/support.js';
import {ephem} from '../rules/ephemerides.js';
import {rackLoad,weaponClass} from '../bmsdata/bmsdata.js';
function fillCard(C,f){const D=C.D,F={},w=f.wps,S=D.S;
 const abRow=(i,o)=>{const a=D.ab[o[0]];const f3=v=>v?(v/1000).toFixed(3):'';
  [clean(o[1]),tcnFor(C,o,a),f3(a[12]),f3(a[13]),C.D.el[o[0]]||'','',a[7]?(a[7]/100).toFixed(2):''].forEach((v,j)=>F[`ab${i}_${j}`]=v)};
 const tk=w.find(p=>p.act==1),lands=w.filter(p=>p.act==7),dep=tk&&nearAb(C,tk.x,tk.y),arr=lands[0]&&nearAb(C,lands[0].x,lands[0].y),alt=lands.length>1&&nearAb(C,lands[lands.length-1].x,lands[lands.length-1].y);
 if(dep){abRow(0,dep);F.__dep=[(dep[1].match(/\((\w+)\)/)||[])[1]||clean(dep[1]),dep[2],dep[3],tk.arr]}if(arr)abRow(1,arr);if(alt&&alt!=arr)abRow(2,alt);F.__ab=[dep,arr,alt&&alt!=arr?alt:null];
 
 F.free=[dep,arr,alt].filter((o,i,a)=>o&&a.indexOf(o)==i).map(o=>{const a=D.ab[o[0]],q=v=>(v/1000).toFixed(3);return `${clean(o[1]).replace(/VOR\/DME/i,'VOR').replace(/\s*\b(Highway\s*Strip|Air\s*Strip|Airstrip|Airfield|Airport|Airbase|Air Base|Intl|International|AAF|AFB|AB)\b/gi,'').replace(/\s+/g,' ').trim()||clean(o[1])}: TWR ${q(a[5])}/${q(a[6])} ATIS ${q(a[15])}`}).join('\n');
 {const bk=els0(C,f).map(e=>{const r=rmf(C,csOf(C,e))[2];return r?csOf(C,e)+' UHF2 (backup) '+r:''}).filter(Boolean);if(bk.length)F.free+='\n\n'+bk.join('\n')}
 const nAc=nAcf(f);
 for(let i=0;i<4;i++)if(i<nAc){const fi=Math.max(0,els0(C,f).findIndex(e=>e.id.n==f.id.n&&e.id.c==f.id.c));const sq=C.byId[f.sqd.n+':'+f.sqd.c],pid=f.pilots[i],rec=pid!=255&&sq&&sq.pil&&sq.pil[pid];if(rec&&rec.id>0&&C.D.pn[rec.id-1])F[`fl${i}_0`]=C.D.pn[rec.id-1];F[`fl${i}_2`]=([12,22,75,85][i]+fi)+'Y';F[`fl${i}_1`]=(fi+1)+'-'+(i+1);F[`fl${i}_5`]='1688'}
 const P=C.byId[f.pkg.n+':'+f.pkg.c],els=(P&&P.els||[]).map(e=>C.byId[e.n+':'+e.c]).filter(Boolean);
 els.slice(0,5).forEach((e,i)=>{const n=nAcf(e);[csOf(C,e),`${n} ${acOf(C,e)}`,rmf(C,csOf(C,e))[0],rmf(C,csOf(C,e))[1],'',(12+i)+'Y',S[300+e.omis]||''].forEach((v,j)=>F[`pk${i}_${j}`]=v)});
 w.forEach((p,i)=>{if(i>23)return;F[`fp${i}_0`]=actName(w,i,S[300+f.omis]||'');if(nAc>1&&p.act!=4){F[`fp${i}_7`]=p.act==7?'Echelon':(p.z*10<5000?'Trail':(FORMS[p.form&7]||((p.form&7)==0&&(p.form&128)?'Spread':'')))}F[`fp${i}_1`]=hms(p.arr)+(p.dep&&p.dep-p.arr>=60000&&p.act!=7&&p.act!=1?'-'+(Math.floor(p.dep/3600000)==Math.floor(p.arr/3600000)?hms(p.dep).slice(3):hms(p.dep)):'');const az=p.z*10;F[`fp${i}_5`]=az?String(az):'0';
  const lf=w.findIndex(z=>z.act==7),sp=lf>=0&&i>lf&&(p.act==4||p.act==7);if(i&&(p.arr||sp)){const q=sp?w[lf]:w[i-1],dx=p.x-q.x,dy=p.y-q.y,nm=Math.hypot(dx,dy)*0.539957;F[`fp${i}_2`]=String(Math.round((Math.atan2(dx,dy)*180/Math.PI+360)%360)).padStart(3,'0');F[`fp${i}_3`]=nm.toFixed(1);
   const dt=(p.arr-(q.dep||q.arr))/1000;if(dt>0&&q.arr){const gs=Math.round(nm/dt*3600/5)*5;F[`fp${i}_4`]=`${Number(mach(gs,az).toFixed(2)).toString().replace(/^0\./,'.')} / ${gs}`}}});
 {const ty0=acOf(C,f);if(isHiFi(ty0))w.forEach((p,i)=>{if(i<24&&p.act==7){F[`fp${i}_4`]='- / 300';F[`fp${i}_5`]='1500'}})}
 w.forEach((p,i)=>{if(i<24)for(let c=1;c<=7;c++)if(!F[`fp${i}_${c}`])F[`fp${i}_${c}`]='---'});
 {const ti=w.findIndex(p=>p.act==1),li=w.findIndex(p=>p.act==7),hm5=i=>i>=0&&i<24?String(F[`fp${i}_1`]||'').slice(0,5):'';F.to_time=hm5(ti);F.ld_time=hm5(li)}   // take-off and landing time on the top block
 const ws={};(f.loads[0]||{ids:[],cn:[]}).ids.forEach((id,k)=>{const c=f.loads[0].cn[k];if(id&&c&&id!=492){const n=D.wn[id]||'#'+id;ws[n]=(ws[n]||0)+c}});
 const g={aa:[],ag:[],ecm:[],tanks:[]};Object.entries(ws).forEach(([n,c])=>{const s=c+'x '+n;g[/^AIM|^AA-/i.test(n)?'aa':/tank|fuel|370|300 ?gal|TK/i.test(n)?'tanks':/ALQ|HTS|AAQ|sniper|lantirn|litening|pod|AN\//i.test(n)?'ecm':'ag'].push(s)});
 for(const k in g)F[k]=g[k].join(', ');
 {const L0=f.loads[0]||{ids:[],cn:[]},ty=acOf(C,f).replace(/\s*ROK\w*$/,''),ew=D.ew[ty];let wl=0,dg=0,fu=(D.fi&&D.fi[ty])||7162;L0.ids.forEach((id,k)=>{const c=L0.cn[k],q=D.wt[id];if(id&&c&&id!=492&&q){wl+=q[0]*c;dg+=q[1]*c;if(D.tf[id])fu+=D.tf[id]*c}});
  // the pylons and racks of each station (BmsRack.dat + the hardpoint groups of the aircraft file) weigh and drag too: BMS counts them in Munitions and Drag Factor
  {const hp=D.hp&&D.hp[ty];if(D.rk&&hp)L0.ids.forEach((id,k)=>{const c=L0.cn[k];if(!id||!c||id==492||!hp[k]||hp[k]=='0')return;const r=rackLoad(D.rk,hp[k],id,weaponClass(D.wn[id],!!D.tf[id]));if(r){wl+=r.w;dg+=r.d}})}
  if(ew&&isHiFi(ty)){F.drag=String(dg+1);F.fuel=String(fu);F.gw=String(ew+fu+wl)}}
 F.cs=csOf(C,f);F.pkg=P?String(P.campId):'';F.mis=C.name;
 const hm=ms=>{const s=Math.floor(ms/1000)%86400,q=n=>String(n).padStart(2,'0');return q(s/3600|0)+':'+q((s%3600)/60|0)};
 const win=(u,codes)=>{let ws=u.wps.filter(p=>codes.includes(p.act));if(!ws.length){let b=null,bd=0;u.wps.forEach(p=>{if(p.act==7||p.act==8||p.act==1)return;const d=(p.dep||p.arr)-p.arr;if(d>bd){bd=d;b=p}});ws=b?[b]:[]}
  if(!ws.length)return '';const a=ws[0].arr,e=ws[ws.length-1].dep||ws[ws.length-1].arr;return a&&e?hm(a)+' - '+hm(e):''};
 const sup=(id,i)=>{const u=id&&(id.kind?id:C.byId[id.n+':'+id.c]);if(u&&u.kind=='flight'){F['sn'+i]=win(u,i<2?[24,4]:[20]);F[`su${i}_0`]=`${csOf(C,u).replace(' ','')} - ${acOf(C,u)}`;F[`su${i}_1`]=tcnStr(u.tcn&&u.tcn[0],u.band&&u.band[0]);F[`su${i}_2`]=rmf(C,csOf(C,u))[0];F[`su${i}_3`]=locBE(C,u,null);F[`sn${i}`]=opWin(u)}};
 if(P){const mem=u=>u===f||els.some(e=>e.id.n==u.id.n&&e.id.c==u.id.c),used=[],U=id=>id&&(id.kind?id:C.byId[id.n+':'+id.c]),put=(id,i)=>{const u=U(id);if(!u||u.kind!='flight'||mem(u)||used.includes(u))return false;used.push(u);sup(u,i);return true};
  let r=0;pickTankers(C,f,P).forEach(u=>{if(r<2&&put(u,r))r++});put(P.awacs,2);put(P.jstar,3)}
 const sv=svc(C,f);if(sv){F.pri=sv.tgt;F.d1=sv.tm;F.ll1=sv.ll}
 const oth=els.filter(e=>!(e.id.n==f.id.n&&e.id.c==f.id.c)).map(e=>({e,s:svc(C,e)})).filter(x=>x.s);
 if(oth.length){F.sec=oth[0].s.tgt;F.d2=oth[0].s.tm;F.ll2=oth[0].s.ll;
  if(oth.length>1)F.free=(F.free?F.free+'\n\n':'')+oth.slice(1).map(x=>csOf(C,x.e)+': '+x.s.tgt+' '+x.s.tm).join('\n')}
 {const ep=ephem(C,f);if(ep)F.eph=ep}
 return F}
export {fillCard};
