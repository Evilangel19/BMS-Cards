import {makeDatacardTemplate} from '../core/dctemplate.js';
import {CLASSES as BVR_CLASSES} from '../core/bvrtimeline.js';
import {savePrefs} from '../platform/desktop.js';
import {readTarget} from '../core/targets.js';
import {CAM} from '../core/cam-core.js';
import {FT_KM, dtcPoints} from '../core/mapdtc.js';
import {nearObj} from '../core/flight.js';
import {ST} from './state.js';
import {perfFill, perfLater} from './perf.js';
import {$, esc} from './base.js';
import {G, S, lines} from './dtcfile.js';
import {markMan} from './selection.js';
import {MFD, draw} from './cardview.js';
import {dtcBtns} from './dtcapply.js';
import {mapV, sqPage} from './pages.js';
import {wxAt} from './campaign.js';

/* ---------- DATACARD ---------- */
export const F = {};
export const FD = [];
export const ML = ['roe','free','eph'];
export const add = (k,lab,x,y,w,grp)=>FD.push({k,lab,x,y,w,grp});
// Datacard <-> DTC. The DTC always fills the datacard (applyDTC). The other way round only for the groups switched on in the Data Cartridge page ("from Datacard").
export const FZ2 = {0:'NSTL',1:'NOSE',2:'TAIL'};
export const SB2 = {7:'CCIP',8:'CCRP'};
export const rv = o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[v,String(k)]));
export const nz = v=>{const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n};
export const lk = (o,n)=>/\./.test(String(o))?(+n).toFixed(6):String(Math.round(+n));
export const CYC = {};
export let TOPOWER = 'ab';
export const cycle = k=>{if(k=='tospec'){TOPOWER=TOPOWER=='mil'?'ab':'mil';try{localStorage.setItem('bmstopower',TOPOWER)}catch(e){}ST.MANK.delete('tospec');perfFill(+$('fsel').value||0);return}const o=CYC[k],i=o.indexOf(String(F[k]||'').toUpperCase());setField(k,o[(i+1)%o.length])};
export const MIR = {};
ST.DCS = {};
export const mir = (k,grp,sec,key,to,from)=>{MIR[k]={grp,sec,key,to,from}};
export const mInt = (k,grp,sec,key,pad)=>mir(k,grp,sec,key,v=>pad?String(Math.round(+v)).padStart(pad,'0'):String(Math.round(+v)),(o,v)=>{const n=nz(v);return n===null?null:lk(o,n)});
export const MIRK = {};
export function pushOne(k){const m=MIR[k];if(!m||!lines.length)return false;const old=G(m.sec,m.key,''),nv=m.from(old,F[k]||'');if(nv===null||String(nv)===String(old))return false;S(m.sec,m.key,nv);dtcChanged(m.sec,m.key,true);return true}
export function dcSync(g,on){ST.DCS[g]=!!on;try{savePrefs('dtcprefs.json',{sync:ST.DCS})}catch(e){}if(on&&lines.length)Object.keys(MIR).filter(k=>MIR[k].grp==g&&F[k]!==undefined&&F[k]!=='').forEach(pushOne)}
// a DTC value was changed on the Data Cartridge page: the datacard shows it at once (and it is no longer a manual change)
export function mirrorToCard(sec,key){(MIRK[sec+'|'+key]||[]).forEach(k=>{const m=MIR[k],v=m.to(G(sec,key,''));F[k]=v;if(ST.AUTO)ST.AUTO[k]=v;ST.MANK.delete(k);const d=FD.find(z=>z.k==k);if(d&&d.el)d.el.value=v;
  if(k=='bingo'){F.joker=String(Math.round(+v)+1000);if(ST.AUTO)ST.AUTO.joker=F.joker;ST.MANK.delete('joker');const j=FD.find(z=>z.k=='joker');if(j&&j.el)j.el.value=F.joker}});markMan();draw()}
