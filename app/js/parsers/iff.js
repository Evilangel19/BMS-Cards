// IFF policy (.iff): per team, rotation settings and ProfileMissionN codes (4-digit strings).
export function parseIff(text) {
  const m = {};
  text.split(/\[IFF Policy Team (\d)\]/).forEach((b, i, a) => {
    if (i > 0 && i % 2 == 0) {
      const o = { pm: {} };
      b.split(/\r?\n/).forEach(l => {
        const q = l.match(/^\s*(\w+)\s*=\s*(\d+)/);
        if (!q) return;
        const pm = q[1].match(/^ProfileMission(\d+)$/);
        if (pm) o.pm[+pm[1]] = q[2].padStart(4, '0');
        else o[q[1]] = +q[2];
      });
      m[+a[i - 1]] = o;
    }
  });
  return m;
}
