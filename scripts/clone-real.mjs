// Clone a real CAD-exported site layout into a synthetic, shareable demo PDF.
// Reads the source drawing's page size, "Plot N" label positions and CAD layer
// names, then redraws everything else from scratch (no copyrighted linework or
// title-block details are copied).
// Usage: node scripts/clone-real.mjs <real.pdf> <out.pdf>
import fs from 'node:fs';
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , srcPath, outPath] = process.argv;

// ── read the real drawing ──────────────────────────────────────────────────
const data = new Uint8Array(fs.readFileSync(srcPath));
const src = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
const page1 = await src.getPage(1);
const vp = page1.getViewport({ scale: 1 });
const W = vp.width, H = vp.height;

let layerNames = [];
try {
  const occ = await src.getOptionalContentConfig();
  const groups = occ?.getGroups?.();
  if (groups) layerNames = Object.values(groups).map((g) => String(g?.name ?? '')).filter(Boolean);
} catch {}

const tc = await page1.getTextContent();
const plotLabels = [];
for (const item of tc.items) {
  const s = (item.str ?? '').trim();
  const m = /^plot\s*[-–]?\s*(\d{1,3}[A-Za-z]?)$/i.exec(s);
  if (m && item.transform) {
    const t = pdfjs.Util.transform(vp.transform, item.transform);
    plotLabels.push({ number: m[1], xDev: t[4], yDev: t[5] });
  }
}
await src.destroy();
console.log(`source: ${W.toFixed(0)}x${H.toFixed(0)}pt, plots=${JSON.stringify(plotLabels.map(p => p.number))}, layers=${layerNames.length}`);

// ── synthesise the clone ───────────────────────────────────────────────────
const doc = await PDFDocument.create();
const page = doc.addPage([W, H]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const grey = rgb(0.45, 0.45, 0.45);
const dark = rgb(0.15, 0.15, 0.18);

// Road corridor sweeping past the plots (generic geometry).
const roadY = H * 0.28;
for (const off of [0, 22]) {
  page.drawLine({ start: { x: W * 0.05, y: roadY + off }, end: { x: W * 0.72, y: roadY + off }, thickness: 1.2, color: dark });
}
page.drawLine({ start: { x: W * 0.05, y: roadY + 11 }, end: { x: W * 0.72, y: roadY + 11 }, thickness: 0.5, color: grey, dashArray: [6, 4] });
// Kerbs/footpath + boundary noise lines.
for (let i = 0; i < 60; i++) {
  const x = W * (0.05 + 0.7 * (i / 60));
  page.drawLine({ start: { x, y: roadY - 6 }, end: { x: x + 6, y: roadY - 6 }, thickness: 0.4, color: grey });
}
page.drawRectangle({ x: W * 0.05, y: H * 0.12, width: W * 0.9, height: H * 0.8, borderWidth: 0.8, borderColor: grey });

// Plots at the REAL label positions: boundary, footprint, drive, label.
for (const p of plotLabels) {
  const x = p.xDev, y = H - p.yDev; // device (top-left) → PDF (bottom-left)
  page.drawRectangle({ x: x - 55, y: y - 30, width: 150, height: 105, borderWidth: 0.9, borderColor: dark });
  page.drawRectangle({ x: x - 30, y: y + 6, width: 85, height: 52, borderWidth: 1.1, borderColor: dark });
  page.drawRectangle({ x: x + 8, y: y - 28, width: 26, height: 30, borderWidth: 0.6, borderColor: grey }); // drive
  page.drawText(`Plot ${p.number}`, { x, y, size: 12, font: bold, color: dark });
}

// Scale bar — deliberately kept: real drawings carry these bare numbers.
const sbx = W * 0.06, sby = H * 0.06;
['0m', '5', '10', '15', '20m'].forEach((s, i) => {
  page.drawLine({ start: { x: sbx + i * 30, y: sby }, end: { x: sbx + i * 30, y: sby + 6 }, thickness: 0.8, color: dark });
  page.drawText(s, { x: sbx + i * 30 - 4, y: sby + 9, size: 7, font, color: dark });
});
page.drawLine({ start: { x: sbx, y: sby }, end: { x: sbx + 120, y: sby }, thickness: 0.8, color: dark });

// Services KEY block.
const keyX = W - 175, keyTop = H - 60;
page.drawRectangle({ x: keyX - 10, y: keyTop - 118, width: 165, height: 132, borderWidth: 0.8, borderColor: dark });
page.drawText('KEY', { x: keyX, y: keyTop, size: 10, font: bold, color: dark });
const key = [
  ['Foul Drainage', rgb(0.55, 0.32, 0.04)],
  ['Surface Water', rgb(0.12, 0.47, 0.71)],
  ['Potable Water', rgb(0.2, 0.63, 0.17)],
  ['Electric', rgb(1.0, 0.5, 0.0)],
  ['Street Lighting', rgb(0.42, 0.24, 0.6)],
];
key.forEach(([label, color], i) => {
  const y = keyTop - 18 - i * 18;
  page.drawLine({ start: { x: keyX, y: y + 3 }, end: { x: keyX + 28, y: y + 3 }, thickness: 2, color });
  page.drawText(label, { x: keyX + 34, y, size: 8, font, color: dark });
});

// Neutral title block (no details copied from the source drawing).
page.drawRectangle({ x: W - 250, y: 18, width: 232, height: 64, borderWidth: 0.8, borderColor: dark });
page.drawText('DEMO SITE LAYOUT', { x: W - 240, y: 62, size: 11, font: bold, color: dark });
page.drawText('Synthetic clone of a public planning drawing', { x: W - 240, y: 48, size: 7, font, color: grey });
page.drawText('Geometry redrawn — for Site Programme Viewer testing', { x: W - 240, y: 38, size: 7, font, color: grey });
page.drawText('SITE PLAN 1:200 @ A3', { x: W - 240, y: 26, size: 8, font, color: dark });

// CAD layers: reuse the real drawing's generic layer names as OCGs.
if (layerNames.length) {
  const ctx = doc.context;
  const refs = layerNames.map((n) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(n) })));
  doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: refs, D: ctx.obj({ Order: refs, ON: refs }) }));
}

fs.writeFileSync(outPath, await doc.save());
console.log(`clone written: ${outPath} (${fs.statSync(outPath).size} bytes)`);
