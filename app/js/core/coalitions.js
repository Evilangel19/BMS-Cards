// @ts-check
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
// Hostile: a real team (not 0, "unknown") that is not a friend and, when the campaign gives the relations, is hostile (0), unfriendly (4) or at war (5) in either direction.
// A team that is neither a friend nor hostile (stance 3, neutral: in Korea the teams of China, Russia and often Japan) is neutral: not an enemy.
export const hostileOf = (C, x, y) => {
  if (!(x > 0 && y > 0) || allyOf(C, x, y)) return false;
  const s = C && C.stance;
  if (!s || !s[x] || !s[y]) return true;
  return [s[x][y], s[y][x]].some(v => v == 0 || v == 4 || v == 5);
};
export const neutralOf = (C, x, y) => x > 0 && y > 0 && !allyOf(C, x, y) && !hostileOf(C, x, y);
