// Reads the BMS KTO AIP (airport tables) from text items with positions: elevation and ILS frequency per runway end.
// Input: pages = [[{s, x, y, w}]] (string, position and width of each text fragment, as given by the PDF reader).

// Join text fragments of the same line into words (the PDF splits words into pieces).
export function mergeItems(items) {
  const rows = [];
  for (const it of [...items].filter(i => i.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const r = rows.find(r => Math.abs(r.y - it.y) < 1.5);
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  const words = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of r.items) {
      if (cur && it.x - (cur.x + cur.w) < 2.2) { cur.s += it.s; cur.w = it.x + it.w - cur.x; }
      else { if (cur) words.push(cur); cur = { s: it.s, x: it.x, y: r.y, w: it.w }; }
    }
    if (cur) words.push(cur);
  }
  return words;
}

const ILS_FULL = /^(\d{3}\.\d{1,3})\s*\(([0-9LRC&\s]+)\)$/, ILS_FREQ = /^\d{3}\.\d{1,3}$/, ILS_ENDS = /^\(([0-9LRC&\s]+)\)$/;

// -> [{ icao, name, elev, tacan ('027X'), lat, lon (decimal degrees), rwys: ['06L/24R'], ils: [{ f: 11170, end: '24R' }] }]
export function parseAip(pages) {
  const list = [];
  for (const items of pages) {
    const W = mergeItems(items);
    const heads = W.filter(w => /^Elev$/i.test(w.s));
    const anchors = W.filter(w => w.x < 30 && /^(R[JK]|Z[KM])[A-Z]{2}$/.test(w.s));
    if (!anchors.length) continue;
    const rwTok = W.filter(w => /^\d{2}[LRC]?\/\d{2}[LRC]?$/.test(w.s));
    const A = anchors.map(a => {
      const head = heads.filter(h => h.y > a.y).sort((p, q) => p.y - q.y)[0];
      const hx = head ? head.x + head.w / 2 : null;
      const ev = hx == null ? null : W.find(w => Math.abs(w.y - a.y) < 2 && /^\d{1,4}$/.test(w.s) && Math.abs(w.x + w.w / 2 - hx) < 14);
      const nm = W.find(w => Math.abs(w.y - a.y) < 8 && w.x > a.x + 15 && w.x < a.x + 60 && /^[A-Za-z]/.test(w.s));
      const rw = rwTok.filter(w => Math.abs(w.y - a.y) < 14).map(w => w.s);
      const tc = W.find(w => Math.abs(w.y - a.y) < 2 && /^\d{2,3}[XY]$/.test(w.s));
      const ll = s => { const m = (W.find(w => Math.abs(w.y - a.y) < 14 && new RegExp('^' + s + '\\d{1,3}\u00b0\\d{1,2}\\.\\d+').test(w.s)) || {}).s?.match(/^([NSEW])(\d+)\u00b0(\d+\.\d+)/); return m ? (m[1] === 'S' || m[1] === 'W' ? -1 : 1) * (+m[2] + +m[3] / 60) : null; };
      const rec = { icao: a.s, name: nm ? nm.s : '', elev: ev ? +ev.s : null, tacan: tc ? tc.s : null, lat: ll('[NS]'), lon: ll('[EW]'), rwys: rw, ils: [] };
      list.push(rec);
      return { a, ends: new Set(rw.flatMap(r => r.split('/'))), rec };
    });
    const ils = [];
    for (const w of W) {
      const m = w.s.match(ILS_FULL);
      if (m) { ils.push({ f: m[1], ends: m[2].split('&').map(x => x.trim()), y: w.y }); continue; }
      if (ILS_FREQ.test(w.s)) { // frequency on one line, runway ends on the next ("111.1" / "(04L&22R)")
        const n = W.find(v => ILS_ENDS.test(v.s) && v.y < w.y && w.y - v.y < 14 && Math.abs(v.x - w.x) < 12);
        if (n) ils.push({ f: w.s, ends: n.s.slice(1, -1).split('&').map(x => x.trim()), y: w.y });
      }
    }
    for (const i of ils) { // belongs to the airport whose runways contain these ends (else the nearest row)
      const cand = A.filter(c => i.ends.every(e => c.ends.has(e)));
      const best = (cand.length ? cand : A).sort((p, q) => Math.abs(p.a.y - i.y) - Math.abs(q.a.y - i.y))[0];
      for (const e of i.ends) best.rec.ils.push({ f: Math.round(parseFloat(i.f) * 100), end: e });
    }
  }
  return list;
}

// The AIP record for an airport. Matches the ICAO code; when two airports share a code in the AIP, or the AIP uses a
// different code, the object's name decides (e.g. "Jungwon (RKTI)" is "RKTY Jungwon" in the AIP).
export function aipFor(list, icao, objName = '') {
  const n = objName.toLowerCase(), byName = r => r.name && n.includes(r.name.toLowerCase());
  const c = list.filter(r => r.icao === icao);
  if (c.length === 1) return c[0];
  if (c.length > 1) return c.find(byName) || c[0];
  return list.find(byName) || null;
}
