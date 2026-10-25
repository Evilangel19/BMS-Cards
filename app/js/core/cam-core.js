// Datacard core: public API. The logic lives in core/ (flight, fillcard) and rules/ (weather, airbase, geo, support, ephemerides).
import D0 from '../data/index.js';
import {openCam, camToc, objInitial, CAM_VER_MAX} from '../parsers/cam.js';
import {parseFmap} from '../parsers/fmap.js';
import {setBase} from '../rules/ephemerides.js';
import {listFlights,loadGroups,nAcf,els0,fac,totMs,isHiFi,isHeli} from '../core/flight.js';
import {fillCard} from '../core/fillcard.js';
import {atisText,tafText} from '../rules/weather.js';
import {pickRwy} from '../rules/airbase.js';
import {geoLL} from '../rules/geo.js';
import {jtac,svc} from '../rules/support.js';

// The owners of the objectives at the start (the scenario file the campaign was saved from, C.base) under the changes recorded in the campaign file.
// C.objOwn / C.objFeat are keyed by the CAMPAIGN ID of the objective (the one of the theater files); the changes of the campaign file are keyed by the entity id
// (C.objOwnRaw / C.objFeatRaw) and need the scenario file to be turned into campaign ids. Without the file both stay empty (owners unknown). Returns the number of objectives read.
export function initialOwners(C,u8){try{const m=objInitial(camToc(u8));if(!m||!m.size)return 0;
 const raw=C.objOwnRaw||new Map(),rawF=C.objFeatRaw||new Map(),own=new Map(m),feat=new Map();
 raw.forEach((o,vu)=>{const k=m.vu.get(vu);if(k!=null)own.set(k,o)});rawF.forEach((f,vu)=>{const k=m.vu.get(vu);if(k!=null)feat.set(k,f)});
 C.objOwn=own;C.objFeat=feat;C.objVu=m.vu;C.objOwnFull=true;return m.size}catch(e){return 0}}
export const CAM={initialOwners,loadGroups,setBase,D:D0,openCam,CAM_VER_MAX,listFlights,isHiFi,isHeli,fillCard,parseFmap,atisText,pickRwy,geoLL,nAcf,els0,jtac,svc,fac,tafText,totMs};
export default CAM;
