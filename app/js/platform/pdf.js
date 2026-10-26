// Reads the text of a PDF with its positions (pdf.js, Apache-2.0, in ../../vendor/pdfjs). Used for the BMS AIP.
let lib = null;
async function load(base) {
  if (lib) return lib;
  lib = await import(new URL('../../vendor/pdfjs/pdf.min.mjs', base || import.meta.url).href);
  lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', base || import.meta.url).href;
  return lib;
}

// bytes: Uint8Array of the PDF -> [[{ s, x, y, w }]] one array per page
export async function pdfTextItems(bytes, { maxPages = 80 } = {}) {
  const pdfjs = await load();
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const t = await (await doc.getPage(p)).getTextContent();
    pages.push(
      t.items
        .filter(i => i.str && i.str.trim())
        .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
    );
  }
  await doc.destroy();
  return pages;
}

// Open a PDF for page-by-page rendering (call doc.destroy() when done).
export async function pdfOpen(bytes) {
  const pdfjs = await load();
  return pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise;
}
// Render one page (1-based) to a JPEG blob about maxH pixels tall. Nothing big stays in memory.
export async function pdfRender(doc, n, { maxH = 1700 } = {}) {
  const page = await doc.getPage(n),
    v1 = page.getViewport({ scale: 1 }),
    vp = page.getViewport({ scale: maxH / v1.height });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const x = canvas.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92)),
    w = canvas.width,
    h = canvas.height;
  canvas.width = canvas.height = 0;
  page.cleanup();
  return { blob, w, h };
}

// Draw one page (1-based) into a new canvas whose width is `width` device pixels (the height follows the page). Returns the canvas.
export async function pdfRenderTo(doc, n, { width = 800 } = {}) {
  const page = await doc.getPage(n),
    v1 = page.getViewport({ scale: 1 });
  const k = Math.min(width, 6000) / v1.width,
    vp = page.getViewport({ scale: k });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const x = canvas.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  page.cleanup();
  return canvas;
}
// Text of a page (joined), for labels.
export async function pdfPageText(doc, n) {
  const page = await doc.getPage(n),
    t = await page.getTextContent();
  page.cleanup();
  return t.items
    .map(i => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
