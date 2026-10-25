import {allyOf as allyOfC} from '../core/coalitions.js';
import {groupPackages, buildAto, CATEGORIES, filterAto} from '../core/ato.js';
import {ST} from './state.js';
import {$, collapse, ddJustClosed, ddOpen, esc, expand, appToast} from './base.js';
import {mapV} from './pages.js';
import {apply, flMan} from './selection.js';

export let ATOL = [];
export let ATOC = null;
export let ATOL16 = null;
export let ATOQ = {cs:'',ac:'',pkg:'',mis:'',to:'',tot:'',ap:'',sq:''};
ST.ATOSEL = null;
// a loaded mission belongs to one flight (ST.MSFLOCK = {C, key} set by msfLoad; it stops counting as soon as another campaign replaces ST.C): the other flights and packages cannot be selected
export const msLocked = f => !!(ST.MSFLOCK && ST.MSFLOCK.C === ST.C && f && f.id && (f.id.n + ':' + f.id.c) !== ST.MSFLOCK.key);
export let ATOONLY = false;
export let ATOFLT = true;
export let ATOOPEN;
export let ATOCAT;
export let PLAYER = null;
ST.VIEW = null;
export let ATOFX;
export const allyOf = (x,y)=>allyOfC(ST.C,x,y);
// the ATO is drawn again after every click; the list keeps its scroll position (the nearest scrolling ancestor, or the page)
export function scrollKeep(){let p=$('atolist')||$('ato'),sc=null;while(p&&p!==document.body&&p!==document.documentElement){const o=getComputedStyle(p).overflowY;if((o=='auto'||o=='scroll')&&p.scrollHeight>p.clientHeight){sc=p;break}p=p.parentElement}const se=document.scrollingElement,a=sc?sc.scrollTop:0,b=se?se.scrollTop:0;return()=>{if(sc)sc.scrollTop=a;if(se)se.scrollTop=b}}
// "Close all": search cleared, everything folded except the package and mission of the selected flight, the others hidden
export let ATOONLYP = null; // the package that stays alone in its mission after Close all (it does not follow the selection)
export function atoCloseState(){ATOONLYP=null;Object.keys(ATOQ).forEach(k=>ATOQ[k]='');ATOOPEN=new Set();ATOCAT=new Set();ATOONLY=false;if(ST.ATOSEL&&ST.ATOSEL.pkg){const pg=groupPackages(ATOL.filter(z=>z.pkg==ST.ATOSEL.pkg.n))[0];if(pg){ATOCAT.add(pg.cat);ATOOPEN.add(ST.ATOSEL.pkg.n);ATOONLY=true;ATOONLYP=ST.ATOSEL.pkg.n}}}
export function atoSearch(){const k=scrollKeep();try{atoSearch0()}finally{k()}}
export function atoSearch0(){const el=$('ato'),q=ATOQ;if(!ST.C){ATOL=[];el.innerHTML='<h3>Air Tasking Order</h3><div class="hint">Select a campaign to see its ATO.</div>';ST.ATOSEL=null;renderSel();return}
 if(ATOC!==ST.C||ATOL16!==ST.L16){const fresh=ATOC!==ST.C;ATOC=ST.C;ATOL16=ST.L16;ATOL=buildAto(ST.C,ST.L16);if(fresh){ATOOPEN=new Set();ATOCAT=new Set();ATOONLY=false;PLAYER=null;ST.VIEW=null}}
 const teams=[...new Map(ATOL.map(e=>[e.team,e.teamName])).entries()].sort((a,b)=>a[0]-b[0]);
 if(PLAYER===null)PLAYER=teams.some(t=>t[0]==ST.C.playerTeam)?ST.C.playerTeam:((ATOL.find(e=>e.hifi)||ATOL[0]||{}).team??null);
 if(ST.VIEW===null||!teams.some(t=>t[0]==ST.VIEW))ST.VIEW=PLAYER;
 el.innerHTML=`<h3>Air Tasking Order</h3><div class="sr">
 <div class="w" style="display:flex;align-items:center;gap:8px"><span style="position:relative;display:inline-block"><button class="btn" id="aq_viewb" type="button" style="margin:0;border-radius:16px;padding:5px 14px;font-weight:600;color:#fff" title="Your faction comes from the campaign (player squadron). Click to choose another: other factions are read-only."></button><select id="aq_view" tabindex="-1" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none">${teams.map(([t,n])=>`<option value="${t}"${ST.VIEW==t?' selected':''} style="background:${t==PLAYER?'#4cc38a':allyOf(t,PLAYER)?'#6b46b8':'#a12b2b'};color:${t==PLAYER?'#062014':'#fff'}">${esc(n)}${t==PLAYER?' (you)':''}</option>`).join('')}</select></span><button class="btn g" id="aq_info" type="button" style="margin:0 0 0 auto;border-radius:16px;padding:4px 12px;font-size:12px" title="Click to show or hide the search filters"></button></div>
 <div class="w" id="aq_sp"></div><div class="w" id="aq_flt" style="display:${ATOFLT?'grid':'none'};grid-template-columns:1fr 1fr;gap:8px 6px">
 <input id="aq_cs" placeholder="Callsign" value="${esc(q.cs)}"><input id="aq_pkg" placeholder="Package #" value="${esc(q.pkg)}">
 <input id="aq_ac" placeholder="Aircraft" value="${esc(q.ac)}"><input id="aq_mis" placeholder="Mission type" value="${esc(q.mis)}">
 <input id="aq_ap" placeholder="Airport" value="${esc(q.ap)}"><input id="aq_sq" placeholder="Squadron" value="${esc(q.sq)}">
 <input id="aq_to" placeholder="Departure time" value="${esc(q.to)}"><input id="aq_tot" placeholder="TOT" value="${esc(q.tot)}"></div><button class="btn g" id="aq_tog" style="padding:5px 8px;font-size:12px;grid-column:1/-1;margin-top:6px"></button></div><div id="atolist"></div>`;
 const viewUpd=()=>{const o=$('aq_view').selectedOptions[0];if(!o)return;$('aq_viewb').textContent=o.textContent+' ▾';$('aq_viewb').style.background=o.style.backgroundColor;$('aq_viewb').style.color=o.style.color};viewUpd();$('aq_viewb').onclick=()=>{if(ddJustClosed())return;ddOpen($('aq_view'),$('aq_viewb'))};
 $('aq_view').onchange=()=>{viewUpd();ST.VIEW=+$('aq_view').value;if(mapV.isReady())mapV.refresh();const n=(teams.find(t=>t[0]==ST.VIEW)||[])[1];if(ST.VIEW!=PLAYER)alert('You are not part of this faction ('+n+'): you can read its ATO, but its flights cannot be loaded on the datacard.');atoList()};
 const atoOpenAll=()=>{ATOONLY=false;CATEGORIES.forEach(c=>{if(!ATOCAT.has(c))ATOFX.c.add(c)});ATOCAT=new Set(CATEGORIES);const L=filterAto(ATOL,{...ATOQ});groupPackages(L).filter(p=>p.teams.some(t=>allyOf(t,ST.VIEW))).forEach(p=>{if(!ATOOPEN.has(p.pkg))ATOFX.p.add(p.pkg);ATOOPEN.add(p.pkg)});atoList()};
 const atoCloseAll=()=>collapse(document.querySelectorAll('#atolist .pk'),()=>{atoCloseState();atoSearch()});
 $('aq_tog').onclick=()=>ATOCAT.size>(ATOONLY?1:0)?atoCloseAll():atoOpenAll();atoTog();
 $('aq_info').onclick=()=>{const f=$('aq_flt');if(ATOFLT){ATOFLT=false;collapse([f],()=>{f.style.display='none'})}else{ATOFLT=true;f.style.display='grid';expand([f])}};
 const pi=ST.C.parse,nf=ATOL.length,np=new Set(ATOL.map(e=>e.pkg)).size;$('aq_info').textContent=nf+' flights · '+np+' packages'+(pi&&(pi.count<pi.num||pi.end<pi.len)?' · ⚠ campaign file only partly read ('+pi.count+' of '+pi.num+' units)':'')+' ▾';
 const ids={aq_cs:'cs',aq_ac:'ac',aq_pkg:'pkg',aq_mis:'mis',aq_to:'to',aq_tot:'tot',aq_ap:'ap',aq_sq:'sq'};
 Object.entries(ids).forEach(([id,k])=>{$(id).oninput=()=>{ATOQ[k]=$(id).value.trim();ATOONLY=false;atoList()}});atoList();atoHints()}
