"""Reads the blank MDC (BLANK_MDC.xlsm of the Falcon BMS Docs folder, used with the permission of its author) and writes the geometry of its cells
(in the pixels of the 2048 x 2048 kneeboard picture of the game) to app/js/data/mdcgeom.js. Only measures are kept: no image, no text of the PDF.
Usage: python3 tools/mdc-geometry.py BLANK_MDC.xlsm BLANK_MDC_page.png app/js/data/mdcgeom.js
(the png is the PDF of the blank rendered at 200 dpi, e.g. pdftoppm -r 200 -png BLANK_MDC.pdf page: only the fill colours of the cells are read from it)"""
import openpyxl, re, json, sys, zipfile
from PIL import Image
import numpy as np
from openpyxl.utils import get_column_letter as L
XL, PDF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
z = zipfile.ZipFile(XL); s = z.read('xl/worksheets/sheet1.xml').decode()
cw = {}
for a, b, w in re.findall(r'<col min="(\d+)" max="(\d+)" width="([\d.]+)"', s):
    for i in range(int(a), int(b) + 1): cw[i] = float(w)
rh = {int(r): float(h) for r, h in re.findall(r'<row r="(\d+)"[^>]* ht="([\d.]+)"', s)}
NC, NR = 46, 62
cx = [0]
for i in range(1, NC + 1): cx.append(cx[-1] + cw.get(i, 9.1328125) * 7)
cy = [0]
# the rows of the original have slightly different heights (15.95 .. 21.4): from the third row on they are all the same, so the cells of the two pages line up
for r in range(1, NR + 1): cy.append(cy[-1] + (rh.get(r, 20.1) if r <= 2 else 20.1) * 4 / 3)
# DDS box: page 1 = columns A..AB -> x 11..994, page 2 = AD..AT -> 1049..2035; rows 1..62 -> y 209..2044
def X(c):  # c = column boundary index 0..46 (left edge of column c+1)
    if c <= 28: return 11 + (cx[c] - cx[0]) / (cx[28] - cx[0]) * (994 - 11)
    if c >= 29: return 1049 + (cx[c] - cx[29]) / (cx[46] - cx[29]) * (2035 - 1049)
    return None
def Y(r): return 209 + cy[r] / cy[NR] * (2044 - 209)
def XX(c):
    if c == 28.5: return None
    return X(c)
wb = openpyxl.load_workbook(XL); ws = wb.active
# raster of the PDF to sample the fill colours: dark/grey/yellow cells
pdfpng = PDF
img = np.array(Image.open(pdfpng).convert('RGB'))
H, W = img.shape[:2]
dark = img.sum(2) < 300
xs = np.where(dark.sum(0) > 0)[0]; ys = np.where(dark.sum(1) > 0)[0]
px0, px1, py0, py1 = xs.min(), xs.max(), ys.min(), ys.max()
# the PDF has the same layout: map sheet units to the raster with the same two-page rule (page 1 left edge .. page 2 right edge)
def sample(c0, r0, c1, r1):
    # unit position inside the raster (linear on the sheet units, edge to edge)
    ux = lambda c: px0 + (cx[c] / cx[46]) * (px1 - px0)
    uy = lambda r: py0 + (cy[r] / cy[NR]) * (py1 - py0)
    a = [int(ux(c0) + 4), int(uy(r0) + 4)]
    p = img[min(a[1], H - 1), min(a[0], W - 1)]
    return '#%02x%02x%02x' % tuple(p)
merged = {}
for m in ws.merged_cells.ranges: merged[(m.min_row, m.min_col)] = (m.max_row, m.max_col)
inmerge = set()
for (r, c), (r2, c2) in merged.items():
    for rr in range(r, r2 + 1):
        for cc in range(c, c2 + 1):
            if (rr, cc) != (r, c): inmerge.add((rr, cc))
rects = []
bw = lambda sd: {None: 0, 'thin': 1, 'hair': 1, 'dotted': 1, 'dashed': 1, 'medium': 2, 'thick': 3, 'double': 3}.get(sd.style, 1) if sd is not None else 0
def border_of(r, c, r2, c2):
    cell = ws.cell(r, c); cell2 = ws.cell(r2, c2)
    b = cell.border; b2 = cell2.border
    # neighbours may hold the shared edge
    l = max(bw(b.left), bw(ws.cell(r, c - 1).border.right) if c > 1 else 0)
    t = max(bw(b.top), bw(ws.cell(r - 1, c).border.bottom) if r > 1 else 0)
    rr = max(bw(b2.right), bw(ws.cell(r2, c2 + 1).border.left) if c2 < 47 else 0)
    bb = max(bw(b2.bottom), bw(ws.cell(r2 + 1, c2).border.top))
    return [l, t, rr, bb]
for r in range(1, NR + 1):
    for c in range(1, NC + 1):
        if (r, c) in inmerge: continue
        r2, c2 = merged.get((r, c), (r, c))
        cell = ws.cell(r, c)
        bd = border_of(r, c, r2, c2)
        v = cell.value
        fillc = sample(c - 1, r - 1, c2, r2)
        has = v not in (None, '') or any(bd) or fillc.lower() not in ('#ffffff',)
        if not has: continue
        f = cell.font; al = cell.alignment
        col = None
        try:
            if f.color is not None and isinstance(f.color.rgb, str): col = '#' + f.color.rgb[2:]
        except Exception: pass
        rects.append(dict(a=cell.coordinate, c0=c, r0=r, c1=c2, r1=r2,
            x0=round(XX(c - 1), 1), x1=round(XX(c2), 1), y0=round(Y(r - 1), 1), y1=round(Y(r2), 1),
            fill=fillc, b=bd, t=str(v) if v is not None else '', sz=f.sz, bold=bool(f.b), it=bool(f.i), col=col,
            ha=al.horizontal, va=al.vertical, wrap=bool(al.wrap_text), rot=al.textRotation))

def norm(c):
    r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    return '' if min(r, g, b) >= 0xe8 else c
out = []
for q in rects:
    t = q['t']
    if t.startswith('='): t = ''
    if q['a'] in ('B40', 'B41'): t = ''  # a letter written in white on white: not part of the printed form
    out.append([q['a'], q['x0'], q['y0'], q['x1'], q['y1'], norm(q['fill']), *q['b'], t, q['sz'] or 0, int(q['bold']), int(q['it']),
                q['ha'] or '', q['va'] or '', int(q['wrap']), q['rot'] or 0, q['col'] or ''])
with open(OUT, 'w') as f:
    f.write('// Generated by tools/mdc-geometry.py from the blank MDC (used with the permission of its author, see CREDITS.md): only the measures of the cells.\n')
    f.write('// [cell, x0, y0, x1, y1, fill, border left, top, right, bottom (0 none, 1 thin, 2 medium, 3 thick), text, size pt, bold, italic, h-align, v-align, wrap, rotation, colour]\n')
    f.write('export default [\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in out) + '\n];\n')
print(len(out), 'cells')
