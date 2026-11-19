// @ts-check
// The view (centre and zoom) a page leaves the lent map in, kept for when the page takes the map back (another tab, then this one again): the map
// comes back as it was left, unless what the page shows changed (its key: the flight, the target...), then the page fits it again.
export function mapKeep() {
  /** @type {{c: any, z: number, k: string} | null} */
  let v = null;
  return {
    /** the view of the map as the page leaves it */
    save(map, k) {
      try {
        v = { c: map.getCenter(), z: map.getZoom(), k: String(k) };
      } catch (e) {
        v = null;
      }
    },
    /** the view put back when the key is the same: true, else false (the page fits the map) */
    restore(map, k) {
      if (!v || v.k !== String(k)) return false;
      try {
        map.invalidateSize();
        map.setView(v.c, v.z, { animate: false });
        return true;
      } catch (e) {
        return false;
      }
    },
  };
}
