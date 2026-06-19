/**
 * pdf.js-backed extraction for a single PDF page. Kept apart from vectorPdf.ts
 * so the pure logic stays testable in Node. pdf.js is dynamically imported so
 * it is code-split out of the initial bundle.
 */
import type { PageContentStats, TextToken } from './vectorPdf';

export interface VectorExtraction {
  stats: PageContentStats;
  tokens: TextToken[];
  /** The page rasterised to PNG, to use as the plan image (markers overlay it). */
  pageImageDataUrl: string;
  pageWidthPx: number;
  pageHeightPx: number;
  pageCount: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export async function extractFromPdf(file: File, pageNumber = 1): Promise<VectorExtraction> {
  const pdfjs = await import('pdfjs-dist');
  // Vite resolves the worker file URL at build time.
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(pageNumber);

    // Render at ~1600px wide for a legible plan image.
    const base = page.getViewport({ scale: 1 });
    const scale = 1600 / base.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const pageImageDataUrl = canvas.toDataURL('image/png');

    // Text tokens with positions in device space → percentages.
    const textContent = await page.getTextContent();
    const tokens: TextToken[] = [];
    for (const item of textContent.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const m = pdfjs.Util.transform(viewport.transform, item.transform);
      const xDev = m[4];
      const yDev = m[5];
      const heightDev = Math.hypot(m[2], m[3]) || 0;
      tokens.push({
        text: item.str,
        xPct: clamp01(xDev / viewport.width) * 100,
        yPct: clamp01((yDev - heightDev / 2) / viewport.height) * 100,
        height: heightDev,
      });
    }

    // Operator-list stats for vector/raster classification.
    const opList = await page.getOperatorList();
    const OPS = pdfjs.OPS;
    let pathOpCount = 0;
    let imageOpCount = 0;
    for (const fn of opList.fnArray) {
      if (
        fn === OPS.moveTo || fn === OPS.lineTo || fn === OPS.curveTo ||
        fn === OPS.rectangle || fn === OPS.stroke || fn === OPS.fill ||
        fn === OPS.eoFill || fn === OPS.constructPath
      ) pathOpCount++;
      if (
        fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject
      ) imageOpCount++;
    }
    // Coarse coverage proxy: a single big scanned image normally comes with
    // almost no text. We can't cheaply measure true area in pdf.js, so infer.
    const imageCoverage = imageOpCount > 0 ? (tokens.length < 5 ? 0.9 : 0.4) : 0;

    const stats: PageContentStats = {
      textItemCount: tokens.length,
      pathOpCount,
      imageOpCount,
      imageCoverage,
    };

    return {
      stats,
      tokens,
      pageImageDataUrl,
      pageWidthPx: canvas.width,
      pageHeightPx: canvas.height,
      pageCount: doc.numPages,
    };
  } finally {
    await doc.destroy();
  }
}
