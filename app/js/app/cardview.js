import {SHOT, LAYOUT, paintBlank} from '../core/cardlayout.js';
import {CAM} from '../core/cam-core.js';
import {ST} from './state.js';
import {F, FD, LOAD, ML, abTok, shortW, tpl} from './datacard.js';
import {$} from './base.js';
import {apply, discardOk, manClear} from './selection.js';

export let LBL;
export let LB = [];
export function findCell(id,sx,sy,px0,py0){const dk=(X,Y)=>X>=0&&Y>=0&&X<2048&&Y<2048&&(id[(Y*2048+X)*4]+id[(Y*2048+X)*4+1]+id[(Y*2048+X)*4+2])<330;
 const vl=(X,Y)=>{let n=0;for(let k=-16;k<=16;k++)if(dk(X,Y+k))n++;return n>=32},hl=(X,Y)=>{let n=0;for(let k=-16;k<=16;k++)if(dk(X+k,Y))n++;return n>=32};
 for(const[ox,oy]of[[0,0],[0,5],[0,-5],[8,0],[-8,0],[0,9],[0,-9]]){const px=px0+ox,py=py0+oy;if(vl(px,py)||hl(px,py))continue;
  let L=px,R=px,T=py,B=py;while(L>px-500&&!vl(L,py))L--;while(R<px+500&&!vl(R,py))R++;while(T>py-300&&!hl(px,T))T--;while(B<py+300&&!hl(px,B))B++;
  if(R-L>=14&&B-T>=14&&R-L<1000&&B-T<700)return{L,R,T,B}}return null}
export function calcLB(id){const sx=2048/1600,sy=2048/1200;LB=[];LBL.forEach(l=>{const c=findCell(id,sx,sy,Math.round((l.px||l.x)*sx),Math.round(l.y*sy));if(!c)return;
  const i=((c.T+5)*2048+c.R-5)*4,bg=`rgb(${id[i]},${id[i+1]},${id[i+2]})`;
  LB.push(Object.assign({},l,{bg,rx:(c.L+2)/sx,ry:(c.T+2)/sy,rw:(c.R-c.L-3)/sx,rh:(c.B-c.T-3)/sy}))})}
export function drawLabels(x){x.textBaseline='alphabetic';x.fillStyle='#000';LB.forEach(l=>{x.fillStyle=l.bg;x.fillRect(l.rx,l.ry,l.rw,l.rh);x.fillStyle='#000';const cx=l.rx+l.rw/2,cy=l.ry+l.rh/2,pre=l.b?'bold ':'';
  const fit=(w,s0)=>{for(let f=s0;f>9;f--){x.font=pre+f+'px Arial';if(x.measureText(l.t).width<=w)return f}x.font=pre+'9px Arial';return 9};
  if(l.r){const fs=fit(l.rh-6,15);x.save();x.translate(cx,cy);x.rotate(-Math.PI/2);x.textAlign='center';x.fillText(l.t,0,0.358*fs);x.restore();return}
  const fs=16;x.font=pre+fs+'px Arial';if(l.l){x.textAlign='left';x.fillText(l.t,l.rx+3,cy+0.358*fs,l.rw-5)}else{x.textAlign='center';x.fillText(l.t,cx,cy+0.358*fs,l.rw-5)}});x.textBaseline='middle'}
export let YC = null;
ST.MAPSHOT = null;
export const fitF = (x,t,w,s0,m)=>{for(let f=s0;f>m;f--){x.font=f+'px Arial';if(x.measureText(t).width<=w)return f}return m};
export const vy = (d,fs)=>(!d.mdc&&YC&&YC[d.k]!==undefined?YC[d.k]:d.y)+0.358*fs;
export function calcYC(x){YC={};const sx=2048/1600,sy=2048/1200,id=x.getImageData(0,0,2048,2048).data;calcLB(id);
 FD.forEach(d=>{const x0=Math.round(d.x*sx)+3,x1=Math.round((d.x+d.w)*sx)-3,yc=Math.round(d.y*sy);if(x1-x0<8)return;
  const ln=y=>{if(y<0||y>2047)return false;let n=0;for(let X=x0;X<x1;X++){const i=(y*2048+X)*4;if(id[i]+id[i+1]+id[i+2]<200)n++}return n/(x1-x0)>0.8};
  let t=yc,b=yc;while(t>yc-60&&!ln(t))t--;while(b<yc+60&&!ln(b))b++;if(t<=yc-60||b>=yc+60)return;
  while(ln(t+1)&&t<b)t++;while(ln(b-1)&&b>t)b--;if(b-t<10||b-t>90)return;YC[d.k]=(t+b)/2/sy})}
