// Cluster bomb (CBU) damage data of BMS: Data\Sim\...\Bombdata\<name>.dat, listed in BombTypes.lst, read from the user's BMS folder.
// Model (cbuStrengthModel 1): the burst covers a circle of diameter min(cbuMaxDamageDiameter, burst altitude x cbuDamageDiameterBurstAltMultiplier);
// full effect at or below cbuLethalHeight, none at or above cbuIneffectiveHeight (taken as linear in between).

// one .dat file -> numbers, or null when it has no cluster data
export function parseBombDat(text) {
  const o = {};
  for (const l of String(text).split(/\r?\n/)) { const m = l.replace(/#.*/, '').trim().match(/^(\w+)\s+(-?[\d.]+)$/); if (m) o[m[1].toLowerCase()] = parseFloat(m[2]); }
  if (!('cbumaxdamagediameter' in o)) return null;
  return {lethalHeight: o.cbulethalheight, ineffectiveHeight: o.cbuineffectiveheight, mult: o.cbudamagediameterburstaltmultiplier, maxDiameter: o.cbumaxdamagediameter};
}

// BombTypes.lst: first line is the count, then one name per line
export const parseBombList = text => String(text).split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(1);

// {diameter ft, effect 0-1} for a burst at `alt` ft above the ground
export function cbuFootprint(d, alt) {
  if (!d || !(alt >= 0)) return null;
  const diameter = Math.min(d.maxDiameter, alt * d.mult), effect = alt <= d.lethalHeight ? 1 : alt >= d.ineffectiveHeight ? 0 : (d.ineffectiveHeight - alt) / (d.ineffectiveHeight - d.lethalHeight);
  return {diameter, effect};
}
