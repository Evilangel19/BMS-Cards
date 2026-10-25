import {ST} from './state.js';
import {$, esc} from './base.js';
import {atoSearch} from './ato.js';
import {CYC, F, FD, ML, buildForm, cycle, setField, ptChoices, ptPick} from './datacard.js';
import {MFD, YC, draw} from './cardview.js';
import {sqPage} from './pages.js';

/* ---------- Direct editing on the card: click a cell, a larger colored field opens over it ---------- */
export const SX = 2048/1600;
export const SY = 2048/1200;
export const BOX = {atis:[30,76],roe:[918,982],free:[986,1134],eph:[1138,1196]};
export const boxOf = d=>{if(d.mdc)return{x:d.x,y:d.y0,w:d.w,h:d.h};const b=BOX[d.k],yc=(YC&&YC[d.k]!==undefined)?YC[d.k]:d.y;return b?{x:d.x,y:b[0],w:d.w,h:b[1]-b[0]}:{x:d.x,y:yc-12,w:d.w,h:24}};
export const cardOn=()=>{try{return $('cv').getContext('2d').getImageData(2,2,1,1).data[3]>0}catch(e){return false}};
export function cellAt(ev){if(!cardOn())return null;const c=$('cv'),r=c.getBoundingClientRect(),tx=(ev.clientX-r.left)/r.width*2048/SX,ty=(ev.clientY-r.top)/r.height*2048/SY;let best=null,ba=1e12;
 (ST.MDCON?MFD:FD).forEach(d=>{if(d.k=='ldsel'&&!CYC.ldsel)return;const b=boxOf(d);if(tx>=b.x&&tx<=b.x+b.w&&ty>=b.y&&ty<=b.y+b.h&&b.w*b.h<ba){ba=b.w*b.h;best=d}});return best}
export function place(el,d,minW,pad){const c=$('cv'),k=c.getBoundingClientRect().width/2048,b=boxOf(d);
 el.style.left=(b.x*SX*k-pad)+'px';el.style.top=(b.y*SY*k-pad)+'px';el.style.width=Math.max(b.w*SX*k+2*pad,minW)+'px';el.style.height=(b.h*SY*k+2*pad)+'px'}
export let EDK = null;
export function closeEd(commit){const ed=$('ed');if(EDK===null)return;const k=EDK,inp=ed.querySelector('input,textarea');EDK=null;ed.style.display='none';if(commit&&inp)setField(k,inp.value.replace(/\r/g,''))}
export function closeMenu(){const m=$('chm');if(m)m.style.display='none'}
export function openMenu(d){closeMenu();const m=$('chm'),c=$('cv'),k=c.getBoundingClientRect().width/2048,b=boxOf(d),cur=String(F[d.k]||'');
 m.innerHTML=['',...CYC[d.k]].map(o=>`<button type="button" class="${o===cur?'on':''}" data-v="${o}">${o||'— none —'}</button>`).join('');
 m.style.display='block';const w=Math.max(b.w*SX*k,130),W=c.getBoundingClientRect().width;m.style.width=w+'px';m.style.left=Math.max(0,Math.min(b.x*SX*k+b.w*SX*k/2-w/2,W-w))+'px';
 const top=b.y*SY*k+b.h*SY*k+4;m.style.top=Math.min(top,Math.max(0,c.getBoundingClientRect().height-Math.min(m.scrollHeight,260)-4))+'px';
 m.onclick=e=>{const t=e.target.closest('button');if(!t)return;closeMenu();setField(d.k,t.dataset.v)};const on=m.querySelector('.on');if(on)m.scrollTop=on.offsetTop-60}
// the Primary / Secondary boxes: a menu of the points that can be shown there (see ptChoices)
export function openPtMenu(d){closeMenu();const w=d.k=='pri'?1:2,L=ptChoices(w),m=$('chm'),c=$('cv'),k=c.getBoundingClientRect().width/2048,b=boxOf(d);let g=null,h='';
 L.forEach((x,i)=>{if(x.grp!==g){g=x.grp;if(g)h+=`<div class="gh">${esc(g)}</div>`}h+=`<button type="button" data-i="${i}">${esc(x.label)}</button>`});
 m.innerHTML=h;m.style.display='block';const W=c.getBoundingClientRect().width,wd=Math.min(Math.max(b.w*SX*k,300),W);m.style.width=wd+'px';m.style.left=Math.max(0,Math.min(b.x*SX*k+b.w*SX*k/2-wd/2,W-wd))+'px';
 const top=b.y*SY*k+b.h*SY*k+4;m.style.top=Math.min(top,Math.max(0,c.getBoundingClientRect().height-Math.min(m.scrollHeight,260)-4))+'px';m.scrollTop=0;
 m.onclick=e=>{const t=e.target.closest('button');if(!t)return;closeMenu();ptPick(w,L[+t.dataset.i])}}
