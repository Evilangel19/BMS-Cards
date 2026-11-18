// @ts-check
// HARM threat codes (ALIC codes of the BMS manual): [code, name, symbol, group]
export const THREATS = [
  [102, 'SA2', '2', 'SAM'],
  [103, 'SA3', '3', 'SAM'],
  [104, 'SA4', '4', 'SAM'],
  [105, 'SA5', '5', 'SAM'],
  [106, 'SA6', '6', 'SAM'],
  [110, 'SA10', '10', 'SAM'],
  [111, 'SA11', '11', 'SAM'],
  [117, 'SA17', '17', 'SAM'],
  [130, 'HAWK', 'H', 'SAM'],
  [692, 'AAA', 'AAA', 'SAM'],
  [801, 'SEARCH', 'S', 'SAM'],
  [99, 'UNKNOWN', 'U', 'SAM'],
  [202, 'FAN SONG', '2T', 'FCR'],
  [203, 'LOW BLOW', '3T', 'FCR'],
  [204, 'PAT HAND', '4T', 'FCR'],
  [205, 'SQUARE PAIR', '5T', 'FCR'],
  [206, 'STRAIGHT FLUSH', '6T', 'FCR'],
  [608, 'SA8', '8', 'FCR'],
  [210, 'FLAPLID', '10T', 'FCR'],
  [211, 'FIREDOME', '11T', 'FCR'],
  [615, 'SCRUMHALF', '15', 'FCR'],
  [217, 'CHAIRBACK', '17T', 'FCR'],
  [619, 'HOTSHOT', '19', 'FCR'],
  [693, 'AN/MPQ-53', 'P', 'FCR'],
  [230, 'AN/MPQ-46', 'HT', 'FCR'],
  [696, 'NIKE', 'N', 'FCR'],
  [695, 'SKYGUARD', 'SKY', 'FCR'],
  [402, 'SPOON REST', '2A', 'EWR'],
  [403, 'FLATFACE', 'F', 'EWR'],
  [404, 'LONG TRACK', '4A', 'EWR'],
  [405, 'BARLOCK', '5A', 'EWR'],
  [609, 'DOGEAR', 'D', 'EWR'],
  [410, 'BIGBIRD', '10A', 'EWR'],
  [411, 'SNOWDRIFT 11A', '11A', 'EWR'],
  [417, 'SNOWDRIFT 17A', '17A', 'EWR'],
  [430, 'AN/MPQ-50', 'HA', 'EWR'],
];

// the HARM code of a SAM unit of the campaign (its name in the BMS data, "SA-6 Gainful", "Hawk", "ZSU-23/4"...): the system for a SAM, the fire
// control radar for those that are listed by it (SA-8, SA-15, SA-19, Patriot, Nike, Skyguard); null when the HARM has no code for it (an IR system)
const BY_SA = { 2: 102, 3: 103, 4: 104, 5: 105, 6: 106, 8: 608, 10: 110, 11: 111, 15: 615, 17: 117, 19: 619 };
/** @param {string} name @returns {number|null} */
export function harmCode(name) {
  const n = String(name || '').toLowerCase(),
    m = n.match(/\bsa-?\s?(\d+)\b/);
  if (m) return BY_SA[+m[1]] || null;
  if (/hawk/.test(n)) return 130;
  if (/patriot|mpq-53/.test(n)) return 693;
  if (/nike/.test(n)) return 696;
  if (/skyguard|sky guard/.test(n)) return 695;
  if (/zsu-?23|shilka|gepard|zsu-?57|aaa/.test(n)) return 692;
  return null;
}
/** the entry of a code: [code, name, symbol, group] */
export const threatOf = code => THREATS.find(t => t[0] == code) || null;
