// Terrain height reader: format checks on a small synthetic .raw file (the real ones are about 2 GB).
import { parseTheaterValues, heightSpec, heightOffset, heightAt, heightsAt, FT_M } from '../app/js/bmsdata/heightmap.js';
let n = 0, bad = 0;
const ck = (name, ok) => { n++; if (!ok) { bad++; console.log('FAIL', name); } };
const v = parseTheaterValues('Theater size in km = 1024\r\nmap size in pixels = 8\r\n// x\r\nname = Korea');
ck('Theater.txt values', v['theater size in km'] === '1024' && v['map size in pixels'] === '8' && v.name === 'Korea');
const spec = heightSpec(v, 8 * 8 * 2);
ck('spec: side and size in feet', spec.side === 8 && Math.abs(spec.sizeFt - 1024000 / FT_M) < 1e-6);
ck('side falls back to sqrt(file size / 2), then to 32768', heightSpec({'theater size in km': '10'}, 16 * 16 * 2).side === 16 && heightSpec({'theater size in km': '10'}, 1000).side === 32768 && heightSpec({}, 100) === null && heightSpec({}, 100, 5).sizeFt > 0);
// sample (x, y) = 100 * y + x - 300 feet, row 0 = north edge
const buf = new Uint8Array(8 * 8 * 2), dv = new DataView(buf.buffer);
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) dv.setInt16((y * 8 + x) * 2, 100 * y + x - 300, true);
const readAt = async (off, len) => buf.slice(off, off + len);
const S = spec.sizeFt;
ck('north-west corner is the first sample, south-east the last', heightOffset(spec, S, 0) === 0 && heightOffset(spec, 0, S) === (7 * 8 + 7) * 2);
ck('out of the theater gives nothing', heightOffset(spec, -1, 10) === null && heightOffset(spec, 10, S + 1) === null && await heightAt(readAt, spec, -5, 0) === null);
ck('values: north-west -300 (negative = below sea level), south-east 407, a middle point', await heightAt(readAt, spec, S, 0) === -300 && await heightAt(readAt, spec, 0, S) === 407 && await heightAt(readAt, spec, S * .5, S * .5) === 100 * 3 + 3 - 300);
ck('several points', JSON.stringify(await heightsAt(readAt, spec, [{n: S, e: 0}, {n: -1, e: 0}, {n: 0, e: S}])) === '[-300,null,407]');
ck('short file gives nothing', await heightAt(async () => new Uint8Array(1), spec, S, 0) === null);
{ // the real KTO Theater.txt (Data\TerrData\Korea\NewTerrain)
  const v = parseTheaterValues('Theater name=KTO\r\nTheater size in KM=1024\r\nMap size in pixels=32768\r\nCenter latitude=38.5\r\nProjection string=+proj=tmerc +lon_0=127.5 +ellps=WGS84 +k=0.9996 +units=m +x_0=512000 +y_0=-3.74929e+06\r\n'), sp = heightSpec(v, 2147483648, 1);
  ck('KTO Theater.txt: 1024 km, 32768 px', sp.side === 32768 && Math.round(sp.sizeFt) === 3359580);
}
console.log(bad ? 'heightmap: ' + bad + ' FAILED' : 'heightmap: ' + n + '/' + n + ' checks passed'); process.exit(bad ? 1 : 0);
