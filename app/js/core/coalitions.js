// Who is friend and who is foe, from the team relations of the campaign (.tea). One rule for the whole program (map, ATO, datacard support data).
// Relations (.tea): 0 hostile, 1 allied, 2 friendly, 3 neutral, 4 unfriendly, 5 at war.
// Same rule as the ATO: teams are friends when their stance (either direction) is 1 or 2.
// Without the relations of the campaign (old files): teams 1-3 stand together, as in the Korea campaigns.
export const allyOf = (C, x, y) => {
  if (x == y) return true;
  const s = C && C.stance;
  if (!s || !s[x] || !s[y]) return x > 0 && y > 0 && x < 4 && y < 4;
  return [s[x][y], s[y][x]].some(v => v == 1 || v == 2);
};
// Hostile: a real team (not 0, "unknown") that is not a friend.
export const hostileOf = (C, x, y) => x > 0 && y > 0 && !allyOf(C, x, y);
