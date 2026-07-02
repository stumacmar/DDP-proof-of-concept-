import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyPdfContent, findPlotCandidates, mapLegendTerms, matchServiceLayers } from './vectorPdf';
import { extractTokensNode } from './testExtract';

/**
 * Real-drawing regression tests.
 *
 * demo-site-layout.pdf is a synthetic clone of a live UK planning-portal CAD
 * export (page size, "Plot N" label positions and CAD layer names lifted from
 * the real file; all geometry redrawn). It preserves the two traps the real
 * drawing exposed: "Plot N" labels and a bare-number scale bar.
 *
 * The second block runs against the ACTUAL downloaded drawing when REAL_PDF
 * points at it (kept out of the repo — it is someone else's copyrighted
 * document); it is skipped in CI.
 */

describe('demo clone of a real planning drawing', () => {
  const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'public', 'demo-site-layout.pdf')));

  it('reads the clone exactly: 2 plots, no scale-bar phantoms, key + road layer recognised', async () => {
    const { tokens, stats, layerNames } = await extractTokensNode(bytes);

    expect(classifyPdfContent(stats).kind).toBe('vector');

    const { candidates } = findPlotCandidates(tokens);
    expect(candidates.map((c) => c.number).sort()).toEqual(['1', '2']);

    const legendServices = mapLegendTerms(tokens).filter((m) => m.category === 'service').map((m) => m.mapsTo);
    for (const svc of ['foul', 'surface', 'potable', 'electric', 'streetlighting']) {
      expect(legendServices).toContain(svc);
    }

    // The real drawing's CAD layers include ROADS / ROAD_CENTRE → Road.
    expect(matchServiceLayers(layerNames).map((m) => m.serviceId)).toContain('road');
  });
});

describe.skipIf(!process.env.REAL_PDF)('actual downloaded planning drawing (REAL_PDF)', () => {
  it('reads the real CAD export: vector, plots 1+2 only, road layer recognised', async () => {
    const bytes = new Uint8Array(fs.readFileSync(process.env.REAL_PDF!));
    const { tokens, stats, layerNames } = await extractTokensNode(bytes);

    expect(classifyPdfContent(stats).kind).toBe('vector');
    const { candidates } = findPlotCandidates(tokens);
    expect(candidates.map((c) => c.number).sort()).toEqual(['1', '2']);
    expect(matchServiceLayers(layerNames).map((m) => m.serviceId)).toContain('road');
  });
});
