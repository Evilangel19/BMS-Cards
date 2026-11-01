// The file permissions of the desktop program (src-tauri/capabilities/default.json): writing is allowed only for the kinds of files the program makes,
// and the dangerous kinds stay blocked even if someone widens the allow list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cap = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'));
let n = 0,
  bad = 0;
const ok = (name, c) => {
  n++;
  if (!c) {
    bad++;
    console.log('FAIL ' + name);
  }
};
// a Tauri scope glob, case-insensitive classes like [jJ] included, as a regular expression (enough for the patterns used here)
const rx = g =>
  new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\*\*\//g, '\u0001')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0001/g, '(?:.*/)?') +
      '$'
  );
const hit = (list, p) => (list || []).some(x => rx(x.path).test(p));
for (const id of ['fs:allow-write-file', 'fs:allow-write-text-file']) {
  const e = cap.permissions.find(x => x && x.identifier == id);
  ok(id + ' is there', !!e);
  const can = p => hit(e.allow, p) && !hit(e.deny, p);
  for (const f of [
    'C:/BMS/User/Config/Evil.ini',
    'C:/BMS/User/Config/Textures/KneeBoard/kb_01.DDS',
    'D:/app/config.json',
    'D:/app/cardmemory/cards/01_x.png',
    'D:/app/missions/m/m.bcrd',
    'D:/app/write-test.tmp',
  ])
    ok(id + ' allows ' + f, can(f));
  for (const f of [
    'C:/Users/x/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/a.ini',
    'C:/x/run.exe',
    'C:/x/a.BAT',
    'C:/x/a.js',
    'C:/x/a.hta',
    'C:/x/a.py',
    'C:/x/a.pyw',
    'C:/x/a.scf',
    'C:/x/a.html',
    'C:/x/noext',
    'C:/Users/x/.ssh/config.json',
  ])
    ok(id + ' refuses ' + f, !can(f));
}
console.log('run-capabilities.mjs: ' + (bad ? bad + ' of ' + n + ' FAILED' : 'OK - ' + n + ' permission checks'));
process.exit(bad ? 1 : 0);
