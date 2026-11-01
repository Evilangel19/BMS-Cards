// @ts-check
// Data cartridge (.ini): list of lines; key/value lines carry section (s), key (k) and value (v).
export function parseDtc(text) {
  let s = '';
  const lines = text.split(/\r?\n/).map(l => {
    const h = l.match(/^\s*\[(.+?)\]/);
    if (h) s = h[1];
    const m = l.match(/^([^=;#\[][^=]*?)=(.*)$/);
    return m ? { k: m[1], v: m[2].trim(), raw: l, s } : { raw: l, s };
  });
  if (lines.length && !lines[lines.length - 1].raw) lines.pop();
  return lines;
}
// A DTC that has the same section twice or more (a file written by two programs one after the other): the program read one copy and wrote another, and the game reads only one of them.
// The copies are folded into the first one: every key once, in the place of its first copy, with the value of the LAST copy that has it (what the game reads: the changes made in the first copy were not seen in the game).
// -> { lines, merged: [names of the sections that were repeated] } (the same lines when nothing is repeated)
export function mergeSections(lines) {
  const blocks = [],
    pre = [];
  let cur = null;
  for (const l of lines) {
    if (/^\s*\[.+?\]/.test(l.raw)) {
      cur = { s: l.s, head: l, body: [] };
      blocks.push(cur);
    } else if (cur) cur.body.push(l);
    else pre.push(l);
  }
  const by = new Map();
  blocks.forEach(b => (by.has(b.s) ? by.get(b.s).push(b) : by.set(b.s, [b])));
  const merged = [...by].filter(([, v]) => v.length > 1).map(([k]) => k);
  if (!merged.length) return { lines, merged };
  const out = [...pre];
  for (const b of blocks) {
    const all = by.get(b.s);
    if (all[0] !== b) continue;
    out.push(b.head);
    if (all.length == 1) {
      out.push(...b.body);
      continue;
    }
    const last = new Map(),
      done = new Set();
    all.forEach(x => x.body.forEach(l => l.k !== undefined && last.set(l.k, l)));
    all.forEach(x =>
      x.body.forEach(l => {
        if (l.k === undefined) {
          if (x === b) out.push(l); // blank lines and comments of the first copy only
          return;
        }
        if (done.has(l.k)) return;
        done.add(l.k);
        out.push(last.get(l.k));
      })
    );
  }
  return { lines: out, merged };
}
