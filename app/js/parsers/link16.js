// @ts-check
// Link 16 STN table (.l16.txtpb / F-16*.txtpb): flight number -> STN (octal), F2F and mission channels.
export function parseLink16(text) {
  const m = {};
  for (const r of text.matchAll(
    /flight_number:\s*(\d+)\s*stn_number:\s*(\d+)\s*f2f_channel:\s*(-?\d+)\s*mission_channel:\s*(-?\d+)/g
  ))
    if (/^[0-7]+$/.test(r[2])) m[+r[1]] = { s: r[2], fc: +r[3], mc: +r[4] };
  return m;
}
