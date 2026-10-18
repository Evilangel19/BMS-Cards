// Part of the datacard core (prototype logic, moved as-is from cam-core.js).
import D0 from '../data/index.js';
function pickRwy(W,o){const a=D0.ap[o[0]]||D0.api[(o[1].match(/\((\w+)\)/)||[])[1]];if(!a)return null;const w=W.at(o[2],o[3]),calm=w.spd<3;let b=null,bs=-9;
 a.rw.forEach(r=>{const hw=calm?0:Math.cos((r[1]-w.hdg)*Math.PI/180)*w.spd,sc=hw+(r[2]?0.001:0);if(sc>bs){bs=sc;b=r}});
 return b&&{nr:b[0],ils:b[2]?(b[2]/100).toFixed(2):''}}
function tcnFor(C,o,a){if(C.D.tn[o[0]])return C.D.tn[o[0]];if(a[0]>1)return a[0]+' '+a[1];let b=null,bd=10;
 C.D.ob.forEach(s=>{const q=C.D.ab[s[0]];if(!q||q[0]<=1||q[5]!=0)return;const d=Math.hypot(s[2]-o[2],s[3]-o[3]);if(d<bd){bd=d;b=q}});return b?b[0]+' '+b[1]+'*':''}
export {pickRwy,tcnFor};
