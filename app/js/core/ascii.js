// @ts-check
// Text written into the files of the game (the DTC, the campaign .ini): plain letters only. The names come from the theater files (in the Balkans "Baške Oštarije",
// "Drežnik"...), and the game reads its files as plain 8-bit text: an accented letter would show as other signs (or "?") in the jet.
const MAP = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ł: 'l',
  Ł: 'L',
  œ: 'oe',
  Œ: 'OE',
  þ: 'th',
  Þ: 'Th',
  ð: 'd',
  Ð: 'D',
  ı: 'i',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  '€': 'EUR',
  ' ': ' ',
};
/** the text with plain letters: the accents are dropped (é -> e, Š -> S), a few letters are spelled out (ß -> ss), any other sign outside plain text is left out
 * @param {any} v */
export function toAscii(v) {
  const s = String(v == null ? '' : v);
  if (!/[^\x20-\x7e\t]/.test(s)) return s; // nothing to change (the numbers, most of the names)
  return [...s.normalize('NFD').replace(/[̀-ͯ]/g, '')].map(c => (c.charCodeAt(0) < 128 ? c : MAP[c] || '')).join('');
}
