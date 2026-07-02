// Reconnaissance probe: print what the read pipeline would see in a PDF.
// Usage: node scripts/probe.mjs <file.pdf> [pageNum]
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , path, pageArg] = process.argv;
const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
console.log(`pages=${doc.numPages}`);

let layerNames = [];
try {
  const occ = await doc.getOptionalContentConfig();
  const groups = occ?.getGroups?.();
  if (groups) layerNames = Object.values(groups).map((g) => String(g?.name ?? '')).filter(Boolean);
} catch {}
console.log(`layers=${JSON.stringify(layerNames)}`);

const pages = pageArg ? [Number(pageArg)] : Array.from({ length: doc.numPages }, (_, i) => i + 1);
for (const pn of pages) {
  const page = await doc.getPage(pn);
  const tc = await page.getTextContent();
  const tokens = tc.items.filter((it) => it.str && it.str.trim());
  const opList = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  let pathOps = 0, imgOps = 0;
  for (const fn of opList.fnArray) {
    if ([OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.rectangle, OPS.stroke, OPS.fill, OPS.eoFill, OPS.constructPath].includes(fn)) pathOps++;
    if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(fn)) imgOps++;
  }
  const texts = tokens.map((t) => t.str.trim());
  const numeric = texts.filter((s) => /^\d{1,3}[A-Za-z]?$/.test(s));
  console.log(`\n--- page ${pn}: text=${tokens.length} pathOps=${pathOps} imgOps=${imgOps}`);
  console.log(`numericTokens(${numeric.length}): ${numeric.slice(0, 60).join(',')}`);
  console.log(`sampleText: ${texts.slice(0, 40).join(' | ').slice(0, 600)}`);
}
await doc.destroy();