// Primary / secondary of the datacard: the rules of the flight (fillCard), STPT 99 / 98 of the DTC when they are used, or a point chosen by hand (click on the box: ptMenu)
// Click on Primary / Secondary: the points the pilot can show there (w = 1 primary, 2 secondary). A point chosen by hand brings its name, the TOT of this flight's action steerpoint
// (the rule of the flight: time on station for CAS, the patrol time of a CAP...) and its coordinates; "Auto" gives the rules back.
export function ptChoices(w){
 const pk=w==1?'pri':'sec',A=ST.AUTO||{},out=[{grp:'',label:'Auto'+(A[pk]?' · '+A[pk]:''),auto:true}];
 if(w==2)out.push({grp:'',label:'None (empty)',v:{name:'',tot:'',ll:''}});
 const fl=ST.C&&ST.CL[+$('fsel').value||0]&&ST.CL[+$('fsel').value||0].f;let tot='';try{const sv=fl&&CAM.svc(ST.C,fl);tot=sv?sv.tm:''}catch(e){}
 const near=(x,y)=>{try{const o=nearObj(ST.C,x,y,3);return o?String(o[1]):''}catch(e){return ''}},P=dtcPoints(lines);
 if(P){[['prec','Precision targets (TGT)','STPT '],['ppt','Pre-planned threats (PPT)','PPT ']].forEach(([g,grp,pre])=>P[g].filter(p=>!p.empty).forEach(p=>{
  const nm=p.name||near(p.x,p.y)||('STPT '+p.stpt);out.push({grp,label:'STPT '+p.stpt+' · '+nm,v:{name:nm,tot,ll:CAM.geoLL(ST.C,p.x,p.y)}})}))}
 for(let n=0;n<100;n++){if(!lines.some(l=>l.s=='STPT'&&l.k==='wpntarget_'+n))continue;const t=readTarget(G('STPT','wpntarget_'+n,''));if(!t||!(t.n||t.e))continue;
  const nm=(t.name&&!/^not set$/i.test(t.name))?t.name:'WPN TGT '+(n+1);out.push({grp:'Weapon targets (SPICE)',label:'WPN TGT '+(n+1)+' · '+nm,v:{name:nm,tot,ll:CAM.geoLL(ST.C,t.e/FT_KM,t.n/FT_KM)}})}
 return out}
export function ptPick(w,c){
 const K=w==1?['pri','d1','ll1']:['sec','d2','ll2'],A=ST.AUTO||{};
 if(c.auto){K.forEach(k=>{ST.MANK.delete(k);F[k]=A[k]||'';const d=(ST.MDCON?MFD:FD).find(z=>z.k==k);if(d&&d.el)d.el.value=F[k]});markMan();draw();return}
 setField(K[0],c.v.name);setField(K[1],c.v.tot);setField(K[2],c.v.ll)}
export function dtcChanged(sec,key,fromCard){dtcBtns();try{if(mapV.isReady()){mapV.refreshDtcButtons();if(sec=='STPT')mapV.refreshDtc()}}catch(e){}if(!fromCard)mirrorToCard(sec,key)}
// who uses each frequency: the flights of the package, the support flights and the airbases of the datacard being shown
export function freqOwners(){const m=new Map(),add=(f,l)=>{if(f&&/^\d/.test(f)&&l&&!m.has(f))m.set(f,l)};
 for(let i=0;i<5;i++){const cs=F[`pk${i}_0`];add(F[`pk${i}_2`],cs&&cs+' · UHF');add(F[`pk${i}_3`],cs&&cs+' · VHF')}
 for(let i=0;i<5;i++)add(F[`su${i}_2`],F[`su${i}_0`]);
 for(let i=0;i<3;i++){const n=F[`ab${i}_0`];add(F[`ab${i}_2`],n&&n+' GND');add(F[`ab${i}_3`],n&&n+' APP')}
 return m}
export function bvRow(i,cls){const r=cls&&ST.msPage&&ST.msPage.calc?ST.msPage.calc(cls):null;[r&&r.mtr,r&&r.fr,r&&r.mar,r&&r.dr,r&&r.dor].forEach((x,j)=>{const kk=`bv${i}_${j+1}`;F[kk]=x==null?'':String(Math.round(x));if(ST.AUTO)ST.MANK.add(kk);const e=FD.find(z=>z.k==kk);if(e&&e.el)e.el.value=F[kk]})}
export function setField(k,v,from){if(k=='ldsel'&&ST.ldSet){ST.ldSet(v);return}F[k]=v;if(k=='gw'||k=='fuel'||k=='drag'||k=='ab0_5')perfLater();if(/^bv\d_0$/.test(k)){const bi=+k[2];bvRow(bi,v)}if(ST.AUTO){ST.MANK.add(k);if(k=='ab0_4')ST.MANK.add('atis')}if(k=='ab0_4'&&wxAt(F.__dep&&F.__dep[3])&&F.__dep){F.atis=CAM.atisText(wxAt(F.__dep[3]),F.__dep,F.ab0_4)+(F.__taf?'\n'+F.__taf:'');const ea=FD.find(z=>z.k=='atis');if(ea&&ea.el)ea.el.value=F.atis}
 const d=(ST.MDCON?MFD:FD).find(z=>z.k==k);if(d&&d.el&&d.el!==from&&d.el.value!==v)d.el.value=v;markMan();draw();if(MIR[k]&&ST.DCS[MIR[k].grp])pushOne(k)}