export function drawLoad(x,v,d){const raw=v.split(/,\s*/),full=raw.map(shortW),W=d.w-8,cx=d.x+4;x.fillStyle='#000';x.textBaseline='middle';x.textAlign='left';
 const ab=nh=>raw.map(s=>{const m=s.match(/^(\d+x)\s+(.*)$/);if(!m)return s;return m[1]+abTok(shortW(s).replace(/^\d+x\s+/,''),nh)});
 const one=a=>a.map(s=>s.replace(/^1x\s*/,'')),lv=d.k=='ecm'?[full,one(full),one(ab(false)),one(ab(true))]:[full,ab(false),ab(true)];
 x.textBaseline='alphabetic';for(const fs of [16,15])for(const it of lv){x.font=fs+'px Arial';const t=it.join(' ');if(x.measureText(t).width<=W){x.fillText(t,cx,vy(d,fs));x.textBaseline='middle';return}}
 x.font='15px Arial';const it=lv[lv.length-1];let bk=1,bw=1e9;for(let k=1;k<it.length;k++){const a=x.measureText(it.slice(0,k).join(' ')).width,b=x.measureText(it.slice(k).join(' ')).width;if(Math.max(a,b)<bw){bw=Math.max(a,b);bk=k}}
 if(it.length<2){x.fillText(it.join(' '),cx,vy(d,15),W);x.textBaseline='middle';return}
 x.fillText(it.slice(0,bk).join(' '),cx,vy(d,15)-7,W);x.fillText(it.slice(bk).join(' '),cx,vy(d,15)+7,W);x.textBaseline='middle'}
ST.MDCON = false;
export const loadImg = src=>new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src});
/* MDC format: a second layout of the card (js/core/cardlayout.js), drawn by the program: no image is needed. Its cells (MFD) use the same F values as the Datacard
   where the information is the same, plus a few cells of its own (M1-M4, audio presets, data link...). The cells are scaled to the 1600 x 1200 space of the card. */
export const MFD = [];
export const MSHOT = [SHOT[0]*1600/LAYOUT.w,SHOT[1]*1200/LAYOUT.h,(SHOT[2]-SHOT[0])*1600/LAYOUT.w,(SHOT[3]-SHOT[1])*1200/LAYOUT.h];
export let BLK = null;
export const blank = ()=>{if(!BLK){BLK=document.createElement('canvas');BLK.width=LAYOUT.w;BLK.height=LAYOUT.h;paintBlank(BLK.getContext('2d'),LAYOUT)}return BLK};
export const LEFTK = /^(ews\d|wp\d_mode|atis|ab\d_0|fl\d_[03]|pk\d_[016]|su\d_0|sn\d|pri|sec|d1|d2|ll1|ll2|airsp|srv|ps\d|dl\d_(fl|tm|dn))$/;
export function mdcDraw(x){x.setTransform(1,0,0,1,0,0);x.fillStyle='#fff';x.fillRect(0,0,2048,2048);x.imageSmoothingQuality='high';x.drawImage(blank(),0,0,2048,2048);
 x.setTransform(2048/1600,0,0,2048/1200,0,0);x.textBaseline='middle';x.textAlign='left';
 MFD.forEach(d=>{const v=F[d.k];if(!v)return;x.fillStyle=d.red?'#c00000':'#000';
  if(LOAD.includes(d.k)){drawLoad(x,v,d);x.textAlign='left';x.fillStyle='#000';return}
  if(d.multi){const L=v.split('\n'),top=d.y0+(d.lt?12:3),room=d.h-(d.lt?14:6);let lh=d.k=='free'?16:17;if(L.length*lh>room)lh=room/L.length;let fs=Math.min(15,Math.floor(lh)-1);L.forEach(t=>{if(t!=='')fs=Math.min(fs,fitF(x,t,d.w-8,fs,8))});x.font=fs+'px Arial';x.textAlign='left';x.textBaseline='middle';
   L.forEach((t,i)=>{const yy=top+lh*(i+.5);if(t===''){x.save();x.strokeStyle='#777';x.lineWidth=.8;x.beginPath();x.moveTo(d.x+8,yy);x.lineTo(d.x+d.w-8,yy);x.stroke();x.restore();return}x.fillText(t,d.x+5,yy,d.w-8)});x.fillStyle='#000';return}
  const left=LEFTK.test(d.k)||d.inl,x0=d.x+(d.inl?24:4),W=d.w-(d.inl?28:8);x.textAlign=left?'left':'center';
  let t=v,fs=fitF(x,t,W,15,9);if(/^fl\d_3$/.test(d.k)&&x.measureText(t).width>W){t=v.split(/\s+/)[0];fs=fitF(x,t,W,15,9)}
  x.textBaseline='alphabetic';let yy=vy(d,fs);if(!/[A-Z0-9]/.test(t)){const m=x.measureText(t);yy=vy(d,0)+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2}
  x.fillText(t,left?x0:d.x+d.w/2,yy,W);x.textBaseline='middle';x.textAlign='left';x.fillStyle='#000'});
 if(ST.MAPSHOT){x.drawImage(ST.MAPSHOT,MSHOT[0],MSHOT[1],MSHOT[2],MSHOT[3])}x.setTransform(1,0,0,1,0,0)}
