// LZSS expander used by Falcon BMS campaign files.
export function lzExpand(s,size){const w=new Uint8Array(4096);let pos=1,i=1,fl=s[0],m=1;const o=new Uint8Array(size);let n=0;
 while(n<size&&i<s.length){if(m==0x100){fl=s[i++];m=1}const b=fl&m;m<<=1;
  if(b){const c=s[i++];o[n++]=c;w[pos]=c;pos=(pos+1)&4095}
  else{const b0=s[i],b1=s[i+1];i+=2;const mp=b1|((b0&15)<<8),ml=(b0>>4)+1;
   for(let k=0;k<=ml&&n<size;k++){const c=w[(mp+k)&4095];o[n++]=c;w[pos]=c;pos=(pos+1)&4095}}}
 return o}
