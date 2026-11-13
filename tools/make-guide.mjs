// Makes the PDF of the User Guide from app/help/guide.html (the same file Settings > Help shows): node tools/make-guide.mjs
// Needs Playwright (Chromium). Run it after every change of the guide and commit the PDF with it.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  src = path.join(root, 'app/help/guide.html'),
  out = path.join(root, 'app/help/BMS-Cards-Guide.pdf');
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(src).href);
await p.waitForLoadState('networkidle');
await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await b.close();
console.log('written', path.relative(root, out));