export function draw(){const c=$('cv'),x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);if(ST.MDCON){mdcDraw(x);return}x.fillStyle='#fff';x.fillRect(0,0,2048,2048);
 x.setTransform(2048/1600,0,0,2048/1200,0,0);x.drawImage(tpl,0,0,1600,1200);x.drawImage(tpl,480,195,4,24,473,195,155,24);x.drawImage(tpl,480,219,12,113,544,219,12,113);x.fillStyle='#000';x.font='15px Arial';x.textBaseline='middle';x.textAlign='center';x.fillText('Link 16',550,206);x.drawImage(tpl,397,84,4,24,396,84,74,24);x.drawImage(tpl,475,84,4,24,474,84,75,24);x.textAlign='center';x.font='14px Arial';x.fillText('GND',433,98);x.fillText('APP',511,98);x.drawImage(tpl,476,335,4,24,474,335,75,24);x.fillText('STN',511,347);x.fillStyle='#c0c0c0';x.fillRect(843,727,75,21);x.fillStyle='#000';x.fillText('JTAC/FAC',880,738);x.fillStyle='#c0c0c0';x.fillRect(711,197,76,21);x.fillStyle='#000';x.fillText('IFF 2/3 4',749,208,72);x.fillStyle='#c0c0c0';x.fillRect(843,615,75,23);x.fillRect(843,643,75,23);x.fillStyle='#000';x.fillText('Tanker 1',880,627);x.fillText('Tanker 2',880,655);x.textAlign='left';x.textAlign='left';x.fillStyle='#000';x.textBaseline='middle';
 x.fillStyle='#000';x.font='15px Arial';x.textBaseline='middle';x.fillText('Formation',714,514,70);x.drawImage(tpl,476,503,3,23,475,503,37,23);x.drawImage(tpl,545,503,3,23,511,503,37,23);x.textAlign='center';x.font='14px Arial';x.fillStyle='#333';x.fillText('Mach/TAS',511,514,68);x.fillStyle='#000';x.font='15px Arial';x.textAlign='left';x.textAlign='center';[[842,880],[1267,1305]].forEach(([rx,cx])=>{x.fillStyle='#c0c0c0';x.fillRect(rx,225,76,23);x.fillStyle='#000';x.fillText('TOT',cx,236)});x.textAlign='left';x.fillStyle='#000';
 x.fillStyle='#fff';x.fillRect(1266,1055,329,8);x.fillStyle='#000';x.fillRect(1261,984,339,3);x.fillRect(1261,1134,339,3);
 if(!YC)calcYC(x);drawLabels(x);x.textAlign='left';x.fillStyle='#000';
 FD.forEach(d=>{const v=F[d.k];if(!v)return;
  if(LOAD.includes(d.k)){drawLoad(x,v,d);x.textAlign='left';return}
  const CT=!/^(ews\d|wp\d_mode|atis|ab\d_0|fl\d_[03]|pk\d_[016]|su\d_0|sn\d|pri|sec|d1|d2|ll1|ll2)$/.test(d.k),cx=CT?d.x+d.w/2:d.x;x.textAlign=CT?'center':'left';
  if(d.k=='free'){const L=v.split('\n'),nb=L.filter(t=>t==='').length,n=L.length-nb;let lh=16,gp=10;const room=140,tot=n*lh+nb*gp;if(tot>room){const k=Math.max(0.8,room/tot);lh*=k;gp*=k}
   let fs=14;L.forEach(t=>{if(t!=='')fs=Math.min(fs,fitF(x,t,d.w-4,14,10))});if(lh<14)fs=Math.min(fs,Math.floor(lh)-1);x.font=fs+'px Arial';let yy=0,first=true;
   L.forEach(t=>{if(t===''){const ry=d.y+6+yy-lh/2+gp/2+(first?0:0);x.save();x.strokeStyle='#777';x.lineWidth=.8;x.beginPath();x.moveTo(d.x+8,ry);x.lineTo(d.x+d.w-8,ry);x.stroke();x.restore();yy+=gp-lh+lh;return}
    x.fillText(t,cx,d.y+6+yy,d.w);yy+=lh})}
  else if(ML.includes(d.k)||d.k=='atis'){v.split('\n').forEach((t,i)=>{const fs=fitF(x,t,d.w-4,16,12);x.font=fs+'px Arial';x.fillText(t,cx,d.y+(d.k=='atis'?(v.includes('\n')?-8:0):6)+i*17,d.w)})}
  else if(/^fl\d_3$/.test(d.k)){const W=d.w-8,c=[[16,v],[15,v],[14,v],[16,v.split(/\s+/)[0]]];for(let q=0;q<4;q++){x.font=c[q][0]+'px Arial';if(q==3||x.measureText(c[q][1]).width<=W){x.textBaseline='alphabetic';x.fillText(c[q][1],d.x+4,vy(d,c[q][0]));x.textBaseline='middle';break}}}
  else{const fs=fitF(x,v,d.w-4,16,11);x.textBaseline='alphabetic';let yy=vy(d,fs);if(!/[A-Z0-9]/.test(v)){const m=x.measureText(v);yy=vy(d,0)+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2}x.fillText(v,CT?cx:d.x+3,yy,d.w-4);x.textBaseline='middle'}x.textAlign='left'});
 if(ST.MAPSHOT){x.setTransform(1,0,0,1,0,0);x.drawImage(ST.MAPSHOT,1048,1290,564,752)}}