export function closePilotMenu(){const m=$('pnmenu');if(m)m.remove();document.removeEventListener('mousedown',pnOut,true)}
export function pnOut(e){const m=$('pnmenu');if(m&&!m.contains(e.target)&&!e.target.classList.contains('pnb'))closePilotMenu()}
export function pilotMenu(d,inp,btn){const had=$('pnmenu');closePilotMenu();if(had&&had.dataset.k==d.k)return;const L=sqPage.roster(),m=document.createElement('div');m.id='pnmenu';m.dataset.k=d.k;
 m.innerHTML=L.length?L.map(n=>`<button type="button" class="pni">${esc(n)}</button>`).join(''):'<div class="pne">No pilots in the squadron roster yet.</div>';
 document.body.append(m);const r=btn.getBoundingClientRect();m.style.left=Math.min(r.right-200,innerWidth-210)+'px';m.style.top=Math.min(r.bottom+4,innerHeight-Math.min(m.offsetHeight,260)-8)+'px';
 m.onclick=e=>{const b=e.target.closest('.pni');if(!b)return;inp.value=b.textContent;setField(d.k,b.textContent,inp);closePilotMenu()};
 setTimeout(()=>document.addEventListener('mousedown',pnOut,true),0)}
export const GORDER = ['Airbase','Flight','Package','Flightplan','Loadout','Target','EWS','Weapon','Delivery','Support','BVR timeline','Mission','Data link','Audio presets','NAV','Server','Free text'];
export function buildForm(){const f=$('form');f.innerHTML='';const gr0={},seen=new Set();(ST.MDCON?MFD:FD).forEach(d=>{if(seen.has(d.k)||d.k=='ldsel'&&!CYC.ldsel)return;seen.add(d.k);(gr0[d.grp]=gr0[d.grp]||[]).push(d)});const gr={};[...GORDER,...Object.keys(gr0)].forEach(g=>{if(gr0[g]&&!gr[g])gr[g]=gr0[g]});
 for(const g in gr){const dt=document.createElement('details');dt.innerHTML='<summary>'+g+'</summary>';const w=document.createElement('div');
  const cols=g=='Flightplan'?8:g=='Airbase'||g=='Flight'||g=='Package'?7:4;
  w.className='gr';w.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  gr[g].forEach(d=>{const c=document.createElement('div');const lab=document.createElement('label');lab.textContent=d.lab;
   const i=CYC[d.k]?document.createElement('select'):ML.includes(d.k)||d.k=='atis'?document.createElement('textarea'):document.createElement('input');if(i.tagName=='TEXTAREA')i.rows=d.k=='atis'?2:4;
   if(CYC[d.k]){i.innerHTML=['',...CYC[d.k]].map(o=>`<option>${o}</option>`).join('');i.value=F[d.k]||'';i.onchange=()=>setField(d.k,i.value,i)}else{i.value=F[d.k]||'';i.oninput=()=>setField(d.k,i.value,i)}d.el=i;
   c.append(lab);
   if(d.grp=='Flight'&&/^fl\d_0$/.test(d.k)){const r=document.createElement('div');r.className='pnrow';const b=document.createElement('button');b.type='button';b.className='btn g pnb';b.title='Pick from squadron roster';b.textContent='▾';b.onclick=e=>pilotMenu(d,i,b);r.append(i,b);c.append(r)}else c.append(i);
   if(ML.includes(d.k)||d.k=='atis')c.style.gridColumn='1/-1';w.append(c)});dt.append(w);f.append(dt)}
 if(!f.querySelector('details[open]'))f.firstChild.open=true}
