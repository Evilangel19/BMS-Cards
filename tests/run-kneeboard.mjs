import {
  KB_SETS,
  setFor,
  parsePages,
  rowFile,
  fitRect,
  rowUsed,
  DEFAULT_SLOTS,
  autoDir,
  ROWS,
} from '../app/js/core/kneeboard.js';
let bad = 0,
  n = 0;
const ok = (m, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
ok(
  'F-16 files by default and for an F-16',
  setFor('').first === 7982 && setFor('4 F-16C-52 ROK').first === 7982 && setFor('2 F-16A-15').id === 'f16'
);
ok(
  'F-15 files 1403 to 1418',
  setFor('4 F-15C').first === 1403 &&
    rowFile(0, setFor('2 F-15E')) === '1403.dds' &&
    rowFile(15, setFor('F-15C')) === '1418.dds'
);
ok(
  'an aircraft without a set of its own gets the F-16 ones',
  setFor('4 F/A-18C').id === 'f16' && setFor('2 AV-8B').id === 'f16'
);
ok(
  'the sets do not overlap and each has 16 files',
  KB_SETS.every((a, i) => KB_SETS.every((b, j) => i === j || a.first + 15 < b.first || b.first + 15 < a.first))
);
ok('first and last file', rowFile(0) === '7982.dds' && rowFile(15) === '7997.dds' && ROWS === 16);
const f = fitRect(612, 792, 'fit');
ok(
  'fit stays inside the page and centred',
  f.x >= 0 &&
    f.y >= 0 &&
    f.x + f.w <= 1024.001 &&
    f.y + f.h <= 2048.001 &&
    Math.abs(f.x * 2 + f.w - 1024) < 1e-6 &&
    Math.abs(f.y * 2 + f.h - 2048) < 1e-6
);
const g = fitRect(800, 1200, 'fit');
ok('2:3 picture fills the page exactly', g.w === 1024 && g.h === 2048 && g.x === 0 && g.y === 0);
const h = fitRect(1000, 500, 'fit');
ok('wide picture touches the sides', h.w === 1024 && h.h < 2048);
ok(
  'fill covers the page',
  JSON.stringify(fitRect(10, 10, 'fill')) === JSON.stringify({ x: 0, y: 0, w: 1024, h: 2048 })
);
const s = DEFAULT_SLOTS();
ok('default: datacard in row 1', s[0].left.kind === 'dcl' && s[0].right.kind === 'dcr' && s[1].left.kind === 'empty');
ok(
  'only used rows are written',
  rowUsed(s[0], 0) && !rowUsed(s[1], 1) && rowUsed({ left: { kind: 'pic' }, right: { kind: 'empty' } }, 3)
);
ok(
  'auto folder',
  autoDir((a, b) => a + '\\' + b, 'C:\\BMS') === 'C:\\BMS\\Data\\TerrData\\Objects\\KoreaObj' &&
    autoDir(() => '', '') === ''
);
ok(
  'pages: list and ranges',
  JSON.stringify(parsePages('1-3, 5, 7-8', 20).pages) === '[1,2,3,5,7,8]' &&
    JSON.stringify(parsePages('3-1', 20).pages) === '[1,2,3]'
);
ok('pages: duplicates removed', JSON.stringify(parsePages('1-3,2-4', 20).pages) === '[1,2,3,4]');
ok(
  'pages: errors',
  parsePages('0', 20).error &&
    parsePages('21', 20).error &&
    parsePages('a', 20).error &&
    parsePages('', 20).error &&
    parsePages('1-50', 100, 40).error
);
console.log(bad ? `${bad} of ${n} kneeboard checks failed` : `OK - ${n} kneeboard checks`);
process.exit(bad ? 1 : 0);
