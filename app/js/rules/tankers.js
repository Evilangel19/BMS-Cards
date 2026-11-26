// @ts-check
// The tankers of BMS 4.36+ and the refuelling method of an aircraft (the datacard picks the tankers with it: rules/support.js; Performance > AAR:
// core/aar.js). Drogue (probe): KC-135, KC/DC-10, KC-130H, C-160R NG, IL-78M; boom: KC-135 and KC/DC-10. A-A TACAN: the KC-10 gives distance and bearing,
// the KC-135 and the KC-130H the distance only.

// aircraft refuelled with a probe (a drogue tanker); the others take the boom
export const PROBE =
  /F\/A-18|F-18|EF-18|CF-188|AV-8|Harrier|F-14|Tornado|Typhoon|EF-2000|Rafale|Mirage|^A-4|^A-6|EA-6|^S-3|Su-30|Su-33|J-15|MiG-29K|F-35[BC]/i;
export const methodOf = ac => (PROBE.test(String(ac || '')) ? 'probe' : 'boom');
/** @type {[RegExp, {boom: boolean | null, drogue: boolean | null, tcn: string}][]} */
const TANKERS = [
  [/KC-10|DC-10/i, { boom: true, drogue: true, tcn: 'brg' }],
  [/C-135/i, { boom: true, drogue: true, tcn: 'dme' }],
  [/C-130/i, { boom: false, drogue: true, tcn: 'dme' }],
  [/C-160/i, { boom: false, drogue: true, tcn: '' }],
  [/IL-78/i, { boom: false, drogue: true, tcn: '' }],
];
/** what a tanker type gives: {boom, drogue (true, false or null: not known), tcn: 'brg' (distance and bearing), 'dme' (distance only), '' (not known)} */
export function tankerKind(type) {
  const t = TANKERS.find(([re]) => re.test(String(type || '')));
  return t ? t[1] : { boom: null, drogue: null, tcn: '' };
}
/** true when the tanker refuels this method, false when it cannot, null when the type is not known */
export function serves(type, method) {
  const k = tankerKind(type);
  return method == 'probe' ? k.drogue : k.boom;
}
/** the tanker to take first: 2 = made for the method (the boom for a boom aircraft, a drogue-only tanker for a probe one, so the boom tankers stay
 * free), 1 = it refuels the method (a KC-135 or KC-10 for a probe aircraft) or the type is not known, 0 = it cannot */
export function prefer(type, method) {
  const s = serves(type, method);
  if (s === false) return 0;
  if (s === null) return 1;
  return method == 'probe' && tankerKind(type).boom ? 1 : 2;
}
