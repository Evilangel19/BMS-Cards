// @ts-check
// Squadron > Missions: the saved missions put in order. The folders are virtual: they live in the index of the missions folder (missions/index.json),
// the folders of the missions on the disk never move (sending, receiving, the data move and Load keep finding them). The index also keeps what is
// shown of each mission (campaign, theater, squadron, callsign, kind, date), read once from its file, so that a long list opens at once.
// index: {v: 1, folders: [{id, name, parent (id or null)}], items: {[mission folder name]: {folder (id or null), size, meta, from, squad}}}

export const blankIndex = () => ({ v: 1, folders: [], items: {} });

/** an index read from the disk, made safe (a damaged one becomes empty, a folder whose parent is gone goes to the top) */
export function cleanIndex(o) {
  const ix = blankIndex();
  if (!o || typeof o != 'object') return ix;
  const F = Array.isArray(o.folders) ? o.folders : [];
  F.forEach(f => {
    if (f && typeof f.id == 'string' && typeof f.name == 'string' && !ix.folders.some(g => g.id == f.id))
      ix.folders.push({ id: f.id, name: f.name.slice(0, 80), parent: typeof f.parent == 'string' ? f.parent : null });
  });
  ix.folders.forEach(f => {
    if (f.parent && (f.parent == f.id || !ix.folders.some(g => g.id == f.parent))) f.parent = null;
  });
  // a loop of parents (a damaged file) is cut at the top
  ix.folders.forEach(f => {
    const seen = new Set([f.id]);
    let p = f.parent;
    while (p) {
      if (seen.has(p)) {
        f.parent = null;
        break;
      }
      seen.add(p);
      p = (ix.folders.find(g => g.id == p) || { parent: null }).parent;
    }
  });
  if (o.items && typeof o.items == 'object')
    for (const [k, v] of Object.entries(o.items)) {
      if (!v || typeof v != 'object') continue;
      ix.items[k] = {
        folder: typeof v.folder == 'string' && ix.folders.some(f => f.id == v.folder) ? v.folder : null,
        size: typeof v.size == 'number' ? v.size : -1,
        meta: v.meta && typeof v.meta == 'object' ? v.meta : null,
        from: typeof v.from == 'string' ? v.from : '',
        squad: typeof v.squad == 'string' ? v.squad : '',
      };
    }
  return ix;
}
const item = (ix, k) => ix.items[k] || (ix.items[k] = { folder: null, size: -1, meta: null, from: '', squad: '' });
export const folderOf = (ix, k) => (ix.items[k] && ix.items[k].folder) || null;