export function openEd(d,sel=true){closeEd(true);const ed=$('ed'),c=$('cv'),k=c.getBoundingClientRect().width/2048,b=boxOf(d),ml=ML.includes(d.k)||d.k=='atis'||!!d.multi;
 ed.innerHTML='';const l=document.createElement('div');l.className='l';l.textContent=d.lab;
 const i=document.createElement(ml?'textarea':'input');i.value=F[d.k]||'';if(ml)i.rows=Math.max(2,Math.round(b.h/17));
 ed.append(l,i);
 if(/^fl\d_0$/.test(d.k)){const L=sqPage.roster();if(L.length){const pl=document.createElement('div');pl.className='pnl';pl.innerHTML=L.map(n=>`<button type="button" class="pni">${esc(n)}</button>`).join('');pl.onmousedown=e=>e.preventDefault();pl.onclick=e=>{const b=e.target.closest('.pni');if(!b)return;i.value=b.textContent;closeEd(true)};ed.append(pl)}}
 ed.style.display='block';EDK=d.k;
 const w=Math.max(b.w*SX*k+16,ml?320:170);let left=b.x*SX*k+b.w*SX*k/2-w/2;left=Math.max(0,Math.min(left,c.getBoundingClientRect().width-w));
 ed.style.width=w+'px';ed.style.left=left+'px';ed.style.top=Math.max(0,(b.y*SY*k+(b.h*SY*k)/2-(ml?60:34)))+'px';
 i.focus();if(sel)i.select();
 i.onkeydown=e=>{if(e.key=='Escape'){closeEd(false);e.preventDefault()}
  else if(e.key=='Enter'&&!(ml&&e.shiftKey)){closeEd(true);e.preventDefault()}
  else if(e.key=='Tab'){e.preventDefault();const LS=ST.MDCON?MFD:FD,idx=LS.indexOf(d),n=LS[(idx+(e.shiftKey?-1:1)+LS.length)%LS.length];closeEd(true);openEd(n)}};
 i.onblur=()=>setTimeout(()=>{if(EDK===d.k&&document.activeElement!==i)closeEd(true)},0)}
ST.FORMON = false;
export const applyFormToggle = ()=>{$('form').style.display=ST.FORMON?'':'none';document.querySelector('.k').classList.toggle('noform',!ST.FORMON)};
export const mdcBtn = ()=>{$('mdctog').classList.toggle('on',ST.MDCON);$('mdctog').style.background=ST.MDCON?'#1f7a46':'';$('mdctog').style.color=ST.MDCON?'#fff':''};

// run 15: statements that run when the program starts (in the order of the original file)
export async function init15() {
  document.addEventListener('mousedown',e=>{const m=$('chm');if(m&&m.style.display!=='none'&&!m.contains(e.target)&&e.target.id!=='cv')closeMenu()});
  // yellow marks, over the card in the editor only (never drawn into the canvas, so the kneeboard and the exports stay clean): the cells that are filled from automatic values or chosen from a list
  ST.hlDraw=()=>{const h=$('cvhl'),c=$('cv');if(!h||!c)return;h.innerHTML='';if(!c.offsetWidth||!cardOn())return;(ST.MDCON?MFD:FD).forEach(d=>{const on=!!CYC[d.k]&&d.k!='ldsel'||d.k=='ldsel'&&!!CYC.ldsel||d.k=='tospec'||/^bv\d_[1-5]$/.test(d.k)||(/^fl\d_0$/.test(d.k)&&sqPage.roster().length>0)||((d.k=='pri'||d.k=='sec')&&!!ST.C); if(!on)return;const e=document.createElement('i');place(e,d,0,0);h.append(e)})};
  window.addEventListener('resize',()=>{try{ST.hlDraw()}catch(e){}});
  if(window.ResizeObserver)new ResizeObserver(()=>{try{ST.hlDraw()}catch(e){}}).observe($('cv'));
  try{ST.hlDraw()}catch(e){}
  $('cv').addEventListener('mousemove',ev=>{const d=cellAt(ev),h=$('cellhov');if(!d||(EDK===d.k)){h.style.display='none';$('cv').style.cursor='';return}$('cv').style.cursor='pointer';place(h,d,0,0);h.style.display='block'});
  $('cv').addEventListener('mouseleave',()=>{$('cellhov').style.display='none'});
  $('cv').addEventListener('click',ev=>{const d=cellAt(ev);if(d&&(d.k=='pri'||d.k=='sec')&&ST.C){closeEd(true);openPtMenu(d)}else if(d&&CYC[d.k]){closeEd(true);if(CYC[d.k].length>6)openMenu(d);else cycle(d.k)}else if(d)openEd(d);else closeEd(true)});
  window.addEventListener('resize',()=>closeEd(true));
  try{ST.FORMON=localStorage.getItem('bmsform')==='1'}catch(e){}
  $('mdctog').onclick=()=>{closeEd(true);ST.MDCON=!ST.MDCON;try{localStorage.setItem('bmsmdc',ST.MDCON?'1':'0')}catch(e){}ST.KBG=null;mdcBtn();buildForm();draw()};
  mdcBtn();
  applyFormToggle();
  atoSearch();
  buildForm();
}
