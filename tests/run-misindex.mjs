// Squadron > Missions (core/misindex.js): the virtual folders of the saved missions and the search and groups of the list. Small cases made here.
import {
  blankIndex,
  cleanIndex,
  addFolder,
  renameFolder,
  deleteFolder,
  moveTo,
  moveFolder,
  descendants,
  folderPath,
  tree,
  prune,
  metaOf,
  matches,
  groupBy,
  folderOf,
} from '../app/js/core/misindex.js';

let n = 0,
  bad = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    bad++;
    console.error('FAIL', m);
  }
};

const ix = blankIndex(),
  korea = addFolder(ix, 'Korea'),
  w1 = addFolder(ix, 'Week 1', korea),
  w2 = addFolder(ix, 'Week 2', korea),
  bal = addFolder(ix, 'Balkans');
ok(new Set([korea, w1, w2, bal]).size == 4, 'four folders, four ids');
ok(folderPath(ix, w1) == 'Korea / Week 1', 'the path of a folder');
ok(
  tree(ix)
    .map(f => f.name + f.depth)
    .join() == 'Balkans0,Korea0,Week 11,Week 21',
  'the tree in order, by name'
);
moveTo(ix, ['M1', 'M2'], w1);
moveTo(ix, ['M3'], korea);
ok(
  folderOf(ix, 'M1') == w1 && folderOf(ix, 'M3') == korea && folderOf(ix, 'M9') == null,
  'missions moved into folders; the others are unfiled'
);
ok([...descendants(ix, korea)].sort().join() == [w1, w2].sort().join(), 'the folders inside Korea');
ok(
  !moveFolder(ix, korea, w1) && moveFolder(ix, w2, bal) && folderPath(ix, w2) == 'Balkans / Week 2',
  'a folder never goes into its own folder; it can go into another'
);
ok(
  renameFolder(ix, bal, '  Balkans 2026 ') && folderPath(ix, w2) == 'Balkans 2026 / Week 2',
  'renamed (spaces taken away)'
);
deleteFolder(ix, korea);
ok(
  folderOf(ix, 'M3') == null && folderOf(ix, 'M1') == w1 && ix.folders.find(f => f.id == w1).parent == null,
  'a folder deleted: its missions and folders go up one level'
);
moveTo(ix, ['M4'], 'nope');
ok(folderOf(ix, 'M4') == null, 'a folder that does not exist: unfiled');
ok(prune(ix, ['M1', 'M2']) && !ix.items.M3 && ix.items.M1, 'the missions gone from the disk leave the index');

// a damaged index: a parent that is gone, a loop, a bad item
const c = cleanIndex({
  folders: [
    { id: 'a', name: 'A', parent: 'b' },
    { id: 'b', name: 'B', parent: 'a' },
    { id: 'c', name: 'C', parent: 'zz' },
    { id: 7, name: 'bad' },
  ],
  items: { X: { folder: 'c', size: 10 }, Y: 'bad', Z: { folder: 'gone' } },
});
ok(c.folders.length == 3 && c.folders.find(f => f.id == 'c').parent == null, 'a parent that is gone: at the top');
ok(
  c.folders.some(f => f.parent == null && (f.id == 'a' || f.id == 'b')),
  'a loop of parents is cut'
);
ok(c.items.X.folder == 'c' && !c.items.Y && c.items.Z.folder == null, 'the items made safe');
ok(cleanIndex('rubbish').folders.length == 0, 'a file that is not an index: empty');

// what is shown of a mission
const me = metaOf({
  created: '2026-10-02T10:00:00Z',
  theater: { name: 'Korea KTO' },
  squadron: '35th FS',
  osquad: 'Vipers VA',
  datacard: { label: 'Falcon 2 · F-16C x4 · Strike · 10:18:08', final: { mis: 'Tiger Spirit', cs: 'Falcon 2' } },
});
ok(
  me.campaign == 'Tiger Spirit' &&
    me.squadron == '35th FS' &&
    me.osquad == 'Vipers VA' &&
    me.callsign == 'Falcon 2' &&
    me.kind == 'Strike',
  'the meta of a mission'
);
const L = [
  { label: 'A', meta: me },
  {
    label: 'B',
    meta: { ...me, campaign: 'Balkan Fire', created: '2026-11-01T09:00:00Z', squadron: '' },
    squad: '104 Ciola',
  },
  { label: 'C', meta: { created: '' } },
];
ok(
  matches(L[0], 'tiger falcon') && !matches(L[0], 'tiger eagle') && matches(L[1], 'ciola'),
  'the search: every word, the sender squadron too'
);
ok(
  groupBy(L, 'campaign')
    .map(g => g.label)
    .join() == 'Balkan Fire,Tiger Spirit,Campaign not known',
  'by campaign, the unknown last'
);
ok(
  groupBy(L, 'squadron')
    .map(g => g.label)
    .join() == '104 Ciola,Vipers VA,Personal / no squadron',
  'by squadron: the online squadron that sent it, else the one of the player when it was saved'
);
ok(
  groupBy(L, 'date')
    .map(g => g.label)
    .join() == 'November 2026,October 2026,Date not known',
  'by month, newest first'
);

if (bad) {
  console.error(`run-misindex.mjs: ${bad} of ${n} checks FAILED`);
  process.exit(1);
}
console.log(`run-misindex.mjs: OK - ${n} checks`);
