/**
 * Node-side mirror of vectorPdfExtract for tests (no canvas render, same
 * token/stat maths). Uses the pdf.js legacy build, which runs in Node.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageContentStats, TextToken } from './vectorPdf';

export interface NodeExtraction {
  tokens: TextToken[];
  stats: PageContentStats;
  layerNames: string[];
  pageCount: number;
}

export async function extractTokensNode(bytes: Uint8Array, pageNumber = 1): Promise<NodeExtraction> {
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try {
    let layerNames: string[] = [];
    try {
      const occ = await doc.getOptionalContentConfig();
      const groups = (occ as unknown as { getGroups?: () => Record<string, { name?: unknown }> })?.getGroups?.();
      if (groups) {
        layerNames = Object.values(groups)
          .map((g) => (typeof g?.name === 'string' ? g.name : String(g?.name ?? '')))
          .filter(Boolean);
      }
    } catch { /* none */ }

    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1600 / base.width });

    const tc = await page.getTextContent();
    const tokens: TextToken[] = [];
    for (const item of tc.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const m = pdfjs.Util.transform(viewport.transform, item.transform);
      const heightDev = Math.hypot(m[2], m[3]) || 0;
      tokens.push({
        text: item.str,
        xPct: Math.min(1, Math.max(0, m[4] / viewport.width)) * 100,
        yPct: Math.min(1, Math.max(0, (m[5] - heightDev / 2) / viewport.height)) * 100,
        height: heightDev,
      });
    }

    const opList = await page.getOperatorList();
    const OPS = pdfjs.OPS;
    let pathOpCount = 0;
    let imageOpCount = 0;
    for (const fn of opList.fnArray) {
      if ([OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.rectangle, OPS.stroke, OPS.fill, OPS.eoFill, OPS.constructPath].includes(fn)) pathOpCount++;
      if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(fn)) imageOpCount++;
    }
    const stats: PageContentStats = {
      textItemCount: tokens.length,
      pathOpCount,
      imageOpCount,
      imageCoverage: imageOpCount > 0 ? (tokens.length < 5 ? 0.9 : 0.4) : 0,
    };
    return { tokens, stats, layerNames, pageCount: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
