// Falcon BMS weather map (.fmap) reader.
export function parseFmap(u8){const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),X=dv.getInt32(4,true),Y=dv.getInt32(8,true),N=X*Y,H=44;
 if(dv.getInt32(0,true)<4||dv.byteLength<H+4*30*N)throw new Error('unrecognized .fmap format');
 const f=o=>dv.getFloat32(o,true),S0=H+12*N,S1=S0+40*N,R=S1+40*N,cs=57344/3280.84;
 return{raw:u8,X,Y,cs,cell(i,j,lv=0){const c=(Y-1-j)*X+i;return{cond:dv.getInt32(H+4*c,true),spd:f(S0+40*c+4*lv),hdg:f(S1+40*c+4*lv)}},at(x,y){const ie=Math.max(0,Math.min(X-1,Math.floor(x/cs))),jn=Math.max(0,Math.min(Y-1,Math.floor(y/cs))),c=(Y-1-jn)*X+ie;
  return{cond:dv.getInt32(H+4*c,true),p:f(H+4*N+4*c),t:f(H+8*N+4*c),spd:f(S0+40*c),hdg:f(S1+40*c),cu:f(R+4*c),dens:dv.getInt32(R+4*N+4*c,true),tcu:dv.getInt32(R+12*N+4*c,true),fogEnd:f(R+20*N+4*c),fogZ:f(R+24*N+4*c)}}}}
