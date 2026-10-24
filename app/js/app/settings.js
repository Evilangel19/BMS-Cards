import {loadConfig, isDesktop, pickFolder, saveConfig} from '../platform/desktop.js';
import {DEFAULTS} from '../config/config.js';
import {ST} from './state.js';
import {$, applyAnim} from './base.js';
import {campDir, dtcDir, fillCampaigns} from './campaign.js';
import {kbDir, kbMemLoad, kbRender} from './kneeboard.js';
import {GAMEDATA, loadGameData} from './gamedata.js';
import {applyFormToggle, closeEd} from './editor.js';
import {mapV, sqPage} from './pages.js';
import {view} from './dtcfile.js';

/* ---------- Settings ---------- */
export const CFG_PATHS = [['bmsInstall','BMS install folder'],['campaigns','Campaigns folder'],['dtc','DTC folder'],['exportDir','Export folder'],['kneeboardDir','Kneeboard DDS folder'],['missions','Missions folder']];
export const AUTO_HINT = {campaigns:()=>campDir(),dtc:()=>dtcDir(),kneeboardDir:()=>kbDir()};
export async function openSettings(){
 const dlg=$('cfg'),loc=(await loadConfig()).location;dlg.innerHTML='<h3 style="margin:0 0 6px">Settings</h3><p class="hint" style="margin:0 0 10px">Saved in: '+loc+'</p>';
 const inputs={};
 CFG_PATHS.forEach(([k,lab])=>{const row=document.createElement('div');row.className='cf';const l=document.createElement('label');l.textContent=lab;
  const i=document.createElement('input');i.value=ST.CFG.paths[k];inputs[k]=i;if(AUTO_HINT[k])i.placeholder='automatic: '+(AUTO_HINT[k]()||'set the BMS install folder');row.append(l,i);
  if(isDesktop()){const b=document.createElement('button');b.className='btn g';b.textContent='Browse';b.onclick=async()=>{const d=await pickFolder({startDir:i.value,title:lab});if(d)i.value=d};row.append(b)}else row.append(document.createElement('span'));
  dlg.append(row)});
 const gd=document.createElement('p');gd.className='hint';gd.style.margin='2px 0 8px';gd.textContent=GAMEDATA.status;dlg.append(gd);
 if(GAMEDATA.warn&&GAMEDATA.warn.length){const w=document.createElement('div');w.id='cfgwarn';w.style.cssText='color:#ff6b6b;border:1px solid #ff6b6b66;background:#ff6b6b14;border-radius:8px;padding:8px 12px;margin:0 0 10px;font-size:12px;line-height:1.5';GAMEDATA.warn.forEach(t=>{const d=document.createElement('div');d.textContent='⚠ '+t;w.append(d)});dlg.append(w)}
 const r2=document.createElement('div');r2.className='cf';const l2=document.createElement('label');l2.textContent='Export file name';const fn=document.createElement('input');fn.value=ST.CFG.export.fileName;r2.append(l2,fn,document.createElement('span'));dlg.append(r2);

 const rf=document.createElement('div');rf.className='cf';const lf=document.createElement('label');lf.textContent='Datacard form';const cbf=document.createElement('input');cbf.type='checkbox';cbf.checked=ST.FORMON;cbf.style.width='auto';cbf.onchange=()=>{closeEd(true);ST.FORMON=cbf.checked;try{localStorage.setItem('bmsform',ST.FORMON?'1':'0')}catch(e){}applyFormToggle()};
 const tf=document.createElement('span');tf.className='hint';tf.textContent='Show the form with all the fields on the Datacard page';rf.append(lf,cbf,tf);rf.style.gridTemplateColumns='150px auto 1fr';dlg.append(rf);
 const r4=document.createElement('div');r4.className='cf';const l4=document.createElement('label');l4.textContent='Animations';const cb4=document.createElement('input');cb4.type='checkbox';cb4.checked=!ST.CFG.ui||ST.CFG.ui.animations!==false;cb4.style.width='auto';
 const t4=document.createElement('span');t4.className='hint';t4.textContent='Short transitions (ignored when the system asks for reduced motion)';r4.append(l4,cb4,t4);r4.style.gridTemplateColumns='150px auto 1fr';dlg.append(r4);
 const r5=document.createElement('div');r5.className='cf';const l5=document.createElement('label');l5.textContent='MFD 3 and 4';const cb5=document.createElement('input');cb5.type='checkbox';cb5.checked=!!(ST.CFG.ui&&ST.CFG.ui.showMfd34);cb5.style.width='auto';
 const t5=document.createElement('span');t5.className='hint';t5.textContent='Show them in the Data Cartridge MFD page (BMS does not use them yet)';r5.append(l5,cb5,t5);r5.style.gridTemplateColumns='150px auto 1fr';dlg.append(r5);
 const r6=document.createElement('div');r6.className='cf';const l6=document.createElement('label');l6.textContent='Mission radius';const rn=document.createElement('input');rn.type='number';rn.min=0;rn.max=300;rn.step=5;rn.value=(ST.CFG.mission&&ST.CFG.mission.radiusNm!=null)?ST.CFG.mission.radiusNm:60;
 const u6=document.createElement('span');u6.textContent='NM';u6.style.color='var(--mu)';const t6=document.createElement('div');t6.className='hint';t6.textContent='A saved mission keeps the units within this distance (NM) of the route. 0 = only the units of the package.';t6.style.margin='-2px 0 8px 158px';const w6=document.createElement('span');w6.style.cssText='display:flex;align-items:center;gap:6px';rn.style.width='80px';w6.append(rn,u6);r6.append(l6,w6);r6.style.gridTemplateColumns='150px 1fr';dlg.append(r6,t6);
 const r7=document.createElement('div');r7.className='cf';const l7=document.createElement('label');l7.textContent='Squadron trackers';const tk=document.createElement('textarea');tk.rows=3;tk.value=(ST.CFG.squadron&&ST.CFG.squadron.trackers)||'';tk.placeholder='empty = the built-in public trackers (wss://tracker.openwebtorrent.com …)';tk.style.cssText='width:100%;box-sizing:border-box;font:12px monospace';r7.append(l7,tk,document.createElement('span'));dlg.append(r7);
 const t7=document.createElement('div');t7.className='hint';t7.textContent='WebTorrent trackers (ws:// or wss://, one per line) used to see which pilots of the squadron are online. You can use your own.';t7.style.margin='-2px 0 8px 158px';dlg.append(t7);
 const mp=ST.CFG.map||{},ms=(lab,el,hint)=>{const r=document.createElement('div');r.className='cf';const l=document.createElement('label');l.textContent=lab;r.append(l,el,document.createElement('span'));if(hint)r.title=hint;return r};
 const r8=document.createElement('div');r8.className='cf';const l8=document.createElement('label');l8.textContent='Own satellite layer';const cb8=document.createElement('input');cb8.type='checkbox';cb8.checked=!!mp.satOn;cb8.style.width='auto';const t8=document.createElement('span');t8.className='hint';t8.textContent='Replace the satellite layer of the maps (built-in: Sentinel-2 by EOX) with your own tile provider';r8.append(l8,cb8,t8);r8.style.gridTemplateColumns='150px auto 1fr';dlg.append(r8);
 const su=document.createElement('input');su.value=mp.satUrl||'';su.placeholder='https://provider/{z}/{y}/{x}?token={key}';const sk=document.createElement('input');sk.value=mp.satKey||'';sk.placeholder='replaces {key} in the address (optional)';const sa=document.createElement('input');sa.value=mp.satAttr||'';sa.placeholder='credit shown on the map, as the provider asks';const sz=document.createElement('input');sz.type='text';sz.inputMode='numeric';sz.value=mp.satMaxZoom||18;sz.style.width='80px';
 const satBox=document.createElement('div');satBox.append(ms('Tile address',su),ms('Key',sk),ms('Credit',sa),ms('Deepest zoom',sz));
 const t9=document.createElement('div');t9.className='hint';t9.textContent='Address with {z}, {x} and {y} (XYZ tiles); the provider must allow CORS. Use only a service whose terms let you do so, with your own account or key.';t9.style.margin='-2px 0 8px 158px';satBox.append(t9);dlg.append(satBox);const satShow=()=>{satBox.style.display=cb8.checked?'':'none'};cb8.addEventListener('change',satShow);satShow();
 const bar=document.createElement('div');bar.className='bar';bar.style.justifyContent='flex-end';
 const ok=document.createElement('button');ok.className='btn';ok.textContent='Save';const no=document.createElement('button');no.className='btn g';no.textContent='Cancel';
 ok.onclick=async()=>{const n=JSON.parse(JSON.stringify(ST.CFG));CFG_PATHS.forEach(([k])=>n.paths[k]=inputs[k].value.trim());n.export.fileName=fn.value.trim()||DEFAULTS.export.fileName;n.ui={...(n.ui||{}),animations:cb4.checked,showMfd34:cb5.checked};n.squadron={...(n.squadron||{}),trackers:tk.value.trim()};n.mission={...(n.mission||{}),radiusNm:Math.max(0,Math.min(300,+rn.value||0))};n.map={...(n.map||{}),satOn:cb8.checked,satUrl:su.value.trim(),satKey:sk.value.trim(),satAttr:sa.value.trim(),satMaxZoom:Math.max(5,Math.min(22,Math.round(+sz.value||18)))};
  try{await saveConfig(n);const changed=n.paths.bmsInstall!==ST.CFG.paths.bmsInstall;const trk=n.squadron.trackers!==((ST.CFG.squadron&&ST.CFG.squadron.trackers)||'');ST.CFG=n;applyAnim();if(trk)sqPage.restart();try{mapV.rebase()}catch(e){}dlg.close();view();if(!$('kn').classList.contains('hide'))kbRender();if(changed)await loadGameData();fillCampaigns()}catch(e){alert('Could not save settings: '+(e&&e.message||e))}};
 no.onclick=()=>dlg.close();bar.append(no,ok);dlg.append(bar);dlg.showModal()}