export let tpl;
export const LOAD = ['aa','ag','ecm','tanks'];
export function shortW(s){const m=s.match(/^(\d+x)\s+(.*)$/);if(!m)return s;let n=m[2].replace(/^AN\//,'');const t=n.match(/^Tank\s+(\d+)/i);if(t)n='TK'+t[1];else n=n.split(/\s+/)[0];return m[1]+' '+n}
export const abTok = (t,nh)=>{let m;if(m=t.match(/^AIM-(\w+)$/))return m[1];if(m=t.match(/^([A-Za-z]{2,4})-(\d+[A-Z]?)(?:\([a-z]\)\d)?(?:\/([A-Z]))?$/))return m[1]+(nh?'':'-')+m[2]+(m[3]||'');return nh?t.replace(/-/g,''):t};

// run 4: statements that run when the program starts (in the order of the original file)
export async function init4() {
  add('atis','ATIS',108,52,675,'Airbase');
  ['DEP','ARR','ALTN'].forEach((r,i)=>['Airbase','TCN','GND','APP','Elev','RWY','ILS'].forEach((c,j)=>add(`ab${i}_${j}`,r+' '+c,[105,318,395,473,551,630,709][j],123+28*i,[210,74,74,74,74,74,74][j],'Airbase')));
  ['Lead','Wing','Element','Wing 2'].forEach((r,i)=>['Name','IDM','TCN','Link 16','LND','CONF','IFF 2/3 4'].forEach((c,j)=>{if(j==4)return;add(`fl${i}_${j}`,r+' '+c,[105,318,395,473,551,630,709][j],234+28*i,[210,74,74,155,74,74,74][j],'Flight')}));
  for(let i=0;i<5;i++)['Callsign','Aircraft','UHF','VHF','STN','TCN','Task'].forEach((c,j)=>add(`pk${i}_${j}`,'Pack '+(i+1)+' '+c,[28,183,318,395,473,551,630][j],374+28*i,[150,132,74,74,74,74,155][j],'Package'));
  for(let i=0;i<24;i++)['Action','TOS','HDG','Dist','Mach/TAS','Alt','Min.Fuel','Formation'].forEach((c,j)=>add(`fp${i}_${j}`,c,[78,183,318,395,473,551,630,711][j],542+28*i,[100,132,74,74,74,74,74,76][j],'Flightplan'));
  [['cs','Callsign',985,39,120],['pkg','Package',1192,39,66],['mis','Mission',1350,39,240],['aa','A-A',890,94,215],['ag','A-G',890,122,215],['ecm','ECM',890,150,215],['tanks','Tanks',890,178,215],
  ['gw','Gross Wgt',1190,94,70],['drag','Drag idx',1190,122,70],['alow','ALOW',1190,150,70],['msl','MSL',1190,178,70],['tospec','TO Spec',1350,67,70],['rot','Rotation',1350,94,70],['ref','Refusal',1350,122,70],['mp','Mil Power',1350,150,70],['mc','Mil Climb',1350,178,70],
  ['fuel','Fuel',1514,67,83],['tof','TO Fuel',1514,94,83],['setf','Set Fuel',1514,122,83],['joker','Joker',1514,150,83],['bingo','Bingo',1514,178,83]].forEach(a=>add(a[0],a[1],a[2],a[3],a[4],'Loadout'));
  [['pri','Primary',925,207,330],['sec','Secondary',1350,207,240],['d1','TOT Primary',925,235,330],['d2','TOT Secondary',1350,235,240],['ll1','Lat&Long 1',925,262,330],['ll2','Lat&Long 2',1350,262,240]].forEach(a=>add(a[0],a[1],a[2],a[3],a[4],'Target'));
  for(let i=0;i<6;i++)add('ews'+i,'EWS THR '+(i+1),[947,1048,1156,1260,1370,1500][i],290,[74,80,76,80,100,94][i],'EWS');
  [[1,1054,1188,930],[2,1421,1544,1296]].forEach(([n,xa,xb,xm])=>{add(`wp${n}_mode`,`Profile ${n} mode`,xm,326,62,'Weapon');
   [['fuze','Fuze',xa,318],['sgl','SGL/PAIR',xb,318],['ad','AD',xa,346],['rp','RP',xb,346],['hb','BA',xa,374],['spc','SPACING',xb,374],['ang','REL ANG',xa,402],['bc','B. CODE',xb,402]].forEach(([k,l,x,y])=>add(`wp${n}_${k}`,`Profile ${n} ${l}`,x,y,48,'Weapon'))});
  add('dmode','Delivery mode',924,430,180,'Delivery');
  add('dlab','Attack',842,430,77,'Delivery');
  [['0','TBRG',458],['1','RNG',486],['2','ELV',514]].forEach(([k,l,y])=>{add('dv'+k,l+' (VRP/VIP)',926,y,176,'Delivery');add('dp'+k,l+' (PUP)',1266,y,74,'Delivery');add('oa'+k,l+' (OA1)',1109,y,72,'Delivery');add('ob'+k,l+' (OA2)',1186,y,72,'Delivery')});
  [['ph','Pull heading',431],['cl','Climb',458],['pd','Pull down',486],['tn','Turn',514],['ah','Attack heading',543],['th','Target in HUD',571]].forEach(([k,l,y])=>add('dl_'+k,l,1431,y,165,'Delivery'));
  [['ia','Ingress altitude',925,543,180],['is','Ingress speed',925,571,180],['rh','Release height',1189,543,150],['rs','Release speed',1189,571,150]].forEach(([k,l,x,y,w])=>add('dl_'+k,l,x,y,w,'Delivery'));
  ['Tanker 1','Tanker 2','AWACS','JSTAR','FAC'].forEach((r,i)=>['Type','TACAN','UHF','LOC'].forEach((c,j)=>add(`su${i}_${j}`,r+' '+c,[925,1110,1188,1266][j],625+28*i,[180,70,70,75][j],'Support')));
  ['Tanker 1','Tanker 2','AWACS','JSTAR','FAC'].forEach((r,i)=>add('sn'+i,'Notes '+r+' (operating time)',1352,625+28*i,240,'Support'));
  ['Tanker 1','Tanker 2','AWACS','JSTAR','FAC'].forEach((r,i)=>add('sn'+i,'Notes '+r+' (times)',1352,625+28*i,240,'Support'));
  for(let i=0;i<4;i++)[['Class',1265,112],['MTR',1380,40],['FR',1424,40],['MAR',1468,40],['DR',1512,40],['DOR',1556,40]].forEach(([c,x,w],j)=>add(`bv${i}_${j}`,'BVR '+(i+1)+' '+c,x,793+28*i,w,'BVR timeline'));
  add('roe','ROE',1268,931,325,'Free text');
  add('free','Notes (airfield frequencies / backup)',1272,998,320,'Free text');
  add('eph','Ephemerides (Sun / Moon)',1272,1153,320,'Free text');
  [1,2].forEach(n=>{CYC[`wp${n}_mode`]=['CCRP','CCIP'];CYC[`wp${n}_fuze`]=['NSTL','NOSE','TAIL'];CYC[`wp${n}_sgl`]=['SGL','PAIR']});
  add('ldsel','Loadout of aircraft',1020,67,85,'Loadout');   // only used when the aircraft of the flight carry different loadouts: a list of the groups (CYC.ldsel, set when a flight is applied)
  for(let i=0;i<4;i++)CYC[`bv${i}_0`]=BVR_CLASSES.map(c=>c.n);
  CYC.tospec=['AB','MIL']; // a click on TO Spec switches afterburner / military power take-off (the angle follows the aircraft)
  try{TOPOWER=localStorage.getItem('bmstopower')==='mil'?'mil':'ab'}catch(e){}
  for(let i=0;i<6;i++)mir('ews'+i,'ews','EWS',`PGM ${i} Comment`,v=>v,(o,v)=>String(v).replace(/[\r\n,]/g,' '));
  mInt('alow','icp','ICP','Alow AGL');
  mInt('msl','icp','ICP','Alow MSL');
  mInt('bingo','icp','ICP','Bingo_Fuel');
  [1,2].forEach(n=>{const K=t=>`Profile${n}_${t}`,A='FCC_AGB';
   mir(`wp${n}_mode`,'wpn',A,K('Submode'),v=>SB2[+v]||'',(o,v)=>{const c=rv(SB2)[String(v).trim().toUpperCase()];return c===undefined?null:c});
   mir(`wp${n}_fuze`,'wpn',A,K('Fuze'),v=>FZ2[+v]||'',(o,v)=>{const c=rv(FZ2)[String(v).trim().toUpperCase()];return c===undefined?null:c});
   mir(`wp${n}_sgl`,'wpn',A,K('SGL/PAIR'),v=>+v?'PAIR':'SGL',(o,v)=>{const u=String(v).trim().toUpperCase();return u=='PAIR'?'1':u=='SGL'?'0':null});
   mir(`wp${n}_ad`,'wpn',A,K('C1_AD1'),v=>(+v/100).toFixed(2).padStart(5,'0'),(o,v)=>{const x=nz(v);return x===null?null:lk(o,x*100)});
   mir(`wp${n}_hb`,'wpn',A,K('C2_BA'),v=>String(Math.round(+v)).padStart(4,'0'),(o,v)=>{const x=nz(v);return x===null?null:lk(o,x)});
   mInt(`wp${n}_ang`,'wpn',A,K('Release_Angle'));mInt(`wp${n}_spc`,'wpn',A,K('Release_Spacing'));
   mir(`wp${n}_rp`,'wpn',A,K('Release_Pulse'),v=>String(+v+1),(o,v)=>{const x=nz(v);return x===null?null:lk(o,Math.max(0,x-1))});
   mir(`wp${n}_bc`,'wpn','Laser','LaserTGP',v=>v,(o,v)=>/^\d+$/.test(String(v).trim())?String(v).trim():null)});
  Object.entries(MIR).forEach(([k,m])=>{(MIRK[m.sec+'|'+m.key]=MIRK[m.sec+'|'+m.key]||[]).push(k)});
  tpl = makeDatacardTemplate();
}
