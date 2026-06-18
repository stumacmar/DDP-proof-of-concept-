import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import html2canvas from 'html2canvas';
import { BUILD_STAGES, STATUS_COLORS, OCCUPATION_CONFIG, roadStageLabel } from './config';
import { occupationStatus } from './occupation';
import { formatWeekCommencing, formatDate } from './weeks';
import { embedProjectInPdf, triggerDownload, safeName } from './persistence';
import type { Project } from './types';

// A3 landscape in PDF points (1pt = 1/72").
const A3 = { w: 1190.55, h: 841.89 };
const MARGIN = 36;

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

/**
 * Build and download the A3-landscape programme PDF for the selected week,
 * with the project JSON embedded for later restore.
 */
export async function exportPdf(
  project: Project,
  week: number,
  drawingNode: HTMLElement,
): Promise<void> {
  // 1. Rasterise the site plan + markers exactly as shown.
  const canvas = await html2canvas(drawingNode, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const pngDataUrl = canvas.toDataURL('image/png');

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A3.w, A3.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { settings } = project;

  // 2. Title block.
  let y = A3.h - MARGIN;
  page.drawText(settings.siteName || 'Site Programme', {
    x: MARGIN, y: y - 18, size: 20, font: bold, color: rgb(0.05, 0.09, 0.16),
  });
  page.drawText(
    `Programme Week ${week} — ${formatWeekCommencing(settings.week1Date, week)}`,
    { x: MARGIN, y: y - 40, size: 13, font, color: rgb(0.2, 0.25, 0.3) },
  );
  page.drawText(`Exported ${formatDate(new Date())}`, {
    x: MARGIN, y: y - 58, size: 10, font, color: rgb(0.45, 0.5, 0.55),
  });

  // Layout: drawing on the left, legend/conflicts column on the right.
  const topOfBody = A3.h - MARGIN - 72;
  const rightColW = 320;
  const drawingArea = {
    x: MARGIN,
    y: MARGIN,
    w: A3.w - MARGIN * 2 - rightColW - 16,
    h: topOfBody - MARGIN,
  };

  // 3. Place the rasterised drawing, preserving aspect ratio.
  const png = await pdf.embedPng(pngDataUrl);
  const scale = Math.min(drawingArea.w / png.width, drawingArea.h / png.height);
  const imgW = png.width * scale;
  const imgH = png.height * scale;
  page.drawImage(png, {
    x: drawingArea.x,
    y: drawingArea.y + (drawingArea.h - imgH),
    width: imgW,
    height: imgH,
  });

  // 4. Right column: legend, then conflicts table.
  const rightX = A3.w - MARGIN - rightColW;
  let ry = topOfBody;
  ry = drawLegend(page, font, bold, rightX, ry, rightColW);
  drawConflicts(page, font, bold, project, week, rightX, ry - 18, rightColW);

  // 5. Embed project data for restore, then download.
  await embedProjectInPdf(pdf, project);
  const bytes = await pdf.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  triggerDownload(blob, `${safeName(settings.siteName)}-week-${week}.pdf`);
}

function drawLegend(
  page: PDFPage, font: PDFFont, bold: PDFFont,
  x: number, yTop: number, w: number,
): number {
  let y = yTop;
  page.drawText('Key', { x, y: y - 12, size: 13, font: bold, color: rgb(0.05, 0.09, 0.16) });
  y -= 30;

  const row = (color: string, label: string) => {
    page.drawRectangle({ x, y: y - 11, width: 16, height: 16, color: hexToRgb(color) });
    page.drawText(label, { x: x + 24, y: y - 8, size: 10, font, color: rgb(0.1, 0.12, 0.16) });
    y -= 22;
  };

  page.drawText('Build stage', { x, y: y - 8, size: 9, font: bold, color: rgb(0.4, 0.45, 0.5) });
  y -= 20;
  for (const s of BUILD_STAGES) row(s.color, s.label);

  y -= 6;
  page.drawText('Occupation status', { x, y: y - 8, size: 9, font: bold, color: rgb(0.4, 0.45, 0.5) });
  y -= 20;
  row(STATUS_COLORS.occupiable, 'Occupiable (completion reached, rule met)');
  row(STATUS_COLORS.conflict, 'Conflict (completion reached, rule NOT met)');

  y -= 6;
  const note =
    `Services note: a service is "live" from its end week. Occupiable requires ` +
    `Road >= ${roadStageLabel(OCCUPATION_CONFIG.roadMinStage)} and all services live by the selected week.`;
  drawWrapped(page, font, note, x, y - 4, w, 8.5, rgb(0.4, 0.45, 0.5));
  return y - estimateWrappedHeight(note, w, 8.5, font) - 6;
}

function drawConflicts(
  page: PDFPage, font: PDFFont, bold: PDFFont,
  project: Project, week: number, x: number, yTop: number, w: number,
): void {
  const phaseById = new Map(project.phases.map((p) => [p.id, p]));
  const conflicts = project.plots
    .map((plot) => ({ plot, res: occupationStatus(plot, phaseById.get(plot.phaseId), week) }))
    .filter((r) => r.res.status === 'conflict');

  let y = yTop;
  page.drawText(`Conflicts at Week ${week}`, {
    x, y: y - 12, size: 13, font: bold, color: hexToRgb(STATUS_COLORS.conflict),
  });
  y -= 28;

  if (conflicts.length === 0) {
    page.drawText('None — all completed plots are occupiable.', {
      x, y: y - 8, size: 10, font, color: rgb(0.3, 0.5, 0.35),
    });
    return;
  }

  for (const { plot, res } of conflicts) {
    if (y < MARGIN + 40) break; // keep within the page
    page.drawText(`Plot ${plot.number}`, {
      x, y: y - 8, size: 10, font: bold, color: rgb(0.1, 0.12, 0.16),
    });
    y -= 16;
    for (const b of res.blockers) {
      const h = drawWrapped(page, font, `• ${b}`, x + 10, y - 6, w - 10, 9, rgb(0.3, 0.33, 0.38));
      y -= h + 2;
    }
    y -= 6;
  }
}

// ── tiny text-wrapping helpers ─────────────────────────────────────────────
function wrapLines(text: string, w: number, size: number, font: PDFFont): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > w && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: PDFPage, font: PDFFont, text: string,
  x: number, y: number, w: number, size: number, color: ReturnType<typeof rgb>,
): number {
  const lines = wrapLines(text, w, size, font);
  let yy = y;
  for (const l of lines) {
    page.drawText(l, { x, y: yy, size, font, color });
    yy -= size + 3;
  }
  return lines.length * (size + 3);
}

function estimateWrappedHeight(text: string, w: number, size: number, font: PDFFont): number {
  return wrapLines(text, w, size, font).length * (size + 3);
}