export function flInfo(e){const radio=[e.uhf&&'UHF '+e.uhf,e.vhf&&'VHF '+e.vhf].filter(Boolean).join(' · '),l16=e.stn?['STN '+e.stn,e.fc!==''&&'FC '+e.fc,e.mc!==''&&'MC '+e.mc].filter(Boolean).join(' '):'';
 return `<b class="bl">${esc(e.callsign)}</b> · ${e.n}× ${esc(e.ac)} · ${esc(e.mission)}<div class="m">Pkg <span class="bl">${e.pkgNo}</span> · ${esc(e.teamName)} · ${esc(e.squadron)}${e.base?' · '+esc(e.base):''} · TO ${e.takeoff||'--:--'} · TOT ${e.tot||'--:--'}</div>${e.target?`<div class="m">${esc(e.target)}</div>`:''}${radio?`<div class="m">${radio}</div>`:''}${l16?`<div class="m">${l16}</div>`:''}`}
export function flLine(e){const rad=[e.uhf&&'UHF '+e.uhf,e.vhf&&'VHF '+e.vhf].filter(Boolean),l16=e.stn?['STN '+e.stn,e.fc!==''&&'FC '+e.fc,e.mc!==''&&'MC '+e.mc].filter(Boolean).join(' '):'';
 const a=[`${e.n}× ${esc(e.ac)}`,esc(e.mission),`Pkg <span class="bl">${e.pkgNo}</span>`,esc(e.teamName),esc(e.squadron),e.base&&esc(e.base),`TO ${e.takeoff||'--:--'}`,`TOT ${e.tot||'--:--'}`,e.target&&esc(e.target),...rad,l16].filter(Boolean);
 return `<b class="bl">${esc(e.callsign)}</b> · <span class="m" style="color:var(--tx)">${a.join(' · ')}</span>`}