// our own number steppers (the browser's spin buttons are hidden by the CSS): a pair of small buttons after every number box, also for boxes drawn later
export function stepper(i){if(i.dataset.nst||i.closest('#ed'))return;i.dataset.nst=1;const b=document.createElement('span');b.className='nst';b.innerHTML='<button type="button" tabindex="-1" title="Increase">▲</button><button type="button" tabindex="-1" title="Decrease">▼</button>';{const n=i.nextSibling,u=n&&n.nodeType==3&&n.textContent.trim();if(u)b.style.marginLeft='3px';(u?n:i).after(b)}
 b.onclick=e=>{const t=e.target.closest('button');if(!t)return;try{t===b.firstChild?i.stepUp():i.stepDown()}catch(x){}i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}}

// run 18: statements that run when the program starts (in the order of the original file)
export async function init18() {
  $('cfgbtn').onclick=openSettings;
  const boot=loadConfig().then(async r=>{ST.CFG=r.config;applyAnim();if(r.warnings.length)alert('Settings: '+r.warnings.join('\n'));kbMemLoad();await loadGameData();await fillCampaigns()}).catch(()=>{});
  await Promise.race([boot,new Promise(r=>setTimeout(r,30000))]);   // the start-up bar waits for the game data and the campaign list (30 s at most)
  document.querySelectorAll('input[type=number]').forEach(stepper);
  new MutationObserver(ms=>ms.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType!=1)return;if(n.matches('input[type=number]'))stepper(n);n.querySelectorAll('input[type=number]').forEach(stepper)}))).observe(document.body,{childList:true,subtree:true});
}
