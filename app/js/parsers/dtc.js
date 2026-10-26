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