/** a new folder (in parent, or at the top); returns its id */
export function addFolder(ix, name, parent = null) {
  let n = ix.folders.length + 1,
    id = 'f' + n;
  while (ix.folders.some(f => f.id == id)) id = 'f' + ++n;
  ix.folders.push({
    id,
    name: String(name).trim().slice(0, 80) || 'New folder',
    parent: parent && ix.folders.some(f => f.id == parent) ? parent : null,
  });
  return id;
}
export function renameFolder(ix, id, name) {
  const f = ix.folders.find(g => g.id == id);
  if (f && String(name).trim()) f.name = String(name).trim().slice(0, 80);
  return !!f;
}
/** a folder deleted: its missions and its folders go up one level (to the top: "Unfiled"); nothing is deleted from the disk */
export function deleteFolder(ix, id) {
  const f = ix.folders.find(g => g.id == id);
  if (!f) return false;
  ix.folders.forEach(g => {
    if (g.parent == id) g.parent = f.parent;
  });
  Object.values(ix.items).forEach(it => {
    if (it.folder == id) it.folder = f.parent;
  });
  ix.folders = ix.folders.filter(g => g.id != id);
  return true;
}
/** missions (their folder names) moved into a folder (null: Unfiled) */
export function moveTo(ix, keys, fid) {
  const to = fid && ix.folders.some(f => f.id == fid) ? fid : null;
  keys.forEach(k => (item(ix, k).folder = to));
}
/** a folder moved into another one (never into itself or one of its own folders) */
export function moveFolder(ix, id, parent) {
  const f = ix.folders.find(g => g.id == id);
  if (!f || (parent && (parent == id || descendants(ix, id).has(parent)))) return false;
  f.parent = parent && ix.folders.some(g => g.id == parent) ? parent : null;
  return true;
}
/** the folders inside a folder, at any depth */
export function descendants(ix, id) {
  const out = new Set();
  let add = [id];
  while (add.length) {
    const nx = ix.folders.filter(f => add.includes(f.parent) && !out.has(f.id)).map(f => f.id);
    nx.forEach(i => out.add(i));
    add = nx;
  }
  return out;
}
/** the names from the top to the folder ("Korea / Week 1") */
export function folderPath(ix, id) {
  const p = [];
  let f = ix.folders.find(g => g.id == id);
  while (f && p.length < 20) {
    p.unshift(f.name);
    f = ix.folders.find(g => g.id == f.parent);
  }
  return p.join(' / ');
}
/** the folders in tree order: [{id, name, depth}] (by name inside each level) */
export function tree(ix) {
  const out = [],
    walk = (parent, depth) =>
      ix.folders
        .filter(f => f.parent == parent)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(f => {
          out.push({ id: f.id, name: f.name, depth });
          walk(f.id, depth + 1);
        });
  walk(null, 0);
  return out;
}
/** the missions that are no longer on the disk leave the index; true when something changed */
export function prune(ix, keys) {
  const have = new Set(keys);
  let ch = false;
  for (const k of Object.keys(ix.items))
    if (!have.has(k)) {
      delete ix.items[k];
      ch = true;
    }
  return ch;
}

/** what the list shows of a mission, from its file (a mission object) */
export function metaOf(o) {
  const dc = (o && o.datacard) || {},
    fin = dc.final || {},
    lab = String(dc.label || ''),
    p = lab.split(' · ');
  return {
    created: typeof o.created == 'string' ? o.created : '',
    campaign: String(fin.mis || (o.package && o.package.name) || ''),
    theater: String((o.theater && o.theater.name) || ''),
    squadron: String(o.squadron || ''),
    osquad: String(o.osquad || ''),
    callsign: String(fin.cs || p[0] || ''),
    kind: String((p[2] || '').trim()),
    flight: lab,
  };
}

// ---- the list: search and groups
/** a mission matches the text: every word in its name, campaign, theater, squadron, callsign, kind, sender or folder */
export function matches(m, q, folderName = '') {
  const w = String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!w.length) return true;
  const me = m.meta || {},
    t = [m.label, me.campaign, me.theater, me.squadron, me.callsign, me.kind, me.flight, m.from, m.squad, folderName]
      .join(' ')
      .toLowerCase();
  return w.every(x => t.includes(x));
}
/**
 * groups of missions: by campaign, squadron (the online squadron of the player: the one that sent it, else the one chosen when it was saved) or date (month); newest first inside
 * @returns {{key: string, label: string, items: any[]}[]}
 */
export function groupBy(list, by) {
  const key = m => {
      const me = m.meta || {};
      if (by == 'campaign') return me.campaign || me.theater || '';
      if (by == 'squadron') return m.squad || me.osquad || '';
      const d = me.created || m.created || '';
      return d && !isNaN(Date.parse(d)) ? new Date(d).toISOString().slice(0, 7) : '';
    },
    none =
      { campaign: 'Campaign not known', squadron: 'Personal / no squadron', date: 'Date not known' }[by] || 'Other',
    M = new Map();
  list.forEach(m => {
    const k = key(m);
    if (!M.has(k)) M.set(k, []);
    M.get(k).push(m);
  });
  const month = k => {
    const [y, mo] = k.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  return [...M.entries()]
    .map(([k, items]) => ({ key: k, label: !k ? none : by == 'date' ? month(k) : k, items }))
    .sort((a, b) =>
      !a.key ? 1 : !b.key ? -1 : by == 'date' ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label)
    );
}
