import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import {
  classifyPdfContent, findPlotCandidates, mapLegendTerms, matchServiceLayers,
} from './vectorPdf';
import { extractTokensNode as extractTokens } from './testExtract';

/**
 * End-to-end launch check: GENERATE dummy vector site layouts (as a CAD
 * export would produce), then run the app's real read pipeline on the bytes
 * and verify every planted plot number, legend term and service layer is
 * recovered — 20 randomized layouts on top of the 100 time-model scenarios.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const PAGE_W = 1190; // A3 landscape pt
const PAGE_H = 842;

const LEGEND_POOL = [
  { text: 'Foul Drainage', service: 'foul' },
  { text: 'Surface Water', service: 'surface' },
  { text: 'Potable Water', service: 'potable' },
  { text: 'Gas', service: 'gas' },
  { text: 'Electric', service: 'electric' },
  { text: 'Street Lighting', service: 'streetlighting' },
] as const;
const LAYER_POOL = [
  { name: 'C-FOUL', service: 'foul' },
  { name: 'STORM_WATER', service: 'surface' },
  { name: 'LV-ELEC', service: 'electric' },
  { name: 'C-ROAD-KERB', service: 'road' },
  { name: 'GAS_MAIN', service: 'gas' },
] as const;
const NOISE = ['North', 'Rev P03', 'Scale 1:500', 'FFL', 'Do not scale'];

interface GroundTruth {
  plots: { number: string; xPct: number; yPct: number }[];
  legendServices: string[];
  layerServices: string[];
}

async function makeDummyLayout(seed: number): Promise<{ bytes: Uint8Array; truth: GroundTruth }> {
  const r = rng(seed);
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Plots: unique 1–3 digit numbers scattered over the developable area.
  // Half the layouts use bare numbers, half explicit "Plot N" labels — the
  // two styles real drawings use (observed on a live planning-portal export).
  const wordStyle = r() < 0.5;
  const count = int(r, 8, 40);
  const numbers = new Set<string>();
  while (numbers.size < count) numbers.add(String(int(r, 1, 399)));
  const plots = [...numbers].map((number) => {
    const x = 80 + r() * (PAGE_W - 260); // keep clear of the legend column
    const y = 80 + r() * (PAGE_H - 160);
    page.drawText(wordStyle ? `Plot ${number}` : number, { x, y, size: 12, font });
    return { number, xPct: (x / PAGE_W) * 100, yPct: ((PAGE_H - y) / PAGE_H) * 100 };
  });
  if (wordStyle) {
    // Scale bar — bare numbers that must NOT become phantom plots.
    ['0m', '5', '10', '15', '20m'].forEach((s, i) =>
      page.drawText(s, { x: 60 + i * 24, y: 30, size: 8, font }));
  }

  // Legend block (right-hand column) + drawing noise text.
  const legendPicks = LEGEND_POOL.filter(() => r() < 0.8);
  legendPicks.forEach((l, i) => page.drawText(l.text, { x: PAGE_W - 160, y: PAGE_H - 60 - i * 18, size: 9, font }));
  NOISE.forEach((n, i) => page.drawText(n, { x: 40, y: 20 + i * 12, size: 8, font }));

  // Vector geometry (roads/boundaries) so the page classifies as vector.
  for (let i = 0; i < 50; i++) {
    page.drawLine({
      start: { x: r() * PAGE_W, y: r() * PAGE_H },
      end: { x: r() * PAGE_W, y: r() * PAGE_H },
      thickness: 0.75,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // CAD layers as Optional Content Groups, the way a DWG→PDF export writes them.
  const layerPicks = LAYER_POOL.filter(() => r() < 0.7);
  if (layerPicks.length) {
    const ctx = doc.context;
    const refs = layerPicks.map((l) =>
      ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(l.name) })),
    );
    doc.catalog.set(
      PDFName.of('OCProperties'),
      ctx.obj({ OCGs: refs, D: ctx.obj({ Order: refs, ON: refs }) }),
    );
  }

  return {
    bytes: await doc.save(),
    truth: {
      plots,
      legendServices: legendPicks.map((l) => l.service),
      layerServices: [...new Set(layerPicks.map((l) => l.service))],
    },
  };
}

describe('generated-layout → read pipeline (e2e)', () => {
  it('recovers every planted plot, legend term and service layer across 20 dummy layouts', async () => {
    for (let seed = 101; seed <= 120; seed++) {
      const { bytes, truth } = await makeDummyLayout(seed);
      const { tokens, stats, layerNames } = await extractTokens(bytes);
      const ctx = `seed=${seed}`;

      // The generated CAD export must classify as vector.
      expect(classifyPdfContent(stats).kind, ctx).toBe('vector');

      // Every planted plot number is found, at (approximately) where it was drawn.
      const { candidates } = findPlotCandidates(tokens);
      const byNumber = new Map(candidates.map((c) => [c.number, c]));
      for (const planted of truth.plots) {
        const found = byNumber.get(planted.number);
        expect(found, `${ctx} plot ${planted.number} missing`).toBeTruthy();
        expect(Math.abs(found!.xPct - planted.xPct), ctx).toBeLessThan(2.5);
        expect(Math.abs(found!.yPct - planted.yPct), ctx).toBeLessThan(2.5);
      }
      // And nothing invented: every candidate corresponds to a planted number.
      const plantedSet = new Set(truth.plots.map((p) => p.number));
      for (const c of candidates) expect(plantedSet.has(c.number), `${ctx} phantom ${c.number}`).toBe(true);

      // Legend terms map to the right services; noise maps to nothing.
      const legendIds = mapLegendTerms(tokens).filter((m) => m.category === 'service').map((m) => m.mapsTo);
      for (const svc of truth.legendServices) expect(legendIds, ctx).toContain(svc);

      // CAD layers round-trip through OCGs and are recognised.
      const matched = matchServiceLayers(layerNames).map((m) => m.serviceId);
      for (const svc of truth.layerServices) expect(matched, ctx).toContain(svc);
    }
  }, 60_000);
});