export function gapless(){const cut=ST.MDCON?[1010,1103]:[1012,1040],c=$('cv'),o=document.createElement('canvas');o.width=o.height=2048;const q=o.getContext('2d');q.fillStyle='#fff';q.fillRect(0,0,2048,2048);q.imageSmoothingEnabled=true;q.imageSmoothingQuality='high';
 q.drawImage(c,0,0,cut[0],2048,0,0,1024,2048);q.drawImage(c,cut[1],0,2048-cut[1],2048,1024,0,1024,2048);return o}
ST.C = null;
ST.CL = [];
ST.WX = null;
ST.L16 = null;
ST.IFFP = null;
ST.AUTO = null;
ST.CURK = null;
ST.CAMSEL = '';
ST.D1PREV = '';

// run 5: statements that run when the program starts (in the order of the original file)
export async function init5() {
  LBL = (()=>{const L=[],a=(t,x,y,o)=>L.push(Object.assign({t,x,y},o||{}));
   a('Page 1',51,14);a('DATACARD',450,14,{b:1});a('ATIS',51,52);
   [['Airbase',210],['TCN',355],['GND',433],['APP',511],['Elv',590],['RWY',669],['ILS',749]].forEach(([t,x])=>a(t,x,99));
   ['DEP','ARR','ALTN'].forEach((t,i)=>a(t,65,123+28*i));
   [['Pos',51],['Name',210],['IDM',355],['TCN',433],['Link 16',550,{px:511}],['CONF-LSR',669],['IFF 2/3 4',749]].forEach(([t,x,o])=>a(t,x,207,o));
   ['1 Lead','2 Wing','3 Element','4 Wing'].forEach((t,i)=>a(t,65,234+28*i));
   [['Callsign Pack',104],['Aircraft Type',248],['UHF',355],['VHF',433],['STN',511],['TCN',590],['Task',710]].forEach(([t,x])=>a(t,x,347));
   [['STPT',51],['Action',128],['TOS',248],['HDG',355],['Dist',433],['Mach/TAS',511],['Alt',590],['Min.Fuel',669],['Formation',749]].forEach(([t,x])=>a(t,x,514));
   for(let i=0;i<24;i++)a(String(i+1),51,542+28*i);
   a('Page 2',860,14);a('DATACARD',1260,14,{b:1});a('Callsign',948,39);a('Package',1145,39);a('Mission',1303,39);
   a('Config',973,67,{px:950});a('TO Spec',1305,67);a('Fuel',1470,67);
   [['A-A','Gross Wgt','Rotation','TO Fuel'],['A-G','Drag ind','Refusal','Set Fuel'],['ECM','ALOW','Mil Power','JOKER'],['Tanks','MSL','Mil Climb','BINGO']].forEach((r,i)=>r.forEach((t,j)=>a(t,[865,1145,1305,1470][j],94+28*i)));
   a('Primary',881,207);a('Secondary',1304,207);a('TOT',880,235);a('TOT',1305,235);a('Lat&Long',881,262);a('Lat&Long',1304,262);
   a('EWS = THR',880,290);[[970,'1 ='],[1080,'2 ='],[1185,'3 ='],[1290,'4 ='],[1430,'5 ='],[1560,'6 =']].forEach(([x,t])=>a(t,x,290,{l:1}));
   [1023,1388].forEach(x=>['Fuze','AD','BA','REL AGL'].forEach((t,i)=>a(t,x,318+28*i)));
   [1145,1510].forEach(x=>['SGL/PAIR','RP','SPACING','B. CODE'].forEach((t,i)=>a(t,x,318+28*i)));
   a('OA1',1145,431);a('OA2',1225,431);a('PUP',1304,431);a('Pull Hdg',1390,431);
   [['TBRG',881,458],['RNG',881,486],['ELV',881,513],['Climb',1390,458],['Pull Dwn',1390,486],['Turn',1390,513],['Ingress Alt',881,542],['Rel Height',1145,542],['Attack hdg',1390,542],['Ingress Spd',881,570],['Rel Spd',1145,570],['TGT in HUD',1390,570]].forEach(([t,x,y])=>a(t,x,y));
   [['AC Type',1010],['TACAN',1146],['UHF',1225],['LOC',1303]].forEach(([t,x])=>a(t,x,597));a('Notes:',1344,597,{l:1});
   ['Tanker 1','Tanker 2','AWACS','JSTAR','JTAC/FAC'].forEach((t,i)=>a(t,880,625+28*i));
   [['Class',1325],['MTR',1407],['FR',1451],['MAR',1493],['DR',1535],['DOR',1578]].forEach(([t,x])=>a(t,x,765));a('ROE',1431,905);
   [['Airbase',15,138],['Flight',15,265],['Package',15,417],['Flightplan',15,849],['TO / Loadout',828,123],['TGT',828,235],['Weapon',828,360],['Delivery',828,500],['Support',828,676],['Profile 1',856,360],['Profile 2',1243,360]].forEach(([t,x,y])=>a(t,x,y,{r:1}));
   return L})();
  try{ST.MDCON=localStorage.getItem('bmsmdc')==='1'}catch(e){}
  {const GR=k=>/^(step|start|chkin|taxi|to_time|ld_time|aux|airsp|tk_\w+|m[1-4])$/.test(k)?'Mission':/^ps\d$/.test(k)?'Audio presets':/^nav/.test(k)?'NAV':/^dl\d_/.test(k)?'Data link':k=='srv'?'Server':k=='contracts'?'Free text':'Other',META={};FD.forEach(d=>META[d.k]=d);
   const kx=1600/LAYOUT.w,ky=1200/LAYOUT.h;
   LAYOUT.fields.forEach(f=>{if(f.img)return;const m=META[f.k],[x0,y0,x1,y1]=f.r,h=y1-y0;MFD.push({k:f.k,lab:m?m.lab:f.lab,grp:m?m.grp:GR(f.k),x:x0*kx,w:(x1-x0)*kx,y0:y0*ky,h:h*ky,y:(f.lt?y0+(h+9)/2:y0+h/2)*ky,multi:f.multi,lt:f.lt,inl:f.inl,red:f.red,mdc:1})})}
  ST.OVR = new Map();
  ST.MANK = new Set(); // manual datacard changes kept per flight (see apply)
  {const d1=$('d1');let v='';try{v=localStorage.getItem('bmsd1')||''}catch(e){}if(!v)v=new Date().toISOString().slice(0,10);d1.value=v;CAM.setBase(v);ST.D1PREV=v;d1.onchange=async()=>{if(!await discardOk()){d1.value=ST.D1PREV;return}ST.D1PREV=d1.value;manClear();CAM.setBase(d1.value);try{localStorage.setItem('bmsd1',d1.value)}catch(e){}if(ST.C&&ST.CL.length)apply(+$('fsel').value||0,'fresh')}}
}
