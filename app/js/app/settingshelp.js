// Settings > Help: the User Guide (app/help/guide.html, the same file the PDF is made from: tools/make-guide.mjs). The page shows the body of the guide
// with the style of the program (its own <style> is for the PDF and is not used here); "Save as PDF" writes the PDF made from it (app/help).
import { saveFileBytes } from '../platform/desktop.js';
import { appToast } from './base.js';

const DIR = 'help/';
export const GUIDE_PDF = 'BMS-Cards-Guide.pdf';
let HTML = null; // the body of the guide, read once

// the body of the guide, with the pictures pointed at the help folder
export async function guideHtml() {
  if (HTML) return HTML;
  const r = await fetch(DIR + 'guide.html');
  if (!r.ok) throw new Error('the guide was not found (' + r.status + ')');
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  doc.querySelectorAll('img[src]').forEach(i => i.setAttribute('src', DIR + i.getAttribute('src')));
  HTML = doc.body.innerHTML;
  return HTML;
}

// fills the page the first time it is shown
export async function helpFill(box) {
  if (!box || box.dataset.done) return;
  box.dataset.done = '1';
  try {
    box.innerHTML = await guideHtml();
  } catch (e) {
    box.dataset.done = '';
    box.innerHTML =
      '<p class="hint">The guide could not be read: ' + String(e.message || e).replace(/</g, '&lt;') + '</p>';
  }
}

// Save as PDF: the PDF of the guide where the pilot chooses
export async function helpPdf() {
  try {
    const r = await fetch(DIR + GUIDE_PDF);
    if (!r.ok) throw new Error('the PDF was not found (' + r.status + ')');
    const p = await saveFileBytes(new Uint8Array(await r.arrayBuffer()), GUIDE_PDF);
    if (p) appToast('Guide saved: ' + p);
  } catch (e) {
    appToast('The guide could not be saved: ' + (e.message || e));
  }
}