// Map page only: the filter fields show (as a hint, without filtering) the data of the selected flight that each filter looks at
export const AQHINT = {aq_cs:['Callsign',e=>e.callsign],aq_pkg:['Package #',e=>e.pkgNo],aq_ac:['Aircraft',e=>e.ac],aq_mis:['Mission type',e=>e.mission],aq_ap:['Airport',e=>e.base],aq_sq:['Squadron',e=>e.squadron],aq_to:['Departure time',e=>e.takeoff],aq_tot:['TOT',e=>e.tot]};
export function atoHints(){const on=!!($('ato')&&$('ato').closest('#mpside')),e=on&&ST.ATOSEL&&ATOL.find(z=>z.f===ST.ATOSEL);Object.entries(AQHINT).forEach(([id,[d,fn]])=>{const i=$(id);if(!i)return;const v=e?fn(e):'';i.placeholder=v!==''&&v!=null?String(v):d;i.classList.toggle('hinted',!!e&&v!==''&&v!=null)})}
export function renderSel(){atoHints();if(mapV&&mapV.isReady())mapV.refresh();const el=$('selinfo');if(!el)return;const e=ST.ATOSEL&&ATOL.find(z=>z.f===ST.ATOSEL);el.innerHTML=e?flLine(e):'<span class="hint">No flight selected: pick one in the ATO (or press 🎲).</span>'}
export let ATORN = 0;
export function atoTog(){const t=$('aq_tog');if(!t)return;const o=ATOCAT.size>(ATOONLY?1:0);t.textContent=o?'⊟ Close all':'⊞ Open all';t.title=o?'Clear the search and close every mission, package and flight (the datacard stays as it is)':'Open every mission and package'}
export function atoList(){const k=scrollKeep();try{atoList0()}finally{k()}}
export function atoList0(){ATORN++;atoTog();renderSel();const ally=allyOf; const L=filterAto(ATOL,{...ATOQ}),el=$('atolist');if(!el)return;if(!L.length||!L.some(e=>ally(e.team,ST.VIEW))){el.innerHTML='<div class="hint">No flight matches.</div>';return}
 const searching=Object.values(ATOQ).some(Boolean),lock=ST.VIEW!=PLAYER;
 const P=groupPackages(L).filter(p=>p.teams.some(t=>ally(t,ST.VIEW)));let h=`<div class="${lock?'lkw':''}">`;CATEGORIES.forEach(c=>{const ga=P.filter(p=>p.cat==c);if(!ga.length)return;const co=searching||ATOCAT.has(c),g=ATOONLY&&co&&ATOONLYP!=null&&ga.some(p=>p.pkg==ATOONLYP)?ga.filter(p=>p.pkg==ATOONLYP):ga;   /* after Close all only the package of the selected flight stays in view */
  h+=`<div class="ct" data-c="${c}">${co?'▾':'▸'} ${c} (${ga.length})</div>`;if(!co)return;
  g.forEach(p=>{const open=ATOOPEN.has(p.pkg),n=p.flights.length;
   h+=`<div class="pk${p.teams.includes(ST.VIEW)?'':' al'}${ATOFX.c.has(c)?' fxin':''}"><div class="ph${p.flights.every(e=>msLocked(e.f))?' ml':''}" data-p="${p.pkg}" title="${p.flights.every(e=>msLocked(e.f))?'This mission was made for another package':n>1?'Click to show the flights':(lock?'Not your faction':'Click to fill the datacard')}"><span class="ar">${open?'▾':'▸'}</span> <b>Pkg <span class="bl">${p.pkgNo}</span></b> · <b class="ms">${esc(p.mission)}</b> · ${n} flight${n>1?'s':''}
   <div class="m">${esc(p.teamName)}${p.base?' · '+esc(p.base):''} · TO ${p.takeoff||'--:--'} · TOT ${p.tot||'--:--'}${p.target?' · '+esc(p.target):''}</div></div>`;
   if(open)p.flights.forEach(e=>{const i=ATOL.indexOf(e);
    h+=`<div class="fl${ATOFX.p.has(p.pkg)?' fxin':''}${e.team!=ST.VIEW?' al':''}${e.hifi&&!lock?'':' nc'}${msLocked(e.f)?' ml':''}${ST.ATOSEL===e.f?' sel':''}${flMan(e.f)?' man':''}" data-i="${i}" title="${msLocked(e.f)?'This mission was made for another flight':lock?'Not your faction':e.heli?'Helicopters are not flyable in BMS':e.hifi?'Click to fill the datacard':'Click to fill the datacard (weight, fuel and weapon values are not calculated for this aircraft)'}">${flInfo(e)}</div>`});
   h+='</div>'})});
 el.innerHTML=h+'</div>';expand(el.querySelectorAll('.fxin'));ATOFX.c.clear();ATOFX.p.clear();
 const load=e=>{if(lock||e.heli)return;if(msLocked(e.f)){appToast('This mission was made for another flight: load a campaign to use the other flights.');return}const k=ST.CL.findIndex(x=>x.f===e.f);if(k<0)return;$('fsel').value=k;apply(k)};
 el.querySelectorAll('.ct').forEach(d=>d.onclick=()=>{const c=d.dataset.c;if(ATOCAT.has(c)){const els=[];for(let n=d.nextElementSibling;n&&!n.classList.contains('ct');n=n.nextElementSibling)els.push(n);collapse(els,()=>{if(ATOONLYP!=null&&P.some(p=>p.cat==c&&p.pkg==ATOONLYP))ATOONLY=false;ATOCAT.delete(c);P.filter(p=>p.cat==c).forEach(p=>ATOOPEN.delete(p.pkg));atoList()})}else{ATOCAT.add(c);ATOFX.c.add(c);atoList()}});
 el.querySelectorAll('.ph').forEach(d=>d.onclick=()=>{const k=+d.dataset.p,pk=P.find(x=>x.pkg==k);if(pk&&pk.flights.length==1&&!ATOOPEN.has(k)){ATOOPEN.add(k);ATOFX.p.add(k);const n0=ATORN;load(pk.flights[0]);if(ATORN==n0)atoList();return}if(ATOOPEN.has(k)){collapse(d.parentElement.querySelectorAll('.fl'),()=>{ATOOPEN.delete(k);atoList()})}else{ATOOPEN.add(k);ATOFX.p.add(k);atoList()}});
 el.querySelectorAll('.fl').forEach(d=>d.onclick=()=>load(ATOL[+d.dataset.i]))}

// run 7: statements that run when the program starts (in the order of the original file)
export async function init7() {
  ATOOPEN = new Set();
  ATOCAT = new Set();
  ATOFX = {c:new Set(),p:new Set()};
}
