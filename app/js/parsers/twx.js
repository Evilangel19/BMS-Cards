// @ts-check
// Weather/time file (.twx): int32 version, year, month, day, then campaign time (ms).
// The date is the campaign start date (day 1).
export function parseTwx(buffer) {
  const b = new DataView(buffer);
  if (b.byteLength < 20) throw new Error('Invalid .twx file');
  const year = b.getInt32(4, true),
    month = b.getInt32(8, true),
    day = b.getInt32(12, true),
    ms = b.getUint32(16, true);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31)
    throw new Error('Date not recognized in the .twx file');
  return { year, month, day, ms, iso: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) };
}
