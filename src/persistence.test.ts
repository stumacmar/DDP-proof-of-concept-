import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { embedProjectInPdf, readProjectFromPdfBytes } from './persistence';
import { emptyProject } from './defaults';
import type { Project } from './types';

async function makePdfWithProject(project: Project): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([842, 595]);
  await embedProjectInPdf(pdf, project);
  return pdf.save();
}

describe('PDF embed / restore round-trip', () => {
  it('restores the exact project embedded in the PDF', async () => {
    const project = emptyProject();
    project.settings.siteName = 'Meadow View';
    project.planImage = 'data:image/png;base64,AAAA';
    project.plots.push({
      id: 'p1', number: '1', xPct: 25, yPct: 75,
      stage: 'firstfix', completionWeek: 30, phaseId: project.phases[0].id,
    });

    const bytes = await makePdfWithProject(project);
    const restored = await readProjectFromPdfBytes(bytes);

    expect(restored.settings.siteName).toBe('Meadow View');
    expect(restored.plots).toHaveLength(1);
    expect(restored.plots[0].completionWeek).toBe(30);
    expect(restored.planImage).toBe('data:image/png;base64,AAAA');
    expect(restored).toEqual(project);
  });

  it('throws a clear error for a PDF with no embedded project data', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([842, 595]);
    const bytes = await pdf.save();
    await expect(readProjectFromPdfBytes(bytes)).rejects.toThrow(
      'This PDF has no project data',
    );
  });
});
