// @ts-check
// The radio presets of the DTC for a flight, from what the datacard holds (pure: no DTC, no campaign; app/flightdtc.js reads the card and writes the lines).
// The rules of BMS (checked on Hammer 7 of EvilKorea against the Data Cartridge of the game):
//   preset 6  = the UHF / VHF of the player's own flight (the frequency where the pilot talks to AWACS, FAC and JTAC)
//   preset 13 = the first tanker
//   preset 5  = the AWACS (check-in; not used by the game yet, but it is there)
//   UHF 15    = the intra-flight UHF (UHF2, the backup) of the first flight of the package
//   VHF 15... = the VHF of the flights of the package in the order of the datacard (the first flight 15, the second 16, ...)
// The labels of the presets ("AWACS Check-in", "Tanker/AAR", "Flight-1"...) are written by BMS in the DTC: only the frequencies are written here.

/** a frequency in MHz as the card shows it ("276.675") -> the DTC value in kHz ("276675"); '' when it is no frequency */
export function khz(v) {
  const s = String(v == null ? '' : v)
    .trim()
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return '';
  const n = Math.round(parseFloat(s) * 1000);
  return n > 0 ? String(n) : '';
}

/** the package flight that is the player's own: index 0..4 of the package table of the card (pk<i>_0 = callsign), -1 when it is not there */
export function ownIndex(F) {
  const cs = String(F.cs == null ? '' : F.cs).trim();
  if (!cs) return -1;
  for (let i = 0; i < 5; i++) if (String(F[`pk${i}_0`] == null ? '' : F[`pk${i}_0`]).trim() === cs) return i;
  return -1;
}

/**
 * The presets the card gives: [{k: 'UHF_6', v: '276675'}, ...] (kHz, only the ones the card has a frequency for).
 * @param {Record<string, any>} F the datacard (pk<i>_2 / pk<i>_3 = UHF / VHF of the package flights, su0 = the first tanker, su2 = the AWACS, su<i>_v = VHF of a support aircraft, rd_u15 = UHF2 of the first flight)
 * @returns {{k: string, v: string}[]}
 */
export function radioPlan(F) {
  const out = [],
    put = (k, v) => {
      const n = khz(v);
      if (n) out.push({ k, v: n });
    },
    own = ownIndex(F);
  put('UHF_5', F.su2_2);
  put('VHF_5', F.su2_v);
  if (own >= 0) {
    put('UHF_6', F[`pk${own}_2`]);
    put('VHF_6', F[`pk${own}_3`]);
  }
  put('UHF_13', F.su0_2);
  put('VHF_13', F.su0_v);
  put('UHF_15', F.rd_u15);
  for (let i = 0; i < 5; i++) put(`VHF_${15 + i}`, F[`pk${i}_3`]);
  return out;
}

/**
 * The lines to write: only the presets that exist in the DTC and hold another frequency.
 * @param {{k: string, v: string}[]} plan @param {(k: string) => string | null} get the value of a key of [Radio] (null when the key is not in the file)
 * @returns {{s: string, k: string, v: string}[]}
 */
export function radioEdits(plan, get) {
  const out = [];
  for (const p of plan) {
    const cur = get(p.k);
    if (cur === null || cur === undefined) continue;
    if (parseFloat(String(cur)) === parseFloat(p.v)) continue;
    out.push({ s: 'Radio', k: p.k, v: p.v });
  }
  return out;
}
