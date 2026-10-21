// Datacard core: public API. The logic lives in core/ (flight, fillcard) and rules/ (weather, airbase, geo, support, ephemerides).
import D0 from '../data/index.js';
import {openCam, CAM_VER_MAX} from '../parsers/cam.js';
import {parseFmap} from '../parsers/fmap.js';
import {setBase} from '../rules/ephemerides.js';
import {listFlights,nAcf,els0,fac,totMs,isHiFi,isHeli} from '../core/flight.js';
import {fillCard} from '../core/fillcard.js';
import {atisText,tafText} from '../rules/weather.js';
import {pickRwy} from '../rules/airbase.js';
import {geoLL} from '../rules/geo.js';
import {jtac,svc} from '../rules/support.js';

export const CAM={setBase,D:D0,openCam,CAM_VER_MAX,listFlights,isHiFi,isHeli,fillCard,parseFmap,atisText,pickRwy,geoLL,nAcf,els0,jtac,svc,fac,tafText,totMs};
export default CAM;
